#include "Helper_HTTPEndpoints.h"
#include "Helper_StreamProcessor.h"
#include "Helper_DeviceInfo.h"
#include "Helper_DeviceCapabilities.h"
#include "Manager_ScreenRouter.h"
#include "Helper_Utils.h"
#include <Preferences.h>
#include <nvs_flash.h>
#include <Update.h>

// Initialize static buffers
char Helper_HTTPEndpoints::tempPostBodyBuffer[2048];
size_t Helper_HTTPEndpoints::tempPostBodyLen = 0;

Helper_HTTPEndpoints::Helper_HTTPEndpoints(ScreenRouter* router, Helper_StreamProcessor* processor,
                                         Helper_DeviceInfo* devInfo, Helper_DeviceCapabilities* devCaps)
    : screenRouter(router),
      streamProcessor(processor),
      httpChunkProcessor(nullptr),
      otaHelper(nullptr),
      deviceInfo(devInfo),
      deviceCapabilities(devCaps),
      server(80),
      serverRunning(false)
{
    // Create OTA helper
    otaHelper = new Helper_OTA();
    Serial.println("[Helper_HTTPEndpoints] OTA helper created");
}

Helper_HTTPEndpoints::~Helper_HTTPEndpoints() {
    if (serverRunning) {
        stopServer();
    }
    if (httpChunkProcessor) {  
        delete httpChunkProcessor;
        httpChunkProcessor = nullptr;
    }
    if (otaHelper) {
        delete otaHelper;
        otaHelper = nullptr;
    }
    Serial.println("[Helper_HTTPEndpoints] Destructor called");
}

void Helper_HTTPEndpoints::setDeviceHelpers(Helper_DeviceInfo* devInfo, Helper_DeviceCapabilities* devCaps) {
    deviceInfo = devInfo;
    deviceCapabilities = devCaps;
    Serial.println("[Helper_HTTPEndpoints] Device helpers set");
}

void Helper_HTTPEndpoints::init() {
    if (!screenRouter || !streamProcessor) {
        Serial.println("[Helper_HTTPEndpoints] ERROR: Missing required dependencies");
        return;
    }

    // Setup all endpoint categories
    setupDataEndpoints();
    setupStatusEndpoints();
    setupDeviceEndpoints();
    setupSystemEndpoints();
    setupGatewayEndpoints();
    setupFirmwareEndpoints();

    Serial.println("[Helper_HTTPEndpoints] ✅ HTTP endpoints configured");
}

void Helper_HTTPEndpoints::startServer() {
    if (!serverRunning) {
        server.begin();
        serverRunning = true;
        Serial.println("[Helper_HTTPEndpoints] ✅ HTTP server started on port 80");
    }
}

void Helper_HTTPEndpoints::stopServer() {
    if (serverRunning) {
        server.end();
        serverRunning = false;
        Serial.println("[Helper_HTTPEndpoints] HTTP server stopped");
    }
}

// ==========================================
// ENDPOINT SETUP METHODS
// ==========================================

void Helper_HTTPEndpoints::setupDataEndpoints() {
    // Main data endpoint - accepts JSON and binary data
    server.on("/api/data", HTTP_POST,
        [](AsyncWebServerRequest* req){ 
            // DO NOTHING - response will be sent after body processing
        },
        nullptr,
        [this](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
            this->handleDataPost(req, data, len, index, total);
        }
    );
}

void Helper_HTTPEndpoints::setupStatusEndpoints() {
    // Connection status
    server.on("/api/connection/status", HTTP_GET, 
        [this](AsyncWebServerRequest* req) {
            this->handleConnectionStatus(req);
        }
    );

    // Health check endpoint
    server.on("/api/health/heartbeat", HTTP_GET,
        [this](AsyncWebServerRequest* req) {
            this->handleHeartbeat(req);
        }
    );
}

