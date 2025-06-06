#include "Manager_MQTT.h"
#include "ConnectionManager.h" 
#include "Utils.h"

// Initialize static member for callback routing
Manager_MQTT* Manager_MQTT::instance = nullptr;

// This is the updated event handler signature for the subscription client
static void mqtt_sub_event_handler(void* handler_args, esp_event_base_t base, int32_t event_id, void* event_data) {
    // Cast the event data to esp_mqtt_event_t
    esp_mqtt_event_t* event = (esp_mqtt_event_t*)event_data;
    
    // Forward to the instance method
    if (Manager_MQTT::instance != nullptr) {
        Manager_MQTT::instance->handleSubMqttEvent(event);
    }
}

// This is the updated event handler signature for the publishing client
static void mqtt_pub_event_handler(void* handler_args, esp_event_base_t base, int32_t event_id, void* event_data) {
    // Cast the event data to esp_mqtt_event_t
    esp_mqtt_event_t* event = (esp_mqtt_event_t*)event_data;
    
    // Forward to the instance method
    if (Manager_MQTT::instance != nullptr) {
        Manager_MQTT::instance->handlePubMqttEvent(event);
    }
}

// Constructor initializes ESP MQTT clients, server and port
Manager_MQTT::Manager_MQTT(const char* server, uint16_t port, ConnectionManager* connMgr)
    : mqttPort(port), connMgr(connMgr), isSubConnected(false), isPubConnected(false) {
    
    // Store instance pointer for static callback
    instance = this;
    
    // Copy server address to fixed buffer with safety check
    strncpy(mqttServer, server, sizeof(mqttServer) - 1);
    mqttServer[sizeof(mqttServer) - 1] = '\0';  // Ensure null termination
    
    Serial.printf("[DEBUG] MQTT constructor received server='%s', port=%d\n", mqttServer, port);

    // Create a URL for the MQTT broker
    char mqtt_url[128];
    snprintf(mqtt_url, sizeof(mqtt_url), "mqtt://%s:%d", mqttServer, mqttPort);
    
    // Generate client IDs from MAC address
    String macStr = getFormattedMacAddress();
    macStr.replace(":", "");
    String subClientId = "ESP32Sub_" + macStr;
    String pubClientId = "ESP32Pub_" + macStr;
    
    // Configure subscription MQTT client
    esp_mqtt_client_config_t sub_mqtt_cfg = {};
    sub_mqtt_cfg.uri = mqtt_url;
    sub_mqtt_cfg.client_id = subClientId.c_str();
    sub_mqtt_cfg.buffer_size = 4096;       // Larger buffer for better subscription performance
    sub_mqtt_cfg.keepalive = 15;           // 15 seconds keepalive
    
    // Configure publishing MQTT client
    esp_mqtt_client_config_t pub_mqtt_cfg = {};
    pub_mqtt_cfg.uri = mqtt_url;
    pub_mqtt_cfg.client_id = pubClientId.c_str();
    pub_mqtt_cfg.buffer_size = 2048;       // Buffer for publishing
    pub_mqtt_cfg.keepalive = 15;           // 15 seconds keepalive
    
    // Create MQTT clients
    mqttSubClient = esp_mqtt_client_init(&sub_mqtt_cfg);
    mqttPubClient = esp_mqtt_client_init(&pub_mqtt_cfg);
    
    // Register event handlers using the new API
    esp_mqtt_client_register_event(mqttSubClient, MQTT_EVENT_ANY, mqtt_sub_event_handler, NULL);
    esp_mqtt_client_register_event(mqttPubClient, MQTT_EVENT_ANY, mqtt_pub_event_handler, NULL);
}

// Destructor
Manager_MQTT::~Manager_MQTT() {
    if (mqttSubClient) {
        esp_mqtt_client_stop(mqttSubClient);
        esp_mqtt_client_destroy(mqttSubClient);
    }
    if (mqttPubClient) {
        esp_mqtt_client_stop(mqttPubClient);
        esp_mqtt_client_destroy(mqttPubClient);
    }
    // Clear static instance pointer
    if (instance == this) {
        instance = nullptr;
    }
}

// Non-static event handler method for subscription client
void Manager_MQTT::handleSubMqttEvent(esp_mqtt_event_t* event) {
    switch (event->event_id) {
        case MQTT_EVENT_CONNECTED:
            isSubConnected = true;
            Serial.println("MQTT Subscribe client connected");
            // Resubscribe to topics when reconnecting
            resubscribeToTopics();
            break;
            
        case MQTT_EVENT_DISCONNECTED:
            isSubConnected = false;
            Serial.println("MQTT Subscribe client disconnected");
            break;
            
        case MQTT_EVENT_DATA:
            // Process incoming message
            processIncomingMessage(
                event->topic, 
                event->data, 
                event->data_len
            );
            break;
            
        default:
            break;
    }
}

