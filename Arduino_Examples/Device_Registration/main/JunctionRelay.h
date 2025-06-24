#ifndef JUNCTION_RELAY_H
#define JUNCTION_RELAY_H

#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>

class JunctionRelay {
public:
    JunctionRelay(const char* deviceName);
    
    void begin();
    void handle();
    void setToken(const String& token);
    void addSensor(const String& key, const String& value);
    
    bool isRegistered();

private:
    String _deviceName;
    String _jwt, _refreshToken, _regToken;
    unsigned long _lastReport;
    bool _registered;
    DynamicJsonDocument _sensors;
    Preferences _prefs;
    
    String getMacAddress();
    void registerDevice();
    void sendHealth();
    void waitForToken();
};

#endif