void Helper_HTTPEndpoints::setupDeviceEndpoints() {
    // Device info endpoint
    server.on("/api/device/info", HTTP_GET,
        [this](AsyncWebServerRequest* req) {
            this->handleDeviceInfo(req);
        }
    );

    // Device capabilities endpoint
    server.on("/api/device/capabilities", HTTP_GET,
        [this](AsyncWebServerRequest* req) {
            this->handleDeviceCapabilities(req);
        }
    );

    // Device preferences
    server.on("/api/device/set-preferences", HTTP_POST,
        [this](AsyncWebServerRequest* req) {
            // Response handled in body handler
        },
        nullptr,
        [this](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
            this->handleSetPreferences(req, data, len, index, total);
        }
    );

    // Device wipe
    server.on("/api/device/wipe", HTTP_POST,
        [this](AsyncWebServerRequest* req) {
            this->handleDeviceWipe(req);
        }
    );
}

void Helper_HTTPEndpoints::setupSystemEndpoints() {
    // System statistics
    server.on("/api/system/stats", HTTP_GET,
        [this](AsyncWebServerRequest* req) {
            this->handleSystemStats(req);
        }
    );

    // Lightweight system statistics
    server.on("/api/system/statslite", HTTP_GET,
        [this](AsyncWebServerRequest* req) {
            this->handleSystemStatsLite(req);
        }
    );
}

void Helper_HTTPEndpoints::setupGatewayEndpoints() {
    // Gateway status
    server.on("/api/gateway/status", HTTP_GET,
        [this](AsyncWebServerRequest* req) {
            this->handleGatewayStatus(req);
        }
    );
}

void Helper_HTTPEndpoints::setupFirmwareEndpoints() {
    // Firmware information
    server.on("/api/firmware/hash", HTTP_GET,
        [this](AsyncWebServerRequest* req) {
            this->handleFirmwareHash(req);
        }
    );

    // OTA partition information
    server.on("/api/firmware/partition", HTTP_GET,
        [this](AsyncWebServerRequest* req) {
            this->handleOTAPartitionInfo(req);
        }
    );

    // Enhanced OTA firmware update with proper size validation
    server.on("/api/firmware/update", HTTP_POST,
        [this](AsyncWebServerRequest* req) {
            this->handleOTAComplete(req);
        },
        [this](AsyncWebServerRequest* req, const String& filename, size_t index,
               uint8_t* data, size_t len, bool final) {
            this->handleOTAUpload(req, filename, index, data, len, final);
        }
    );

    // OTA status endpoint
    server.on("/api/firmware/status", HTTP_GET,
        [this](AsyncWebServerRequest* req) {
            this->handleOTAStatus(req);
        }
    );

    // OTA verification endpoint
    server.on("/api/firmware/verify", HTTP_POST,
        [this](AsyncWebServerRequest* req) {
            this->handleOTAVerify(req);
        }
    );
}

// ==========================================
// ENDPOINT HANDLERS
// ==========================================

void Helper_HTTPEndpoints::handleDataPost(AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
    if (!streamProcessor) {
        Serial.println("[Helper_HTTPEndpoints] ERROR: StreamProcessor not available");
        if (index + len == total) {
            req->send(500, "text/plain", "StreamProcessor not available");
        }
        return;
    }

    // Create HTTP chunk processor on first use
    if (!httpChunkProcessor) {
        httpChunkProcessor = new Helper_HTTPChunkProcessor(streamProcessor);
        Serial.println("[Helper_HTTPEndpoints] Created HTTP chunk processor");
    }

    // Process data through HTTP chunk processor
    httpChunkProcessor->processChunk(data, len, index, total);

    // Send response ONLY when complete body has been received and processed
    if (index + len == total) {
        AsyncWebServerResponse *response = req->beginResponse(200, "text/plain", "OK");
        req->send(response);
    }
}

void Helper_HTTPEndpoints::handleDeviceInfo(AsyncWebServerRequest* req) {
    if (!deviceInfo) {
        req->send(500, "application/json", "{\"error\":\"Device info helper not available\"}");
        return;
    }

    Serial.println("[Helper_HTTPEndpoints] Device info request received");
    
    String deviceInfoJSON = deviceInfo->getDeviceInfoJSON();
    req->send(200, "application/json", deviceInfoJSON);
}

