#ifndef DEVICE_H
#define DEVICE_H

// Device identification define
#define DEVICE_ADAFRUIT_QTPY_ESP32S3

#include "DeviceConfig.h"
#include "Utils.h"
#include <Adafruit_NeoPixel.h>
#include "Manager_NeoPixels.h" 
#include "Manager_I2C.h"
#include "I2CScanner.h"
#include <Preferences.h>

#if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    #include "Manager_QuadDisplay.h"
    #include "Manager_Charlieplex.h"
#endif

#define DEVICE_CLASS                    "JunctionRelay Display"
#define DEVICE_MODEL                    "QT Py ESP32-S3 N4R2"
#define DEVICE_MANUFACTURER             "Adafruit"
#define DEVICE_HAS_CUSTOM_FIRMWARE      false
#define DEVICE_MCU                      "ESP32-S3 Dual Core 240MHz Tensilica processor"
#define DEVICE_WIRELESS_CONNECTIVITY    "2.4 GHz Wi-Fi & Bluetooth 5 (LE)"
#define DEVICE_FLASH                    "4 MB"
#define DEVICE_PSRAM                    "2 MB"

// Define capabilities for this device
#define DEVICE_HAS_ONBOARD_SCREEN       0 
#define DEVICE_HAS_ONBOARD_LED          0 
#define DEVICE_HAS_ONBOARD_RGB_LED      0
#define DEVICE_HAS_EXTERNAL_MATRIX      0
#define DEVICE_HAS_EXTERNAL_NEOPIXELS   1 
#define DEVICE_HAS_EXTERNAL_I2C_DEVICES 1
#define DEVICE_HAS_BUTTONS              0
#define DEVICE_HAS_BATTERY              0
#define DEVICE_SUPPORTS_WIFI            1
#define DEVICE_SUPPORTS_BLE             0
#define DEVICE_SUPPORTS_USB             1
#define DEVICE_SUPPORTS_ESPNOW          1
#define DEVICE_SUPPORTS_HTTP            1
#define DEVICE_SUPPORTS_MQTT            1
#define DEVICE_SUPPORTS_WEBSOCKETS      1
#define DEVICE_HAS_SPEAKER              0
#define DEVICE_HAS_MICROSD              0
#define DEVICE_IS_GATEWAY               0

#if DEVICE_HAS_ONBOARD_RGB_LED
    #define PIN_NEOPIXEL 39
    #define NUMPIXELS 1
#endif

#if DEVICE_HAS_EXTERNAL_NEOPIXELS
    // Default pins - will be overridden by preferences
    #define DEFAULT_EXTERNAL_PIN_1 35
    #define DEFAULT_EXTERNAL_PIN_2 0  // Stub for future use
    #define EXTERNAL_NUMPIXELS 128
#endif

class Device_AdafruitQtPyESP32S3 : public DeviceConfig {
public:
    Device_AdafruitQtPyESP32S3(ConnectionManager* connMgr);

    bool begin();  
    const char* getName();

    void setRotation(uint8_t rotation);
    uint8_t getRotation();
    int width();
    int height();

    // Device-specific setup method (called by main.ino)
    void setupDeviceSpecific();

    // I2C methods
    String performI2CScan(StaticJsonDocument<2048>& doc);
    TwoWire* getI2CInterface() override;  // Implement base class method

    // NeoPixel configuration methods
    void loadNeoPixelPreferences();
    void saveNeoPixelPreferences();
    int getNeoPixelPin(int index = 0);
    void setNeoPixelPin(int pin, int index = 0);

    // Override runtime getters for device capabilities
    virtual bool hasOnboardScreen() const override { return DEVICE_HAS_ONBOARD_SCREEN; }
    virtual bool hasOnboardLED() const override { return DEVICE_HAS_ONBOARD_LED; }
    virtual bool hasOnboardRGBLED() const override { return DEVICE_HAS_ONBOARD_RGB_LED; }
    virtual bool hasExternalMatrix() const override { return DEVICE_HAS_EXTERNAL_MATRIX; }
    virtual bool hasExternalNeopixels() const override { return DEVICE_HAS_EXTERNAL_NEOPIXELS; }
    virtual bool hasExternalI2CDevices() const override { return DEVICE_HAS_EXTERNAL_I2C_DEVICES; }
    virtual bool hasButtons() const override { return DEVICE_HAS_BUTTONS; }
    virtual bool hasBattery() const override { return DEVICE_HAS_BATTERY; }
    virtual bool supportsWiFi() const override { return DEVICE_SUPPORTS_WIFI; }
    virtual bool supportsBLE() const override { return DEVICE_SUPPORTS_BLE; }
    virtual bool supportsUSB() const override { return DEVICE_SUPPORTS_USB; }
    virtual bool supportsESPNow() const override { return DEVICE_SUPPORTS_ESPNOW; }
    virtual bool supportsHTTP() const override { return DEVICE_SUPPORTS_HTTP; }
    virtual bool supportsMQTT() const override { return DEVICE_SUPPORTS_MQTT; }
    virtual bool supportsWebSockets() const override { return DEVICE_SUPPORTS_WEBSOCKETS; }
    virtual bool hasSpeaker() const override { return DEVICE_HAS_SPEAKER; }
    virtual bool hasMicroSD() const override { return DEVICE_HAS_MICROSD; }
    virtual bool isGateway() const override { return DEVICE_IS_GATEWAY; }

    // Device info methods
    virtual const char* getDeviceModel() const override { return DEVICE_MODEL; }
    virtual const char* getDeviceManufacturer() const override { return DEVICE_MANUFACTURER; }
    virtual const char* getFirmwareVersion() const override { return ::getFirmwareVersion(); }
    virtual bool getCustomFirmware() const override { return DEVICE_HAS_CUSTOM_FIRMWARE; }
    virtual const char* getMCU() const override { return DEVICE_MCU; }
    virtual const char* getWirelessConnectivity() const override { return DEVICE_WIRELESS_CONNECTIVITY; }
    virtual const char* getFlash() const override { return DEVICE_FLASH; }
    virtual const char* getPSRAM() const override { return DEVICE_PSRAM; }

    virtual const char* getUniqueIdentifier() const override {
        static String macStr = getFormattedMacAddress();
        return macStr.c_str();
    }

private:
    #if DEVICE_HAS_ONBOARD_RGB_LED
    Adafruit_NeoPixel onboardPixel;
    #endif

    #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    TaskHandle_t i2cInitTaskHandle;
    TaskHandle_t quadDisplayTaskHandle;  // Single task for the singleton manager
    TaskHandle_t charlieDisplayTaskHandle;  // Task for Charlieplex manager
    bool detectedQuadDisplay;
    bool detectedCharlieDisplay;
    #endif

    ConnectionManager* connMgr;
    
    // NeoPixel pin configuration stored in preferences
    int externalNeoPixelPin1;
    int externalNeoPixelPin2;  // Stub for future use

public:
    // Legacy support - uses pin 1
    int getNeoPixelPin() { return getNeoPixelPin(0); }
    int getNeoPixelNum() { return EXTERNAL_NUMPIXELS; }
};

// Alias the class to the generic Device name for build system
typedef Device_AdafruitQtPyESP32S3 Device;

#endif // DEVICE_H