#ifndef HELPER_WEBSOCKET_H
#define HELPER_WEBSOCKET_H

#include <WebSocketsClient.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <functional>

class ConnectionManager; // Forward declaration

class Helper_WebSocket {
public:
    Helper_WebSocket(ConnectionManager* manager);
    ~Helper_WebSocket();

    // Core WebSocket operations
    void setupClient();
    void handleConnection();
    void disconnect();
    
    // Connection management
    bool isConnected() const { return webSocketConnected; }
    bool isEnabled() const { return webSocketEnabled; }
    void setEnabled(bool enabled) { webSocketEnabled = enabled; }
    
    // Server detection and configuration
    void detectBackendServer();
    bool testConnection(const String& serverIP, uint16_t port);
    void setServerIP(const String& ip) { backendServerIP = ip; }
    void setServerPort(uint16_t port) { backendServerPort = port; }
    String getServerIP() const { return backendServerIP; }
    uint16_t getServerPort() const { return backendServerPort; }
    
    // Data transmission
    void sendData(const JsonDocument& data);
    void sendText(const String& message);
    
    // Event handling
    using EventCallback = std::function<void(WStype_t type, uint8_t* payload, size_t length)>;
    void setEventCallback(EventCallback callback) { eventCallback = callback; }

private:
    ConnectionManager* connectionManager;
    WebSocketsClient* webSocketClient;
    
    // Connection state
    bool webSocketEnabled;
    bool webSocketConnected;
    String backendServerIP;
    uint16_t backendServerPort;
    
    // Event handling
    EventCallback eventCallback;
    
    // Internal event handler
    void handleWebSocketEvent(WStype_t type, uint8_t* payload, size_t length);
    
    // Helper methods
    String buildConnectionURL();
    String getDeviceMAC();
    String getDeviceName();
};

#endif // HELPER_WEBSOCKET_H