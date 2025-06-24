#include "Helper_WebSocket.h"
#include "ConnectionManager.h"
#include "Utils.h"

Helper_WebSocket::Helper_WebSocket(ConnectionManager* manager)
    : connectionManager(manager),
      webSocketConnected(false),
      webSocketEnabled(true),
      backendServerIP(""),
      backendServerPort(7180),
      welcomeReceived(false),
      deviceRegistered(false),
      lastHeartbeat(0),
      lastHealthReport(0),
      lastConnectionAttempt(0),
      connectionStartTime(0),
      reconnectAttempts(0)
{
    // Initialize timing
    lastHeartbeat = millis();
    lastHealthReport = millis();
}

Helper_WebSocket::~Helper_WebSocket() {
    if (webSocketClient.available()) {
        webSocketClient.close();
    }
}

void Helper_WebSocket::setupClient() {
    Serial.println("[WebSocket] Setting up ArduinoWebsockets client");
    
    // Setup message handler - keep it simple like the test sketch
    webSocketClient.onMessage([this](WebsocketsMessage message) {
        Serial.printf("[WebSocket] 📥 Received (%d bytes): %s\n", 
                     message.length(), message.data().c_str());
        this->handleIncomingMessage(message.data());
    });

    // Setup event handler - exactly like the working test sketch
    webSocketClient.onEvent([this](WebsocketsEvent event, String data) {
        switch (event) {
            case WebsocketsEvent::ConnectionOpened:
                Serial.println("[WebSocket] ✅ Connection Opened!");
                this->webSocketConnected = true;
                this->reconnectAttempts = 0;
                this->connectionStartTime = 0;  // Clear timeout timer
                this->welcomeReceived = false;
                this->deviceRegistered = false;
                break;
                
            case WebsocketsEvent::ConnectionClosed:
                Serial.printf("[WebSocket] 🔌 Connection Closed: %s\n", data.c_str());
                this->resetConnectionState();
                break;
                
            case WebsocketsEvent::GotPing:
                Serial.println("[WebSocket] 🏓 Got Ping");
                break;
                
            case WebsocketsEvent::GotPong:
                Serial.println("[WebSocket] 🏓 Got Pong");
                break;
        }
    });
    
    Serial.println("[WebSocket] ArduinoWebsockets client initialized");
}

void Helper_WebSocket::handleConnection() {
    if (!connectionManager->isNetworkAvailable()) {
        Serial.println("[WebSocket] Cannot connect - no network");
        return;
    }

    // Get backend server port from ConnectionManager
    backendServerPort = connectionManager->backendServerPort;

    // Detect backend server if not configured
    if (backendServerIP.isEmpty()) {
        detectBackendServer();
    }

    if (backendServerIP.isEmpty()) {
        Serial.println("[WebSocket] No backend server detected, WebSocket unavailable");
        return;
    }

    // Disconnect any existing connection - simple like test sketch
    if (webSocketClient.available()) {
        webSocketClient.close();
        delay(100);
    }

    // Build WebSocket URL with query parameters - exactly like test sketch
    String deviceMac = getDeviceMAC();
    String deviceName = getDeviceName();
    String url = "ws://" + backendServerIP + ":" + String(backendServerPort) +
                 "/api/device-websocket/connect?mac=" + deviceMac + "&name=" + deviceName;

    Serial.printf("[WebSocket] Connecting to: %s\n", url.c_str());

    // Set headers exactly like test sketch
    webSocketClient.addHeader("Origin", "http://esp32-device");
    webSocketClient.addHeader("User-Agent", "ESP32-ArduinoWebsockets/1.0");

    // Set connection options
    webSocketClient.setInsecure();

    // Reset connection state - simple like test sketch
    resetConnectionState();
    connectionStartTime = millis();

    // Attempt connection
    bool connected = webSocketClient.connect(url);

    if (connected) {
        Serial.println("[WebSocket] Connection initiated successfully");
    } else {
        Serial.println("[WebSocket] ❌ Failed to initiate connection");
        connectionStartTime = 0;
    }
}

void Helper_WebSocket::disconnect() {
    if (webSocketClient.available()) {
        webSocketClient.close();
        resetConnectionState();
        Serial.println("[WebSocket] Disconnected");
    }
}

