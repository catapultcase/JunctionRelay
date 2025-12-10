#include "Branch_GatewayEthernet.h"
#include "Helper_StreamProcessor.h"
#include "Helper_HTTPEndpoints.h"
#include "Helper_WebSocket.h"
#include "Helper_Preferences.h"
#include "Helper_DeviceInfo.h"
#include "Helper_DeviceCapabilities.h"
#include "Helper_ESPNOW.h"
#include "Manager_ScreenRouter.h"
#include "DeviceConfig.h"
#include "Helper_Utils.h"

// Static instance for event handler
Branch_GatewayEthernet* Branch_GatewayEthernet::instance = nullptr;

Branch_GatewayEthernet::Branch_GatewayEthernet()
    : initialized(false),
      screenRouter(nullptr),
      preferences(nullptr),
      devicePtr(nullptr),
      deviceInfo(nullptr),
      deviceCapabilities(nullptr),
      streamProcessor(nullptr),
      httpEndpoints(nullptr),
      webSocketHelper(nullptr),
      espnowHelper(nullptr),
      lastConnectionCheck(0)
{
    instance = this;
    // Serial.println("[Branch_GatewayEthernet] Constructor called");
}

Branch_GatewayEthernet::~Branch_GatewayEthernet() {
    if (espnowHelper) {
        delete espnowHelper;
        espnowHelper = nullptr;
    }
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
    
    instance = nullptr;
    Serial.println("[Branch_GatewayEthernet] Destructor called");
}

void Branch_GatewayEthernet::init(ScreenRouter* router, Helper_Preferences* prefs, DeviceConfig* device,
                                  Helper_DeviceInfo* devInfo, Helper_DeviceCapabilities* devCaps) {
    if (!router || !prefs || !device || !devInfo || !devCaps) {
        Serial.println("[Branch_GatewayEthernet] ERROR: Required parameters are null");
        return;
    }

    screenRouter = router;
    preferences = prefs;
    devicePtr = device;
    deviceInfo = devInfo;
    deviceCapabilities = devCaps;
    
    Serial.println("[Branch_GatewayEthernet] Initializing Gateway Ethernet mode with ESP-NOW forwarding...");
    
    // Verify device supports Ethernet
    if (!devicePtr->supportsEthernet()) {
        Serial.println("[Branch_GatewayEthernet] ERROR: Device does not support Ethernet");
        return;
    }
    
    // Load device name from centralized preferences
    deviceName = preferences->getDeviceName();
    
    Serial.printf("[Branch_GatewayEthernet] Loaded settings - Device: %s\n", deviceName.c_str());
    
    // Create StreamProcessor with device pointer
    streamProcessor = new Helper_StreamProcessor(
        screenRouter,
        [this](const JsonDocument& doc) { this->handleProtocolPayload(doc); },
        [this](const JsonDocument& doc) { this->handleSystemPayload(doc); },
        devicePtr
    );
    
    // Create HTTP endpoints helper WITH device helpers injected
    httpEndpoints = new Helper_HTTPEndpoints(screenRouter, streamProcessor, deviceInfo, deviceCapabilities);
    
    // Create WebSocket helper WITH device helpers injected
    webSocketHelper = new Helper_WebSocket(streamProcessor, deviceInfo, deviceCapabilities);
    
    // Set up bidirectional callbacks for HTTP
    httpEndpoints->setProtocolCallback([this](const JsonDocument& doc) { 
        this->handleProtocolPayload(doc); 
    });
    httpEndpoints->setSystemCallback([this](const JsonDocument& doc) { 
        this->handleSystemPayload(doc); 
    });
    
    // Set up bidirectional callbacks for WebSocket
    webSocketHelper->setProtocolCallback([this](const JsonDocument& doc) { 
        this->handleProtocolPayload(doc); 
    });
    webSocketHelper->setSystemCallback([this](const JsonDocument& doc) { 
        this->handleSystemPayload(doc); 
    });
    
    // Initialize HTTP endpoints
    initializeHTTPEndpoints();
    
    // Initialize WebSocket
    initializeWebSocket();
    
    // Initialize ESP-NOW for gateway functionality
    initializeESPNow();
    
    // Initialize Ethernet connection
    initializeEthernet();
    
    // Try to connect
    if (connectToEthernet()) {
        // Ethernet connected - initialize network-dependent services
        setupMDNS();
        httpEndpoints->startServer();
        webSocketHelper->startServer();
    } else {
        Serial.println("[Branch_GatewayEthernet] Ethernet connection failed");
    }
    
    initialized = true;
    emitStatus();
    
    Serial.println("[Branch_GatewayEthernet] ✅ Gateway Ethernet mode ready with ESP-NOW forwarding");
    Serial.println("[Branch_GatewayEthernet] Gateway capabilities:");
    Serial.println("[Branch_GatewayEthernet]   - Ethernet for host communication");
    Serial.println("[Branch_GatewayEthernet]   - HTTP/WebSocket endpoints");
    Serial.println("[Branch_GatewayEthernet]   - ESP-NOW for peer forwarding");
    Serial.println("[Branch_GatewayEthernet]   - Automatic peer discovery");
    Serial.println("[Branch_GatewayEthernet]   - Bidirectional message routing");
    Serial.println("[Branch_GatewayEthernet] HTTP endpoints available:");
    Serial.println("[Branch_GatewayEthernet] GET  /api/device/info");
    Serial.println("[Branch_GatewayEthernet] GET  /api/device/capabilities");
    Serial.println("[Branch_GatewayEthernet] GET  /api/gateway/status");
    Serial.println("[Branch_GatewayEthernet] POST /api/data");
    Serial.println("[Branch_GatewayEthernet] POST /api/gateway/forward");
    Serial.println("[Branch_GatewayEthernet] WebSocket server available:");
    if (isConnected()) {
        Serial.printf("[Branch_GatewayEthernet] ws://%s:81/ (for WebSocket junctions)\n", ETH.localIP().toString().c_str());
    } else {
        Serial.println("[Branch_GatewayEthernet] ws://[device-ip]:81/ (when Ethernet connected)");
    }
}

