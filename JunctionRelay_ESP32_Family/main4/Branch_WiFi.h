#ifndef BRANCH_WIFI_H
#define BRANCH_WIFI_H

#include <Arduino.h>
#include <WiFi.h>
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

class Branch_Wifi {
public:
    Branch_Wifi();
    ~Branch_Wifi();

    // Initialize the WiFi connection mode
    void init(ScreenRouter* screenRouter, Helper_Preferences* preferences, DeviceConfig* device,
              Helper_DeviceInfo* deviceInfo, Helper_DeviceCapabilities* deviceCapabilities);

    // Periodic processing - call from main loop
    void loop();

    // Get connection status
    bool isActive() const { return initialized && WiFi.status() == WL_CONNECTED; }
    bool isWiFiConnected() const { return WiFi.status() == WL_CONNECTED; }

    // Connection management
    void reconnectWiFi();

    // Network information
    String getIPAddress() const;
    String getMacAddress() const;
    int getSignalStrength() const;

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

    // WiFi credentials and settings
    String ssid;
    String password;
    String deviceName;

    // Connection state
    unsigned long lastWiFiCheck;
    static const unsigned long WIFI_CHECK_INTERVAL = 30000;  // 30 seconds

    // Core initialization methods
    void initializeWiFi();
    void initializeHTTPEndpoints();
    void setupMDNS();

    // Connection management
    bool connectToWiFi();
    void handleWiFiDisconnection();

    // StreamProcessor callback handlers
    void handleProtocolPayload(const JsonDocument& doc);
    void handleSystemPayload(const JsonDocument& doc);

    // Protocol-specific handlers
    void handleHTTPRequest(const JsonDocument& doc);

    // System handlers using injected helpers
    void handleDeviceInfoRequest(const JsonDocument& doc);
    void handleDeviceCapabilitiesRequest(const JsonDocument& doc);
    void handleStatsRequest(const JsonDocument& doc);
    void handlePreferencesRequest(const JsonDocument& doc);
    void handleSystemCommand(const JsonDocument& doc);

    // Utility methods
    String getFormattedMacAddress() const;
    void emitStatus();
    void printWiFiStatus();
};

#endif // BRANCH_WIFI_H