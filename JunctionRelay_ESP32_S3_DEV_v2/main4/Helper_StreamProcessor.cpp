#include "Helper_StreamProcessor.h"
#include "ScreenRouter.h"
#include "Helper_Decompression.h"
#include "Helper_DebugScreen.h"
#include "DeviceConfig.h"

// Static member definitions
QueueHandle_t Helper_StreamProcessor::sensorQueue = NULL;
QueueHandle_t Helper_StreamProcessor::configQueue = NULL;
TaskHandle_t Helper_StreamProcessor::sensorProcessingTaskHandle = NULL;
TaskHandle_t Helper_StreamProcessor::configProcessingTaskHandle = NULL;
bool Helper_StreamProcessor::quadManagerRegistered     = false;
bool Helper_StreamProcessor::charlieManagerRegistered = false;
bool Helper_StreamProcessor::neopixelManagerRegistered = false;
bool Helper_StreamProcessor::matrixManagerRegistered   = false;

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
      streamReadingLength(true),
      streamBytesRead(0),
      streamPayloadLength(0),
      streamPayloadBuffer(nullptr),
      lengthHint(0),
      typeField(0),
      routeField(0),
      messagesProcessed(0),
      errorCount(0)
{
    // Initialize prefix buffer
    memset(streamPrefixBuffer, 0, sizeof(streamPrefixBuffer));

    // Create decompression helper
    decompressor = new Helper_Decompression();

    // Allocate payload buffer
    streamPayloadBuffer = new uint8_t[MAX_PAYLOAD_SIZE];
    memset(streamPayloadBuffer, 0, MAX_PAYLOAD_SIZE);

    // Initialize background processing queues
    initializeQueues();

    // Instantiate and start the debug screen
    debugScreenPtr = new Helper_DebugScreen();
    debugScreenPtr->begin();

    Serial.println("[StreamProcessor] Initialized with debug screen capability");
}

