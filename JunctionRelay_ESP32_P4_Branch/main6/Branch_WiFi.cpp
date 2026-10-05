#include "Branch_Wifi.h"
#include "Helper_StreamProcessor.h"
#include "Helper_HTTPEndpoints.h"
#include "Helper_WebSocket.h"
#include "Helper_Preferences.h"
#include "Helper_DeviceInfo.h"
#include "Helper_DeviceCapabilities.h"
#include "Manager_ScreenRouter.h"
#include "DeviceConfig.h"
#include "Helper_Utils.h"

Branch_Wifi::Branch_Wifi()
    : initialized(false),
      screenRouter(nullptr),
      preferences(nullptr),
      devicePtr(nullptr),
      deviceInfo(nullptr),
      deviceCapabilities(nullptr),
      streamProcessor(nullptr),
      httpEndpoints(nullptr),
      webSocketHelper(nullptr),
      lastWiFiCheck(0)
{
    // Serial.println("[Branch_Wifi] Constructor called");
}

Branch_Wifi::~Branch_Wifi() {
    if (webSocketHelper) {
        delete webSocketHelper;
        webSocketHelper = nullptr;
    }
    if (httpEndpoints) {
        delete httpEndpoints;
        httpEndpoints = nullptr;
    }
    if (streamProcessor) {
        delete streamProcessor;
        streamProcessor = nullptr;
    }
    
    WiFi.disconnect(true);
    Serial.println("[Branch_Wifi] Destructor called");
}