void Helper_WebSocket::loop() {
    // Always poll WebSocket - this is critical
    webSocketClient.poll();
    
    // Handle connection timeout - like test sketch
    if (!webSocketConnected && connectionStartTime > 0 && 
        (millis() - connectionStartTime) > CONNECTION_TIMEOUT) {
        Serial.println("[WebSocket] Connection timeout - forcing reconnect");
        handleConnection();  // This will reset connectionStartTime
    }
    
    // Handle WebSocket connection state - exactly like test sketch logic
    if (webSocketConnected && welcomeReceived && deviceRegistered) {
        unsigned long now = millis();
        
        // Send periodic heartbeat
        if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
            sendHeartbeat();
            lastHeartbeat = now;
        }
        
        // Send health report
        if (now - lastHealthReport >= HEALTH_REPORT_INTERVAL) {
            sendHealthReport();
            lastHealthReport = now;
        }
    } else if (webSocketConnected && welcomeReceived && !deviceRegistered) {
        // Connected and welcomed but not registered - wait for registration ACK
        static unsigned long lastRegLog = 0;
        if (millis() - lastRegLog > 5000) {
            Serial.println("[WebSocket] Waiting for device registration acknowledgment...");
            lastRegLog = millis();
        }
    } else if (webSocketConnected && !welcomeReceived) {
        // Connected but no welcome yet - wait
        static unsigned long lastWaitLog = 0;
        if (millis() - lastWaitLog > 3000) {
            Serial.println("[WebSocket] Connected, waiting for welcome message...");
            lastWaitLog = millis();
        }
    }
    
    // Auto-reconnect logic - exactly like test sketch
    if (!webSocketConnected && webSocketEnabled && 
        (millis() - lastConnectionAttempt) > RECONNECT_INTERVAL) {
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            Serial.printf("[WebSocket] Reconnection attempt %d/%d\n", 
                         reconnectAttempts + 1, MAX_RECONNECT_ATTEMPTS);
            handleConnection();
            reconnectAttempts++;
            lastConnectionAttempt = millis();
        } else {
            Serial.println("[WebSocket] Max reconnection attempts reached. Waiting 30s before retry...");
            static unsigned long maxAttemptsTime = 0;
            if (millis() - maxAttemptsTime > 30000) {
                reconnectAttempts = 0;  // Reset after 30 seconds
                webSocketEnabled = true;
                maxAttemptsTime = millis();
            }
        }
    }
}

void Helper_WebSocket::resetConnectionState() {
    webSocketConnected = false;
    welcomeReceived = false;
    deviceRegistered = false;
    connectionStartTime = 0;
}

void Helper_WebSocket::detectBackendServer() {
    String baseIP = "";
    
    // Get base IP from current network connection
    if (WiFi.status() == WL_CONNECTED) {
        IPAddress localIP = WiFi.localIP();
        baseIP = String(localIP[0]) + "." + String(localIP[1]) + "." + String(localIP[2]) + ".";
        Serial.printf("[WebSocket] Using WiFi base IP: %s\n", baseIP.c_str());
    } else if (connectionManager->getDevice() && 
               connectionManager->getDevice()->supportsEthernet() && 
               connectionManager->getDevice()->isEthernetConnected()) {
        IPAddress ethIP = connectionManager->getDevice()->getEthernetIP();
        baseIP = String(ethIP[0]) + "." + String(ethIP[1]) + "." + String(ethIP[2]) + ".";
        Serial.printf("[WebSocket] Using Ethernet base IP: %s\n", baseIP.c_str());
    }
    
    if (baseIP.isEmpty()) {
        Serial.println("[WebSocket] ❌ Cannot detect backend - no network IP available");
        return;
    }
    
    Serial.printf("[WebSocket] 🔍 Scanning for backend server on %s*:%d\n", baseIP.c_str(), backendServerPort);
    
    // Test candidate IPs
    String candidateIPs[] = {
        baseIP + "2",     // Your working test server
        baseIP + "1",     // Router/Gateway
        baseIP + "100",   // Common server IP
        baseIP + "10",    // Alternative
        baseIP + "22"     // Another common IP
    };
    
    for (const String& ip : candidateIPs) {
        Serial.printf("[WebSocket] 🧪 Testing connection to %s:%d\n", ip.c_str(), backendServerPort);
        
        if (testConnection(ip, backendServerPort)) {
            backendServerIP = ip;
            Serial.printf("[WebSocket] ✅ Backend server found at %s:%d\n", ip.c_str(), backendServerPort);
            return;
        } else {
            Serial.printf("[WebSocket] ❌ No response from %s:%d\n", ip.c_str(), backendServerPort);
        }
    }
    
    Serial.println("[WebSocket] ⚠️ No backend server detected, WebSocket will not be available");
}

