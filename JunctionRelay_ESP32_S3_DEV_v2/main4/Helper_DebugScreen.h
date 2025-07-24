#ifndef HELPER_DEBUG_SCREEN_H
#define HELPER_DEBUG_SCREEN_H

#include <Arduino.h>
#include <Wire.h>
#include <SparkFun_Qwiic_OLED.h>
#include <ArduinoJson.h>

// Screen cycling configuration
#define SCREEN_CYCLE_INTERVAL_MS 8000  // Switch screens every 8 seconds
#define ENABLE_SCREEN_CYCLING true     // Set to false to disable auto-cycling

class Helper_DebugScreen {
public:
    Helper_DebugScreen();
    void begin();
    void loop();
    void handleParsedPayload(const JsonDocument& doc, size_t rawSize, uint8_t typeField, uint8_t routeField);
    
    // StreamProcessor integration methods
    void trackJsonError();
    void trackLocalDestination();
    void trackRemoteDestination(const String& mac);
    void trackQueueOverflow(const String& queueType);
    void trackRoutingError();

private:
    enum class OLEDType {
        None,
        Narrow,
        Tall
    };

    enum class ScreenMode {
        PayloadStats,      // Original payload statistics
        RoutingStats,      // Destination routing info
        ProtocolStats,     // Message type breakdown
        SystemStatus,      // Queue health & performance
        NetworkTopology,   // Gateway/peer activity
        ErrorStats         // Error tracking & rates
    };

    OLEDType oledType = OLEDType::None;
    QwiicNarrowOLED narrowOLED;
    Qwiic1in3OLED tallOLED;

    // Screen cycling task
    ScreenMode currentScreen = ScreenMode::PayloadStats;
    unsigned long lastScreenSwitch = 0;
    static const int TOTAL_SCREENS = 6;
    TaskHandle_t screenCyclingTask = nullptr;

    // Enhanced statistics tracking
    unsigned long totalPayloads = 0;
    unsigned long lastPayloadTime = 0;
    unsigned long payloadInterval = 0;
    uint8_t lastTypeField = 0;  // Track the actual last payload type
    size_t lastPayloadSize = 0; // Track the last payload size specifically
    uint8_t lastRouteField = 0; // Track the last route field
    
    // Routing statistics
    unsigned long localDestinations = 0;
    unsigned long remoteDestinations = 0;
    unsigned long invalidDestinations = 0;
    String lastRemoteDestination = "";
    
    // Protocol statistics
    unsigned long sensorMessages = 0;
    unsigned long configMessages = 0;
    unsigned long protocolMessages = 0;
    unsigned long systemMessages = 0;
    
    // Error tracking
    unsigned long jsonErrors = 0;
    unsigned long routingErrors = 0;
    unsigned long queueOverflows = 0;
    
    // Performance tracking
    unsigned long totalBytes = 0;
    unsigned long peakInterval = 0;
    unsigned long minInterval = ULONG_MAX;

    // Task methods
    static void screenCyclingTaskFunction(void* parameter);
    void createScreenCyclingTask();
    void deleteScreenCyclingTask();
    
    // Thread safety
    SemaphoreHandle_t displayMutex = nullptr;
    volatile bool payloadUpdatePending = false;  // Signal for priority updates
    bool safeToUpdateDisplay();

    // Display methods
    void updateDisplay();
    void displayPayloadStats();
    void displayRoutingStats();
    void displayProtocolStats();
    void displaySystemStatus();
    void displayNetworkTopology();
    void displayErrorStats();
    
    // Helper methods
    void switchToNextScreen();
    void clearScreen();
    void printLine(int row, const String& text);
    int getMaxRows();
    void analyzePayloadForRouting(const JsonDocument& doc);
    String getTypeString(uint8_t typeField);
};

#endif // HELPER_DEBUG_SCREEN_H