void Branch_Wifi::init(ScreenRouter* router, Helper_Preferences* prefs, DeviceConfig* device,
                       Helper_DeviceInfo* devInfo, Helper_DeviceCapabilities* devCaps) {
    if (!router || !prefs || !device || !devInfo || !devCaps) {
        Serial.println("[Branch_Wifi] ERROR: Required parameters are null");
        return;
    }

    screenRouter = router;
    preferences = prefs;
    devicePtr = device;
    deviceInfo = devInfo;
    deviceCapabilities = devCaps;
    
    Serial.println("[Branch_Wifi] Initializing WiFi mode with HTTP and WebSocket support...");
    
    // Load WiFi credentials from centralized preferences
    ssid = preferences->getWiFiSSID();
    password = preferences->getWiFiPassword();
    deviceName = preferences->getDeviceName();
    
    Serial.printf("[Branch_Wifi] Loaded credentials - SSID: %s, Device: %s\n", 
                 ssid.c_str(), deviceName.c_str());
    
    // Create StreamProcessor with device pointer for screen setup
    streamProcessor = new Helper_StreamProcessor(
        screenRouter,
        [this](const JsonDocument& doc) { this->handleProtocolPayload(doc); },
        [this](const JsonDocument& doc) { this->handleSystemPayload(doc); },
        devicePtr
    );
    
    // Create HTTP endpoints helper WITH device helpers injected
    httpEndpoints = new Helper_HTTPEndpoints(screenRouter, streamProcessor, deviceInfo, deviceCapabilities);
    
    // NEW: Create WebSocket helper WITH device helpers injected
    webSocketHelper = new Helper_WebSocket(streamProcessor, deviceInfo, deviceCapabilities);
    
    // Set up bidirectional callbacks for HTTP
    httpEndpoints->setProtocolCallback([this](const JsonDocument& doc) { 
        this->handleProtocolPayload(doc); 
    });
    httpEndpoints->setSystemCallback([this](const JsonDocument& doc) { 
        this->handleSystemPayload(doc); 
    });
    
    // NEW: Set up bidirectional callbacks for WebSocket
    webSocketHelper->setProtocolCallback([this](const JsonDocument& doc) { 
        this->handleProtocolPayload(doc); 
    });
    webSocketHelper->setSystemCallback([this](const JsonDocument& doc) { 
        this->handleSystemPayload(doc); 
    });
    
    // Initialize HTTP endpoints
    initializeHTTPEndpoints();
    
    // NEW: Initialize WebSocket
    initializeWebSocket();
    
    // Initialize WiFi connection
    initializeWiFi();
    
    // If WiFi credentials exist, try to connect
    if (!ssid.isEmpty()) {
        if (connectToWiFi()) {
            // WiFi connected - initialize network-dependent services
            setupMDNS();
            httpEndpoints->startServer();
            webSocketHelper->startServer();  // NEW: Start WebSocket server
        } else {
            Serial.println("[Branch_Wifi] WiFi connection failed");
        }
    } else {
        Serial.println("[Branch_Wifi] No WiFi credentials found");
    }
    
    initialized = true;
    emitStatus();
    
    Serial.println("[Branch_Wifi] WiFi mode ready with HTTP and WebSocket support");
    Serial.println("[Branch_Wifi] HTTP endpoints available:");
    Serial.println("[Branch_Wifi] GET  /api/device/info");
    Serial.println("[Branch_Wifi] GET  /api/device/capabilities");
    Serial.println("[Branch_Wifi] GET  /api/device/capabilities?detailed=true");
    Serial.println("[Branch_Wifi] GET  /api/system/stats");
    Serial.println("[Branch_Wifi] GET  /api/connection/status");
    Serial.println("[Branch_Wifi] GET  /api/health/heartbeat");
    Serial.println("[Branch_Wifi] POST /api/data");
    // NEW: WebSocket information
    Serial.println("[Branch_Wifi] WebSocket server available:");
    if (isWiFiConnected()) {
        Serial.printf("[Branch_Wifi] ws://%s:81/ (for WebSocket junctions)\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("[Branch_Wifi] ws://[device-ip]:81/ (when WiFi connected)");
    }
}

void Branch_Wifi::loop() {
    if (!initialized) return;
    
    unsigned long currentTime = millis();
    
    // NEW: Process WebSocket events
    if (webSocketHelper) {
        webSocketHelper->loop();
    }
    
    // Check WiFi connection periodically
    if (currentTime - lastWiFiCheck > WIFI_CHECK_INTERVAL) {
        lastWiFiCheck = currentTime;
        
        if (WiFi.status() != WL_CONNECTED) {
            handleWiFiDisconnection();
        }
    }
}

// ==========================================
// INITIALIZATION METHODS
// ==========================================

void Branch_Wifi::initializeWiFi() {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(true);
    
    // Set hostname
    String hostname = deviceName.isEmpty() ? "JunctionRelay_" + getFormattedMacAddress() : deviceName;
    WiFi.setHostname(hostname.c_str());
    
    Serial.printf("[Branch_Wifi] WiFi initialized with hostname: %s\n", hostname.c_str());
}

void Branch_Wifi::initializeHTTPEndpoints() {
    httpEndpoints->init();
    Serial.println("[Branch_Wifi] HTTP endpoints initialized");
}

void Branch_Wifi::initializeWebSocket() {
    if (!webSocketHelper) {
        Serial.println("[Branch_Wifi] ERROR: WebSocket helper not created");
        return;
    }
    
    // Initialize WebSocket server on port 81 (standard for ESP32)
    webSocketHelper->init(81);
    Serial.println("[Branch_Wifi] WebSocket helper initialized on port 81");
}

void Branch_Wifi::setupMDNS() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[Branch_Wifi] Cannot setup mDNS - WiFi not connected");
        return;
    }
    
    String mac = getFormattedMacAddress();
    String host = "JunctionRelay_Device_" + mac;
    
    if (MDNS.begin(host.c_str())) {
        MDNS.addService("junctionrelay", "tcp", 80);
        MDNS.addService("junctionrelay-ws", "tcp", 81);  // NEW: WebSocket service
        Serial.printf("[Branch_Wifi] mDNS started with hostname: %s\n", host.c_str());
        Serial.println("[Branch_Wifi] Services: HTTP (port 80), WebSocket (port 81)");
    } else {
        Serial.println("[Branch_Wifi] Failed to start mDNS responder");
    }
}

// ==========================================
// CONNECTION MANAGEMENT
// ==========================================

bool Branch_Wifi::connectToWiFi() {
    if (ssid.isEmpty()) {
        Serial.println("[Branch_Wifi] Cannot connect - no SSID configured");
        return false;
    }
    
    Serial.printf("[Branch_Wifi] Connecting to WiFi: %s\n", ssid.c_str());
    
    WiFi.begin(ssid.c_str(), password.c_str());
    
    // Wait for connection with timeout
    unsigned long startTime = millis();
    const unsigned long timeout = 20000; // 20 seconds
    
    while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < timeout) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();
    
    if (WiFi.status() == WL_CONNECTED) {
        printWiFiStatus();
        return true;
    } else {
        Serial.printf("[Branch_Wifi] WiFi connection failed. Status: %d\n", WiFi.status());
        return false;
    }
}

