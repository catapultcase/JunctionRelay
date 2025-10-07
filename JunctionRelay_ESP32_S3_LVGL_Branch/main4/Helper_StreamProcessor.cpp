#include "Helper_StreamProcessor.h"
#include "Manager_ScreenRouter.h"
#include "Helper_Decompression.h"
#include "Helper_DebugScreen.h"
#include "DeviceConfig.h"
#include "Helper_Utils.h"

// Static member definitions
QueueHandle_t Helper_StreamProcessor::sensorQueue = NULL;
QueueHandle_t Helper_StreamProcessor::configQueue = NULL;
TaskHandle_t Helper_StreamProcessor::sensorProcessingTaskHandle = NULL;
TaskHandle_t Helper_StreamProcessor::configProcessingTaskHandle = NULL;
TaskHandle_t Helper_StreamProcessor::chunkCleanupTaskHandle = NULL;

Helper_StreamProcessor::Helper_StreamProcessor(ScreenRouter* router,
                                               std::function<void(const JsonDocument&)> protocolCallback,
                                               std::function<void(const JsonDocument&)> systemCallback,
                                               DeviceConfig* device)
    : screenRouter(router),
      decompressor(nullptr),
      protocolCallback(protocolCallback),
      systemCallback(systemCallback),
      devicePtr(device),
      debugScreenPtr(nullptr),
      streamReadingHeader(true),
      streamBytesRead(0),
      streamPayloadLength(0),
      streamPayloadBuffer(nullptr),
      lengthField(0),
      typeField(0),
      routeField(0),
      messagesProcessed(0),
      errorCount(0),
      chunkedFramesReceived(0),
      chunkedFramesDropped(0)
{
    // Initialize header buffer
    memset(streamHeaderBuffer, 0, sizeof(streamHeaderBuffer));

    // Set MAX_PAYLOAD_SIZE based on PSRAM availability
    if (psramFound()) {
        MAX_PAYLOAD_SIZE = 1048576; // 1MB when PSRAM is available
        Serial.println("[StreamProcessor] PSRAM found - using 1MB payload buffer");
    } else {
        MAX_PAYLOAD_SIZE = 8192; // 8KB when no PSRAM
        Serial.println("[StreamProcessor] No PSRAM found - using 8KB payload buffer");
    }

    // Create decompression helper
    decompressor = new Helper_Decompression();

    // Allocate payload buffer with appropriate memory allocator
    if (psramFound()) {
        streamPayloadBuffer = (uint8_t*)ps_malloc(MAX_PAYLOAD_SIZE);
    } else {
        streamPayloadBuffer = new uint8_t[MAX_PAYLOAD_SIZE];
    }
    
    if (streamPayloadBuffer == nullptr) {
        Serial.printf("[StreamProcessor] ERROR: Failed to allocate %u bytes for payload buffer\n", MAX_PAYLOAD_SIZE);
        // Fall back to smaller buffer if allocation failed
        MAX_PAYLOAD_SIZE = 4096; // 4KB fallback
        streamPayloadBuffer = new uint8_t[MAX_PAYLOAD_SIZE];
        if (streamPayloadBuffer == nullptr) {
            Serial.println("[StreamProcessor] CRITICAL ERROR: Could not allocate even fallback buffer");
        } else {
            Serial.printf("[StreamProcessor] Using fallback %u byte buffer\n", MAX_PAYLOAD_SIZE);
        }
    } else {
        Serial.printf("[StreamProcessor] Successfully allocated %u byte payload buffer\n", MAX_PAYLOAD_SIZE);
    }
    
    if (streamPayloadBuffer) {
        memset(streamPayloadBuffer, 0, MAX_PAYLOAD_SIZE);
    }

    // Initialize background processing queues
    initializeQueues();

    // Instantiate and start the debug screen
    debugScreenPtr = new Helper_DebugScreen();
    debugScreenPtr->begin();

    Serial.println("[StreamProcessor] Initialized with unified binary protocol");
}

