#ifndef HELPER_PREFERENCES_H
#define HELPER_PREFERENCES_H

#include <Preferences.h>
#include <Arduino.h>

class Helper_Preferences {
public:
    Helper_Preferences();
    ~Helper_Preferences();

    // Call once in setup(), after nvs_flash_init()
    void begin();

    // Has the device ever been configured?
    bool    isConfigured();

    // Connection mode (e.g. "wifi", "espnow", "")
    String  getConnectionModeString();
    void    setConnectionModeString(const String &mode);

    // Display rotation (0..3)
    int     getDisplayRotation();
    void    setDisplayRotation(int rotation);

    // ==========================================
    // WiFi PREFERENCES
    // ==========================================
    
    // WiFi credentials
    String  getWiFiSSID();
    void    setWiFiSSID(const String &ssid);
    
    String  getWiFiPassword();
    void    setWiFiPassword(const String &password);
    
    // WiFi settings
    String  getDeviceName();
    void    setDeviceName(const String &name);
    
    bool    getWiFiAutoReconnect();
    void    setWiFiAutoReconnect(bool autoReconnect);
    
    // ==========================================
    // MQTT PREFERENCES
    // ==========================================
    
    String  getMQTTBroker();
    void    setMQTTBroker(const String &broker);
    
    String  getMQTTUsername();
    void    setMQTTUsername(const String &username);
    
    String  getMQTTPassword();
    void    setMQTTPassword(const String &password);
    
    String  getMQTTClientID();
    void    setMQTTClientID(const String &clientId);
    
    String  getMQTTTopicPrefix();
    void    setMQTTTopicPrefix(const String &prefix);
    
    bool    getMQTTEnabled();
    void    setMQTTEnabled(bool enabled);
    
    // ==========================================
    // ETHERNET PREFERENCES
    // ==========================================
    
    bool    getEthernetDHCP();
    void    setEthernetDHCP(bool useDHCP);
    
    String  getEthernetStaticIP();
    void    setEthernetStaticIP(const String &ip);
    
    String  getEthernetGateway();
    void    setEthernetGateway(const String &gateway);
    
    String  getEthernetSubnet();
    void    setEthernetSubnet(const String &subnet);
    
    String  getEthernetDNS();
    void    setEthernetDNS(const String &dns);
    
    // ==========================================
    // WEBSOCKET PREFERENCES
    // ==========================================
    
    int     getWebSocketPort();
    void    setWebSocketPort(int port);
    
    bool    getWebSocketEnabled();
    void    setWebSocketEnabled(bool enabled);
    
    // ==========================================
    // ESP-NOW PREFERENCES
    // ==========================================
    
    String  getESPNowPeerMAC();
    void    setESPNowPeerMAC(const String &mac);
    
    int     getESPNowChannel();
    void    setESPNowChannel(int channel);
    
    bool    getESPNowEncryption();
    void    setESPNowEncryption(bool encryption);
    
    String  getESPNowKey();
    void    setESPNowKey(const String &key);
    
    // ==========================================
    // SYSTEM PREFERENCES
    // ==========================================
    
    bool    getSerialDebugEnabled();
    void    setSerialDebugEnabled(bool enabled);
    
    String  getTimezone();
    void    setTimezone(const String &timezone);
    
    String  getNTPServer();
    void    setNTPServer(const String &server);
    
    // ==========================================
    // BULK OPERATIONS
    // ==========================================
    
    // Get all WiFi settings as JSON object
    String  getWiFiSettingsJSON();
    void    setWiFiSettingsFromJSON(const String &json);
    
    // Get all MQTT settings as JSON object
    String  getMQTTSettingsJSON();
    void    setMQTTSettingsFromJSON(const String &json);
    
    // Clear all settings (factory reset)
    void    clearAllSettings();
    
    // Get complete settings summary
    String  getAllSettingsJSON();

private:
    Preferences prefs;

    // Namespace and key constants
    static constexpr const char* NAMESPACE      = "connConfig";
    static constexpr const char* KEY_CONFIGURED = "configured";
    static constexpr const char* KEY_CONN_MODE  = "connMode";
    static constexpr const char* KEY_ROTATION   = "rotation";
    
    // WiFi keys
    static constexpr const char* KEY_WIFI_SSID          = "wifiSSID";
    static constexpr const char* KEY_WIFI_PASSWORD      = "wifiPass";
    static constexpr const char* KEY_DEVICE_NAME        = "deviceName";
    static constexpr const char* KEY_WIFI_AUTO_RECONNECT = "wifiAutoRecon";
    
    // MQTT keys
    static constexpr const char* KEY_MQTT_BROKER        = "mqttBroker";
    static constexpr const char* KEY_MQTT_USERNAME      = "mqttUser";
    static constexpr const char* KEY_MQTT_PASSWORD      = "mqttPass";
    static constexpr const char* KEY_MQTT_CLIENT_ID     = "mqttClientId";
    static constexpr const char* KEY_MQTT_TOPIC_PREFIX  = "mqttPrefix";
    static constexpr const char* KEY_MQTT_ENABLED       = "mqttEnabled";
    
    // Ethernet keys
    static constexpr const char* KEY_ETH_DHCP           = "ethDHCP";
    static constexpr const char* KEY_ETH_STATIC_IP      = "ethStaticIP";
    static constexpr const char* KEY_ETH_GATEWAY        = "ethGateway";
    static constexpr const char* KEY_ETH_SUBNET         = "ethSubnet";
    static constexpr const char* KEY_ETH_DNS            = "ethDNS";
    
    // WebSocket keys
    static constexpr const char* KEY_WS_PORT            = "wsPort";
    static constexpr const char* KEY_WS_ENABLED         = "wsEnabled";
    
    // ESP-NOW keys
    static constexpr const char* KEY_ESPNOW_PEER_MAC    = "espnowPeerMAC";
    static constexpr const char* KEY_ESPNOW_CHANNEL     = "espnowChannel";
    static constexpr const char* KEY_ESPNOW_ENCRYPTION  = "espnowEncrypt";
    static constexpr const char* KEY_ESPNOW_KEY         = "espnowKey";
    
    // System keys
    static constexpr const char* KEY_SERIAL_DEBUG       = "serialDebug";
    static constexpr const char* KEY_TIMEZONE           = "timezone";
    static constexpr const char* KEY_NTP_SERVER         = "ntpServer";
};

#endif // HELPER_PREFERENCES_H