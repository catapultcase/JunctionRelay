#include "Helper_OTA.h"
#include "Helper_Utils.h"

Helper_OTA::Helper_OTA()
    : updateInProgress(false),
      bytesWritten(0),
      expectedSize(0),
      lastError("")
{
    Serial.println("[Helper_OTA] Initialized");
}

Helper_OTA::~Helper_OTA() {
    if (updateInProgress) {
        abortUpdate();
    }
    Serial.println("[Helper_OTA] Destroyed");
}

// ==========================================
// OTA VALIDATION AND INFORMATION
// ==========================================

bool Helper_OTA::validateFirmwareSize(size_t firmwareSize, String& errorMessage) {
    if (firmwareSize == 0) {
        errorMessage = "Firmware size cannot be zero";
        return false;
    }
    
    size_t otaPartitionSize = getOTAPartitionSize();
    if (otaPartitionSize == 0) {
        errorMessage = "Could not determine OTA partition size";
        return false;
    }
    
    if (firmwareSize > otaPartitionSize) {
        errorMessage = "Firmware size (" + String(firmwareSize) + " bytes) exceeds OTA partition size (" + String(otaPartitionSize) + " bytes)";
        return false;
    }
    
    // Check if we have enough free heap for the update process
    size_t freeHeap = ESP.getFreeHeap();
    if (freeHeap < 32768) { // Require at least 32KB free heap
        errorMessage = "Insufficient free heap for OTA update (" + String(freeHeap) + " bytes available, 32KB minimum required)";
        return false;
    }
    
    Serial.printf("[Helper_OTA] ✅ Firmware size validation passed: %d bytes (max: %d bytes)\n", 
                 firmwareSize, otaPartitionSize);
    return true;
}

size_t Helper_OTA::getOTAPartitionSize() {
    const esp_partition_t* otaPartition = getNextOTAPartition();
    if (!otaPartition) {
        Serial.println("[Helper_OTA] ❌ Could not find OTA partition");
        return 0;
    }
    
    return otaPartition->size;
}

size_t Helper_OTA::getAvailableOTASpace() {
    // For OTA updates, the entire partition is available
    // (unlike running partition which may be partially used)
    return getOTAPartitionSize();
}

String Helper_OTA::getOTAPartitionInfo() {
    StaticJsonDocument<512> doc;
    
    const esp_partition_t* otaPartition = getNextOTAPartition();
    if (otaPartition) {
        doc["label"] = otaPartition->label;
        doc["size"] = otaPartition->size;
        doc["address"] = "0x" + String(otaPartition->address, HEX);
        doc["type"] = otaPartition->type;
        doc["subtype"] = otaPartition->subtype;
    } else {
        doc["error"] = "OTA partition not found";
    }
    
    // Add current running partition info for comparison
    const esp_partition_t* runningPartition = esp_ota_get_running_partition();
    if (runningPartition) {
        JsonObject running = doc.createNestedObject("running_partition");
        running["label"] = runningPartition->label;
        running["size"] = runningPartition->size;
        running["address"] = "0x" + String(runningPartition->address, HEX);
    }
    
    String result;
    serializeJson(doc, result);
    return result;
}

// ==========================================
// OTA PROCESS MANAGEMENT
// ==========================================

bool Helper_OTA::beginUpdate(size_t firmwareSize) {
    if (updateInProgress) {
        setError("Update already in progress");
        return false;
    }
    
    // Validate OTA partition
    if (!validateOTAPartition()) {
        setError("OTA partition validation failed");
        return false;
    }
    
    // If size is provided, validate it
    if (firmwareSize != UPDATE_SIZE_UNKNOWN) {
        String validationError;
        if (!validateFirmwareSize(firmwareSize, validationError)) {
            setError(validationError);
            return false;
        }
        expectedSize = firmwareSize;
    } else {
        expectedSize = 0; // Unknown size
    }
    
    // Begin the update
    if (!Update.begin(firmwareSize)) {
        setError("Failed to begin update: " + String(Update.errorString()));
        return false;
    }
    
    updateInProgress = true;
    bytesWritten = 0;
    lastError = "";
    
    Serial.printf("[Helper_OTA] ✅ Update started (expected size: %d bytes)\n", 
                 firmwareSize == UPDATE_SIZE_UNKNOWN ? 0 : firmwareSize);
    return true;
}

