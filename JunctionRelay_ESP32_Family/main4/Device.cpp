#include "Device.h"
#include "Helper_Utils.h"
#include "Manager_I2C.h"
#include <Wire.h>

Device_AdafruitQtPyESP32S3::Device_AdafruitQtPyESP32S3(Manager_Connections* connMgr)
: connMgr(connMgr)
{
    #if DEVICE_HAS_ONBOARD_RGB_LED
    onboardPixel = Adafruit_NeoPixel(NUMPIXELS, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);
    #endif

    // Initialize NeoPixel pin and count defaults
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    externalNeoPixelPin1 = DEFAULT_EXTERNAL_PIN_1;
    externalNeoPixelPin2 = DEFAULT_EXTERNAL_PIN_2;
    externalNeoPixelCount1 = EXTERNAL_NUMPIXELS_STRIP_0;
    externalNeoPixelCount2 = EXTERNAL_NUMPIXELS_STRIP_1;
    #endif
}

bool Device_AdafruitQtPyESP32S3::begin() {
    Serial.println("[DEBUG] Initializing Adafruit QtPy ESP32-S3...");
    
    // Basic power setup
    #if defined(NEOPIXEL_POWER)
    pinMode(NEOPIXEL_POWER, OUTPUT);
    digitalWrite(NEOPIXEL_POWER, HIGH);
    #endif
    
    // Initialize I2C on STEMMA QT pins
    Wire1.begin(41, 40);  // QtPy STEMMA QT pins
    
    Serial.println("[DEBUG] QtPy ESP32-S3 initialization complete");
    return true;
}

// Device-specific setup method called by main.ino
void Device_AdafruitQtPyESP32S3::setupDeviceSpecific() {
    Serial.println("[DEVICE] Device-specific setup complete (no additional setup required)");
}

// NEW: Main hardware detection method
HardwareInventory Device_AdafruitQtPyESP32S3::detectHardware() {
    Serial.println("[DEVICE] Detecting hardware for Adafruit QtPy ESP32-S3...");
    
    HardwareInventory inventory;
    
    // Basic power setup (safe GPIO operations only)
    #if defined(NEOPIXEL_POWER)
    pinMode(NEOPIXEL_POWER, OUTPUT);
    digitalWrite(NEOPIXEL_POWER, HIGH);
    Serial.println("[DEVICE] NeoPixel power pin enabled");
    #endif

    // No onboard NeoPixel initialization - just detection
    
    // Detect NeoPixel pins and configurations
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    loadNeoPixelPreferences();
    inventory.neopixelPins = detectNeoPixelPins();
    #endif

    // Detect I2C devices
    #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    inventory.i2cDevices = scanI2CDevices();
    #endif

    Serial.printf("[DEVICE] Hardware detection complete: %d NeoPixel strips, %d I2C devices\n",
                  inventory.neopixelPins.size(), inventory.i2cDevices.size());
    
    return inventory;
}

#if DEVICE_HAS_EXTERNAL_NEOPIXELS
void Device_AdafruitQtPyESP32S3::loadNeoPixelPreferences() {
    Preferences prefs;
    prefs.begin("neopixelConfig", true); // Read-only mode
    
    externalNeoPixelPin1 = prefs.getInt("neoPin1", DEFAULT_EXTERNAL_PIN_1);
    externalNeoPixelPin2 = prefs.getInt("neoPin2", DEFAULT_EXTERNAL_PIN_2);
    externalNeoPixelCount1 = prefs.getInt("neoCount1", EXTERNAL_NUMPIXELS_STRIP_0);
    externalNeoPixelCount2 = prefs.getInt("neoCount2", EXTERNAL_NUMPIXELS_STRIP_1);
    
    prefs.end();
    
    Serial.printf("[DEVICE] Loaded NeoPixel preferences: Pin1=%d(%d pixels), Pin2=%d(%d pixels)\n", 
                  externalNeoPixelPin1, externalNeoPixelCount1,
                  externalNeoPixelPin2, externalNeoPixelCount2);
}

void Device_AdafruitQtPyESP32S3::saveNeoPixelPreferences() {
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
}

std::vector<NeoPixelInfo> Device_AdafruitQtPyESP32S3::detectNeoPixelPins() {
    std::vector<NeoPixelInfo> neoPixels;
    
    Serial.println("[DEVICE] Detecting NeoPixel pins...");
    
    // Add configured strips
    neoPixels.emplace_back(externalNeoPixelPin1, externalNeoPixelCount1);
    neoPixels.emplace_back(externalNeoPixelPin2, externalNeoPixelCount2);
    
    Serial.printf("[DEVICE] Detected %d NeoPixel strips:\n", neoPixels.size());
    for (size_t i = 0; i < neoPixels.size(); i++) {
        Serial.printf("[DEVICE]   Strip %d: Pin %d, %d pixels\n", 
                      i, neoPixels[i].pin, neoPixels[i].pixelCount);
    }
    
    return neoPixels;
}

int Device_AdafruitQtPyESP32S3::getNeoPixelPin(int index) {
    switch(index) {
        case 0: return externalNeoPixelPin1;
        case 1: return externalNeoPixelPin2;
        default:
            Serial.printf("[ERROR][DEVICE] Invalid NeoPixel pin index: %d\n", index);
            return externalNeoPixelPin1;
    }
}

void Device_AdafruitQtPyESP32S3::setNeoPixelPin(int pin, int index) {
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
}

int Device_AdafruitQtPyESP32S3::getNeoPixelCount(int index) {
    switch(index) {
        case 0: return externalNeoPixelCount1;
        case 1: return externalNeoPixelCount2;
        default:
            Serial.printf("[ERROR][DEVICE] Invalid NeoPixel count index: %d\n", index);
            return externalNeoPixelCount1;
    }
}

void Device_AdafruitQtPyESP32S3::setNeoPixelCount(int count, int index) {
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
}
#endif

std::vector<I2CDeviceInfo> Device_AdafruitQtPyESP32S3::scanI2CDevices() {
    // Use Manager_I2C as the master scanner instead of doing our own scan
    Manager_I2C* i2cManager = Manager_I2C::getInstance(connMgr, &Wire1, 41, 40); // QtPy STEMMA QT pins
    
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

const char* Device_AdafruitQtPyESP32S3::getName() {
    return "Adafruit QtPy ESP32-S3";
}

void Device_AdafruitQtPyESP32S3::setRotation(uint8_t r) {
    Serial.print("[DEVICE] Rotation set to: ");
    Serial.println(r);
}

uint8_t Device_AdafruitQtPyESP32S3::getRotation() {
    return 0;
}

int Device_AdafruitQtPyESP32S3::width() {
    return 0;  
}

int Device_AdafruitQtPyESP32S3::height() {
    return 0;  
}

TwoWire* Device_AdafruitQtPyESP32S3::getI2CInterface() {
    return &Wire1;  // QtPy uses Wire1
}