void Branch_Wifi::handleWiFiDisconnection() {
    Serial.println("[Branch_Wifi] WiFi disconnected, stopping services and attempting reconnection...");
    
    // Stop WebSocket server when WiFi disconnects
    if (webSocketHelper && webSocketHelper->isServerRunning()) {
        webSocketHelper->stopServer();
        Serial.println("[Branch_Wifi] WebSocket server stopped due to WiFi disconnection");
    }
    
    if (connectToWiFi()) {
        Serial.println("[Branch_Wifi] WiFi reconnected successfully, restarting services...");
        
        // Restart WebSocket server when WiFi reconnects
        if (webSocketHelper) {
            webSocketHelper->startServer();
            Serial.println("[Branch_Wifi] WebSocket server restarted after WiFi reconnection");
        }
        
        emitStatus();
    } else {
        Serial.println("[Branch_Wifi] WiFi reconnection failed");
    }
}

void Branch_Wifi::reconnectWiFi() {
    WiFi.disconnect();
    delay(1000);
    connectToWiFi();
}

// ==========================================
// STREAMPROCESSOR CALLBACK HANDLERS
// ==========================================

void Branch_Wifi::handleProtocolPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    // Serial.printf("[Branch_Wifi] 📡 PROTOCOL callback received: %s\n", type ? type : "unknown");
    
    if (!type) return;
    
    if (strcmp(type, "http_request") == 0) {
        handleHTTPRequest(doc);
    }
    else if (strcmp(type, "websocket_ping") == 0) {
        handleWebSocketPing(doc);
    }
    else if (strcmp(type, "gateway_forward") == 0) {
        handleGatewayForward(doc);
    }
    else if (doc.containsKey("destination")) {
        // This would be for gateway forwarding (not applicable in wifi mode)
        String dest = doc["destination"].as<String>();
        Serial.printf("[Branch_Wifi] 🌐 Gateway forwarding to: %s - not supported in WiFi mode\n", dest.c_str());
    }
    else {
        Serial.printf("[Branch_Wifi] ❓ Unhandled protocol type: %s\n", type);
    }
}

void Branch_Wifi::handleSystemPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    Serial.printf("[Branch_Wifi] ⚙️ SYSTEM callback received: %s\n", type ? type : "unknown");
    
    if (!type) return;
    
    if (strcmp(type, "device_info") == 0) {
        handleDeviceInfoRequest(doc);
    }
    else if (strcmp(type, "device_capabilities") == 0) {
        handleDeviceCapabilitiesRequest(doc);
    }
    else if (strcmp(type, "stats") == 0) {
        handleStatsRequest(doc);
    }
    else if (strcmp(type, "preferences") == 0) {
        handlePreferencesRequest(doc);
    }
    else if (strcmp(type, "system_command") == 0) {
        handleSystemCommand(doc);
    }
    else {
        Serial.printf("[Branch_Wifi] ❓ Unhandled system type: %s\n", type);
    }
}

// ==========================================
// PROTOCOL-SPECIFIC HANDLERS
// ==========================================

void Branch_Wifi::handleHTTPRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Wifi] 🌍 HTTP request received");
    
    if (doc.containsKey("url") && doc.containsKey("method")) {
        String url = doc["url"].as<String>();
        String method = doc["method"].as<String>();
        
        Serial.printf("[Branch_Wifi] HTTP %s %s\n", method.c_str(), url.c_str());
        
        // Could implement HTTP client functionality here
        // For now, just log the request
    }
}

void Branch_Wifi::handleWebSocketPing(const JsonDocument& doc) {
    Serial.println("[Branch_Wifi] 🏓 WebSocket ping request received");
    
    // Extract client ID if available
    uint8_t clientId = doc.containsKey("websocketClientId") ? doc["websocketClientId"].as<uint8_t>() : 0;
    
    if (webSocketHelper && webSocketHelper->isServerRunning()) {
        // Send pong response
        DynamicJsonDocument pongDoc(256);
        pongDoc["type"] = "websocket_pong";
        pongDoc["timestamp"] = millis();
        pongDoc["uptime"] = millis();
        pongDoc["freeHeap"] = ESP.getFreeHeap();
        pongDoc["clients"] = webSocketHelper->getConnectedClientsCount();
        
        if (clientId > 0) {
            webSocketHelper->sendToClient(clientId, pongDoc);
            Serial.printf("[Branch_Wifi] Sent WebSocket pong to client %d\n", clientId);
        } else {
            webSocketHelper->broadcastData(pongDoc);
            Serial.println("[Branch_Wifi] Broadcast WebSocket pong to all clients");
        }
    } else {
        Serial.println("[Branch_Wifi] WebSocket server not available for pong response");
    }
}

