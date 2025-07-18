#include "Branch_UsbDirect.h"
#include "Helper_StreamProcessor.h"
#include "ScreenRouter.h"
#include "DeviceConfig.h"

Branch_UsbDirect::Branch_UsbDirect()
    : initialized(false),
      screenRouter(nullptr),
      devicePtr(nullptr),
      streamProcessor(nullptr)
{
    memset(usbBuffer, 0, USB_BUFFER_SIZE);
    Serial.println("[Branch_UsbDirect] Constructor called");
}

Branch_UsbDirect::~Branch_UsbDirect() {
    if (streamProcessor) {
        delete streamProcessor;
        streamProcessor = nullptr;
    }
    Serial.println("[Branch_UsbDirect] Destructor called");
}

void Branch_UsbDirect::init(ScreenRouter* router, DeviceConfig* device) {
    if (!router || !device) {
        Serial.println("[Branch_UsbDirect] ERROR: ScreenRouter or Device is null");
        return;
    }

    screenRouter = router;
    devicePtr = device;
    
    Serial.println("[Branch_UsbDirect] Initializing USB Direct mode...");
    
    // Initialize USB CDC
    initializeUsbCdc();
    
    // Create StreamProcessor with device pointer for screen setup
    streamProcessor = new Helper_StreamProcessor(
        screenRouter,
        [this](const JsonDocument& doc) { this->handleProtocolPayload(doc); },
        [this](const JsonDocument& doc) { this->handleSystemPayload(doc); },
        devicePtr
    );
    
    initialized = true;
    
    Serial.println("[Branch_UsbDirect] ✅ USB Direct mode ready");
    Serial.println("[Branch_UsbDirect] You can now paste JSON payloads into Serial Monitor for testing");
    Serial.println("[Branch_UsbDirect] Example: {\"type\":\"config\",\"screenId\":\"0x3C\",\"quad\":{\"text\":\"Hello\"}}");
}

void Branch_UsbDirect::loop() {
    if (initialized) {
        processUsbData();
    }
}

void Branch_UsbDirect::initializeUsbCdc() {
    // USB CDC is already initialized in main4.ino, but we can configure it here
    Serial.setRxBufferSize(4096);  // Set large buffer for USB (match old ConnectionManager)
    Serial.println("[Branch_UsbDirect] Native USB CDC configured for data processing");
    
    // Clear our internal buffer
    memset(usbBuffer, 0, USB_BUFFER_SIZE);
}

void Branch_UsbDirect::processUsbData() {
    if (!Serial.available() || !streamProcessor) {
        return;
    }
    
    size_t bytesRead = 0;
    
    // Read ALL available data at once (like old ConnectionManager)
    while (Serial.available() && bytesRead < (USB_BUFFER_SIZE - 1)) {
        // Bounds check to prevent overflow
        if (bytesRead >= USB_BUFFER_SIZE) {
            Serial.printf("[Branch_UsbDirect] USB BUFFER OVERFLOW PREVENTED at index: %d\n", bytesRead);
            return;
        }
        
        uint8_t b = Serial.read();
        usbBuffer[bytesRead++] = b;
        
        // Progress debug for large payloads
        if (bytesRead % 200 == 0 && bytesRead > 0) {
            Serial.printf("[Branch_UsbDirect] USB READING: %d bytes...\n", bytesRead);
        }
        
        // Yield occasionally for large transfers
        if (bytesRead % 100 == 0) {
            yield();
        }
    }
    
    if (bytesRead > 0) {
        Serial.printf("[Branch_UsbDirect] Read %d bytes via Native USB CDC\n", bytesRead);
        
        // Process the complete buffer through StreamProcessor (like old code)
        streamProcessor->processData(usbBuffer, bytesRead);
        
        // Clear buffer after processing
        memset(usbBuffer, 0, bytesRead);
    }
}

