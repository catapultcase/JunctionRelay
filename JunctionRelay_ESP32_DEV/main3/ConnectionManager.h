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
#include "Manager_Charlieplex.h"
#include "Manager_QuadDisplay.h"
#include "Manager_Matrix.h"
#include "Manager_NeoPixels.h"
#include "Manager_ESPNOW.h"
#include "Utils.h"

// Battery monitoring
#include "Adafruit_MAX1704X.h"

// Helper classes
#include "Helper_WebSocket.h"
#include "Helper_HTTP.h"
#include "Helper_Network.h"

// forward-declare MQTT manager to avoid circular include
class Manager_MQTT;

// ---------------------------------------------
// Structured status for each connection layer
// ---------------------------------------------
struct ConnectionStatus {
    bool   espNowActive;
    bool   wifiConnected;
    bool   mqttConnected;
    bool   ethernetConnected;
    bool   webSocketConnected;
    String ipAddress;
    String macAddress;
    String ethernetIP;
    String ethernetMAC;
    String activeNetworkType;
    String backendServerIP;
};

class ConnectionManager {
public:
    ConnectionManager();
    ~ConnectionManager();

    // Core lifecycle
    void init();
    void handleConnection();
    void handleSerialData();
    void handleIncomingDataChunkPrefix(uint8_t* data, size_t len);
    void handleIncomingDataChunk(uint8_t* data, size_t len);
    void handleScreenId(const char* screenId, const StaticJsonDocument<8192>& doc);

    // ConnectionStatus API
    ConnectionStatus getConnectionStatus() const;
    void emitStatus();
    using StatusCb = std::function<void(const ConnectionStatus&)>;
    void setStatusUpdateCallback(StatusCb cb);

    // Network availability check
    bool isNetworkAvailable() const;

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

    // ESP-NOW management
    Manager_ESPNOW* getESPNowManager() { return espnowManager; }
    bool            isESPNowInitialized() const { return espnowManager && espnowManager->isInitialized(); }

    // HTTP API
    String getDeviceCapabilities();
    String getDeviceInfo();
    String getCurrentPreferences();
    String getSystemStats();
    String getSystemStatsLightweight();
    void   getSystemStatsAsync(AsyncWebServerRequest* request);
    void   getSystemStatsLightweightAsync(AsyncWebServerRequest* request);
    void   handleSetPreferences(AsyncWebServerRequest* req);

    // Configuration state management
    void resetConfigState();
    
    // Battery management
    void initBattery();
    bool isBatteryAvailable() const { return batteryInitialized; }

    // Display offload
    void setScreenRouter(ScreenRouter* router) { screenRouter = router; }
    void offloadConfig(JsonDocument* doc);
    void offloadSensor(JsonDocument* doc);

    // Device injection
    void setDevice(DeviceConfig* d) { devicePtr = d; }
    DeviceConfig* getDevice() const { return devicePtr; }

    // Protocol management methods
    enum class PrimaryProtocol {
        WEBSOCKET_HTTP,  // WiFi/Ethernet modes (WebSocket with HTTP fallback)
        ESPNOW,         // ESP-NOW only mode
        GATEWAY         // Gateway mode (Ethernet + ESP-NOW bridging)
    };
    
    bool isWebSocketConnected() const;
    PrimaryProtocol getActivePrimaryProtocol() const { return activePrimaryProtocol; }
    String getActiveNetworkType() const;
    
    // Unified data sending interface
    void sendConfigData(const JsonDocument& data);
    void sendSensorData(const JsonDocument& data);
    void sendGenericData(const JsonDocument& data);

    // Helper access methods
    Helper_WebSocket* getWebSocketHelper() { return webSocketHelper; }
    Helper_HTTP* getHTTPHelper() { return httpHelper; }
    Helper_Network* getNetworkHelper() { return networkHelper; }

    // Public preferences fields (mirrored into prefs)
    String connMode;
    String ssid;
    String pass;
    String mqttBroker;
    String mqttUserName;
    String mqttPassword;

    // Configuration state tracking (public so tasks can access)
    bool hasReceivedConfig = false;
    unsigned long lastConfigTimestamp = 0;
    uint32_t configCount = 0;

    // Battery monitoring (public so accessible from stats)
    Adafruit_MAX17048 maxlipo;
    bool batteryInitialized = false;

private:
    
    // Sensor processing queue and task
    static QueueHandle_t sensorQueue;
    static const int SENSOR_QUEUE_SIZE = 30;
    static TaskHandle_t sensorProcessingTaskHandle;
    
    // Config processing queue and task
    static QueueHandle_t configQueue;
    static const int CONFIG_QUEUE_SIZE = 3;
    static TaskHandle_t configProcessingTaskHandle;

    // Helper methods
    int parsePinValue(JsonVariant pinValue);
    void setupHTTPEndpoints();
    void setupMQTTClient();
    void setupProtocolBasedServices();
    
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

    // ESP-NOW manager
    Manager_ESPNOW*                      espnowManager = nullptr;

    // Dynamically registered displays
    std::map<String, Manager_Charlieplex*>   charlieDisplays;
    std::map<String, Manager_QuadDisplay*>    quadDisplays;
    std::map<String, Manager_Matrix*>         matrixDisplays;
    std::map<String, Manager_NeoPixels*>      neopixelDisplays;

    // Helper class instances
    Helper_WebSocket*                    webSocketHelper = nullptr;
    Helper_HTTP*                         httpHelper = nullptr;
    Helper_Network*                      networkHelper = nullptr;
    
    // Protocol state management
    PrimaryProtocol                      activePrimaryProtocol;
    String                              backendServerIP = "";
    uint16_t                            backendServerPort = 7180;
    
    // Network event handling
    void handleNetworkEvent(const String& networkType, bool connected);
};

#endif // CONNECTION_MANAGER_H