#ifndef HELPER_STREAMPROCESSOR_H
#define HELPER_STREAMPROCESSOR_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <functional>
#include <map>

// Forward declarations
class ScreenRouter;
class Helper_Decompression;
class Helper_DebugScreen;
class DeviceConfig;

// Chunk buffer structure
struct ChunkBuffer {
    String messageId;
    uint8_t* data;
    size_t totalSize;
    size_t receivedSize;
    int totalChunks;
    int chunksReceived;
    unsigned long lastChunkTime;
    bool* chunkReceived;
};

class Helper_StreamProcessor {
public:
    Helper_StreamProcessor(ScreenRouter* router,
                          std::function<void(const JsonDocument&)> protocolCallback,
                          std::function<void(const JsonDocument&)> systemCallback,
                          DeviceConfig* device = nullptr);
    ~Helper_StreamProcessor();

    // Main processing method - call with any raw data chunk
    void processData(uint8_t* data, size_t length);

    // Reset stream state (useful for connection resets)
    void resetStreamState();

    // Statistics and debugging
    void printDebugInfo();
    uint32_t getMessagesProcessed() const { return messagesProcessed; }
    uint32_t getErrorCount() const { return errorCount; }
    uint32_t getChunkedFramesReceived() const { return chunkedFramesReceived; }
    uint32_t getChunkedFramesDropped() const { return chunkedFramesDropped; }
    
    // Queue status for Manager_Connections status reporting
    struct QueueStatus {
        uint32_t sensorQueueSize;
        uint32_t sensorQueueFree;
        uint32_t configQueueSize;
        uint32_t configQueueFree;
        bool sensorTaskRunning;
        bool configTaskRunning;
        uint32_t activeChunkBuffers;
    };
    QueueStatus getQueueStatus() const;

    // Message types from C# Service_Manager_Payloads_Prefix
    enum MessageType : uint16_t {
        DATA = 0x0001,
        COMMAND = 0x0002,
        BLIT_RGB565 = 0x3003,
        BLIT_COMPRESSED = 0x3004
    };

    // Routing modes from C# Service_Manager_Payloads_Prefix
    enum RoutingMode : uint16_t {
        LOCAL = 0x0000,
        GATEWAY = 0x0001,
        SCREEN_BASE = 0x0100
    };

private:
    // Core processing methods
    void handleBinaryMessage();
    void processDataPayload();
    void processCommandPayload();
    void processBlitRgb565Payload();
    void processBlitCompressedPayload();
    void handleChunkedMessage(uint8_t* data, size_t length);
    void handlePlainJsonBinary(uint8_t* data, size_t length);

    // Binary message parsing
    bool parseMessageHeader();
    uint32_t parseBinaryLength(const uint8_t* lengthBytes);
    uint16_t parseBinaryUint16(const uint8_t* bytes);
    
    // Message type detection
    bool isChunkedMessage(uint8_t* payload, size_t length);
    bool isPlainJsonBinary(uint8_t* payload, size_t length);
    
    // Chunk management
    ChunkBuffer* getOrCreateChunkBuffer(String messageId, int totalSize, int totalChunks);
    void cleanupExpiredChunks();
    void cleanupOldestChunk();
    void cleanupChunkBuffer(String messageId);
    void cleanupAllChunks();
    void processReassembledMessage(uint8_t* data, size_t length);
    
    // Utility methods
    void forwardToScreenRouter(uint8_t* data, size_t length);
    void routeBlitFrame(uint8_t* data, size_t length, bool compressed);

    // Dependencies
    ScreenRouter* screenRouter;
    Helper_Decompression* decompressor;
    Helper_DebugScreen* debugScreenPtr;
    std::function<void(const JsonDocument&)> protocolCallback;
    std::function<void(const JsonDocument&)> systemCallback;
    DeviceConfig* devicePtr;

    // Stream state variables
    bool streamReadingHeader;
    int streamBytesRead;
    uint32_t streamPayloadLength;
    uint8_t streamHeaderBuffer[8]; // 8-byte binary header
    uint8_t* streamPayloadBuffer;
    size_t MAX_PAYLOAD_SIZE; // Will be set based on PSRAM availability

    // Parsed header fields
    uint32_t lengthField;     // 4-byte binary length
    uint16_t typeField;       // 2-byte binary type
    uint16_t routeField;      // 2-byte binary route

    // Statistics
    uint32_t messagesProcessed;
    uint32_t errorCount;
    uint32_t chunkedFramesReceived;
    uint32_t chunkedFramesDropped;
    
    // Chunk management
    std::map<String, ChunkBuffer> activeChunks;
    static const size_t MAX_CHUNK_BUFFERS = 5;
    static const unsigned long CHUNK_TIMEOUT_MS = 30000;
    
    // FreeRTOS queues for background processing
    static QueueHandle_t sensorQueue;
    static QueueHandle_t configQueue;
    static TaskHandle_t sensorProcessingTaskHandle;
    static TaskHandle_t configProcessingTaskHandle;
    static TaskHandle_t chunkCleanupTaskHandle;
    static const int SENSOR_QUEUE_SIZE = 30;
    static const int CONFIG_QUEUE_SIZE = 3;
    
    // Queue initialization and cleanup
    void initializeQueues();
    void cleanupQueues();
};

#endif // HELPER_STREAMPROCESSOR_H