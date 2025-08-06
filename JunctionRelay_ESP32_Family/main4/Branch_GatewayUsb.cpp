#include "Branch_GatewayUsb.h"
#include "Helper_StreamProcessor.h"
#include "Helper_DeviceInfo.h"
#include "Helper_DeviceCapabilities.h"
#include "Helper_ESPNOW.h"
#include "Manager_ScreenRouter.h"
#include "DeviceConfig.h"

Branch_GatewayUsb::Branch_GatewayUsb()
    : initialized(false),
      screenRouter(nullptr),
      devicePtr(nullptr),
      streamProcessor(nullptr),
      espnowHelper(nullptr),
      deviceInfo(nullptr),
      deviceCapabilities(nullptr),
      lastResponseCheck(0)
{
    memset(usbBuffer, 0, USB_BUFFER_SIZE);
    // Serial.println("[Branch_GatewayUsb] Constructor called");
}

Branch_GatewayUsb::~Branch_GatewayUsb() {
    if (streamProcessor) {
        delete streamProcessor;
        streamProcessor = nullptr;
    }
    
    if (espnowHelper) {
        delete espnowHelper;
        espnowHelper = nullptr;
    }
    
    // Clear response queue
    while (!responseQueue.empty()) {
        responseQueue.pop();
    }
    
    Serial.println("[Branch_GatewayUsb] Destructor called");
}

void Branch_GatewayUsb::init(ScreenRouter* router, DeviceConfig* device, 
                             Helper_DeviceInfo* devInfo, Helper_DeviceCapabilities* devCaps) {
    if (!router || !device || !devInfo || !devCaps) {
        Serial.println("[Branch_GatewayUsb] ERROR: Required parameters are null");
        return;
    }

    screenRouter = router;
    devicePtr = device;
    deviceInfo = devInfo;
    deviceCapabilities = devCaps;
    
    Serial.println("[Branch_GatewayUsb] Initializing Gateway USB mode with ESP-NOW forwarding...");
    
    // Initialize USB CDC
    initializeUsbCdc();
    
    // Create StreamProcessor with device pointer for screen setup
    streamProcessor = new Helper_StreamProcessor(
        screenRouter,
        [this](const JsonDocument& doc) { this->handleProtocolPayload(doc); },
        [this](const JsonDocument& doc) { this->handleSystemPayload(doc); },
        devicePtr
    );
    
    // Initialize ESP-NOW for forwarding
    initializeESPNow();
    
    initialized = true;
    lastResponseCheck = millis();
    
    Serial.println("[Branch_GatewayUsb] ✅ Gateway USB mode ready with ESP-NOW forwarding");
    Serial.println("[Branch_GatewayUsb] Gateway capabilities:");
    Serial.println("[Branch_GatewayUsb]   - USB CDC for host communication");
    Serial.println("[Branch_GatewayUsb]   - ESP-NOW for peer forwarding");
    Serial.println("[Branch_GatewayUsb]   - Automatic peer discovery");
    Serial.println("[Branch_GatewayUsb]   - Bidirectional message routing");
    Serial.println("[Branch_GatewayUsb] Supported requests:");
    Serial.println("[Branch_GatewayUsb]   - {\"type\":\"device_info\"}");
    Serial.println("[Branch_GatewayUsb]   - {\"type\":\"device_capabilities\"}");
    Serial.println("[Branch_GatewayUsb]   - {\"type\":\"stats\"}");
    Serial.println("[Branch_GatewayUsb]   - {\"type\":\"gateway_status\"}");
    Serial.println("[Branch_GatewayUsb]   - Messages with \"destination\" field");
}

void Branch_GatewayUsb::loop() {
    if (initialized) {
        processUsbData();
        processResponseQueue();
    }
}

// ==========================================
// USB CDC METHODS (copied from Branch_UsbDirect)
// ==========================================

void Branch_GatewayUsb::initializeUsbCdc() {
    // USB CDC is already initialized in main4.ino, but we can configure it here
    Serial.setRxBufferSize(4096);  // Set large buffer for USB
    Serial.setTimeout(100);        // Set reasonable timeout for reading
    Serial.println("[Branch_GatewayUsb] Native USB CDC configured for gateway communication");
    
    // Clear our internal buffer
    memset(usbBuffer, 0, USB_BUFFER_SIZE);
}

