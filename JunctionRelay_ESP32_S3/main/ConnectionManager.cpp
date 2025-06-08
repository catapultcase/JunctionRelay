#include "ConnectionManager.h"
#include <ArduinoJson.h>
#include <lvgl.h>
#include <Preferences.h>
#include <esp_now.h>
#include <ESPmDNS.h> 
#include "DeviceConfig.h"
#include "Manager_QuadDisplay.h"
#include "Manager_Matrix.h"
#include "Manager_MQTT.h"
#include "Manager_NeoPixels.h"
#include "utils.h"

// ESP32-S3 analog pin compatibility (add right after includes)
#ifndef A0
#define A0 1
#endif
#ifndef A1  
#define A1 2
#endif
#ifndef A2
#define A2 3
#endif
#ifndef A3
#define A3 4
#endif
#ifndef A4
#define A4 5
#endif
#ifndef A5
#define A5 6
#endif
#ifndef A6
#define A6 7
#endif
#ifndef A7
#define A7 8
#endif

const char* ConnectionManager::defaultSSID = "JunctionRelay_Config";

// Global pointer for static handlers
static ConnectionManager* gConnMgr = nullptr;
static char tempPostBodyBuffer[2048];  // Fixed-size buffer
static size_t tempPostBodyLen = 0;     // Track actual length

// Initialize the static queues and task handles
QueueHandle_t ConnectionManager::sensorQueue = NULL;
TaskHandle_t ConnectionManager::sensorProcessingTaskHandle = NULL;
QueueHandle_t ConnectionManager::configQueue = NULL;
TaskHandle_t ConnectionManager::configProcessingTaskHandle = NULL;

ConnectionManager::ConnectionManager()
  : server(80),
    payloadLength(0),
    readingLength(true),
    bytesRead(0),
    connMode(""),
    screenRouter(nullptr),
    mqttManager(nullptr)
{
    gConnMgr = this;
    memset(prefixBuffer, 0, sizeof(prefixBuffer));
    memset(staticPayloadBuffer, 0, sizeof(staticPayloadBuffer));
    
    // Create the sensor queue if it doesn't exist
    if (sensorQueue == NULL) {
        sensorQueue = xQueueCreate(SENSOR_QUEUE_SIZE, sizeof(JsonDocument*));
        if (sensorQueue == NULL) {
            Serial.println("[ERROR] Failed to create sensor queue");
        } else {
            Serial.printf("[DEBUG] Created sensor queue (size %d)\n", SENSOR_QUEUE_SIZE);
            
            // Create a dedicated task for processing sensor updates
            xTaskCreatePinnedToCore(
                [](void* param) {
                    Serial.printf("[SensorProcessingTask] Started on core %d\n", xPortGetCoreID());
                    
                    for (;;) {
                        JsonDocument* doc = NULL;
                        
                        // Wait for a sensor update
                        if (xQueueReceive(sensorQueue, &doc, portMAX_DELAY) == pdTRUE) {
                            if (doc != NULL) {
                                // Serial.printf("[SensorProcessingTask] Processing sensor update\n");
                                // Serial.printf("[DEBUG][MEMORY] Before sensor processing - Free heap: %d\n", ESP.getFreeHeap());
                                
                                // Cast to StaticJsonDocument<8192> since that's what we're storing
                                StaticJsonDocument<8192>& staticDoc = *static_cast<StaticJsonDocument<8192>*>(doc);
                                
                                // Process the sensor data with the properly cast document
                                if (gConnMgr && gConnMgr->screenRouter) {
                                    gConnMgr->screenRouter->routeSensor(staticDoc);
                                }
                                
                                // Serial.printf("[DEBUG][MEMORY] After sensor processing - Free heap: %d\n", ESP.getFreeHeap());
                                
                                // Clean up
                                delete doc;
                            }
                        }
                    }
                },
                "SensorProcessing",
                8192,
                NULL,
                1,  // Priority
                &sensorProcessingTaskHandle,
                1   // Core 1
            );
        }
    }

    // Create the config queue if it doesn't exist
    if (configQueue == NULL) {
        configQueue = xQueueCreate(CONFIG_QUEUE_SIZE, sizeof(JsonDocument*));
        if (configQueue == NULL) {
            Serial.println("[ERROR] Failed to create config queue");
        } else {
            Serial.printf("[DEBUG] Created config queue (size %d)\n", CONFIG_QUEUE_SIZE);
            
            // Create a dedicated task for processing config updates
            xTaskCreatePinnedToCore(
                [](void* param) {
                    Serial.printf("[ConfigProcessingTask] Started on core %d\n", xPortGetCoreID());
                    
                    for (;;) {
                        JsonDocument* doc = NULL;
                        
                        // Wait for a config update
                        if (xQueueReceive(configQueue, &doc, portMAX_DELAY) == pdTRUE) {
                            if (doc != NULL) {
                                // Serial.printf("[ConfigProcessingTask] Processing config update\n");
                                // Serial.printf("[DEBUG][MEMORY] Before config processing - Free heap: %d\n", ESP.getFreeHeap());
                                
                                // Extract screenId
                                const char* screenId = (*doc)["screenId"];
                                
                                Serial.printf("[ConfigTask] 🔄 Starting config routing on core %d...\n", xPortGetCoreID());
                                
                                // Cast to StaticJsonDocument<8192> since that's what we're storing
                                StaticJsonDocument<8192>& staticDoc = *static_cast<StaticJsonDocument<8192>*>(doc);
                                
                                bool success = true;
                                
                                // Run layout logic (on core 1) with the properly cast document
                                try {
                                    if (gConnMgr) {
                                        gConnMgr->handleScreenId(screenId, staticDoc);
                                        if (gConnMgr->screenRouter) {
                                            gConnMgr->screenRouter->routeConfig(staticDoc);
                                        }
                                    }
                                } catch (...) {
                                    Serial.println("[ConfigTask] ❌ Exception during config routing.");
                                    success = false;
                                }
                                
                                if (!success && gConnMgr && gConnMgr->screenRouter) {
                                    Serial.println("[ConfigTask] ⚠️ Fallback to HOME layout.");
                                    DynamicJsonDocument fallback(128);
                                    gConnMgr->screenRouter->routeConfig(fallback);
                                }
                                
                                // Serial.printf("[DEBUG][MEMORY] After config processing - Free heap: %d\n", ESP.getFreeHeap());
                                
                                // Clean up
                                delete doc;
                                
                                Serial.println("[ConfigTask] ✅ Done.");
                            }
                        }
                    }
                },
                "ConfigProcessing",
                8192,
                NULL,
                1,  // Priority
                &configProcessingTaskHandle,
                1   // Core 1
            );
        }
    }
}

