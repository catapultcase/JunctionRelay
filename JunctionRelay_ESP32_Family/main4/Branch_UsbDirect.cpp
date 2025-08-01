#include "Branch_UsbDirect.h"
#include "Helper_StreamProcessor.h"
#include "Helper_DeviceInfo.h"
#include "Helper_DeviceCapabilities.h"
#include "ScreenRouter.h"
#include "DeviceConfig.h"

Branch_UsbDirect::Branch_UsbDirect()
    : initialized(false),
      screenRouter(nullptr),
      devicePtr(nullptr),
      streamProcessor(nullptr),
      deviceInfo(nullptr),
      deviceCapabilities(nullptr),
      lastResponseCheck(0)
{
    memset(usbBuffer, 0, USB_BUFFER_SIZE);
    // Serial.println("[Branch_UsbDirect] Constructor called");
}

Branch_UsbDirect::~Branch_UsbDirect() {
    if (streamProcessor) {
        delete streamProcessor;
        streamProcessor = nullptr;
    }
    
    // Clear response queue
    while (!responseQueue.empty()) {
        responseQueue.pop();
    }
    
    Serial.println("[Branch_UsbDirect] Destructor called");
}

void Branch_UsbDirect::init(ScreenRouter* router, DeviceConfig* device, 
                            Helper_DeviceInfo* devInfo, Helper_DeviceCapabilities* devCaps) {
    if (!router || !device || !devInfo || !devCaps) {
        Serial.println("[Branch_UsbDirect] ERROR: Required parameters are null");
        return;
    }

    screenRouter = router;
    devicePtr = device;
    deviceInfo = devInfo;
    deviceCapabilities = devCaps;
    
    Serial.println("[Branch_UsbDirect] Initializing USB Direct mode with 2-way communication...");
    
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
    lastResponseCheck = millis();
    
    Serial.println("[Branch_UsbDirect] ✅ USB Direct mode ready with response capability");
    Serial.println("[Branch_UsbDirect] Supported requests:");
    Serial.println("[Branch_UsbDirect]   - {\"type\":\"device_info\"}");
    Serial.println("[Branch_UsbDirect]   - {\"type\":\"device_capabilities\"}");
    Serial.println("[Branch_UsbDirect]   - {\"type\":\"stats\"}");
    Serial.println("[Branch_UsbDirect]   - {\"type\":\"preferences\"}");
    Serial.println("[Branch_UsbDirect]   - {\"type\":\"system_command\"}");
}

void Branch_UsbDirect::loop() {
    if (initialized) {
        processUsbData();
        processResponseQueue();
    }
}

void Branch_UsbDirect::initializeUsbCdc() {
    // USB CDC is already initialized in main4.ino, but we can configure it here
    Serial.setRxBufferSize(4096);  // Set large buffer for USB
    Serial.setTimeout(100);        // Set reasonable timeout for reading
    Serial.println("[Branch_UsbDirect] Native USB CDC configured for bidirectional communication");
    
    // Clear our internal buffer
    memset(usbBuffer, 0, USB_BUFFER_SIZE);
}

void Branch_UsbDirect::processUsbData() {
    if (!Serial.available() || !streamProcessor) {
        return;
    }
    
    size_t bytesRead = 0;
    
    // Read ALL available data at once
    while (Serial.available() && bytesRead < (USB_BUFFER_SIZE - 1)) {
        // Bounds check to prevent overflow
        if (bytesRead >= USB_BUFFER_SIZE) {
            Serial.printf("[Branch_UsbDirect] USB BUFFER OVERFLOW PREVENTED at index: %d\n", bytesRead);
            return;
        }
        
        uint8_t b = Serial.read();
        usbBuffer[bytesRead++] = b;
        
        // Yield occasionally for large transfers
        if (bytesRead % 100 == 0) {
            yield();
        }
    }
    
    if (bytesRead > 0) {
        // Debug: Show incoming request (but don't interfere with response)
        Serial.printf("[Branch_UsbDirect] Processing %d bytes of incoming data\n", bytesRead);
        
        // Process the complete buffer through StreamProcessor
        streamProcessor->processData(usbBuffer, bytesRead);
        
        // Clear buffer after processing
        memset(usbBuffer, 0, bytesRead);
    }
}

