#include "Helper_Decompression.h"
#include "miniz.h"

Helper_Decompression::Helper_Decompression()
    : decompressionCount(0),
      decompressionErrors(0),
      totalBytesIn(0),
      totalBytesOut(0)
{
    Serial.println("[Decompression] Helper initialized");
}

Helper_Decompression::~Helper_Decompression() {
    Serial.printf("[Decompression] Stats - Processed: %d, Errors: %d, In: %d bytes, Out: %d bytes\n",
                 decompressionCount, decompressionErrors, totalBytesIn, totalBytesOut);
}

bool Helper_Decompression::decompress(uint8_t* compressedData, size_t compressedSize, 
                                     uint8_t** decompressedData, size_t* decompressedSize) {
    if (!compressedData || compressedSize == 0 || !decompressedData || !decompressedSize) {
        Serial.println("[Decompression] ERROR: Invalid parameters");
        decompressionErrors++;
        return false;
    }

    // Check if this is gzip data
    if (!isGzipData(compressedData, compressedSize)) {
        Serial.println("[Decompression] ERROR: Not valid gzip data");
        decompressionErrors++;
        return false;
    }

    bool success = decompressGzip(compressedData, compressedSize, decompressedData, decompressedSize);
    
    if (success) {
        decompressionCount++;
        totalBytesIn += compressedSize;
        totalBytesOut += *decompressedSize;
        // Serial.printf("[Decompression] Success: %d -> %d bytes (ratio: %.2f)\n", 
        //              compressedSize, *decompressedSize, 
        //              (float)*decompressedSize / (float)compressedSize);
    } else {
        decompressionErrors++;
        Serial.println("[Decompression] ERROR: Decompression failed");
    }

    return success;
}

bool Helper_Decompression::isGzipData(uint8_t* data, size_t length) {
    // Check minimum size for gzip header + footer
    if (length < 18) {
        return false;
    }
    
    // Check gzip magic bytes (0x1F 0x8B)
    if (data[0] != 0x1F || data[1] != 0x8B) {
        return false;
    }
    
    // Check compression method (should be 8 for deflate)
    if (data[2] != 8) {
        return false;
    }
    
    return true;
}

bool Helper_Decompression::decompressGzip(uint8_t* compressedData, size_t compressedSize,
                                         uint8_t** decompressedData, size_t* decompressedSize) {
    // Validate gzip stream format (match old ConnectionManager)
    if (!isGzipData(compressedData, compressedSize)) {
        Serial.printf("[Decompression] ERROR: Invalid gzip format\n");
        return false;
    }

    // Allocate decompression buffer (match old ConnectionManager size)
    const size_t DECOMP_BUFFER_SIZE = 16384;
    uint8_t* decompBuffer = new uint8_t[DECOMP_BUFFER_SIZE];
    
    if (!decompBuffer) {
        Serial.println("[Decompression] ERROR: Failed to allocate decompression buffer");
        return false;
    }

    // Extract raw deflate data (skip gzip header and footer) - MATCH OLD LOGIC
    if (compressedSize < 18) {
        Serial.printf("[Decompression] ERROR: Data too small for complete gzip stream: %d bytes\n", compressedSize);
        delete[] decompBuffer;
        return false;
    }
    
    size_t deflateDataLen = compressedSize - 18; // Remove 10-byte header and 8-byte footer
    uint8_t* deflateData = compressedData + 10;  // Skip 10-byte gzip header
    
    // Initialize deflate stream (EXACT OLD CONNECTIONMANAGER LOGIC)
    mz_stream stream = {};
    stream.next_in = deflateData;
    stream.avail_in = deflateDataLen;
    stream.next_out = decompBuffer;
    stream.avail_out = DECOMP_BUFFER_SIZE - 1;
    
    // Decompress using raw deflate (no gzip wrapper) - MATCH OLD CODE
    int result = mz_inflateInit2(&stream, -15); // -15 = raw deflate, no headers
    if (result == MZ_OK) {
        result = mz_inflate(&stream, MZ_FINISH);
        if (result == MZ_STREAM_END) {
            mz_ulong decompSize = DECOMP_BUFFER_SIZE - 1 - stream.avail_out;
            
            // Null-terminate for safety
            decompBuffer[decompSize] = '\0';
            
            // Serial.printf("[Decompression] ✅ Decompressed %d bytes -> %d bytes\n", 
            //              compressedSize, (int)decompSize);
            
            // Allocate exact size buffer and copy (like old code)
            *decompressedData = new uint8_t[decompSize];
            if (*decompressedData) {
                memcpy(*decompressedData, decompBuffer, decompSize);
                *decompressedSize = decompSize;
                delete[] decompBuffer;
                mz_inflateEnd(&stream);
                return true;
            } else {
                Serial.println("[Decompression] ERROR: Failed to allocate final buffer");
            }
        } else {
            Serial.printf("[Decompression] ERROR: Deflate failed: %d\n", result);
        }
        mz_inflateEnd(&stream);
    } else {
        Serial.printf("[Decompression] ERROR: Deflate init failed: %d\n", result);
    }
    
    delete[] decompBuffer;
    return false;
}

void Helper_Decompression::printStats() {
    Serial.println("=== Decompression Stats ===");
    Serial.printf("Decompressions: %d\n", decompressionCount);
    Serial.printf("Errors: %d\n", decompressionErrors);
    Serial.printf("Total bytes in: %d\n", totalBytesIn);
    Serial.printf("Total bytes out: %d\n", totalBytesOut);
    if (totalBytesIn > 0) {
        Serial.printf("Average compression ratio: %.2f\n", (float)totalBytesOut / (float)totalBytesIn);
    }
    Serial.println("==========================");
}