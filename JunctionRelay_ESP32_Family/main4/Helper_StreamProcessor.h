#ifndef HELPER_STREAMPROCESSOR_H
#define HELPER_STREAMPROCESSOR_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <functional>

// Forward declarations
class ScreenRouter;
class Helper_Decompression;
class Helper_DebugScreen;
class DeviceConfig;

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
    
    // Queue status for Manager_Connections status reporting
    struct QueueStatus {
        uint32_t sensorQueueSize;
        uint32_t sensorQueueFree;
        uint32_t configQueueSize;
        uint32_t configQueueFree;
        bool sensorTaskRunning;
        bool configTaskRunning;
    };
    QueueStatus getQueueStatus() const;

private:
    // Core processing methods
    void handleRawJSON(uint8_t* data, size_t length);
    void handleRawGzip(uint8_t* data, size_t length);
    void handlePrefixedPayload();
    void processPrefixedJSON();
    void processPrefixedGzip();

    // Prefix parsing
    bool isValidPrefix();
    void parsePrefixFields();
    
    // Utility methods
    void logFirstNChars(uint8_t* data, size_t length, int n = 50);
    void forwardToScreenRouter(uint8_t* data, size_t length);

    // Dependencies
    ScreenRouter* screenRouter;
    Helper_Decompression* decompressor;
    Helper_DebugScreen* debugScreenPtr;
    std::function<void(const JsonDocument&)> protocolCallback;
    std::function<void(const JsonDocument&)> systemCallback;
    DeviceConfig* devicePtr;

    // Stream state variables
    bool streamReadingLength;
    int streamBytesRead;
    int streamPayloadLength;
    char streamPrefixBuffer[9];  // 8 bytes + null terminator
    uint8_t* streamPayloadBuffer;
    static const size_t MAX_PAYLOAD_SIZE = 8192;

    // Parsed prefix fields
    int lengthHint;
    int typeField;
    int routeField;

    // Statistics
    uint32_t messagesProcessed;
    uint32_t errorCount;
    
    // FreeRTOS queues for background processing
    static QueueHandle_t sensorQueue;
    static QueueHandle_t configQueue;
    static TaskHandle_t sensorProcessingTaskHandle;
    static TaskHandle_t configProcessingTaskHandle;
    static const int SENSOR_QUEUE_SIZE = 30;
    static const int CONFIG_QUEUE_SIZE = 3;
    
    // Queue initialization and cleanup
    void initializeQueues();
    void cleanupQueues();
};

#endif // HELPER_STREAMPROCESSOR_H