void Branch_GatewayEthernet::loop() {
    if (!initialized) return;
    
    unsigned long currentTime = millis();
    
    // Process WebSocket events
    if (webSocketHelper) {
        webSocketHelper->loop();
    }
    
    // Check Ethernet connection periodically
    if (currentTime - lastConnectionCheck > CONNECTION_CHECK_INTERVAL) {
        lastConnectionCheck = currentTime;
        
        if (!isConnected()) {
            handleEthernetDisconnection();
        }
    }
}

// ==========================================
// INITIALIZATION METHODS
// ==========================================

void Branch_GatewayEthernet::initializeEthernet() {
    // Detect hardware configuration
    detectHardwareConfig();
    
    // Register event handler
    WiFi.onEvent(WiFiEventHandler);
    
    // Set hostname
    String hostname = deviceName.isEmpty() ? "GatewayRelay_" + getFormattedMacAddress() : deviceName;
    
    Serial.printf("[Branch_GatewayEthernet] Ethernet initialized with hostname: %s\n", hostname.c_str());
}

void Branch_GatewayEthernet::initializeHTTPEndpoints() {
    httpEndpoints->init();
    Serial.println("[Branch_GatewayEthernet] HTTP endpoints initialized");
}

void Branch_GatewayEthernet::initializeWebSocket() {
    if (!webSocketHelper) {
        Serial.println("[Branch_GatewayEthernet] ERROR: WebSocket helper not created");
        return;
    }
    
    // Initialize WebSocket server on port 81
    webSocketHelper->init(81);
    Serial.println("[Branch_GatewayEthernet] WebSocket helper initialized on port 81");
}

void Branch_GatewayEthernet::initializeESPNow() {
    // Create ESP-NOW helper with StreamProcessor for incoming data
    espnowHelper = new Helper_ESPNOW(streamProcessor);
    
    if (espnowHelper->begin()) {
        Serial.printf("[Branch_GatewayEthernet] ✅ ESP-NOW initialized for gateway. Local MAC: %s\n", 
                     espnowHelper->getLocalMacAddress().c_str());
    } else {
        Serial.println("[Branch_GatewayEthernet] ❌ Failed to initialize ESP-NOW");
        delete espnowHelper;
        espnowHelper = nullptr;
    }
}

void Branch_GatewayEthernet::setupMDNS() {
    if (!isConnected()) {
        Serial.println("[Branch_GatewayEthernet] Cannot setup mDNS - Ethernet not connected");
        return;
    }
    
    String mac = getFormattedMacAddress();
    String host = "GatewayRelay_Device_" + mac;
    
    if (MDNS.begin(host.c_str())) {
        MDNS.addService("junctionrelay-gateway", "tcp", 80);
        MDNS.addService("junctionrelay-gateway-ws", "tcp", 81);
        Serial.printf("[Branch_GatewayEthernet] mDNS started with hostname: %s\n", host.c_str());
        Serial.println("[Branch_GatewayEthernet] Services: HTTP Gateway (port 80), WebSocket Gateway (port 81)");
    } else {
        Serial.println("[Branch_GatewayEthernet] Failed to start mDNS responder");
    }
}

// ==========================================
// CONNECTION MANAGEMENT
// ==========================================

bool Branch_GatewayEthernet::connectToEthernet() {
    Serial.println("[Branch_GatewayEthernet] Connecting to Ethernet...");
    
    // Small delay for hardware settling
    delay(100);
    
    // Initialize with detected configuration
    bool success = ETH.begin(
        ethernetConfig.phyAddr,
        ethernetConfig.phyPower,
        ethernetConfig.phyMDC,
        ethernetConfig.phyMDIO,
        ethernetConfig.phyType,
        ethernetConfig.clockMode
    );
    
    if (!success) {
        Serial.println("[Branch_GatewayEthernet] Hardware initialization failed");
        return false;
    }
    
    // Set hostname
    String hostname = deviceName.isEmpty() ? "GatewayRelay_" + getFormattedMacAddress() : deviceName;
    ETH.setHostname(hostname.c_str());
    
    // Wait for connection with timeout
    unsigned long startTime = millis();
    const unsigned long timeout = 30000; // 30 seconds
    
    while (!isConnected() && (millis() - startTime) < timeout) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();
    
    if (isConnected()) {
        printConnectionStatus();
        return true;
    } else {
        Serial.println("[Branch_GatewayEthernet] Ethernet connection failed - timeout");
        return false;
    }
}