Helper_StreamProcessor::~Helper_StreamProcessor() {
    cleanupQueues();
    cleanupAllChunks();
    
    delete debugScreenPtr; 
    
    if (streamPayloadBuffer) {
        // Free using appropriate method based on how it was allocated
        if (psramFound() && heap_caps_get_allocated_size(streamPayloadBuffer) > 0) {
            free(streamPayloadBuffer); // ps_malloc uses free()
        } else {
            delete[] streamPayloadBuffer;
        }
        streamPayloadBuffer = nullptr;
    }
    
    if (decompressor) {
        delete decompressor;
        decompressor = nullptr;
    }
    
    Serial.println("[StreamProcessor] Destroyed");
}

void Helper_StreamProcessor::processData(uint8_t* data, size_t length) {
    if (!data || length == 0) {
        return;
    }

    // Check for chunked messages at the start of new messages only
    if (streamReadingHeader && streamBytesRead == 0 && length > 0) {
        if (isChunkedMessage(data, length)) {
            handleChunkedMessage(data, length);
            return;
        }
    }

    // Stage 1: Read 8-byte binary header
    if (streamReadingHeader) {
        size_t headerCopyLen = min(length, (size_t)(8 - streamBytesRead));
        memcpy(streamHeaderBuffer + streamBytesRead, data, headerCopyLen);
        streamBytesRead += headerCopyLen;
        
        if (streamBytesRead >= 8) {
            if (!parseMessageHeader()) {
                Serial.println("[StreamProcessor] ERROR: Invalid message header");
                resetStreamState();
                errorCount++;
                return;
            }
            
            streamReadingHeader = false;
            streamBytesRead = 0;
            
            // Process any remaining data as payload
            if (headerCopyLen < length) {
                size_t remainingLen = length - headerCopyLen;
                if (remainingLen <= MAX_PAYLOAD_SIZE) {
                    memcpy(streamPayloadBuffer, data + headerCopyLen, remainingLen);
                    streamBytesRead += remainingLen;
                } else {
                    Serial.printf("[StreamProcessor] ERROR: Remaining data too large: %d\n", remainingLen);
                    resetStreamState();
                    errorCount++;
                    return;
                }
            }
        }
    } 
    // Stage 2: Accumulate payload data
    else {
        size_t remainingBytes = streamPayloadLength - streamBytesRead;
        size_t copyLen = min(length, remainingBytes);
        
        if (streamBytesRead + copyLen <= MAX_PAYLOAD_SIZE) {
            memcpy(streamPayloadBuffer + streamBytesRead, data, copyLen);
            streamBytesRead += copyLen;
        } else {
            Serial.printf("[StreamProcessor] ERROR: Payload buffer overflow\n");
            resetStreamState();
            errorCount++;
            return;
        }
    }

    // Stage 3: Process complete message
    if (!streamReadingHeader && streamBytesRead >= streamPayloadLength) {
        handleBinaryMessage();
    }
}

bool Helper_StreamProcessor::parseMessageHeader() {
    lengthField = parseBinaryLength(streamHeaderBuffer);
    typeField = parseBinaryUint16(streamHeaderBuffer + 4);
    routeField = parseBinaryUint16(streamHeaderBuffer + 6);
    
    // Validate payload length
    if (lengthField == 0 || lengthField > MAX_PAYLOAD_SIZE) {
        Serial.printf("[StreamProcessor] ERROR: Invalid payload length: %u (max: %u)\n", lengthField, MAX_PAYLOAD_SIZE);
        return false;
    }
    
    streamPayloadLength = lengthField;
    return true;
}

void Helper_StreamProcessor::handleBinaryMessage() {
    switch (typeField) {
        case DATA:
            processDataPayload();
            break;
        case COMMAND:
            processCommandPayload();
            break;
        case BLIT_RGB565:
            processBlitRgb565Payload();
            break;
        case BLIT_COMPRESSED:
            processBlitCompressedPayload();
            break;
        default:
            Serial.printf("[StreamProcessor] ERROR: Unknown message type: 0x%04X\n", typeField);
            errorCount++;
            break;
    }
    
    resetStreamState();
}

