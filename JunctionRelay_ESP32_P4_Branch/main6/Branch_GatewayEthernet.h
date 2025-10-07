#ifndef BRANCH_GATEWAY_ETHERNET_H
#define BRANCH_GATEWAY_ETHERNET_H

#include <Arduino.h>
#include <ETH.h>
#include <ArduinoJson.h>
#include <functional>
#include <ESPmDNS.h>

// Forward declarations
class Helper_StreamProcessor;
class Helper_HTTPEndpoints;
class Helper_WebSocket;
class Helper_Preferences;
class Helper_DeviceInfo;
class Helper_DeviceCapabilities;
class Helper_ESPNOW;
class ScreenRouter;
class DeviceConfig;

class Branch_GatewayEthernet {
public:
    Branch_GatewayEthernet();
    ~Branch_GatewayEthernet();

    // Initialize the branch with required components
    void init(ScreenRouter* screenRouter, Helper_Preferences* preferences, DeviceConfig* device,
              Helper_DeviceInfo* deviceInfo, Helper_DeviceCapabilities* deviceCapabilities);

    // Main loop - called from Manager_Connections::loop()
    void loop();

    // Status checks
    bool isActive() const { return initialized && isConnected(); }
    bool isConnected() const;

    // Network information
    String getIPAddress() const;

    // WebSocket access
    bool isWebSocketActive() const;
    uint8_t getWebSocketClients() const;

    // Gateway-specific status
    bool isESPNowReady() const;
    int getESPNowPeerCount() const;
    String getESPNowPeersJSON() const;

private:
    bool initialized;
    ScreenRouter* screenRouter;
    Helper_Preferences* preferences;
    DeviceConfig* devicePtr;
    
    // Injected helpers
    Helper_DeviceInfo* deviceInfo;
    Helper_DeviceCapabilities* deviceCapabilities;
    
    // Core helpers
    Helper_StreamProcessor* streamProcessor;
    Helper_HTTPEndpoints* httpEndpoints;
    Helper_WebSocket* webSocketHelper;
    Helper_ESPNOW* espnowHelper;  // Gateway functionality

    // Ethernet-specific settings
    String deviceName;

    // Connection state
    unsigned long lastConnectionCheck;
    static const unsigned long CONNECTION_CHECK_INTERVAL = 30000;  // 30 seconds

    // Hardware configuration
    struct EthernetConfig {
        eth_phy_type_t phyType;
        int phyAddr;
        int phyPower;
        int phyMDC;
        int phyMDIO;
        eth_clock_mode_t clockMode;
    };
    
    EthernetConfig ethernetConfig;

    // Static instance for event handler
    static Branch_GatewayEthernet* instance;

    // Core initialization methods
    void initializeEthernet();
    void initializeHTTPEndpoints();
    void initializeWebSocket();
    void initializeESPNow();
    void setupMDNS();

    // Connection management
    bool connectToEthernet();
    void handleEthernetDisconnection();
    void detectHardwareConfig();

    // ESP-NOW management
    bool addESPNowPeerIfNeeded(const String& macAddress);

    // StreamProcessor callback handlers
    void handleProtocolPayload(const JsonDocument& doc);
    void handleSystemPayload(const JsonDocument& doc);

    // Gateway-specific protocol handlers
    void handleDestinationPayload(const JsonDocument& doc);
    void handlePeerManagementRequest(const JsonDocument& doc);
    void handleESPNowResponse(const JsonDocument& doc);
    void handleGatewayStatus(const JsonDocument& doc);
    void handleHTTPRequest(const JsonDocument& doc);
    void handleWebSocketPing(const JsonDocument& doc);

    // System handlers using injected helpers
    void handleDeviceInfoRequest(const JsonDocument& doc);
    void handleDeviceCapabilitiesRequest(const JsonDocument& doc);
    void handleStatsRequest(const JsonDocument& doc);
    void handlePreferencesRequest(const JsonDocument& doc);
    void handleSystemCommand(const JsonDocument& doc);

    // Gateway-specific response handlers
    void handleESPNowIncomingData(const JsonDocument& doc);
    void forwardESPNowDataToWebSocket(const JsonDocument& doc);
    void forwardESPNowDataToHTTP(const JsonDocument& doc);

    // Ethernet event handling
    void handleEthernetEvent(WiFiEvent_t event);
    void updateConnectionState(bool connected);

    // Static event handler
    static void WiFiEventHandler(WiFiEvent_t event);

    // Utility methods
    void emitStatus();
    void printConnectionStatus();
    String extractDestinationMac(const JsonDocument& doc);
    bool isValidMacAddress(const String& mac);
};

#endif // BRANCH_GATEWAY_ETHERNET_H