void Branch_UsbDirect::processResponseQueue() {
    unsigned long currentTime = millis();
    
    // Check response queue periodically
    if (currentTime - lastResponseCheck < RESPONSE_CHECK_INTERVAL) {
        return;
    }
    
    lastResponseCheck = currentTime;
    
    // Process pending responses
    while (!responseQueue.empty()) {
        ResponseData response = responseQueue.front();
        responseQueue.pop();
        
        // Send the response
        flushResponse(response.jsonData);
        
        // Debug log (after sending response to avoid interference)
        Serial.printf("[Branch_UsbDirect] Sent response for %s request (%d bytes)\n", 
                     response.requestType.c_str(), response.jsonData.length());
        
        // Small delay between responses to prevent overwhelming
        delay(10);
        
        // Only process one response per loop iteration to prevent blocking
        break;
    }
}

void Branch_UsbDirect::sendResponse(const String& jsonResponse, const String& requestType) {
    if (jsonResponse.isEmpty()) {
        sendErrorResponse("Empty response generated", requestType);
        return;
    }
    
    // Validate JSON format
    if (!isValidJson(jsonResponse)) {
        Serial.printf("[Branch_UsbDirect] WARNING: Invalid JSON response for %s\n", requestType.c_str());
        sendErrorResponse("Invalid JSON format in response", requestType);
        return;
    }
    
    // Check queue size
    if (responseQueue.size() >= MAX_RESPONSE_QUEUE_SIZE) {
        Serial.println("[Branch_UsbDirect] ERROR: Response queue full, dropping oldest response");
        responseQueue.pop(); // Remove oldest response
    }
    
    // Queue the response
    ResponseData response;
    response.jsonData = jsonResponse;
    response.timestamp = millis();
    response.requestType = requestType;
    
    responseQueue.push(response);
    
    Serial.printf("[Branch_UsbDirect] Queued response for %s (%d bytes)\n", 
                 requestType.c_str(), jsonResponse.length());
}

void Branch_UsbDirect::sendErrorResponse(const String& errorMessage, const String& requestType) {
    // Create JSON error response
    StaticJsonDocument<256> errorDoc;
    errorDoc["error"] = errorMessage;
    errorDoc["requestType"] = requestType;
    errorDoc["timestamp"] = millis();
    
    String errorJson;
    serializeJson(errorDoc, errorJson);
    
    // Queue the error response
    ResponseData response;
    response.jsonData = errorJson;
    response.timestamp = millis();
    response.requestType = requestType + "_error";
    
    responseQueue.push(response);
    
    Serial.printf("[Branch_UsbDirect] Queued error response: %s\n", errorMessage.c_str());
}

void Branch_UsbDirect::flushResponse(const String& data) {
    // Send the response data directly through Serial
    Serial.print(data);
    Serial.print("\n"); // Add newline for proper parsing
    Serial.flush();     // Ensure immediate transmission
    
    // Give time for transmission
    delay(5);
}

void Branch_UsbDirect::handleProtocolPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    Serial.printf("[Branch_UsbDirect] 📡 PROTOCOL callback received: %s\n", type ? type : "unknown");
    
    // Handle protocol-specific payloads
    if (type) {
        if (strcmp(type, "MQTT_Subscription_Request") == 0) {
            Serial.println("[Branch_UsbDirect] 📬 MQTT subscription request - would forward to MQTT manager");
            
            // Send acknowledgment response
            StaticJsonDocument<256> response;
            response["type"] = "mqtt_subscription_ack";
            response["status"] = "received";
            String responseJson;
            serializeJson(response, responseJson);
            sendResponse(responseJson, "mqtt_subscription");
            
        } else if (doc.containsKey("destination")) {
            String dest = doc["destination"].as<String>();
            Serial.printf("[Branch_UsbDirect] 🌐 Gateway forwarding to: %s - would forward via ESP-NOW\n", dest.c_str());
            
            // Send acknowledgment response
            StaticJsonDocument<256> response;
            response["type"] = "gateway_forward_ack";
            response["destination"] = dest;
            response["status"] = "queued";
            String responseJson;
            serializeJson(response, responseJson);
            sendResponse(responseJson, "gateway_forward");
            
        } else {
            Serial.printf("[Branch_UsbDirect] ❓ Unhandled protocol type: %s\n", type);
            sendErrorResponse("Unhandled protocol type: " + String(type), "protocol");
        }
    }
}