void Helper_StreamProcessor::processDataPayload() {
    // DATA messages contain JSON (may be compressed)
    // Check if the payload starts with gzip magic bytes
    if (streamPayloadLength >= 2 && 
        streamPayloadBuffer[0] == 0x1F && 
        streamPayloadBuffer[1] == 0x8B) {
        
        // Compressed JSON data
        if (decompressor) {
            uint8_t* decompressedData = nullptr;
            size_t decompressedSize = 0;
            
            if (decompressor->decompress(streamPayloadBuffer, streamPayloadLength, 
                                       &decompressedData, &decompressedSize)) {
                forwardToScreenRouter(decompressedData, decompressedSize);
                
                if (debugScreenPtr) {
                    DynamicJsonDocument tempDoc(8192);
                    DeserializationError error = deserializeJson(tempDoc, (char*)decompressedData, decompressedSize);
                    if (!error) {
                        debugScreenPtr->handleParsedPayload(tempDoc, streamPayloadLength, 2, routeField);
                    }
                }
                
                messagesProcessed++;
                
                if (decompressedData) {
                    free(decompressedData);
                }
            } else {
                Serial.println("[StreamProcessor] ERROR: Failed to decompress DATA payload");
                errorCount++;
            }
        }
    } else {
        // Uncompressed JSON data
        forwardToScreenRouter(streamPayloadBuffer, streamPayloadLength);
        
        if (debugScreenPtr) {
            DynamicJsonDocument tempDoc(8192);
            DeserializationError error = deserializeJson(tempDoc, (char*)streamPayloadBuffer, streamPayloadLength);
            if (!error) {
                debugScreenPtr->handleParsedPayload(tempDoc, streamPayloadLength, 1, routeField);
            }
        }
        
        messagesProcessed++;
    }
}

void Helper_StreamProcessor::processCommandPayload() {
    // COMMAND messages are always JSON
    forwardToScreenRouter(streamPayloadBuffer, streamPayloadLength);
    
    if (debugScreenPtr) {
        DynamicJsonDocument tempDoc(8192);
        DeserializationError error = deserializeJson(tempDoc, (char*)streamPayloadBuffer, streamPayloadLength);
        if (!error) {
            debugScreenPtr->handleParsedPayload(tempDoc, streamPayloadLength, 3, routeField);
        }
    }
    
    messagesProcessed++;
}

void Helper_StreamProcessor::processBlitRgb565Payload() {
    Serial.printf("[StreamProcessor] Processing RGB565 blit frame (%u bytes)\n", streamPayloadLength);
    routeBlitFrame(streamPayloadBuffer, streamPayloadLength, false);
    messagesProcessed++;
}

void Helper_StreamProcessor::processBlitCompressedPayload() {
    Serial.printf("[StreamProcessor] Processing compressed blit frame (%u bytes)\n", streamPayloadLength);
    
    if (decompressor) {
        uint8_t* decompressedData = nullptr;
        size_t decompressedSize = 0;
        
        if (decompressor->decompress(streamPayloadBuffer, streamPayloadLength, 
                                   &decompressedData, &decompressedSize)) {
            Serial.printf("[StreamProcessor] Decompressed blit frame: %u -> %u bytes\n", 
                         streamPayloadLength, decompressedSize);
            routeBlitFrame(decompressedData, decompressedSize, true);
            messagesProcessed++;
            
            if (decompressedData) {
                free(decompressedData);
            }
        } else {
            Serial.println("[StreamProcessor] ERROR: Failed to decompress blit frame");
            errorCount++;
        }
    } else {
        Serial.println("[StreamProcessor] ERROR: No decompressor available for blit frame");
        errorCount++;
    }
}