// Method #1: Replace with this implementation of init()
void ConnectionManager::init() {
    Serial.println("[ConnectionManager] Starting initialization...");
    
    Preferences p;
    p.begin("connConfig", false);
    connMode     = p.getString("connMode", "");
    ssid         = p.getString("ssid", "");
    pass         = p.getString("pass", "");
    mqttBroker   = p.getString("mqttBroker", "");
    mqttUserName = p.getString("mqttUsername", "");
    mqttPassword = p.getString("mqttPassword", "");
    p.end();
    
    Serial.println("[ConnectionManager] Preferences loaded");

    // 2️⃣ ESP-NOW?
    if (connMode == "espnow") {
        Serial.println("[init] Using ESP-NOW");
        WiFi.mode(WIFI_OFF);
        delay(100);
        if (esp_now_init() != ESP_OK) {
            Serial.println("[init] ESP-NOW init failed");
            return;
        }
        emitStatus();
        return;
    }

    // 3️⃣ Wi-Fi driver on Core 0 — blocking connect/remedies on Core 1
    Serial.println("[ConnectionManager] Setting up WiFi in STA mode");
    WiFi.mode(WIFI_STA);
    
    Serial.println("[ConnectionManager] Creating WiFi task...");
    xTaskCreatePinnedToCore(
        [](void *arg) {
            Serial.println("[WiFiTask] Task started");
            auto *cm = static_cast<ConnectionManager*>(arg);
            const char* s = cm->ssid.c_str();
            const char* p = cm->pass.c_str();

            for (;;) {
                if (WiFi.status() != WL_CONNECTED) {
                    Serial.println("[WiFiTask] Connecting to Wi-Fi…");
                    WiFi.begin(s, p);

                    uint32_t start = millis();
                    while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
                        vTaskDelay(500 / portTICK_PERIOD_MS);
                    }

                    if (WiFi.status() == WL_CONNECTED) {
                        Serial.print("[WiFiTask] Connected, IP=");
                        Serial.println(WiFi.localIP());
                        
                        // Setup mDNS when WiFi connects
                        String mac = getFormattedMacAddress();
                        String host = "JunctionRelay_Device_" + mac;
                        if (MDNS.begin(host.c_str())) {
                            MDNS.addService("junctionrelay", "tcp", 80);
                            Serial.printf("[WiFiTask] Started mDNS with hostname: %s\n", host.c_str());
                        } else {
                            Serial.println("[WiFiTask] Failed to start mDNS");
                        }
                    } else {
                        Serial.println("[WiFiTask] Failed, retry in 5s");
                    }
                    // Push updated status to UI
                    cm->emitStatus();
                }
                vTaskDelay(5000 / portTICK_PERIOD_MS);
            }
        },
        "WiFiTask",
        4096,
        this,
        1,
        nullptr,
        1
    );

    // 4️⃣ HTTP endpoints (non-blocking)
    server.on("/data", HTTP_POST,
        [](AsyncWebServerRequest* req){ req->send(200, "text/plain", "OK"); },
        nullptr,
        [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t) {
            if (gConnMgr) gConnMgr->handleIncomingDataChunkPrefix(data, len);
        }
    );

    server.on("/api/device/capabilities", HTTP_GET,
        [](AsyncWebServerRequest* req){
            req->send(200, "application/json", gConnMgr->getDeviceCapabilities());
        }
    );

    server.on("/api/device/info", HTTP_GET,
        [](AsyncWebServerRequest* req){
            req->send(200, "application/json", gConnMgr->getDeviceInfo());
        }
    );

    server.on("/api/device/preferences", HTTP_GET,
        [](AsyncWebServerRequest* req){
            req->send(200, "application/json", gConnMgr->getCurrentPreferences());
        }
    );

    // NEW: Add firmware hash endpoints here
    server.on("/firmware-hash", HTTP_GET,
        [](AsyncWebServerRequest* req){
            Serial.println("[ENDPOINT] Firmware hash requested");
            String response = getFirmwareInfoJson();
            req->send(200, "application/json", response);
        }
    );

    server.on("/hash", HTTP_GET,
    [](AsyncWebServerRequest* req){
        String hash = getFirmwareHash();
        req->send(200, "text/plain", hash);
    }
    );

    // Heartbeat 

    server.on("/heartbeat", HTTP_GET,
        [](AsyncWebServerRequest* req){
            Serial.println("[HEARTBEAT] Health check requested");
            
            // Create JSON response with device identification using utils
            String mac = getFormattedMacAddress();
            String response = "{";
            response += "\"status\":\"OK\",";
            response += "\"mac\":\"" + mac + "\",";
            response += "\"firmware\":\"" + String(getFirmwareVersion()) + "\",";
            response += "\"uptime\":" + String(millis()) + ",";
            response += "\"free_heap\":" + String(ESP.getFreeHeap());
            response += "}";
            
            Serial.printf("[HEARTBEAT] Responding with MAC: %s\n", mac.c_str());
            req->send(200, "application/json", response);
        }
    );

    server.on("/api/device/set-preferences", HTTP_POST,
        [](AsyncWebServerRequest* req){
            // This will be called after the body is received
            if (gConnMgr) gConnMgr->handleSetPreferences(req);
        },
        NULL, // No file upload handler
        [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total){
            // This is the body handler - it receives the raw POST data
            Serial.printf("[DEBUG] Body handler called: len=%d, index=%d, total=%d\n", len, index, total);
            
            // If this is the first chunk, reset the buffer
            if (index == 0) {
                tempPostBodyLen = 0;
                memset(tempPostBodyBuffer, 0, sizeof(tempPostBodyBuffer));
            }
            
            // Check for buffer overflow
            if (tempPostBodyLen + len >= sizeof(tempPostBodyBuffer)) {
                Serial.printf("[ERROR] POST body too large! Max size: %d\n", sizeof(tempPostBodyBuffer));
                return;
            }
            
            // Copy data directly to buffer (much faster than String concatenation)
            memcpy(tempPostBodyBuffer + tempPostBodyLen, data, len);
            tempPostBodyLen += len;
            
            // Null-terminate for safety
            tempPostBodyBuffer[tempPostBodyLen] = '\0';
            
            Serial.printf("[DEBUG] Total body length so far: %d\n", tempPostBodyLen);
        }
    );

    server.on("/api/ota/firmware", HTTP_POST,
        // onRequestComplete
        [](AsyncWebServerRequest* req) {
            bool ok = !Update.hasError();
            req->send(ok ? 200 : 500, "text/plain",
                    ok ? "Update OK" : String("FAIL: ") + Update.errorString());
            if (ok) {
                delay(2000);
                ESP.restart();
            }
        },
        // onUpload
        [](AsyncWebServerRequest* req, const String&, size_t idx,
        uint8_t* data, size_t len, bool final)
        {
            if (idx == 0) {
                Update.begin(UPDATE_SIZE_UNKNOWN);
            }
            Update.write(data, len);
            if (final) {
                Update.end(true);
            }
        }
    );

    server.begin();

    // 4️⃣.b ConnectionStatus JSON endpoint
    server.on("/api/connection/status", HTTP_GET, [](AsyncWebServerRequest *req){
        ConnectionStatus s = gConnMgr->getConnectionStatus();
        DynamicJsonDocument doc(256);
        doc["espNow"] = s.espNowActive;
        doc["wifiUp"] = s.wifiConnected;
        doc["mqttUp"] = s.mqttConnected;
        doc["ip"]     = s.ipAddress;
        doc["mac"]    = s.macAddress;
        String out;
        serializeJson(doc, out);
        req->send(200, "application/json", out);
    });

    // 5️⃣ MQTT task on Core 1
    if (!mqttBroker.isEmpty()) {
    // Extract host and port
    String host;
    uint16_t port = 1883;  // Default MQTT port if not specified
    
    Serial.printf("[MQTT] Raw broker string: '%s'\n", mqttBroker.c_str());
    
    int colonPos = mqttBroker.indexOf(':');
    if (colonPos >= 0) {
        host = mqttBroker.substring(0, colonPos);
        String portStr = mqttBroker.substring(colonPos + 1);
        portStr.trim();
        
        if (portStr.length() > 0) {
            int parsedPort = portStr.toInt();
            if (parsedPort > 0 && parsedPort <= 65535) {
                port = parsedPort;
            } else {
                Serial.printf("[MQTT] Invalid port '%s', using default 1883\n", portStr.c_str());
            }
        }
    } else {
        host = mqttBroker;  // No port specified, use just the host
    }
    
    // Trim host
    host.trim();
    
    Serial.printf("[MQTT] Extracted host: '%s', port: %d\n", host.c_str(), port);
    
    // Only create manager if we have a valid host
    if (!host.isEmpty()) {
        mqttManager = new Manager_MQTT(host.c_str(), port, this);
        
        xTaskCreatePinnedToCore(
    [](void* arg){
        auto *cm = static_cast<ConnectionManager*>(arg);
        unsigned long lastStatusCheck = 0;
        const unsigned long STATUS_CHECK_INTERVAL = 500; // 500ms between status checks
        
        for (;;) {
            unsigned long now = millis();
            bool shouldUpdateStatus = false;
            
            // Only attempt MQTT if WiFi is connected
            if (WiFi.status() == WL_CONNECTED) {
                if (!cm->mqttManager->connected()) {
                    Serial.println("[MQTTTask] Reconnecting…");
                    cm->mqttManager->begin();
                    shouldUpdateStatus = true; // Status definitely changed
                }
                // No loop() call needed - ESP-MQTT is event-driven
            } else {
                Serial.println("[MQTTTask] Waiting for WiFi...");
                shouldUpdateStatus = true; // Status changed (WiFi disconnected)
            }
            
            // Update status either on change or periodically
            if (shouldUpdateStatus || (now - lastStatusCheck >= STATUS_CHECK_INTERVAL)) {
                cm->emitStatus();
                lastStatusCheck = now;
            }
            
            // Simple delay - no need for different timing when connected
            vTaskDelay(1000 / portTICK_PERIOD_MS);  // Check every second
        }
    },
    "MQTTTask",
    8192,
    this,
    1,
    nullptr,
    1
);
    } else {
        Serial.println("[MQTT] Empty host after parsing, cannot create MQTT manager");
    }
} else {
    Serial.println("[MQTT] No broker configured, skipping MQTT setup");
}

    // 6️⃣ mDNS once STA is up (could also be inside WiFiTask)
    if (WiFi.status() == WL_CONNECTED) {
        String mac = getFormattedMacAddress();
        String host = "JunctionRelay_Device_" + mac;
        if (MDNS.begin(host.c_str())) {
            MDNS.addService("junctionrelay", "tcp", 80);
            Serial.printf("[init] Started mDNS with hostname: %s\n", host.c_str());
        } else {
            Serial.println("[init] Failed to start mDNS");
        }
    }

    // 👊 Push initial status to UI
    emitStatus();
}