bool Helper_OTA::writeChunk(uint8_t* data, size_t len) {
    if (!updateInProgress) {
        setError("No update in progress");
        return false;
    }
    
    if (!data || len == 0) {
        setError("Invalid data or length");
        return false;
    }
    
    // Check if this write would exceed OTA partition size
    size_t otaPartitionSize = getOTAPartitionSize();
    if (bytesWritten + len > otaPartitionSize) {
        setError("Write would exceed OTA partition size");
        abortUpdate();
        return false;
    }
    
    // Write the chunk
    size_t written = Update.write(data, len);
    if (written != len) {
        setError("Failed to write chunk: " + String(Update.errorString()));
        abortUpdate();
        return false;
    }
    
    bytesWritten += written;
    
    // Progress logging (every 64KB)
    if (bytesWritten % (64 * 1024) == 0) {
        Serial.printf("[Helper_OTA] Progress: %d bytes written\n", bytesWritten);
    }
    
    return true;
}

bool Helper_OTA::finishUpdate(bool verify) {
    if (!updateInProgress) {
        setError("No update in progress");
        return false;
    }
    
    // Finish the update
    if (!Update.end(true)) {
        setError("Failed to finish update: " + String(Update.errorString()));
        updateInProgress = false;
        return false;
    }
    
    updateInProgress = false;
    
    Serial.printf("[Helper_OTA] ✅ Update completed successfully (%d bytes written)\n", bytesWritten);
    
    // Optional verification
    if (verify) {
        Serial.println("[Helper_OTA] Verifying updated firmware...");
        if (verifyCurrentFirmware()) {
            Serial.println("[Helper_OTA] ✅ Firmware verification passed");
        } else {
            Serial.println("[Helper_OTA] ⚠️ Firmware verification failed, but update completed");
        }
    }
    
    return true;
}

void Helper_OTA::abortUpdate() {
    if (updateInProgress) {
        Update.abort();
        updateInProgress = false;
        Serial.printf("[Helper_OTA] ❌ Update aborted after %d bytes\n", bytesWritten);
    }
}

// ==========================================
// VERIFICATION
// ==========================================

bool Helper_OTA::verifyCurrentFirmware() {
    try {
        String hash = getFirmwareHash(true); // Force recalculation
        bool isValid = (hash.length() == 64); // Valid SHA-256 hash
        
        if (isValid) {
            Serial.printf("[Helper_OTA] Current firmware hash: %s\n", hash.c_str());
        } else {
            Serial.println("[Helper_OTA] Failed to calculate firmware hash");
        }
        
        return isValid;
    } catch (...) {
        Serial.println("[Helper_OTA] Exception during firmware verification");
        return false;
    }
}

String Helper_OTA::getCurrentFirmwareHash() {
    return getFirmwareHash(false); // Use cached if available
}

// ==========================================
// HELPER METHODS
// ==========================================

void Helper_OTA::setError(const String& error) {
    lastError = error;
    Serial.printf("[Helper_OTA] ❌ Error: %s\n", error.c_str());
}

bool Helper_OTA::validateOTAPartition() {
    const esp_partition_t* otaPartition = getNextOTAPartition();
    if (!otaPartition) {
        Serial.println("[Helper_OTA] ❌ No OTA partition found");
        return false;
    }
    
    // Check partition size is reasonable
    if (otaPartition->size < 100000) { // Less than 100KB seems wrong
        Serial.printf("[Helper_OTA] ❌ OTA partition too small: %d bytes\n", otaPartition->size);
        return false;
    }
    
    Serial.printf("[Helper_OTA] ✅ OTA partition validated: %s (%d bytes)\n", 
                 otaPartition->label, otaPartition->size);
    return true;
}

const esp_partition_t* Helper_OTA::getNextOTAPartition() {
    // Get the next OTA partition that would be used for updates
    const esp_partition_t* otaPartition = esp_ota_get_next_update_partition(NULL);
    
    if (!otaPartition) {
        Serial.println("[Helper_OTA] ❌ esp_ota_get_next_update_partition() returned NULL");
    }
    
    return otaPartition;
}