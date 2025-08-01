#ifndef DEVICE_H
#define DEVICE_H

// Device identification define
#define DEVICE_ADAFRUIT_FEATHER_ESP32S3

#include "DeviceConfig.h"
#include "Manager_Connections.h"
#include "Helper_Preferences.h"
#include "Utils.h"
#include <Adafruit_NeoPixel.h>
#include <vector>

#define DEVICE_CLASS                    "JunctionRelay Display"
#define DEVICE_MODEL                    "Feather ESP32-S3"
#define DEVICE_MANUFACTURER             "Adafruit"
#define DEVICE_HAS_CUSTOM_FIRMWARE      false
#define DEVICE_MCU                      "ESP32-S3 Dual Core 240MHz Tensilica processor"
#define DEVICE_WIRELESS_CONNECTIVITY    "2.4 GHz Wi-Fi & Bluetooth 5 (LE)"
#define DEVICE_FLASH                    "8 MB"
#define DEVICE_PSRAM                    "N/A"

// Define capabilities for this device
#define DEVICE_HAS_ONBOARD_SCREEN       0 
#define DEVICE_HAS_ONBOARD_LED          0 
#define DEVICE_HAS_ONBOARD_RGB_LED      0
#define DEVICE_HAS_EXTERNAL_MATRIX      0
#define DEVICE_HAS_EXTERNAL_NEOPIXELS   0 
#define DEVICE_HAS_EXTERNAL_I2C_DEVICES 1
#define DEVICE_HAS_BUTTONS              0
#define DEVICE_HAS_BATTERY              0
#define DEVICE_SUPPORTS_ETHERNET        0
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

// Hardware inventory structures
struct NeoPixelInfo {
    int pin;
    int pixelCount;
    
    NeoPixelInfo(int p, int count) : pin(p), pixelCount(count) {}
};

struct I2CDeviceInfo {
    uint8_t address;
    String deviceType;
    
    I2CDeviceInfo(uint8_t addr, const String& type) : address(addr), deviceType(type) {}
};

struct HardwareInventory {
    std::vector<NeoPixelInfo> neopixelPins;
    std::vector<I2CDeviceInfo> i2cDevices;
    
    // Basic capabilities (from compile-time defines)
    bool hasOnboardScreen = DEVICE_HAS_ONBOARD_SCREEN;
    bool hasOnboardLED = DEVICE_HAS_ONBOARD_LED;
    bool hasOnboardRGBLED = DEVICE_HAS_ONBOARD_RGB_LED;
    bool hasExternalMatrix = DEVICE_HAS_EXTERNAL_MATRIX;
    bool hasExternalNeopixels = DEVICE_HAS_EXTERNAL_NEOPIXELS;
    bool hasExternalI2CDevices = DEVICE_HAS_EXTERNAL_I2C_DEVICES;
    bool hasButtons = DEVICE_HAS_BUTTONS;
    bool hasBattery = DEVICE_HAS_BATTERY;
    bool supportsEthernet = DEVICE_SUPPORTS_ETHERNET;
    bool supportsWiFi = DEVICE_SUPPORTS_WIFI;
    bool supportsBLE = DEVICE_SUPPORTS_BLE;
    bool supportsUSB = DEVICE_SUPPORTS_USB;
    bool supportsESPNow = DEVICE_SUPPORTS_ESPNOW;
    bool supportsHTTP = DEVICE_SUPPORTS_HTTP;
    bool supportsMQTT = DEVICE_SUPPORTS_MQTT;
    bool supportsWebSockets = DEVICE_SUPPORTS_WEBSOCKETS;
    bool hasSpeaker = DEVICE_HAS_SPEAKER;
    bool hasMicroSD = DEVICE_HAS_MICROSD;
    bool isGateway = DEVICE_IS_GATEWAY;
};

class Device_AdafruitFeatherESP32S3 : public DeviceConfig {
public:
    Device_AdafruitFeatherESP32S3(Manager_Connections* connMgr);

    // NEW: Returns hardware inventory instead of bool
    HardwareInventory detectHardware();
    
    const char* getName();

    void setRotation(uint8_t rotation);
    uint8_t getRotation();
    int width();
    int height();

    // Device-specific setup method (called by main.ino)
    void setupDeviceSpecific();

    // I2C methods
    std::vector<I2CDeviceInfo> scanI2CDevices();
    TwoWire* getI2CInterface() override;

    // Override runtime getters for device capabilities
    virtual bool hasOnboardScreen() const override { return DEVICE_HAS_ONBOARD_SCREEN; }
    virtual bool hasOnboardLED() const override { return DEVICE_HAS_ONBOARD_LED; }
    virtual bool hasOnboardRGBLED() const override { return DEVICE_HAS_ONBOARD_RGB_LED; }
    virtual bool hasExternalMatrix() const override { return DEVICE_HAS_EXTERNAL_MATRIX; }
    virtual bool hasExternalNeopixels() const override { return DEVICE_HAS_EXTERNAL_NEOPIXELS; }
    virtual bool hasExternalI2CDevices() const override { return DEVICE_HAS_EXTERNAL_I2C_DEVICES; }
    virtual bool hasButtons() const override { return DEVICE_HAS_BUTTONS; }
    virtual bool hasBattery() const override { return DEVICE_HAS_BATTERY; }
    virtual bool supportsEthernet() const override { return DEVICE_SUPPORTS_ETHERNET; }
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

    Manager_Connections* connMgr;
};

// Alias the class to the generic Device name for build system
typedef Device_AdafruitFeatherESP32S3 Device;

#endif // DEVICE_H