#include <lvgl.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "ConnectionManager.h"

Preferences prefs;
ConnectionManager connManager;

// ── Device Selection ──
// 0 = LilyGo T4
// 1 = CrowPanel5
// 2 = CrowPanel7
// 3 = Adafruit QtPy ESP32-S3
// 4 = Adafruit Matrix ESP32-S3
// 5 = Adafruit Feather ESP32-S3
// 6 = Silicognition wESP32
#define DEVICE_SELECTION 6

#if DEVICE_SELECTION == 0
  // #include "Device_LilyGoT4.h"
  // Device_LilyGoT4 device(&connManager);
#elif DEVICE_SELECTION == 1
  // #include "Device_CrowPanel5.h"
  // Device_CrowPanel5 device(&connManager);
#elif DEVICE_SELECTION == 2
  // #include "Device_CrowPanel7.h"
  // Device_CrowPanel7 device(&connManager);
#elif DEVICE_SELECTION == 3
  // #include "Device_AdafruitQtPyESP32S3.h"
  // Device_AdafruitQtPyESP32S3 device(&connManager);
#elif DEVICE_SELECTION == 4
  // #include "Device_AdafruitMatrixESP32S3.h"
  // Device_AdafruitMatrixESP32S3 device(&connManager);
#elif DEVICE_SELECTION == 5
  // #include "Device_AdafruitFeatherESP32S3.h"
  // Device_AdafruitFeatherESP32S3 device(&connManager);
#elif DEVICE_SELECTION == 6
  #include "Device_Silicognition_wESP32.h"
  Device_Silicognition_wESP32 device(&connManager);
#else
  #error "Invalid DEVICE_SELECTION value!"
#endif

#if DEVICE_SELECTION == 1 || DEVICE_SELECTION == 2
  // #include "touch.h"
#endif

#include "ScreenRouter.h"

ScreenRouter screenRouter;

#if DEVICE_HAS_ONBOARD_SCREEN
// LVGL task handle
TaskHandle_t lvglTaskHandle = NULL;

// Flag to coordinate initialization
volatile bool lvglInitialized = false;