void Branch_GatewayUsb::processUsbData() {
    if (!Serial.available() || !streamProcessor) {
        return;
    }
    
    size_t bytesRead = 0;
    
    // Read ALL available data at once
    while (Serial.available() && bytesRead < (USB_BUFFER_SIZE - 1)) {
        // Bounds check to prevent overflow
        if (bytesRead >= USB_BUFFER_SIZE) {
            Serial.printf("[Branch_GatewayUsb] USB BUFFER OVERFLOW PREVENTED at index: %d\n", bytesRead);
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
        // Debug: Show incoming request
        // Serial.printf("[Branch_GatewayUsb] Processing %d bytes of incoming data\n", bytesRead);
        
        // Process the complete buffer through StreamProcessor
        streamProcessor->processData(usbBuffer, bytesRead);
        
        // Clear buffer after processing
        memset(usbBuffer, 0, bytesRead);
    }
}

void Branch_GatewayUsb::processResponseQueue() {
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
        // Serial.printf("[Branch_GatewayUsb] Sent response for %s request (%d bytes)\n", 
        //              response.requestType.c_str(), response.jsonData.length());
        
        // Small delay between responses to prevent overwhelming
        delay(10);
        
        // Only process one response per loop iteration to prevent blocking
        break;
    }
}

void Branch_GatewayUsb::sendResponse(const String& jsonResponse, const String& requestType) {
    if (jsonResponse.isEmpty()) {
        sendErrorResponse("Empty response generated", requestType);
        return;
    }
    
    // Validate JSON format
    if (!isValidJson(jsonResponse)) {
        Serial.printf("[Branch_GatewayUsb] WARNING: Invalid JSON response for %s\n", requestType.c_str());
        sendErrorResponse("Invalid JSON format in response", requestType);
        return;
    }
    
    // Check queue size
    if (responseQueue.size() >= MAX_RESPONSE_QUEUE_SIZE) {
        Serial.println("[Branch_GatewayUsb] ERROR: Response queue full, dropping oldest response");
        responseQueue.pop(); // Remove oldest response
    }
    
    // Queue the response
    ResponseData response;
    response.jsonData = jsonResponse;
    response.timestamp = millis();
    response.requestType = requestType;
    
    responseQueue.push(response);
    
    // Serial.printf("[Branch_GatewayUsb] Queued response for %s (%d bytes)\n", 
    //              requestType.c_str(), jsonResponse.length());
}

void Branch_GatewayUsb::sendErrorResponse(const String& errorMessage, const String& requestType) {
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
    
    Serial.printf("[Branch_GatewayUsb] Queued error response: %s\n", errorMessage.c_str());
}

void Branch_GatewayUsb::flushResponse(const String& data) {
    // Send the response data directly through Serial
    Serial.print(data);
    Serial.print("\n"); // Add newline for proper parsing
    Serial.flush();     // Ensure immediate transmission
    
    // Give time for transmission
    delay(5);
}

// ==========================================
// ESP-NOW INITIALIZATION AND MANAGEMENT
// ==========================================

void Branch_GatewayUsb::initializeESPNow() {
    // Create ESP-NOW helper with StreamProcessor for incoming data
    espnowHelper = new Helper_ESPNOW(streamProcessor);
    
    if (espnowHelper->begin()) {
        Serial.printf("[Branch_GatewayUsb] ✅ ESP-NOW initialized for gateway. Local MAC: %s\n", 
                     espnowHelper->getLocalMacAddress().c_str());
    } else {
        Serial.println("[Branch_GatewayUsb] ❌ Failed to initialize ESP-NOW");
        delete espnowHelper;
        espnowHelper = nullptr;
    }
}

bool Branch_GatewayUsb::addESPNowPeerIfNeeded(const String& macAddress) {
    if (!espnowHelper || !isValidMacAddress(macAddress)) {
        return false;
    }
    
    // Check if peer already exists
    auto peers = espnowHelper->getPeers();
    for (const auto& peer : peers) {
        if (espnowHelper->macToString(peer.macAddress) == macAddress) {
            // Peer already exists, update activity
            return true;
        }
    }
    
    // Add new peer with auto-generated name
    String peerName = "Gateway_" + macAddress.substring(12); // Use last 2 bytes
    bool success = espnowHelper->addPeer(macAddress, peerName);
    
    if (success) {
        Serial.printf("[Branch_GatewayUsb] ✅ Auto-added ESP-NOW peer: %s (%s)\n", 
                     macAddress.c_str(), peerName.c_str());
    } else {
        Serial.printf("[Branch_GatewayUsb] ❌ Failed to add ESP-NOW peer: %s\n", macAddress.c_str());
    }
    
    return success;
}

// ==========================================
// GATEWAY STATUS METHODS
// ==========================================

bool Branch_GatewayUsb::isESPNowReady() const {
    return espnowHelper && espnowHelper->isInitialized();
}

