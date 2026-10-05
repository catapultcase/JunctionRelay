#ifndef HELPER_DECOMPRESSION_H
#define HELPER_DECOMPRESSION_H

#include <Arduino.h>

#ifdef __cplusplus
extern "C" {
#endif
  #include "tinf.h"    // tiny-inflate API declarations
#ifdef __cplusplus
}
#endif

class Helper_Decompression {
public:
    Helper_Decompression();
    ~Helper_Decompression();

    bool decompress(const uint8_t* compressedData, size_t compressedSize,
                    uint8_t** decompressedData, size_t* decompressedSize);

    void printStats();

private:
    bool decompressGzip(const uint8_t* in, size_t inSize,
                        uint8_t** outBuf, size_t* outSize);
    bool isGzip(const uint8_t* data, size_t len);
    const char* getTinfErrorString(int errorCode);
    size_t calculateOptimalBufferSize(size_t compressedSize);

    uint32_t calls_, errors_, totalIn_, totalOut_;
};

#endif // HELPER_DECOMPRESSION_H