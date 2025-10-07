#ifndef DEVICE_H
#define DEVICE_H

// Device identification define
#define DEVICE_SILICOGNITION_WESP32

#include "DeviceConfig.h"
#include "Manager_Connections.h"
#include "Helper_Preferences.h"
#include "Helper_Utils.h"
#include <ETH.h>
#include <Preferences.h>
#include <vector>

#define DEVICE_CLASS                    "JunctionRelay Gateway"
#define DEVICE_MODEL                    "wESP32"
#define DEVICE_MANUFACTURER             "Silicognition"
#define DEVICE_HAS_CUSTOM_FIRMWARE      false
#define DEVICE_MCU                      "ESP32 Dual Core 240MHz Tensilica processor"
#define DEVICE_WIRELESS_CONNECTIVITY    "2.4 GHz Wi-Fi & Bluetooth 5 (LE) + Ethernet"
#define DEVICE_FLASH                    "16 MB"
#define DEVICE_PSRAM                    "4 MB"

// Define capabilities for this device
#define DEVICE_HAS_ONBOARD_SCREEN       0 
#define DEVICE_HAS_ONBOARD_LED          0 
#define DEVICE_HAS_ONBOARD_RGB_LED      0
#define DEVICE_HAS_EXTERNAL_MATRIX      0
#define DEVICE_HAS_EXTERNAL_NEOPIXELS   0 
#define DEVICE_HAS_EXTERNAL_I2C_DEVICES 1
#define DEVICE_HAS_BUTTONS              0
#define DEVICE_HAS_BATTERY              0
#define DEVICE_SUPPORTS_ETHERNET        1
#define DEVICE_SUPPORTS_WIFI            1
#define DEVICE_SUPPORTS_BLE             1
#define DEVICE_SUPPORTS_USB             1
#define DEVICE_SUPPORTS_ESPNOW          1
#define DEVICE_SUPPORTS_HTTP            1
#define DEVICE_SUPPORTS_MQTT            1
#define DEVICE_SUPPORTS_WEBSOCKETS      1
#define DEVICE_HAS_SPEAKER              0
#define DEVICE_HAS_MICROSD              1
#define DEVICE_IS_GATEWAY               1

// wESP32 specific pin definitions
#define PIN_ONBOARD_LED     2
#define PIN_BOOT_BUTTON     0

// Ethernet configuration for wESP32 (used by Branch_Ethernet)
#define ETH_PHY_TYPE        ETH_PHY_RTL8201
#define ETH_PHY_ADDR        0
#define ETH_PHY_MDC         16
#define ETH_PHY_MDIO        17
#define ETH_PHY_POWER       -1
#define ETH_CLK_MODE        ETH_CLOCK_GPIO0_IN

// I2C pins for wESP32
#define I2C_SDA             15
#define I2C_SCL             4

// MicroSD pins
#define SD_CS               5
#define SD_MOSI             23
#define SD_MISO             19
#define SD_SCK              18

#if DEVICE_HAS_EXTERNAL_NEOPIXELS
    // Default pins - will be overridden by preferences
    #define DEFAULT_EXTERNAL_PIN_1 33
    #define DEFAULT_EXTERNAL_PIN_2 32
    #define EXTERNAL_NUMPIXELS 128
#endif

// Hardware inventory structures - SAME AS OTHER DEVICES
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

class Device_Silicognition_wESP32 : public DeviceConfig {
public:
    Device_Silicognition_wESP32(Manager_Connections* connMgr);

    // NEW: Required begin() method declaration
    bool begin() override;

    // Hardware detection method
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

    // NeoPixel configuration methods - declarations only (implementations in .cpp)
    void loadNeoPixelPreferences() override;
    void saveNeoPixelPreferences() override;
    int getNeoPixelPin(int index = 0) override;
    void setNeoPixelPin(int pin, int index = 0) override;
    int getNeoPixelCount(int index = 0) override;
    void setNeoPixelCount(int count, int index = 0) override;
    std::vector<NeoPixelInfo> detectNeoPixelPins();

    // Button methods
    bool isBootButtonPressed();

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
    Manager_Connections* connMgr;
    
    // NeoPixel pin configuration stored in preferences
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    int externalNeoPixelPin1;
    int externalNeoPixelPin2;
    int externalNeoPixelCount1;
    int externalNeoPixelCount2;
    #endif

public:
    // Legacy support - uses pin 1
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    int getNeoPixelPin() { return getNeoPixelPin(0); }
    int getNeoPixelNum() { return EXTERNAL_NUMPIXELS; }
    #else
    int getNeoPixelPin() { return -1; }
    int getNeoPixelNum() { return 0; }
    #endif
};

// Alias the class to the generic Device name for build system
typedef Device_Silicognition_wESP32 Device;

#endif // DEVICE_H