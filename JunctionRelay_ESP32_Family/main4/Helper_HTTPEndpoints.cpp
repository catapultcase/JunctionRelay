#include "Helper_HTTPEndpoints.h"
#include "Helper_StreamProcessor.h"
#include "Helper_DeviceInfo.h"
#include "Helper_DeviceCapabilities.h"
#include "Manager_ScreenRouter.h"
#include "Helper_Utils.h"
#include <Preferences.h>
#include <Update.h>

// Initialize static buffers
char Helper_HTTPEndpoints::tempPostBodyBuffer[2048];
size_t Helper_HTTPEndpoints::tempPostBodyLen = 0;

Helper_HTTPEndpoints::Helper_HTTPEndpoints(ScreenRouter* router, Helper_StreamProcessor* processor,
                                         Helper_DeviceInfo* devInfo, Helper_DeviceCapabilities* devCaps)
    : screenRouter(router),
      streamProcessor(processor),
      httpChunkProcessor(nullptr),
      deviceInfo(devInfo),
      deviceCapabilities(devCaps),
      server(80),
      serverRunning(false)
{
    // Serial.printf("[Helper_HTTPEndpoints] Constructor: deviceInfo=%p, deviceCapabilities=%p\n", devInfo, devCaps);
    
    // Test the helpers immediately
    // if (devInfo) {
    //     Serial.println("[Helper_HTTPEndpoints] Testing deviceInfo helper...");
    //     String test = devInfo->getDeviceInfoJSON();
    //     Serial.printf("[Helper_HTTPEndpoints] DeviceInfo test result length: %d\n", test.length());
    // } else {
    //     Serial.println("[Helper_HTTPEndpoints] ERROR: deviceInfo is NULL in constructor!");
    // }
    
    // if (devCaps) {
    //     Serial.println("[Helper_HTTPEndpoints] deviceCapabilities helper looks good");
    // } else {
    //     Serial.println("[Helper_HTTPEndpoints] ERROR: deviceCapabilities is NULL in constructor!");
    // }
}

Helper_HTTPEndpoints::~Helper_HTTPEndpoints() {
    if (serverRunning) {
        stopServer();
    }
    if (httpChunkProcessor) {  
        delete httpChunkProcessor;
        httpChunkProcessor = nullptr;
    }
    Serial.println("[Helper_HTTPEndpoints] Destructor called");
}

void Helper_HTTPEndpoints::setDeviceHelpers(Helper_DeviceInfo* devInfo, Helper_DeviceCapabilities* devCaps) {
    deviceInfo = devInfo;
    deviceCapabilities = devCaps;
    Serial.println("[Helper_HTTPEndpoints] Device helpers set");
}

void Helper_HTTPEndpoints::init() {
    // Serial.println("[Helper_HTTPEndpoints] Initializing HTTP endpoints...");
    
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
        
        // Start WebSocket server if available
        // if (webSocketHelper) {
        //     webSocketHelper->setupServer();
        // }
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
    // Device info endpoint - NEW
    server.on("/api/device/info", HTTP_GET,
        [this](AsyncWebServerRequest* req) {
            this->handleDeviceInfo(req);
        }
    );

    // Device capabilities endpoint - NEW
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

    // OTA firmware update
    server.on("/api/firmware/update", HTTP_POST,
        [](AsyncWebServerRequest* req) {
            bool ok = !Update.hasError();
            AsyncWebServerResponse* response = req->beginResponse(
                ok ? 200 : 500, "text/plain",
                ok ? "Update OK" : String("FAIL: ") + Update.errorString()
            );
            req->send(response);
            if (ok) {
                delay(2000);
                ESP.restart();
            }
        },
        [](AsyncWebServerRequest* req, const String& filename, size_t index,
        uint8_t* data, size_t len, bool final) {
            if (index == 0) {
                Update.begin(UPDATE_SIZE_UNKNOWN);
            }
            Update.write(data, len);
            if (final) {
                Update.end(true);
            }
        }
    );
}

// ==========================================
// ENDPOINT HANDLERS
// ==========================================

void Helper_HTTPEndpoints::handleDataPost(AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
    if (!streamProcessor) {
        Serial.println("[Helper_HTTPEndpoints] ERROR: StreamProcessor not available");
        // Send error response
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
    String response = "{";
    response += "\"status\":\"OK\",";
    response += "\"mac\":\"" + mac + "\",";
    response += "\"firmware\":\"" + getFirmwareVersion() + "\",";
    response += "\"uptime\":" + String(millis()) + ",";
    response += "\"free_heap\":" + String(ESP.getFreeHeap());
    response += "}";
    
    req->send(200, "application/json", response);
}

void Helper_HTTPEndpoints::handleFirmwareHash(AsyncWebServerRequest* req) {
    String response = getFirmwareInfoJson();
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
    Serial.println("[Helper_HTTPEndpoints] Device wipe requested");
    
    Preferences prefs;
    bool success = true;
    
    // Clear all preference namespaces
    if (prefs.begin("junctionrelay", false)) {
        success &= prefs.clear();
        prefs.end();
    }
    
    String response = success ? 
        "{\"status\":\"OK\",\"message\":\"Device wiped successfully\"}" :
        "{\"status\":\"ERROR\",\"message\":\"Failed to wipe device\"}";
    
    req->send(success ? 200 : 500, "application/json", response);
    
    if (success) {
        Serial.println("[Helper_HTTPEndpoints] Device will restart in 3 seconds...");
        delay(3000);
        ESP.restart();
    }
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
    
    // Protocol status
    // doc["webSocketConnected"] = webSocketHelper ? webSocketHelper->hasConnectedClients() : false;
    // doc["mqttConnected"] = mqttManager ? mqttManager->connected() : false;
    
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

String Helper_HTTPEndpoints::getFirmwareInfoJson() const {
    StaticJsonDocument<256> doc;
    
    doc["version"] = getFirmwareVersion();
    doc["buildDate"] = __DATE__ " " __TIME__;
    doc["sketchMD5"] = ESP.getSketchMD5();
    doc["chipModel"] = ESP.getChipModel();
    doc["chipRevision"] = ESP.getChipRevision();
    
    String response;
    serializeJson(doc, response);
    return response;
}

String Helper_HTTPEndpoints::getFormattedMacAddress() const {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[18];
    sprintf(macStr, "%02X:%02X:%02X:%02X:%02X:%02X", 
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    return String(macStr);
}

String Helper_HTTPEndpoints::getFirmwareVersion() const {
    return "JunctionRelay_v1.0.0"; // Should be defined in a header file
}