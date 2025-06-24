#ifndef UTILS_H
#define UTILS_H

#include <WiFi.h>
#include <esp_ota_ops.h>
#include <esp_partition.h>
#include <mbedtls/sha256.h>

// Centralized firmware version
#define FIRMWARE_VERSION "JunctionRelay v0.8.0"

inline const char* getFirmwareVersion() {
    return FIRMWARE_VERSION;
}

inline String getFormattedMacAddress() {
    uint64_t mac = ESP.getEfuseMac();

    // Directly extract the MAC address bytes as they are, without reversing the byte order
    uint8_t macBytes[6];
    macBytes[0] = (mac >> 0) & 0xFF;   // LSB
    macBytes[1] = (mac >> 8) & 0xFF;
    macBytes[2] = (mac >> 16) & 0xFF;
    macBytes[3] = (mac >> 24) & 0xFF;
    macBytes[4] = (mac >> 32) & 0xFF;
    macBytes[5] = (mac >> 40) & 0xFF;  // MSB

    // Format the MAC address as a string
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             macBytes[0], macBytes[1], macBytes[2],
             macBytes[3], macBytes[4], macBytes[5]);

    return String(macStr);
}

// NEW: Calculate SHA-256 hash of running firmware
inline String calculateFirmwareHash() {
    // Get the running partition
    const esp_partition_t* running_partition = esp_ota_get_running_partition();
    if (!running_partition) {
        Serial.println("[HASH] ERROR: Could not get running partition");
        return "";
    }

    Serial.printf("[HASH] Calculating hash for partition: %s (size: %d bytes)\n", 
                  running_partition->label, running_partition->size);

    // Initialize SHA-256 context
    mbedtls_sha256_context sha256_ctx;
    mbedtls_sha256_init(&sha256_ctx);
    mbedtls_sha256_starts(&sha256_ctx, 0); // 0 for SHA-256, 1 for SHA-224

    // Buffer for reading firmware chunks
    const size_t chunk_size = 1024;
    uint8_t* buffer = (uint8_t*)malloc(chunk_size);
    if (!buffer) {
        Serial.println("[HASH] ERROR: Failed to allocate memory for hash calculation");
        mbedtls_sha256_free(&sha256_ctx);
        return "";
    }

    // Read and hash firmware in chunks
    size_t total_read = 0;
    for (size_t offset = 0; offset < running_partition->size; offset += chunk_size) {
        size_t read_size = min(chunk_size, running_partition->size - offset);
        
        esp_err_t err = esp_partition_read(running_partition, offset, buffer, read_size);
        if (err != ESP_OK) {
            Serial.printf("[HASH] ERROR: Failed to read partition at offset %d: %s\n", 
                         offset, esp_err_to_name(err));
            free(buffer);
            mbedtls_sha256_free(&sha256_ctx);
            return "";
        }

        mbedtls_sha256_update(&sha256_ctx, buffer, read_size);
        total_read += read_size;

        // Progress indicator every 100KB
        if (total_read % (100 * 1024) == 0) {
            Serial.printf("[HASH] Progress: %d/%d bytes (%.1f%%)\n", 
                         total_read, running_partition->size, 
                         (float)total_read / running_partition->size * 100);
        }
    }

    // Finalize hash calculation
    unsigned char hash[32];
    mbedtls_sha256_finish(&sha256_ctx, hash);
    mbedtls_sha256_free(&sha256_ctx);
    free(buffer);

    // Convert hash to hex string
    String hash_str = "";
    for (int i = 0; i < 32; i++) {
        char hex[3];
        sprintf(hex, "%02x", hash[i]);
        hash_str += hex;
    }

    Serial.printf("[HASH] Firmware hash calculated: %s\n", hash_str.c_str());
    Serial.printf("[HASH] Total bytes processed: %d\n", total_read);
    
    return hash_str;
}

// NEW: Get firmware hash with caching and error handling
inline String getFirmwareHash(bool forceRecalculate = false) {
    static String cached_hash = "";
    static bool hash_calculated = false;
    
    // Return cached hash if available and not forcing recalculation
    if (hash_calculated && !forceRecalculate && cached_hash.length() > 0) {
        Serial.println("[HASH] Returning cached firmware hash");
        return cached_hash;
    }
    
    Serial.println("[HASH] Starting firmware hash calculation...");
    unsigned long start_time = millis();
    
    String hash = calculateFirmwareHash();
    
    unsigned long calculation_time = millis() - start_time;
    Serial.printf("[HASH] Hash calculation completed in %lu ms\n", calculation_time);
    
    if (hash.length() == 64) { // Valid SHA-256 hash is 64 hex characters
        cached_hash = hash;
        hash_calculated = true;
        Serial.println("[HASH] Hash cached successfully");
    } else {
        Serial.println("[HASH] ERROR: Invalid hash calculated");
    }
    
    return hash;
}

// NEW: Get firmware info as JSON
inline String getFirmwareInfoJson() {
    String hash = getFirmwareHash();
    unsigned long timestamp = millis();
    
    String json = "{";
    json += "\"firmware_version\":\"" + String(getFirmwareVersion()) + "\",";
    json += "\"firmware_hash\":\"" + hash + "\",";
    json += "\"calculated_at\":" + String(timestamp) + ",";
    json += "\"partition_info\":{";
    
    const esp_partition_t* running_partition = esp_ota_get_running_partition();
    if (running_partition) {
        json += "\"label\":\"" + String(running_partition->label) + "\",";
        json += "\"size\":" + String(running_partition->size) + ",";
        json += "\"address\":\"0x" + String(running_partition->address, HEX) + "\"";
    }
    
    json += "},";
    json += "\"mac_address\":\"" + getFormattedMacAddress() + "\"";
    json += "}";
    
    return json;
}

#endif // UTILS_H