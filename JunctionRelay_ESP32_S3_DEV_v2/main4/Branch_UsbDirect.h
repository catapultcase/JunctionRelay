#ifndef BRANCH_USBDIRECT_H
#define BRANCH_USBDIRECT_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <functional>

// Forward declarations
class Helper_StreamProcessor;
class ScreenRouter;
class DeviceConfig;

class Branch_UsbDirect {
public:
    Branch_UsbDirect();
    ~Branch_UsbDirect();

    // Initialize the USB Direct connection mode
    void init(ScreenRouter* screenRouter, DeviceConfig* device);

    // Periodic processing - call from main loop
    void loop();

    // Get connection status
    bool isActive() const { return initialized; }

private:
    bool initialized;
    ScreenRouter* screenRouter;
    DeviceConfig* devicePtr;
    Helper_StreamProcessor* streamProcessor;

    // USB CDC buffer and state
    static const size_t USB_BUFFER_SIZE = 2048;
    uint8_t usbBuffer[USB_BUFFER_SIZE];

    // Core USB CDC methods
    void initializeUsbCdc();
    void processUsbData();

    // StreamProcessor callback handlers
    void handleProtocolPayload(const JsonDocument& doc);
    void handleSystemPayload(const JsonDocument& doc);
};

#endif // BRANCH_USBDIRECT_H