#include "Helper_Preferences.h"
#include <ArduinoJson.h>

Helper_Preferences::Helper_Preferences() {

}

Helper_Preferences::~Helper_Preferences() {
    prefs.end();
}

void Helper_Preferences::begin() {
    // Now that NVS is initialized, open our namespace
    prefs.begin(NAMESPACE, false);
}

bool Helper_Preferences::isConfigured() {
    return prefs.getBool(KEY_CONFIGURED, false);
}

String Helper_Preferences::getConnectionModeString() {
    return prefs.getString(KEY_CONN_MODE, "");
}

void Helper_Preferences::setConnectionModeString(const String &mode) {
    prefs.putString(KEY_CONN_MODE, mode);
    prefs.putBool(KEY_CONFIGURED, true);
}

int Helper_Preferences::getDisplayRotation() {
    return prefs.getInt(KEY_ROTATION, 0);
}

void Helper_Preferences::setDisplayRotation(int rotation) {
    if (rotation < 0)   rotation = 0;
    if (rotation > 3)   rotation = 3;
    prefs.putInt(KEY_ROTATION, rotation);
}

bool Helper_Preferences::getSwapBlueGreen() {
    return prefs.getBool(KEY_SWAP_BG, false);
}

void Helper_Preferences::setSwapBlueGreen(bool swap) {
    prefs.putBool(KEY_SWAP_BG, swap);
}

String Helper_Preferences::getExternalNeoPixelsData1() {
    return prefs.getString(KEY_NEOPIXEL1, "");
}

void Helper_Preferences::setExternalNeoPixelsData1(const String &pin) {
    prefs.putString(KEY_NEOPIXEL1, pin);
}

String Helper_Preferences::getExternalNeoPixelsData2() {
    return prefs.getString(KEY_NEOPIXEL2, "");
}

void Helper_Preferences::setExternalNeoPixelsData2(const String &pin) {
    prefs.putString(KEY_NEOPIXEL2, pin);
}

// ==========================================
// WiFi PREFERENCES
// ==========================================

String Helper_Preferences::getWiFiSSID() {
    return prefs.getString(KEY_WIFI_SSID, "");
}

void Helper_Preferences::setWiFiSSID(const String &ssid) {
    prefs.putString(KEY_WIFI_SSID, ssid);
}

String Helper_Preferences::getWiFiPassword() {
    return prefs.getString(KEY_WIFI_PASSWORD, "");
}

void Helper_Preferences::setWiFiPassword(const String &password) {
    prefs.putString(KEY_WIFI_PASSWORD, password);
}

String Helper_Preferences::getDeviceName() {
    return prefs.getString(KEY_DEVICE_NAME, "JunctionRelay");
}

void Helper_Preferences::setDeviceName(const String &name) {
    prefs.putString(KEY_DEVICE_NAME, name);
}

bool Helper_Preferences::getWiFiAutoReconnect() {
    return prefs.getBool(KEY_WIFI_AUTO_RECONNECT, true);
}

void Helper_Preferences::setWiFiAutoReconnect(bool autoReconnect) {
    prefs.putBool(KEY_WIFI_AUTO_RECONNECT, autoReconnect);
}

// ==========================================
// MQTT PREFERENCES
// ==========================================

String Helper_Preferences::getMQTTBroker() {
    return prefs.getString(KEY_MQTT_BROKER, "");
}

void Helper_Preferences::setMQTTBroker(const String &broker) {
    prefs.putString(KEY_MQTT_BROKER, broker);
}

String Helper_Preferences::getMQTTUsername() {
    return prefs.getString(KEY_MQTT_USERNAME, "");
}

void Helper_Preferences::setMQTTUsername(const String &username) {
    prefs.putString(KEY_MQTT_USERNAME, username);
}

String Helper_Preferences::getMQTTPassword() {
    return prefs.getString(KEY_MQTT_PASSWORD, "");
}

void Helper_Preferences::setMQTTPassword(const String &password) {
    prefs.putString(KEY_MQTT_PASSWORD, password);
}

String Helper_Preferences::getMQTTClientID() {
    return prefs.getString(KEY_MQTT_CLIENT_ID, "");
}

void Helper_Preferences::setMQTTClientID(const String &clientId) {
    prefs.putString(KEY_MQTT_CLIENT_ID, clientId);
}

String Helper_Preferences::getMQTTTopicPrefix() {
    return prefs.getString(KEY_MQTT_TOPIC_PREFIX, "junctionrelay");
}

void Helper_Preferences::setMQTTTopicPrefix(const String &prefix) {
    prefs.putString(KEY_MQTT_TOPIC_PREFIX, prefix);
}

bool Helper_Preferences::getMQTTEnabled() {
    return prefs.getBool(KEY_MQTT_ENABLED, false);
}

