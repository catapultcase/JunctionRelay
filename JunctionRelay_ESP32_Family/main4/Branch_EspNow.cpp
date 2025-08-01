#include "Branch_EspNow.h"
#include "Helper_StreamProcessor.h"
#include "Helper_DeviceInfo.h"
#include "Helper_DeviceCapabilities.h"
#include "Helper_ESPNOW.h"
#include "Manager_ScreenRouter.h"
#include "DeviceConfig.h"

Branch_EspNow::Branch_EspNow()
    : initialized(false),
      screenRouter(nullptr),
      devicePtr(nullptr),
      streamProcessor(nullptr),
      espnowHelper(nullptr),
      deviceInfo(nullptr),
      deviceCapabilities(nullptr)
{
    // Serial.println("[Branch_EspNow] Constructor called");
}

Branch_EspNow::~Branch_EspNow() {
    if (espnowHelper) {
        delete espnowHelper;
        espnowHelper = nullptr;
    }
    
    if (streamProcessor) {
        delete streamProcessor;
        streamProcessor = nullptr;
    }
    
    Serial.println("[Branch_EspNow] Destructor called");
}

void Branch_EspNow::init(ScreenRouter* router, DeviceConfig* device, 
                         Helper_DeviceInfo* devInfo, Helper_DeviceCapabilities* devCaps) {
    if (!router || !device || !devInfo || !devCaps) {
        Serial.println("[Branch_EspNow] ERROR: Required parameters are null");
        return;
    }

    screenRouter = router;
    devicePtr = device;
    deviceInfo = devInfo;
    deviceCapabilities = devCaps;
    
    Serial.println("[Branch_EspNow] Initializing ESP-NOW branch...");
    
    // Create StreamProcessor with device pointer for screen setup
    streamProcessor = new Helper_StreamProcessor(
        screenRouter,
        [this](const JsonDocument& doc) { this->handleProtocolPayload(doc); },
        [this](const JsonDocument& doc) { this->handleSystemPayload(doc); },
        devicePtr
    );
    
    // Create ESP-NOW helper with StreamProcessor
    espnowHelper = new Helper_ESPNOW(streamProcessor);
    
    // Initialize ESP-NOW
    initializeESPNow();
    
    initialized = true;
    
    Serial.println("[Branch_EspNow] ✅ ESP-NOW branch ready");
    Serial.println("[Branch_EspNow] Supported ESP-NOW message types:");
    Serial.println("[Branch_EspNow]   - {\"type\":\"device_info_request\"}");
    Serial.println("[Branch_EspNow]   - {\"type\":\"device_capabilities_request\"}");
    Serial.println("[Branch_EspNow]   - {\"type\":\"peer_discovery_request\"}");
    Serial.println("[Branch_EspNow]   - {\"type\":\"stats_request\"}");
    Serial.println("[Branch_EspNow]   - {\"type\":\"peer_management\"}");
    Serial.println("[Branch_EspNow]   - {\"type\":\"system_command\"}");
    Serial.println("[Branch_EspNow]   - Regular sensor/config data for screens");
}

void Branch_EspNow::loop() {
    if (initialized && espnowHelper) {
        // ESP-NOW is event-driven, but we can do periodic maintenance
        // This could include peer cleanup, statistics updates, etc.
        
        // No active loop processing needed for ESP-NOW
        // All message handling is done via callbacks
    }
}

void Branch_EspNow::initializeESPNow() {
    if (!espnowHelper) {
        Serial.println("[Branch_EspNow] ERROR: ESP-NOW helper not created");
        return;
    }
    
    if (espnowHelper->begin()) {
        Serial.printf("[Branch_EspNow] ✅ ESP-NOW initialized. Local MAC: %s\n", 
                     espnowHelper->getLocalMacAddress().c_str());
    } else {
        Serial.println("[Branch_EspNow] ❌ Failed to initialize ESP-NOW");
    }
}

// ==========================================
// ESP-NOW SPECIFIC METHODS
// ==========================================

bool Branch_EspNow::addPeer(const String& macAddress, const String& name) {
    if (!espnowHelper) {
        Serial.println("[Branch_EspNow] ERROR: ESP-NOW helper not available");
        return false;
    }
    
    return espnowHelper->addPeer(macAddress, name);
}

bool Branch_EspNow::removePeer(const String& macAddress) {
    if (!espnowHelper) {
        Serial.println("[Branch_EspNow] ERROR: ESP-NOW helper not available");
        return false;
    }
    
    return espnowHelper->removePeer(macAddress);
}