void ConnectionManager::handleSerialData() {
    // Handle USB Serial (Serial Monitor) - use prefix parser
    if (Serial.available() > 0) {
        size_t len = Serial.available();
        uint8_t* buffer = new uint8_t[len];
        Serial.readBytes(buffer, len);
        if (gConnMgr) {
            gConnMgr->handleIncomingDataChunkPrefix(buffer, len);
        }
        delete[] buffer;
    }
    
    // Handle UART Serial (TX/RX pins) - use prefix parser
    if (Serial1.available() > 0) {
        size_t len = Serial1.available();
        uint8_t* buffer = new uint8_t[len];
        Serial1.readBytes(buffer, len);
        if (gConnMgr) {
            Serial.println("[DEBUG] Received data via UART TX/RX pins");
            gConnMgr->handleIncomingDataChunkPrefix(buffer, len);
        }
        delete[] buffer;
    }
}

#define MAX_PAYLOAD_SIZE 8192

void ConnectionManager::handleIncomingDataChunkPrefix(uint8_t *data, size_t len) {
    if (data == nullptr || len == 0) {
        return;  // Silent fail for empty data to reduce overhead
    }

    // Stage 1: Extract the 8-byte prefix (contains length of the payload)
    if (readingLength) {
        // Copy data directly into the buffer without using String operations
        size_t prefixCopyLen = min(len, (size_t)(8 - bytesRead));
        memcpy(prefixBuffer + bytesRead, data, prefixCopyLen);
        bytesRead += prefixCopyLen;
        
        // If we have the complete prefix (8 bytes)
        if (bytesRead >= 8) {
            // Null-terminate and convert to integer
            prefixBuffer[8] = '\0';
            payloadLength = atoi(prefixBuffer);
            
            // Safety check for payload size - avoid buffer overflows
            if (payloadLength <= 0 || payloadLength > MAX_PAYLOAD_SIZE) {
                Serial.printf("[ERROR] Invalid payload length: %d\n", payloadLength);
                readingLength = true;
                bytesRead = 0;
                return;
            }
            
            // Move to reading JSON data mode
            readingLength = false;
            bytesRead = 0;
            
            // Process any remaining data after the prefix
            if (prefixCopyLen < len) {
                size_t remainingLen = len - prefixCopyLen;
                // Copy directly to the static buffer
                memcpy(staticPayloadBuffer, data + prefixCopyLen, remainingLen);
                bytesRead += remainingLen;
            }
        }
    } 
    // Stage 2: Accumulate payload data (after extracting the prefix)
    else {
        // Copy data directly into the pre-allocated static buffer
        size_t remainingBytes = payloadLength - bytesRead;
        size_t copyLen = (len < remainingBytes) ? len : remainingBytes;
        
        memcpy(staticPayloadBuffer + bytesRead, data, copyLen);
        bytesRead += copyLen;
    }

    // Stage 3: When complete payload is received, process it
    if (!readingLength && bytesRead >= payloadLength) {
        // Now that we have the complete payload, pass it to handleIncomingDataChunk
        handleIncomingDataChunk(staticPayloadBuffer, payloadLength);
        
        // Reset for next message
        readingLength = true;
        bytesRead = 0;
        payloadLength = 0;
    }
}