void Branch_Wifi::handleGatewayForward(const JsonDocument& doc) {
    Serial.println("[Branch_Wifi] 🌐 Gateway forward request received (not supported in WiFi mode)");
    
    // Extract client ID if available
    uint8_t clientId = doc.containsKey("websocketClientId") ? doc["websocketClientId"].as<uint8_t>() : 0;
    
    if (webSocketHelper && clientId > 0) {
        // Send error response
        DynamicJsonDocument errorDoc(256);
        errorDoc["type"] = "gateway-forward-error";
        errorDoc["error"] = "Gateway forwarding not supported in WiFi mode";
        errorDoc["suggestion"] = "Use Gateway USB or Gateway Ethernet mode for ESP-NOW forwarding";
        errorDoc["timestamp"] = millis();
        
        webSocketHelper->sendToClient(clientId, errorDoc);
        Serial.printf("[Branch_Wifi] Sent gateway error response to client %d\n", clientId);
    }
}

// ==========================================
// SYSTEM HANDLERS USING INJECTED HELPERS
// ==========================================

void Branch_Wifi::handleDeviceInfoRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Wifi] 📱 Device info request received");
    
    if (!deviceInfo) {
        Serial.println("[Branch_Wifi] ERROR: deviceInfo helper not available");
        return;
    }
    
    // Use injected helper to get device info - simple direct approach
    String deviceInfoJSON = deviceInfo->getDeviceInfoJSON();
    String systemStatsJSON = deviceInfo->getSystemStatsJSON();
    String firmwareInfoJSON = deviceInfo->getFirmwareInfoJSON();
    
    // Just print the responses (for StreamProcessor callback usage)
    Serial.println("=== DEVICE INFO ===");
    Serial.println(deviceInfoJSON);
    Serial.println("=== SYSTEM STATS ===");
    Serial.println(systemStatsJSON);
    Serial.println("=== FIRMWARE INFO ===");
    Serial.println(firmwareInfoJSON);
    Serial.println("=== END DEVICE INFO ===");
}

void Branch_Wifi::handleDeviceCapabilitiesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Wifi] 🔧 Device capabilities request received");
    
    if (!deviceCapabilities) {
        Serial.println("[Branch_Wifi] ERROR: deviceCapabilities helper not available");
        return;
    }
    
    // Use injected helper to get device capabilities - simple direct approach
    String capabilitiesJSON = deviceCapabilities->getDeviceCapabilitiesJSON();
    
    // Show additional details if requested
    if (doc.containsKey("detailed") && doc["detailed"].as<bool>()) {
        Serial.println("=== DETAILED DEVICE CAPABILITIES ===");
        Serial.printf("Screen Count: %d\n", deviceCapabilities->getScreenCount());
        Serial.printf("I2C Device Count: %d\n", deviceCapabilities->getI2CDeviceCount());
        Serial.printf("NeoPixel Strip Count: %d\n", deviceCapabilities->getNeoPixelStripCount());
        Serial.printf("Has NeoPixel Strips: %s\n", deviceCapabilities->hasNeoPixelStrips() ? "Yes" : "No");
        
        // Show individual capability checks
        const char* capabilities[] = {
            "onboard_screen", "onboard_led", "onboard_rgb_led", "external_matrix",
            "external_neopixels", "external_i2c_devices", "buttons", "battery",
            "ethernet", "wifi", "ble", "usb", "espnow", "http", "mqtt",
            "websockets", "speaker", "microsd", "gateway"
        };
        
        Serial.println("Individual Capabilities:");
        for (const char* cap : capabilities) {
            Serial.printf("  - %s: %s\n", cap, deviceCapabilities->hasCapability(cap) ? "Yes" : "No");
        }
    }
    
    // Just print the response (for StreamProcessor callback usage)
    Serial.println("=== DEVICE CAPABILITIES ===");
    Serial.println(capabilitiesJSON);
    Serial.println("=== END DEVICE CAPABILITIES ===");
}

