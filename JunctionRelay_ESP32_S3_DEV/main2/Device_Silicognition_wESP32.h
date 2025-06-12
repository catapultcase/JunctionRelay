#ifndef DEVICE_SILICOGNITION_WESP32_H
#define DEVICE_SILICOGNITION_WESP32_H

#include "DeviceConfig.h"
#include "Utils.h"
#include <ETH.h>
#include "Manager_I2C.h"
#include "I2CScanner.h"
#include <Preferences.h>

#if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    #include "Manager_QuadDisplay.h"
    #include "Manager_Charlieplex.h"
#endif

#if DEVICE_HAS_EXTERNAL_NEOPIXELS
    #include "Manager_NeoPixels.h"
#endif

#define DEVICE_CLASS                    "JunctionRelay Gateway"
#define DEVICE_MODEL                    "wESP32"
#define DEVICE_MANUFACTURER             "Silicognition LLC"
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
#define DEVICE_SUPPORTS_WIFI            1
#define DEVICE_SUPPORTS_ETHERNET        1
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

// Ethernet configuration for wESP32
#define ETH_PHY_TYPE        ETH_PHY_RTL8201
#define ETH_PHY_ADDR        0
#define ETH_PHY_MDC         16
#define ETH_PHY_MDIO        17
#define ETH_PHY_POWER       -1
#define ETH_CLK_MODE        ETH_CLOCK_GPIO0_IN

// I2C pins for wESP32
#define I2C_SDA             21
#define I2C_SCL             22

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

class Device_Silicognition_wESP32 : public DeviceConfig {
public:
    Device_Silicognition_wESP32(ConnectionManager* connMgr);

    bool begin();  
    const char* getName();

    void setRotation(uint8_t rotation);
    uint8_t getRotation();
    int width();
    int height();

    // I2C methods
    String performI2CScan(StaticJsonDocument<2048>& doc);
    TwoWire* getI2CInterface() override;

    // Ethernet methods
    bool initializeEthernet();
    bool isEthernetConnected();
    IPAddress getEthernetIP();
    String getEthernetMAC();
    void printEthernetStatus();

    // NeoPixel configuration methods
    void loadNeoPixelPreferences();
    void saveNeoPixelPreferences();
    int getNeoPixelPin(int index = 0);
    void setNeoPixelPin(int pin, int index = 0);

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
    virtual bool supportsWiFi() const override { return DEVICE_SUPPORTS_WIFI; }
    virtual bool supportsEthernet() const override { return DEVICE_SUPPORTS_ETHERNET; }
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
    #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    TaskHandle_t i2cInitTaskHandle;
    TaskHandle_t quadDisplayTaskHandle;
    TaskHandle_t charlieDisplayTaskHandle;
    bool detectedQuadDisplay;
    bool detectedCharlieDisplay;
    #endif

    ConnectionManager* connMgr;
    
    // Ethernet status
    bool ethernetConnected;
    bool ethernetInitialized;
    
    // NeoPixel pin configuration stored in preferences
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    int externalNeoPixelPin1;
    int externalNeoPixelPin2;
    #endif

    // Ethernet event handler
    static void WiFiEvent(WiFiEvent_t event);
    static Device_Silicognition_wESP32* instance; // For static event handler

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

#endif // DEVICE_SILICOGNITION_WESP32_H