void ConnectionManager::handleIncomingDataChunk(uint8_t *data, size_t len) {
    if (data == nullptr || len == 0) return;

    // Use static allocation for speed - increased size to 8192
    StaticJsonDocument<8192> doc;
    DeserializationError error = deserializeJson(doc, (const char*)data, len);

    if (error) {
        Serial.printf("[ERROR] deserializeJson() failed: %s\n", error.c_str());
        return;
    }

    // Extract the type field from the JSON
    const char* type = doc["type"];
    if (!type) {
        // No type field - just return
        return;
    }

    if (strcmp(type, "sensor") == 0 && screenRouter) {
        // Deep copy with increased size to 8192
        auto* docCopy = new StaticJsonDocument<8192>(doc);
        offloadSensor(docCopy);  // run on core 1
    }

    else if (strcmp(type, "config") == 0 && screenRouter) {
        // Allocate copy for task with increased size to 8192
        auto* docCopy = new StaticJsonDocument<8192>(doc);
        offloadConfig(docCopy);  // Pinned to core 1
    }

    else if (strcmp(type, "MQTT_Subscription_Request") == 0) {
        if (doc.containsKey("subscriptions") && doc["subscriptions"].is<JsonArray>()) {
            JsonArray subs = doc["subscriptions"];
            int subCount = 0;
            for (JsonVariant t : subs) {
                if (t.is<const char*>()) {
                    const char* topic = t.as<const char*>(); 
                    if (mqttManager) {
                        mqttManager->subscribe(topic);
                        subCount++;
                    }
                }
            }
            Serial.printf("[MQTT] 📡 Subscribed to %d MQTT topic(s)\n", subCount);
        }
    }
}

void ConnectionManager::offloadConfig(JsonDocument* doc) {
    // Ensure we're using StaticJsonDocument in the queue by creating a new copy
    auto* staticDoc = new StaticJsonDocument<8192>();
    staticDoc->set(*doc);  // Copy content from the original document
    delete doc;  // Clean up the original document
    
    if (configQueue == NULL) {
        Serial.println("[ERROR] Config queue not initialized, dropping update");
        delete staticDoc;  // Don't forget to clean up if we can't queue it
        return;
    }
    
    // Queue the static document instead
    if (xQueueSend(configQueue, &staticDoc, 0) != pdTRUE) {
        Serial.println("[WARNING] Config queue full, dropping update");
        delete staticDoc;  // Clean up if we can't add to queue
    } else {
        Serial.println("[DEBUG] Config update queued for processing");
    }
}

void ConnectionManager::offloadSensor(JsonDocument* doc) {
    // Ensure we're using StaticJsonDocument in the queue by creating a new copy
    auto* staticDoc = new StaticJsonDocument<8192>();
    staticDoc->set(*doc);  // Copy content from the original document
    delete doc;  // Clean up the original document
    
    if (sensorQueue == NULL) {
        Serial.println("[ERROR] Sensor queue not initialized, dropping update");
        delete staticDoc;  // Don't forget to clean up if we can't queue it
        return;
    }
    
    // Queue the static document instead
    if (xQueueSend(sensorQueue, &staticDoc, 0) != pdTRUE) {
        Serial.println("[WARNING] Sensor queue full, dropping update");
        delete staticDoc;  // Clean up if we can't add to queue
    } else {
        // Serial.println("[DEBUG] Sensor update queued for processing");
    }
}

