#ifndef SCREEN_ROUTER_H
#define SCREEN_ROUTER_H

#include <ArduinoJson.h>
#include <vector>
#include "ScreenDestination.h"  // Abstract base class for display handlers (onboard, I2C, etc.)

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

    void update();
};

#endif // SCREEN_ROUTER_H
