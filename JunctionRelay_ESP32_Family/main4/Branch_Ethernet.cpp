#include "Branch_Ethernet.h"
#include "Helper_StreamProcessor.h"
#include "Helper_HTTPEndpoints.h"
#include "Helper_WebSocket.h"
#include "Helper_Preferences.h"
#include "Helper_DeviceInfo.h"
#include "Helper_DeviceCapabilities.h"
#include "Manager_ScreenRouter.h"
#include "DeviceConfig.h"
#include "Helper_Utils.h"

// Static instance for event handler
Branch_Ethernet* Branch_Ethernet::instance = nullptr;

Branch_Ethernet::Branch_Ethernet()
    : initialized(false),
      screenRouter(nullptr),
      preferences(nullptr),
      devicePtr(nullptr),
      deviceInfo(nullptr),
      deviceCapabilities(nullptr),
      streamProcessor(nullptr),
      httpEndpoints(nullptr),
      webSocketHelper(nullptr),  // NEW
      lastConnectionCheck(0)
{
    instance = this;
    // Serial.println("[Branch_Ethernet] Constructor called");
}

Branch_Ethernet::~Branch_Ethernet() {
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
    Serial.println("[Branch_Ethernet] Destructor called");
}

void Branch_Ethernet::init(ScreenRouter* router, Helper_Preferences* prefs, DeviceConfig* device,
                          Helper_DeviceInfo* devInfo, Helper_DeviceCapabilities* devCaps) {
    if (!router || !prefs || !device || !devInfo || !devCaps) {
        Serial.println("[Branch_Ethernet] ERROR: Required parameters are null");
        return;
    }

    screenRouter = router;
    preferences = prefs;
    devicePtr = device;
    deviceInfo = devInfo;
    deviceCapabilities = devCaps;
    
    Serial.println("[Branch_Ethernet] Initializing Ethernet mode with HTTP and WebSocket support...");
    
    // Verify device supports Ethernet
    if (!devicePtr->supportsEthernet()) {
        Serial.println("[Branch_Ethernet] ERROR: Device does not support Ethernet");
        return;
    }
    
    // Load device name from centralized preferences
    deviceName = preferences->getDeviceName();
    
    Serial.printf("[Branch_Ethernet] Loaded settings - Device: %s\n", deviceName.c_str());
    
    // Create StreamProcessor with device pointer
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
    
    // Initialize Ethernet connection
    initializeEthernet();
    
    // Try to connect
    if (connectToEthernet()) {
        // Ethernet connected - initialize network-dependent services
        setupMDNS();
        httpEndpoints->startServer();
        webSocketHelper->startServer();  // NEW: Start WebSocket server
    } else {
        Serial.println("[Branch_Ethernet] Ethernet connection failed");
    }
    
    initialized = true;
    emitStatus();
    
    Serial.println("[Branch_Ethernet] Ethernet mode ready with HTTP and WebSocket support");
    Serial.println("[Branch_Ethernet] HTTP endpoints available:");
    Serial.println("[Branch_Ethernet] GET  /api/device/info");
    Serial.println("[Branch_Ethernet] GET  /api/device/capabilities");
    Serial.println("[Branch_Ethernet] GET  /api/device/capabilities?detailed=true");
    Serial.println("[Branch_Ethernet] GET  /api/system/stats");
    Serial.println("[Branch_Ethernet] GET  /api/connection/status");
    Serial.println("[Branch_Ethernet] GET  /api/health/heartbeat");
    Serial.println("[Branch_Ethernet] POST /api/data");
    // NEW: WebSocket information
    Serial.println("[Branch_Ethernet] WebSocket server available:");
    if (isConnected()) {
        Serial.printf("[Branch_Ethernet] ws://%s:81/ (for WebSocket junctions)\n", ETH.localIP().toString().c_str());
    } else {
        Serial.println("[Branch_Ethernet] ws://[device-ip]:81/ (when Ethernet connected)");
    }
}