void ConnectionManager::handleScreenId(const char* screenId, const StaticJsonDocument<8192>& doc) {
    if (screenId) {
        // Debug: Log the current screenId being processed
        Serial.printf("[ConnectionManager] Processing screenId: '%s'\n", screenId);

        // Handle Quad display initialization
        if (doc.containsKey("quad")) {
            Serial.println("[ConnectionManager] Handling Quad display...");

            if (quadDisplays.find(screenId) == quadDisplays.end()) {
                // Parse "0x70" to 112
                uint8_t i2cAddress = strtol(screenId, nullptr, 0);  
                
                // Get the correct Wire interface from the device
                TwoWire* wireInterface = devicePtr->getI2CInterface();
                
                // Get the singleton instance with the correct Wire interface
                Manager_QuadDisplay* quadDisplay = Manager_QuadDisplay::getInstance(wireInterface);
                screenRouter->registerScreen(quadDisplay);
                quadDisplays[screenId] = quadDisplay;

                Serial.printf("[ConnectionManager] 🔧 Registered Quad display at %s (I2C 0x%02X) using %s\n", 
                             screenId, i2cAddress, 
                             (wireInterface == &Wire1) ? "Wire1" : "Wire");
            } else {
                Serial.printf("[ConnectionManager] ✅ Quad display for screenId '%s' already registered\n", screenId);
            }
        }

        // Handle NeoPixel display
        else if (doc.containsKey("neopixel")) {
            Serial.println("[ConnectionManager] Handling NeoPixel display...");

            // Ensure the device supports the NeoPixel display before adding to the map
            if (devicePtr->hasExternalNeopixels()) {  // Only proceed if the device supports NeoPixels
                if (neopixelDisplays.find(screenId) == neopixelDisplays.end()) {
                    // If the screenId doesn't exist, access the singleton instance
                    Manager_NeoPixels* neopixelDisplay = Manager_NeoPixels::getInstance();
                    neopixelDisplays[screenId] = neopixelDisplay;  // Add to map
                    Serial.printf("[ConnectionManager] 🔧 Added NeoPixel display for screenId '%s' to the map.\n", screenId);
                } else {
                    Serial.printf("[ConnectionManager] ✅ NeoPixel display for screenId '%s' already registered\n", screenId);
                }

                // Register the existing NeoPixel display with the screenRouter
                if (neopixelDisplays[screenId] != nullptr) {
                    screenRouter->registerScreen(neopixelDisplays[screenId]);  // Register the existing NeoPixel display with screenRouter
                    const char* displayTextContent = doc.containsKey("text") ? doc["text"].as<const char*>() : "";
                    Serial.printf("[ConnectionManager] Using existing NeoPixel display for screenId '%s': %s\n", screenId, displayTextContent);
                }
            } else {
                Serial.printf("[ERROR] NeoPixel display not supported for screenId '%s'. Skipping.\n", screenId);
            }
        }
        // Handle MATRIX display
        else if (doc.containsKey("matrix")) {
            Serial.println("[ConnectionManager] Handling Matrix display...");

            // Ensure the device supports the matrix display before adding to the map
            if (devicePtr->hasExternalMatrix()) {  // Only proceed if the device supports the matrix
                if (matrixDisplays.find(screenId) == matrixDisplays.end()) {
                    // Get the singleton instance
                    Manager_Matrix* matrixDisplay = Manager_Matrix::getInstance();
                    matrixDisplays[screenId] = matrixDisplay;  // Add to map

                    Serial.printf("[ConnectionManager] 🔧 Added Matrix display for screenId '%s' to the map.\n", screenId);
                } else {
                    Serial.printf("[ConnectionManager] ✅ Matrix display for screenId '%s' already registered\n", screenId);
                }

                // Register the existing matrix display with the screenRouter
                if (matrixDisplays[screenId] != nullptr) {
                    screenRouter->registerScreen(matrixDisplays[screenId]);  // Register the existing matrix display with screenRouter
                    const char* displayTextContent = doc.containsKey("text") ? doc["text"].as<const char*>() : "";
                    matrixDisplays[screenId]->displayText(displayTextContent, 0, 0);  // Default position at (0, 0)
                    Serial.printf("[ConnectionManager] Displayed text on existing Matrix screenId '%s': %s\n", screenId, displayTextContent);
                }
            } else {
                Serial.printf("[ERROR] Matrix display not supported for screenId '%s'. Skipping.\n", screenId);
            }
        }
    }
}

String ConnectionManager::getDeviceInfo() {
    // Create a JSON document for device info
    StaticJsonDocument<512> doc;

    // Add device information as key-value pairs
    doc["deviceModel"] = devicePtr->getDeviceModel();
    doc["deviceManufacturer"] = devicePtr->getDeviceManufacturer();
    doc["firmwareVersion"] = devicePtr->getFirmwareVersion();
    doc["customFirmware"] = devicePtr->getCustomFirmware();
    doc["mcu"] = devicePtr->getMCU();
    doc["wirelessConnectivity"] = devicePtr->getWirelessConnectivity();
    doc["flash"] = devicePtr->getFlash();
    doc["psram"] = devicePtr->getPSRAM();
    doc["uniqueIdentifier"] = devicePtr->getUniqueIdentifier(); // Unique identifier

    // Serialize JSON and return it as a string
    String output;
    serializeJson(doc, output);
    return output;
}