void Branch_GatewayEthernet::handleEthernetDisconnection() {
    Serial.println("[Branch_GatewayEthernet] Ethernet disconnected, stopping services and checking status...");
    
    // Stop services when Ethernet disconnects
    if (webSocketHelper && webSocketHelper->isServerRunning()) {
        webSocketHelper->stopServer();
        Serial.println("[Branch_GatewayEthernet] WebSocket server stopped due to Ethernet disconnection");
    }
    
    if (isConnected()) {
        Serial.println("[Branch_GatewayEthernet] Ethernet reconnected successfully, restarting services...");
        
        // Restart services when Ethernet reconnects
        if (webSocketHelper) {
            webSocketHelper->startServer();
            Serial.println("[Branch_GatewayEthernet] WebSocket server restarted after Ethernet reconnection");
        }
        
        emitStatus();
    } else {
        Serial.println("[Branch_GatewayEthernet] Ethernet still disconnected");
    }
}

bool Branch_GatewayEthernet::isConnected() const {
    return ETH.linkUp() && (ETH.localIP() != IPAddress(0, 0, 0, 0));
}

void Branch_GatewayEthernet::detectHardwareConfig() {
    // Default configuration for most ESP32 Ethernet boards
    ethernetConfig.phyType = ETH_PHY_LAN8720;
    ethernetConfig.phyAddr = 0;
    ethernetConfig.phyPower = -1;
    ethernetConfig.phyMDC = 23;
    ethernetConfig.phyMDIO = 18;
    ethernetConfig.clockMode = ETH_CLOCK_GPIO0_IN;
    
    // Device-specific overrides
    if (devicePtr) {
        const char* deviceModel = devicePtr->getDeviceModel();
        
        if (strstr(deviceModel, "wESP32")) {
            // Silicognition wESP32 configuration
            ethernetConfig.phyType = ETH_PHY_RTL8201;
            ethernetConfig.phyAddr = 0;
            ethernetConfig.phyPower = -1;
            ethernetConfig.phyMDC = 16;
            ethernetConfig.phyMDIO = 17;
            ethernetConfig.clockMode = ETH_CLOCK_GPIO0_IN;
            
            Serial.println("[Branch_GatewayEthernet] Detected wESP32 - using RTL8201 PHY configuration");
        }
        // Add other device-specific configurations as needed
    }
    
    Serial.printf("[Branch_GatewayEthernet] Hardware config - PHY: %d, Addr: %d, MDC: %d, MDIO: %d\n",
                  ethernetConfig.phyType, ethernetConfig.phyAddr, 
                  ethernetConfig.phyMDC, ethernetConfig.phyMDIO);
}

// ==========================================
// ESP-NOW MANAGEMENT
// ==========================================

bool Branch_GatewayEthernet::addESPNowPeerIfNeeded(const String& macAddress) {
    if (!espnowHelper || !isValidMacAddress(macAddress)) {
        return false;
    }
    
    // Check if peer already exists
    auto peers = espnowHelper->getPeers();
    for (const auto& peer : peers) {
        if (espnowHelper->macToString(peer.macAddress) == macAddress) {
            // Peer already exists, update activity
            return true;
        }
    }
    
    // Add new peer with auto-generated name
    String peerName = "Gateway_" + macAddress.substring(12); // Use last 2 bytes
    bool success = espnowHelper->addPeer(macAddress, peerName);
    
    if (success) {
        Serial.printf("[Branch_GatewayEthernet] ✅ Auto-added ESP-NOW peer: %s (%s)\n", 
                     macAddress.c_str(), peerName.c_str());
    } else {
        Serial.printf("[Branch_GatewayEthernet] ❌ Failed to add ESP-NOW peer: %s\n", macAddress.c_str());
    }
    
    return success;
}

// ==========================================
// GATEWAY STATUS METHODS
// ==========================================

bool Branch_GatewayEthernet::isESPNowReady() const {
    return espnowHelper && espnowHelper->isInitialized();
}

int Branch_GatewayEthernet::getESPNowPeerCount() const {
    return espnowHelper ? espnowHelper->getPeerCount() : 0;
}

String Branch_GatewayEthernet::getESPNowPeersJSON() const {
    return espnowHelper ? espnowHelper->getPeersJSON() : "{}";
}

// ==========================================
// STREAMPROCESSOR CALLBACK HANDLERS
// ==========================================

void Branch_GatewayEthernet::handleProtocolPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    // Serial.printf("[Branch_GatewayEthernet] 📡 PROTOCOL callback received: %s\n", type ? type : "unknown");
    
    // Check for destination-based forwarding FIRST
    if (doc.containsKey("destination")) {
        handleDestinationPayload(doc);
        return; // Don't process locally after forwarding
    }
    
    if (!type) return;
    
    if (strcmp(type, "http_request") == 0) {
        handleHTTPRequest(doc);
    }
    else if (strcmp(type, "websocket_ping") == 0) {
        handleWebSocketPing(doc);
    }
    else if (strcmp(type, "peer_management") == 0) {
        handlePeerManagementRequest(doc);
    }
    else if (strcmp(type, "gateway_status") == 0) {
        handleGatewayStatus(doc);
    }
    else if (strcmp(type, "espnow_response") == 0) {
        handleESPNowResponse(doc);
    }
    else {
        Serial.printf("[Branch_GatewayEthernet] ❓ Unhandled protocol type: %s\n", type);
    }
}