Helper_StreamProcessor::~Helper_StreamProcessor() {
    // Clean up queues and tasks
    cleanupQueues();
    delete debugScreenPtr; 
    
    if (streamPayloadBuffer) {
        delete[] streamPayloadBuffer;
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

    // Enhanced payload detection for 4 types at start of new message
    if (streamReadingLength && streamBytesRead == 0 && length > 0) {
        // Type 1: Raw JSON - starts with '{'
        if (data[0] == '{') {
            handleRawJSON(data, length);
            return;
        }
        
        // Type 3: Raw Gzip - starts with gzip magic bytes
        if (length >= 2 && data[0] == 0x1F && data[1] == 0x8B) {
            handleRawGzip(data, length);
            return;
        }
    }

    // Stage 1: Extract the 8-byte prefix (LLLLTTRR format)
    if (streamReadingLength) {
        size_t prefixCopyLen = min(length, (size_t)(8 - streamBytesRead));
        memcpy(streamPrefixBuffer + streamBytesRead, data, prefixCopyLen);
        streamBytesRead += prefixCopyLen;
        
        if (streamBytesRead >= 8) {
            streamPrefixBuffer[8] = '\0';
            
            if (!isValidPrefix()) {
                Serial.println("[StreamProcessor] ERROR: Invalid prefix format - expected 8 digits");
                resetStreamState();
                errorCount++;
                return;
            }
            
            parsePrefixFields();
            
            // Validate type field
            if (typeField != 0 && typeField != 1) {
                Serial.printf("[StreamProcessor] ERROR: Invalid type field: %02d (expected 00 or 01)\n", typeField);
                resetStreamState();
                errorCount++;
                return;
            }
            
            // Set payload length from hint or use auto-detection
            if (lengthHint > 0) {
                streamPayloadLength = lengthHint;
            } else {
                streamPayloadLength = MAX_PAYLOAD_SIZE;
                Serial.println("[StreamProcessor] WARNING: Length hint is 0000, using auto-detection mode");
            }
            
            if (streamPayloadLength <= 0 || streamPayloadLength > MAX_PAYLOAD_SIZE) {
                Serial.printf("[StreamProcessor] ERROR: Invalid payload length: %d\n", streamPayloadLength);
                resetStreamState();
                errorCount++;
                return;
            }
            
            streamReadingLength = false;
            streamBytesRead = 0;
            
            // If there's remaining data after the prefix, start accumulating payload
            if (prefixCopyLen < length) {
                size_t remainingLen = length - prefixCopyLen;
                if (remainingLen <= MAX_PAYLOAD_SIZE) {
                    memcpy(streamPayloadBuffer, data + prefixCopyLen, remainingLen);
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
        size_t copyLen = (length < remainingBytes) ? length : remainingBytes;
        
        if (streamBytesRead + copyLen <= MAX_PAYLOAD_SIZE) {
            memcpy(streamPayloadBuffer + streamBytesRead, data, copyLen);
            streamBytesRead += copyLen;
        } else {
            Serial.printf("[StreamProcessor] ERROR: Payload buffer overflow: %d + %d > %d\n", 
                         streamBytesRead, copyLen, MAX_PAYLOAD_SIZE);
            resetStreamState();
            errorCount++;
            return;
        }
    }

    // Stage 3: When complete payload is received, process it
    if (!streamReadingLength && streamBytesRead >= streamPayloadLength) {
        handlePrefixedPayload();
    }
}

void Helper_StreamProcessor::handleRawJSON(uint8_t* data, size_t length) {
    forwardToScreenRouter(data, length);
    
    // Send to debug screen with correct type
    if (debugScreenPtr) {
        // Create a temporary JSON doc for debug screen
        DynamicJsonDocument tempDoc(8192);
        DeserializationError error = deserializeJson(tempDoc, (char*)data, length);
        if (!error) {
            debugScreenPtr->handleParsedPayload(tempDoc, length, 1, 0); // Type 1: Raw JSON
        }
    }
    
    messagesProcessed++;
}

void Helper_StreamProcessor::handleRawGzip(uint8_t* data, size_t length) {
    // Serial.println("[StreamProcessor] Processing Raw Gzip (Type 3)");
    
    if (decompressor) {
        uint8_t* decompressedData = nullptr;
        size_t decompressedSize = 0;
        
        if (decompressor->decompress(data, length, &decompressedData, &decompressedSize)) {
            forwardToScreenRouter(decompressedData, decompressedSize);
            
            // Send to debug screen with correct type
            if (debugScreenPtr) {
                // Create a temporary JSON doc for debug screen
                DynamicJsonDocument tempDoc(8192);
                DeserializationError error = deserializeJson(tempDoc, (char*)decompressedData, decompressedSize);
                if (!error) {
                    debugScreenPtr->handleParsedPayload(tempDoc, length, 3, 0); // Type 3: Raw Gzip
                }
            }
            
            messagesProcessed++;
            
            if (decompressedData) {
                delete[] decompressedData;
            }
        } else {
            Serial.println("[StreamProcessor] ERROR: Failed to decompress raw gzip data");
            errorCount++;
        }
    } else {
        Serial.println("[StreamProcessor] ERROR: No decompressor available");
        errorCount++;
    }
}

void Helper_StreamProcessor::handlePrefixedPayload() {
    if (typeField == 0) {
        processPrefixedJSON();
    } else if (typeField == 1) {
        processPrefixedGzip();
    } else {
        Serial.printf("[StreamProcessor] ERROR: Unknown payload type: %02d\n", typeField);
        errorCount++;
    }
    
    resetStreamState();
}

void Helper_StreamProcessor::processPrefixedJSON() {
    // Serial.println("[StreamProcessor] Processing Prefixed JSON (Type 2)");
    forwardToScreenRouter(streamPayloadBuffer, streamPayloadLength);
    
    // Send to debug screen with correct type
    if (debugScreenPtr) {
        // Create a temporary JSON doc for debug screen
        DynamicJsonDocument tempDoc(8192);
        DeserializationError error = deserializeJson(tempDoc, (char*)streamPayloadBuffer, streamPayloadLength);
        if (!error) {
            debugScreenPtr->handleParsedPayload(tempDoc, streamPayloadLength, 2, routeField); // Type 2: Prefixed JSON
        }
    }
    
    messagesProcessed++;
}

void Helper_StreamProcessor::processPrefixedGzip() {
    // Serial.println("[StreamProcessor] Processing Prefixed Gzip (Type 4)");
    
    if (decompressor) {
        uint8_t* decompressedData = nullptr;
        size_t decompressedSize = 0;
        
        if (decompressor->decompress(streamPayloadBuffer, streamPayloadLength, &decompressedData, &decompressedSize)) {
            forwardToScreenRouter(decompressedData, decompressedSize);
            
            // Send to debug screen with correct type
            if (debugScreenPtr) {
                // Create a temporary JSON doc for debug screen
                DynamicJsonDocument tempDoc(8192);
                DeserializationError error = deserializeJson(tempDoc, (char*)decompressedData, decompressedSize);
                if (!error) {
                    debugScreenPtr->handleParsedPayload(tempDoc, streamPayloadLength, 4, routeField); // Type 4: Prefixed Gzip
                }
            }
            
            messagesProcessed++;
            
            if (decompressedData) {
                delete[] decompressedData;
            }
        } else {
            Serial.println("[StreamProcessor] ERROR: Failed to decompress prefixed gzip data");
            errorCount++;
        }
    } else {
        Serial.println("[StreamProcessor] ERROR: No decompressor available");
        errorCount++;
    }
}

bool Helper_StreamProcessor::isValidPrefix() {
    for (int i = 0; i < 8; i++) {
        if (!isdigit(streamPrefixBuffer[i])) {
            return false;
        }
    }
    return true;
}

void Helper_StreamProcessor::parsePrefixFields() {
    char lengthHintStr[5] = {0};
    char typeFieldStr[3] = {0};
    char routeFieldStr[3] = {0};
    
    memcpy(lengthHintStr, streamPrefixBuffer, 4);
    memcpy(typeFieldStr, streamPrefixBuffer + 4, 2);
    memcpy(routeFieldStr, streamPrefixBuffer + 6, 2);
    
    lengthHint = atoi(lengthHintStr);
    typeField = atoi(typeFieldStr);
    routeField = atoi(routeFieldStr);
}

void Helper_StreamProcessor::resetStreamState() {
    streamReadingLength = true;
    streamBytesRead = 0;
    streamPayloadLength = 0;
    lengthHint = 0;
    typeField = 0;
    routeField = 0;
    memset(streamPrefixBuffer, 0, sizeof(streamPrefixBuffer));
    if (streamPayloadBuffer) {
        memset(streamPayloadBuffer, 0, MAX_PAYLOAD_SIZE);
    }
}


// DEBUG HELPER
void Helper_StreamProcessor::logFirstNChars(uint8_t* data, size_t length, int n) {
    Serial.print("[StreamProcessor] First ");
    Serial.print(min(n, (int)length));
    Serial.print(" chars: ");
    
    for (int i = 0; i < min(n, (int)length); i++) {
        if (data[i] >= 32 && data[i] <= 126) {
            Serial.print((char)data[i]);
        } else {
            Serial.printf("\\x%02X", data[i]);
        }
    }
    Serial.println();
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
        delete doc;
        errorCount++;
        return;
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
    
    if (strcmp(type, "sensor") == 0) {
        if (sensorQueue && xQueueSend(sensorQueue, &doc, 0) == pdTRUE) {
            // Queued successfully, but not visible in serial monitor to keep it clean
        } else {
            Serial.println("[StreamProcessor] WARNING: Sensor queue full, processing immediately");
            screenRouter->routeSensor(*doc);
            delete doc;
        }
    } else if (strcmp(type, "config") == 0) {
        if (configQueue && xQueueSend(configQueue, &doc, 0) == pdTRUE) {
            Serial.println("[StreamProcessor] Config data queued for background processing");
        } else {
            Serial.println("[StreamProcessor] WARNING: Config queue full, processing immediately");
            handleScreenSetup(*doc);
            screenRouter->routeConfig(*doc);
            delete doc;
        }
    } else if (strcmp(type, "MQTT_Subscription_Request") == 0 || 
               strcmp(type, "websocket_ping") == 0 ||
               strcmp(type, "http_request") == 0 ||
               strcmp(type, "espnow_message") == 0 ||
               doc->containsKey("destination")) {
        Serial.printf("[StreamProcessor] Protocol-specific payload '%s', routing to protocol callback\n", type);
        if (protocolCallback) {
            protocolCallback(*doc);
        }
        delete doc;
    } else if (strcmp(type, "preferences") == 0 ||
               strcmp(type, "stats") == 0 ||
               strcmp(type, "device_info") == 0 ||
               strcmp(type, "system_command") == 0) {
        Serial.printf("[StreamProcessor] System payload '%s', routing to system callback\n", type);
        if (systemCallback) {
            systemCallback(*doc);
        }
        delete doc;
    } else {
        Serial.printf("[StreamProcessor] Unknown type '%s', routing to system callback\n", type);
        if (systemCallback) {
            systemCallback(*doc);
        }
        delete doc;
    }
}

void Helper_StreamProcessor::handleScreenSetup(const JsonDocument& doc) {
    const char* screenId = doc["screenId"];
    if (!screenId) return;
    
    if (!devicePtr) {
        Serial.println("[StreamProcessor] ERROR: No device interface available for screen setup");
        return;
    }
    
    // Get the Wire interface once
    TwoWire* wireInterface = devicePtr->getI2CInterface();
    
    // Debug: Log the current screenId being processed
    Serial.printf("[StreamProcessor] Processing screenId: '%s'\n", screenId);

    // Handle Quad display initialization
    if (doc.containsKey("quad")) {
        Serial.println("[StreamProcessor] Handling Quad display...");
        
        // Register the QuadDisplay manager singleton ONCE as a ScreenDestination
        if (!quadManagerRegistered) {
            Manager_QuadDisplay* quadManager = Manager_QuadDisplay::getInstance(wireInterface);
            screenRouter->registerScreen(quadManager);
            quadManagerRegistered = true;
            Serial.printf("[StreamProcessor] 🔧 Registered QuadDisplay manager singleton with ScreenRouter using %s\n", 
                         (wireInterface == &Wire1) ? "Wire1" : "Wire");
        }
        
        // ALWAYS add the specific display to the singleton manager
        uint8_t i2cAddress = strtol(screenId, nullptr, 0);
        Manager_QuadDisplay::getInstance(wireInterface)->addDisplay(i2cAddress);
        Serial.printf("[StreamProcessor] ✅ Added Quad display at %s (I2C 0x%02X) to singleton manager\n", 
                     screenId, i2cAddress);
    }

    // Handle Charlie display initialization
    else if (doc.containsKey("charlie")) {
        Serial.println("[StreamProcessor] Handling Charlie display...");
        
        // Register the Charlieplex manager singleton ONCE as a ScreenDestination
        if (!charlieManagerRegistered) {
            Manager_Charlieplex* charlieManager = Manager_Charlieplex::getInstance(wireInterface);
            screenRouter->registerScreen(charlieManager);
            charlieManagerRegistered = true;
            Serial.printf("[StreamProcessor] 🔧 Registered Charlieplex manager singleton with ScreenRouter using %s\n", 
                         (wireInterface == &Wire1) ? "Wire1" : "Wire");
        }
        
        // ALWAYS add the specific display to the singleton manager
        uint8_t i2cAddress = strtol(screenId, nullptr, 0);
        Manager_Charlieplex::getInstance(wireInterface)->addDisplay(i2cAddress);
        Serial.printf("[StreamProcessor] ✅ Added Charlie display at %s (I2C 0x%02X) to singleton manager\n", 
                     screenId, i2cAddress);
    }

    // Handle NeoPixel display
    else if (doc.containsKey("neopixel")) {
        Serial.println("[StreamProcessor] Handling NeoPixel display...");

        if (devicePtr->hasExternalNeopixels()) {
            // Register the NeoPixel manager singleton ONCE as a ScreenDestination
            if (!neopixelManagerRegistered) {
                Manager_NeoPixels* neopixelManager = Manager_NeoPixels::getInstance();
                screenRouter->registerScreen(neopixelManager);
                neopixelManagerRegistered = true;
                Serial.printf("[StreamProcessor] 🔧 Registered NeoPixel manager singleton with ScreenRouter\n");
            }
            
            Serial.printf("[StreamProcessor] ✅ NeoPixel display for screenId '%s' handled by singleton manager\n", screenId);
        } else {
            Serial.printf("[ERROR] NeoPixel display not supported for screenId '%s'. Skipping.\n", screenId);
        }
    }
    
    // Handle MATRIX display
    else if (doc.containsKey("matrix")) {
        Serial.println("[StreamProcessor] Handling Matrix display...");

        if (devicePtr->hasExternalMatrix()) {
            // Register the Matrix manager singleton ONCE as a ScreenDestination
            if (!matrixManagerRegistered) {
                Manager_Matrix* matrixManager = Manager_Matrix::getInstance();
                screenRouter->registerScreen(matrixManager);
                matrixManagerRegistered = true;
                Serial.printf("[StreamProcessor] 🔧 Registered Matrix manager singleton with ScreenRouter\n");
            }
            
            Serial.printf("[StreamProcessor] ✅ Matrix display for screenId '%s' handled by singleton manager\n", screenId);
        } else {
            Serial.printf("[ERROR] Matrix display not supported for screenId '%s'. Skipping.\n", screenId);
        }
    }
}

void Helper_StreamProcessor::printDebugInfo() {
    Serial.println("=== StreamProcessor Debug Info ===");
    Serial.printf("Messages Processed: %d\n", messagesProcessed);
    Serial.printf("Errors: %d\n", errorCount);
    Serial.printf("Current State: %s\n", streamReadingLength ? "Reading Length" : "Reading Payload");
    Serial.printf("Bytes Read: %d\n", streamBytesRead);
    Serial.printf("Expected Payload Length: %d\n", streamPayloadLength);
    Serial.printf("Buffer Size: %d bytes\n", MAX_PAYLOAD_SIZE);
    Serial.printf("Device Interface: %s\n", devicePtr ? "Available" : "Not Set");
    
    // Registration status
    Serial.printf("ScreenDestination Registration Status:\n");
    Serial.printf("  - QuadDisplay: %s\n", quadManagerRegistered ? "Registered" : "Not Registered");
    Serial.printf("  - Charlieplex: %s\n", charlieManagerRegistered ? "Registered" : "Not Registered");
    Serial.printf("  - NeoPixels: %s\n", neopixelManagerRegistered ? "Registered" : "Not Registered");
    Serial.printf("  - Matrix: %s\n", matrixManagerRegistered ? "Registered" : "Not Registered");
    
    // Queue status
    QueueStatus status = getQueueStatus();
    Serial.printf("Sensor Queue: %d/%d items\n", status.sensorQueueSize, SENSOR_QUEUE_SIZE);
    Serial.printf("Config Queue: %d/%d items\n", status.configQueueSize, CONFIG_QUEUE_SIZE);
    Serial.printf("Sensor Task Running: %s\n", status.sensorTaskRunning ? "Yes" : "No");
    Serial.printf("Config Task Running: %s\n", status.configTaskRunning ? "Yes" : "No");
    Serial.println("================================");
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
    
    return status;
}

void Helper_StreamProcessor::initializeQueues() {
    // Create sensor processing queue
    if (sensorQueue == NULL) {
        sensorQueue = xQueueCreate(SENSOR_QUEUE_SIZE, sizeof(JsonDocument*));
        if (sensorQueue == NULL) {
            Serial.println("[StreamProcessor] ERROR: Failed to create sensor queue");
        } else {
            Serial.printf("[StreamProcessor] Created sensor queue (size %d)\n", SENSOR_QUEUE_SIZE);
            
            xTaskCreatePinnedToCore(
                [](void* param) {
                    Helper_StreamProcessor* processor = static_cast<Helper_StreamProcessor*>(param);
                    Serial.printf("[SensorTask] Started on core %d\n", xPortGetCoreID());
                    
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
            Serial.printf("[StreamProcessor] Created config queue (size %d)\n", CONFIG_QUEUE_SIZE);
            
            xTaskCreatePinnedToCore(
                [](void* param) {
                    Helper_StreamProcessor* processor = static_cast<Helper_StreamProcessor*>(param);
                    Serial.printf("[ConfigTask] Started on core %d\n", xPortGetCoreID());
                    
                    for (;;) {
                        JsonDocument* doc = NULL;
                        
                        if (xQueueReceive(configQueue, &doc, portMAX_DELAY) == pdTRUE) {
                            if (doc != NULL && processor->screenRouter) {
                                Serial.println("[ConfigTask] Processing config data");
                                
                                // Handle screen setup before routing config (like old handleScreenId)
                                processor->handleScreenSetup(*doc);
                                
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
}

void Helper_StreamProcessor::cleanupQueues() {
    if (sensorProcessingTaskHandle) {
        vTaskDelete(sensorProcessingTaskHandle);
        sensorProcessingTaskHandle = NULL;
        Serial.println("[StreamProcessor] Sensor processing task deleted");
    }
    
    if (configProcessingTaskHandle) {
        vTaskDelete(configProcessingTaskHandle);
        configProcessingTaskHandle = NULL;
        Serial.println("[StreamProcessor] Config processing task deleted");
    }
    
    if (sensorQueue) {
        JsonDocument* doc;
        while (xQueueReceive(sensorQueue, &doc, 0) == pdTRUE) {
            delete doc;
        }
        vQueueDelete(sensorQueue);
        sensorQueue = NULL;
        Serial.println("[StreamProcessor] Sensor queue deleted");
    }
    
    if (configQueue) {
        JsonDocument* doc;
        while (xQueueReceive(configQueue, &doc, 0) == pdTRUE) {
            delete doc;
        }
        vQueueDelete(configQueue);
        configQueue = NULL;
        Serial.println("[StreamProcessor] Config queue deleted");
    }
}