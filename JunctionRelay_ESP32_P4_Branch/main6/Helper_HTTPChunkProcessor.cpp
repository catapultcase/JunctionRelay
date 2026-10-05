#include "Helper_HTTPChunkProcessor.h"
#include "Helper_StreamProcessor.h"

Helper_HTTPChunkProcessor::Helper_HTTPChunkProcessor(Helper_StreamProcessor* processor)
    : streamProcessor(processor),
      bodyBuffer(nullptr),
      bodyBufferSize(0),
      expectedTotalSize(0),
      currentIndex(0),
      isAccumulating(false),
      processedRequests(0),
      errorCount(0)
{
    Serial.println("[HTTPChunkProcessor] Initialized");
}

Helper_HTTPChunkProcessor::~Helper_HTTPChunkProcessor() {
    deallocateBuffer();
    Serial.println("[HTTPChunkProcessor] Destroyed");
}

void Helper_HTTPChunkProcessor::processChunk(uint8_t* data, size_t len, size_t index, size_t total) {
    if (!data || len == 0) {
        Serial.println("[HTTPChunkProcessor] ERROR: Invalid data or length");
        errorCount++;
        return;
    }

    if (!streamProcessor) {
        Serial.println("[HTTPChunkProcessor] ERROR: StreamProcessor not available");
        errorCount++;
        return;
    }

    // Serial.printf("[HTTPChunkProcessor] Chunk: len=%d, index=%d, total=%d\n", len, index, total);

    // Handle single-chunk requests (most common case)
    if (index == 0 && len == total) {
        // Serial.println("[HTTPChunkProcessor] Single chunk - processing immediately");
        streamProcessor->processData(data, len);
        processedRequests++;
        return;
    }

    // Handle multi-chunk requests
    if (index == 0) {
        // First chunk - initialize accumulation
        Serial.printf("[HTTPChunkProcessor] Starting multi-chunk accumulation (total: %d bytes)\n", total);
        
        if (total > MAX_HTTP_BODY_SIZE) {
            Serial.printf("[HTTPChunkProcessor] ERROR: Request too large: %d bytes (max: %d)\n", 
                         total, MAX_HTTP_BODY_SIZE);
            errorCount++;
            resetState();
            return;
        }

        allocateBuffer(total);
        expectedTotalSize = total;
        currentIndex = 0;
        isAccumulating = true;
    }

    // Validate chunk sequence
    if (!isAccumulating) {
        Serial.println("[HTTPChunkProcessor] ERROR: Received chunk but not accumulating");
        errorCount++;
        return;
    }

    if (index != currentIndex) {
        Serial.printf("[HTTPChunkProcessor] ERROR: Chunk sequence error - expected index %d, got %d\n", 
                     currentIndex, index);
        errorCount++;
        resetState();
        return;
    }

    if (currentIndex + len > expectedTotalSize) {
        Serial.printf("[HTTPChunkProcessor] ERROR: Chunk overflow - would exceed total size\n");
        errorCount++;
        resetState();
        return;
    }

    // Copy chunk data to accumulation buffer
    memcpy(bodyBuffer + currentIndex, data, len);
    currentIndex += len;

    // Serial.printf("[HTTPChunkProcessor] Accumulated %d/%d bytes\n", currentIndex, expectedTotalSize);

    // Check if we have the complete body
    if (currentIndex >= expectedTotalSize) {
        Serial.println("[HTTPChunkProcessor] Complete body received - processing");
        
        // Process the complete body
        streamProcessor->processData(bodyBuffer, expectedTotalSize);
        processedRequests++;
        
        // Reset state for next request
        resetState();
    }
}

void Helper_HTTPChunkProcessor::reset() {
    Serial.println("[HTTPChunkProcessor] Manual reset requested");
    resetState();
}

void Helper_HTTPChunkProcessor::allocateBuffer(size_t size) {
    // Clean up any existing buffer
    deallocateBuffer();
    
    bodyBuffer = new uint8_t[size];
    if (bodyBuffer) {
        bodyBufferSize = size;
        memset(bodyBuffer, 0, size);
        Serial.printf("[HTTPChunkProcessor] Allocated %d byte buffer\n", size);
    } else {
        Serial.printf("[HTTPChunkProcessor] ERROR: Failed to allocate %d byte buffer\n", size);
        bodyBufferSize = 0;
        errorCount++;
    }
}

void Helper_HTTPChunkProcessor::deallocateBuffer() {
    if (bodyBuffer) {
        delete[] bodyBuffer;
        bodyBuffer = nullptr;
        bodyBufferSize = 0;
        // Serial.println("[HTTPChunkProcessor] Buffer deallocated");
    }
}

void Helper_HTTPChunkProcessor::resetState() {
    deallocateBuffer();
    expectedTotalSize = 0;
    currentIndex = 0;
    isAccumulating = false;
    // Serial.println("[HTTPChunkProcessor] State reset");
}