void Branch_GatewayEthernet::handleSystemPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    Serial.printf("[Branch_GatewayEthernet] ⚙️ SYSTEM callback received: %s\n", type ? type : "unknown");
    
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
        Serial.printf("[Branch_GatewayEthernet] ❓ Unhandled system type: %s\n", type);
    }
}

// ==========================================
// GATEWAY-SPECIFIC PROTOCOL HANDLERS
// ==========================================

void Branch_GatewayEthernet::handleDestinationPayload(const JsonDocument& doc) {
    String destinationMac = extractDestinationMac(doc);
    
    if (destinationMac.isEmpty() || !isValidMacAddress(destinationMac)) {
        Serial.printf("[Branch_GatewayEthernet] ❌ Invalid destination MAC in payload\n");
        return;
    }
    
    // Serial.printf("[Branch_GatewayEthernet] 🌐 Forwarding message to ESP-NOW peer: %s\n", destinationMac.c_str());
    
    if (!espnowHelper) {
        Serial.println("[Branch_GatewayEthernet] ❌ ESP-NOW not available for forwarding");
        return;
    }
    
    // Auto-add peer if needed
    addESPNowPeerIfNeeded(destinationMac);
    
    // Create forwarding payload (remove destination field to avoid loops)
    DynamicJsonDocument forwardDoc(2048);
    forwardDoc.set(doc);
    forwardDoc.remove("destination");
    
    // Add gateway metadata
    forwardDoc["gatewayMac"] = espnowHelper->getLocalMacAddress();
    forwardDoc["gatewayTimestamp"] = millis();
    forwardDoc["gatewayType"] = "ethernet";
    
    // Forward via ESP-NOW
    bool success = espnowHelper->sendJSON(destinationMac, forwardDoc);
    
    if (success) {
        // Serial.printf("[Branch_GatewayEthernet] ✅ Successfully forwarded to %s\n", destinationMac.c_str());
    } else {
        Serial.printf("[Branch_GatewayEthernet] ❌ Failed to forward to %s\n", destinationMac.c_str());
    }
    
    // Send acknowledgment back via WebSocket or HTTP if client ID is available
    if (doc.containsKey("websocketClientId")) {
        uint8_t clientId = doc["websocketClientId"].as<uint8_t>();
        StaticJsonDocument<256> ackResponse;
        ackResponse["type"] = "gateway_forward_ack";
        ackResponse["destination"] = destinationMac;
        ackResponse["status"] = success ? "sent" : "failed";
        ackResponse["timestamp"] = millis();
        ackResponse["gatewayType"] = "ethernet";
        
        if (webSocketHelper) {
            webSocketHelper->sendToClient(clientId, ackResponse);
        }
    }
}

void Branch_GatewayEthernet::handlePeerManagementRequest(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayEthernet] 👥 Processing peer management request...");
    
    if (doc.containsKey("action")) {
        String action = doc["action"].as<String>();
        uint8_t clientId = doc.containsKey("websocketClientId") ? doc["websocketClientId"].as<uint8_t>() : 0;
        
        StaticJsonDocument<256> response;
        response["type"] = "peer_management_response";
        response["action"] = action;
        response["timestamp"] = millis();
        
        if (action == "add" && doc.containsKey("peerMac")) {
            String peerMac = doc["peerMac"].as<String>();
            String peerName = doc.containsKey("peerName") ? doc["peerName"].as<String>() : "Unknown";
            
            bool success = addESPNowPeerIfNeeded(peerMac);
            response["success"] = success;
            response["peerMac"] = peerMac;
            response["message"] = success ? "Peer added successfully" : "Failed to add peer";
            
            Serial.printf("[Branch_GatewayEthernet] Peer add result: %s for %s (%s)\n", 
                         success ? "SUCCESS" : "FAILED", peerMac.c_str(), peerName.c_str());
            
        } else if (action == "remove" && doc.containsKey("peerMac")) {
            String peerMac = doc["peerMac"].as<String>();
            
            bool success = false;
            if (espnowHelper) {
                success = espnowHelper->removePeer(peerMac);
            }
            response["success"] = success;
            response["peerMac"] = peerMac;
            response["message"] = success ? "Peer removed successfully" : "Failed to remove peer";
            
        } else if (action == "list") {
            response["success"] = true;
            response["peerCount"] = getESPNowPeerCount();
            response["message"] = "Peer list available";
            
        } else {
            response["success"] = false;
            response["message"] = "Invalid peer management action";
        }
        
        // Send response back via WebSocket if client ID available
        if (webSocketHelper && clientId > 0) {
            webSocketHelper->sendToClient(clientId, response);
        }
    }
}

void Branch_GatewayEthernet::handleESPNowResponse(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayEthernet] 📨 ESP-NOW response received");
    
    // Forward ESP-NOW responses back to WebSocket clients
    forwardESPNowDataToWebSocket(doc);
}

