#ifndef HELPER_DEVICE_CAPABILITIES_H
#define HELPER_DEVICE_CAPABILITIES_H

#include <Arduino.h>
#include <ArduinoJson.h>

// Forward declarations
class DeviceConfig;
struct HardwareInventory;

class Helper_DeviceCapabilities {
public:
    Helper_DeviceCapabilities();
    ~Helper_DeviceCapabilities();

    // Initialize with device reference and hardware inventory
    void init(DeviceConfig* device, HardwareInventory* inventory);

    // Main capabilities methods
    String getDeviceCapabilitiesJSON();
    
    // Individual capability checks
    bool hasCapability(const String& capability);
    
    // Screen-specific methods
    JsonArray getScreensList();
    int getScreenCount();
    bool hasScreen(const String& screenKey);
    
    // I2C device methods
    JsonArray getI2CDevicesList();
    int getI2CDeviceCount();
    
    // NeoPixel methods
    int getNeoPixelStripCount();
    bool hasNeoPixelStrips();

private:
    DeviceConfig* devicePtr;
    HardwareInventory* inventory;
    
    // Caching
    String cachedCapabilitiesJSON;
    String cachedScreensJSON;
    String cachedI2CDevicesJSON;
    bool capabilitiesCached;
    bool screensCached;
    bool i2cDevicesCached;
    
    // Helper methods for building capabilities
    void buildBaseCapabilities(JsonDocument& doc);
    void buildScreensArray(JsonDocument& doc);
    void buildI2CDevicesArray(JsonDocument& doc);
    void addOnboardScreens(JsonArray& screens);
    void addI2CScreens(JsonArray& screens);
    void addNeoPixelScreens(JsonArray& screens);
    void addMatrixScreens(JsonArray& screens);
    
    // Cache management
    void clearCache();
};

#endif // HELPER_DEVICE_CAPABILITIES_H