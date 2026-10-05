#include "Manager_MQTT.h"
#include "Helper_Preferences.h"

// Initialize static member for callback routing
Manager_MQTT* Manager_MQTT::instance = nullptr;

// This is the event handler signature for the MQTT client
static void mqtt_event_handler(void* handler_args, esp_event_base_t base, int32_t event_id, void* event_data) {
    // Cast the event data to esp_mqtt_event_t
    esp_mqtt_event_t* event = (esp_mqtt_event_t*)event_data;
    
    // Forward to the instance method
    if (Manager_MQTT::instance != nullptr) {
        Manager_MQTT::instance->handleMqttEvent(event);
    }
}

// Factory method to create from preferences
Manager_MQTT* Manager_MQTT::createFromPreferences(Helper_Preferences* prefs) {
    if (!prefs) {
        Serial.println("[MQTT] ERROR: Preferences helper is null");
        return nullptr;
    }
    
    // Check if MQTT is enabled
    if (!prefs->getMQTTEnabled()) {
        Serial.println("[MQTT] MQTT disabled in preferences");
        return nullptr;
    }
    
    // Get MQTT settings
    String broker = prefs->getMQTTBroker();
    String username = prefs->getMQTTUsername();
    String password = prefs->getMQTTPassword();
    
    if (broker.isEmpty()) {
        Serial.println("[MQTT] No MQTT broker configured");
        return nullptr;
    }
    
    // Parse broker (host:port format)
    String host;
    uint16_t port = 1883;
    
    int colonPos = broker.indexOf(':');
    if (colonPos >= 0) {
        host = broker.substring(0, colonPos);
        String portStr = broker.substring(colonPos + 1);
        portStr.trim();
        
        if (portStr.length() > 0) {
            int parsedPort = portStr.toInt();
            if (parsedPort > 0 && parsedPort <= 65535) {
                port = parsedPort;
            }
        }
    } else {
        host = broker;
    }
    
    host.trim();
    
    if (host.isEmpty()) {
        Serial.println("[MQTT] Invalid broker configuration");
        return nullptr;
    }
    
    Serial.printf("[MQTT] Creating MQTT manager: %s:%d\n", host.c_str(), port);
    if (!username.isEmpty()) {
        Serial.printf("[MQTT] Using authentication for user: %s\n", username.c_str());
    }
    
    return new Manager_MQTT(host.c_str(), port, username.c_str(), password.c_str());
}

// Constructor initializes ESP MQTT client, server and port
Manager_MQTT::Manager_MQTT(const char* server, uint16_t port, const char* username, const char* password)
    : mqttPort(port), mqttUsername(username), mqttPassword(password), isConnected(false) {
    
    // Store instance pointer for static callback
    instance = this;
    
    // Copy server address to fixed buffer with safety check
    strncpy(mqttServer, server, sizeof(mqttServer) - 1);
    mqttServer[sizeof(mqttServer) - 1] = '\0';  // Ensure null termination
    
    Serial.printf("[DEBUG] MQTT constructor received server='%s', port=%d\n", mqttServer, port);

    // Create a URL for the MQTT broker
    char mqtt_url[128];
    snprintf(mqtt_url, sizeof(mqtt_url), "mqtt://%s:%d", mqttServer, mqttPort);
    
    // Generate client ID from MAC address
    String macStr = getFormattedMacAddress();
    macStr.replace(":", "");
    String clientId = "ESP32_" + macStr;
    
    // Configure MQTT client
    esp_mqtt_client_config_t mqtt_cfg = {};
    mqtt_cfg.uri = mqtt_url;
    mqtt_cfg.client_id = clientId.c_str();
    mqtt_cfg.buffer_size = 4096;       // Buffer for messages
    mqtt_cfg.keepalive = 15;           // 15 seconds keepalive
    
    // Set credentials if provided
    if (!mqttUsername.isEmpty()) {
        mqtt_cfg.username = mqttUsername.c_str();
        mqtt_cfg.password = mqttPassword.c_str();
    }
    
    // Create MQTT client
    mqttClient = esp_mqtt_client_init(&mqtt_cfg);
    
    // Register event handler using the new API
    esp_mqtt_client_register_event(mqttClient, MQTT_EVENT_ANY, mqtt_event_handler, NULL);
}

// Destructor
Manager_MQTT::~Manager_MQTT() {
    if (mqttClient) {
        esp_mqtt_client_stop(mqttClient);
        esp_mqtt_client_destroy(mqttClient);
    }
    // Clear static instance pointer
    if (instance == this) {
        instance = nullptr;
    }
}

// Non-static event handler method
void Manager_MQTT::handleMqttEvent(esp_mqtt_event_t* event) {
    switch (event->event_id) {
        case MQTT_EVENT_CONNECTED:
            isConnected = true;
            Serial.println("MQTT client connected");
            // Resubscribe to topics when reconnecting
            resubscribeToTopics();
            break;
            
        case MQTT_EVENT_DISCONNECTED:
            isConnected = false;
            Serial.println("MQTT client disconnected");
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

// Connect to MQTT broker and start client
void Manager_MQTT::begin() {
    // First test if we can reach the broker with a TCP connection
    if (!testTcpConnection()) {
        Serial.println("[MQTT] Skipping MQTT connection attempt since TCP test failed");
        return;
    }
    
    // Start the MQTT client
    esp_mqtt_client_start(mqttClient);
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
        int msg_id = esp_mqtt_client_subscribe(mqttClient, topic.c_str(), 1); // QoS 1 for better flow control
        Serial.printf("Resubscribed to topic: %s, msg_id=%d\n", topic.c_str(), msg_id);
    }
}

// Subscribe to a specific MQTT topic
void Manager_MQTT::subscribe(const char* topic) {
    if (isConnected) {
        // Store the topic so we can resubscribe if connection drops
        storeSubscribedTopic(topic);
        
        // Subscribe now with QoS 1 for better flow control
        int msg_id = esp_mqtt_client_subscribe(mqttClient, topic, 1); // QoS 1 instead of QoS 0
        Serial.printf("Subscribed to topic: %s, msg_id=%d\n", topic, msg_id);
    } else {
        Serial.println("MQTT not connected. Can't subscribe, but stored for later.");
        storeSubscribedTopic(topic);
    }
}

// Publish a message to a specified MQTT topic
void Manager_MQTT::publish(const char* topic, const String& message) {
    if (isConnected) {
        int msg_id = esp_mqtt_client_publish(mqttClient, topic, message.c_str(), 
                                           message.length(), 1, 0); // QoS 1, not retained for guaranteed delivery
        // Debug publishing process
        Serial.printf("Published to topic: %s, msg_id=%d, QoS=1\n", topic, msg_id);
    } else {
        Serial.println("MQTT client not connected. Can't publish.");
    }
}

// Process incoming message
void Manager_MQTT::processIncomingMessage(const char* topic, const char* data, int data_len) {
    if (data_len == 0) return;
    
    // For now, just print the received message
    Serial.printf("[MQTT] Received message on topic '%s': %.*s\n", topic, data_len, data);
}

// Check if MQTT is connected
bool Manager_MQTT::connected() {
    return isConnected;
}

// Helper function to get formatted MAC address
String Manager_MQTT::getFormattedMacAddress() {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    
    return String(macStr);
}