void Branch_EspNow::clearPeers() {
    if (espnowHelper) {
        espnowHelper->clearPeers();
    }
}

int Branch_EspNow::getPeerCount() const {
    if (espnowHelper) {
        return espnowHelper->getPeerCount();
    }
    return 0;
}

String Branch_EspNow::getPeersJSON() const {
    if (espnowHelper) {
        return espnowHelper->getPeersJSON();
    }
    return "{}";
}

void Branch_EspNow::broadcastMessage(const String& message) {
    if (espnowHelper) {
        espnowHelper->broadcastMessage(message);
    }
}

void Branch_EspNow::broadcastJSON(const JsonDocument& doc) {
    if (espnowHelper) {
        espnowHelper->broadcastJSON(doc);
    }
}

// ==========================================
// STREAMPROCESSOR CALLBACK HANDLERS
// ==========================================

void Branch_EspNow::handleProtocolPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    Serial.printf("[Branch_EspNow] 📡 PROTOCOL callback received: %s\n", type ? type : "unknown");
    
    if (!type) return;
    
    if (strcmp(type, "peer_discovery_request") == 0) {
        handlePeerDiscoveryRequest(doc);
    }
    else if (strcmp(type, "peer_management") == 0) {
        handlePeerManagementRequest(doc);
    }
    else if (strcmp(type, "espnow_message") == 0) {
        handleESPNowMessage(doc);
    }
    else if (strcmp(type, "device_status_request") == 0) {
        handleDeviceStatusRequest(doc);
    }
    else {
        Serial.printf("[Branch_EspNow] ❓ Unhandled protocol type: %s\n", type);
    }
}

void Branch_EspNow::handleSystemPayload(const JsonDocument& doc) {
    const char* type = doc["type"];
    Serial.printf("[Branch_EspNow] ⚙️ SYSTEM callback received: %s\n", type ? type : "unknown");
    
    if (!type) return;
    
    if (strcmp(type, "device_info_request") == 0) {
        handleDeviceInfoRequest(doc);
    }
    else if (strcmp(type, "device_capabilities_request") == 0) {
        handleDeviceCapabilitiesRequest(doc);
    }
    else if (strcmp(type, "stats_request") == 0) {
        handleStatsRequest(doc);
    }
    else if (strcmp(type, "preferences") == 0) {
        handlePreferencesRequest(doc);
    }
    else if (strcmp(type, "system_command") == 0) {
        handleSystemCommand(doc);
    }
    else {
        Serial.printf("[Branch_EspNow] ❓ Unhandled system type: %s\n", type);
    }
}

// ==========================================
// PROTOCOL-SPECIFIC HANDLERS
// ==========================================

void Branch_EspNow::handlePeerDiscoveryRequest(const JsonDocument& doc) {
    Serial.println("[Branch_EspNow] 🔍 Processing peer discovery request...");
    
    String requestorMac = getTargetMac(doc);
    
    if (!requestorMac.isEmpty() && isValidMacAddress(requestorMac)) {
        // Add the requestor as a peer if not already known
        addPeer(requestorMac, "Discovered_Peer");
        
        // Send peer list response
        if (espnowHelper) {
            espnowHelper->handlePeerDiscoveryRequest((uint8_t*)requestorMac.c_str());
        }
    } else {
        // Broadcast peer list if no specific requestor
        StaticJsonDocument<512> response;
        response["type"] = "peer_discovery_response";
        response["localMac"] = espnowHelper ? espnowHelper->getLocalMacAddress() : "";
        response["timestamp"] = millis();
        
        broadcastResponse(response);
    }
}