void Helper_StreamProcessor::handleChunkedMessage(uint8_t* payload, size_t length) {
    // Find the separator "|||" to split header from data
    int separatorPos = -1;
    
    for (int i = 0; i <= (int)length - 3; i++) {
        if (payload[i] == '|' && payload[i+1] == '|' && payload[i+2] == '|') {
            separatorPos = i;
            break;
        }
    }
    
    if (separatorPos == -1) {
        Serial.println("[StreamProcessor] ERROR: Chunk separator not found");
        errorCount++;
        return;
    }
    
    // Parse chunk header
    char* headerStr = (char*)malloc(separatorPos + 1);
    if (!headerStr) {
        Serial.println("[StreamProcessor] ERROR: Failed to allocate memory for chunk header");
        errorCount++;
        return;
    }
    
    memcpy(headerStr, payload, separatorPos);
    headerStr[separatorPos] = '\0';
    
    DynamicJsonDocument headerDoc(512);
    DeserializationError error = deserializeJson(headerDoc, headerStr);
    free(headerStr);
    
    if (error) {
        Serial.printf("[StreamProcessor] ERROR: Chunk header parse error: %s\n", error.c_str());
        errorCount++;
        return;
    }
    
    // Extract chunk information
    String messageId = headerDoc["messageId"].as<String>();
    int chunkIndex = headerDoc["chunkIndex"];
    int totalChunks = headerDoc["totalChunks"];
    int chunkSize = headerDoc["chunkSize"];
    int totalSize = headerDoc["totalSize"];
    
    // Validate chunk data size
    int actualChunkSize = length - separatorPos - 3;
    if (actualChunkSize != chunkSize) {
        Serial.printf("[StreamProcessor] ERROR: Chunk size mismatch: expected %d, got %d\n", 
                     chunkSize, actualChunkSize);
        errorCount++;
        return;
    }
    
    // Get or create chunk buffer
    ChunkBuffer* buffer = getOrCreateChunkBuffer(messageId, totalSize, totalChunks);
    if (!buffer) {
        Serial.println("[StreamProcessor] ERROR: Failed to create chunk buffer");
        errorCount++;
        return;
    }
    
    // Validate chunk index
    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
        Serial.printf("[StreamProcessor] ERROR: Invalid chunk index %d (total: %d)\n", 
                     chunkIndex, totalChunks);
        errorCount++;
        return;
    }
    
    // Check if we already have this chunk
    if (buffer->chunkReceived[chunkIndex]) {
        Serial.printf("[StreamProcessor] WARNING: Duplicate chunk %d for message %s\n", 
                     chunkIndex, messageId.c_str());
        return;
    }
    
    // Calculate chunk offset
    int chunkOffset = chunkIndex * 4096; // Standard 4KB chunks
    if (chunkOffset + chunkSize > buffer->totalSize) {
        Serial.printf("[StreamProcessor] ERROR: Chunk would overflow buffer\n");
        errorCount++;
        return;
    }
    
    // Copy chunk data to buffer
    memcpy(buffer->data + chunkOffset, payload + separatorPos + 3, chunkSize);
    buffer->chunkReceived[chunkIndex] = true;
    buffer->chunksReceived++;
    buffer->receivedSize += chunkSize;
    buffer->lastChunkTime = millis();
    
    // Check if message is complete
    if (buffer->chunksReceived == buffer->totalChunks) {
        Serial.printf("[StreamProcessor] Message %s complete (%d chunks, %d bytes)\n", 
                      messageId.c_str(), buffer->totalChunks, buffer->totalSize);
        
        // Process the reassembled message
        processReassembledMessage(buffer->data, buffer->totalSize);
        
        // Clean up the buffer
        cleanupChunkBuffer(messageId);
        chunkedFramesReceived++;
    }
}

