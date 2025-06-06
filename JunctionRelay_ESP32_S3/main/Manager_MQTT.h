#ifndef MANAGER_MQTT_H
#define MANAGER_MQTT_H

#include <WiFi.h>
#include <mqtt_client.h>
#include <ArduinoJson.h>
#include <vector>

// Define maximum payload size for MQTT messages
#define MQTT_MAX_PAYLOAD_SIZE 8192

// Forward declaration of ConnectionManager
class ConnectionManager;

class Manager_MQTT {
public:
    Manager_MQTT(const char* server, uint16_t port, ConnectionManager* connMgr);
    ~Manager_MQTT();
    
    void begin();                             // Initialize MQTT
    void subscribe(const char* topic);        // Subscribe to MQTT topics
    void publish(const char* topic, const String& message); // Publish a message
    bool connected();
    bool testTcpConnection();                 // Test TCP connection to broker

    // No loop() needed for ESP32 MQTT client - it's event-driven
    
    // Static instance pointer for the callback
    static Manager_MQTT* instance;
    
    // Non-static event handler methods
    void handleSubMqttEvent(esp_mqtt_event_t* event);
    void handlePubMqttEvent(esp_mqtt_event_t* event);

private:
    esp_mqtt_client_handle_t mqttSubClient;  // ESP32 MQTT client for subscriptions
    esp_mqtt_client_handle_t mqttPubClient;  // ESP32 MQTT client for publishing
    char mqttServer[64];                     // Fixed buffer for MQTT Broker address
    uint16_t mqttPort;                       // MQTT Broker port
    ConnectionManager* connMgr;              // ConnectionManager reference
    bool isSubConnected;                     // Subscribe client connection state
    bool isPubConnected;                     // Publish client connection state
    
    std::vector<String> subscribedTopics;    // Store topics to resubscribe after reconnection
    
    // Store topics for reconnection
    void storeSubscribedTopic(const char* topic);
    
    // Resubscribe to all topics after reconnection
    void resubscribeToTopics();
    
    // Process received data
    void processIncomingMessage(const char* topic, const char* data, int data_len);
};

#endif