void Helper_HTTPEndpoints::handleDeviceCapabilities(AsyncWebServerRequest* req) {
    if (!deviceCapabilities) {
        req->send(500, "application/json", "{\"error\":\"Device capabilities helper not available\"}");
        return;
    }

    Serial.println("[Helper_HTTPEndpoints] Device capabilities request received");
    
    String capabilitiesJSON = deviceCapabilities->getDeviceCapabilitiesJSON();
    req->send(200, "application/json", capabilitiesJSON);
}

void Helper_HTTPEndpoints::handleConnectionStatus(AsyncWebServerRequest* req) {
    String response = getConnectionStatusJson();
    req->send(200, "application/json", response);
}

void Helper_HTTPEndpoints::handleSystemStats(AsyncWebServerRequest* req) {
    if (!deviceInfo) {
        req->send(500, "application/json", "{\"error\":\"Device info helper not available\"}");
        return;
    }

    Serial.println("[Helper_HTTPEndpoints] System stats request received");
    
    String systemStatsJSON = deviceInfo->getSystemStatsJSON();
    req->send(200, "application/json", systemStatsJSON);
}

void Helper_HTTPEndpoints::handleSystemStatsLite(AsyncWebServerRequest* req) {
    if (!deviceInfo) {
        req->send(500, "application/json", "{\"error\":\"Device info helper not available\"}");
        return;
    }

    Serial.println("[Helper_HTTPEndpoints] Lightweight system stats request received");
    
    String lightweightStatsJSON = deviceInfo->getSystemStatsLightweightJSON();
    req->send(200, "application/json", lightweightStatsJSON);
}

void Helper_HTTPEndpoints::handleGatewayStatus(AsyncWebServerRequest* req) {
    String response = getGatewayStatusJson();
    req->send(200, "application/json", response);
}

void Helper_HTTPEndpoints::handleHeartbeat(AsyncWebServerRequest* req) {
    String mac = getFormattedMacAddress();
    String firmware = getFirmwareVersion();
    String response = "{";

    response += "\"status\":\"OK\",";
    
    response += "\"mac\":\"";
    response += mac;
    response += "\",";

    response += "\"firmware\":\"";
    response += firmware;
    response += "\",";

    response += "\"uptime\":";
    response += String(millis());
    response += ",";

    response += "\"free_heap\":";
    response += String(ESP.getFreeHeap());

    response += "}";

    req->send(200, "application/json", response);
}

void Helper_HTTPEndpoints::handleFirmwareHash(AsyncWebServerRequest* req) {
    String response = ::getFirmwareInfoJson();
    req->send(200, "application/json", response);
}

void Helper_HTTPEndpoints::handleSetPreferences(AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
    // Build up the complete POST body
    if (index == 0) {
        tempPostBodyLen = 0;
        memset(tempPostBodyBuffer, 0, sizeof(tempPostBodyBuffer));
    }
    
    if (tempPostBodyLen + len >= sizeof(tempPostBodyBuffer)) {
        Serial.printf("[Helper_HTTPEndpoints] ERROR: POST body too large! Max size: %d\n", sizeof(tempPostBodyBuffer));
        req->send(400, "application/json", "{\"error\":\"Request too large\"}");
        return;
    }
    
    memcpy(tempPostBodyBuffer + tempPostBodyLen, data, len);
    tempPostBodyLen += len;
    tempPostBodyBuffer[tempPostBodyLen] = '\0';
    
    // Process complete request
    if (index + len == total) {
        StaticJsonDocument<1024> doc;
        DeserializationError error = deserializeJson(doc, tempPostBodyBuffer);
        
        if (error) {
            Serial.printf("[Helper_HTTPEndpoints] JSON parse error: %s\n", error.c_str());
            req->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
            return;
        }

        // Process preferences through system callback
        if (systemCallback) {
            JsonDocument systemDoc;
            systemDoc["type"] = "preferences";
            systemDoc["action"] = "set";
            systemDoc["data"] = doc.as<JsonObject>();
            systemCallback(systemDoc);
        }

        req->send(200, "application/json", "{\"status\":\"OK\"}");
    }
}

