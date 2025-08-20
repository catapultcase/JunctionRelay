#ifndef BRANCH_USBDIRECT_H
#define BRANCH_USBDIRECT_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <functional>
#include <queue>

// Forward declarations
class Helper_StreamProcessor;
class Helper_DeviceInfo;
class Helper_DeviceCapabilities;
class ScreenRouter;
class DeviceConfig;

class Branch_UsbDirect {
public:
    Branch_UsbDirect();
    ~Branch_UsbDirect();

    // Initialize the USB Direct connection mode
    void init(ScreenRouter* screenRouter, DeviceConfig* device, 
              Helper_DeviceInfo* deviceInfo, Helper_DeviceCapabilities* deviceCapabilities);

    // Periodic processing - call from main loop
    void loop();

    // Get connection status
    bool isActive() const { return initialized; }

private:
    bool initialized;
    ScreenRouter* screenRouter;
    DeviceConfig* devicePtr;
    Helper_StreamProcessor* streamProcessor;
    
    // Injected helpers
    Helper_DeviceInfo* deviceInfo;
    Helper_DeviceCapabilities* deviceCapabilities;

    // USB CDC buffer and state
    static const size_t USB_BUFFER_SIZE = 2048;
    uint8_t usbBuffer[USB_BUFFER_SIZE];

    // Response management
    struct ResponseData {
        String jsonData;
        unsigned long timestamp;
        String requestType;
    };
    
    std::queue<ResponseData> responseQueue;
    static const size_t MAX_RESPONSE_QUEUE_SIZE = 10;
    unsigned long lastResponseCheck;
    static const unsigned long RESPONSE_CHECK_INTERVAL = 10; // Check every 10ms

    // Core USB CDC methods
    void initializeUsbCdc();
    void processUsbData();
    void processResponseQueue();

    // Response sending methods
    void sendResponse(const String& jsonResponse, const String& requestType = "");
    void sendErrorResponse(const String& errorMessage, const String& requestType = "");
    void flushResponse(const String& data);

    // StreamProcessor callback handlers
    void handleProtocolPayload(const JsonDocument& doc);
    void handleSystemPayload(const JsonDocument& doc);
    
    // System handlers using injected helpers - now with response capability
    void handleDeviceInfoRequest(const JsonDocument& doc);
    void handleDeviceCapabilitiesRequest(const JsonDocument& doc);
    void handleStatsRequest(const JsonDocument& doc);
    void handlePreferencesRequest(const JsonDocument& doc);
    void handleSystemCommand(const JsonDocument& doc);

    // Utility methods
    String getRequestType(const JsonDocument& doc);
    bool isValidJson(const String& jsonString);
};

#endif // BRANCH_USBDIRECT_H