void Branch_Ethernet::loop() {
    if (!initialized) return;
    
    unsigned long currentTime = millis();
    
    // NEW: Process WebSocket events
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

void Branch_Ethernet::initializeEthernet() {
    // Detect hardware configuration
    detectHardwareConfig();
    
    // Register event handler
    WiFi.onEvent(WiFiEventHandler);
    
    // Set hostname
    String hostname = deviceName.isEmpty() ? "JunctionRelay_" + getFormattedMacAddress() : deviceName;
    
    Serial.printf("[Branch_Ethernet] Ethernet initialized with hostname: %s\n", hostname.c_str());
}

void Branch_Ethernet::initializeHTTPEndpoints() {
    httpEndpoints->init();
    Serial.println("[Branch_Ethernet] HTTP endpoints initialized");
}

void Branch_Ethernet::initializeWebSocket() {
    if (!webSocketHelper) {
        Serial.println("[Branch_Ethernet] ERROR: WebSocket helper not created");
        return;
    }
    
    // Initialize WebSocket server on port 81 (standard for ESP32)
    webSocketHelper->init(81);
    Serial.println("[Branch_Ethernet] WebSocket helper initialized on port 81");
}

void Branch_Ethernet::setupMDNS() {
    if (!isConnected()) {
        Serial.println("[Branch_Ethernet] Cannot setup mDNS - Ethernet not connected");
        return;
    }
    
    String mac = getFormattedMacAddress();
    String host = "JunctionRelay_Device_" + mac;
    
    if (MDNS.begin(host.c_str())) {
        MDNS.addService("junctionrelay", "tcp", 80);
        MDNS.addService("junctionrelay-ws", "tcp", 81);  // NEW: WebSocket service
        Serial.printf("[Branch_Ethernet] mDNS started with hostname: %s\n", host.c_str());
        Serial.println("[Branch_Ethernet] Services: HTTP (port 80), WebSocket (port 81)");
    } else {
        Serial.println("[Branch_Ethernet] Failed to start mDNS responder");
    }
}

// ==========================================
// CONNECTION MANAGEMENT
// ==========================================

bool Branch_Ethernet::connectToEthernet() {
    Serial.println("[Branch_Ethernet] Connecting to Ethernet...");
    
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
        Serial.println("[Branch_Ethernet] Hardware initialization failed");
        return false;
    }
    
    // Set hostname
    String hostname = deviceName.isEmpty() ? "JunctionRelay_" + getFormattedMacAddress() : deviceName;
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
        Serial.println("[Branch_Ethernet] Ethernet connection failed - timeout");
        return false;
    }
}

void Branch_Ethernet::handleEthernetDisconnection() {
    Serial.println("[Branch_Ethernet] Ethernet disconnected, stopping services and checking status...");
    
    // Stop WebSocket server when Ethernet disconnects
    if (webSocketHelper && webSocketHelper->isServerRunning()) {
        webSocketHelper->stopServer();
        Serial.println("[Branch_Ethernet] WebSocket server stopped due to Ethernet disconnection");
    }
    
    if (isConnected()) {
        Serial.println("[Branch_Ethernet] Ethernet reconnected successfully, restarting services...");
        
        // Restart WebSocket server when Ethernet reconnects
        if (webSocketHelper) {
            webSocketHelper->startServer();
            Serial.println("[Branch_Ethernet] WebSocket server restarted after Ethernet reconnection");
        }
        
        emitStatus();
    } else {
        Serial.println("[Branch_Ethernet] Ethernet still disconnected");
    }
}

bool Branch_Ethernet::isConnected() const {
    return ETH.linkUp() && (ETH.localIP() != IPAddress(0, 0, 0, 0));
}

void Branch_Ethernet::detectHardwareConfig() {
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
            
            Serial.println("[Branch_Ethernet] Detected wESP32 - using RTL8201 PHY configuration");
        }
        // Add other device-specific configurations as needed
    }
    
    Serial.printf("[Branch_Ethernet] Hardware config - PHY: %d, Addr: %d, MDC: %d, MDIO: %d\n",
                  ethernetConfig.phyType, ethernetConfig.phyAddr, 
                  ethernetConfig.phyMDC, ethernetConfig.phyMDIO);
}

