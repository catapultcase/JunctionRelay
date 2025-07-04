#ifndef DEVICE_CONFIG_H
#define DEVICE_CONFIG_H

#include <Arduino.h>  
#include <ArduinoJson.h>  
#include <Wire.h>  // Add Wire library for TwoWire type

#include <lvgl.h>
#include <stdint.h>

class DeviceConfig {
public:
    // Device-specific initialization (e.g., display setup)
    virtual bool begin() = 0;

    // Return the display width/height
    virtual int width() = 0;
    virtual int height() = 0;

    // Device-specific methods for rotation
    virtual void setRotation(uint8_t rotation) = 0;
    virtual uint8_t getRotation() = 0;

    // Return a device name for LVGL display purposes
    virtual const char* getName() = 0;

    // --- I2C Interface Abstraction ---
    // Return which I2C interface this device uses (Wire, Wire1, etc.)
    virtual TwoWire* getI2CInterface() = 0;

    // --- NeoPixel Configuration Methods ---
    // Load NeoPixel pin configuration from preferences
    virtual void loadNeoPixelPreferences() {
        // Default implementation does nothing for devices without NeoPixels
    }
    
    // Save NeoPixel pin configuration to preferences
    virtual void saveNeoPixelPreferences() {
        // Default implementation does nothing for devices without NeoPixels
    }
    
    // Get NeoPixel pin by index (0 = first pin, 1 = second pin, etc.)
    virtual int getNeoPixelPin(int index = 0) {
        // Default implementation returns -1 (invalid pin)
        return -1;
    }
    
    // Set NeoPixel pin by index (0 = first pin, 1 = second pin, etc.)
    virtual void setNeoPixelPin(int pin, int index = 0) {
        // Default implementation does nothing for devices without NeoPixels
    }

    // --- Ethernet Methods (for devices that support it) ---
    virtual bool initializeEthernet() {
        // Default implementation does nothing for devices without Ethernet
        return false;
    }
    
    virtual bool isEthernetConnected() {
        // Default implementation returns false for devices without Ethernet
        return false;
    }
    
    virtual IPAddress getEthernetIP() {
        // Default implementation returns invalid IP for devices without Ethernet
        return IPAddress(0, 0, 0, 0);
    }
    
    virtual String getEthernetMAC() {
        // Default implementation returns empty string for devices without Ethernet
        return "";
    }
    
    virtual void printEthernetStatus() {
        // Default implementation does nothing for devices without Ethernet
    }

    // --- Device Info Getters ---
    virtual const char* getDeviceClass() const { return "Unknown Device Class"; }
    virtual const char* getDeviceModel() const { return "Unknown Model"; }
    virtual const char* getDeviceManufacturer() const { return "Unknown Manufacturer"; }
    virtual const char* getFirmwareVersion() const { return "Unknown Firmware Version"; }
    virtual bool getCustomFirmware() const { return false; }  // Fixed return type
    virtual const char* getMCU() const { return "Unknown MCU"; }
    virtual const char* getWirelessConnectivity() const { return "Unknown Connectivity"; }
    virtual const char* getFlash() const { return "Unknown Flash Size"; }
    virtual const char* getPSRAM() const { return "Unknown PSRAM Size"; }
    virtual const char* getUniqueIdentifier() const { return "Unknown Unique Identifier"; }

    // --- Device Capability Getters ---
    virtual bool hasOnboardScreen() const { return false; }
    virtual bool hasOnboardLED() const { return false; }
    virtual bool hasOnboardRGBLED() const { return false; }
    virtual bool hasExternalMatrix() const { return false; }
    virtual bool hasExternalNeopixels() const { return false; }
    virtual bool hasExternalI2CDevices() const { return false; }
    virtual bool hasButtons() const { return false; }
    virtual bool hasBattery() const { return false; }
    virtual bool supportsWiFi() const { return false; }
    virtual bool supportsEthernet() const { return false; }
    virtual bool supportsBLE() const { return false; }
    virtual bool supportsUSB() const { return false; }
    virtual bool supportsESPNow() const { return false; }
    virtual bool supportsHTTP() const { return false; }
    virtual bool supportsMQTT() const { return false; }
    virtual bool supportsWebSockets() const { return false; }
    virtual bool hasSpeaker() const { return false; }
    virtual bool hasMicroSD() const { return false; }
    virtual bool isGateway() const { return false; }

    // Device I2C scan (returns a list of detected devices)
    virtual String performI2CScan(StaticJsonDocument<2048>& doc) {
        return "[]";  // Default implementation
    }

    // Common rotation logic for all devices
    void rotateDisplay() {

    }

    // Optionally, common LVGL helper initialization can go here
    virtual void initLVGLHelper() {
        // Implementation common to all devices (if applicable)
    }
};

#endif // DEVICE_CONFIG_H