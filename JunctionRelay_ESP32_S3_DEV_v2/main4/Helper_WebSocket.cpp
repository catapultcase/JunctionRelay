#include "Helper_WebSocket.h"
#include "ConnectionManager.h"

Helper_WebSocket::Helper_WebSocket(ConnectionManager* manager)
    : connectionManager(manager),
      webSocketServer(nullptr),
      webSocketEnabled(true),
      connectedClients(0)
{
    Serial.println("[WebSocket] Server helper initialized (Simplified)");
}

Helper_WebSocket::~Helper_WebSocket() {
    if (webSocketServer) {
        delete webSocketServer;
    }
    Serial.println("[WebSocket] Server helper destroyed");
}

void Helper_WebSocket::setupServer() {
    // Create WebSocket server on port 81 (same as minimal)
    webSocketServer = new WebSocketsServer(81);
    
    // Set up event handler (lambda like minimal)
    webSocketServer->onEvent([this](uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
        this->onWebSocketEvent(num, type, payload, length);
    });
    
    // Start the server
    webSocketServer->begin();
    
    Serial.println("[WebSocket] ✅ WebSocketsServer started on port 81");
    Serial.printf("[WebSocket] Backend can connect to: ws://%s:81/\n", WiFi.localIP().toString().c_str());
}

void Helper_WebSocket::loop() {
    if (webSocketServer) {
        webSocketServer->loop();
    }
}

void Helper_WebSocket::onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            if (connectedClients > 0) connectedClients--;
            Serial.printf("[WS] Client %u disconnected\n", num);
            break;
            
        case WStype_CONNECTED: {
            connectedClients++;
            IPAddress ip = webSocketServer->remoteIP(num);
            Serial.printf("[WS] Client %u connected from %s\n", num, ip.toString().c_str());
            
            // Send simple device info immediately (like minimal)
            sendDeviceInfo(num);
            break;
        }
        
        case WStype_TEXT: {
            String message = String((char*)payload);
            handleIncomingMessage(num, message);
            break;
        }
        
        case WStype_BIN:
            Serial.printf("[WS] Client %u sent binary data (%u bytes)\n", num, length);
            break;
            
        case WStype_PING:
            Serial.printf("[WS] Ping from client %u\n", num);
            break;
            
        case WStype_PONG:
            Serial.printf("[WS] Pong from client %u\n", num);
            break;
            
        default:
            Serial.printf("[WS] Unknown event type: %d\n", type);
            break;
    }
}

void Helper_WebSocket::handleIncomingMessage(uint8_t clientNum, const String& message) {
    // Handle simple ping first - EXACTLY like minimal firmware
    if (message == "ping") {
        webSocketServer->sendTXT(clientNum, "pong");
        Serial.printf("[WS] Sent pong to client %u\n", clientNum);
        return;
    }
    
    // Handle JSON heartbeat request - simplified like minimal
    if (message.indexOf("heartbeat-request") != -1) {
        sendHeartbeatResponse(clientNum);
        return;
    }
    
    // For unknown messages, forward to ConnectionManager but don't block WebSocket
    if (connectionManager) {
        // Use async processing to avoid blocking WebSocket thread
        connectionManager->handleIncomingDataChunk((uint8_t*)message.c_str(), message.length());
    }
    
    // Always respond quickly to avoid timeouts
    webSocketServer->sendTXT(clientNum, "received");
}

void Helper_WebSocket::sendHeartbeatResponse(uint8_t clientNum) {
    // MINIMAL response exactly like the working firmware
    DynamicJsonDocument doc(256);  // Same size as minimal
    doc["type"] = "heartbeat-response";
    doc["timestamp"] = String(millis());
    
    JsonObject data = doc.createNestedObject("data");
    data["status"] = "ok";
    data["uptime"] = millis();
    data["freeHeap"] = ESP.getFreeHeap();
    
    String response;
    serializeJson(doc, response);
    
    webSocketServer->sendTXT(clientNum, response);
    Serial.printf("[WS] Sent heartbeat response to client %u (%d bytes)\n", 
                 clientNum, response.length());
}

void Helper_WebSocket::sendDeviceInfo(uint8_t clientNum) {
    // Very minimal device info on connection - don't overwhelm the handshake
    DynamicJsonDocument doc(256);  // Keep small
    doc["type"] = "device-connected";
    doc["timestamp"] = String(millis());
    doc["mac"] = WiFi.macAddress();
    doc["ip"] = WiFi.localIP().toString();
    
    String response;
    serializeJson(doc, response);
    
    webSocketServer->sendTXT(clientNum, response);
    Serial.printf("[WS] Sent device info to client %u\n", clientNum);
}

void Helper_WebSocket::broadcastData(const JsonDocument& data) {
    if (!webSocketServer || connectedClients == 0) {
        return;
    }
    
    String message;
    size_t messageSize = serializeJson(data, message);
    
    if (messageSize == 0) {
        Serial.println("[WebSocket] ❌ Failed to serialize broadcast data");
        return;
    }
    
    webSocketServer->broadcastTXT(message);
    Serial.printf("[WebSocket] 📤 Broadcast to %d client(s) (%d bytes)\n", connectedClients, message.length());
}

void Helper_WebSocket::broadcastText(String message) {
    if (!webSocketServer || connectedClients == 0) {
        return;
    }
    
    webSocketServer->broadcastTXT(message);
    Serial.printf("[WebSocket] 📤 Broadcast text to %d client(s) (%d chars)\n", connectedClients, message.length());
}

void Helper_WebSocket::sendToClient(uint8_t clientNum, const JsonDocument& data) {
    if (!webSocketServer) {
        Serial.println("[WebSocket] ❌ WebSocket server not initialized");
        return;
    }
    
    String message;
    size_t messageSize = serializeJson(data, message);
    
    if (messageSize == 0) {
        Serial.printf("[WebSocket] ❌ Failed to serialize data for client #%u\n", clientNum);
        return;
    }
    
    webSocketServer->sendTXT(clientNum, message);
    Serial.printf("[WebSocket] 📤 Sent to client #%u (%d bytes)\n", clientNum, message.length());
}

void Helper_WebSocket::sendTextToClient(uint8_t clientNum, String message) {
    if (!webSocketServer) {
        Serial.println("[WebSocket] ❌ WebSocket server not initialized");
        return;
    }
    
    webSocketServer->sendTXT(clientNum, message);
    Serial.printf("[WebSocket] 📤 Sent text to client #%u (%d chars)\n", clientNum, message.length());
}