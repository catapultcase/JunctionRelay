#include "JunctionRelay.h"

JunctionRelay::JunctionRelay(const char* deviceName) 
    : _deviceName(deviceName), _lastReport(0), _registered(false), _sensors(512) {}

void JunctionRelay::begin() {
    _prefs.begin("relay", false);
    _jwt = _prefs.getString("jwt", "");
    _refreshToken = _prefs.getString("refresh", "");
    _registered = (_jwt.length() > 0);
    
    if (_registered) {
        Serial.println("✅ Device already registered");
    } else {
        Serial.println("⏳ Device needs registration");
        Serial.println("Enter registration token in Serial Monitor or set REGISTRATION_TOKEN in code");
    }
}

void JunctionRelay::handle() {
    if (WiFi.status() != WL_CONNECTED) return;
    
    if (!_registered) {
        waitForToken();
        return;
    }
    
    // Send health every 60 seconds
    if (millis() - _lastReport > 60000) {
        sendHealth();
        _lastReport = millis();
    }
}

void JunctionRelay::setToken(const String& token) {
    if (token.length() > 0 && !_registered) {
        _regToken = token;
        registerDevice();
    }
}

void JunctionRelay::addSensor(const String& key, const String& value) {
    _sensors[key] = value;
}

bool JunctionRelay::isRegistered() {
    return _registered;
}

String JunctionRelay::getMacAddress() {
    uint64_t mac = ESP.getEfuseMac();
    char macStr[18];
    snprintf(macStr, 18, "%02X:%02X:%02X:%02X:%02X:%02X",
             (uint8_t)(mac), (uint8_t)(mac >> 8), (uint8_t)(mac >> 16),
             (uint8_t)(mac >> 24), (uint8_t)(mac >> 32), (uint8_t)(mac >> 40));
    return String(macStr);
}

void JunctionRelay::waitForToken() {
    static bool promptShown = false;
    if (!promptShown) {
        Serial.println("Waiting for registration token...");
        promptShown = true;
    }
    
    if (Serial.available()) {
        String token = Serial.readString();
        token.trim();
        if (token.length() > 0) {
            Serial.println("Token received, registering...");
            _regToken = token;
            registerDevice();
        }
    }
}

void JunctionRelay::registerDevice() {
    Serial.println("🔄 Registering device...");
    
    HTTPClient http;
    http.begin("https://api.junctionrelay.com/cloud/devices/register-and-exchange");
    http.addHeader("Content-Type", "application/json");
    
    DynamicJsonDocument doc(1024);
    doc["RegistrationToken"] = _regToken;
    doc["DeviceId"] = getMacAddress();
    doc["DeviceName"] = _deviceName;
    doc["DeviceType"] = "ESP32";
    
    String payload;
    serializeJson(doc, payload);
    
    int code = http.POST(payload);
    if (code == 200) {
        DynamicJsonDocument resp(1024);
        deserializeJson(resp, http.getString());
        
        if (resp["success"]) {
            _jwt = resp["deviceJwt"].as<String>();
            _refreshToken = resp["refreshToken"].as<String>();
            _prefs.putString("jwt", _jwt);
            _prefs.putString("refresh", _refreshToken);
            _registered = true;
            Serial.println("✅ Device registered successfully!");
        } else {
            Serial.println("❌ Registration failed: " + resp["error"].as<String>());
        }
    } else {
        Serial.println("❌ Registration failed, HTTP code: " + String(code));
    }
    http.end();
}

void JunctionRelay::sendHealth() {
    HTTPClient http;
    http.begin("https://api.junctionrelay.com/cloud/devices/health");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + _jwt);
    
    DynamicJsonDocument doc(1024);
    doc["Status"] = "online";
    
    // Add system + custom sensors as JSON string
    DynamicJsonDocument sensors(512);
    sensors["uptime"] = millis() / 1000;
    sensors["freeHeap"] = ESP.getFreeHeap();
    sensors["wifiRSSI"] = WiFi.RSSI();
    
    // Add custom sensors
    for (JsonPair kv : _sensors.as<JsonObject>()) {
        sensors[kv.key()] = kv.value();
    }
    
    String sensorString;
    serializeJson(sensors, sensorString);
    doc["SensorData"] = sensorString;
    
    String payload;
    serializeJson(doc, payload);
    
    int code = http.POST(payload);
    if (code == 200) {
        Serial.println("✅ Health sent");
    } else if (code == 401) {
        Serial.println("❌ Token expired");
    }
    
    http.end();
    _sensors.clear();
}