void Branch_GatewayEthernet::handleGatewayStatus(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayEthernet] 📊 Gateway status request received");
    
    uint8_t clientId = doc.containsKey("websocketClientId") ? doc["websocketClientId"].as<uint8_t>() : 0;
    
    StaticJsonDocument<512> response;
    response["type"] = "gateway_status_response";
    response["timestamp"] = millis();
    response["gatewayMode"] = "ethernet_espnow";
    response["ethernetActive"] = isConnected();
    response["espnowActive"] = isESPNowReady();
    response["espnowPeerCount"] = getESPNowPeerCount();
    
    if (isConnected()) {
        response["ipAddress"] = getIPAddress();
        response["macAddress"] = getFormattedMacAddress();
    }
    
    if (espnowHelper) {
        response["localMac"] = espnowHelper->getLocalMacAddress();
        
        // Add ESP-NOW statistics
        String statsJSON = espnowHelper->getStatisticsJSON();
        DynamicJsonDocument statsDoc(512);
        deserializeJson(statsDoc, statsJSON);
        response["espnowStats"] = statsDoc;
    }
    
    // Send response back via WebSocket if client ID available
    if (webSocketHelper && clientId > 0) {
        webSocketHelper->sendToClient(clientId, response);
    }
}

void Branch_GatewayEthernet::handleHTTPRequest(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayEthernet] 🌍 HTTP request received");
    
    if (doc.containsKey("url") && doc.containsKey("method")) {
        String url = doc["url"].as<String>();
        String method = doc["method"].as<String>();
        
        Serial.printf("[Branch_GatewayEthernet] HTTP %s %s\n", method.c_str(), url.c_str());
        
        // Could implement HTTP client functionality here
        // For now, just log the request
    }
}

void Branch_GatewayEthernet::handleWebSocketPing(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayEthernet] 🏓 WebSocket ping request received");
    
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
        pongDoc["linkSpeed"] = ETH.linkSpeed();
        pongDoc["linkUp"] = ETH.linkUp();
        pongDoc["gatewayMode"] = "ethernet_espnow";
        pongDoc["espnowPeers"] = getESPNowPeerCount();
        
        if (clientId > 0) {
            webSocketHelper->sendToClient(clientId, pongDoc);
            Serial.printf("[Branch_GatewayEthernet] Sent WebSocket pong to client %d\n", clientId);
        } else {
            webSocketHelper->broadcastData(pongDoc);
            Serial.println("[Branch_GatewayEthernet] Broadcast WebSocket pong to all clients");
        }
    } else {
        Serial.println("[Branch_GatewayEthernet] WebSocket server not available for pong response");
    }
}

// ==========================================
// ESP-NOW DATA FORWARDING
// ==========================================

void Branch_GatewayEthernet::handleESPNowIncomingData(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayEthernet] 📥 ESP-NOW data received, forwarding to WebSocket/HTTP");
    
    // Forward ESP-NOW data to network clients
    forwardESPNowDataToWebSocket(doc);
}

void Branch_GatewayEthernet::forwardESPNowDataToWebSocket(const JsonDocument& doc) {
    if (!webSocketHelper || !webSocketHelper->isServerRunning()) {
        Serial.println("[Branch_GatewayEthernet] WebSocket server not available for ESP-NOW forwarding");
        return;
    }
    
    // Wrap ESP-NOW data in gateway envelope
    StaticJsonDocument<2048> envelope;
    envelope["type"] = "espnow_data";
    envelope["timestamp"] = millis();
    envelope["gatewayMac"] = espnowHelper ? espnowHelper->getLocalMacAddress() : "";
    envelope["gatewayType"] = "ethernet";
    
    // Add source information if available
    if (doc.containsKey("gatewayMac")) {
        envelope["sourceMac"] = doc["gatewayMac"];
    }
    if (doc.containsKey("gatewayTimestamp")) {
        envelope["sourceTimestamp"] = doc["gatewayTimestamp"];
    }
    
    // Embed the original data
    envelope["data"] = doc;
    
    // Broadcast to all WebSocket clients
    webSocketHelper->broadcastData(envelope);
    
    Serial.println("[Branch_GatewayEthernet] ✅ ESP-NOW data forwarded to WebSocket clients");
}

void Branch_GatewayEthernet::forwardESPNowDataToHTTP(const JsonDocument& doc) {
    // Could implement HTTP forwarding to external endpoints here
    // For now, just log that it would be forwarded
    Serial.println("[Branch_GatewayEthernet] HTTP forwarding not implemented");
}

// ==========================================
// SYSTEM HANDLERS USING INJECTED HELPERS
// ==========================================