void Branch_EspNow::handlePeerManagementRequest(const JsonDocument& doc) {
    Serial.println("[Branch_EspNow] 👥 Processing peer management request...");
    
    if (doc.containsKey("action")) {
        String action = doc["action"].as<String>();
        String targetMac = getTargetMac(doc);
        
        StaticJsonDocument<256> response;
        response["type"] = "peer_management_response";
        response["action"] = action;
        response["timestamp"] = millis();
        
        if (action == "add" && doc.containsKey("peerMac")) {
            String peerMac = doc["peerMac"].as<String>();
            String peerName = doc.containsKey("peerName") ? doc["peerName"].as<String>() : "Unknown";
            
            bool success = addPeer(peerMac, peerName);
            response["success"] = success;
            response["peerMac"] = peerMac;
            response["message"] = success ? "Peer added successfully" : "Failed to add peer";
            
        } else if (action == "remove" && doc.containsKey("peerMac")) {
            String peerMac = doc["peerMac"].as<String>();
            
            bool success = removePeer(peerMac);
            response["success"] = success;
            response["peerMac"] = peerMac;
            response["message"] = success ? "Peer removed successfully" : "Failed to remove peer";
            
        } else if (action == "list") {
            response["success"] = true;
            response["peerCount"] = getPeerCount();
            response["message"] = "Peer list available in separate message";
            
            // Send detailed peer list
            if (!targetMac.isEmpty()) {
                sendResponseToPeer(targetMac, response);
                
                StaticJsonDocument<1024> peerListDoc;
                deserializeJson(peerListDoc, getPeersJSON());
                peerListDoc["type"] = "peer_list_response";
                sendResponseToPeer(targetMac, peerListDoc);
                return;
            }
        } else {
            response["success"] = false;
            response["message"] = "Invalid peer management action";
        }
        
        if (!targetMac.isEmpty()) {
            sendResponseToPeer(targetMac, response);
        } else {
            broadcastResponse(response);
        }
    }
}

void Branch_EspNow::handleESPNowMessage(const JsonDocument& doc) {
    Serial.println("[Branch_EspNow] 📨 Processing ESP-NOW message...");
    
    // Generic ESP-NOW message handling
    String targetMac = getTargetMac(doc);
    String messageType = doc.containsKey("messageType") ? doc["messageType"].as<String>() : "unknown";
    
    Serial.printf("[Branch_EspNow] Message type: %s, Target: %s\n", 
                 messageType.c_str(), targetMac.c_str());
    
    // Echo acknowledgment
    StaticJsonDocument<256> ack;
    ack["type"] = "espnow_message_ack";
    ack["messageType"] = messageType;
    ack["timestamp"] = millis();
    ack["status"] = "received";
    
    if (!targetMac.isEmpty()) {
        sendResponseToPeer(targetMac, ack);
    }
}

void Branch_EspNow::handleDeviceStatusRequest(const JsonDocument& doc) {
    Serial.println("[Branch_EspNow] 📊 Processing device status request...");
    
    String targetMac = getTargetMac(doc);
    
    StaticJsonDocument<512> response;
    response["type"] = "device_status_response";
    response["timestamp"] = millis();
    response["localMac"] = espnowHelper ? espnowHelper->getLocalMacAddress() : "";
    response["uptime"] = millis();
    response["freeHeap"] = ESP.getFreeHeap();
    response["peerCount"] = getPeerCount();
    response["espnowActive"] = espnowHelper ? espnowHelper->isInitialized() : false;
    
    if (!targetMac.isEmpty()) {
        sendResponseToPeer(targetMac, response);
    } else {
        broadcastResponse(response);
    }
}

// ==========================================
// SYSTEM HANDLERS USING INJECTED HELPERS
// ==========================================

void Branch_EspNow::handleDeviceInfoRequest(const JsonDocument& doc) {
    Serial.println("[Branch_EspNow] 📱 Processing device info request...");
    
    String targetMac = getTargetMac(doc);
    
    if (!deviceInfo) {
        StaticJsonDocument<256> errorResponse;
        errorResponse["type"] = "error_response";
        errorResponse["error"] = "Device info helper not available";
        errorResponse["requestType"] = "device_info";
        
        if (!targetMac.isEmpty()) {
            sendResponseToPeer(targetMac, errorResponse);
        }
        return;
    }
    
    try {
        String deviceInfoJSON = deviceInfo->getDeviceInfoJSON();
        
        if (deviceInfoJSON.isEmpty() || deviceInfoJSON == "{}") {
            StaticJsonDocument<256> errorResponse;
            errorResponse["type"] = "error_response";
            errorResponse["error"] = "Device info not available";
            errorResponse["requestType"] = "device_info";
            
            if (!targetMac.isEmpty()) {
                sendResponseToPeer(targetMac, errorResponse);
            }
            return;
        }
        
        // Parse device info and wrap in response
        DynamicJsonDocument deviceDoc(1024);
        deserializeJson(deviceDoc, deviceInfoJSON);
        
        StaticJsonDocument<1024> response;
        response["type"] = "device_info_response";
        response["timestamp"] = millis();
        response["deviceInfo"] = deviceDoc.as<JsonObject>();
        
        if (!targetMac.isEmpty()) {
            sendResponseToPeer(targetMac, response);
        } else {
            broadcastResponse(response);
        }
        
    } catch (...) {
        Serial.println("[Branch_EspNow] Exception in device info processing");
        
        StaticJsonDocument<256> errorResponse;
        errorResponse["type"] = "error_response";
        errorResponse["error"] = "Exception getting device info";
        errorResponse["requestType"] = "device_info";
        
        if (!targetMac.isEmpty()) {
            sendResponseToPeer(targetMac, errorResponse);
        }
    }
}

