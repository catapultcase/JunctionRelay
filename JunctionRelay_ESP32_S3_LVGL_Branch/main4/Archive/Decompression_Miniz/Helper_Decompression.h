#ifndef HELPER_DECOMPRESSION_H
#define HELPER_DECOMPRESSION_H

#include <Arduino.h>

class Helper_Decompression {
public:
    Helper_Decompression();
    ~Helper_Decompression();

    // Main decompression method
    // Returns true on success, false on failure
    // Caller is responsible for deleting decompressedData when done
    bool decompress(uint8_t* compressedData, size_t compressedSize, 
                   uint8_t** decompressedData, size_t* decompressedSize);

    // Utility methods
    bool isGzipData(uint8_t* data, size_t length);
    void printStats();

private:
    // Statistics
    uint32_t decompressionCount;
    uint32_t decompressionErrors;
    uint32_t totalBytesIn;
    uint32_t totalBytesOut;

    // Internal decompression helper
    bool decompressGzip(uint8_t* compressedData, size_t compressedSize,
                       uint8_t** decompressedData, size_t* decompressedSize);
};

#endif // HELPER_DECOMPRESSION_H