int Branch_GatewayUsb::getESPNowPeerCount() const {
    return espnowHelper ? espnowHelper->getPeerCount() : 0;
}

String Branch_GatewayUsb::getESPNowPeersJSON() const {
    return espnowHelper ? espnowHelper->getPeersJSON() : "{}";
}

// ==========================================
// STREAMPROCESSOR CALLBACK HANDLERS
// ==========================================

void Branch_GatewayUsb::handleProtocolPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    // Serial.printf("[Branch_GatewayUsb] 📡 PROTOCOL callback received: %s\n", type ? type : "unknown");
    
    // Check for destination-based forwarding FIRST
    if (doc.containsKey("destination")) {
        handleDestinationPayload(doc);
        return; // Don't process locally after forwarding
    }
    
    // Handle other protocol-specific payloads
    if (type) {
        if (strcmp(type, "MQTT_Subscription_Request") == 0) {
            Serial.println("[Branch_GatewayUsb] 📬 MQTT subscription request - gateway mode doesn't support MQTT");
            
            // Send acknowledgment response
            StaticJsonDocument<256> response;
            response["type"] = "mqtt_subscription_ack";
            response["status"] = "not_supported";
            response["message"] = "MQTT not supported in gateway mode";
            String responseJson;
            serializeJson(response, responseJson);
            sendResponse(responseJson, "mqtt_subscription");
            
        } else if (strcmp(type, "peer_management") == 0) {
            handlePeerManagementRequest(doc);
            
        } else if (strcmp(type, "gateway_status") == 0) {
            handleGatewayStatus(doc);
            
        } else if (strcmp(type, "espnow_response") == 0) {
            handleESPNowResponse(doc);
            
        } else {
            Serial.printf("[Branch_GatewayUsb] ❓ Unhandled protocol type: %s\n", type);
            sendErrorResponse("Unhandled protocol type: " + String(type), "protocol");
        }
    }
}

void Branch_GatewayUsb::handleSystemPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    Serial.printf("[Branch_GatewayUsb] ⚙️ SYSTEM callback received: %s\n", type ? type : "unknown");
    
    // Handle system-wide payloads using injected helpers (same as other branches)
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
            Serial.printf("[Branch_GatewayUsb] ❓ Unhandled system type: %s\n", type);
            sendErrorResponse("Unhandled system type: " + String(type), "system");
        }
    }
}

// ==========================================
// GATEWAY-SPECIFIC PROTOCOL HANDLERS
// ==========================================

void Branch_GatewayUsb::handleDestinationPayload(const JsonDocument& doc) {
    String destinationMac = extractDestinationMac(doc);
    
    if (destinationMac.isEmpty() || !isValidMacAddress(destinationMac)) {
        Serial.printf("[Branch_GatewayUsb] ❌ Invalid destination MAC in payload\n");
        sendErrorResponse("Invalid destination MAC address", "gateway_forward");
        return;
    }
    
    // Serial.printf("[Branch_GatewayUsb] 🌐 Forwarding message to ESP-NOW peer: %s\n", destinationMac.c_str());
    
    if (!espnowHelper) {
        Serial.println("[Branch_GatewayUsb] ❌ ESP-NOW not available for forwarding");
        sendErrorResponse("ESP-NOW not available", "gateway_forward");
        return;
    }
    
    // Auto-add peer if needed
    addESPNowPeerIfNeeded(destinationMac);
    
    // Create forwarding payload (remove destination field to avoid loops)
    DynamicJsonDocument forwardDoc(2048);
    forwardDoc.set(doc);
    forwardDoc.remove("destination");
    
    // Add gateway metadata
    forwardDoc["gatewayMac"] = espnowHelper->getLocalMacAddress();
    forwardDoc["gatewayTimestamp"] = millis();
    
    // Forward via ESP-NOW
    bool success = espnowHelper->sendJSON(destinationMac, forwardDoc);
    
    // Send acknowledgment back to USB
    StaticJsonDocument<256> ackResponse;
    ackResponse["type"] = "gateway_forward_ack";
    ackResponse["destination"] = destinationMac;
    ackResponse["status"] = success ? "sent" : "failed";
    ackResponse["timestamp"] = millis();
    
    if (success) {
        ackResponse["message"] = "Message forwarded successfully";
        // Serial.printf("[Branch_GatewayUsb] ✅ Successfully forwarded to %s\n", destinationMac.c_str());
    } else {
        ackResponse["message"] = "ESP-NOW send failed";
        Serial.printf("[Branch_GatewayUsb] ❌ Failed to forward to %s\n", destinationMac.c_str());
    }
    
    String responseJson;
    serializeJson(ackResponse, responseJson);
    sendResponse(responseJson, "gateway_forward");
}

