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
class Helper_Preferences;
class Helper_DeviceInfo;
class Helper_DeviceCapabilities;
class ScreenRouter;
class DeviceConfig;

class Branch_Ethernet {
public:
    Branch_Ethernet();
    ~Branch_Ethernet();

    // Initialize the branch with required components - EXACT SAME SIGNATURE AS WiFi
    void init(ScreenRouter* screenRouter, Helper_Preferences* preferences, DeviceConfig* device,
              Helper_DeviceInfo* deviceInfo, Helper_DeviceCapabilities* deviceCapabilities);

    // Main loop - called from Manager_Connections::loop()
    void loop();

    // Status checks - EXACT SAME AS WiFi
    bool isActive() const { return initialized && isConnected(); }
    bool isConnected() const;

    // Network information - SAME PATTERN AS WiFi
    String getIPAddress() const;
    String getMacAddress() const;

private:
    bool initialized;
    ScreenRouter* screenRouter;
    Helper_Preferences* preferences;
    DeviceConfig* devicePtr;
    
    // Injected helpers - EXACT SAME AS WiFi
    Helper_DeviceInfo* deviceInfo;
    Helper_DeviceCapabilities* deviceCapabilities;
    
    // Core helpers - EXACT SAME AS WiFi
    Helper_StreamProcessor* streamProcessor;
    Helper_HTTPEndpoints* httpEndpoints;

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

    // Core initialization methods - SAME PATTERN AS WiFi
    void initializeEthernet();
    void initializeHTTPEndpoints();
    void setupMDNS();

    // Connection management
    bool connectToEthernet();
    void handleEthernetDisconnection();
    void detectHardwareConfig();

    // StreamProcessor callback handlers - EXACT SAME AS WiFi
    void handleProtocolPayload(const JsonDocument& doc);
    void handleSystemPayload(const JsonDocument& doc);

    // Protocol-specific handlers - SAME AS WiFi
    void handleHTTPRequest(const JsonDocument& doc);

    // System handlers using injected helpers - EXACT SAME AS WiFi 
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

    // Utility methods - SAME AS WiFi
    String getFormattedMacAddress() const;
    void emitStatus();
    void printConnectionStatus();
};

#endif // BRANCH_ETHERNET_H