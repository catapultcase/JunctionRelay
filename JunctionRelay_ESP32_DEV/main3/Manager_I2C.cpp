#include "Manager_I2C.h"
#include "ConnectionManager.h"
#include "Manager_MQTT.h"
#include <ArduinoJson.h>

// Initialize static instance
Manager_I2C* Manager_I2C::instance = nullptr;

Manager_I2C* Manager_I2C::getInstance(ConnectionManager* connMgr, TwoWire* wireInterface) {
    if (instance == nullptr) {
        if (connMgr == nullptr || wireInterface == nullptr) {
            Serial.println("[ERROR][Manager_I2C] ConnectionManager and Wire interface required for first initialization");
            return nullptr;
        }
        instance = new Manager_I2C(connMgr, wireInterface);
    }
    return instance;
}

Manager_I2C::Manager_I2C(ConnectionManager* connMgr, TwoWire* wireInterface) 
    : connMgr(connMgr), wire(wireInterface), encoder_position(0), initialized(false), taskHandle(NULL), ss(wireInterface) {
    Serial.printf("[DEBUG][Manager_I2C] Created with Wire interface at %p\n", wireInterface);
}

void Manager_I2C::begin() {
    if (initialized) {
        Serial.println("[DEBUG][Manager_I2C] Already initialized, skipping");
        return;
    }
    
    Serial.println("[DEBUG][Manager_I2C] Initializing Seesaw encoder...");
    
    // Initialize the seesaw with the I2C address
    if (!ss.begin(0x36)) {
        Serial.println("[ERROR][Manager_I2C] Couldn't find seesaw on I2C address 0x36");
        return;
    }
    
    uint32_t version = ((ss.getVersion() >> 16) & 0xFFFF);
    if (version != 4991) {
        Serial.println("[ERROR][Manager_I2C] Wrong firmware loaded?");
        return;
    }
    
    Serial.println("[DEBUG][Manager_I2C] Found Product 4991 (Encoder)");
    
    // Get starting position
    encoder_position = ss.getEncoderPosition();
    
    // Turn on the encoder
    ss.pinMode(24, INPUT_PULLUP);
    ss.setGPIOInterrupts((uint32_t)1 << 24, 1);
    ss.enableEncoderInterrupt();
    
    initialized = true;
    
    // Create task for processing I2C events
    xTaskCreatePinnedToCore(
        [](void* param) {
            Manager_I2C* manager = static_cast<Manager_I2C*>(param);
            Serial.printf("[Manager_I2C Task] Started on core %d\n", xPortGetCoreID());
            
            while (true) {
                manager->runLoop();
                vTaskDelay(pdMS_TO_TICKS(50)); // Check every 50ms
            }
        },
        "Manager_I2C_Task",
        4096,
        this,
        1,
        &taskHandle,
        1 // Run on Core 1
    );
    
    Serial.println("[DEBUG][Manager_I2C] Seesaw encoder initialized successfully");
}

void Manager_I2C::runLoop() {
    if (!initialized) return;
    
    // Read encoder position
    int32_t new_position = ss.getEncoderPosition();
    if (encoder_position != new_position) {
        Serial.printf("[DEBUG][Manager_I2C] Encoder position: %d\n", new_position);
        
        // Send encoder update via MQTT
        if (connMgr && connMgr->getMqttManager() && connMgr->getMqttManager()->connected()) {
            StaticJsonDocument<128> doc;
            doc["encoder"] = new_position;
            doc["delta"] = new_position - encoder_position;
            
            String payload;
            serializeJson(doc, payload);
            
            // Determine device prefix based on Wire interface
            String topic;
            if (wire == &Wire1) {
                topic = "JunctionRelay/qtpy/encoder";
            } else {
                topic = "JunctionRelay/feather/encoder";
            }
            
            connMgr->getMqttManager()->publish(topic.c_str(), payload.c_str());
        }
        
        encoder_position = new_position;
    }
    
    // Read button state
    if (!ss.digitalRead(24)) {
        Serial.println("[DEBUG][Manager_I2C] Button pressed!");
        
        // Send button press via MQTT
        if (connMgr && connMgr->getMqttManager() && connMgr->getMqttManager()->connected()) {
            StaticJsonDocument<64> doc;
            doc["button"] = "pressed";
            
            String payload;
            serializeJson(doc, payload);
            
            // Determine device prefix based on Wire interface
            String topic;
            if (wire == &Wire1) {
                topic = "JunctionRelay/qtpy/button";
            } else {
                topic = "JunctionRelay/feather/button";
            }
            
            connMgr->getMqttManager()->publish(topic.c_str(), payload.c_str());
        }
        
        // Simple debounce
        vTaskDelay(pdMS_TO_TICKS(200));
    }
}