#ifndef BRANCH_GATEWAY_USB_H
#define BRANCH_GATEWAY_USB_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <functional>
#include <queue>

// Forward declarations
class Helper_StreamProcessor;
class Helper_DeviceInfo;
class Helper_DeviceCapabilities;
class Helper_ESPNOW;
class ScreenRouter;
class DeviceConfig;

class Branch_GatewayUsb {
public:
    Branch_GatewayUsb();
    ~Branch_GatewayUsb();

    // Initialize the Gateway USB connection mode
    void init(ScreenRouter* screenRouter, DeviceConfig* device, 
              Helper_DeviceInfo* deviceInfo, Helper_DeviceCapabilities* deviceCapabilities);

    // Periodic processing - call from main loop
    void loop();

    // Get connection status
    bool isActive() const { return initialized; }

    // Gateway-specific status
    bool isESPNowReady() const;
    int getESPNowPeerCount() const;
    String getESPNowPeersJSON() const;

private:
    bool initialized;
    ScreenRouter* screenRouter;
    DeviceConfig* devicePtr;
    Helper_StreamProcessor* streamProcessor;
    Helper_ESPNOW* espnowHelper;
    
    // Injected helpers
    Helper_DeviceInfo* deviceInfo;
    Helper_DeviceCapabilities* deviceCapabilities;

    // USB CDC buffer and state (copied from Branch_UsbDirect)
    static const size_t USB_BUFFER_SIZE = 2048;
    uint8_t usbBuffer[USB_BUFFER_SIZE];

    // Response management (copied from Branch_UsbDirect)
    struct ResponseData {
        String jsonData;
        unsigned long timestamp;
        String requestType;
    };
    
    std::queue<ResponseData> responseQueue;
    static const size_t MAX_RESPONSE_QUEUE_SIZE = 10;
    unsigned long lastResponseCheck;
    static const unsigned long RESPONSE_CHECK_INTERVAL = 10; // Check every 10ms

    // Core USB CDC methods (copied from Branch_UsbDirect)
    void initializeUsbCdc();
    void processUsbData();
    void processResponseQueue();

    // Response sending methods (copied from Branch_UsbDirect)
    void sendResponse(const String& jsonResponse, const String& requestType = "");
    void sendErrorResponse(const String& errorMessage, const String& requestType = "");
    void flushResponse(const String& data);

    // ESP-NOW initialization and management
    void initializeESPNow();
    bool addESPNowPeerIfNeeded(const String& macAddress);

    // StreamProcessor callback handlers
    void handleProtocolPayload(const JsonDocument& doc);
    void handleSystemPayload(const JsonDocument& doc);
    
    // Gateway-specific protocol handlers
    void handleDestinationPayload(const JsonDocument& doc);
    void handlePeerManagementRequest(const JsonDocument& doc);
    void handleESPNowResponse(const JsonDocument& doc);
    void handleGatewayStatus(const JsonDocument& doc);
    
    // System handlers using injected helpers (same as other branches)
    void handleDeviceInfoRequest(const JsonDocument& doc);
    void handleDeviceCapabilitiesRequest(const JsonDocument& doc);
    void handleStatsRequest(const JsonDocument& doc);
    void handlePreferencesRequest(const JsonDocument& doc);
    void handleSystemCommand(const JsonDocument& doc);

    // Gateway-specific response handlers
    void handleESPNowIncomingData(const JsonDocument& doc);
    void forwardESPNowDataToUSB(const JsonDocument& doc);

    // Utility methods
    String getRequestType(const JsonDocument& doc);
    bool isValidJson(const String& jsonString);
    String extractDestinationMac(const JsonDocument& doc);
    bool isValidMacAddress(const String& mac);
};

#endif // BRANCH_GATEWAY_USB_H