// Non-static event handler method for publishing client
void Manager_MQTT::handlePubMqttEvent(esp_mqtt_event_t* event) {
    switch (event->event_id) {
        case MQTT_EVENT_CONNECTED:
            isPubConnected = true;
            Serial.println("MQTT Publish client connected");
            break;
            
        case MQTT_EVENT_DISCONNECTED:
            isPubConnected = false;
            Serial.println("MQTT Publish client disconnected");
            break;
            
        default:
            break;
    }
}

// Test if TCP connection to broker is possible
bool Manager_MQTT::testTcpConnection() {
    Serial.printf("[DEBUG] Testing TCP to %s:%d...", mqttServer, mqttPort);
    
    WiFiClient testClient;
    if (!testClient.connect(mqttServer, mqttPort)) {
        Serial.println(" failed!");
        testClient.stop();
        return false;
    }
    
    Serial.println(" success!");
    testClient.stop();
    return true;
}

// Connect to MQTT broker and start clients
void Manager_MQTT::begin() {
    // First test if we can reach the broker with a TCP connection
    if (!testTcpConnection()) {
        Serial.println("[MQTT] Skipping MQTT connection attempt since TCP test failed");
        return;
    }
    
    // Start the MQTT clients
    esp_mqtt_client_start(mqttSubClient);
    esp_mqtt_client_start(mqttPubClient);
}

// Store topics for reconnection
void Manager_MQTT::storeSubscribedTopic(const char* topic) {
    // Check if we already have this topic
    for (const auto& existingTopic : subscribedTopics) {
        if (existingTopic == topic) {
            return; // Already subscribed, no need to add again
        }
    }
    
    // Add to our list of topics
    subscribedTopics.push_back(String(topic));
}

// Resubscribe to all stored topics (called after reconnection)
void Manager_MQTT::resubscribeToTopics() {
    for (const auto& topic : subscribedTopics) {
        int msg_id = esp_mqtt_client_subscribe(mqttSubClient, topic.c_str(), 1); // QoS 1 for better flow control
        Serial.printf("Resubscribed to topic: %s, msg_id=%d\n", topic.c_str(), msg_id);
    }
}

// Subscribe to a specific MQTT topic
void Manager_MQTT::subscribe(const char* topic) {
    if (isSubConnected) {
        // Store the topic so we can resubscribe if connection drops
        storeSubscribedTopic(topic);
        
        // Subscribe now with QoS 1 for better flow control
        int msg_id = esp_mqtt_client_subscribe(mqttSubClient, topic, 1); // QoS 1 instead of QoS 0
        Serial.printf("Subscribed to topic: %s, msg_id=%d\n", topic, msg_id);
    } else {
        Serial.println("MQTT not connected. Can't subscribe, but stored for later.");
        storeSubscribedTopic(topic);
    }
}

// Publish a message to a specified MQTT topic
void Manager_MQTT::publish(const char* topic, const String& message) {
    if (isPubConnected) {
        int msg_id = esp_mqtt_client_publish(mqttPubClient, topic, message.c_str(), 
                                           message.length(), 1, 0); // QoS 1, not retained for guaranteed delivery
        // Debug publishing process
        // Serial.printf("Published to topic: %s, msg_id=%d, QoS=1\n", topic, msg_id);
    } else {
        Serial.println("MQTT Publish client not connected. Can't publish.");
    }
}

// Process incoming message
void Manager_MQTT::processIncomingMessage(const char* topic, const char* data, int data_len) {
    if (data_len == 0 || connMgr == nullptr) return;
    
    // Use a static buffer to avoid heap allocations for each message
    static uint8_t staticBuffer[MQTT_MAX_PAYLOAD_SIZE];
    
    // Copy data to static buffer (safer than using the data pointer directly)
    if (data_len < MQTT_MAX_PAYLOAD_SIZE) {
        memcpy(staticBuffer, data, data_len);
        
        // Forward the message using our static buffer
        connMgr->handleIncomingDataChunkPrefix(staticBuffer, data_len);
    } else {
        Serial.printf("[MQTT] Message too large: %d bytes\n", data_len);
    }
}

// Check if MQTT is connected
bool Manager_MQTT::connected() {
    return isSubConnected && isPubConnected;
}