#ifndef DEVICE_H
#define DEVICE_H

// Device identification define - this is what triggers touch_init()
#define DEVICE_CROWPANEL5

// Define device info
#define DEVICE_CLASS                    "JunctionRelay Display"
#define DEVICE_MODEL                    "CrowPanel5 5-inch"
#define DEVICE_MANUFACTURER             "Elecrow"
#define DEVICE_HAS_CUSTOM_FIRMWARE      false
#define DEVICE_MCU                      "ESP32-S3-WROOM-1-N4R8"
#define DEVICE_WIRELESS_CONNECTIVITY    "2.4 GHz Wi-Fi & Bluetooth 5 (LE)"
#define DEVICE_FLASH                    "4 MB"
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
#include <LovyanGFX.hpp>
#include <lgfx/v1/platforms/esp32s3/Panel_RGB.hpp>
#include <lgfx/v1/platforms/esp32s3/Bus_RGB.hpp>
#include <lgfx/v1/platforms/esp32/Light_PWM.hpp>
#include <lvgl.h>

// Forward declaration
class ConnectionManager;

class Device_CrowPanel5 : public DeviceConfig {
public:
  Device_CrowPanel5(ConnectionManager* connMgr);  // Updated constructor

  // Initialize the device (display setup, touch timing, etc.)
  bool begin() override;
  
  // Initialize LVGL display helpers (called after LVGL is initialized)
  void initLVGLHelper() override;

  // Return screen dimensions
  int width() override;
  int height() override;

  // Rotation handling
  void setRotation(uint8_t rotation) override;
  uint8_t getRotation() override;

  // Device-specific setup method (called by main.ino)
  void setupDeviceSpecific();

  // Return device name
  const char* getName() override;

  // I2C interface (not used by this device, but required by DeviceConfig)
  virtual TwoWire* getI2CInterface() override { 
    return &Wire; // Return default Wire even though device doesn't use external I2C
  }

  // LVGL flush callback function
  static void my_disp_flush(lv_disp_drv_t *disp, const lv_area_t *area, lv_color_t *color_p);
  // LVGL touch callback function
  static void my_touchpad_read(lv_indev_drv_t *indev_driver, lv_indev_data_t *data);

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
  virtual const char* getFirmwareVersion() const override { return ::getFirmwareVersion(); }  // Use the function from Utils.h
  virtual bool getCustomFirmware() const override { return DEVICE_HAS_CUSTOM_FIRMWARE; }
  virtual const char* getMCU() const override { return DEVICE_MCU; }
  virtual const char* getWirelessConnectivity() const override { return DEVICE_WIRELESS_CONNECTIVITY; }
  virtual const char* getFlash() const override { return DEVICE_FLASH; }
  virtual const char* getPSRAM() const override { return DEVICE_PSRAM; }
  virtual const char* getUniqueIdentifier() const override {
    // Use the utility function to get the MAC address in the correct format
    static String macStr = getFormattedMacAddress();  // Call the utility function
    return macStr.c_str();  // Return the MAC address as a C-style string
  }

private:
  // Custom LGFX device class for Elecrow 5-inch panel based on your working example
  class CustomLGFX : public lgfx::LGFX_Device {
  public:
    lgfx::Bus_RGB   _bus_instance;
    lgfx::Panel_RGB _panel_instance;
    lgfx::Light_PWM _light_instance;
    CustomLGFX();
  };

  CustomLGFX lgfx_dev; // Custom display driver instance
  lv_disp_drv_t disp_drv;      // LVGL display driver
  lv_indev_drv_t indev_drv;    // LVGL input device driver for touch
  uint8_t rotation;
  
  // Store the connection manager reference
  ConnectionManager* connMgr;
};

// Alias the class to the generic Device name for build system
typedef Device_CrowPanel5 Device;

#endif // DEVICE_H