// LVGL task to run on Core 1
void lvglTaskFunction(void* parameter) {
  Serial.printf("[LVGL Task] Started on core %d\n", xPortGetCoreID());
  
  // Initialize LVGL on Core 1
  lv_init();
  Serial.println("[LVGL Task] LVGL initialized on Core 1");
  
  // Set flag to indicate initialization is complete
  lvglInitialized = true;
  
  // Main LVGL task loop
  while (true) {
    // Call LVGL task handler
    lv_task_handler();
    
    // Small delay to prevent consuming too much CPU
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}
#endif

void setup() {
  Serial.begin(115200);
  Serial1.begin(115200);

  // Initialize I2C using device abstraction - NO hardcoded device logic!
  #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    TwoWire* deviceI2C = device.getI2CInterface();
    if (deviceI2C != nullptr) {
      deviceI2C->begin();
      deviceI2C->setClock(400000);
      Serial.printf("[DEBUG] I2C initialized for %s\n", device.getName());
    }
  #endif

  Serial.println("===========================");
  Serial.print  ("Starting JunctionRelay, Compiled for: ");
  Serial.println(device.getName());
  Serial.println("===========================");

  // First initialize the device hardware
  // NOTE: I2C is now initialized above, NeoPixels are initialized inside device.begin()
  if (!device.begin()) {
    Serial.println("[ERROR] Device initialization failed!");
    while (true) delay(1000);
  }

  #if DEVICE_HAS_ONBOARD_SCREEN
    // Create a dedicated task for LVGL on Core 1
    xTaskCreatePinnedToCore(
      lvglTaskFunction,  // Task function
      "lvglTask",        // Name of task
      4096,              // Stack size (bytes)
      NULL,              // Parameter to pass
      2,                 // Task priority (higher number = higher priority)
      &lvglTaskHandle,   // Task handle
      1                  // Core where the task should run (1 = Core 1)
    );
    
    // Wait for LVGL to initialize on Core 1
    Serial.println("[DEBUG] Waiting for LVGL to initialize on Core 1...");
    while (!lvglInitialized) {
      delay(10);
    }
    Serial.println("[DEBUG] LVGL initialized on Core 1");
  #endif

  prefs.begin("connConfig", false);
  int    storedRotation = prefs.getInt("rotation", 0);
  String mode           = prefs.getString("connMode", "");
  prefs.end();

  // Status callback that only prints when status changes
  connManager.setStatusUpdateCallback([](const ConnectionStatus &s) {
  String label;
  
  // Add connection mode
  if (s.espNowActive) {
    label = "Mode: ESP-NOW\n";
  } else {
    label = "Mode: WiFi\n";
  }
  
  // Add WiFi status with IP when connected
  if (s.wifiConnected) {
    label += "WiFi: Connected\n";
    label += "IP: " + s.ipAddress + "\n";
    label += "MAC: " + s.macAddress + "\n";
  } else {
    label += "WiFi: Disconnected\n";
  }
  
  // Add Ethernet status (now comes from ConnectionManager)
  if (s.ethernetConnected) {
    label += "Ethernet: Connected\n";
    label += "ETH IP: " + s.ethernetIP + "\n";
    label += "ETH MAC: " + s.ethernetMAC + "\n";
  } else if (device.supportsEthernet()) {
    label += "Ethernet: Disconnected\n";
  }
  
  // Add MQTT status
  label += "MQTT: " + String(s.mqttConnected ? "Connected" : "Disconnected");
  
  // Only print to Serial if the status changed
  static String lastLabel = "";
  if (label != lastLabel) {
    Serial.println("[STATUS] " + label);
    lastLabel = label;
  }
  
  #if DEVICE_HAS_ONBOARD_SCREEN
    displayManager.updateStatusLabel(label);
  #endif
});

  // NeoPixels are now initialized in device.begin(), but we can configure them here
  #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    Serial.println("[DEBUG] Configuring NeoPixel effects...");
    
    // Get the already-initialized NeoPixel manager instance
    Manager_NeoPixels* neoPixelManager = Manager_NeoPixels::getInstance();
    
    if (neoPixelManager) {
      // Configure the CM5 effect
      neoPixelManager->setCM5EffectActive(true);
      neoPixelManager->setCM5Color(0xFF0000); // Red
      neoPixelManager->setFlipPulseDirection(true);
      Serial.println("[DEBUG] NeoPixel effects configured.");
    } else {
      Serial.println("[ERROR] NeoPixel Manager not found! Make sure device.begin() succeeded.");
    }
  #endif

  #if DEVICE_HAS_ONBOARD_SCREEN
    device.setRotation(storedRotation);
    
    // Now initialize the DisplayManager after LVGL is ready
    // The DisplayManager will call device->initLVGLHelper() internally
    displayManager.init();
    displayManager.createHomeScreen();
    screenRouter.registerScreen(&displayManager);
  #endif

  #if DEVICE_SELECTION == 1
    touch_init();
  #endif

  connManager.setDevice(&device);
  connManager.setConnMode(mode);
  connManager.setScreenRouter(&screenRouter);

  if (mode.isEmpty()) {
    connManager.startCaptivePortal();
  } else {
    connManager.init();
  }
  
  Serial.println("[DEBUG] Setup complete!");
}

void loop() {
  // Serial→JSON framing
  static uint32_t lastSerial = 0;
  if (millis() - lastSerial > 100) {
    connManager.handleSerialData();
    lastSerial = millis();
  }

  // Update NeoPixels (CM5 effect and other animations)
  #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    Manager_NeoPixels* neoManager = Manager_NeoPixels::getInstance();
    if (neoManager) {
      neoManager->update();
    }
  #endif
}