void Branch_UsbDirect::handleProtocolPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    Serial.printf("[Branch_UsbDirect] 📡 PROTOCOL callback received: %s\n", type ? type : "unknown");
    
    // Handle protocol-specific payloads
    if (type) {
        if (strcmp(type, "MQTT_Subscription_Request") == 0) {
            Serial.println("[Branch_UsbDirect] 📬 MQTT subscription request - would forward to MQTT manager");
            
            if (doc.containsKey("subscriptions") && doc["subscriptions"].is<JsonArray>()) {
                JsonArrayConst subs = doc["subscriptions"];
                Serial.printf("[Branch_UsbDirect] Topics to subscribe: ");
                for (JsonVariantConst topic : subs) {
                    Serial.printf("%s ", topic.as<const char*>());
                }
                Serial.println();
            }
        }
        else if (doc.containsKey("destination")) {
            String dest = doc["destination"].as<String>();
            Serial.printf("[Branch_UsbDirect] 🌐 Gateway forwarding to: %s - would forward via ESP-NOW\n", dest.c_str());
        }
        
        // Not expected over this branch, but keeping in case becomes relevant - should be handled by catch all
        
        // else if (strcmp(type, "websocket_ping") == 0) {
        //     Serial.println("[Branch_UsbDirect] 🏓 WebSocket ping - would respond with pong");
        // }
        // else if (strcmp(type, "http_request") == 0) {
        //     Serial.println("[Branch_UsbDirect] 🌍 HTTP request - would handle via HTTP helper");
        // }
        else {
            Serial.printf("[Branch_UsbDirect] ❓ Unhandled protocol type: %s\n", type);
        }
    }
}

void Branch_UsbDirect::handleSystemPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    Serial.printf("[Branch_UsbDirect] ⚙️ SYSTEM callback received: %s\n", type ? type : "unknown");
    
    // Handle system-wide payloads
    if (type) {
        if (strcmp(type, "stats") == 0) {
            Serial.println("[Branch_UsbDirect] 📊 Stats request received");
            
            // Show queue status from StreamProcessor
            if (streamProcessor) {
                auto queueStatus = streamProcessor->getQueueStatus();
                Serial.printf("[Branch_UsbDirect] Queue Status:\n");
                Serial.printf("  - Sensor Queue: %d/%d items\n", queueStatus.sensorQueueSize, 30);
                Serial.printf("  - Config Queue: %d/%d items\n", queueStatus.configQueueSize, 3);
                Serial.printf("  - Sensor Task: %s\n", queueStatus.sensorTaskRunning ? "Running" : "Stopped");
                Serial.printf("  - Config Task: %s\n", queueStatus.configTaskRunning ? "Running" : "Stopped");
            }
            
            // Show memory stats
            Serial.printf("[Branch_UsbDirect] Memory Stats:\n");
            Serial.printf("  - Free Heap: %d bytes\n", ESP.getFreeHeap());
            Serial.printf("  - Min Free Heap: %d bytes\n", ESP.getMinFreeHeap());
            Serial.printf("  - Heap Size: %d bytes\n", ESP.getHeapSize());
        }
        else if (strcmp(type, "preferences") == 0) {
            Serial.println("[Branch_UsbDirect] ⚙️ Preferences request - would handle read/write operations");
            
            if (doc.containsKey("action")) {
                String action = doc["action"].as<String>();
                Serial.printf("[Branch_UsbDirect] Preferences action: %s\n", action.c_str());
            }
        }
        else if (strcmp(type, "device_info") == 0) {
            Serial.println("[Branch_UsbDirect] 📱 Device info request - would return capabilities");
            Serial.printf("[Branch_UsbDirect] Device: %s, Connection Mode: USB Direct\n", devicePtr->getName());
        }
        else if (strcmp(type, "system_command") == 0) {
            Serial.println("[Branch_UsbDirect] 🔧 System command - would execute system operation");
            
            if (doc.containsKey("command")) {
                String cmd = doc["command"].as<String>();
                Serial.printf("[Branch_UsbDirect] Command: %s\n", cmd.c_str());
                
                if (cmd == "restart") {
                    Serial.println("[Branch_UsbDirect] Would restart device...");
                } else if (cmd == "factory_reset") {
                    Serial.println("[Branch_UsbDirect] Would factory reset...");
                }
            }
        }
        else {
            Serial.printf("[Branch_UsbDirect] ❓ Unhandled system type: %s\n", type);
        }
    }
}