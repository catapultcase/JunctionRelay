#include "Helper_DeviceInfo.h"
#include "DeviceConfig.h"
#include "Device.h"

Helper_DeviceInfo::Helper_DeviceInfo() 
    : devicePtr(nullptr), inventory(nullptr), 
      deviceInfoCached(false), firmwareInfoCached(false) {
}

Helper_DeviceInfo::~Helper_DeviceInfo() {
}

void Helper_DeviceInfo::init(DeviceConfig* device, HardwareInventory* inv) {
    devicePtr = device;
    inventory = inv;
    clearCache();  // Reset cache when inventory changes
    // Serial.println("[Helper_DeviceInfo] Initialized with device and inventory");
}

String Helper_DeviceInfo::getDeviceInfoJSON() {
    if (!devicePtr) {
        Serial.println("[ERROR][Helper_DeviceInfo] Device not initialized");
        return "{}";
    }

    // Return cached result if available
    if (deviceInfoCached && !cachedDeviceInfoJSON.isEmpty()) {
        Serial.println("[Helper_DeviceInfo] Returning cached device info JSON");
        return cachedDeviceInfoJSON;
    }

    Serial.println("[Helper_DeviceInfo] Building device info JSON (first time)");
    StaticJsonDocument<512> doc;
    buildDeviceInfo(doc);
    
    String output;
    serializeJson(doc, output);
    
    // Cache the result
    cachedDeviceInfoJSON = output;
    deviceInfoCached = true;
    
    return output;
}

String Helper_DeviceInfo::getSystemStatsJSON() {
    // System stats are dynamic, never cache
    StaticJsonDocument<1024> doc;
    
    buildSystemStats(doc);
    buildMemoryStats(doc);
    buildFlashStats(doc);
    
    String output;
    serializeJson(doc, output);
    return output;
}

String Helper_DeviceInfo::getSystemStatsLightweightJSON() {
    // Lightweight stats are dynamic, never cache
    StaticJsonDocument<256> doc;
    
    // Only essential stats for lightweight response
    doc["uptime"] = millis();
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["cpuFreqMHz"] = getCpuFrequencyMhz();
    doc["timestamp"] = millis();
    
    String output;
    serializeJson(doc, output);
    return output;
}

String Helper_DeviceInfo::getFirmwareInfoJSON() {
    if (!devicePtr) {
        Serial.println("[ERROR][Helper_DeviceInfo] Device not initialized");
        return "{}";
    }

    // Return cached result if available
    if (firmwareInfoCached && !cachedFirmwareInfoJSON.isEmpty()) {
        Serial.println("[Helper_DeviceInfo] Returning cached firmware info JSON");
        return cachedFirmwareInfoJSON;
    }

    Serial.println("[Helper_DeviceInfo] Building firmware info JSON (first time)");
    StaticJsonDocument<256> doc;
    
    doc["firmwareVersion"] = devicePtr->getFirmwareVersion();
    doc["customFirmware"] = devicePtr->getCustomFirmware();
    doc["sketchSize"] = getSketchSize();
    doc["freeSketchSpace"] = getFreeSketchSpace();
    doc["flashSize"] = getFlashSize();
    
    String output;
    serializeJson(doc, output);
    
    // Cache the result
    cachedFirmwareInfoJSON = output;
    firmwareInfoCached = true;
    
    return output;
}

// Individual getters
String Helper_DeviceInfo::getDeviceModel() {
    return devicePtr ? String(devicePtr->getDeviceModel()) : "";
}

String Helper_DeviceInfo::getDeviceManufacturer() {
    return devicePtr ? String(devicePtr->getDeviceManufacturer()) : "";
}

String Helper_DeviceInfo::getFirmwareVersion() {
    return devicePtr ? String(devicePtr->getFirmwareVersion()) : "";
}

bool Helper_DeviceInfo::getCustomFirmware() {
    return devicePtr ? devicePtr->getCustomFirmware() : false;
}

String Helper_DeviceInfo::getMCU() {
    return devicePtr ? String(devicePtr->getMCU()) : "";
}

