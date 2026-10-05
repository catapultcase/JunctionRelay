#ifndef Helper_HTTPEndpoints_H
#define Helper_HTTPEndpoints_H

#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <functional>
#include "Helper_HTTPChunkProcessor.h"
#include "Helper_OTA.h"

// Forward declarations
class Helper_StreamProcessor;
class Helper_DeviceInfo;
class Helper_DeviceCapabilities;
class ScreenRouter;
class Manager_MQTT;

class Helper_HTTPEndpoints {
public:

    Helper_HTTPEndpoints(ScreenRouter* router, Helper_StreamProcessor* processor,
                        Helper_DeviceInfo* deviceInfo = nullptr, 
                        Helper_DeviceCapabilities* deviceCapabilities = nullptr);
    ~Helper_HTTPEndpoints();

    // Initialize HTTP server and endpoints
    void init();

    // Start/stop the HTTP server
    void startServer();
    void stopServer();

    // Server status
    bool isServerRunning() const { return serverRunning; }

    // Set helpers after construction (if not provided in constructor)
    void setDeviceHelpers(Helper_DeviceInfo* deviceInfo, Helper_DeviceCapabilities* deviceCapabilities);

    // WebSocket and MQTT management
    // void setWebSocketHelper(Helper_WebSocket* wsHelper) { webSocketHelper = wsHelper; }
    void setMQTTManager(Manager_MQTT* mqtt) { mqttManager = mqtt; }

    // Callback for protocol-specific handling
    void setProtocolCallback(std::function<void(const JsonDocument&)> callback) { 
        protocolCallback = callback; 
    }

    // Callback for system-wide handling
    void setSystemCallback(std::function<void(const JsonDocument&)> callback) { 
        systemCallback = callback; 
    }

    // Get server reference for additional endpoints
    AsyncWebServer* getServer() { return &server; }

private:
    // Core dependencies
    ScreenRouter* screenRouter;
    Helper_StreamProcessor* streamProcessor;
    Helper_HTTPChunkProcessor* httpChunkProcessor;
    Helper_OTA* otaHelper;
    
    // Device helpers (injected)
    Helper_DeviceInfo* deviceInfo;
    Helper_DeviceCapabilities* deviceCapabilities;
    
    AsyncWebServer server;
    bool serverRunning;

    // Protocol helpers
    // Helper_WebSocket* webSocketHelper;
    Manager_MQTT* mqttManager;

    // Callbacks for routing
    std::function<void(const JsonDocument&)> protocolCallback;
    std::function<void(const JsonDocument&)> systemCallback;

    // HTTP endpoint setup methods
    void setupDataEndpoints();
    void setupStatusEndpoints();
    void setupDeviceEndpoints();
    void setupSystemEndpoints();
    void setupGatewayEndpoints();
    void setupFirmwareEndpoints();

    // Endpoint handlers
    void handleDataPost(AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total);
    void handleConnectionStatus(AsyncWebServerRequest* req);
    void handleSystemStats(AsyncWebServerRequest* req);
    void handleSystemStatsLite(AsyncWebServerRequest* req);
    void handleGatewayStatus(AsyncWebServerRequest* req);
    void handleHeartbeat(AsyncWebServerRequest* req);
    void handleFirmwareHash(AsyncWebServerRequest* req);
    void handleSetPreferences(AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total);
    void handleDeviceWipe(AsyncWebServerRequest* req);
    
    // Direct device info/capabilities handlers
    void handleDeviceInfo(AsyncWebServerRequest* req);
    void handleDeviceCapabilities(AsyncWebServerRequest* req);

    // OTA handlers
    void handleOTAPartitionInfo(AsyncWebServerRequest* req);
    void handleOTAUpload(AsyncWebServerRequest* req, const String& filename, size_t index, uint8_t* data, size_t len, bool final);
    void handleOTAComplete(AsyncWebServerRequest* req);
    void handleOTAStatus(AsyncWebServerRequest* req);
    void handleOTAVerify(AsyncWebServerRequest* req);

    // Helper methods
    String getConnectionStatusJson() const;
    String getSystemStatsJson() const;
    String getSystemStatsLiteJson() const;
    String getGatewayStatusJson() const;

    // Temporary buffer for POST data
    static char tempPostBodyBuffer[2048];
    static size_t tempPostBodyLen;
};

#endif // Helper_HTTPEndpoints_H