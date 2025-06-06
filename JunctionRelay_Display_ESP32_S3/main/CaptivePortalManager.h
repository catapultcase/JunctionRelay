#ifndef CAPTIVE_PORTAL_MANAGER_H
#define CAPTIVE_PORTAL_MANAGER_H

#include <FreeRTOS.h>   // <-- Include FreeRTOS first
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <WiFi.h>
#include <Preferences.h>
#include "Utils.h"

class CaptivePortalManager {
public:
    CaptivePortalManager();
    void begin(const String& ssidPrefix);
    void startWebServer();
    void handleRequest(AsyncWebServerRequest *request);
    void handleFormSubmission(AsyncWebServerRequest *request);  // <-- Declaration of form handler

private:
    AsyncWebServer server;
    String apSSID;
    String apIP;
};

#endif // CAPTIVE_PORTAL_MANAGER_H
