#ifndef CONNECTION_MANAGER_H
#define CONNECTION_MANAGER_H

#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <Update.h>
#include <lvgl.h>
#include <functional>
#include <ArduinoJson.h>
#include <map>
#include <Preferences.h>
#include "DeviceConfig.h"
#include "CaptivePortalManager.h"
#include "ScreenRouter.h"
#include "Manager_QuadDisplay.h"
#include "Manager_Matrix.h"
#include "Manager_NeoPixels.h"
#include "Utils.h"

// forward-declare MQTT manager to avoid circular include
class Manager_MQTT;

// ---------------------------------------------
// Structured status for each connection layer
// ---------------------------------------------
struct ConnectionStatus {
    bool   espNowActive;
    bool   wifiConnected;
    bool   mqttConnected;
    String ipAddress;    // valid if wifiConnected
    String macAddress;   // valid if wifiConnected
};

class ConnectionManager {
public:
    ConnectionManager();

    // Core lifecycle
    void init();
    void handleConnection();                    // call from loop()
    void handleSerialData();
    void handleIncomingDataChunkPrefix(uint8_t* data, size_t len);
    void handleIncomingDataChunk(uint8_t* data, size_t len);
    void handleScreenId(const char* screenId, const StaticJsonDocument<8192>& doc);

    // ConnectionStatus API
    ConnectionStatus getConnectionStatus() const;
    void emitStatus();
    using StatusCb = std::function<void(const ConnectionStatus&)>;
    void setStatusUpdateCallback(StatusCb cb);

    // Modes
    bool   isEspNowActive() const { return connMode == "espnow"; }
    String getConnMode()     const { return connMode; }
    void   setConnMode(const String& m) { connMode = m; }

    // Wi-Fi
    void startCaptivePortal();
    void connectToWiFi();
    void setupMDNS();
    WiFiClient& getWiFiClient() { return wifiClient; }

    // MQTT
    bool            isMqttConnected();
    void            mqttLoop();
    void            reconnectMQTT();
    Manager_MQTT*   getMqttManager() { return mqttManager; }

    // HTTP API
    String getDeviceCapabilities();
    String getDeviceInfo();
    String getCurrentPreferences();
    void   handleSetPreferences(AsyncWebServerRequest* req);

    // Display offload
    void setScreenRouter(ScreenRouter* router) { screenRouter = router; }
    void offloadConfig(JsonDocument* doc);
    void offloadSensor(JsonDocument* doc);

    // Device injection
    void setDevice(DeviceConfig* d) { devicePtr = d; }

    // Public preferences fields (mirrored into prefs)
    String connMode;
    String ssid;
    String pass;
    String mqttBroker;
    String mqttUserName;
    String mqttPassword;

private:
    
    // Sensor processing queue and task
    static QueueHandle_t sensorQueue;
    static const int SENSOR_QUEUE_SIZE = 5;  // Maximum number of sensor payloads in queue
    static TaskHandle_t sensorProcessingTaskHandle;
    
    // Config processing queue and task
    static QueueHandle_t configQueue;
    static const int CONFIG_QUEUE_SIZE = 3;  // Maximum number of config payloads in queue
    static TaskHandle_t configProcessingTaskHandle;

    // Helper methods
    int parsePinValue(JsonVariant pinValue); 
    
    // HTTP server + captive-portal
    AsyncWebServer       server{80};
    CaptivePortalManager captivePortalManager;
    static const char*   defaultSSID;

    // Underlying WiFi client
    WiFiClient           wifiClient;

    // Persisted prefs
    Preferences          prefs;

    // Incoming‐frame buffering
    bool   readingLength  = true;
    int    bytesRead      = 0;
    int    payloadLength  = 0;
    char   prefixBuffer[9] = {0};
    static constexpr size_t MAX_PAYLOAD_SIZE = 8192;
    uint8_t staticPayloadBuffer[MAX_PAYLOAD_SIZE];

    // Callbacks
    StatusCb                             statusUpdateCallback;

    // Device & routing
    DeviceConfig*                        devicePtr    = nullptr;
    ScreenRouter*                        screenRouter = nullptr;

    // MQTT
    Manager_MQTT*                        mqttManager  = nullptr;

    // Dynamically registered displays
    std::map<String, Manager_QuadDisplay*> quadDisplays;
    std::map<String, Manager_Matrix*>      matrixDisplays;
    std::map<String, Manager_NeoPixels*>   neopixelDisplays;
};

#endif // CONNECTION_MANAGER_H