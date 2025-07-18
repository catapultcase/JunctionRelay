#ifndef HELPER_WEBSOCKET_H
#define HELPER_WEBSOCKET_H

#include <WebSocketsServer.h>
#include <ArduinoJson.h>

class ConnectionManager;

class Helper_WebSocket {
public:
    Helper_WebSocket(ConnectionManager* manager);
    ~Helper_WebSocket();
    
    void setupServer();
    void loop();
    
    void broadcastData(const JsonDocument& data);
    void broadcastText(String message);
    
    // Connection status methods
    bool hasConnectedClients() const { return connectedClients > 0; }
    uint8_t getConnectedClientsCount() const { return connectedClients; }
    
private:
    ConnectionManager* connectionManager;
    WebSocketsServer* webSocketServer;
    bool webSocketEnabled;
    uint8_t connectedClients;
    
    // Event handlers - simplified
    void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length);
    void handleIncomingMessage(uint8_t clientNum, const String& message);
    
    // Response handlers - simplified
    void sendHeartbeatResponse(uint8_t clientNum);
    void sendDeviceInfo(uint8_t clientNum);
    
    // Utility methods - simplified
    void sendToClient(uint8_t clientNum, const JsonDocument& data);
    void sendTextToClient(uint8_t clientNum, String message);
};

#endif // HELPER_WEBSOCKET_H