void Helper_StreamProcessor::processReassembledMessage(uint8_t* data, size_t length) {
    Serial.printf("[StreamProcessor] Processing reassembled message (%u bytes)\n", length);
    
    // All reassembled messages should have the 8-byte binary header
    if (length >= 8) {
        uint32_t messageLength = parseBinaryLength(data);
        uint16_t messageType = parseBinaryUint16(data + 4);
        uint16_t messageRoute = parseBinaryUint16(data + 6);
        
        // Validate the header
        if (messageLength == length - 8) {
            Serial.printf("[StreamProcessor] Reassembled message - Type: 0x%04X, Length: %u\n", 
                         messageType, messageLength);
            
            // Process the message by feeding it back into processData
            processData(data, length);
        } else {
            Serial.printf("[StreamProcessor] ERROR: Invalid reassembled message header\n");
            errorCount++;
        }
    } else {
        Serial.printf("[StreamProcessor] ERROR: Reassembled message too small for header\n");
        errorCount++;
    }
}

void Helper_StreamProcessor::routeBlitFrame(uint8_t* data, size_t length, bool wasCompressed) {
    if (!screenRouter) {
        Serial.println("[StreamProcessor] ERROR: No ScreenRouter available for blit frame");
        errorCount++;
        return;
    }
    
    // Create a JSON document to route to blit destination
    DynamicJsonDocument blitDoc(1024);
    blitDoc["type"] = "blit_frame";
    blitDoc["screenId"] = "blit";
    blitDoc["frameSize"] = length;
    blitDoc["compressed"] = wasCompressed;
    blitDoc["timestamp"] = millis();
    
    // Store frame data pointer in the document
    blitDoc["frameData"] = (uintptr_t)data;
    
    Serial.printf("[StreamProcessor] Routing blit frame to screenId 'blit' (%u bytes)\n", length);
    screenRouter->routeConfig(blitDoc);
}

uint32_t Helper_StreamProcessor::parseBinaryLength(const uint8_t* lengthBytes) {
    // Parse as little-endian uint32
    return (uint32_t)lengthBytes[0] | 
           ((uint32_t)lengthBytes[1] << 8) | 
           ((uint32_t)lengthBytes[2] << 16) | 
           ((uint32_t)lengthBytes[3] << 24);
}

uint16_t Helper_StreamProcessor::parseBinaryUint16(const uint8_t* bytes) {
    // Parse as little-endian uint16
    return (uint16_t)bytes[0] | ((uint16_t)bytes[1] << 8);
}

bool Helper_StreamProcessor::isChunkedMessage(uint8_t* payload, size_t length) {
    const char* chunkStart = "{\"type\":\"chunk\"";
    size_t chunkStartLen = strlen(chunkStart);
    
    if (length < chunkStartLen) {
        return false;
    }
    
    return memcmp(payload, chunkStart, chunkStartLen) == 0;
}

void Helper_StreamProcessor::resetStreamState() {
    streamReadingHeader = true;
    streamBytesRead = 0;
    streamPayloadLength = 0;
    lengthField = 0;
    typeField = 0;
    routeField = 0;
    memset(streamHeaderBuffer, 0, sizeof(streamHeaderBuffer));
    if (streamPayloadBuffer) {
        memset(streamPayloadBuffer, 0, MAX_PAYLOAD_SIZE);
    }
}

