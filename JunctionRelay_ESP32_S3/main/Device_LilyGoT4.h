#ifndef DEVICE_LILYGO_T4_H
#define DEVICE_LILYGO_T4_H

// Define device info
#define DEVICE_CLASS                    "JunctionRelay Display"
#define DEVICE_MODEL                    "T4 S3"
#define DEVICE_MANUFACTURER             "LilyGo"
#define DEVICE_HAS_CUSTOM_FIRMWARE      false
#define DEVICE_MCU                      "ESP32-S3R8 Dual-core LX7 microprocessor"
#define DEVICE_WIRELESS_CONNECTIVITY    "2.4 GHz Wi-Fi & Bluetooth 5 (LE)"
#define DEVICE_FLASH                    "16 MB"
#define DEVICE_PSRAM                    "8 MB"

// Define capabilities for this device
#define DEVICE_HAS_ONBOARD_SCREEN       1 
#define DEVICE_HAS_ONBOARD_LED          0 
#define DEVICE_HAS_ONBOARD_RGB_LED      0
#define DEVICE_HAS_EXTERNAL_MATRIX      0
#define DEVICE_HAS_EXTERNAL_NEOPIXELS   0 
#define DEVICE_HAS_EXTERNAL_I2C_DEVICES 0
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

#include "DeviceConfig.h"
#include "Utils.h"
#include <LilyGo_AMOLED.h>

// Forward declaration
class ConnectionManager;

class Device_LilyGoT4 : public DeviceConfig {
public:
    Device_LilyGoT4(ConnectionManager* connMgr);

    bool begin() override;
    
    // Initialize LVGL display helpers (called after LVGL is initialized)
    void initLVGLHelper() override;

    const char* getName() override;

    void setRotation(uint8_t rotation) override;
    uint8_t getRotation() override;
    int width() override;
    int height() override;

    // I2C interface (not used by this device, but required by DeviceConfig)
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
    LilyGo_Class amoled;
    uint8_t rotation;
    
    // Store the connection manager reference
    ConnectionManager* connMgr;
};

#endif // DEVICE_LILYGO_T4_H