void Branch_GatewayEthernet::handleDeviceInfoRequest(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayEthernet] 📱 Device info request received");
    
    if (!deviceInfo) {
        Serial.println("[Branch_GatewayEthernet] ERROR: deviceInfo helper not available");
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

void Branch_GatewayEthernet::handleDeviceCapabilitiesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayEthernet] 🔧 Device capabilities request received");
    
    if (!deviceCapabilities) {
        Serial.println("[Branch_GatewayEthernet] ERROR: deviceCapabilities helper not available");
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

void Branch_GatewayEthernet::handleStatsRequest(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayEthernet] 📊 Stats request received");
    
    // Show Ethernet-specific stats
    Serial.printf("[Branch_GatewayEthernet] Ethernet Status:\n");
    Serial.printf("  - Connected: %s\n", isConnected() ? "Yes" : "No");
    if (isConnected()) {
        Serial.printf("  - IP: %s\n", getIPAddress().c_str());
        Serial.printf("  - MAC: %s\n", getFormattedMacAddress().c_str());
        Serial.printf("  - Speed: %d Mbps\n", ETH.linkSpeed());
        Serial.printf("  - Duplex: %s\n", ETH.fullDuplex() ? "Full" : "Half");
        Serial.printf("  - Gateway: %s\n", ETH.gatewayIP().toString().c_str());
    }
    
    // Show WebSocket stats
    if (webSocketHelper) {
        Serial.printf("[Branch_GatewayEthernet] WebSocket Status:\n");
        Serial.printf("  - Server Running: %s\n", webSocketHelper->isServerRunning() ? "Yes" : "No");
        Serial.printf("  - Connected Clients: %d\n", webSocketHelper->getConnectedClientsCount());
        Serial.printf("  - Messages Received: %d\n", webSocketHelper->getMessagesReceived());
        Serial.printf("  - Messages Sent: %d\n", webSocketHelper->getMessagesSent());
        Serial.printf("  - Errors: %d\n", webSocketHelper->getErrorCount());
    }
    
    // Show ESP-NOW stats
    if (espnowHelper) {
        Serial.printf("[Branch_GatewayEthernet] ESP-NOW Status:\n");
        Serial.printf("  - Active: %s\n", isESPNowReady() ? "Yes" : "No");
        Serial.printf("  - Peer Count: %d\n", getESPNowPeerCount());
        
        String espnowStatsJSON = espnowHelper->getStatisticsJSON();
        StaticJsonDocument<512> espnowStatsDoc;
        deserializeJson(espnowStatsDoc, espnowStatsJSON);
        
        if (espnowStatsDoc.containsKey("messagesSent")) {
            Serial.printf("  - Messages Sent: %d\n", espnowStatsDoc["messagesSent"].as<int>());
        }
        if (espnowStatsDoc.containsKey("messagesReceived")) {
            Serial.printf("  - Messages Received: %d\n", espnowStatsDoc["messagesReceived"].as<int>());
        }
        if (espnowStatsDoc.containsKey("errors")) {
            Serial.printf("  - Errors: %d\n", espnowStatsDoc["errors"].as<int>());
        }
    }
    
    // Show queue status from StreamProcessor
    if (streamProcessor) {
        auto queueStatus = streamProcessor->getQueueStatus();
        Serial.printf("[Branch_GatewayEthernet] Queue Status:\n");
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
        Serial.println("[Branch_GatewayEthernet] ERROR: deviceInfo helper not available for stats");
    }
}

void Branch_GatewayEthernet::handlePreferencesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayEthernet] ⚙️ Preferences request received");
    
    if (doc.containsKey("action")) {
        String action = doc["action"].as<String>();
        Serial.printf("[Branch_GatewayEthernet] Preferences action: %s\n", action.c_str());
        
        if (action == "get") {
            // Return current preferences (Gateway Ethernet has limited settings)
            Serial.println("=== CURRENT GATEWAY ETHERNET PREFERENCES ===");
            Serial.printf("Device Name: %s\n", deviceName.c_str());
            Serial.printf("Gateway Mode: ethernet_espnow\n");
            Serial.println("=== END PREFERENCES ===");
        }
        else if (action == "set" && doc.containsKey("data")) {
            // Update preferences using centralized system
            JsonObjectConst data = doc["data"];
            
            bool success = true;
            
            if (data.containsKey("deviceName")) {
                String newName = data["deviceName"].as<String>();
                preferences->setDeviceName(newName);
                deviceName = newName;
                Serial.printf("[Branch_GatewayEthernet] Device name updated to: %s\n", deviceName.c_str());
            }

            // Connection mode
            if (data.containsKey("connMode")) {
                String connMode = data["connMode"].as<String>();
                preferences->setConnectionModeString(connMode);
                Serial.printf("[Branch_GatewayEthernet] Connection mode updated to: %s\n", connMode.c_str());
            }

            // Display rotation
            if (data.containsKey("rotation")) {
                int rotation = data["rotation"].as<int>();
                preferences->setDisplayRotation(rotation);
                Serial.printf("[Branch_GatewayEthernet] Display rotation updated to: %d\n", rotation);
            }

            // Matrix B/G channel swap
            if (data.containsKey("swapBlueGreen")) {
                bool swapBG = data["swapBlueGreen"].as<bool>();
                preferences->setSwapBlueGreen(swapBG);
                Serial.printf("[Branch_GatewayEthernet] Swap B/G channels set to: %s\n", swapBG ? "true" : "false");
            }

            // MQTT settings
            if (data.containsKey("mqttBroker")) {
                String mqttBroker = data["mqttBroker"].as<String>();
                preferences->setMQTTBroker(mqttBroker);
                Serial.printf("[Branch_GatewayEthernet] MQTT broker updated to: %s\n", mqttBroker.c_str());
            }

            if (data.containsKey("mqttUsername")) {
                String mqttUsername = data["mqttUsername"].as<String>();
                preferences->setMQTTUsername(mqttUsername);
                Serial.printf("[Branch_GatewayEthernet] MQTT username updated to: %s\n", mqttUsername.c_str());
            }

            if (data.containsKey("mqttPassword")) {
                String mqttPassword = data["mqttPassword"].as<String>();
                if (mqttPassword.length() > 0) {
                    preferences->setMQTTPassword(mqttPassword);
                    Serial.println("[Branch_GatewayEthernet] MQTT password updated");
                } else {
                    Serial.println("[Branch_GatewayEthernet] Skipping empty MQTT password (keeping existing)");
                }
            }

            // External NeoPixel pins
            if (data.containsKey("externalNeoPixelsData1")) {
                String neoPixel1 = data["externalNeoPixelsData1"].as<String>();
                preferences->setExternalNeoPixelsData1(neoPixel1);
                Serial.printf("[Branch_GatewayEthernet] External NeoPixels Data1 updated to: %s\n", neoPixel1.c_str());
            }

            if (data.containsKey("externalNeoPixelsData2")) {
                String neoPixel2 = data["externalNeoPixelsData2"].as<String>();
                preferences->setExternalNeoPixelsData2(neoPixel2);
                Serial.printf("[Branch_GatewayEthernet] External NeoPixels Data2 updated to: %s\n", neoPixel2.c_str());
            }

            Serial.printf("[Branch_GatewayEthernet] Preferences update - Success: %s\n", success ? "Yes" : "No");

            // Handle restart flag (apply at the very end after all settings are saved)
            if (data.containsKey("restart") && data["restart"].as<bool>()) {
                Serial.println("[Branch_GatewayEthernet] Restart requested, restarting device in 2 seconds...");
                delay(2000);
                ESP.restart();
            }
        }
    }
}