// ==========================================
// STREAMPROCESSOR CALLBACK HANDLERS
// ==========================================

void Branch_Ethernet::handleProtocolPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    Serial.printf("[Branch_Ethernet] 📡 PROTOCOL callback received: %s\n", type ? type : "unknown");
    
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
        // This would be for gateway forwarding (not applicable in ethernet mode)
        String dest = doc["destination"].as<String>();
        Serial.printf("[Branch_Ethernet] 🌐 Gateway forwarding to: %s - not supported in Ethernet mode\n", dest.c_str());
    }
    else {
        Serial.printf("[Branch_Ethernet] ❓ Unhandled protocol type: %s\n", type);
    }
}

void Branch_Ethernet::handleSystemPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    Serial.printf("[Branch_Ethernet] ⚙️ SYSTEM callback received: %s\n", type ? type : "unknown");
    
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
        Serial.printf("[Branch_Ethernet] ❓ Unhandled system type: %s\n", type);
    }
}

// ==========================================
// PROTOCOL-SPECIFIC HANDLERS
// ==========================================

void Branch_Ethernet::handleHTTPRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Ethernet] 🌍 HTTP request received");
    
    if (doc.containsKey("url") && doc.containsKey("method")) {
        String url = doc["url"].as<String>();
        String method = doc["method"].as<String>();
        
        Serial.printf("[Branch_Ethernet] HTTP %s %s\n", method.c_str(), url.c_str());
        
        // Could implement HTTP client functionality here
        // For now, just log the request
    }
}

void Branch_Ethernet::handleWebSocketPing(const JsonDocument& doc) {
    Serial.println("[Branch_Ethernet] 🏓 WebSocket ping request received");
    
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
        
        if (clientId > 0) {
            webSocketHelper->sendToClient(clientId, pongDoc);
            Serial.printf("[Branch_Ethernet] Sent WebSocket pong to client %d\n", clientId);
        } else {
            webSocketHelper->broadcastData(pongDoc);
            Serial.println("[Branch_Ethernet] Broadcast WebSocket pong to all clients");
        }
    } else {
        Serial.println("[Branch_Ethernet] WebSocket server not available for pong response");
    }
}

void Branch_Ethernet::handleGatewayForward(const JsonDocument& doc) {
    Serial.println("[Branch_Ethernet] 🌐 Gateway forward request received (not supported in Ethernet mode)");
    
    // Extract client ID if available
    uint8_t clientId = doc.containsKey("websocketClientId") ? doc["websocketClientId"].as<uint8_t>() : 0;
    
    if (webSocketHelper && clientId > 0) {
        // Send error response
        DynamicJsonDocument errorDoc(256);
        errorDoc["type"] = "gateway-forward-error";
        errorDoc["error"] = "Gateway forwarding not supported in Ethernet mode";
        errorDoc["suggestion"] = "Use Gateway USB or Gateway Ethernet mode for ESP-NOW forwarding";
        errorDoc["timestamp"] = millis();
        
        webSocketHelper->sendToClient(clientId, errorDoc);
        Serial.printf("[Branch_Ethernet] Sent gateway error response to client %d\n", clientId);
    }
}

// ==========================================
// SYSTEM HANDLERS USING INJECTED HELPERS
// ==========================================

