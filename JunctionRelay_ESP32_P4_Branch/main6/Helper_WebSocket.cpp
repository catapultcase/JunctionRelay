#include "Helper_WebSocket.h"
#include "Helper_StreamProcessor.h"
#include "Helper_DeviceInfo.h"
#include "Helper_DeviceCapabilities.h"
#include "Helper_Utils.h"

Helper_WebSocket::Helper_WebSocket(Helper_StreamProcessor* processor,
                                  Helper_DeviceInfo* devInfo,
                                  Helper_DeviceCapabilities* devCaps)
    : streamProcessor(processor),
      deviceInfo(devInfo),
      deviceCapabilities(devCaps),
      webSocketServer(nullptr),
      serverRunning(false),
      serverPort(81),
      connectedClients(0),
      messagesReceived(0),
      messagesSent(0),
      errorCount(0)
{
    Serial.println("[Helper_WebSocket] Initialized for JunctionRelay WebSocket junctions");
}

Helper_WebSocket::~Helper_WebSocket() {
    stopServer();
    if (webSocketServer) {
        delete webSocketServer;
        webSocketServer = nullptr;
    }
    Serial.println("[Helper_WebSocket] Destroyed");
}

void Helper_WebSocket::init(uint16_t port) {
    serverPort = port;
    
    // Create WebSocket server
    webSocketServer = new WebSocketsServer(serverPort);
    
    // Set up event handler using lambda
    webSocketServer->onEvent([this](uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
        this->onWebSocketEvent(num, type, payload, length);
    });
    
    Serial.printf("[Helper_WebSocket] WebSocket server initialized on port %d\n", serverPort);
}

void Helper_WebSocket::startServer() {
    if (!webSocketServer) {
        Serial.println("[Helper_WebSocket] ERROR: Server not initialized - call init() first");
        return;
    }
    
    if (!serverRunning) {
        webSocketServer->begin();
        serverRunning = true;
        Serial.printf("[Helper_WebSocket] ✅ WebSocket server started on port %d\n", serverPort);
        Serial.printf("[Helper_WebSocket] Backend can connect to: ws://%s:%d/\n", 
                     WiFi.localIP().toString().c_str(), serverPort);
    }
}

void Helper_WebSocket::stopServer() {
    if (serverRunning && webSocketServer) {
        webSocketServer->close();
        serverRunning = false;
        connectedClients = 0;
        clientInfo.clear();
        Serial.println("[Helper_WebSocket] WebSocket server stopped");
    }
}

void Helper_WebSocket::loop() {
    if (serverRunning && webSocketServer) {
        webSocketServer->loop();
    }
}

// ==========================================
// WEBSOCKET EVENT HANDLING
// ==========================================

void Helper_WebSocket::onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            handleClientDisconnected(num);
            break;
            
        case WStype_CONNECTED:
            handleClientConnected(num, webSocketServer->remoteIP(num));
            break;
            
        case WStype_TEXT:
            handleIncomingMessage(num, String((char*)payload));
            break;
            
        case WStype_BIN:
            handleIncomingBinary(num, payload, length);
            break;
            
        case WStype_PING:
            Serial.printf("[Helper_WebSocket] Ping from client %u\n", num);
            break;
            
        case WStype_PONG:
            Serial.printf("[Helper_WebSocket] Pong from client %u\n", num);
            break;
            
        default:
            Serial.printf("[Helper_WebSocket] Unknown event type: %d from client %u\n", type, num);
            break;
    }
}

void Helper_WebSocket::handleClientConnected(uint8_t clientNum, IPAddress ip) {
    connectedClients++;
    clientInfo[clientNum] = ip.toString();
    
    Serial.printf("[Helper_WebSocket] ✅ Client %u connected from %s (total: %u)\n", 
                 clientNum, ip.toString().c_str(), connectedClients);
    
    // Send device info immediately upon connection
    sendDeviceInfo(clientNum);
}

void Helper_WebSocket::handleClientDisconnected(uint8_t clientNum) {
    if (connectedClients > 0) connectedClients--;
    
    String clientIP = clientInfo.count(clientNum) ? clientInfo[clientNum] : "unknown";
    clientInfo.erase(clientNum);
    
    Serial.printf("[Helper_WebSocket] ❌ Client %u disconnected from %s (total: %u)\n", 
                 clientNum, clientIP.c_str(), connectedClients);
}

void Helper_WebSocket::handleIncomingMessage(uint8_t clientNum, const String& message) {
    messagesReceived++;
    
    // Handle simple ping/pong first (for heartbeat compatibility)
    if (message == "ping") {
        String mutableMessage = "pong";
        webSocketServer->sendTXT(clientNum, mutableMessage);
        messagesSent++;
        Serial.printf("[Helper_WebSocket] Sent pong to client %u\n", clientNum);
        return;
    }
    
    // Handle heartbeat request with MAC verification
    if (message == "heartbeat" || message.indexOf("heartbeat-request") != -1) {
        sendHeartbeatResponse(clientNum);
        return;
    }
    
    // EXACTLY LIKE HTTP: Send ALL text data directly to StreamProcessor
    if (!streamProcessor) {
        Serial.println("[Helper_WebSocket] ERROR: StreamProcessor not available");
        sendErrorResponse(clientNum, "StreamProcessor not available", "internal_error");
        return;
    }
    
    // Process ALL text data through StreamProcessor (prefixed strings, JSON, etc.)
    streamProcessor->processData((uint8_t*)message.c_str(), message.length());
    
    // Send acknowledgment (same as HTTP)
    // sendTextToClient(clientNum, "OK");
}

