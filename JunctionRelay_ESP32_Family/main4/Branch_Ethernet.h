#ifndef BRANCH_ETHERNET_H
#define BRANCH_ETHERNET_H

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
class ScreenRouter;
class DeviceConfig;

class Branch_Ethernet {
public:
    Branch_Ethernet();
    ~Branch_Ethernet();

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
    Helper_WebSocket* webSocketHelper;  // NEW: WebSocket support

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

    // Core initialization methods
    void initializeEthernet();
    void initializeHTTPEndpoints();
    void initializeWebSocket();  // NEW
    void setupMDNS();

    // Connection management
    bool connectToEthernet();
    void handleEthernetDisconnection();
    void detectHardwareConfig();

    // StreamProcessor callback handlers
    void handleProtocolPayload(const JsonDocument& doc);
    void handleSystemPayload(const JsonDocument& doc);

    // Protocol-specific handlers
    void handleHTTPRequest(const JsonDocument& doc);
    void handleWebSocketPing(const JsonDocument& doc);      // NEW
    void handleGatewayForward(const JsonDocument& doc);     // NEW

    // System handlers using injected helpers
    void handleDeviceInfoRequest(const JsonDocument& doc);
    void handleDeviceCapabilitiesRequest(const JsonDocument& doc);
    void handleStatsRequest(const JsonDocument& doc);
    void handlePreferencesRequest(const JsonDocument& doc);
    void handleSystemCommand(const JsonDocument& doc);

    // Ethernet event handling
    void handleEthernetEvent(WiFiEvent_t event);
    void updateConnectionState(bool connected);

    // Static event handler
    static void WiFiEventHandler(WiFiEvent_t event);
    static Branch_Ethernet* instance;

    // Utility methods
    void emitStatus();
    void printConnectionStatus();
};

#endif // BRANCH_ETHERNET_H