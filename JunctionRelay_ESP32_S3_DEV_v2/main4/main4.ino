#include <Arduino.h>
#include <lvgl.h>
#include <ArduinoJson.h>
#include <nvs_flash.h>
#include "Helper_Preferences.h"
#include "Manager_Connections.h"
#include "Device.h"                    // swapped per‑board at build time
#include "DisplayManager.h"
#include "ScreenRouter.h"
#include "Helper_StartupScheduler.h"   // NEW: Centralized startup management
#include "Manager_NeoPixels.h"         // This manager is an exception

#if defined(DEVICE_CROWPANEL5) || defined(DEVICE_CROWPANEL7)
#include "touch.h"
#endif

// ───── Globals ─────
Helper_Preferences     prefsHelper;
Manager_Connections    connManager;
Device                 device(&connManager);
DisplayManager         displayManager(&device, connManager);
ScreenRouter           screenRouter;
HardwareInventory      globalInventory;

#if DEVICE_HAS_ONBOARD_SCREEN
volatile bool lvglInitialized = false;
TaskHandle_t lvglTaskHandle = NULL;
void lvglTaskFunction(void*) {
  lv_init();
  lvglInitialized = true;
  while (true) {
    lv_task_handler();
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}
#endif

String readSerialInput(const String& prompt, unsigned long timeoutMs = 30000) {
  Serial.print(prompt);
  Serial.flush();
  
  unsigned long start = millis();
  String input = "";
  
  while (millis() - start < timeoutMs) {
    if (Serial.available()) {
      char c = Serial.read();
      if (c == '\n' || c == '\r') {
        if (input.length() > 0) {
          Serial.println(); // New line after input
          break;
        }
      } else if (c >= 32 && c <= 126) { // Printable characters
        input += c;
        Serial.print(c); // Echo character
      } else if (c == 8 || c == 127) { // Backspace
        if (input.length() > 0) {
          input.remove(input.length() - 1);
          Serial.print("\b \b"); // Erase character on screen
        }
      }
    }
    delay(10);
  }
  
  if (millis() - start >= timeoutMs) {
    Serial.println("\n[TIMEOUT]");
  }
  
  return input;
}

void configureWiFiCredentials() {
  Serial.println("\n=== WiFi Configuration ===");
  
  // Show current credentials if they exist
  String currentSSID = prefsHelper.getWiFiSSID();
  String currentDevice = prefsHelper.getDeviceName();
  
  if (!currentSSID.isEmpty()) {
    Serial.printf("Current SSID: %s\n", currentSSID.c_str());
    Serial.printf("Current Device Name: %s\n", currentDevice.c_str());
    Serial.println("Press ENTER to keep current settings or enter new values:");
  }
  
  // Get WiFi SSID
  String ssid = readSerialInput("Enter WiFi SSID: ");
  if (ssid.isEmpty() && !currentSSID.isEmpty()) {
    ssid = currentSSID;
    Serial.printf("Using current SSID: %s\n", ssid.c_str());
  }
  
  if (ssid.isEmpty()) {
    Serial.println("No SSID provided. WiFi mode will require manual configuration.");
    return;
  }
  
  // Get WiFi Password
  String password = readSerialInput("Enter WiFi Password (hidden): ");
  // Note: Password is not echoed for security, but we still read it
  
  // Get optional device name
  String deviceName = readSerialInput("Enter Device Name (optional): ");
  if (deviceName.isEmpty()) {
    deviceName = currentDevice.isEmpty() ? "JunctionRelay" : currentDevice;
  }
  
  // Save to centralized preferences
  prefsHelper.setWiFiSSID(ssid);
  prefsHelper.setWiFiPassword(password);
  prefsHelper.setDeviceName(deviceName);
  
  Serial.println("\n✅ WiFi credentials saved to preferences");
  Serial.printf("SSID: %s\n", ssid.c_str());
  Serial.printf("Device Name: %s\n", deviceName.c_str());
}

void configureGatewayCredentials() {
  Serial.println("\n=== Gateway Configuration ===");
  Serial.println("Gateway modes may need WiFi for uplink connectivity.");
  
  String response = readSerialInput("Configure WiFi credentials for gateway? (y/n): ", 10000);
  if (response.equalsIgnoreCase("y") || response.equalsIgnoreCase("yes")) {
    configureWiFiCredentials();
  } else {
    Serial.println("Skipping WiFi configuration. Gateway will use existing credentials or Ethernet-only.");
  }
}

void setup() {
  nvs_flash_init();
  prefsHelper.begin();
  
  // Bring up Serial (USB‑CDC) with timeout - don't block forever
  Serial.begin(115200);
  unsigned long serialStart = millis();
  while (!Serial && (millis() - serialStart) < 3000) {
    delay(10);  // Wait max 3 seconds for serial monitor
  }
  
  // Bring up Serial1 (UART)
  Serial1.begin(115200);

  // Always show current mode and allow swapping
  const char* modes[] = {
    "wifi", "ethernet", "usb_direct", "espnow",
    "gateway_wifi", "gateway_eth", "gateway_usb"
  };
  String current = prefsHelper.getConnectionModeString();
  if (current.length() == 0) current = "<none>";
  
  Serial.printf("Current connection mode: %s\n", current.c_str());
  Serial.println("Select new mode (1-7) or press ENTER to keep current:");
  for (uint8_t i = 0; i < sizeof(modes)/sizeof(modes[0]); ++i) {
    Serial.printf("  %d: %s\n", i + 1, modes[i]);
  }
  Serial.println("Waiting 10 seconds for input...");

  // Wait up to 10s for user input - ALWAYS proceed after timeout
  unsigned long start = millis();
  String selectedMode = "";
  bool modeChanged = false;
  bool userInput = false;

  while (millis() - start < 10000) {
    if (Serial.available()) {
      userInput = true;
      break;
    }
    delay(10);
  }

  // If the user typed something, parse it
  if (userInput) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length()) {
      int choice = line.toInt();
      if (choice >= 1 && choice <= (int)(sizeof(modes)/sizeof(modes[0]))) {
        selectedMode = modes[choice - 1];
        prefsHelper.setConnectionModeString(selectedMode);
        modeChanged = true;
        Serial.printf("Connection mode changed to: %s\n", selectedMode.c_str());
      } else {
        Serial.println("Invalid choice, keeping existing mode.");
      }
    } else {
      Serial.println("No selection, keeping existing mode.");
    }
  } else {
    Serial.println("Timed out, keeping existing mode and proceeding...");
  }

  // Configure credentials if a network-dependent mode was selected
  if (modeChanged) {
    if (selectedMode == "wifi") {
      configureWiFiCredentials();
    }
    else if (selectedMode == "gateway_wifi" || selectedMode == "gateway_eth") {
      configureGatewayCredentials();
    }
    else if (selectedMode == "ethernet") {
      Serial.println("\n=== Ethernet Configuration ===");
      String response = readSerialInput("Configure WiFi backup for Ethernet mode? (y/n): ", 10000);
      if (response.equalsIgnoreCase("y") || response.equalsIgnoreCase("yes")) {
        configureWiFiCredentials();
      }
    }
    
    // Restart to apply new mode and credentials
    if (selectedMode == "wifi" || selectedMode.startsWith("gateway")) {
      Serial.println("Rebooting to apply new configuration...");
      delay(1000);
      ESP.restart();
    }
  }

  Serial.println("===========================");
  Serial.print  ("Starting JunctionRelay, Compiled for: ");
  Serial.println(device.getName());
  Serial.println("===========================");

  #if defined(DEVICE_CROWPANEL5) || defined(DEVICE_CROWPANEL7)
    touch_init();
  #endif

  // ===============================================
  // NEW: Hardware Detection Phase
  // ===============================================
  Serial.println("[MAIN] Starting hardware detection...");
  globalInventory = device.detectHardware();
  
  #if DEVICE_HAS_ONBOARD_SCREEN
    xTaskCreatePinnedToCore(
      lvglTaskFunction, "LVGL", 4096, nullptr, 2, &lvglTaskHandle, 1
    );
    while (!lvglInitialized) delay(10);
    Serial.println("[DEBUG] LVGL initialized on Core 1");
  #endif

  // Read rotation & mode via helper
  int storedRotation = prefsHelper.getDisplayRotation();
  String mode        = prefsHelper.getConnectionModeString();

  #if DEVICE_HAS_ONBOARD_SCREEN
    device.setRotation(storedRotation);
    displayManager.init();
    displayManager.createHomeScreen();
    screenRouter.registerScreen(&displayManager);
  #endif

  // ===============================================
  // UPDATED: Configure connection manager FIRST
  // ===============================================
  Serial.println("[MAIN] Configuring connection manager...");
  connManager.setConnMode(mode);
  connManager.setScreenRouter(&screenRouter);
  connManager.setPreferences(&prefsHelper);
  connManager.setDevice(&device);
  connManager.setInventory(&globalInventory);
  connManager.init();

  // ===============================================
  // UPDATED: Centralized Manager Initialization WITH connection manager
  // ===============================================
  Serial.println("[MAIN] Starting centralized manager initialization...");
  Helper_StartupScheduler* startupScheduler = Helper_StartupScheduler::getInstance();
  startupScheduler->setConnectionManager(&connManager);  // SET BEFORE initializeFromInventory!
  startupScheduler->initializeFromInventory(globalInventory, &screenRouter, &device);

  Serial.println("[MAIN] Setup complete!");
}

void loop() {
  
  // Heap monitoring
  // static unsigned long lastHeapCheck = 0;
  //   if (millis() - lastHeapCheck > 10000) { // Every 10 seconds
  //       Serial.printf("[HEAP] Free: %d, Min: %d\n", 
  //                    ESP.getFreeHeap(), ESP.getMinFreeHeap());
  //       lastHeapCheck = millis();
  //   }

  // Delegate background tasks to connections manager
  connManager.loop();

  // All managers now run via their own tasks - no manual updates needed

  // Exception for Manager_NeoPixels - doesn't like being in a FreeRTOS Task :(

  Manager_NeoPixels::getInstance()->update();
  delay(10); // ~100Hz update rate

  //delay(1);
}