void Helper_Preferences::setMQTTEnabled(bool enabled) {
    prefs.putBool(KEY_MQTT_ENABLED, enabled);
}

// ==========================================
// ETHERNET PREFERENCES
// ==========================================

bool Helper_Preferences::getEthernetDHCP() {
    return prefs.getBool(KEY_ETH_DHCP, true);
}

void Helper_Preferences::setEthernetDHCP(bool useDHCP) {
    prefs.putBool(KEY_ETH_DHCP, useDHCP);
}

String Helper_Preferences::getEthernetStaticIP() {
    return prefs.getString(KEY_ETH_STATIC_IP, "192.168.1.100");
}

void Helper_Preferences::setEthernetStaticIP(const String &ip) {
    prefs.putString(KEY_ETH_STATIC_IP, ip);
}

String Helper_Preferences::getEthernetGateway() {
    return prefs.getString(KEY_ETH_GATEWAY, "192.168.1.1");
}

void Helper_Preferences::setEthernetGateway(const String &gateway) {
    prefs.putString(KEY_ETH_GATEWAY, gateway);
}

String Helper_Preferences::getEthernetSubnet() {
    return prefs.getString(KEY_ETH_SUBNET, "255.255.255.0");
}

void Helper_Preferences::setEthernetSubnet(const String &subnet) {
    prefs.putString(KEY_ETH_SUBNET, subnet);
}

String Helper_Preferences::getEthernetDNS() {
    return prefs.getString(KEY_ETH_DNS, "8.8.8.8");
}

void Helper_Preferences::setEthernetDNS(const String &dns) {
    prefs.putString(KEY_ETH_DNS, dns);
}

// ==========================================
// WEBSOCKET PREFERENCES
// ==========================================

int Helper_Preferences::getWebSocketPort() {
    return prefs.getInt(KEY_WS_PORT, 81);
}

void Helper_Preferences::setWebSocketPort(int port) {
    if (port < 1 || port > 65535) port = 81;
    prefs.putInt(KEY_WS_PORT, port);
}

bool Helper_Preferences::getWebSocketEnabled() {
    return prefs.getBool(KEY_WS_ENABLED, true);
}

void Helper_Preferences::setWebSocketEnabled(bool enabled) {
    prefs.putBool(KEY_WS_ENABLED, enabled);
}

// ==========================================
// ESP-NOW PREFERENCES
// ==========================================

String Helper_Preferences::getESPNowPeerMAC() {
    return prefs.getString(KEY_ESPNOW_PEER_MAC, "");
}

void Helper_Preferences::setESPNowPeerMAC(const String &mac) {
    prefs.putString(KEY_ESPNOW_PEER_MAC, mac);
}

int Helper_Preferences::getESPNowChannel() {
    return prefs.getInt(KEY_ESPNOW_CHANNEL, 1);
}

void Helper_Preferences::setESPNowChannel(int channel) {
    if (channel < 1 || channel > 14) channel = 1;
    prefs.putInt(KEY_ESPNOW_CHANNEL, channel);
}

bool Helper_Preferences::getESPNowEncryption() {
    return prefs.getBool(KEY_ESPNOW_ENCRYPTION, false);
}

void Helper_Preferences::setESPNowEncryption(bool encryption) {
    prefs.putBool(KEY_ESPNOW_ENCRYPTION, encryption);
}

String Helper_Preferences::getESPNowKey() {
    return prefs.getString(KEY_ESPNOW_KEY, "");
}

void Helper_Preferences::setESPNowKey(const String &key) {
    prefs.putString(KEY_ESPNOW_KEY, key);
}

// ==========================================
// SYSTEM PREFERENCES
// ==========================================

bool Helper_Preferences::getSerialDebugEnabled() {
    return prefs.getBool(KEY_SERIAL_DEBUG, true);
}

void Helper_Preferences::setSerialDebugEnabled(bool enabled) {
    prefs.putBool(KEY_SERIAL_DEBUG, enabled);
}

String Helper_Preferences::getTimezone() {
    return prefs.getString(KEY_TIMEZONE, "UTC");
}

void Helper_Preferences::setTimezone(const String &timezone) {
    prefs.putString(KEY_TIMEZONE, timezone);
}

String Helper_Preferences::getNTPServer() {
    return prefs.getString(KEY_NTP_SERVER, "pool.ntp.org");
}

void Helper_Preferences::setNTPServer(const String &server) {
    prefs.putString(KEY_NTP_SERVER, server);
}

// ==========================================
// BULK OPERATIONS
// ==========================================

String Helper_Preferences::getWiFiSettingsJSON() {
    StaticJsonDocument<512> doc;
    
    doc["ssid"] = getWiFiSSID();
    doc["deviceName"] = getDeviceName();
    doc["autoReconnect"] = getWiFiAutoReconnect();
    // Note: Password not included for security
    
    String json;
    serializeJson(doc, json);
    return json;
}