void Branch_EspNow::handleDeviceCapabilitiesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_EspNow] 🔧 Processing device capabilities request...");
    
    String targetMac = getTargetMac(doc);
    
    if (!deviceCapabilities) {
        StaticJsonDocument<256> errorResponse;
        errorResponse["type"] = "error_response";
        errorResponse["error"] = "Device capabilities helper not available";
        errorResponse["requestType"] = "device_capabilities";
        
        if (!targetMac.isEmpty()) {
            sendResponseToPeer(targetMac, errorResponse);
        }
        return;
    }
    
    try {
        String capabilitiesJSON = deviceCapabilities->getDeviceCapabilitiesJSON();
        
        if (capabilitiesJSON.isEmpty() || capabilitiesJSON == "{}") {
            StaticJsonDocument<256> errorResponse;
            errorResponse["type"] = "error_response";
            errorResponse["error"] = "Device capabilities not available";
            errorResponse["requestType"] = "device_capabilities";
            
            if (!targetMac.isEmpty()) {
                sendResponseToPeer(targetMac, errorResponse);
            }
            return;
        }
        
        // Parse capabilities and wrap in response
        DynamicJsonDocument capabilitiesDoc(1024);
        deserializeJson(capabilitiesDoc, capabilitiesJSON);
        
        StaticJsonDocument<1024> response;
        response["type"] = "device_capabilities_response";
        response["timestamp"] = millis();
        response["capabilities"] = capabilitiesDoc.as<JsonObject>();
        
        if (!targetMac.isEmpty()) {
            sendResponseToPeer(targetMac, response);
        } else {
            broadcastResponse(response);
        }
        
    } catch (...) {
        Serial.println("[Branch_EspNow] Exception in device capabilities processing");
        
        StaticJsonDocument<256> errorResponse;
        errorResponse["type"] = "error_response";
        errorResponse["error"] = "Exception getting device capabilities";
        errorResponse["requestType"] = "device_capabilities";
        
        if (!targetMac.isEmpty()) {
            sendResponseToPeer(targetMac, errorResponse);
        }
    }
}

void Branch_EspNow::handleStatsRequest(const JsonDocument& doc) {
    Serial.println("[Branch_EspNow] 📊 Processing stats request...");
    
    String targetMac = getTargetMac(doc);
    
    try {
        StaticJsonDocument<1024> statsDoc;
        
        // System stats from helper
        if (deviceInfo) {
            String lightweightStats = deviceInfo->getSystemStatsLightweightJSON();
            StaticJsonDocument<512> systemDoc;
            deserializeJson(systemDoc, lightweightStats);
            statsDoc["systemStats"] = systemDoc;
        }
        
        // Queue status from StreamProcessor
        if (streamProcessor) {
            auto queueStatus = streamProcessor->getQueueStatus();
            JsonObject queueObj = statsDoc.createNestedObject("queueStatus");
            queueObj["sensorQueueSize"] = queueStatus.sensorQueueSize;
            queueObj["configQueueSize"] = queueStatus.configQueueSize;
            queueObj["sensorTaskRunning"] = queueStatus.sensorTaskRunning;
            queueObj["configTaskRunning"] = queueStatus.configTaskRunning;
        }
        
        // ESP-NOW specific stats
        if (espnowHelper) {
            String espnowStatsJSON = espnowHelper->getStatisticsJSON();
            StaticJsonDocument<512> espnowStatsDoc;
            deserializeJson(espnowStatsDoc, espnowStatsJSON);
            statsDoc["espnowStats"] = espnowStatsDoc;
        }
        
        // Wrap in response
        StaticJsonDocument<1024> response;
        response["type"] = "stats_response";
        response["timestamp"] = millis();
        response["stats"] = statsDoc.as<JsonObject>();
        
        if (!targetMac.isEmpty()) {
            sendResponseToPeer(targetMac, response);
        } else {
            broadcastResponse(response);
        }
        
    } catch (...) {
        StaticJsonDocument<256> errorResponse;
        errorResponse["type"] = "error_response";
        errorResponse["error"] = "Error generating stats";
        errorResponse["requestType"] = "stats";
        
        if (!targetMac.isEmpty()) {
            sendResponseToPeer(targetMac, errorResponse);
        }
    }
}