void Helper_HTTPEndpoints::handleDeviceWipe(AsyncWebServerRequest* req) {
    Serial.println("[Helper_HTTPEndpoints] FULL NVS WIPE requested");

    // 1) Immediately reply so the client sees the result
    AsyncWebServerResponse* res = req->beginResponse(
        200,
        "application/json",
        "{\"status\":\"OK\",\"message\":\"Wiping ALL NVS (prefs + WiFi) and rebooting now\"}"
    );
    res->addHeader("Connection", "close");
    req->send(res);

    // 2) Offload the actual erase+restart so we don't block the HTTP thread
    xTaskCreate(
        [](void*) {
            nvs_flash_erase();   // nukes all namespaces, including WiFi credentials
            ESP.restart();       // immediate reboot
            vTaskDelete(nullptr);
        },
        "WipeAndRestart",
        2048,
        nullptr,
        tskIDLE_PRIORITY + 1,
        nullptr
    );
}

// ==========================================
// OTA HANDLERS
// ==========================================

void Helper_HTTPEndpoints::handleOTAPartitionInfo(AsyncWebServerRequest* req) {
    if (!otaHelper) {
        req->send(500, "application/json", "{\"error\":\"OTA helper not available\"}");
        return;
    }

    String partitionInfo = otaHelper->getOTAPartitionInfo();
    req->send(200, "application/json", partitionInfo);
}

void Helper_HTTPEndpoints::handleOTAUpload(AsyncWebServerRequest* req, const String& filename, 
                                          size_t index, uint8_t* data, size_t len, bool final) {
    if (!otaHelper) {
        Serial.println("[Helper_HTTPEndpoints] ERROR: OTA helper not available");
        return;
    }

    // First chunk - start the update
    if (index == 0) {
        Serial.printf("[Helper_HTTPEndpoints] Starting OTA update - filename: %s\n", filename.c_str());
        
        // Get expected size from Content-Length if available
        size_t contentLength = req->contentLength();
        
        if (contentLength > 0) {
            Serial.printf("[Helper_HTTPEndpoints] Content-Length: %d bytes\n", contentLength);
            
            // Validate size before starting
            String validationError;
            if (!otaHelper->validateFirmwareSize(contentLength, validationError)) {
                Serial.printf("[Helper_HTTPEndpoints] ❌ Size validation failed: %s\n", validationError.c_str());
                // Error response will be sent in handleOTAComplete
                return;
            }
        }
        
        // Begin the update
        if (!otaHelper->beginUpdate(contentLength > 0 ? contentLength : UPDATE_SIZE_UNKNOWN)) {
            Serial.printf("[Helper_HTTPEndpoints] ❌ Failed to begin update: %s\n", otaHelper->getLastError().c_str());
            return;
        }
        
        Serial.println("[Helper_HTTPEndpoints] ✅ OTA update started");
    }

    // Write data chunk
    if (len > 0) {
        if (!otaHelper->writeChunk(data, len)) {
            Serial.printf("[Helper_HTTPEndpoints] ❌ Failed to write chunk: %s\n", otaHelper->getLastError().c_str());
            return;
        }
    }

    // Final chunk - complete the update
    if (final) {
        Serial.printf("[Helper_HTTPEndpoints] OTA upload complete (%d bytes total)\n", otaHelper->getBytesWritten());
        
        if (!otaHelper->finishUpdate(true)) { // Verify after update
            Serial.printf("[Helper_HTTPEndpoints] ❌ Failed to finish update: %s\n", otaHelper->getLastError().c_str());
        } else {
            Serial.println("[Helper_HTTPEndpoints] ✅ OTA update completed successfully");
        }
    }
}