void Helper_StreamProcessor::forwardToScreenRouter(uint8_t* data, size_t length) {
    if (!screenRouter) {
        Serial.println("[StreamProcessor] ERROR: No ScreenRouter available");
        errorCount++;
        return;
    }
    
    DynamicJsonDocument* doc = new DynamicJsonDocument(8192);
    DeserializationError error = deserializeJson(*doc, (char*)data, length);
    
    if (error) {
        Serial.printf("[StreamProcessor] ERROR: JSON parsing failed: %s\n", error.c_str());
        if (debugScreenPtr) {
            debugScreenPtr->trackJsonError();
        }
        delete doc;
        errorCount++;
        return;
    }
    
    // Check for destination routing
    if (doc->containsKey("destination")) {
        String destinationMac = (*doc)["destination"].as<String>();
        
        static String cachedLocalMac = "";
        static bool macCached = false;
        
        if (!macCached) {
            cachedLocalMac = getFormattedMacAddress();
            macCached = true;
            Serial.printf("[StreamProcessor] Cached local MAC: %s\n", cachedLocalMac.c_str());
        }
        
        if (!cachedLocalMac.isEmpty() && destinationMac.equalsIgnoreCase(cachedLocalMac)) {
            // Local destination - remove destination field and process locally
            if (debugScreenPtr) {
                debugScreenPtr->trackLocalDestination();
            }
            doc->remove("destination");
        } else {
            // Remote destination - route to protocol callback
            if (debugScreenPtr) {
                debugScreenPtr->trackRemoteDestination(destinationMac);
            }
            if (protocolCallback) {
                protocolCallback(*doc);
            }
            delete doc;
            return;
        }
    }
    
    const char* type = (*doc)["type"];
    if (!type) {
        Serial.println("[StreamProcessor] WARNING: No 'type' field, routing to system callback");
        if (systemCallback) {
            systemCallback(*doc);
        }
        delete doc;
        return;
    }
    
    // Route based on message type
    if (strcmp(type, "sensor") == 0) {
        if (sensorQueue && xQueueSend(sensorQueue, &doc, 0) == pdTRUE) {
            // Queued successfully
        } else {
            Serial.println("[StreamProcessor] WARNING: Sensor queue full, processing immediately");
            if (debugScreenPtr) {
                debugScreenPtr->trackQueueOverflow("sensor");
            }
            screenRouter->routeSensor(*doc);
            delete doc;
        }
    } else if (strcmp(type, "config") == 0 || 
               strcmp(type, "rive_config") == 0 ||
               strcmp(type, "rive_sensor") == 0 ||
               strcmp(type, "blit_frame") == 0) {
        if (configQueue && xQueueSend(configQueue, &doc, 0) == pdTRUE) {
            // Queued successfully
        } else {
            Serial.println("[StreamProcessor] WARNING: Config queue full, processing immediately");
            if (debugScreenPtr) {
                debugScreenPtr->trackQueueOverflow("config");
            }
            screenRouter->routeConfig(*doc);
            delete doc;
        }
    } else if (strcmp(type, "MQTT_Subscription_Request") == 0 || 
               strcmp(type, "websocket_ping") == 0 ||
               strcmp(type, "http_request") == 0 ||
               strcmp(type, "espnow_message") == 0 ||
               strcmp(type, "peer_management") == 0) {
        Serial.printf("[StreamProcessor] Protocol-specific payload '%s', routing to protocol callback\n", type);
        if (protocolCallback) {
            protocolCallback(*doc);
        }
        delete doc;
    } else {
        Serial.printf("[StreamProcessor] Unknown/system type '%s', routing to system callback\n", type);
        if (systemCallback) {
            systemCallback(*doc);
        }
        delete doc;
    }
}

// Chunk management methods (simplified from original)
ChunkBuffer* Helper_StreamProcessor::getOrCreateChunkBuffer(String messageId, int totalSize, int totalChunks) {
    auto it = activeChunks.find(messageId);
    if (it != activeChunks.end()) {
        return &it->second;
    }
    
    if (activeChunks.size() >= MAX_CHUNK_BUFFERS) {
        cleanupOldestChunk();
    }
    
    ChunkBuffer buffer;
    buffer.messageId = messageId;
    buffer.totalSize = totalSize;
    buffer.totalChunks = totalChunks;
    buffer.receivedSize = 0;
    buffer.chunksReceived = 0;
    buffer.lastChunkTime = millis();
    
    // Use PSRAM for chunk buffers if available and totalSize is large
    if (psramFound() && totalSize > 32768) { // Use PSRAM for buffers > 32KB
        buffer.data = (uint8_t*)ps_malloc(totalSize);
    } else {
        buffer.data = (uint8_t*)malloc(totalSize);
    }
    
    buffer.chunkReceived = (bool*)calloc(totalChunks, sizeof(bool));
    
    if (!buffer.data || !buffer.chunkReceived) {
        Serial.println("[StreamProcessor] ERROR: Failed to allocate memory for chunk buffer");
        if (buffer.data) free(buffer.data);
        if (buffer.chunkReceived) free(buffer.chunkReceived);
        return nullptr;
    }
    
    activeChunks[messageId] = buffer;
    return &activeChunks[messageId];
}