void Branch_Wifi::handleStatsRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Wifi] 📊 Stats request received");
    
    // Show WiFi-specific stats
    Serial.printf("[Branch_Wifi] WiFi Status:\n");
    Serial.printf("  - Connected: %s\n", isWiFiConnected() ? "Yes" : "No");
    if (isWiFiConnected()) {
        Serial.printf("  - IP: %s\n", getIPAddress().c_str());
        Serial.printf("  - RSSI: %d dBm\n", getSignalStrength());
        Serial.printf("  - Channel: %d\n", WiFi.channel());
        Serial.printf("  - SSID: %s\n", WiFi.SSID().c_str());
    }
    
    // NEW: Show WebSocket stats
    if (webSocketHelper) {
        Serial.printf("[Branch_Wifi] WebSocket Status:\n");
        Serial.printf("  - Server Running: %s\n", webSocketHelper->isServerRunning() ? "Yes" : "No");
        Serial.printf("  - Connected Clients: %d\n", webSocketHelper->getConnectedClientsCount());
        Serial.printf("  - Messages Received: %d\n", webSocketHelper->getMessagesReceived());
        Serial.printf("  - Messages Sent: %d\n", webSocketHelper->getMessagesSent());
        Serial.printf("  - Errors: %d\n", webSocketHelper->getErrorCount());
    }
    
    // Show queue status from StreamProcessor
    if (streamProcessor) {
        auto queueStatus = streamProcessor->getQueueStatus();
        Serial.printf("[Branch_Wifi] Queue Status:\n");
        Serial.printf("  - Sensor Queue: %d/%d items\n", queueStatus.sensorQueueSize, 30);
        Serial.printf("  - Config Queue: %d/%d items\n", queueStatus.configQueueSize, 3);
        Serial.printf("  - Sensor Task: %s\n", queueStatus.sensorTaskRunning ? "Running" : "Stopped");
        Serial.printf("  - Config Task: %s\n", queueStatus.configTaskRunning ? "Running" : "Stopped");
    }
    
    // Use helper for lightweight system stats
    if (deviceInfo) {
        String lightweightStats = deviceInfo->getSystemStatsLightweightJSON();
        Serial.println("=== SYSTEM STATS ===");
        Serial.println(lightweightStats);
        Serial.println("=== END SYSTEM STATS ===");
    } else {
        Serial.println("[Branch_Wifi] ERROR: deviceInfo helper not available for stats");
    }
}

void Branch_Wifi::handlePreferencesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Wifi] ⚙️ Preferences request received");
    
    if (doc.containsKey("action")) {
        String action = doc["action"].as<String>();
        Serial.printf("[Branch_Wifi] Preferences action: %s\n", action.c_str());
        
        if (action == "get") {
            // Return current preferences
            String currentPrefs = preferences->getWiFiSettingsJSON();
            Serial.println("=== CURRENT WIFI PREFERENCES ===");
            Serial.println(currentPrefs);
            Serial.println("=== END PREFERENCES ===");
        }
        else if (action == "set" && doc.containsKey("data")) {
            // Update preferences using centralized system
            JsonObjectConst data = doc["data"];
            
            bool needReconnect = false;
            bool success = true;
            
            if (data.containsKey("ssid")) {
                String newSSID = data["ssid"].as<String>();
                if (newSSID != ssid) {
                    preferences->setWiFiSSID(newSSID);
                    ssid = newSSID;
                    needReconnect = true;
                    Serial.printf("[Branch_Wifi] SSID updated to: %s\n", ssid.c_str());
                }
            }
            
            if (data.containsKey("password")) {
                String newPassword = data["password"].as<String>();
                preferences->setWiFiPassword(newPassword);
                password = newPassword;
                needReconnect = true;
                Serial.println("[Branch_Wifi] Password updated");
            }
            
            if (data.containsKey("deviceName")) {
                String newName = data["deviceName"].as<String>();
                preferences->setDeviceName(newName);
                deviceName = newName;
                Serial.printf("[Branch_Wifi] Device name updated to: %s\n", deviceName.c_str());
            }
            
            if (data.containsKey("autoReconnect")) {
                bool autoReconnect = data["autoReconnect"].as<bool>();
                preferences->setWiFiAutoReconnect(autoReconnect);
                Serial.printf("[Branch_Wifi] Auto reconnect set to: %s\n", autoReconnect ? "true" : "false");
            }
            
            Serial.printf("[Branch_Wifi] Preferences update - Success: %s, Needs Reconnect: %s\n", 
                         success ? "Yes" : "No", needReconnect ? "Yes" : "No");
            
            if (needReconnect && !ssid.isEmpty()) {
                Serial.println("[Branch_Wifi] WiFi credentials changed, reconnecting...");
                reconnectWiFi();
            }
        }
    }
}