bool Helper_WebSocket::testConnection(const String& serverIP, uint16_t port) {
    // Simple HTTP GET test to see if server responds
    WiFiClient testClient;
    if (testClient.connect(serverIP.c_str(), port)) {
        testClient.print("GET /api/health/heartbeat HTTP/1.1\r\n");
        testClient.print("Host: " + serverIP + "\r\n");
        testClient.print("Connection: close\r\n\r\n");
        
        unsigned long timeout = millis() + 2000; // 2 second timeout
        while (testClient.available() == 0 && millis() < timeout) {
            delay(10);
        }
        
        if (testClient.available()) {
            String response = testClient.readString();
            testClient.stop();
            return response.indexOf("200 OK") > 0 || response.indexOf("\"status\":\"OK\"") > 0;
        }
        testClient.stop();
    }
    return false;
}

void Helper_WebSocket::sendData(const JsonDocument& data) {
    if (!webSocketConnected || !webSocketClient.available()) {
        Serial.println("[WebSocket] ⚠️ Cannot send message - not connected");
        return;
    }
    
    String message;
    size_t messageSize = serializeJson(data, message);
    
    if (messageSize == 0) {
        Serial.println("[WebSocket] ❌ Failed to serialize JSON message");
        return;
    }
    
    bool success = webSocketClient.send(message);
    
    if (success) {
        Serial.printf("[WebSocket] 📤 Sent (%d bytes)\n", message.length());
    } else {
        Serial.printf("[WebSocket] ❌ Failed to send message - connection may be broken\n");
        resetConnectionState();
    }
}

void Helper_WebSocket::sendText(const String& message) {
    if (!webSocketConnected || !webSocketClient.available()) {
        Serial.println("[WebSocket] Cannot send text - not connected");
        return;
    }
    
    bool success = webSocketClient.send(message);
    
    if (success) {
        Serial.printf("[WebSocket] 📤 Sent text (%d chars)\n", message.length());
    } else {
        Serial.println("[WebSocket] ❌ Failed to send text");
        resetConnectionState();
    }
}

void Helper_WebSocket::handleIncomingMessage(const String& message) {
    // Handle simple ping/pong messages first - exactly like test sketch
    if (message.equals("ping")) {
        webSocketClient.send("pong");
        return;
    }
    
    // Handle WebSocket-specific messages
    handleWebSocketSpecificMessage(message);
}

void Helper_WebSocket::handleWebSocketSpecificMessage(const String& message) {
    // Parse JSON messages - exactly like test sketch
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        Serial.printf("[WebSocket] ❌ JSON parse error: %s\n", error.c_str());
        Serial.printf("[WebSocket] Raw message: %s\n", message.c_str());
        return;
    }
    
    const char* messageType = doc["type"];
    if (!messageType) {
        Serial.println("[WebSocket] ⚠️ Message missing 'type' field");
        return;
    }
    
    Serial.printf("[WebSocket] Processing message type: %s\n", messageType);
    
    // Handle different message types - exactly like test sketch
    if (strcmp(messageType, "welcome") == 0) {
        handleWelcomeMessage(doc);
    }
    else if (strcmp(messageType, "device-registration-ack") == 0) {
        handleRegistrationAck(doc);
    }
    else if (strcmp(messageType, "health-request") == 0) {
        Serial.println("[WebSocket] 🩺 Health report requested by backend");
        sendHealthReport();
    }
    else if (strcmp(messageType, "heartbeat-ack") == 0) {
        Serial.println("[WebSocket] 💓 Heartbeat acknowledged");
    }
    else if (strcmp(messageType, "health-ack") == 0) {
        Serial.println("[WebSocket] 🩺 Health report acknowledged");
    }
    else if (strcmp(messageType, "espnow-status-request") == 0) {
        Serial.println("[WebSocket] 📡 ESP-NOW status requested");
        sendESPNowStatus();
    }
    else if (strcmp(messageType, "espnow-status-ack") == 0) {
        Serial.println("[WebSocket] 📡 ESP-NOW status acknowledged");
    }
    else if (strcmp(messageType, "config-ack") == 0) {
        Serial.println("[WebSocket] ⚙️ Configuration acknowledged");
    }
    else if (strcmp(messageType, "error") == 0) {
        const char* errorMsg = doc["message"];
        Serial.printf("[WebSocket] ❌ Backend error: %s\n", errorMsg ? errorMsg : "Unknown error");
    }
    else {
        // Forward non-WebSocket messages to ConnectionManager for processing
        if (connectionManager) {
            connectionManager->handleIncomingDataChunk((uint8_t*)message.c_str(), message.length());
        }
    }
}