void Branch_GatewayUsb::handlePeerManagementRequest(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayUsb] 👥 Processing peer management request...");
    
    if (doc.containsKey("action")) {
        String action = doc["action"].as<String>();
        
        StaticJsonDocument<256> response;
        response["type"] = "peer_management_response";
        response["action"] = action;
        response["timestamp"] = millis();
        
        if (action == "add" && doc.containsKey("peerMac")) {
            String peerMac = doc["peerMac"].as<String>();
            String peerName = doc.containsKey("peerName") ? doc["peerName"].as<String>() : "Unknown";
            
            bool success = addESPNowPeerIfNeeded(peerMac);
            response["success"] = success;
            response["peerMac"] = peerMac;
            response["message"] = success ? "Peer added successfully" : "Failed to add peer";
            
            Serial.printf("[Branch_GatewayUsb] Peer add result: %s for %s (%s)\n", 
                         success ? "SUCCESS" : "FAILED", peerMac.c_str(), peerName.c_str());
            
        } else if (action == "remove" && doc.containsKey("peerMac")) {
            String peerMac = doc["peerMac"].as<String>();
            
            bool success = false;
            if (espnowHelper) {
                success = espnowHelper->removePeer(peerMac);
            }
            response["success"] = success;
            response["peerMac"] = peerMac;
            response["message"] = success ? "Peer removed successfully" : "Failed to remove peer";
            
        } else if (action == "list") {
            response["success"] = true;
            response["peerCount"] = getESPNowPeerCount();
            response["message"] = "Peer list available";
            
        } else {
            response["success"] = false;
            response["message"] = "Invalid peer management action";
        }
        
        String responseJson;
        serializeJson(response, responseJson);
        sendResponse(responseJson, "peer_management");
    }
}

void Branch_GatewayUsb::handleESPNowResponse(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayUsb] 📨 ESP-NOW response received");
    
    // Forward ESP-NOW responses back to USB client
    forwardESPNowDataToUSB(doc);
}

void Branch_GatewayUsb::handleGatewayStatus(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayUsb] 📊 Gateway status request received");
    
    StaticJsonDocument<512> response;
    response["type"] = "gateway_status_response";
    response["timestamp"] = millis();
    response["gatewayMode"] = "usb_espnow";
    response["usbActive"] = true;
    response["espnowActive"] = isESPNowReady();
    response["espnowPeerCount"] = getESPNowPeerCount();
    
    if (espnowHelper) {
        response["localMac"] = espnowHelper->getLocalMacAddress();
        
        // Add ESP-NOW statistics
        String statsJSON = espnowHelper->getStatisticsJSON();
        DynamicJsonDocument statsDoc(512);
        deserializeJson(statsDoc, statsJSON);
        response["espnowStats"] = statsDoc;
    }
    
    String responseJson;
    serializeJson(response, responseJson);
    sendResponse(responseJson, "gateway_status");
}

// ==========================================
// ESP-NOW DATA FORWARDING
// ==========================================

void Branch_GatewayUsb::handleESPNowIncomingData(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayUsb] 📥 ESP-NOW data received, forwarding to USB");
    
    // Forward ESP-NOW data to USB client
    forwardESPNowDataToUSB(doc);
}

void Branch_GatewayUsb::forwardESPNowDataToUSB(const JsonDocument& doc) {
    // Wrap ESP-NOW data in gateway envelope
    StaticJsonDocument<2048> envelope;
    envelope["type"] = "espnow_data";
    envelope["timestamp"] = millis();
    envelope["gatewayMac"] = espnowHelper ? espnowHelper->getLocalMacAddress() : "";
    
    // Add source information if available
    if (doc.containsKey("gatewayMac")) {
        envelope["sourceMac"] = doc["gatewayMac"];
    }
    if (doc.containsKey("gatewayTimestamp")) {
        envelope["sourceTimestamp"] = doc["gatewayTimestamp"];
    }
    
    // Embed the original data
    envelope["data"] = doc;
    
    String envelopeJson;
    serializeJson(envelope, envelopeJson);
    sendResponse(envelopeJson, "espnow_data");
    
    Serial.println("[Branch_GatewayUsb] ✅ ESP-NOW data forwarded to USB client");
}

// ==========================================
// SYSTEM HANDLERS (copied from Branch_UsbDirect)
// ==========================================

void Branch_GatewayUsb::handleDeviceInfoRequest(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayUsb] 📱 Processing device info request...");
    
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
        Serial.printf("[Branch_GatewayUsb] Exception in device info: %s\n", e.what());
        sendErrorResponse("Exception getting device info", "device_info");
    } catch (...) {
        Serial.println("[Branch_GatewayUsb] Unknown exception in device info");
        sendErrorResponse("Unknown error getting device info", "device_info");
    }
}