void Branch_Wifi::handleSystemCommand(const JsonDocument& doc) {
    Serial.println("[Branch_Wifi] 🔧 System command received");
    
    if (doc.containsKey("command")) {
        String cmd = doc["command"].as<String>();
        Serial.printf("[Branch_Wifi] Command: %s\n", cmd.c_str());
        
        if (cmd == "restart") {
            Serial.println("[Branch_Wifi] Restarting device in 3 seconds...");
            delay(3000);
            ESP.restart();
        } 
        else if (cmd == "factory_reset") {
            Serial.println("[Branch_Wifi] Factory reset requested");
            preferences->clearAllSettings();
            Serial.println("[Branch_Wifi] Factory reset complete, restarting...");
            delay(3000);
            ESP.restart();
        }
        else if (cmd == "wifi_reconnect") {
            Serial.println("[Branch_Wifi] WiFi reconnect requested");
            reconnectWiFi();
        }
        else if (cmd == "wifi_status") {
            Serial.println("[Branch_Wifi] WiFi status requested");
            printWiFiStatus();
        }
        else if (cmd == "websocket_status") {
            Serial.println("[Branch_Wifi] WebSocket status requested");
            if (webSocketHelper) {
                Serial.printf("WebSocket Server: %s\n", webSocketHelper->isServerRunning() ? "Running" : "Stopped");
                Serial.printf("Connected Clients: %d\n", webSocketHelper->getConnectedClientsCount());
                Serial.printf("Messages Received: %d\n", webSocketHelper->getMessagesReceived());
                Serial.printf("Messages Sent: %d\n", webSocketHelper->getMessagesSent());
            } else {
                Serial.println("WebSocket helper not available");
            }
        }
        else {
            Serial.printf("[Branch_Wifi] Unknown command: %s\n", cmd.c_str());
        }
    }
}

// ==========================================
// UTILITY METHODS
// ==========================================

String Branch_Wifi::getIPAddress() const {
    return WiFi.localIP().toString();
}

int Branch_Wifi::getSignalStrength() const {
    return WiFi.RSSI();
}

bool Branch_Wifi::isWebSocketActive() const {
    return webSocketHelper && webSocketHelper->isServerRunning();
}

uint8_t Branch_Wifi::getWebSocketClients() const {
    return webSocketHelper ? webSocketHelper->getConnectedClientsCount() : 0;
}

void Branch_Wifi::emitStatus() {
    Serial.printf("[Branch_Wifi] Status Update:\n");
    Serial.printf("  - Initialized: %s\n", initialized ? "Yes" : "No");
    Serial.printf("  - WiFi Connected: %s\n", isWiFiConnected() ? "Yes" : "No");
    if (isWiFiConnected()) {
        Serial.printf("  - IP Address: %s\n", getIPAddress().c_str());
        Serial.printf("  - Signal Strength: %d dBm\n", getSignalStrength());
        Serial.printf("  - HTTP Server: %s\n", httpEndpoints && httpEndpoints->isServerRunning() ? "Running" : "Stopped");
        Serial.printf("  - WebSocket Server: %s\n", webSocketHelper && webSocketHelper->isServerRunning() ? "Running" : "Stopped");
        Serial.printf("  - WebSocket Clients: %d\n", getWebSocketClients());
    }
}

void Branch_Wifi::printWiFiStatus() {
    Serial.println("[Branch_Wifi] ✅ WiFi Connected!");
    Serial.printf("  - SSID: %s\n", WiFi.SSID().c_str());
    Serial.printf("  - IP Address: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("  - Gateway: %s\n", WiFi.gatewayIP().toString().c_str());
    Serial.printf("  - DNS: %s\n", WiFi.dnsIP().toString().c_str());
    Serial.printf("  - RSSI: %d dBm\n", WiFi.RSSI());
    Serial.printf("  - Channel: %d\n", WiFi.channel());
    Serial.printf("  - MAC: %s\n", getFormattedMacAddress().c_str());
    
    // NEW: Show service availability
    Serial.println("[Branch_Wifi] Available Services:");
    Serial.printf("  - HTTP Server: http://%s/ (port 80)\n", WiFi.localIP().toString().c_str());
    Serial.printf("  - WebSocket Server: ws://%s:81/ (port 81)\n", WiFi.localIP().toString().c_str());
    Serial.printf("  - WebSocket Clients Connected: %d\n", getWebSocketClients());
}