#ifndef HELPER_HTTPCHUNKPROCESSOR_H
#define HELPER_HTTPCHUNKPROCESSOR_H

#include <Arduino.h>

// Forward declarations
class Helper_StreamProcessor;

class Helper_HTTPChunkProcessor {
public:
    Helper_HTTPChunkProcessor(Helper_StreamProcessor* processor);
    ~Helper_HTTPChunkProcessor();

    // Main method called from AsyncWebServer body handler
    void processChunk(uint8_t* data, size_t len, size_t index, size_t total);

    // Reset state (useful for connection issues)
    void reset();

    // Statistics
    uint32_t getProcessedRequests() const { return processedRequests; }
    uint32_t getErrorCount() const { return errorCount; }

private:
    Helper_StreamProcessor* streamProcessor;

    // HTTP body accumulation state
    uint8_t* bodyBuffer;
    size_t bodyBufferSize;
    size_t expectedTotalSize;
    size_t currentIndex;
    bool isAccumulating;
    
    // Statistics
    uint32_t processedRequests;
    uint32_t errorCount;

    // Buffer management
    void allocateBuffer(size_t size);
    void deallocateBuffer();
    void resetState();

    // Constants
    static const size_t MAX_HTTP_BODY_SIZE = 16384; // 16KB max HTTP body
};

#endif // HELPER_HTTPCHUNKPROCESSOR_H