void Branch_UsbDirect::handleSystemPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    Serial.printf("[Branch_UsbDirect] ⚙️ SYSTEM callback received: %s\n", type ? type : "unknown");
    
    // Handle system-wide payloads using injected helpers
    if (type) {
        if (strcmp(type, "device_info") == 0) {
            handleDeviceInfoRequest(doc);
        }
        else if (strcmp(type, "device_capabilities") == 0) {
            handleDeviceCapabilitiesRequest(doc);
        }
        else if (strcmp(type, "stats") == 0) {
            handleStatsRequest(doc);
        }
        else if (strcmp(type, "preferences") == 0) {
            handlePreferencesRequest(doc);
        }
        else if (strcmp(type, "system_command") == 0) {
            handleSystemCommand(doc);
        }
        else {
            Serial.printf("[Branch_UsbDirect] ❓ Unhandled system type: %s\n", type);
            sendErrorResponse("Unhandled system type: " + String(type), "system");
        }
    }
}

// ==========================================
// SYSTEM HANDLERS WITH RESPONSE CAPABILITY
// ==========================================

void Branch_UsbDirect::handleDeviceInfoRequest(const JsonDocument& doc) {
    Serial.println("[Branch_UsbDirect] 📱 Processing device info request...");
    
    try {
        // Get device info JSON from helper
        String deviceInfoJSON = deviceInfo->getDeviceInfoJSON();
        
        if (deviceInfoJSON.isEmpty() || deviceInfoJSON == "{}") {
            sendErrorResponse("Device info not available", "device_info");
            return;
        }
        
        // Send the clean JSON response
        sendResponse(deviceInfoJSON, "device_info");
        
    } catch (const std::exception& e) {
        Serial.printf("[Branch_UsbDirect] Exception in device info: %s\n", e.what());
        sendErrorResponse("Exception getting device info", "device_info");
    } catch (...) {
        Serial.println("[Branch_UsbDirect] Unknown exception in device info");
        sendErrorResponse("Unknown error getting device info", "device_info");
    }
}

void Branch_UsbDirect::handleDeviceCapabilitiesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_UsbDirect] 🔧 Processing device capabilities request...");
    
    try {
        // Get device capabilities JSON from helper
        String capabilitiesJSON = deviceCapabilities->getDeviceCapabilitiesJSON();
        
        if (capabilitiesJSON.isEmpty() || capabilitiesJSON == "{}") {
            sendErrorResponse("Device capabilities not available", "device_capabilities");
            return;
        }
        
        // Send the clean JSON response
        sendResponse(capabilitiesJSON, "device_capabilities");
        
    } catch (const std::exception& e) {
        Serial.printf("[Branch_UsbDirect] Exception in device capabilities: %s\n", e.what());
        sendErrorResponse("Exception getting device capabilities", "device_capabilities");
    } catch (...) {
        Serial.println("[Branch_UsbDirect] Unknown exception in device capabilities");
        sendErrorResponse("Unknown error getting device capabilities", "device_capabilities");
    }
}

