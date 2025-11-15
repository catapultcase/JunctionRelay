#include <Arduino.h>
#include <ArduinoJson.h>
#include <nvs_flash.h>
#include "Helper_Preferences.h"
#include "Manager_Connections.h"
#include "Device.h"                    // swapped per‑board at build time
#include "Manager_ScreenRouter.h"
#include "Helper_StartupScheduler.h"   // Centralized startup management
#include "Manager_NeoPixels.h"         // This manager is an exception

#if defined(DEVICE_CROWPANEL5) || defined(DEVICE_CROWPANEL7)
#include "touch.h"
#endif

// ───── Globals ─────
Helper_Preferences     prefsHelper;
Manager_Connections    connManager;
Device                 device(&connManager);
ScreenRouter           screenRouter;
HardwareInventory      globalInventory;

String readSerialInput(const String& prompt, unsigned long timeoutMs = 30000) {
  Serial.print(prompt);
  Serial.flush();
  
  unsigned long start = millis();
  String input = "";
  
  while (millis() - start < timeoutMs) {
    if (Serial.available()) {
      char c = Serial.read();
      if (c == '\n' || c == '\r') {
        Serial.println(); // New line after input
        break; // Accept empty input
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

void configureMQTTCredentials() {
  Serial.println("\n=== MQTT Configuration ===");
  
  // Show current MQTT settings if they exist
  String currentBroker = prefsHelper.getMQTTBroker();
  String currentUsername = prefsHelper.getMQTTUsername();
  bool currentEnabled = prefsHelper.getMQTTEnabled();
  
  if (!currentBroker.isEmpty()) {
    Serial.printf("Current MQTT Broker: %s\n", currentBroker.c_str());
    Serial.printf("Current Username: %s\n", currentUsername.c_str());
    Serial.printf("Currently Enabled: %s\n", currentEnabled ? "Yes" : "No");
    Serial.println("Press ENTER to keep current settings or enter new values:");
  }
  
  // Ask if user wants to enable MQTT
  String enableResponse = readSerialInput("Enable MQTT? (y/n): ", 10000);
  bool enableMQTT = enableResponse.equalsIgnoreCase("y") || enableResponse.equalsIgnoreCase("yes");
  
  if (!enableMQTT) {
    prefsHelper.setMQTTEnabled(false);
    Serial.println("MQTT disabled.");
    return;
  }
  
  // Get MQTT Broker (host:port format)
  String broker = readSerialInput("Enter MQTT Broker (host:port): ");
  if (broker.isEmpty() && !currentBroker.isEmpty()) {
    broker = currentBroker;
    Serial.printf("Using current broker: %s\n", broker.c_str());
  }
  
  if (broker.isEmpty()) {
    Serial.println("No MQTT broker provided. MQTT will be disabled.");
    prefsHelper.setMQTTEnabled(false);
    return;
  }
  
  // Get MQTT Username (optional)
  String username = readSerialInput("Enter MQTT Username (press ENTER to skip): ");
  if (username.isEmpty() && !currentUsername.isEmpty()) {
    username = currentUsername;
    Serial.printf("Using current username: %s\n", username.c_str());
  }
  
  String password = "";
  // Only ask for password if username was provided
  if (!username.isEmpty()) {
    password = readSerialInput("Enter MQTT Password (hidden): ");
    // Note: Password is not echoed for security
  }
  
  // Save MQTT settings to centralized preferences
  prefsHelper.setMQTTBroker(broker);
  prefsHelper.setMQTTUsername(username);
  prefsHelper.setMQTTPassword(password);
  prefsHelper.setMQTTEnabled(enableMQTT);
  
  Serial.println("\n✅ MQTT credentials saved to preferences");
  Serial.printf("Broker: %s\n", broker.c_str());
  if (!username.isEmpty()) {
    Serial.printf("Username: %s\n", username.c_str());
  } else {
    Serial.println("Username: <none> (anonymous connection)");
  }
  Serial.printf("Enabled: %s\n", enableMQTT ? "Yes" : "No");
}

void configureWiFiCredentials() {
  Serial.println("\n=== WiFi Configuration ===");
  
  // Show current credentials if they exist
  String currentSSID = prefsHelper.getWiFiSSID();
  
  if (!currentSSID.isEmpty()) {
    Serial.printf("Current SSID: %s\n", currentSSID.c_str());
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
  
  // Save to centralized preferences
  prefsHelper.setWiFiSSID(ssid);
  prefsHelper.setWiFiPassword(password);
  
  Serial.println("\n✅ WiFi credentials saved to preferences");
  Serial.printf("SSID: %s\n", ssid.c_str());
  
  // After WiFi configuration, ask about MQTT
  String mqttResponse = readSerialInput("Configure MQTT settings? (y/n): ", 10000);
  if (mqttResponse.equalsIgnoreCase("y") || mqttResponse.equalsIgnoreCase("yes")) {
    configureMQTTCredentials();
  }
}

void configureGatewayCredentials() {
  Serial.println("\n=== Gateway Configuration ===");
  Serial.println("Gateway modes may need WiFi for uplink connectivity.");
  
  String response = readSerialInput("Configure WiFi credentials for gateway? (y/n): ", 10000);
  if (response.equalsIgnoreCase("y") || response.equalsIgnoreCase("yes")) {
    configureWiFiCredentials();
  } else {
    Serial.println("Skipping WiFi configuration. Gateway will use existing credentials or Ethernet-only.");
    
    // Still offer MQTT configuration even without WiFi
    String mqttResponse = readSerialInput("Configure MQTT settings? (y/n): ", 10000);
    if (mqttResponse.equalsIgnoreCase("y") || mqttResponse.equalsIgnoreCase("yes")) {
      configureMQTTCredentials();
    }
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
      } else {
        // Still offer MQTT configuration
        String mqttResponse = readSerialInput("Configure MQTT settings? (y/n): ", 10000);
        if (mqttResponse.equalsIgnoreCase("y") || mqttResponse.equalsIgnoreCase("yes")) {
          configureMQTTCredentials();
        }
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
  // Hardware Detection Phase
  // ===============================================
  Serial.println("[MAIN] Starting hardware detection...");
  globalInventory = device.detectHardware();

    // Read rotation & mode via helper
  int storedRotation = prefsHelper.getDisplayRotation();
  String mode        = prefsHelper.getConnectionModeString();
  
  // ===============================================
  // Configure connection manager FIRST
  // ===============================================
  Serial.println("[MAIN] Configuring connection manager...");
  connManager.setConnMode(mode);
  connManager.setScreenRouter(&screenRouter);
  connManager.setPreferences(&prefsHelper);
  connManager.setDevice(&device);
  connManager.setInventory(&globalInventory);
  connManager.init();

  // ===============================================
  // Centralized Manager Initialization WITH connection manager
  // ===============================================
  Serial.println("[MAIN] Starting centralized manager initialization...");
  Helper_StartupScheduler* startupScheduler = Helper_StartupScheduler::getInstance();
  startupScheduler->setManager_Connections(&connManager);  // SET BEFORE initializeFromInventory!
  startupScheduler->setPreferences(&prefsHelper);          // SET PREFERENCES FOR MQTT
  startupScheduler->initializeFromInventory(globalInventory, &screenRouter, &device);

  // ===============================================
  // FINISHED! No more display manager code needed
  // ===============================================

  Serial.println("[MAIN] Setup complete!");
}

void loop() {

  // Delegate background tasks to connections manager
  connManager.loop();

  #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    Manager_NeoPixels::getInstance()->update();
    delay(10); // ~100Hz update rate
  #endif
}