void Helper_WebSocket::handleWelcomeMessage(const JsonDocument& doc) {
    Serial.println("[WebSocket] 🎉 Welcome message received!");
    welcomeReceived = true;
    
    // Log welcome details
    if (doc.containsKey("message")) {
        Serial.printf("[WebSocket] Server message: %s\n", doc["message"].as<const char*>());
    }
    if (doc.containsKey("serverVersion")) {
        Serial.printf("[WebSocket] Server version: %s\n", doc["serverVersion"].as<const char*>());
    }
    
    // Send device registration after welcome
    sendDeviceRegistration();
    
    // Initialize timing for periodic messages
    lastHeartbeat = millis();
    lastHealthReport = millis();
}

void Helper_WebSocket::handleRegistrationAck(const JsonDocument& doc) {
    Serial.println("[WebSocket] ✅ Device registration acknowledged!");
    deviceRegistered = true;
    
    // Log registration details
    if (doc.containsKey("status")) {
        Serial.printf("[WebSocket] Registration status: %s\n", doc["status"].as<const char*>());
    }
    if (doc.containsKey("message")) {
        Serial.printf("[WebSocket] Server message: %s\n", doc["message"].as<const char*>());
    }
    
    Serial.println("[WebSocket] 🟢 Device fully connected and registered!");
    Serial.println("[WebSocket] Starting periodic heartbeat and health reports...");
}

void Helper_WebSocket::sendDeviceRegistration() {
    // Use exactly the same structure as the working test sketch
    DynamicJsonDocument doc(1024);
    doc["type"] = "device-registration";
    doc["timestamp"] = getTimestamp();
    doc["deviceMac"] = getDeviceMAC();
    
    JsonObject data = doc.createNestedObject("data");
    data["deviceName"] = getDeviceName();
    data["firmwareVersion"] = connectionManager->getDevice()->getFirmwareVersion();
    data["deviceModel"] = connectionManager->getDevice()->getDeviceModel();
    data["connectionMode"] = connectionManager->getActiveNetworkType();
    data["ipAddress"] = connectionManager->networkHelper->getActiveIP();
    data["chipModel"] = ESP.getChipModel();
    data["chipRevision"] = ESP.getChipRevision();
    data["cpuFreqMHz"] = getCpuFrequencyMhz();
    data["flashSize"] = ESP.getFlashChipSize();
    data["library"] = "ArduinoWebsockets";
    
    JsonArray capabilities = data.createNestedArray("capabilities");
    capabilities.add("WiFi");
    capabilities.add("WebSocket");
    capabilities.add("JSON");
    capabilities.add("HealthReporting");
    capabilities.add("RemoteConfig");
    capabilities.add("OTA");
    if (connectionManager->getDevice()->supportsEthernet()) capabilities.add("Ethernet");
    if (connectionManager->getDevice()->supportsESPNow()) capabilities.add("ESP-NOW");
    if (connectionManager->getDevice()->supportsMQTT()) capabilities.add("MQTT");
    
    JsonArray protocols = data.createNestedArray("supportedProtocols");
    protocols.add("WebSocket");
    protocols.add("HTTP");
    if (connectionManager->getDevice()->supportsMQTT()) protocols.add("MQTT");
    if (connectionManager->getDevice()->supportsESPNow()) protocols.add("ESP-NOW");
    
    sendData(doc);
    Serial.println("[WebSocket] 📋 Device registration sent");
}

void Helper_WebSocket::sendHeartbeat() {
    // Use exactly the same structure as the working test sketch
    DynamicJsonDocument doc(512);
    doc["type"] = "heartbeat";
    doc["timestamp"] = getTimestamp();
    doc["deviceMac"] = getDeviceMAC();
    
    JsonObject data = doc.createNestedObject("data");
    data["uptimeMs"] = millis();
    data["freeHeap"] = ESP.getFreeHeap();
    data["library"] = "ArduinoWebsockets";
    
    // Add network-specific info
    if (WiFi.status() == WL_CONNECTED) {
        data["wifiRssi"] = WiFi.RSSI();
        data["connectionType"] = "WiFi";
    } else if (connectionManager->getDevice()->supportsEthernet() && 
               connectionManager->getDevice()->isEthernetConnected()) {
        data["connectionType"] = "Ethernet";
    }
    
    sendData(doc);
    Serial.println("[WebSocket] 💓 Heartbeat sent");
}

