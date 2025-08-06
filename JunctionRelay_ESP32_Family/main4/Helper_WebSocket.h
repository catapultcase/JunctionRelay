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

#ifndef HELPER_WEBSOCKET_H
#define HELPER_WEBSOCKET_H

#include <Arduino.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <functional>
#include <map>
#include <vector>  // ADD THIS LINE

// Forward declarations
class Helper_StreamProcessor;
class Helper_DeviceInfo;
class Helper_DeviceCapabilities;

class Helper_WebSocket {
public:
    Helper_WebSocket(Helper_StreamProcessor* processor,
                    Helper_DeviceInfo* deviceInfo = nullptr,
                    Helper_DeviceCapabilities* deviceCapabilities = nullptr);
    ~Helper_WebSocket();

    // Initialize and start WebSocket server
    void init(uint16_t port = 81);
    void startServer();
    void stopServer();
    
    // Main loop - call from branch loop
    void loop();

    // Server status
    bool isServerRunning() const { return serverRunning; }
    uint8_t getConnectedClientsCount() const { return connectedClients; }
    bool hasConnectedClients() const { return connectedClients > 0; }

    // Set callbacks for routing (same pattern as HTTPEndpoints)
    void setProtocolCallback(std::function<void(const JsonDocument&)> callback) { 
        protocolCallback = callback; 
    }
    void setSystemCallback(std::function<void(const JsonDocument&)> callback) { 
        systemCallback = callback; 
    }

    // Send data to clients
    void broadcastData(const JsonDocument& data);
    void broadcastText(const String& message);
    void sendToClient(uint8_t clientNum, const JsonDocument& data);
    void sendTextToClient(uint8_t clientNum, const String& message);

    // Client management
    std::vector<uint8_t> getConnectedClientIds() const;
    
    // Statistics
    uint32_t getMessagesReceived() const { return messagesReceived; }
    uint32_t getMessagesSent() const { return messagesSent; }
    uint32_t getErrorCount() const { return errorCount; }

private:
    // Core dependencies
    Helper_StreamProcessor* streamProcessor;
    Helper_DeviceInfo* deviceInfo;
    Helper_DeviceCapabilities* deviceCapabilities;
    
    // WebSocket server
    WebSocketsServer* webSocketServer;
    bool serverRunning;
    uint16_t serverPort;
    uint8_t connectedClients;
    
    // Client tracking
    std::map<uint8_t, String> clientInfo; // clientId -> client info
    
    // Statistics
    uint32_t messagesReceived;
    uint32_t messagesSent;
    uint32_t errorCount;
    
    // Callbacks for routing (same pattern as HTTPEndpoints)
    std::function<void(const JsonDocument&)> protocolCallback;
    std::function<void(const JsonDocument&)> systemCallback;

    // WebSocket event handling
    void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length);
    void handleClientConnected(uint8_t clientNum, IPAddress ip);
    void handleClientDisconnected(uint8_t clientNum);
    void handleIncomingMessage(uint8_t clientNum, const String& message);
    void handleIncomingBinary(uint8_t clientNum, uint8_t* payload, size_t length);
    
    // Message processing
    void processWebSocketData(uint8_t clientNum, uint8_t* data, size_t length);
    void handleJunctionMessage(uint8_t clientNum, const JsonDocument& doc);
    void handleGatewayMessage(uint8_t clientNum, const JsonDocument& doc);
    void handleDirectMessage(uint8_t clientNum, const JsonDocument& doc);
    
    // Response handlers
    void sendHeartbeatResponse(uint8_t clientNum);
    void sendDeviceInfo(uint8_t clientNum);
    void sendErrorResponse(uint8_t clientNum, const String& error, const String& context = "");
    
    // Utility methods
    bool isValidJsonMessage(const String& message);
    void logClientActivity(uint8_t clientNum, const String& activity);
    String decodeBase64Payload(const String& base64Data);
};

#endif // HELPER_WEBSOCKET_H