void Branch_EspNow::handlePreferencesRequest(const JsonDocument& doc) {
    Serial.println("[Branch_EspNow] ⚙️ Processing preferences request...");
    
    String targetMac = getTargetMac(doc);
    
    // ESP-NOW mode has limited preferences operations
    StaticJsonDocument<256> response;
    response["type"] = "preferences_response";
    response["mode"] = "espnow";
    response["message"] = "Limited preferences support in ESP-NOW mode";
    response["supported"] = false;
    response["timestamp"] = millis();
    
    if (doc.containsKey("action")) {
        String action = doc["action"].as<String>();
        response["requestedAction"] = action;
        Serial.printf("[Branch_EspNow] Preferences action requested: %s\n", action.c_str());
    }
    
    if (!targetMac.isEmpty()) {
        sendResponseToPeer(targetMac, response);
    } else {
        broadcastResponse(response);
    }
}

void Branch_EspNow::handleSystemCommand(const JsonDocument& doc) {
    Serial.println("[Branch_EspNow] 🔧 Processing system command...");
    
    String targetMac = getTargetMac(doc);
    
    if (doc.containsKey("command")) {
        String cmd = doc["command"].as<String>();
        Serial.printf("[Branch_EspNow] Command: %s\n", cmd.c_str());
        
        StaticJsonDocument<256> response;
        response["type"] = "system_command_response";
        response["command"] = cmd;
        response["timestamp"] = millis();
        
        if (cmd == "restart") {
            response["status"] = "executing";
            response["message"] = "Device will restart in 3 seconds";
            
            if (!targetMac.isEmpty()) {
                sendResponseToPeer(targetMac, response);
            } else {
                broadcastResponse(response);
            }
            
            // Give time for response to be sent
            delay(500);
            
            Serial.println("[Branch_EspNow] Restarting device in 3 seconds...");
            delay(3000);
            ESP.restart();
            
        } else if (cmd == "ping") {
            response["status"] = "success";
            response["message"] = "Pong! ESP-NOW device is alive";
            response["localMac"] = espnowHelper ? espnowHelper->getLocalMacAddress() : "";
            
            if (!targetMac.isEmpty()) {
                sendResponseToPeer(targetMac, response);
            } else {
                broadcastResponse(response);
            }
            
        } else {
            response["status"] = "unknown_command";
            response["message"] = "Unknown command: " + cmd;
            
            if (!targetMac.isEmpty()) {
                sendResponseToPeer(targetMac, response);
            } else {
                broadcastResponse(response);
            }
        }
    } else {
        StaticJsonDocument<256> errorResponse;
        errorResponse["type"] = "error_response";
        errorResponse["error"] = "No command specified";
        errorResponse["requestType"] = "system_command";
        
        if (!targetMac.isEmpty()) {
            sendResponseToPeer(targetMac, errorResponse);
        }
    }
}

// ==========================================
// UTILITY METHODS
// ==========================================

void Branch_EspNow::sendResponseToPeer(const String& targetMac, const JsonDocument& response) {
    if (espnowHelper && isValidMacAddress(targetMac)) {
        espnowHelper->sendJSON(targetMac, response);
        Serial.printf("[Branch_EspNow] Sent response to peer %s\n", targetMac.c_str());
    } else {
        Serial.printf("[Branch_EspNow] Cannot send response to invalid MAC: %s\n", targetMac.c_str());
    }
}

void Branch_EspNow::broadcastResponse(const JsonDocument& response) {
    if (espnowHelper) {
        espnowHelper->broadcastJSON(response);
        Serial.println("[Branch_EspNow] Broadcast response to all peers");
    }
}

String Branch_EspNow::getRequestType(const JsonDocument& doc) {
    const char* type = doc["type"];
    return type ? String(type) : "unknown";
}

String Branch_EspNow::getTargetMac(const JsonDocument& doc) {
    if (doc.containsKey("requestorMac")) {
        return doc["requestorMac"].as<String>();
    } else if (doc.containsKey("targetMac")) {
        return doc["targetMac"].as<String>();
    } else if (doc.containsKey("sourceMac")) {
        return doc["sourceMac"].as<String>();
    }
    return "";
}

bool Branch_EspNow::isValidMacAddress(const String& mac) {
    return Helper_ESPNOW::isValidMacString(mac);
}