void Branch_UsbDirect::handleStatsRequest(const JsonDocument& doc) {
    Serial.println("[Branch_UsbDirect] 📊 Processing stats request...");
    
    try {
        // Create comprehensive stats response
        StaticJsonDocument<1024> statsDoc;
        
        // System stats from helper
        String lightweightStats = deviceInfo->getSystemStatsLightweightJSON();
        StaticJsonDocument<512> systemDoc;
        deserializeJson(systemDoc, lightweightStats);
        statsDoc["systemStats"] = systemDoc;
        
        // Queue status from StreamProcessor
        if (streamProcessor) {
            auto queueStatus = streamProcessor->getQueueStatus();
            JsonObject queueObj = statsDoc.createNestedObject("queueStatus");
            queueObj["sensorQueueSize"] = queueStatus.sensorQueueSize;
            queueObj["configQueueSize"] = queueStatus.configQueueSize;
            queueObj["sensorTaskRunning"] = queueStatus.sensorTaskRunning;
            queueObj["configTaskRunning"] = queueStatus.configTaskRunning;
        }
        
        // USB Direct specific stats
        JsonObject usbObj = statsDoc.createNestedObject("usbStats");
        usbObj["responseQueueSize"] = responseQueue.size();
        usbObj["maxResponseQueueSize"] = MAX_RESPONSE_QUEUE_SIZE;
        usbObj["connectionType"] = "USB_Direct";
        
        String statsJson;
        serializeJson(statsDoc, statsJson);
        sendResponse(statsJson, "stats");
        
    } catch (...) {
        sendErrorResponse("Error generating stats", "stats");
    }
}

void Branch_UsbDirect::handlePreferencesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_UsbDirect] ⚙️ Processing preferences request...");
    
    // Create response indicating USB Direct mode limitations
    StaticJsonDocument<256> response;
    response["type"] = "preferences_response";
    response["mode"] = "usb_direct";
    response["message"] = "Preferences operations require centralized system access";
    response["supported"] = false;
    
    if (doc.containsKey("action")) {
        String action = doc["action"].as<String>();
        response["requestedAction"] = action;
        Serial.printf("[Branch_UsbDirect] Preferences action requested: %s\n", action.c_str());
    }
    
    String responseJson;
    serializeJson(response, responseJson);
    sendResponse(responseJson, "preferences");
}

void Branch_UsbDirect::handleSystemCommand(const JsonDocument& doc) {
    Serial.println("[Branch_UsbDirect] 🔧 Processing system command...");
    
    if (doc.containsKey("command")) {
        String cmd = doc["command"].as<String>();
        Serial.printf("[Branch_UsbDirect] Command: %s\n", cmd.c_str());
        
        StaticJsonDocument<256> response;
        response["type"] = "system_command_response";
        response["command"] = cmd;
        
        if (cmd == "restart") {
            response["status"] = "executing";
            response["message"] = "Device will restart in 3 seconds";
            
            String responseJson;
            serializeJson(response, responseJson);
            sendResponse(responseJson, "system_command");
            
            // Give time for response to be sent
            delay(500);
            
            Serial.println("[Branch_UsbDirect] Restarting device in 3 seconds...");
            delay(3000);
            ESP.restart();
            
        } else if (cmd == "factory_reset") {
            response["status"] = "not_supported";
            response["message"] = "Factory reset requires preferences system access";
            
            String responseJson;
            serializeJson(response, responseJson);
            sendResponse(responseJson, "system_command");
            
        } else {
            response["status"] = "unknown_command";
            response["message"] = "Unknown command: " + cmd;
            
            String responseJson;
            serializeJson(response, responseJson);
            sendResponse(responseJson, "system_command");
        }
    } else {
        sendErrorResponse("No command specified", "system_command");
    }
}

// ==========================================
// UTILITY METHODS
// ==========================================

String Branch_UsbDirect::getRequestType(const JsonDocument& doc) {
    const char* type = doc["type"];
    return type ? String(type) : "unknown";
}

bool Branch_UsbDirect::isValidJson(const String& jsonString) {
    if (jsonString.isEmpty()) {
        return false;
    }
    
    StaticJsonDocument<64> testDoc;
    DeserializationError error = deserializeJson(testDoc, jsonString);
    return error == DeserializationError::Ok;
}