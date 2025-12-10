#ifndef BRANCH_ESPNOW_H
#define BRANCH_ESPNOW_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <functional>

// Forward declarations
class Helper_StreamProcessor;
class Helper_DeviceInfo;
class Helper_DeviceCapabilities;
class Helper_ESPNOW;
class ScreenRouter;
class DeviceConfig;

class Branch_EspNow {
public:
    Branch_EspNow();
    ~Branch_EspNow();

    // Initialize the ESP-NOW connection mode
    void init(ScreenRouter* screenRouter, DeviceConfig* device, 
              Helper_DeviceInfo* deviceInfo, Helper_DeviceCapabilities* deviceCapabilities);

    // Periodic processing - call from main loop
    void loop();

    // Get connection status
    bool isActive() const { return initialized; }

    // ESP-NOW specific methods
    bool addPeer(const String& macAddress, const String& name = "");
    bool removePeer(const String& macAddress);
    void clearPeers();
    int getPeerCount() const;
    String getPeersJSON() const;
    
    // Broadcasting methods
    void broadcastMessage(const String& message);
    void broadcastJSON(const JsonDocument& doc);

private:
    bool initialized;
    ScreenRouter* screenRouter;
    DeviceConfig* devicePtr;
    Helper_StreamProcessor* streamProcessor;
    Helper_ESPNOW* espnowHelper;
    
    // Injected helpers
    Helper_DeviceInfo* deviceInfo;
    Helper_DeviceCapabilities* deviceCapabilities;

    // Core ESP-NOW methods
    void initializeESPNow();

    // StreamProcessor callback handlers
    void handleProtocolPayload(const JsonDocument& doc);
    void handleSystemPayload(const JsonDocument& doc);
    
    // Protocol-specific handlers (ESP-NOW peer management and discovery)
    void handlePeerDiscoveryRequest(const JsonDocument& doc);
    void handlePeerManagementRequest(const JsonDocument& doc);
    void handleESPNowMessage(const JsonDocument& doc);
    void handleDeviceStatusRequest(const JsonDocument& doc);
    
    // System handlers using injected helpers
    void handleDeviceInfoRequest(const JsonDocument& doc);
    void handleDeviceCapabilitiesRequest(const JsonDocument& doc);
    void handleStatsRequest(const JsonDocument& doc);
    void handlePreferencesRequest(const JsonDocument& doc);
    void handleSystemCommand(const JsonDocument& doc);

    // Response helpers
    void sendResponseToPeer(const String& targetMac, const JsonDocument& response);
    void broadcastResponse(const JsonDocument& response);
    
    // Utility methods
    String getRequestType(const JsonDocument& doc);
    String getTargetMac(const JsonDocument& doc);
    bool isValidMacAddress(const String& mac);
};

#endif // BRANCH_ESPNOW_H