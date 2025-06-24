#ifndef HELPER_WEBSOCKET_H
#define HELPER_WEBSOCKET_H

#include <ArduinoWebsockets.h>  // Changed from WebSocketsClient.h
#include <WiFi.h>
#include <ArduinoJson.h>
#include <functional>

using namespace websockets;  // Add this for ArduinoWebsockets

class ConnectionManager; // Forward declaration

// Keep the old enum for compatibility with existing callback code
typedef enum {
    WStype_DISCONNECTED,
    WStype_CONNECTED,
    WStype_TEXT,
    WStype_ERROR
} WStype_t;

class Helper_WebSocket {
public:
    Helper_WebSocket(ConnectionManager* manager);
    ~Helper_WebSocket();

    // Core WebSocket operations
    void setupClient();
    void handleConnection();
    void disconnect();
    void loop();  // NEW: Call this in main loop for ArduinoWebsockets polling
    
    // Connection management
    bool isConnected() const { return webSocketConnected; }
    bool isEnabled() const { return webSocketEnabled; }
    void setEnabled(bool enabled) { webSocketEnabled = enabled; }
    
    // Registration status
    bool isWelcomeReceived() const { return welcomeReceived; }
    bool isDeviceRegistered() const { return deviceRegistered; }
    
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
    
    // Event handling (kept for compatibility)
    using EventCallback = std::function<void(WStype_t type, uint8_t* payload, size_t length)>;
    void setEventCallback(EventCallback callback) { eventCallback = callback; }

private:
    ConnectionManager* connectionManager;
    WebsocketsClient webSocketClient;  // Changed from WebSocketsClient*
    
    // Connection state
    bool webSocketEnabled;
    bool webSocketConnected;
    String backendServerIP;
    uint16_t backendServerPort;
    
    // Registration state
    bool welcomeReceived;
    bool deviceRegistered;
    
    // Timing for periodic messages
    unsigned long lastHeartbeat;
    unsigned long lastHealthReport;
    
    // Connection timing and retry logic
    unsigned long lastConnectionAttempt;
    unsigned long connectionStartTime;
    int reconnectAttempts;
    static const unsigned long HEARTBEAT_INTERVAL = 30000;      // 30 seconds
    static const unsigned long HEALTH_REPORT_INTERVAL = 60000;  // 60 seconds
    static const unsigned long RECONNECT_INTERVAL = 5000;       // 5 seconds
    static const unsigned long CONNECTION_TIMEOUT = 15000;      // 15 seconds
    static const int MAX_RECONNECT_ATTEMPTS = 10;
    
    // Event handling
    EventCallback eventCallback;
    
    // Message handling
    void handleIncomingMessage(const String& message);
    void handleWebSocketSpecificMessage(const String& message);
    void handleWelcomeMessage(const JsonDocument& doc);
    void handleRegistrationAck(const JsonDocument& doc);
    
    // Outgoing messages
    void sendDeviceRegistration();
    void sendHeartbeat();
    void sendHealthReport();
    void sendESPNowStatus();
    
    // Helper methods
    String getDeviceMAC();
    String getDeviceName();
    void resetConnectionState();
    String getTimestamp();
};

#endif // HELPER_WEBSOCKET_H