void Branch_GatewayEthernet::handleSystemCommand(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayEthernet] 🔧 System command received");
    
    if (doc.containsKey("command")) {
        String cmd = doc["command"].as<String>();
        Serial.printf("[Branch_GatewayEthernet] Command: %s\n", cmd.c_str());
        
        if (cmd == "restart") {
            Serial.println("[Branch_GatewayEthernet] Restarting device in 3 seconds...");
            delay(3000);
            ESP.restart();
        } 
        else if (cmd == "factory_reset") {
            Serial.println("[Branch_GatewayEthernet] Factory reset requested");
            preferences->clearAllSettings();
            Serial.println("[Branch_GatewayEthernet] Factory reset complete, restarting...");
            delay(3000);
            ESP.restart();
        }
        else if (cmd == "ethernet_status") {
            Serial.println("[Branch_GatewayEthernet] Ethernet status requested");
            printConnectionStatus();
        }
        else if (cmd == "websocket_status") {
            Serial.println("[Branch_GatewayEthernet] WebSocket status requested");
            if (webSocketHelper) {
                Serial.printf("WebSocket Server: %s\n", webSocketHelper->isServerRunning() ? "Running" : "Stopped");
                Serial.printf("Connected Clients: %d\n", webSocketHelper->getConnectedClientsCount());
                Serial.printf("Messages Received: %d\n", webSocketHelper->getMessagesReceived());
                Serial.printf("Messages Sent: %d\n", webSocketHelper->getMessagesSent());
            } else {
                Serial.println("WebSocket helper not available");
            }
        }
        else if (cmd == "espnow_status") {
            Serial.println("[Branch_GatewayEthernet] ESP-NOW status requested");
            if (espnowHelper) {
                Serial.printf("ESP-NOW Active: %s\n", isESPNowReady() ? "Yes" : "No");
                Serial.printf("Local MAC: %s\n", espnowHelper->getLocalMacAddress().c_str());
                Serial.printf("Peer Count: %d\n", getESPNowPeerCount());
                
                String statsJSON = espnowHelper->getStatisticsJSON();
                Serial.printf("Statistics: %s\n", statsJSON.c_str());
            } else {
                Serial.println("ESP-NOW helper not available");
            }
        }
        else if (cmd == "gateway_reset") {
            Serial.println("[Branch_GatewayEthernet] Gateway reset requested - clearing ESP-NOW peers");
            if (espnowHelper) {
                espnowHelper->clearPeers();
                Serial.println("ESP-NOW peers cleared");
            }
        }
        else {
            Serial.printf("[Branch_GatewayEthernet] Unknown command: %s\n", cmd.c_str());
        }
    }
}

// ==========================================
// ETHERNET EVENT HANDLING
// ==========================================

void Branch_GatewayEthernet::handleEthernetEvent(WiFiEvent_t event) {
    switch (event) {
        case ARDUINO_EVENT_ETH_START:
            Serial.println("[Branch_GatewayEthernet] Ethernet Started");
            break;
            
        case ARDUINO_EVENT_ETH_CONNECTED:
            Serial.println("[Branch_GatewayEthernet] Ethernet Connected");
            break;
            
        case ARDUINO_EVENT_ETH_GOT_IP:
            Serial.printf("[Branch_GatewayEthernet] ✅ Got IP: %s\n", ETH.localIP().toString().c_str());
            updateConnectionState(true);
            break;
            
        case ARDUINO_EVENT_ETH_DISCONNECTED:
            Serial.println("[Branch_GatewayEthernet] ❌ Ethernet Disconnected");
            updateConnectionState(false);
            break;
            
        case ARDUINO_EVENT_ETH_STOP:
            Serial.println("[Branch_GatewayEthernet] Ethernet Stopped");
            updateConnectionState(false);
            break;
            
        default:
            break;
    }
}

