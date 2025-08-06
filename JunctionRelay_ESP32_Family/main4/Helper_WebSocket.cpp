/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * JunctionRelay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with JunctionRelay. If not, see <https://www.gnu.org/licenses/>.
 */

#include "Helper_WebSocket.h"
#include "Helper_StreamProcessor.h"
#include "Helper_DeviceInfo.h"
#include "Helper_DeviceCapabilities.h"
#include "Helper_Utils.h"
#include <mbedtls/base64.h>

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
    
    // Validate JSON format
    if (!isValidJsonMessage(message)) {
        Serial.printf("[Helper_WebSocket] Invalid JSON from client %u\n", clientNum);
        sendErrorResponse(clientNum, "Invalid JSON format", "message_validation");
        return;
    }
    
    // Parse JSON message
    DynamicJsonDocument doc(4096);
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        Serial.printf("[Helper_WebSocket] JSON parse error from client %u: %s\n", 
                     clientNum, error.c_str());
        sendErrorResponse(clientNum, "JSON parse error: " + String(error.c_str()), "json_parse");
        return;
    }
    
    // Check message type and route accordingly
    const char* type = doc["type"];
    if (!type) {
        Serial.printf("[Helper_WebSocket] No message type from client %u\n", clientNum);
        sendErrorResponse(clientNum, "Missing message type", "type_validation");
        return;
    }
    
    // Serial.printf("[Helper_WebSocket] Received '%s' message from client %u\n", type, clientNum);
    
    // Route based on message type
    if (strcmp(type, "data-payload") == 0) {
        handleDirectMessage(clientNum, doc);
    } else if (strcmp(type, "gateway-forward") == 0) {
        handleGatewayMessage(clientNum, doc);
    } else {
        // Route other message types through callbacks (same pattern as HTTPEndpoints)
        handleJunctionMessage(clientNum, doc);
    }
}

void Helper_WebSocket::handleIncomingBinary(uint8_t clientNum, uint8_t* payload, size_t length) {
    // Serial.printf("[Helper_WebSocket] Received %u bytes of binary data from client %u\n", 
    //              length, clientNum);
    
    // Process binary data directly through StreamProcessor
    processWebSocketData(clientNum, payload, length);
}

// ==========================================
// MESSAGE PROCESSING
// ==========================================

void Helper_WebSocket::processWebSocketData(uint8_t clientNum, uint8_t* data, size_t length) {
    if (!streamProcessor) {
        Serial.println("[Helper_WebSocket] ERROR: StreamProcessor not available");
        sendErrorResponse(clientNum, "StreamProcessor not available", "internal_error");
        return;
    }
    
    // Process through StreamProcessor (same as HTTP does)
    streamProcessor->processData(data, length);
    
    // Send acknowledgment
    sendTextToClient(clientNum, "OK");
}

void Helper_WebSocket::handleDirectMessage(uint8_t clientNum, const JsonDocument& doc) {
    // Handle direct data-payload messages from WebSocket junction
    if (!doc.containsKey("payload")) {
        sendErrorResponse(clientNum, "Missing payload field", "payload_validation");
        return;
    }
    
    String format = doc["format"].as<String>();
    String payloadData = doc["payload"].as<String>();
    
    if (format == "binary") {
        // Decode Base64 payload and process through StreamProcessor
        String decodedPayload = decodeBase64Payload(payloadData);
        if (!decodedPayload.isEmpty()) {
            processWebSocketData(clientNum, (uint8_t*)decodedPayload.c_str(), decodedPayload.length());
        } else {
            sendErrorResponse(clientNum, "Failed to decode Base64 payload", "base64_decode");
        }
    } else {
        // Process as raw text through StreamProcessor
        processWebSocketData(clientNum, (uint8_t*)payloadData.c_str(), payloadData.length());
    }
}

void Helper_WebSocket::handleGatewayMessage(uint8_t clientNum, const JsonDocument& doc) {
    // Handle gateway-forward messages (ESP-NOW forwarding)
    Serial.printf("[Helper_WebSocket] Gateway forward message from client %u\n", clientNum);
    
    if (!doc.containsKey("target") || !doc.containsKey("payload")) {
        sendErrorResponse(clientNum, "Missing target or payload field", "gateway_validation");
        return;
    }
    
    String target = doc["target"].as<String>();
    String protocol = doc["protocol"].as<String>();
    String payloadData = doc["payload"].as<String>();
    
    Serial.printf("[Helper_WebSocket] Gateway forward to %s via %s\n", 
                 target.c_str(), protocol.c_str());
    
    // Route through protocol callback for ESP-NOW forwarding
    if (protocolCallback) {
        // Create a modified document for ESP-NOW processing
        DynamicJsonDocument gatewayDoc(4096);
        gatewayDoc["type"] = "gateway_forward";
        gatewayDoc["destination"] = target;
        gatewayDoc["protocol"] = protocol;
        gatewayDoc["source"] = "websocket";
        gatewayDoc["clientId"] = clientNum;
        
        // Decode payload and add to document
        String decodedPayload = decodeBase64Payload(payloadData);
        if (!decodedPayload.isEmpty()) {
            // Try to parse payload as JSON for easier processing
            DynamicJsonDocument payloadDoc(2048);
            if (deserializeJson(payloadDoc, decodedPayload) == DeserializationError::Ok) {
                gatewayDoc["payloadData"] = payloadDoc;
            } else {
                gatewayDoc["payloadRaw"] = decodedPayload;
            }
        }
        
        protocolCallback(gatewayDoc);
        
        // Send acknowledgment
        DynamicJsonDocument ackDoc(256);
        ackDoc["type"] = "gateway-forward-ack";
        ackDoc["target"] = target;
        ackDoc["status"] = "forwarded";
        ackDoc["timestamp"] = millis();
        
        sendToClient(clientNum, ackDoc);
    } else {
        sendErrorResponse(clientNum, "Gateway forwarding not supported", "gateway_not_supported");
    }
}