void Branch_Ethernet::handleDeviceInfoRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Ethernet] 📱 Device info request received");
    
    if (!deviceInfo) {
        Serial.println("[Branch_Ethernet] ERROR: deviceInfo helper not available");
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

void Branch_Ethernet::handleDeviceCapabilitiesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Ethernet] 🔧 Device capabilities request received");
    
    if (!deviceCapabilities) {
        Serial.println("[Branch_Ethernet] ERROR: deviceCapabilities helper not available");
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

void Branch_Ethernet::handleStatsRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Ethernet] 📊 Stats request received");
    
    // Show Ethernet-specific stats
    Serial.printf("[Branch_Ethernet] Ethernet Status:\n");
    Serial.printf("  - Connected: %s\n", isConnected() ? "Yes" : "No");
    if (isConnected()) {
        Serial.printf("  - IP: %s\n", getIPAddress().c_str());
        Serial.printf("  - MAC: %s\n", getFormattedMacAddress().c_str());
        Serial.printf("  - Speed: %d Mbps\n", ETH.linkSpeed());
        Serial.printf("  - Duplex: %s\n", ETH.fullDuplex() ? "Full" : "Half");
        Serial.printf("  - Gateway: %s\n", ETH.gatewayIP().toString().c_str());
    }
    
    // NEW: Show WebSocket stats
    if (webSocketHelper) {
        Serial.printf("[Branch_Ethernet] WebSocket Status:\n");
        Serial.printf("  - Server Running: %s\n", webSocketHelper->isServerRunning() ? "Yes" : "No");
        Serial.printf("  - Connected Clients: %d\n", webSocketHelper->getConnectedClientsCount());
        Serial.printf("  - Messages Received: %d\n", webSocketHelper->getMessagesReceived());
        Serial.printf("  - Messages Sent: %d\n", webSocketHelper->getMessagesSent());
        Serial.printf("  - Errors: %d\n", webSocketHelper->getErrorCount());
    }
    
    // Show queue status from StreamProcessor
    if (streamProcessor) {
        auto queueStatus = streamProcessor->getQueueStatus();
        Serial.printf("[Branch_Ethernet] Queue Status:\n");
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
        Serial.println("[Branch_Ethernet] ERROR: deviceInfo helper not available for stats");
    }
}

void Branch_Ethernet::handlePreferencesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Ethernet] ⚙️ Preferences request received");
    
    if (doc.containsKey("action")) {
        String action = doc["action"].as<String>();
        Serial.printf("[Branch_Ethernet] Preferences action: %s\n", action.c_str());
        
        if (action == "get") {
            // Return current preferences (Ethernet doesn't have specific settings like WiFi)
            Serial.println("=== CURRENT ETHERNET PREFERENCES ===");
            Serial.printf("Device Name: %s\n", deviceName.c_str());
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
                Serial.printf("[Branch_Ethernet] Device name updated to: %s\n", deviceName.c_str());
            }
            
            Serial.printf("[Branch_Ethernet] Preferences update - Success: %s\n", success ? "Yes" : "No");
        }
    }
}

void Branch_Ethernet::handleSystemCommand(const JsonDocument& doc) {
    Serial.println("[Branch_Ethernet] 🔧 System command received");
    
    if (doc.containsKey("command")) {
        String cmd = doc["command"].as<String>();
        Serial.printf("[Branch_Ethernet] Command: %s\n", cmd.c_str());
        
        if (cmd == "restart") {
            Serial.println("[Branch_Ethernet] Restarting device in 3 seconds...");
            delay(3000);
            ESP.restart();
        } 
        else if (cmd == "factory_reset") {
            Serial.println("[Branch_Ethernet] Factory reset requested");
            preferences->clearAllSettings();
            Serial.println("[Branch_Ethernet] Factory reset complete, restarting...");
            delay(3000);
            ESP.restart();
        }
        else if (cmd == "ethernet_status") {
            Serial.println("[Branch_Ethernet] Ethernet status requested");
            printConnectionStatus();
        }
        else if (cmd == "websocket_status") {
            Serial.println("[Branch_Ethernet] WebSocket status requested");
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
            Serial.printf("[Branch_Ethernet] Unknown command: %s\n", cmd.c_str());
        }
    }
}

// ==========================================
// ETHERNET EVENT HANDLING
// ==========================================

void Branch_Ethernet::handleEthernetEvent(WiFiEvent_t event) {
    switch (event) {
        case ARDUINO_EVENT_ETH_START:
            Serial.println("[Branch_Ethernet] Ethernet Started");
            break;
            
        case ARDUINO_EVENT_ETH_CONNECTED:
            Serial.println("[Branch_Ethernet] Ethernet Connected");
            break;
            
        case ARDUINO_EVENT_ETH_GOT_IP:
            Serial.printf("[Branch_Ethernet] ✅ Got IP: %s\n", ETH.localIP().toString().c_str());
            updateConnectionState(true);
            break;
            
        case ARDUINO_EVENT_ETH_DISCONNECTED:
            Serial.println("[Branch_Ethernet] ❌ Ethernet Disconnected");
            updateConnectionState(false);
            break;
            
        case ARDUINO_EVENT_ETH_STOP:
            Serial.println("[Branch_Ethernet] Ethernet Stopped");
            updateConnectionState(false);
            break;
            
        default:
            break;
    }
}