String Helper_DeviceInfo::getWirelessConnectivity() {
    return devicePtr ? String(devicePtr->getWirelessConnectivity()) : "";
}

String Helper_DeviceInfo::getFlash() {
    return devicePtr ? String(devicePtr->getFlash()) : "";
}

String Helper_DeviceInfo::getPSRAM() {
    return devicePtr ? String(devicePtr->getPSRAM()) : "";
}

String Helper_DeviceInfo::getUniqueIdentifier() {
    return devicePtr ? String(devicePtr->getUniqueIdentifier()) : "";
}

// System stats getters
uint32_t Helper_DeviceInfo::getFreeHeap() {
    return ESP.getFreeHeap();
}

uint32_t Helper_DeviceInfo::getMinFreeHeap() {
    return ESP.getMinFreeHeap();
}

uint32_t Helper_DeviceInfo::getHeapSize() {
    return ESP.getHeapSize();
}

uint32_t Helper_DeviceInfo::getMaxAllocHeap() {
    return ESP.getMaxAllocHeap();
}

uint32_t Helper_DeviceInfo::getUptime() {
    return millis();
}

uint32_t Helper_DeviceInfo::getCpuFreqMHz() {
    return getCpuFrequencyMhz();
}

uint32_t Helper_DeviceInfo::getFlashSize() {
    return ESP.getFlashChipSize();
}

uint32_t Helper_DeviceInfo::getSketchSize() {
    return ESP.getSketchSize();
}

uint32_t Helper_DeviceInfo::getFreeSketchSpace() {
    return ESP.getFreeSketchSpace();
}

// Private helper methods
void Helper_DeviceInfo::buildDeviceInfo(JsonDocument& doc) {
    doc["deviceModel"] = devicePtr->getDeviceModel();
    doc["deviceManufacturer"] = devicePtr->getDeviceManufacturer();
    doc["firmwareVersion"] = devicePtr->getFirmwareVersion();
    doc["customFirmware"] = devicePtr->getCustomFirmware();
    doc["mcu"] = devicePtr->getMCU();
    doc["wirelessConnectivity"] = devicePtr->getWirelessConnectivity();
    doc["flash"] = devicePtr->getFlash();
    doc["psram"] = devicePtr->getPSRAM();
    doc["uniqueIdentifier"] = devicePtr->getUniqueIdentifier();
}

void Helper_DeviceInfo::buildSystemStats(JsonDocument& doc) {
    doc["uptime"] = millis();
    doc["cpuFreqMHz"] = getCpuFrequencyMhz();
    doc["timestamp"] = millis();
}

void Helper_DeviceInfo::buildMemoryStats(JsonDocument& doc) {
    JsonObject memory = doc.createNestedObject("memory");
    memory["freeHeap"] = ESP.getFreeHeap();
    memory["minFreeHeap"] = ESP.getMinFreeHeap();
    memory["heapSize"] = ESP.getHeapSize();
    memory["maxAllocHeap"] = ESP.getMaxAllocHeap();
    
    #ifdef BOARD_HAS_PSRAM
    if (psramFound()) {
        memory["psramSize"] = ESP.getPsramSize();
        memory["freePsram"] = ESP.getFreePsram();
        memory["minFreePsram"] = ESP.getMinFreePsram();
        memory["maxAllocPsram"] = ESP.getMaxAllocPsram();
    }
    #endif
}

void Helper_DeviceInfo::buildFlashStats(JsonDocument& doc) {
    JsonObject flash = doc.createNestedObject("flash");
    flash["flashSize"] = ESP.getFlashChipSize();
    flash["sketchSize"] = ESP.getSketchSize();
    flash["freeSketchSpace"] = ESP.getFreeSketchSpace();
}

void Helper_DeviceInfo::clearCache() {
    cachedDeviceInfoJSON = "";
    cachedFirmwareInfoJSON = "";
    deviceInfoCached = false;
    firmwareInfoCached = false;
    // Serial.println("[Helper_DeviceInfo] Cache cleared");
}