void Helper_Preferences::setWiFiSettingsFromJSON(const String &json) {
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, json);
    
    if (error) {
        Serial.printf("[Helper_Preferences] WiFi JSON parse error: %s\n", error.c_str());
        return;
    }
    
    if (doc.containsKey("ssid")) {
        setWiFiSSID(doc["ssid"].as<String>());
    }
    if (doc.containsKey("password")) {
        setWiFiPassword(doc["password"].as<String>());
    }
    if (doc.containsKey("deviceName")) {
        setDeviceName(doc["deviceName"].as<String>());
    }
    if (doc.containsKey("autoReconnect")) {
        setWiFiAutoReconnect(doc["autoReconnect"].as<bool>());
    }
}

String Helper_Preferences::getMQTTSettingsJSON() {
    StaticJsonDocument<512> doc;
    
    doc["broker"] = getMQTTBroker();
    doc["username"] = getMQTTUsername();
    doc["clientId"] = getMQTTClientID();
    doc["topicPrefix"] = getMQTTTopicPrefix();
    doc["enabled"] = getMQTTEnabled();
    // Note: Password not included for security
    
    String json;
    serializeJson(doc, json);
    return json;
}

void Helper_Preferences::setMQTTSettingsFromJSON(const String &json) {
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, json);
    
    if (error) {
        Serial.printf("[Helper_Preferences] MQTT JSON parse error: %s\n", error.c_str());
        return;
    }
    
    if (doc.containsKey("broker")) {
        setMQTTBroker(doc["broker"].as<String>());
    }
    if (doc.containsKey("username")) {
        setMQTTUsername(doc["username"].as<String>());
    }
    if (doc.containsKey("password")) {
        setMQTTPassword(doc["password"].as<String>());
    }
    if (doc.containsKey("clientId")) {
        setMQTTClientID(doc["clientId"].as<String>());
    }
    if (doc.containsKey("topicPrefix")) {
        setMQTTTopicPrefix(doc["topicPrefix"].as<String>());
    }
    if (doc.containsKey("enabled")) {
        setMQTTEnabled(doc["enabled"].as<bool>());
    }
}

void Helper_Preferences::clearAllSettings() {
    Serial.println("[Helper_Preferences] Clearing all settings (factory reset)");
    prefs.clear();
}

String Helper_Preferences::getAllSettingsJSON() {
    StaticJsonDocument<1024> doc;
    
    // Basic settings
    doc["configured"] = isConfigured();
    doc["connectionMode"] = getConnectionModeString();
    doc["displayRotation"] = getDisplayRotation();
    doc["swapBlueGreen"] = getSwapBlueGreen();
    doc["externalNeoPixelsData1"] = getExternalNeoPixelsData1();
    doc["externalNeoPixelsData2"] = getExternalNeoPixelsData2();
    
    // WiFi settings (without password)
    JsonObject wifi = doc.createNestedObject("wifi");
    wifi["ssid"] = getWiFiSSID();
    wifi["deviceName"] = getDeviceName();
    wifi["autoReconnect"] = getWiFiAutoReconnect();
    
    // MQTT settings (without password)
    JsonObject mqtt = doc.createNestedObject("mqtt");
    mqtt["broker"] = getMQTTBroker();
    mqtt["username"] = getMQTTUsername();
    mqtt["clientId"] = getMQTTClientID();
    mqtt["topicPrefix"] = getMQTTTopicPrefix();
    mqtt["enabled"] = getMQTTEnabled();
    
    // Ethernet settings
    JsonObject ethernet = doc.createNestedObject("ethernet");
    ethernet["dhcp"] = getEthernetDHCP();
    ethernet["staticIP"] = getEthernetStaticIP();
    ethernet["gateway"] = getEthernetGateway();
    ethernet["subnet"] = getEthernetSubnet();
    ethernet["dns"] = getEthernetDNS();
    
    // WebSocket settings
    JsonObject websocket = doc.createNestedObject("websocket");
    websocket["port"] = getWebSocketPort();
    websocket["enabled"] = getWebSocketEnabled();
    
    // ESP-NOW settings (without key)
    JsonObject espnow = doc.createNestedObject("espnow");
    espnow["peerMAC"] = getESPNowPeerMAC();
    espnow["channel"] = getESPNowChannel();
    espnow["encryption"] = getESPNowEncryption();
    
    // System settings
    JsonObject system = doc.createNestedObject("system");
    system["serialDebug"] = getSerialDebugEnabled();
    system["timezone"] = getTimezone();
    system["ntpServer"] = getNTPServer();
    
    String json;
    serializeJson(doc, json);
    return json;
}