String ConnectionManager::getDeviceCapabilities() {
    // Create a JSON document for device capabilities
    StaticJsonDocument<2048> doc;

    // Add basic capabilities as key-value pairs, directly from devicePtr
    doc["HasOnboardScreen"] = devicePtr->hasOnboardScreen();
    doc["HasOnboardLED"] = devicePtr->hasOnboardLED();
    doc["HasOnboardRGBLED"] = devicePtr->hasOnboardRGBLED();
    doc["HasExternalMatrix"] = devicePtr->hasExternalMatrix();
    doc["HasExternalNeopixels"] = devicePtr->hasExternalNeopixels();
    doc["HasExternalI2CDevices"] = devicePtr->hasExternalI2CDevices();
    doc["HasButtons"] = devicePtr->hasButtons();
    doc["HasBattery"] = devicePtr->hasBattery();
    doc["SupportsWiFi"] = devicePtr->supportsWiFi();
    doc["SupportsBLE"] = devicePtr->supportsBLE();
    doc["SupportsUSB"] = devicePtr->supportsUSB();
    doc["SupportsESPNow"] = devicePtr->supportsESPNow();
    doc["SupportsHTTP"] = devicePtr->supportsHTTP();
    doc["SupportsMQTT"] = devicePtr->supportsMQTT();
    doc["SupportsWebSockets"] = devicePtr->supportsWebSockets();
    doc["HasSpeaker"] = devicePtr->hasSpeaker();
    doc["HasMicroSD"] = devicePtr->hasMicroSD();
    doc["IsGateway"] = devicePtr->isGateway();

    // Add screens to the payload if necessary
    JsonArray screens = doc.createNestedArray("Screens");

    // Add onboard screen if present
    if (devicePtr->hasOnboardScreen()) {
        JsonObject onboardScreen = screens.createNestedObject();
        onboardScreen["ScreenKey"] = "onboard";
        onboardScreen["DisplayName"] = "Onboard Display";
        onboardScreen["ScreenType"] = "TFT";  // You can customize this based on your actual screen type
        onboardScreen["SupportsConfigPayloads"] = true;
        onboardScreen["SupportsSensorPayloads"] = true;
    }

    // Add external matrix screen if present
    if (devicePtr->hasExternalMatrix()) {
        JsonObject matrixScreen = screens.createNestedObject();
        matrixScreen["ScreenKey"] = "matrix";
        matrixScreen["DisplayName"] = "External Matrix";
        matrixScreen["ScreenType"] = "matrix";
        matrixScreen["SupportsConfigPayloads"] = true;
        matrixScreen["SupportsSensorPayloads"] = true;
    }

    // Add external NeoPixel screen if present
    if (devicePtr->hasExternalNeopixels()) {
        JsonObject neopixelScreen = screens.createNestedObject();
        neopixelScreen["ScreenKey"] = "neopixel";
        neopixelScreen["DisplayName"] = "External NeoPixel";
        neopixelScreen["ScreenType"] = "NeoPixel";
        neopixelScreen["SupportsConfigPayloads"] = true;
        neopixelScreen["SupportsSensorPayloads"] = true;
    }

    // If the device has external I2C devices, get the details from the device
    if (devicePtr->hasExternalI2CDevices()) {
        // Call performI2CScan() and pass the document as a reference
        String i2cScanResult = devicePtr->performI2CScan(doc);
        Serial.print("[DEBUG] I2C scan result: ");
        Serial.println(i2cScanResult);
    }

    // Serialize JSON and return it as a string
    String output;
    serializeJson(doc, output);
    return output;
}


String ConnectionManager::getCurrentPreferences() {
    Preferences p;
    p.begin("connConfig", false);

    DynamicJsonDocument doc(1024);  // Increased size for new fields
    doc["connMode"]      = p.getString("connMode", "");
    doc["wifiSSID"]      = p.getString("ssid", "");
    doc["wifiPassword"]  = p.getString("pass", "");
    doc["mqttBroker"]    = p.getString("mqttBroker", "");
    doc["mqttUsername"]  = p.getString("mqttUsername", "");
    doc["mqttPassword"]  = p.getString("mqttPassword", "");
    doc["rotation"]      = p.getInt("rotation", 0);
    doc["swapBlueGreen"] = p.getBool("swapBlueGreen", false);

    p.end();

    // Load NeoPixel preferences from separate namespace
    if (devicePtr && devicePtr->hasExternalNeopixels()) {
        p.begin("neopixelConfig", true); // Read-only
        doc["externalNeoPixelsData1"] = p.getInt("neoPin1", 35);  // Default to pin 35
        doc["externalNeoPixelsData2"] = p.getInt("neoPin2", 0);   // Default to pin 0 (stub)
        p.end();
    }

    String out;
    serializeJson(doc, out);
    return out;
}

