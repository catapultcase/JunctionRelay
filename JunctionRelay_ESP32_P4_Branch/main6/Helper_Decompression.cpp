#include "Helper_Decompression.h"

Helper_Decompression::Helper_Decompression()
  : calls_(0), errors_(0), totalIn_(0), totalOut_(0) {}

Helper_Decompression::~Helper_Decompression() {
    // Only show stats if there were actual calls
    if (calls_ > 0 || errors_ > 0) {
        Serial.printf("[Decompress] %u calls, %u errors\n", calls_, errors_);
    }
}

bool Helper_Decompression::decompress(const uint8_t* compressedData, size_t compressedSize,
                                      uint8_t** decompressedData, size_t* decompressedSize) {
    
    if (!compressedData || !decompressedData || !decompressedSize || compressedSize == 0) {
        Serial.println("[ERROR] Invalid decompression parameters");
        errors_++;
        return false;
    }
    
    if (!isGzip(compressedData, compressedSize)) {
        Serial.println("[ERROR] Invalid gzip data");
        errors_++;
        return false;
    }
    
    bool ok = decompressGzip(compressedData, compressedSize,
                             decompressedData, decompressedSize);
    if (ok) {
        calls_++;
        totalIn_  += compressedSize;
        totalOut_ += *decompressedSize;
    } else {
        errors_++;
        Serial.println("[ERROR] Gzip decompression failed");
    }
    
    return ok;
}

bool Helper_Decompression::isGzip(const uint8_t* data, size_t len) {
    if (len < 3) {
        return false;
    }
    
    return (data[0] == 0x1F && data[1] == 0x8B && data[2] == 0x08);
}

size_t Helper_Decompression::calculateOptimalBufferSize(size_t compressedSize) {
    size_t freePsram = psramFound() ? ESP.getFreePsram() : 0;
    
    if (!psramFound()) {
        Serial.println("[ERROR] No PSRAM available for decompression");
        return 0;
    }
    
    // Use up to 2MB from PSRAM, leave the rest free
    const size_t MAX_DECOMPRESS_BUFFER = 2 * 1024 * 1024;  // 2MB
    
    if (freePsram < MAX_DECOMPRESS_BUFFER) {
        Serial.printf("[WARN] Low PSRAM: %u bytes\n", freePsram);
        return freePsram - 100000;  // Leave 100KB free
    }
    
    return MAX_DECOMPRESS_BUFFER;
}

bool Helper_Decompression::decompressGzip(const uint8_t* in, size_t inSize,
                                          uint8_t** outBuf, size_t* outSize) {
    
    // Calculate optimal buffer size based on input size and available memory
    size_t tmpSize = calculateOptimalBufferSize(inSize);
    if (tmpSize == 0) {
        Serial.println("[ERROR] Insufficient memory for decompression");
        return false;
    }
    
    // Try PSRAM first for large allocations, fall back to regular heap
    uint8_t* tmp = nullptr;
    
    if (psramFound() && tmpSize > 32768) {  // Use PSRAM for buffers > 32KB
        tmp = (uint8_t*)ps_malloc(tmpSize);
    }
    
    if (!tmp) {
        // Fall back to regular heap
        tmp = (uint8_t*)malloc(tmpSize);
    }
    
    if (!tmp) {
        // Try with smaller buffer as fallback
        tmpSize = min(tmpSize / 2, (size_t)(64 * 1024));
        if (tmpSize >= 16 * 1024) {
            if (psramFound() && tmpSize > 32768) {
                tmp = (uint8_t*)ps_malloc(tmpSize);
            }
            if (!tmp) {
                tmp = (uint8_t*)malloc(tmpSize);
            }
        }
        
        if (!tmp) {
            Serial.println("[ERROR] Failed to allocate decompression buffer");
            return false;
        }
    }

    unsigned int destLen = tmpSize;
    int st = tinf_gzip_uncompress(tmp, &destLen, in, inSize);
    
    if (st != TINF_OK) {
        if (st == TINF_BUF_ERROR) {
            Serial.printf("[ERROR] Decompression buffer too small - need %u bytes\n", destLen);
        } else {
            Serial.printf("[ERROR] Decompression failed with code %d (%s)\n", 
                         st, getTinfErrorString(st));
        }
        
        free(tmp);
        return false;
    }

    // Use PSRAM for output buffer if available and size is large enough
    if (psramFound() && destLen > 32768) {
        *outBuf = (uint8_t*)ps_malloc(destLen);
    }
    
    if (!*outBuf) {
        *outBuf = (uint8_t*)malloc(destLen);
    }
    
    if (!*outBuf) {
        Serial.println("[ERROR] Failed to allocate output buffer");
        free(tmp);
        return false;
    }
    
    memcpy(*outBuf, tmp, destLen);
    *outSize = destLen;
    free(tmp);
    
    return true;
}

const char* Helper_Decompression::getTinfErrorString(int errorCode) {
    switch(errorCode) {
        case TINF_OK: return "OK";
        case TINF_DATA_ERROR: return "DATA_ERROR";
        case TINF_BUF_ERROR: return "BUF_ERROR";
        default: return "UNKNOWN_ERROR";
    }
}

void Helper_Decompression::printStats() {
    Serial.printf("Decompress stats: %u calls, %u errors", calls_, errors_);
    if (calls_ > 0) {
        Serial.printf(", %.1f%% avg compression", 
                     100.0 * (1.0 - (float)totalIn_ / totalOut_));
    }
    Serial.println();
}