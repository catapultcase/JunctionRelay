#include "Device.h"
#include "Utils.h"
#include "Manager_I2C.h"
#include <Wire.h>

Device_AdafruitFeatherESP32S3::Device_AdafruitFeatherESP32S3(Manager_Connections* connMgr)
: connMgr(connMgr)
{
    #if DEVICE_HAS_ONBOARD_RGB_LED
    onboardPixel = Adafruit_NeoPixel(NUMPIXELS, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);
    #endif
}

// Device-specific setup method called by main.ino
void Device_AdafruitFeatherESP32S3::setupDeviceSpecific() {
    Serial.println("[DEVICE] Device-specific setup complete (no additional setup required)");
}

// NEW: Main hardware detection method
HardwareInventory Device_AdafruitFeatherESP32S3::detectHardware() {
    Serial.println("[DEVICE] Detecting hardware for Adafruit Feather ESP32-S3...");
    
    HardwareInventory inventory;
    
    // Basic power setup (safe GPIO operations only)
    #if defined(NEOPIXEL_POWER)
    pinMode(NEOPIXEL_POWER, OUTPUT);
    digitalWrite(NEOPIXEL_POWER, HIGH);
    Serial.println("[DEVICE] NeoPixel power pin enabled");
    #endif

    // No NeoPixels on Feather - skip NeoPixel detection
    
    // Detect I2C devices
    #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    inventory.i2cDevices = scanI2CDevices();
    #endif

    Serial.printf("[DEVICE] Hardware detection complete: %d NeoPixel strips, %d I2C devices\n",
                  inventory.neopixelPins.size(), inventory.i2cDevices.size());
    
    return inventory;
}

std::vector<I2CDeviceInfo> Device_AdafruitFeatherESP32S3::scanI2CDevices() {
    // Use Manager_I2C as the master scanner instead of doing our own scan
    Manager_I2C* i2cManager = Manager_I2C::getInstance(connMgr, &Wire, -1, -1); // Use board defaults
    
    // Perform scan using Manager_I2C with S3 strategy
    i2cManager->scanAndConfigureDevices(getFormattedMacAddress(), STRATEGY_ESP32_S3_UNIFIED);
    
    // Convert Manager_I2C results to our format
    std::vector<I2CDeviceInfo> devices;
    if (i2cManager->hasScanResults()) {
        JsonArrayConst screens = i2cManager->getStoredScreens();
        for (JsonVariantConst screen : screens) {
            uint8_t addr = strtol(screen["I2CAddress"].as<String>().c_str(), nullptr, 0);
            String deviceType = screen["DeviceType"].as<String>();
            devices.emplace_back(addr, deviceType);
        }
    }
    
    return devices;
}

const char* Device_AdafruitFeatherESP32S3::getName() {
    return "Adafruit Feather ESP32-S3";
}

void Device_AdafruitFeatherESP32S3::setRotation(uint8_t r) {
    Serial.print("[DEVICE] Rotation set to: ");
    Serial.println(r);
}

uint8_t Device_AdafruitFeatherESP32S3::getRotation() {
    return 0;
}

int Device_AdafruitFeatherESP32S3::width() {
    return 0;  
}

int Device_AdafruitFeatherESP32S3::height() {
    return 0;  
}

TwoWire* Device_AdafruitFeatherESP32S3::getI2CInterface() {
    return &Wire;
}