void ConnectionManager::handleSetPreferences(AsyncWebServerRequest *request) {
    Serial.println("[DEBUG] handleSetPreferences called");
    
    // Use the buffer stored by the body handler
    if (tempPostBodyLen == 0) {
        Serial.println("[DEBUG] No body data found - JSON body required");
        request->send(400, "application/json", "{\"success\":false,\"message\":\"JSON body required\"}");
        return;
    }
    
    Serial.printf("[DEBUG] Received body length: %d\n", tempPostBodyLen);
    Serial.printf("[DEBUG] Received body: %s\n", tempPostBodyBuffer);
    
    // Parse JSON directly from the buffer (no String copying!)
    DynamicJsonDocument doc(2048);
    
    Serial.println("[DEBUG] About to parse JSON...");
    DeserializationError error = deserializeJson(doc, tempPostBodyBuffer, tempPostBodyLen);
    if (error) {
        Serial.printf("[DEBUG] JSON parsing failed: %s\n", error.c_str());
        request->send(400, "application/json", "{\"success\":false,\"message\":\"Invalid JSON\"}");
        return;
    }
    
    Serial.println("[DEBUG] JSON parsed successfully");
    
    // Clear the buffer after processing
    tempPostBodyLen = 0;
    memset(tempPostBodyBuffer, 0, sizeof(tempPostBodyBuffer));
    
    // Print the parsed JSON for debugging
    Serial.println("[DEBUG] Parsed JSON contents:");
    serializeJsonPretty(doc, Serial);
    Serial.println();
    
    // Default values - use current values as defaults
    String wifiSSID     = this->ssid;
    String wifiPassword = this->pass;
    String mqttBroker   = this->mqttBroker;
    String mqttUsername = this->mqttUserName;
    String mqttPassword = this->mqttPassword;
    String connMode     = this->connMode;
    int    rotation     = 0;
    bool   swapBlueGreen = false;
    int    neoPin1      = 35;  // Default pin values
    int    neoPin2      = 0;
    bool   shouldRestart = false;

    // Load current values from preferences
    Preferences p;
    p.begin("connConfig", false);
    rotation = p.getInt("rotation", 0);
    swapBlueGreen = p.getBool("swapBlueGreen", false);
    if (this->ssid.isEmpty())         wifiSSID       = p.getString("ssid", "");
    if (this->pass.isEmpty())         wifiPassword   = p.getString("pass", "");
    if (this->mqttBroker.isEmpty())   mqttBroker     = p.getString("mqttBroker", "");
    if (this->mqttUserName.isEmpty()) mqttUsername   = p.getString("mqttUsername", "");
    if (this->mqttPassword.isEmpty()) mqttPassword   = p.getString("mqttPassword", "");
    if (this->connMode.isEmpty())     connMode       = p.getString("connMode", "");
    p.end();

    Serial.println("[DEBUG] Loaded current preferences from storage");

    // Load current NeoPixel preferences
    if (devicePtr && devicePtr->hasExternalNeopixels()) {
        p.begin("neopixelConfig", true);
        neoPin1 = p.getInt("neoPin1", 35);
        neoPin2 = p.getInt("neoPin2", 0);
        p.end();
        Serial.println("[DEBUG] Loaded NeoPixel preferences");
    }

    // Update values from JSON if provided
    if (doc.containsKey("wifiSSID")) {
        String newSSID = doc["wifiSSID"].as<String>();
        Serial.printf("[DEBUG] Processing wifiSSID: %s\n", newSSID.c_str());
        if (newSSID != wifiSSID) {
            wifiSSID = newSSID;
            shouldRestart = true;
        }
    }
    if (doc.containsKey("wifiPassword")) {
        String newPass = doc["wifiPassword"].as<String>();
        Serial.printf("[DEBUG] Processing wifiPassword (length: %d)\n", newPass.length());
        if (newPass != wifiPassword) {
            wifiPassword = newPass;
            shouldRestart = true;
        }
    }
    if (doc.containsKey("mqttBroker")) {
        String newBroker = doc["mqttBroker"].as<String>();
        Serial.printf("[DEBUG] Processing mqttBroker: %s\n", newBroker.c_str());
        if (newBroker != mqttBroker) {
            mqttBroker = newBroker;
        }
    }
    if (doc.containsKey("mqttUsername")) {
        String newUsername = doc["mqttUsername"].as<String>();
        Serial.printf("[DEBUG] Processing mqttUsername: %s\n", newUsername.c_str());
        if (newUsername != mqttUsername) {
            mqttUsername = newUsername;
        }
    }
    if (doc.containsKey("mqttPassword")) {
        String newPassword = doc["mqttPassword"].as<String>();
        Serial.printf("[DEBUG] Processing mqttPassword (length: %d)\n", newPassword.length());
        if (newPassword != mqttPassword) {
            mqttPassword = newPassword;
        }
    }
    if (doc.containsKey("connMode")) {
        String newConnMode = doc["connMode"].as<String>();
        Serial.printf("[DEBUG] Processing connMode: %s\n", newConnMode.c_str());
        if (newConnMode != connMode) {
            connMode = newConnMode;
            shouldRestart = true;
        }
    }
    if (doc.containsKey("rotation")) {
        int newRotation = doc["rotation"].as<int>();
        Serial.printf("[DEBUG] Processing rotation: %d\n", newRotation);
        if (newRotation >= 0 && newRotation <= 3) {
            if (newRotation != rotation) {
                rotation = newRotation;
            }
        }
    }
    if (doc.containsKey("swapBlueGreen")) {
        bool newSwapBlueGreen = doc["swapBlueGreen"].as<bool>();
        Serial.printf("[DEBUG] Processing swapBlueGreen: %s\n", newSwapBlueGreen ? "true" : "false");
        if (newSwapBlueGreen != swapBlueGreen) {
            swapBlueGreen = newSwapBlueGreen;
        }
    }

    // Handle NeoPixel pin preferences
    bool neoPixelPinsChanged = false;
    if (devicePtr && devicePtr->hasExternalNeopixels()) {
        if (doc.containsKey("externalNeoPixelsData1")) {
            int newPin1 = parsePinValue(doc["externalNeoPixelsData1"]);
            Serial.printf("[DEBUG] Processing externalNeoPixelsData1: %d\n", newPin1);
            if (newPin1 >= 0 && newPin1 <= 40 && newPin1 != neoPin1) {
                neoPin1 = newPin1;
                neoPixelPinsChanged = true;
                Serial.printf("[DEBUG] NeoPixel Pin 1 updated to: %d\n", neoPin1);
            }
        }
        if (doc.containsKey("externalNeoPixelsData2")) {
            int newPin2 = parsePinValue(doc["externalNeoPixelsData2"]);
            Serial.printf("[DEBUG] Processing externalNeoPixelsData2: %d\n", newPin2);
            if (newPin2 >= 0 && newPin2 <= 40 && newPin2 != neoPin2) {
                neoPin2 = newPin2;
                neoPixelPinsChanged = true;
                Serial.printf("[DEBUG] NeoPixel Pin 2 updated to: %d\n", neoPin2);
            }
        }
    }

    if (doc.containsKey("restart")) {
        shouldRestart = doc["restart"].as<bool>();
        Serial.printf("[DEBUG] Processing restart flag: %s\n", shouldRestart ? "true" : "false");
    }

    Serial.println("[DEBUG] About to save preferences...");

    // Debug log
    Serial.printf("[DEBUG] Preferences Submitted: connMode=%s, ssid=%s, broker=%s, user=%s, rotation=%d, swap=%s, neoPin1=%d, neoPin2=%d, restart=%s\n",
                  connMode.c_str(), wifiSSID.c_str(), mqttBroker.c_str(),
                  mqttUsername.c_str(), rotation, swapBlueGreen ? "true" : "false",
                  neoPin1, neoPin2, shouldRestart ? "yes" : "no");

    // Save the connection configuration
    p.begin("connConfig", false);
    p.putString("connMode",     connMode);
    p.putString("ssid",         wifiSSID);
    p.putString("pass",         wifiPassword);
    p.putString("mqttBroker",   mqttBroker);
    p.putString("mqttUsername", mqttUsername);
    p.putString("mqttPassword", mqttPassword);
    p.putInt("rotation",        rotation);
    p.putBool("swapBlueGreen",  swapBlueGreen);
    p.end();

    Serial.println("[DEBUG] Saved connection configuration");

    // Save NeoPixel preferences to separate namespace
    if (devicePtr && devicePtr->hasExternalNeopixels() && neoPixelPinsChanged) {
        p.begin("neopixelConfig", false);
        p.putInt("neoPin1", neoPin1);
        p.putInt("neoPin2", neoPin2);
        p.end();

        // Update the device's pin configuration
        devicePtr->setNeoPixelPin(neoPin1, 0);
        devicePtr->setNeoPixelPin(neoPin2, 1);

        Serial.println("[DEBUG] NeoPixel pin preferences saved");
        
        // NeoPixel pin changes require restart to reinitialize the manager
        shouldRestart = true;
    }

    // Update members
    this->connMode     = connMode;
    this->ssid         = wifiSSID;
    this->pass         = wifiPassword;
    this->mqttBroker   = mqttBroker;
    this->mqttUserName = mqttUsername;
    this->mqttPassword = mqttPassword;

    Serial.println("[DEBUG] Updated member variables");

    // Build response
    StaticJsonDocument<512> resp;
    resp["success"] = true;
    resp["message"] = "Preferences saved successfully";
    JsonObject s = resp.createNestedObject("settings");
    s["connMode"]   = connMode;
    s["wifiSSID"]   = wifiSSID;
    s["mqttBroker"] = mqttBroker;
    s["mqttUsername"] = mqttUsername;
    s["rotation"]   = rotation;
    s["swapBlueGreen"] = swapBlueGreen;
    if (devicePtr && devicePtr->hasExternalNeopixels()) {
        s["externalNeoPixelsData1"] = neoPin1;
        s["externalNeoPixelsData2"] = neoPin2;
    }
    
    if (shouldRestart) {
        resp["restart"] = true;
        resp["message"] = "Preferences saved. Device will restart.";
    }

    String out;
    serializeJson(resp, out);
    
    Serial.printf("[DEBUG] Sending response: %s\n", out.c_str());
    request->send(200, "application/json", out);

    if (shouldRestart) {
        Serial.println("[DEBUG] Device will restart in 1 second...");
        delay(1000);
        ESP.restart();
    }
    
    Serial.println("[DEBUG] handleSetPreferences completed successfully");
}

