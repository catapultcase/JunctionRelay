#include "Helper_Decompression.h"

Helper_Decompression::Helper_Decompression()
  : calls_(0), errors_(0), totalIn_(0), totalOut_(0) {}

Helper_Decompression::~Helper_Decompression() {
    Serial.printf("[Decompress] calls=%u, errors=%u, in=%u B, out=%u B\n",
                  calls_, errors_, totalIn_, totalOut_);
}

bool Helper_Decompression::decompress(const uint8_t* compressedData, size_t compressedSize,
                                      uint8_t** decompressedData, size_t* decompressedSize) {
    if (!compressedData || !decompressedData || !decompressedSize || compressedSize == 0) {
        errors_++;
        return false;
    }
    if (!isGzip(compressedData, compressedSize)) {
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
    }
    return ok;
}

bool Helper_Decompression::isGzip(const uint8_t* data, size_t len) {
    return len >= 3 && data[0]==0x1F && data[1]==0x8B && data[2]==0x08;
}

bool Helper_Decompression::decompressGzip(const uint8_t* in, size_t inSize,
                                          uint8_t** outBuf, size_t* outSize) {
    const size_t TMP_SIZE = 16 * 1024;
    uint8_t* tmp = (uint8_t*)malloc(TMP_SIZE);
    if (!tmp) return false;

    unsigned int destLen = TMP_SIZE;
    int st = tinf_gzip_uncompress(tmp, &destLen, in, inSize);
    if (st != TINF_OK) {
        free(tmp);
        return false;
    }

    *outBuf = (uint8_t*)malloc(destLen);
    if (!*outBuf) {
        free(tmp);
        return false;
    }
    memcpy(*outBuf, tmp, destLen);
    *outSize = destLen;
    free(tmp);
    return true;
}

void Helper_Decompression::printStats() {
    Serial.println("=== Decompressor Stats ===");
    Serial.printf("Calls: %u\nErrors: %u\nIn: %u B\nOut: %u B\n",
                  calls_, errors_, totalIn_, totalOut_);
    Serial.println("==========================");
}