void Branch_GatewayUsb::handleDeviceCapabilitiesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayUsb] 🔧 Processing device capabilities request...");
    
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
        Serial.printf("[Branch_GatewayUsb] Exception in device capabilities: %s\n", e.what());
        sendErrorResponse("Exception getting device capabilities", "device_capabilities");
    } catch (...) {
        Serial.println("[Branch_GatewayUsb] Unknown exception in device capabilities");
        sendErrorResponse("Unknown error getting device capabilities", "device_capabilities");
    }
}

void Branch_GatewayUsb::handleStatsRequest(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayUsb] 📊 Processing stats request...");
    
    try {
        // Create comprehensive stats response including gateway info
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
        
        // Gateway specific stats
        JsonObject gatewayObj = statsDoc.createNestedObject("gatewayStats");
        gatewayObj["responseQueueSize"] = responseQueue.size();
        gatewayObj["maxResponseQueueSize"] = MAX_RESPONSE_QUEUE_SIZE;
        gatewayObj["connectionType"] = "Gateway_USB";
        gatewayObj["espnowActive"] = isESPNowReady();
        gatewayObj["espnowPeerCount"] = getESPNowPeerCount();
        
        // ESP-NOW stats if available
        if (espnowHelper) {
            String espnowStatsJSON = espnowHelper->getStatisticsJSON();
            StaticJsonDocument<512> espnowStatsDoc;
            deserializeJson(espnowStatsDoc, espnowStatsJSON);
            statsDoc["espnowStats"] = espnowStatsDoc;
        }
        
        String statsJson;
        serializeJson(statsDoc, statsJson);
        sendResponse(statsJson, "stats");
        
    } catch (...) {
        sendErrorResponse("Error generating stats", "stats");
    }
}

void Branch_GatewayUsb::handlePreferencesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayUsb] ⚙️ Processing preferences request...");
    
    // Create response indicating Gateway USB mode limitations
    StaticJsonDocument<256> response;
    response["type"] = "preferences_response";
    response["mode"] = "gateway_usb";
    response["message"] = "Limited preferences support in gateway mode";
    response["supported"] = false;
    
    if (doc.containsKey("action")) {
        String action = doc["action"].as<String>();
        response["requestedAction"] = action;
        Serial.printf("[Branch_GatewayUsb] Preferences action requested: %s\n", action.c_str());
    }
    
    String responseJson;
    serializeJson(response, responseJson);
    sendResponse(responseJson, "preferences");
}

void Branch_GatewayUsb::handleSystemCommand(const JsonDocument& doc) {
    Serial.println("[Branch_GatewayUsb] 🔧 Processing system command...");
    
    if (doc.containsKey("command")) {
        String cmd = doc["command"].as<String>();
        Serial.printf("[Branch_GatewayUsb] Command: %s\n", cmd.c_str());
        
        StaticJsonDocument<256> response;
        response["type"] = "system_command_response";
        response["command"] = cmd;
        
        if (cmd == "restart") {
            response["status"] = "executing";
            response["message"] = "Gateway device will restart in 3 seconds";
            
            String responseJson;
            serializeJson(response, responseJson);
            sendResponse(responseJson, "system_command");
            
            // Give time for response to be sent
            delay(500);
            
            Serial.println("[Branch_GatewayUsb] Restarting gateway device in 3 seconds...");
            delay(3000);
            ESP.restart();
            
        } else if (cmd == "gateway_reset") {
            response["status"] = "executing";
            response["message"] = "Clearing ESP-NOW peers and resetting gateway";
            
            if (espnowHelper) {
                espnowHelper->clearPeers();
            }
            
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

String Branch_GatewayUsb::getRequestType(const JsonDocument& doc) {
    const char* type = doc["type"];
    return type ? String(type) : "unknown";
}

bool Branch_GatewayUsb::isValidJson(const String& jsonString) {
    if (jsonString.isEmpty()) {
        return false;
    }
    
    StaticJsonDocument<64> testDoc;
    DeserializationError error = deserializeJson(testDoc, jsonString);
    return error == DeserializationError::Ok;
}

String Branch_GatewayUsb::extractDestinationMac(const JsonDocument& doc) {
    if (doc.containsKey("destination")) {
        return doc["destination"].as<String>();
    }
    return "";
}

bool Branch_GatewayUsb::isValidMacAddress(const String& mac) {
    return Helper_ESPNOW::isValidMacString(mac);
}