void Helper_WebSocket::handleJunctionMessage(uint8_t clientNum, const JsonDocument& doc) {
    const char* type = doc["type"];

    // Protocol-specific messages
    if (strcmp(type, "websocket_ping") == 0 ||
        strcmp(type, "peer_management") == 0 ||
        strcmp(type, "gateway_status") == 0) {

        if (protocolCallback) {
            DynamicJsonDocument contextDoc(4096);
            contextDoc.set(doc);
            contextDoc["websocketClientId"] = clientNum;
            contextDoc["websocketClientIP"] = clientInfo.count(clientNum) ? clientInfo[clientNum] : "unknown";
            protocolCallback(contextDoc);
        }
    }
    // System messages  
    else if (strcmp(type, "device_info") == 0 ||
             strcmp(type, "device_capabilities") == 0 ||
             strcmp(type, "stats") == 0 ||
             strcmp(type, "preferences") == 0 ||
             strcmp(type, "system_command") == 0) {

        if (systemCallback) {
            DynamicJsonDocument contextDoc(4096);
            contextDoc.set(doc);
            contextDoc["websocketClientId"] = clientNum;
            contextDoc["websocketClientIP"] = clientInfo.count(clientNum) ? clientInfo[clientNum] : "unknown";
            systemCallback(contextDoc);
        }
    }
    // ✅ NEW: Sensor/config messages go directly to stream processor
    else if (strcmp(type, "sensor") == 0 || strcmp(type, "config") == 0) {
        if (!streamProcessor) {
            sendErrorResponse(clientNum, "StreamProcessor not available", "internal_error");
            return;
        }

        String jsonStr;
        serializeJson(doc, jsonStr);
        streamProcessor->processData((uint8_t*)jsonStr.c_str(), jsonStr.length());
        sendTextToClient(clientNum, "OK");
    }
    // ❌ Unknown message types
    else {
        Serial.printf("[Helper_WebSocket] Unknown message type '%s' from client %u\n", type, clientNum);
        sendErrorResponse(clientNum, "Unknown message type: " + String(type), "unknown_type");
    }
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

bool Helper_WebSocket::isValidJsonMessage(const String& message) {
    if (message.isEmpty()) return false;
    
    // Quick validation - should start with { and end with }
    String trimmed = message;
    trimmed.trim();
    return trimmed.startsWith("{") && trimmed.endsWith("}");
}

void Helper_WebSocket::logClientActivity(uint8_t clientNum, const String& activity) {
    String clientIP = clientInfo.count(clientNum) ? clientInfo[clientNum] : "unknown";
    Serial.printf("[Helper_WebSocket] Client %u (%s): %s\n", clientNum, clientIP.c_str(), activity.c_str());
}

String Helper_WebSocket::decodeBase64Payload(const String& base64Data) {
    if (base64Data.isEmpty()) {
        return "";
    }
    
    // Calculate required buffer size
    size_t decodedLen = 0;
    int result = mbedtls_base64_decode(nullptr, 0, &decodedLen, 
                                      (const unsigned char*)base64Data.c_str(), 
                                      base64Data.length());
    
    if (result != MBEDTLS_ERR_BASE64_BUFFER_TOO_SMALL) {
        Serial.println("[Helper_WebSocket] Base64 size calculation failed");
        return "";
    }
    
    // Allocate buffer and decode
    uint8_t* decodedBuffer = new uint8_t[decodedLen + 1];
    result = mbedtls_base64_decode(decodedBuffer, decodedLen, &decodedLen,
                                  (const unsigned char*)base64Data.c_str(),
                                  base64Data.length());
    
    if (result != 0) {
        Serial.printf("[Helper_WebSocket] Base64 decode failed: %d\n", result);
        delete[] decodedBuffer;
        return "";
    }
    
    decodedBuffer[decodedLen] = '\0'; // Null terminate
    String decoded = String((char*)decodedBuffer);
    delete[] decodedBuffer;
    
    return decoded;
}