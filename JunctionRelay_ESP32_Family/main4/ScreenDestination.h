#ifndef SCREEN_DESTINATION_H
#define SCREEN_DESTINATION_H

#include <ArduinoJson.h>

// Interface for anything that can receive config/sensor data
class ScreenDestination {
public:
    virtual ~ScreenDestination() {}

    // Unique ID to identify this screen (may be unused if using matchesScreenId for dynamic matching)
    virtual String getScreenId() const = 0;

    // Handle a config payload (usually to lay out the UI)
    virtual void applyConfig(const JsonDocument& configDoc) = 0;

    // Handle a sensor payload (to update values)
    virtual void updateSensorData(const JsonDocument& sensorDoc) = 0;

    // Determine if this screen wants to handle the payload based on screenId and contents
    virtual bool matchesScreenId(const String& screenId, const JsonDocument& doc) const = 0;

    // NEW: Return the key to extract config from in the payload (e.g., "quad", "oled")
    virtual const char* getConfigKey() const = 0;

    virtual void update() {} 
};

#endif // SCREEN_DESTINATION_H
