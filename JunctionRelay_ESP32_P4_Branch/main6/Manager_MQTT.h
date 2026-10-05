#ifndef MANAGER_MQTT_H
#define MANAGER_MQTT_H

#include <WiFi.h>
#include <mqtt_client.h>
#include <ArduinoJson.h>
#include <vector>

// Forward declarations
class Helper_Preferences;

// Define maximum payload size for MQTT messages
#define MQTT_MAX_PAYLOAD_SIZE 8192

class Manager_MQTT {
public:
    // Factory method to create from preferences
    static Manager_MQTT* createFromPreferences(Helper_Preferences* prefs);
    
    Manager_MQTT(const char* server, uint16_t port, const char* username = "", const char* password = "");
    ~Manager_MQTT();
    
    void begin();                             // Initialize MQTT
    void subscribe(const char* topic);        // Subscribe to MQTT topics
    void publish(const char* topic, const String& message); // Publish a message
    bool connected();
    bool testTcpConnection();                 // Test TCP connection to broker

    // Static instance pointer for the callback
    static Manager_MQTT* instance;
    
    // Non-static event handler method
    void handleMqttEvent(esp_mqtt_event_t* event);

private:
    esp_mqtt_client_handle_t mqttClient;     // ESP32 MQTT client
    char mqttServer[64];                     // Fixed buffer for MQTT Broker address
    uint16_t mqttPort;                       // MQTT Broker port
    String mqttUsername;                     // MQTT Username
    String mqttPassword;                     // MQTT Password
    bool isConnected;                        // Connection state
    
    std::vector<String> subscribedTopics;    // Store topics to resubscribe after reconnection
    
    // Store topics for reconnection
    void storeSubscribedTopic(const char* topic);
    
    // Resubscribe to all topics after reconnection
    void resubscribeToTopics();
    
    // Process received data
    void processIncomingMessage(const char* topic, const char* data, int data_len);
    
    // Helper function
    String getFormattedMacAddress();
};

#endif