int ConnectionManager::parsePinValue(JsonVariant pinValue) {
    if (pinValue.is<int>()) {
        // Direct numeric value (e.g., 35)
        return pinValue.as<int>();
    } else if (pinValue.is<const char*>()) {
        // String value - could be "A1", "35", etc.
        String pinStr = String(pinValue.as<const char*>());
        pinStr.toUpperCase();  // Convert to uppercase for consistency
        
        // Check if it's an analog pin constant
        if (pinStr == "A0") return A0;
        if (pinStr == "A1") return A1;
        if (pinStr == "A2") return A2;
        if (pinStr == "A3") return A3;
        if (pinStr == "A4") return A4;
        if (pinStr == "A5") return A5;
        if (pinStr == "A6") return A6;
        if (pinStr == "A7") return A7;
        
        // Otherwise treat as numeric string
        return pinStr.toInt();
    }
    
    Serial.println("[WARNING] Invalid pin value, using 0");
    return 0;
}

void ConnectionManager::connectToWiFi() {
    if (ssid == "") {
        Serial.println("[ERROR] No WiFi credentials stored.");
        return;
    }

    WiFi.begin(ssid.c_str(), pass.c_str());
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.print("[DEBUG] Connected to WiFi. IP address: ");
        Serial.println(WiFi.localIP());

        // Use the utility function to get the correctly formatted MAC address
        String macStr = getFormattedMacAddress();  // Call the helper function

        String updatedStatus = "Connected to WiFi\nIP: " + WiFi.localIP().toString() + "\nMAC: " + macStr;
        
        // Setup mDNS - using the simple approach that worked before
        String host = "JunctionRelay_Device_" + macStr;
        if (MDNS.begin(host.c_str())) {
            MDNS.addService("junctionrelay", "tcp", 80);
            Serial.printf("[DEBUG] Started mDNS with hostname: %s\n", host.c_str());
        } else {
            Serial.println("[DEBUG] Failed to start mDNS");
        }
        
        emitStatus();
    } else {
        Serial.println();
        Serial.println("[ERROR] Failed to connect to WiFi.");
        startCaptivePortal();
    }
}

void ConnectionManager::setupMDNS() {
    // Only try to set up mDNS if WiFi is connected
    if (WiFi.status() == WL_CONNECTED) {
        String mac = getFormattedMacAddress();
        String host = "JunctionRelay_Device_" + mac;
        
        // Simple initialization - this worked in the original code
        if (MDNS.begin(host.c_str())) {
            MDNS.addService("junctionrelay", "tcp", 80);
            Serial.printf("[mDNS] Started with hostname: %s\n", host.c_str());
        } else {
            Serial.println("[mDNS] Failed to start mDNS responder");
        }
    } else {
        Serial.println("[mDNS] WiFi not connected, cannot start mDNS");
    }
}

bool ConnectionManager::isMqttConnected() {
    if (mqttManager != nullptr) {  // Check if mqttManager is initialized
        // Print detailed connection state for debugging
        if (mqttManager->connected()) {
            // Serial.println("[DEBUG] MQTT is connected.");
        }
        return mqttManager->connected();  // Check the connection status via the Manager
    } else {
        // If mqttManager is null, we can't check connection, print an error
        Serial.println("[ERROR] MQTT Manager is not initialized!");
        return false;  // Return false if mqttManager is not initialized
    }
}

// Return a snapshot of all three layers
ConnectionStatus ConnectionManager::getConnectionStatus() const {
    ConnectionStatus s{};
    s.espNowActive  = (connMode == "espnow");
    s.wifiConnected = (WiFi.status() == WL_CONNECTED);
    s.mqttConnected = (mqttManager && mqttManager->connected());
    if (s.wifiConnected) {
        s.ipAddress  = WiFi.localIP().toString();
        s.macAddress = getFormattedMacAddress();
    }
    return s;
}

// Push that snapshot to the UI callback
void ConnectionManager::emitStatus() {
    if (statusUpdateCallback) {
        statusUpdateCallback(getConnectionStatus());
    }
}

// Update the setter
void ConnectionManager::setStatusUpdateCallback(StatusCb cb) {
  statusUpdateCallback = cb;
}

void ConnectionManager::startCaptivePortal() {
    Serial.println("Starting captive portal...");
    // Pass a prefix to the captive portal manager to form the SSID
    captivePortalManager.begin("JunctionRelay_Config_");
}