void Branch_GatewayEthernet::updateConnectionState(bool connected) {
    if (connected) {
        Serial.printf("[Branch_GatewayEthernet] 📶 CONNECTED: %s\n", getIPAddress().c_str());
        
        // Start services when Ethernet connects
        if (webSocketHelper && !webSocketHelper->isServerRunning()) {
            webSocketHelper->startServer();
            Serial.println("[Branch_GatewayEthernet] WebSocket server started after Ethernet connection");
        }
        
        emitStatus();
    } else {
        Serial.println("[Branch_GatewayEthernet] 📵 DISCONNECTED");
        
        // Stop services when Ethernet disconnects
        if (webSocketHelper && webSocketHelper->isServerRunning()) {
            webSocketHelper->stopServer();
            Serial.println("[Branch_GatewayEthernet] WebSocket server stopped due to Ethernet disconnection");
        }
        
        emitStatus();
    }
}

// Static event handler
void Branch_GatewayEthernet::WiFiEventHandler(WiFiEvent_t event) {
    if (instance) {
        instance->handleEthernetEvent(event);
    }
}

// ==========================================
// UTILITY METHODS
// ==========================================

String Branch_GatewayEthernet::getIPAddress() const {
    return ETH.localIP().toString();
}

bool Branch_GatewayEthernet::isWebSocketActive() const {
    return webSocketHelper && webSocketHelper->isServerRunning();
}

uint8_t Branch_GatewayEthernet::getWebSocketClients() const {
    return webSocketHelper ? webSocketHelper->getConnectedClientsCount() : 0;
}

void Branch_GatewayEthernet::emitStatus() {
    Serial.printf("[Branch_GatewayEthernet] Status Update:\n");
    Serial.printf("  - Initialized: %s\n", initialized ? "Yes" : "No");
    Serial.printf("  - Ethernet Connected: %s\n", isConnected() ? "Yes" : "No");
    if (isConnected()) {
        Serial.printf("  - IP Address: %s\n", getIPAddress().c_str());
        Serial.printf("  - Link Speed: %d Mbps\n", ETH.linkSpeed());
        Serial.printf("  - HTTP Server: %s\n", httpEndpoints && httpEndpoints->isServerRunning() ? "Running" : "Stopped");
        Serial.printf("  - WebSocket Server: %s\n", webSocketHelper && webSocketHelper->isServerRunning() ? "Running" : "Stopped");
        Serial.printf("  - WebSocket Clients: %d\n", getWebSocketClients());
    }
    Serial.printf("  - ESP-NOW Active: %s\n", isESPNowReady() ? "Yes" : "No");
    Serial.printf("  - ESP-NOW Peers: %d\n", getESPNowPeerCount());
}

void Branch_GatewayEthernet::printConnectionStatus() {
    Serial.println("[Branch_GatewayEthernet] ✅ Ethernet Connected!");
    Serial.printf("  - IP Address: %s\n", ETH.localIP().toString().c_str());
    Serial.printf("  - Subnet Mask: %s\n", ETH.subnetMask().toString().c_str());
    Serial.printf("  - Gateway: %s\n", ETH.gatewayIP().toString().c_str());
    Serial.printf("  - DNS: %s\n", ETH.dnsIP().toString().c_str());
    Serial.printf("  - MAC: %s\n", getFormattedMacAddress().c_str());
    Serial.printf("  - Link Speed: %d Mbps\n", ETH.linkSpeed());
    Serial.printf("  - Full Duplex: %s\n", ETH.fullDuplex() ? "Yes" : "No");
    
    // Show service availability
    Serial.println("[Branch_GatewayEthernet] Available Services:");
    Serial.printf("  - HTTP Gateway Server: http://%s/ (port 80)\n", ETH.localIP().toString().c_str());
    Serial.printf("  - WebSocket Gateway Server: ws://%s:81/ (port 81)\n", ETH.localIP().toString().c_str());
    Serial.printf("  - WebSocket Clients Connected: %d\n", getWebSocketClients());
    
    // Show ESP-NOW gateway info
    Serial.println("[Branch_GatewayEthernet] ESP-NOW Gateway:");
    Serial.printf("  - ESP-NOW Active: %s\n", isESPNowReady() ? "Yes" : "No");
    if (espnowHelper) {
        Serial.printf("  - Local ESP-NOW MAC: %s\n", espnowHelper->getLocalMacAddress().c_str());
        Serial.printf("  - Peer Count: %d\n", getESPNowPeerCount());
    }
}

String Branch_GatewayEthernet::extractDestinationMac(const JsonDocument& doc) {
    if (doc.containsKey("destination")) {
        return doc["destination"].as<String>();
    }
    return "";
}

bool Branch_GatewayEthernet::isValidMacAddress(const String& mac) {
    return Helper_ESPNOW::isValidMacString(mac);
}