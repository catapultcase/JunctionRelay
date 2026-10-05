#ifndef HELPER_OTA_H
#define HELPER_OTA_H

#include <Arduino.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <esp_partition.h>
#include <ArduinoJson.h>

class Helper_OTA {
public:
    Helper_OTA();
    ~Helper_OTA();

    // OTA validation and information
    bool validateFirmwareSize(size_t firmwareSize, String& errorMessage);
    size_t getOTAPartitionSize();
    size_t getAvailableOTASpace();
    String getOTAPartitionInfo();
    
    // OTA process management
    bool beginUpdate(size_t firmwareSize = UPDATE_SIZE_UNKNOWN);
    bool writeChunk(uint8_t* data, size_t len);
    bool finishUpdate(bool verify = true);
    void abortUpdate();
    
    // Status and information
    bool isUpdateInProgress() const { return updateInProgress; }
    size_t getBytesWritten() const { return bytesWritten; }
    String getLastError() const { return lastError; }
    
    // Verification
    bool verifyCurrentFirmware();
    String getCurrentFirmwareHash();

private:
    bool updateInProgress;
    size_t bytesWritten;
    size_t expectedSize;
    String lastError;
    
    // Helper methods
    void setError(const String& error);
    bool validateOTAPartition();
    const esp_partition_t* getNextOTAPartition();
};

#endif // HELPER_OTA_H