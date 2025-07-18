#include "Branch_Wifi.h"
#include "Helper_StreamProcessor.h"
#include "Helper_HTTPEndpoints.h"
#include "Helper_Preferences.h"
#include "ScreenRouter.h"
#include "DeviceConfig.h"

Branch_Wifi::Branch_Wifi()
    : initialized(false),
      screenRouter(nullptr),
      preferences(nullptr),
      devicePtr(nullptr),
      streamProcessor(nullptr),
      httpEndpoints(nullptr),
      lastWiFiCheck(0)
{
    Serial.println("[Branch_Wifi] Constructor called");
}

Branch_Wifi::~Branch_Wifi() {
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

void Branch_Wifi::init(ScreenRouter* router, Helper_Preferences* prefs, DeviceConfig* device) {
    if (!router || !prefs || !device) {
        Serial.println("[Branch_Wifi] ERROR: ScreenRouter, Preferences, or Device is null");
        return;
    }

    screenRouter = router;
    preferences = prefs;
    devicePtr = device;
    
    Serial.println("[Branch_Wifi] Initializing WiFi mode...");
    
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
    
    // Create HTTP endpoints helper
    httpEndpoints = new Helper_HTTPEndpoints(screenRouter, streamProcessor);
    
    // Set up bidirectional callbacks
    httpEndpoints->setProtocolCallback([this](const JsonDocument& doc) { 
        this->handleProtocolPayload(doc); 
    });
    httpEndpoints->setSystemCallback([this](const JsonDocument& doc) { 
        this->handleSystemPayload(doc); 
    });
    
    // Initialize HTTP endpoints
    initializeHTTPEndpoints();
    
    // Initialize WiFi connection
    initializeWiFi();
    
    // If WiFi credentials exist, try to connect
    if (!ssid.isEmpty()) {
        if (connectToWiFi()) {
            // WiFi connected - initialize network-dependent services
            setupMDNS();
            httpEndpoints->startServer();
        } else {
            Serial.println("[Branch_Wifi] WiFi connection failed");
        }
    } else {
        Serial.println("[Branch_Wifi] No WiFi credentials found");
    }
    
    initialized = true;
    emitStatus();
    
    Serial.println("[Branch_Wifi] ✅ WiFi mode ready");
}

void Branch_Wifi::loop() {
    if (!initialized) return;
    
    unsigned long currentTime = millis();
    
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

void Branch_Wifi::setupMDNS() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[Branch_Wifi] Cannot setup mDNS - WiFi not connected");
        return;
    }
    
    String mac = getFormattedMacAddress();
    String host = "JunctionRelay_Device_" + mac;
    
    if (MDNS.begin(host.c_str())) {
        MDNS.addService("junctionrelay", "tcp", 80);
        Serial.printf("[Branch_Wifi] mDNS started with hostname: %s\n", host.c_str());
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
    Serial.println("[Branch_Wifi] WiFi disconnected, attempting reconnection...");
    
    if (connectToWiFi()) {
        Serial.println("[Branch_Wifi] WiFi reconnected successfully");
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
    Serial.printf("[Branch_Wifi] 📡 PROTOCOL callback received: %s\n", type ? type : "unknown");
    
    if (!type) return;
    
    if (strcmp(type, "http_request") == 0) {
        handleHTTPRequest(doc);
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
    
    if (strcmp(type, "stats") == 0) {
        handleStatsRequest(doc);
    }
    else if (strcmp(type, "preferences") == 0) {
        handlePreferencesRequest(doc);
    }
    else if (strcmp(type, "device_info") == 0) {
        handleDeviceInfoRequest(doc);
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

// ==========================================
// SYSTEM HANDLERS
// ==========================================

void Branch_Wifi::handleStatsRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Wifi] 📊 Stats request received");
    
    // Show WiFi-specific stats
    Serial.printf("[Branch_Wifi] WiFi Status:\n");
    Serial.printf("  - Connected: %s\n", isWiFiConnected() ? "Yes" : "No");
    if (isWiFiConnected()) {
        Serial.printf("  - IP: %s\n", getIPAddress().c_str());
        Serial.printf("  - RSSI: %d dBm\n", getSignalStrength());
        Serial.printf("  - Channel: %d\n", WiFi.channel());
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
    
    // Show memory stats
    Serial.printf("[Branch_Wifi] Memory Stats:\n");
    Serial.printf("  - Free Heap: %d bytes\n", ESP.getFreeHeap());
    Serial.printf("  - Min Free Heap: %d bytes\n", ESP.getMinFreeHeap());
    Serial.printf("  - Heap Size: %d bytes\n", ESP.getHeapSize());
}

void Branch_Wifi::handlePreferencesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Wifi] ⚙️ Preferences request received");
    
    if (doc.containsKey("action")) {
        String action = doc["action"].as<String>();
        Serial.printf("[Branch_Wifi] Preferences action: %s\n", action.c_str());
        
        if (action == "get") {
            // Return current preferences
            String currentPrefs = preferences->getWiFiSettingsJSON();
            Serial.printf("[Branch_Wifi] Current WiFi preferences: %s\n", currentPrefs.c_str());
        }
        else if (action == "set" && doc.containsKey("data")) {
            // Update preferences using centralized system
            JsonObjectConst data = doc["data"];
            
            bool needReconnect = false;
            
            if (data.containsKey("ssid")) {
                String newSSID = data["ssid"].as<String>();
                if (newSSID != ssid) {
                    preferences->setWiFiSSID(newSSID);
                    ssid = newSSID;
                    needReconnect = true;
                }
            }
            
            if (data.containsKey("password")) {
                String newPassword = data["password"].as<String>();
                preferences->setWiFiPassword(newPassword);
                password = newPassword;
                needReconnect = true;
            }
            
            if (data.containsKey("deviceName")) {
                String newName = data["deviceName"].as<String>();
                preferences->setDeviceName(newName);
                deviceName = newName;
            }
            
            if (data.containsKey("autoReconnect")) {
                preferences->setWiFiAutoReconnect(data["autoReconnect"].as<bool>());
            }
            
            Serial.println("[Branch_Wifi] Preferences updated via centralized system");
            
            if (needReconnect && !ssid.isEmpty()) {
                Serial.println("[Branch_Wifi] WiFi credentials changed, reconnecting...");
                reconnectWiFi();
            }
        }
    }
}

void Branch_Wifi::handleDeviceInfoRequest(const JsonDocument& doc) {
    Serial.println("[Branch_Wifi] 📱 Device info request received");
    
    Serial.printf("[Branch_Wifi] Device: %s, Connection Mode: WiFi\n", devicePtr->getName());
    Serial.printf("[Branch_Wifi] MAC Address: %s\n", getMacAddress().c_str());
    if (isWiFiConnected()) {
        Serial.printf("[Branch_Wifi] IP Address: %s\n", getIPAddress().c_str());
    }
    Serial.printf("[Branch_Wifi] Hostname: %s\n", WiFi.getHostname());
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
    }
}

// ==========================================
// UTILITY METHODS
// ==========================================

String Branch_Wifi::getIPAddress() const {
    return WiFi.localIP().toString();
}

String Branch_Wifi::getMacAddress() const {
    return getFormattedMacAddress();
}

int Branch_Wifi::getSignalStrength() const {
    return WiFi.RSSI();
}

String Branch_Wifi::getFormattedMacAddress() const {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[18];
    sprintf(macStr, "%02X:%02X:%02X:%02X:%02X:%02X", 
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    return String(macStr);
}

void Branch_Wifi::emitStatus() {
    Serial.printf("[Branch_Wifi] Status Update:\n");
    Serial.printf("  - Initialized: %s\n", initialized ? "Yes" : "No");
    Serial.printf("  - WiFi Connected: %s\n", isWiFiConnected() ? "Yes" : "No");
    if (isWiFiConnected()) {
        Serial.printf("  - IP Address: %s\n", getIPAddress().c_str());
        Serial.printf("  - Signal Strength: %d dBm\n", getSignalStrength());
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
    Serial.printf("  - MAC: %s\n", getMacAddress().c_str());
}