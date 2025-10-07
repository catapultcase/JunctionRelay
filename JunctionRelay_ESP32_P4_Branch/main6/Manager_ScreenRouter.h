#ifndef SCREEN_ROUTER_H
#define SCREEN_ROUTER_H

#include <ArduinoJson.h>
#include <vector>
#include "Interface_ScreenDestination.h"  // Abstract base class for display handlers

class ScreenRouter {
private:
    std::vector<ScreenDestination*> destinations;  // List of registered screen destinations

public:
    // Register a screen destination (onboard or I2C)
    void registerScreen(ScreenDestination* screen);

    // Route the configuration data to the correct screen based on screenId
    void routeConfig(const JsonDocument& doc);

    // Route the sensor data to the correct screen based on screenId
    void routeSensor(const JsonDocument& doc);

    // Get list of registered destinations (for debugging)
    const std::vector<ScreenDestination*>& getDestinations() const { return destinations; }
    
    // Note: update() method removed - all managers now use dedicated tasks
};

#endif // SCREEN_ROUTER_H