void Helper_WebSocket::sendHealthReport() {
    // Use exactly the same structure as the working test sketch
    DynamicJsonDocument doc(1024);
    doc["type"] = "health";
    doc["timestamp"] = getTimestamp();
    doc["deviceMac"] = getDeviceMAC();
    
    JsonObject data = doc.createNestedObject("data");
    
    // Memory info
    data["freeHeap"] = ESP.getFreeHeap();
    data["heapSize"] = ESP.getHeapSize();
    data["maxAllocHeap"] = ESP.getMaxAllocHeap();
    data["uptimeMs"] = millis();
    
    // CPU info
    data["cpuFreqMHz"] = getCpuFrequencyMhz();
    
    // Network info
    data["connectionType"] = connectionManager->getActiveNetworkType();
    data["ipAddress"] = connectionManager->networkHelper->getActiveIP();
    data["macAddress"] = connectionManager->networkHelper->getActiveMAC();
    
    if (WiFi.status() == WL_CONNECTED) {
        data["wifiRssi"] = WiFi.RSSI();
    }
    
    // System info
    data["chipModel"] = ESP.getChipModel();
    data["chipRevision"] = ESP.getChipRevision();
    data["flashSize"] = ESP.getFlashChipSize();
    data["firmwareVersion"] = connectionManager->getDevice()->getFirmwareVersion();
    data["library"] = "ArduinoWebsockets";
    
    // Connection stats
    data["reconnectAttempts"] = reconnectAttempts;
    data["isWelcomeReceived"] = welcomeReceived;
    data["isRegistered"] = deviceRegistered;
    
    // Battery info if available
    if (connectionManager->isBatteryAvailable()) {
        data["batteryPercent"] = (int)connectionManager->maxlipo.cellPercent();
        data["batteryVoltage"] = connectionManager->maxlipo.cellVoltage();
    }
    
    // Temperature (if available)
    #ifdef SOC_TEMP_SENSOR_SUPPORTED
    data["temperatureC"] = temperatureRead();
    #endif
    
    sendData(doc);
    Serial.println("[WebSocket] 🩺 Health report sent");
}

void Helper_WebSocket::sendESPNowStatus() {
    DynamicJsonDocument doc(512);
    doc["type"] = "espnow-status";
    doc["timestamp"] = getTimestamp();
    doc["deviceMac"] = getDeviceMAC();
    
    JsonObject data = doc.createNestedObject("data");
    
    // ESP-NOW status
    if (connectionManager->getESPNowManager()) {
        data["isInitialized"] = connectionManager->getESPNowManager()->isInitialized();
        data["peerCount"] = connectionManager->getESPNowManager()->getPeerCount();
    } else {
        data["isInitialized"] = false;
        data["peerCount"] = 0;
    }
    
    JsonArray onlinePeers = data.createNestedArray("onlinePeers");
    JsonArray offlinePeers = data.createNestedArray("offlinePeers");
    JsonArray degradedPeers = data.createNestedArray("degradedPeers");
    
    sendData(doc);
    Serial.println("[WebSocket] 📡 ESP-NOW status sent");
}

String Helper_WebSocket::getDeviceMAC() {
    return WiFi.macAddress(); // Raw MAC address for backend
}

// In Helper_WebSocket.cpp, replace the getDeviceName() method:

String Helper_WebSocket::getDeviceName() {
    // ✅ Use ESP32 native device information - clean and reliable
    String deviceName = ESP.getChipModel();  // e.g., "ESP32-S3"
    
    // Add chip revision for uniqueness
    deviceName += "_R" + String(ESP.getChipRevision());
    
    // Add the last 4 characters of MAC for device identification
    String mac = WiFi.macAddress();
    mac.replace(":", "");
    deviceName += "_" + mac.substring(mac.length() - 4);
    
    Serial.printf("[WebSocket] ESP chip model: %s\n", ESP.getChipModel());
    Serial.printf("[WebSocket] Generated device name: '%s'\n", deviceName.c_str());
    
    return deviceName;
}

String Helper_WebSocket::getTimestamp() {
    // Simple timestamp - in production you'd want to use NTP
    return String(millis());
}