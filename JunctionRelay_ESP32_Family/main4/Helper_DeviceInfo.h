#ifndef HELPER_DEVICE_INFO_H
#define HELPER_DEVICE_INFO_H

#include <Arduino.h>
#include <ArduinoJson.h>

// Forward declarations
class DeviceConfig;
struct HardwareInventory;

class Helper_DeviceInfo {
public:
    Helper_DeviceInfo();
    ~Helper_DeviceInfo();

    // Initialize with device reference and hardware inventory
    void init(DeviceConfig* device, HardwareInventory* inventory);

    // Device information methods
    String getDeviceInfoJSON();
    String getSystemStatsJSON();
    String getFirmwareInfoJSON();
    
    // Individual device info getters
    String getDeviceModel();
    String getDeviceManufacturer();
    String getFirmwareVersion();
    bool getCustomFirmware();
    String getMCU();
    String getWirelessConnectivity();
    String getFlash();
    String getPSRAM();
    String getUniqueIdentifier();
    
    // System stats methods
    String getSystemStatsLightweightJSON();
    uint32_t getFreeHeap();
    uint32_t getMinFreeHeap();
    uint32_t getHeapSize();
    uint32_t getMaxAllocHeap();
    uint32_t getUptime();
    uint32_t getCpuFreqMHz();
    
    // Flash/Storage info
    uint32_t getFlashSize();
    uint32_t getSketchSize();
    uint32_t getFreeSketchSpace();

private:
    DeviceConfig* devicePtr;
    HardwareInventory* inventory;
    
    // Caching
    String cachedDeviceInfoJSON;
    String cachedFirmwareInfoJSON;
    bool deviceInfoCached;
    bool firmwareInfoCached;
    
    // Helper methods for building JSON responses
    void buildDeviceInfo(JsonDocument& doc);
    void buildSystemStats(JsonDocument& doc);
    void buildMemoryStats(JsonDocument& doc);
    void buildFlashStats(JsonDocument& doc);
    
    // Cache management
    void clearCache();
};

#endif // HELPER_DEVICE_INFO_H