void Helper_StreamProcessor::cleanupExpiredChunks() {
    unsigned long currentTime = millis();
    auto it = activeChunks.begin();
    
    while (it != activeChunks.end()) {
        if (currentTime - it->second.lastChunkTime > CHUNK_TIMEOUT_MS) {
            free(it->second.data);
            free(it->second.chunkReceived);
            it = activeChunks.erase(it);
            chunkedFramesDropped++;
        } else {
            ++it;
        }
    }
}

void Helper_StreamProcessor::cleanupOldestChunk() {
    if (activeChunks.empty()) return;
    
    auto oldest = activeChunks.begin();
    unsigned long oldestTime = oldest->second.lastChunkTime;
    
    for (auto it = activeChunks.begin(); it != activeChunks.end(); ++it) {
        if (it->second.lastChunkTime < oldestTime) {
            oldest = it;
            oldestTime = it->second.lastChunkTime;
        }
    }
    
    free(oldest->second.data);
    free(oldest->second.chunkReceived);
    activeChunks.erase(oldest);
    chunkedFramesDropped++;
}

void Helper_StreamProcessor::cleanupChunkBuffer(String messageId) {
    auto it = activeChunks.find(messageId);
    if (it != activeChunks.end()) {
        free(it->second.data);
        free(it->second.chunkReceived);
        activeChunks.erase(it);
    }
}

void Helper_StreamProcessor::cleanupAllChunks() {
    for (auto& chunk : activeChunks) {
        free(chunk.second.data);
        free(chunk.second.chunkReceived);
    }
    activeChunks.clear();
    Serial.println("[StreamProcessor] Cleared all chunk buffers");
}

Helper_StreamProcessor::QueueStatus Helper_StreamProcessor::getQueueStatus() const {
    QueueStatus status = {};
    
    if (sensorQueue) {
        status.sensorQueueSize = uxQueueMessagesWaiting(sensorQueue);
        status.sensorQueueFree = uxQueueSpacesAvailable(sensorQueue);
    }
    
    if (configQueue) {
        status.configQueueSize = uxQueueMessagesWaiting(configQueue);
        status.configQueueFree = uxQueueSpacesAvailable(configQueue);
    }
    
    status.sensorTaskRunning = (sensorProcessingTaskHandle != NULL);
    status.configTaskRunning = (configProcessingTaskHandle != NULL);
    status.activeChunkBuffers = activeChunks.size();
    
    return status;
}

void Helper_StreamProcessor::initializeQueues() {
    // Create sensor processing queue
    if (sensorQueue == NULL) {
        sensorQueue = xQueueCreate(SENSOR_QUEUE_SIZE, sizeof(JsonDocument*));
        if (sensorQueue == NULL) {
            Serial.println("[StreamProcessor] ERROR: Failed to create sensor queue");
        } else {
            xTaskCreatePinnedToCore(
                [](void* param) {
                    Helper_StreamProcessor* processor = static_cast<Helper_StreamProcessor*>(param);
                    
                    for (;;) {
                        JsonDocument* doc = NULL;
                        
                        if (xQueueReceive(sensorQueue, &doc, portMAX_DELAY) == pdTRUE) {
                            if (doc != NULL && processor->screenRouter) {
                                processor->screenRouter->routeSensor(*doc);
                                delete doc;
                            }
                        }
                    }
                },
                "SensorProcessing",
                4096,
                this,
                1,
                &sensorProcessingTaskHandle,
                1
            );
        }
    }
    
    // Create config processing queue
    if (configQueue == NULL) {
        configQueue = xQueueCreate(CONFIG_QUEUE_SIZE, sizeof(JsonDocument*));
        if (configQueue == NULL) {
            Serial.println("[StreamProcessor] ERROR: Failed to create config queue");
        } else {
            xTaskCreatePinnedToCore(
                [](void* param) {
                    Helper_StreamProcessor* processor = static_cast<Helper_StreamProcessor*>(param);
                    
                    for (;;) {
                        JsonDocument* doc = NULL;
                        
                        if (xQueueReceive(configQueue, &doc, portMAX_DELAY) == pdTRUE) {
                            if (doc != NULL && processor->screenRouter) {
                                processor->screenRouter->routeConfig(*doc);
                                delete doc;
                            }
                        }
                    }
                },
                "ConfigProcessing",
                8192,
                this,
                1,
                &configProcessingTaskHandle,
                1
            );
        }
    }
    
    // Start cleanup task for expired chunks
    if (chunkCleanupTaskHandle == NULL) {
        xTaskCreatePinnedToCore(
            [](void* param) {
                Helper_StreamProcessor* processor = static_cast<Helper_StreamProcessor*>(param);
                
                for (;;) {
                    processor->cleanupExpiredChunks();
                    vTaskDelay(pdMS_TO_TICKS(5000)); // Check every 5 seconds
                }
            },
            "ChunkCleanup",
            2048,
            this,
            1,
            &chunkCleanupTaskHandle,
            0
        );
    }
}