void Helper_WebSocket::handleIncomingBinary(uint8_t clientNum, uint8_t* payload, size_t length) {
    // EXACTLY LIKE HTTP: Send ALL binary data directly to StreamProcessor
    if (!streamProcessor) {
        Serial.println("[Helper_WebSocket] ERROR: StreamProcessor not available");
        sendErrorResponse(clientNum, "StreamProcessor not available", "internal_error");
        return;
    }
    
    // Process ALL binary data through StreamProcessor (gzip, prefixed binary, etc.)
    streamProcessor->processData(payload, length);
    
    // Send acknowledgment (same as HTTP)
    // sendTextToClient(clientNum, "OK");
}

// ==========================================
// RESPONSE METHODS
// ==========================================

void Helper_WebSocket::sendHeartbeatResponse(uint8_t clientNum) {
    DynamicJsonDocument doc(512);
    doc["type"] = "heartbeat-response";
    doc["timestamp"] = millis();
    doc["status"] = "ok";
    doc["mac"] = getFormattedMacAddress();
    doc["ip"] = WiFi.localIP().toString();
    doc["uptime"] = millis();
    doc["freeHeap"] = ESP.getFreeHeap();
    
    // Add firmware version if available
    if (deviceInfo) {
        doc["firmware"] = deviceInfo->getFirmwareVersion();
    }
    
    sendToClient(clientNum, doc);
    Serial.printf("[Helper_WebSocket] Sent heartbeat response to client %u (MAC: %s)\n", 
                 clientNum, getFormattedMacAddress().c_str());
}

void Helper_WebSocket::sendDeviceInfo(uint8_t clientNum) {
    DynamicJsonDocument doc(512);
    doc["type"] = "device-connected";
    doc["timestamp"] = String(millis());
    doc["mac"] = getFormattedMacAddress();
    doc["ip"] = WiFi.localIP().toString();
    doc["port"] = serverPort;
    doc["protocol"] = "WebSocket";
    doc["clientId"] = clientNum;
    doc["note"] = "Send data as text or binary - both supported";
    
    sendToClient(clientNum, doc);
    Serial.printf("[Helper_WebSocket] Sent device info to client %u\n", clientNum);
}

void Helper_WebSocket::sendErrorResponse(uint8_t clientNum, const String& error, const String& context) {
    DynamicJsonDocument doc(256);
    doc["type"] = "error";
    doc["error"] = error;
    doc["context"] = context;
    doc["timestamp"] = millis();
    doc["clientId"] = clientNum;
    
    sendToClient(clientNum, doc);
    Serial.printf("[Helper_WebSocket] Sent error response to client %u: %s\n", 
                 clientNum, error.c_str());
    errorCount++;
}

// ==========================================
// CLIENT COMMUNICATION
// ==========================================

void Helper_WebSocket::broadcastData(const JsonDocument& data) {
    if (!serverRunning || !webSocketServer || connectedClients == 0) {
        return;
    }
    
    String message;
    size_t messageSize = serializeJson(data, message);
    
    if (messageSize == 0) {
        Serial.println("[Helper_WebSocket] ❌ Failed to serialize broadcast data");
        errorCount++;
        return;
    }
    
    webSocketServer->broadcastTXT(message);
    messagesSent += connectedClients; // Count per client
    Serial.printf("[Helper_WebSocket] 📤 Broadcast to %d client(s) (%d bytes)\n", 
                 connectedClients, message.length());
}

void Helper_WebSocket::broadcastText(const String& message) {
    if (!serverRunning || !webSocketServer || connectedClients == 0) {
        return;
    }
    
    // Create a mutable copy of the message for the WebSocket library
    String mutableMessage = message;
    webSocketServer->broadcastTXT(mutableMessage);
    messagesSent += connectedClients; // Count per client
    Serial.printf("[Helper_WebSocket] 📤 Broadcast text to %d client(s) (%d chars)\n", 
                 connectedClients, message.length());
}

void Helper_WebSocket::sendToClient(uint8_t clientNum, const JsonDocument& data) {
    if (!serverRunning || !webSocketServer) {
        Serial.println("[Helper_WebSocket] ❌ WebSocket server not running");
        return;
    }
    
    String message;
    size_t messageSize = serializeJson(data, message);
    
    if (messageSize == 0) {
        Serial.printf("[Helper_WebSocket] ❌ Failed to serialize data for client %u\n", clientNum);
        errorCount++;
        return;
    }
    
    webSocketServer->sendTXT(clientNum, message);
    messagesSent++;
    Serial.printf("[Helper_WebSocket] 📤 Sent to client %u (%d bytes)\n", clientNum, message.length());
}

void Helper_WebSocket::sendTextToClient(uint8_t clientNum, const String& message) {
    if (!serverRunning || !webSocketServer) {
        Serial.println("[Helper_WebSocket] ❌ WebSocket server not running");
        return;
    }
    
    // Create a mutable copy of the message for the WebSocket library
    String mutableMessage = message;
    webSocketServer->sendTXT(clientNum, mutableMessage);
    messagesSent++;
    // Serial.printf("[Helper_WebSocket] 📤 Sent text to client %u (%d chars)\n", clientNum, message.length());
}

uint32_t Helper_WebSocket::getChunkedMessagesReceived() const {
    return streamProcessor ? streamProcessor->getChunkedFramesReceived() : 0;
}

uint32_t Helper_WebSocket::getChunkedMessagesDropped() const {
    return streamProcessor ? streamProcessor->getChunkedFramesDropped() : 0;
}

// ==========================================
// UTILITY METHODS
// ==========================================

std::vector<uint8_t> Helper_WebSocket::getConnectedClientIds() const {
    std::vector<uint8_t> clientIds;
    for (const auto& pair : clientInfo) {
        clientIds.push_back(pair.first);
    }
    return clientIds;
}