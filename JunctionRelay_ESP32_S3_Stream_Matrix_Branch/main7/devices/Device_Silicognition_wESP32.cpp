#include "Device.h"
#include "Helper_Utils.h"
#include "Manager_I2C.h"
#include <Wire.h>

Device_Silicognition_wESP32::Device_Silicognition_wESP32(Manager_Connections* connMgr)
: connMgr(connMgr)
{
    // Initialize NeoPixel pin and count defaults
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    externalNeoPixelPin1 = DEFAULT_EXTERNAL_PIN_1;
    externalNeoPixelPin2 = DEFAULT_EXTERNAL_PIN_2;
    externalNeoPixelCount1 = EXTERNAL_NUMPIXELS;
    externalNeoPixelCount2 = EXTERNAL_NUMPIXELS;
    #endif
}

bool Device_Silicognition_wESP32::begin() {
    Serial.println("[DEBUG] Initializing Silicognition wESP32...");
    
    // Basic GPIO setup
    #if DEVICE_HAS_ONBOARD_LED
    pinMode(PIN_ONBOARD_LED, OUTPUT);
    digitalWrite(PIN_ONBOARD_LED, LOW);
    #endif

    #if DEVICE_HAS_BUTTONS
    pinMode(PIN_BOOT_BUTTON, INPUT_PULLUP);
    #endif

    // Initialize I2C
    Wire.begin(I2C_SDA, I2C_SCL);
    
    Serial.println("[DEBUG] wESP32 initialization complete");
    return true;
}

// Device-specific setup method called by main.ino
void Device_Silicognition_wESP32::setupDeviceSpecific() {
    Serial.println("[DEVICE] Device-specific setup complete (no additional setup required)");
}

// Main hardware detection method
HardwareInventory Device_Silicognition_wESP32::detectHardware() {
    Serial.println("[DEVICE] Detecting hardware for Silicognition wESP32...");
    
    HardwareInventory inventory;
    
    // Basic power setup (safe GPIO operations only)
    #if DEVICE_HAS_ONBOARD_LED
    pinMode(PIN_ONBOARD_LED, OUTPUT);
    digitalWrite(PIN_ONBOARD_LED, LOW);
    Serial.println("[DEVICE] Onboard LED initialized");
    #endif

    #if DEVICE_HAS_BUTTONS
    pinMode(PIN_BOOT_BUTTON, INPUT_PULLUP);
    Serial.println("[DEVICE] Boot button initialized");
    #endif

    // Detect NeoPixel pins and configurations
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    loadNeoPixelPreferences();
    inventory.neopixelPins = detectNeoPixelPins();
    #endif

    // Detect I2C devices
    #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    inventory.i2cDevices = scanI2CDevices();
    #endif

    // NOTE: Ethernet initialization completely removed - handled by Branch_Ethernet

    Serial.printf("[DEVICE] Hardware detection complete: %d NeoPixel strips, %d I2C devices, Ethernet: %s\n",
                  inventory.neopixelPins.size(), inventory.i2cDevices.size(),
                  inventory.supportsEthernet ? "Available" : "Not Available");
    
    return inventory;
}

std::vector<I2CDeviceInfo> Device_Silicognition_wESP32::scanI2CDevices() {
    // Use Manager_I2C as the master scanner
    Manager_I2C* i2cManager = Manager_I2C::getInstance(connMgr, &Wire, I2C_SDA, I2C_SCL);
    
    // Perform scan using Manager_I2C with original strategy
    i2cManager->scanAndConfigureDevices(getFormattedMacAddress(), STRATEGY_ESP32_ORIGINAL);
    
    // Convert Manager_I2C results to our format
    std::vector<I2CDeviceInfo> devices;
    if (i2cManager->hasScanResults()) {
        // Get screen devices (QuadDisplay, Charlieplex, etc.)
        JsonArrayConst screens = i2cManager->getStoredScreens();
        for (JsonVariantConst screen : screens) {
            uint8_t addr = strtol(screen["I2CAddress"].as<String>().c_str(), nullptr, 0);
            String deviceType = screen["DeviceType"].as<String>();
            devices.emplace_back(addr, deviceType);
            Serial.printf("[DEVICE] Added screen device: 0x%02X (%s)\n", addr, deviceType.c_str());
        }
        
        // Get non-screen I2C devices (Seesaw, sensors, etc.)
        JsonArrayConst i2cDevices = i2cManager->getStoredI2CDevices();
        for (JsonVariantConst device : i2cDevices) {
            // Seesaw devices are stored differently - extract address from I2CAddress field
            String addrStr = device["I2CAddress"].as<String>();
            uint8_t addr = strtol(addrStr.c_str(), nullptr, 0);
            String deviceType = device["DeviceType"].as<String>();
            devices.emplace_back(addr, deviceType);
            Serial.printf("[DEVICE] Added I2C device: 0x%02X (%s)\n", addr, deviceType.c_str());
        }
    }
    
    Serial.printf("[DEVICE] Total I2C devices found: %d\n", devices.size());
    return devices;
}

// NeoPixel methods - Always provide implementations regardless of DEVICE_HAS_EXTERNAL_NEOPIXELS
void Device_Silicognition_wESP32::loadNeoPixelPreferences() {
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    Preferences prefs;
    prefs.begin("neopixelConfig", true); // Read-only mode
    
    externalNeoPixelPin1 = prefs.getInt("neoPin1", DEFAULT_EXTERNAL_PIN_1);
    externalNeoPixelPin2 = prefs.getInt("neoPin2", DEFAULT_EXTERNAL_PIN_2);
    externalNeoPixelCount1 = prefs.getInt("neoCount1", EXTERNAL_NUMPIXELS);
    externalNeoPixelCount2 = prefs.getInt("neoCount2", EXTERNAL_NUMPIXELS);
    
    prefs.end();
    
    Serial.printf("[DEVICE] Loaded NeoPixel preferences: Pin1=%d(%d pixels), Pin2=%d(%d pixels)\n", 
                  externalNeoPixelPin1, externalNeoPixelCount1,
                  externalNeoPixelPin2, externalNeoPixelCount2);
    #else
    // Do nothing - NeoPixels disabled
    #endif
}