void Helper_StreamProcessor::cleanupQueues() {
    if (sensorProcessingTaskHandle) {
        vTaskDelete(sensorProcessingTaskHandle);
        sensorProcessingTaskHandle = NULL;
    }
    
    if (configProcessingTaskHandle) {
        vTaskDelete(configProcessingTaskHandle);
        configProcessingTaskHandle = NULL;
    }
    
    if (chunkCleanupTaskHandle) {
        vTaskDelete(chunkCleanupTaskHandle);
        chunkCleanupTaskHandle = NULL;
    }
    
    if (sensorQueue) {
        JsonDocument* doc;
        while (xQueueReceive(sensorQueue, &doc, 0) == pdTRUE) {
            delete doc;
        }
        vQueueDelete(sensorQueue);
        sensorQueue = NULL;
    }
    
    if (configQueue) {
        JsonDocument* doc;
        while (xQueueReceive(configQueue, &doc, 0) == pdTRUE) {
            delete doc;
        }
        vQueueDelete(configQueue);
        configQueue = NULL;
    }
}

void Helper_StreamProcessor::printDebugInfo() {
    Serial.println("=== StreamProcessor Debug Info ===");
    Serial.printf("Messages Processed: %d\n", messagesProcessed);
    Serial.printf("Errors: %d\n", errorCount);
    Serial.printf("Chunked Frames Received: %d\n", chunkedFramesReceived);
    Serial.printf("Chunked Frames Dropped: %d\n", chunkedFramesDropped);
    Serial.printf("Current State: %s\n", streamReadingHeader ? "Reading Header" : "Reading Payload");
    Serial.printf("Bytes Read: %d\n", streamBytesRead);
    Serial.printf("Expected Payload Length: %u\n", streamPayloadLength);
    Serial.printf("MAX_PAYLOAD_SIZE: %u bytes (%s)\n", MAX_PAYLOAD_SIZE, 
                 psramFound() ? "PSRAM" : "Internal RAM");
    Serial.printf("Active Chunk Buffers: %d/%d\n", activeChunks.size(), MAX_CHUNK_BUFFERS);
    
    if (!streamReadingHeader) {
        Serial.printf("Current Message - Type: 0x%04X, Length: %u, Route: 0x%04X\n", 
                     typeField, lengthField, routeField);
    }
    
    QueueStatus status = getQueueStatus();
    Serial.printf("Sensor Queue: %d/%d items\n", status.sensorQueueSize, SENSOR_QUEUE_SIZE);
    Serial.printf("Config Queue: %d/%d items\n", status.configQueueSize, CONFIG_QUEUE_SIZE);
    Serial.printf("Tasks Running: Sensor=%s, Config=%s\n", 
                 status.sensorTaskRunning ? "Yes" : "No",
                 status.configTaskRunning ? "Yes" : "No");
    Serial.println("==================================");
}