void Helper_HTTPEndpoints::handleOTAComplete(AsyncWebServerRequest* req) {
    if (!otaHelper) {
        req->send(500, "application/json", "{\"error\":\"OTA helper not available\"}");
        return;
    }

    StaticJsonDocument<512> response;
    
    if (otaHelper->getLastError().isEmpty()) {
        // Success
        response["status"] = "success";
        response["message"] = "Firmware update completed successfully";
        response["bytesWritten"] = otaHelper->getBytesWritten();
        response["firmwareHash"] = otaHelper->getCurrentFirmwareHash();
        response["restartIn"] = 3;
        
        String responseStr;
        serializeJson(response, responseStr);
        
        AsyncWebServerResponse* res = req->beginResponse(200, "application/json", responseStr);
        res->addHeader("Connection", "close");
        req->send(res);
        
        // Schedule restart
        Serial.println("[Helper_HTTPEndpoints] Scheduling restart in 3 seconds...");
        xTaskCreate([](void*) {
            delay(3000);
            ESP.restart();
            vTaskDelete(nullptr);
        }, "OTARestart", 2048, nullptr, 1, nullptr);
        
    } else {
        // Error
        response["status"] = "error";
        response["message"] = otaHelper->getLastError();
        response["bytesWritten"] = otaHelper->getBytesWritten();
        
        String responseStr;
        serializeJson(response, responseStr);
        req->send(500, "application/json", responseStr);
    }
}

void Helper_HTTPEndpoints::handleOTAStatus(AsyncWebServerRequest* req) {
    if (!otaHelper) {
        req->send(500, "application/json", "{\"error\":\"OTA helper not available\"}");
        return;
    }

    StaticJsonDocument<256> response;
    response["updateInProgress"] = otaHelper->isUpdateInProgress();
    response["bytesWritten"] = otaHelper->getBytesWritten();
    response["lastError"] = otaHelper->getLastError();
    response["otaPartitionSize"] = otaHelper->getOTAPartitionSize();
    response["availableSpace"] = otaHelper->getAvailableOTASpace();
    
    String responseStr;
    serializeJson(response, responseStr);
    req->send(200, "application/json", responseStr);
}

void Helper_HTTPEndpoints::handleOTAVerify(AsyncWebServerRequest* req) {
    if (!otaHelper) {
        req->send(500, "application/json", "{\"error\":\"OTA helper not available\"}");
        return;
    }

    Serial.println("[Helper_HTTPEndpoints] Manual firmware verification requested");
    
    // Use cached hash instead of forcing expensive recalculation
    String currentHash = otaHelper->getCurrentFirmwareHash(); // Uses cached
    bool isValid = !currentHash.isEmpty() && currentHash.length() == 64;
    
    StaticJsonDocument<256> response;
    response["verified"] = isValid;
    response["firmwareHash"] = currentHash;
    response["timestamp"] = millis();
    response["note"] = "Using cached hash - full verification requires restart";
    
    String responseStr;
    serializeJson(response, responseStr);
    req->send(200, "application/json", responseStr);
}

// ==========================================
// HELPER METHODS
// ==========================================

String Helper_HTTPEndpoints::getConnectionStatusJson() const {
    StaticJsonDocument<512> doc;
    
    // Network status
    doc["wifiConnected"] = (WiFi.status() == WL_CONNECTED);
    doc["ipAddress"] = WiFi.localIP().toString();
    doc["macAddress"] = getFormattedMacAddress();
    doc["activeNetworkType"] = "WiFi"; // Will be overridden by branch
    
    // Additional status (to be extended by branches)
    doc["ethernetConnected"] = false;
    doc["espNowActive"] = false;
    
    String response;
    serializeJson(doc, response);
    return response;
}

String Helper_HTTPEndpoints::getSystemStatsJson() const {
    if (!deviceInfo) {
        return "{\"error\":\"Device info helper not available\"}";
    }
    
    return deviceInfo->getSystemStatsJSON();
}

String Helper_HTTPEndpoints::getSystemStatsLiteJson() const {
    if (!deviceInfo) {
        return "{\"error\":\"Device info helper not available\"}";
    }
    
    return deviceInfo->getSystemStatsLightweightJSON();
}

String Helper_HTTPEndpoints::getGatewayStatusJson() const {
    StaticJsonDocument<256> doc;
    
    // Basic gateway status (to be extended by gateway branches)
    doc["hasEthernet"] = false;
    doc["hasESPNow"] = false;
    doc["canForward"] = false;
    doc["peerCount"] = 0;
    
    String response;
    serializeJson(doc, response);
    return response;
}