void Branch_Ethernet::updateConnectionState(bool connected) {
    if (connected) {
        Serial.printf("[Branch_Ethernet] 📶 CONNECTED: %s\n", getIPAddress().c_str());
        
        // Start WebSocket server when Ethernet connects
        if (webSocketHelper && !webSocketHelper->isServerRunning()) {
            webSocketHelper->startServer();
            Serial.println("[Branch_Ethernet] WebSocket server started after Ethernet connection");
        }
        
        emitStatus();
    } else {
        Serial.println("[Branch_Ethernet] 📵 DISCONNECTED");
        
        // Stop WebSocket server when Ethernet disconnects
        if (webSocketHelper && webSocketHelper->isServerRunning()) {
            webSocketHelper->stopServer();
            Serial.println("[Branch_Ethernet] WebSocket server stopped due to Ethernet disconnection");
        }
        
        emitStatus();
    }
}

// Static event handler
void Branch_Ethernet::WiFiEventHandler(WiFiEvent_t event) {
    if (instance) {
        instance->handleEthernetEvent(event);
    }
}

// ==========================================
// UTILITY METHODS
// ==========================================

String Branch_Ethernet::getIPAddress() const {
    return ETH.localIP().toString();
}

bool Branch_Ethernet::isWebSocketActive() const {
    return webSocketHelper && webSocketHelper->isServerRunning();
}

uint8_t Branch_Ethernet::getWebSocketClients() const {
    return webSocketHelper ? webSocketHelper->getConnectedClientsCount() : 0;
}

void Branch_Ethernet::emitStatus() {
    Serial.printf("[Branch_Ethernet] Status Update:\n");
    Serial.printf("  - Initialized: %s\n", initialized ? "Yes" : "No");
    Serial.printf("  - Ethernet Connected: %s\n", isConnected() ? "Yes" : "No");
    if (isConnected()) {
        Serial.printf("  - IP Address: %s\n", getIPAddress().c_str());
        Serial.printf("  - Link Speed: %d Mbps\n", ETH.linkSpeed());
        Serial.printf("  - HTTP Server: %s\n", httpEndpoints && httpEndpoints->isServerRunning() ? "Running" : "Stopped");
        Serial.printf("  - WebSocket Server: %s\n", webSocketHelper && webSocketHelper->isServerRunning() ? "Running" : "Stopped");
        Serial.printf("  - WebSocket Clients: %d\n", getWebSocketClients());
    }
}

void Branch_Ethernet::printConnectionStatus() {
    Serial.println("[Branch_Ethernet] ✅ Ethernet Connected!");
    Serial.printf("  - IP Address: %s\n", ETH.localIP().toString().c_str());
    Serial.printf("  - Subnet Mask: %s\n", ETH.subnetMask().toString().c_str());
    Serial.printf("  - Gateway: %s\n", ETH.gatewayIP().toString().c_str());
    Serial.printf("  - DNS: %s\n", ETH.dnsIP().toString().c_str());
    Serial.printf("  - MAC: %s\n", getFormattedMacAddress().c_str());
    Serial.printf("  - Link Speed: %d Mbps\n", ETH.linkSpeed());
    Serial.printf("  - Full Duplex: %s\n", ETH.fullDuplex() ? "Yes" : "No");
    
    // NEW: Show service availability
    Serial.println("[Branch_Ethernet] Available Services:");
    Serial.printf("  - HTTP Server: http://%s/ (port 80)\n", ETH.localIP().toString().c_str());
    Serial.printf("  - WebSocket Server: ws://%s:81/ (port 81)\n", ETH.localIP().toString().c_str());
    Serial.printf("  - WebSocket Clients Connected: %d\n", getWebSocketClients());
}