void Device_Silicognition_wESP32::saveNeoPixelPreferences() {
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    Preferences prefs;
    prefs.begin("neopixelConfig", false); // Read-write mode
    
    prefs.putInt("neoPin1", externalNeoPixelPin1);
    prefs.putInt("neoPin2", externalNeoPixelPin2);
    prefs.putInt("neoCount1", externalNeoPixelCount1);
    prefs.putInt("neoCount2", externalNeoPixelCount2);
    
    prefs.end();
    
    Serial.printf("[DEVICE] Saved NeoPixel preferences: Pin1=%d(%d pixels), Pin2=%d(%d pixels)\n", 
                  externalNeoPixelPin1, externalNeoPixelCount1,
                  externalNeoPixelPin2, externalNeoPixelCount2);
    #else
    // Do nothing - NeoPixels disabled
    #endif
}

std::vector<NeoPixelInfo> Device_Silicognition_wESP32::detectNeoPixelPins() {
    std::vector<NeoPixelInfo> neoPixels;
    
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    Serial.println("[DEVICE] Detecting NeoPixel pins...");
    
    // Add configured strips
    neoPixels.emplace_back(externalNeoPixelPin1, externalNeoPixelCount1);
    neoPixels.emplace_back(externalNeoPixelPin2, externalNeoPixelCount2);
    
    Serial.printf("[DEVICE] Detected %d NeoPixel strips:\n", neoPixels.size());
    for (size_t i = 0; i < neoPixels.size(); i++) {
        Serial.printf("[DEVICE]   Strip %d: Pin %d, %d pixels\n", 
                      i, neoPixels[i].pin, neoPixels[i].pixelCount);
    }
    #else
    // Return empty vector - NeoPixels disabled
    #endif
    
    return neoPixels;
}

int Device_Silicognition_wESP32::getNeoPixelPin(int index) {
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    switch(index) {
        case 0: return externalNeoPixelPin1;
        case 1: return externalNeoPixelPin2;
        default:
            Serial.printf("[ERROR][DEVICE] Invalid NeoPixel pin index: %d\n", index);
            return externalNeoPixelPin1;
    }
    #else
    return -1; // Invalid pin - NeoPixels disabled
    #endif
}

void Device_Silicognition_wESP32::setNeoPixelPin(int pin, int index) {
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    switch(index) {
        case 0:
            if (externalNeoPixelPin1 != pin) {
                externalNeoPixelPin1 = pin;
                Serial.printf("[DEVICE] NeoPixel Pin 1 updated to: %d\n", pin);
            }
            break;
        case 1:
            if (externalNeoPixelPin2 != pin) {
                externalNeoPixelPin2 = pin;
                Serial.printf("[DEVICE] NeoPixel Pin 2 updated to: %d\n", pin);
            }
            break;
        default:
            Serial.printf("[ERROR][DEVICE] Invalid NeoPixel pin index: %d\n", index);
            break;
    }
    #else
    // Do nothing - NeoPixels disabled
    #endif
}

int Device_Silicognition_wESP32::getNeoPixelCount(int index) {
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    switch(index) {
        case 0: return externalNeoPixelCount1;
        case 1: return externalNeoPixelCount2;
        default:
            Serial.printf("[ERROR][DEVICE] Invalid NeoPixel count index: %d\n", index);
            return externalNeoPixelCount1;
    }
    #else
    return 0; // No pixels - NeoPixels disabled
    #endif
}

void Device_Silicognition_wESP32::setNeoPixelCount(int count, int index) {
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    switch(index) {
        case 0:
            if (externalNeoPixelCount1 != count) {
                externalNeoPixelCount1 = count;
                Serial.printf("[DEVICE] NeoPixel Count 1 updated to: %d\n", count);
            }
            break;
        case 1:
            if (externalNeoPixelCount2 != count) {
                externalNeoPixelCount2 = count;
                Serial.printf("[DEVICE] NeoPixel Count 2 updated to: %d\n", count);
            }
            break;
        default:
            Serial.printf("[ERROR][DEVICE] Invalid NeoPixel count index: %d\n", index);
            break;
    }
    #else
    // Do nothing - NeoPixels disabled
    #endif
}

bool Device_Silicognition_wESP32::isBootButtonPressed() {
    #if DEVICE_HAS_BUTTONS
    return digitalRead(PIN_BOOT_BUTTON) == LOW;
    #else
    return false; // No button - always return false
    #endif
}

const char* Device_Silicognition_wESP32::getName() {
    return "Silicognition wESP32";
}

void Device_Silicognition_wESP32::setRotation(uint8_t r) {
    Serial.print("[DEVICE] Rotation set to: ");
    Serial.println(r);
}

uint8_t Device_Silicognition_wESP32::getRotation() {
    return 0;
}

int Device_Silicognition_wESP32::width() {
    return 0;  
}

int Device_Silicognition_wESP32::height() {
    return 0;  
}

// Implement I2C interface method
TwoWire* Device_Silicognition_wESP32::getI2CInterface() {
    return &Wire;  // wESP32 uses standard Wire interface
}