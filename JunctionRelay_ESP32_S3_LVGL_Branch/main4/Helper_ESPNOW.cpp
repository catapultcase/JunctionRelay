#include "Helper_ESPNOW.h"
#include "Helper_StreamProcessor.h"
#include <esp_wifi.h>

// Global pointer for static callbacks
static Helper_ESPNOW* gESPNowHelper = nullptr;

// Static callback functions for ESP-NOW
void onDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    if (gESPNowHelper) {
        gESPNowHelper->handleDataSent(mac_addr, status);
    }
}

void onDataReceived(const uint8_t *mac, const uint8_t *incomingData, int len) {
    if (gESPNowHelper) {
        gESPNowHelper->handleDataReceived(mac, incomingData, len);
    }
}

Helper_ESPNOW::Helper_ESPNOW(Helper_StreamProcessor* processor)
    : streamProcessor(processor),
      initialized(false),
      isReceiveMode(true),
      isSendMode(true),
      messagesSent(0),
      messagesReceived(0),
      sendErrors(0),
      receiveErrors(0)
{
    gESPNowHelper = this;
    peers.reserve(MAX_PEERS);
    messageHistory.reserve(MAX_MESSAGE_HISTORY);
    Serial.println("[Helper_ESPNOW] Constructor called");
}

Helper_ESPNOW::~Helper_ESPNOW() {
    end();
    gESPNowHelper = nullptr;
    Serial.println("[Helper_ESPNOW] Destructor called");
}

bool Helper_ESPNOW::begin() {
    if (initialized) {
        Serial.println("[Helper_ESPNOW] Already initialized");
        return true;
    }
    
    Serial.println("[Helper_ESPNOW] Initializing ESP-NOW...");
    
    // Set WiFi mode to STA (required for ESP-NOW)
    WiFi.mode(WIFI_STA);
    
    // Initialize ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("[Helper_ESPNOW] ❌ Failed to initialize ESP-NOW");
        return false;
    }
    
    // Register callbacks
    esp_now_register_send_cb(onDataSent);
    esp_now_register_recv_cb(onDataReceived);
    
    initialized = true;
    
    Serial.printf("[Helper_ESPNOW] ✅ Initialized successfully. Local MAC: %s\n", getLocalMacAddress().c_str());
    Serial.printf("[Helper_ESPNOW] Channel: %d\n", WiFi.channel());
    
    return true;
}

void Helper_ESPNOW::end() {
    if (!initialized) return;
    
    Serial.println("[Helper_ESPNOW] Shutting down ESP-NOW...");
    
    // Clear all peers
    clearPeers();
    
    // Deinitialize ESP-NOW
    esp_now_deinit();
    
    initialized = false;
    
    Serial.println("[Helper_ESPNOW] ✅ Shutdown complete");
}

bool Helper_ESPNOW::addPeer(const uint8_t* macAddress, const String& name) {
    if (!initialized) {
        Serial.println("[Helper_ESPNOW] Not initialized");
        return false;
    }
    
    return addPeerInternal(macAddress, name);
}

bool Helper_ESPNOW::addPeer(const String& macString, const String& name) {
    if (!isValidMacString(macString)) {
        Serial.printf("[Helper_ESPNOW] Invalid MAC address format: %s\n", macString.c_str());
        return false;
    }
    
    uint8_t macArray[6];
    parseMacString(macString, macArray);
    return addPeer(macArray, name);
}

bool Helper_ESPNOW::addPeerInternal(const uint8_t* mac, const String& name) {
    // Check if peer already exists
    for (auto& peer : peers) {
        if (memcmp(peer.macAddress, mac, 6) == 0) {
            Serial.printf("[Helper_ESPNOW] Peer %s already exists\n", macToString(mac).c_str());
            peer.isActive = true;
            peer.lastSeen = millis();
            if (!name.isEmpty()) {
                peer.name = name;
            }
            return true;
        }
    }
    
    // Check peer limit
    if (peers.size() >= MAX_PEERS) {
        Serial.printf("[Helper_ESPNOW] Maximum peers (%d) reached\n", MAX_PEERS);
        cleanupInactivePeers(); // Try to clean up inactive peers
        if (peers.size() >= MAX_PEERS) {
            return false;
        }
    }
    
    // Add to ESP-NOW peer list
    esp_now_peer_info_t peerInfo;
    memcpy(peerInfo.peer_addr, mac, 6);
    peerInfo.channel = WiFi.channel();
    peerInfo.encrypt = false;
    peerInfo.ifidx = WIFI_IF_STA;
    
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.printf("[Helper_ESPNOW] Failed to add peer %s to ESP-NOW\n", macToString(mac).c_str());
        return false;
    }
    
    // Add to our peer list
    peers.emplace_back(mac, name);
    Serial.printf("[Helper_ESPNOW] ✅ Added peer %s (%s)\n", macToString(mac).c_str(), name.c_str());
    
    return true;
}

bool Helper_ESPNOW::removePeer(const uint8_t* macAddress) {
    if (!initialized) return false;
    
    // Remove from ESP-NOW
    if (esp_now_del_peer(macAddress) != ESP_OK) {
        Serial.printf("[Helper_ESPNOW] Failed to remove peer %s from ESP-NOW\n", macToString(macAddress).c_str());
        return false;
    }
    
    // Remove from our list
    for (auto it = peers.begin(); it != peers.end(); ++it) {
        if (memcmp(it->macAddress, macAddress, 6) == 0) {
            Serial.printf("[Helper_ESPNOW] ✅ Removed peer %s (%s)\n", macToString(macAddress).c_str(), it->name.c_str());
            peers.erase(it);
            return true;
        }
    }
    
    return false;
}

bool Helper_ESPNOW::removePeer(const String& macString) {
    if (!isValidMacString(macString)) return false;
    
    uint8_t macArray[6];
    parseMacString(macString, macArray);
    return removePeer(macArray);
}

void Helper_ESPNOW::clearPeers() {
    for (const auto& peer : peers) {
        esp_now_del_peer(peer.macAddress);
    }
    peers.clear();
    Serial.println("[Helper_ESPNOW] ✅ Cleared all peers");
}

std::vector<ESPNowPeer> Helper_ESPNOW::getPeers() {
    cleanupInactivePeers();
    return peers;
}

String Helper_ESPNOW::getPeersJSON() {
    StaticJsonDocument<1024> doc;
    
    JsonArray peersArray = doc.createNestedArray("peers");
    for (const auto& peer : peers) {
        JsonObject peerObj = peersArray.createNestedObject();
        peerObj["mac"] = macToString(peer.macAddress);
        peerObj["name"] = peer.name;
        peerObj["active"] = peer.isActive;
        peerObj["lastSeen"] = peer.lastSeen;
        peerObj["rssi"] = peer.rssi;
    }
    
    doc["count"] = peers.size();
    doc["maxPeers"] = MAX_PEERS;
    doc["timestamp"] = millis();
    
    String output;
    serializeJson(doc, output);
    return output;
}

bool Helper_ESPNOW::sendMessage(const uint8_t* targetMac, const String& message) {
    if (!initialized || !isSendMode) {
        Serial.println("[Helper_ESPNOW] Not initialized or send mode disabled");
        return false;
    }
    
    if (message.length() > ESP_NOW_MAX_DATA_LEN) {
        Serial.printf("[Helper_ESPNOW] Message too long (%d bytes, max %d)\n", message.length(), ESP_NOW_MAX_DATA_LEN);
        sendErrors++;
        return false;
    }
    
    esp_err_t result = esp_now_send(targetMac, (uint8_t*)message.c_str(), message.length());
    
    if (result == ESP_OK) {
        return true;
    } else {
        Serial.printf("[Helper_ESPNOW] ❌ Send failed to %s: %s\n", macToString(targetMac).c_str(), esp_err_to_name(result));
        sendErrors++;
        return false;
    }
}

bool Helper_ESPNOW::sendMessage(const String& targetMacString, const String& message) {
    if (!isValidMacString(targetMacString)) return false;
    
    uint8_t macArray[6];
    parseMacString(targetMacString, macArray);
    return sendMessage(macArray, message);
}

bool Helper_ESPNOW::broadcastMessage(const String& message) {
    uint8_t broadcastMac[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
    
    // Add broadcast address as peer if not already added
    esp_now_peer_info_t peerInfo;
    memcpy(peerInfo.peer_addr, broadcastMac, 6);
    peerInfo.channel = WiFi.channel();
    peerInfo.encrypt = false;
    peerInfo.ifidx = WIFI_IF_STA;
    esp_now_add_peer(&peerInfo); // Ignore if already exists
    
    return sendMessage(broadcastMac, message);
}

bool Helper_ESPNOW::sendJSON(const uint8_t* targetMac, const JsonDocument& doc) {
    String jsonString;
    serializeJson(doc, jsonString);
    return sendMessage(targetMac, jsonString);
}

bool Helper_ESPNOW::sendJSON(const String& targetMacString, const JsonDocument& doc) {
    String jsonString;
    serializeJson(doc, jsonString);
    return sendMessage(targetMacString, jsonString);
}

bool Helper_ESPNOW::broadcastJSON(const JsonDocument& doc) {
    String jsonString;
    serializeJson(doc, jsonString);
    return broadcastMessage(jsonString);
}

// ==========================================
// ESP-NOW "ENDPOINTS" (similar to HTTP endpoints)
// ==========================================

void Helper_ESPNOW::handleDeviceInfoRequest(const uint8_t* requestorMac) {
    Serial.printf("[Helper_ESPNOW] 📱 Device info request from %s\n", macToString(requestorMac).c_str());
    
    // Create device info response
    StaticJsonDocument<512> response;
    response["type"] = "device_info_response";
    response["requestedBy"] = macToString(requestorMac);
    response["timestamp"] = millis();
    response["localMac"] = getLocalMacAddress();
    
    // Add basic device info (would be enhanced with actual device data)
    JsonObject deviceInfo = response.createNestedObject("deviceInfo");
    deviceInfo["deviceType"] = "JunctionRelay";
    deviceInfo["firmwareVersion"] = "1.0.0";
    deviceInfo["uptime"] = millis();
    deviceInfo["freeHeap"] = ESP.getFreeHeap();
    
    sendJSON(requestorMac, response);
}

void Helper_ESPNOW::handlePeerDiscoveryRequest(const uint8_t* requestorMac) {
    Serial.printf("[Helper_ESPNOW] 🔍 Peer discovery request from %s\n", macToString(requestorMac).c_str());
    
    sendPeerListResponse(requestorMac);
}

void Helper_ESPNOW::handleStatsRequest(const uint8_t* requestorMac) {
    Serial.printf("[Helper_ESPNOW] 📊 Stats request from %s\n", macToString(requestorMac).c_str());
    
    String statsJSON = getStatisticsJSON();
    sendStatsResponse(requestorMac, statsJSON);
}

void Helper_ESPNOW::handleCapabilitiesRequest(const uint8_t* requestorMac) {
    Serial.printf("[Helper_ESPNOW] 🔧 Capabilities request from %s\n", macToString(requestorMac).c_str());
    
    // Create capabilities response
    StaticJsonDocument<512> response;
    response["type"] = "capabilities_response";
    response["requestedBy"] = macToString(requestorMac);
    response["timestamp"] = millis();
    
    // Add basic capabilities (would be enhanced with actual device capabilities)
    JsonObject capabilities = response.createNestedObject("capabilities");
    capabilities["espnow"] = true;
    capabilities["wifi"] = true;
    capabilities["screens"] = true;
    capabilities["sensors"] = true;
    
    sendJSON(requestorMac, response);
}

// ==========================================
// RESPONSE METHODS
// ==========================================

void Helper_ESPNOW::sendDeviceInfoResponse(const uint8_t* targetMac, const String& deviceInfoJSON) {
    StaticJsonDocument<1024> response;
    response["type"] = "device_info_response";
    response["timestamp"] = millis();
    
    // Parse and embed the device info
    DynamicJsonDocument deviceDoc(1024);
    deserializeJson(deviceDoc, deviceInfoJSON);
    response["deviceInfo"] = deviceDoc.as<JsonObject>();
    
    sendJSON(targetMac, response);
}

void Helper_ESPNOW::sendPeerListResponse(const uint8_t* targetMac) {
    StaticJsonDocument<1024> response;
    response["type"] = "peer_list_response";
    response["timestamp"] = millis();
    response["localMac"] = getLocalMacAddress();
    
    JsonArray peersArray = response.createNestedArray("peers");
    for (const auto& peer : peers) {
        JsonObject peerObj = peersArray.createNestedObject();
        peerObj["mac"] = macToString(peer.macAddress);
        peerObj["name"] = peer.name;
        peerObj["active"] = peer.isActive;
        peerObj["lastSeen"] = peer.lastSeen;
        peerObj["rssi"] = peer.rssi;
    }
    
    response["peerCount"] = peers.size();
    
    sendJSON(targetMac, response);
}

void Helper_ESPNOW::sendStatsResponse(const uint8_t* targetMac, const String& statsJSON) {
    StaticJsonDocument<1024> response;
    response["type"] = "stats_response";
    response["timestamp"] = millis();
    
    // Parse and embed the stats
    DynamicJsonDocument statsDoc(1024);
    deserializeJson(statsDoc, statsJSON);
    response["stats"] = statsDoc.as<JsonObject>();
    
    sendJSON(targetMac, response);
}

void Helper_ESPNOW::sendCapabilitiesResponse(const uint8_t* targetMac, const String& capabilitiesJSON) {
    StaticJsonDocument<1024> response;
    response["type"] = "capabilities_response";
    response["timestamp"] = millis();
    
    // Parse and embed the capabilities
    DynamicJsonDocument capabilitiesDoc(1024);
    deserializeJson(capabilitiesDoc, capabilitiesJSON);
    response["capabilities"] = capabilitiesDoc.as<JsonObject>();
    
    sendJSON(targetMac, response);
}

void Helper_ESPNOW::sendErrorResponse(const uint8_t* targetMac, const String& error, const String& requestType) {
    StaticJsonDocument<256> response;
    response["type"] = "error_response";
    response["error"] = error;
    response["requestType"] = requestType;
    response["timestamp"] = millis();
    
    sendJSON(targetMac, response);
}

// ==========================================
// DATA HANDLING
// ==========================================

void Helper_ESPNOW::handleDataReceived(const uint8_t* mac, const uint8_t* data, int len) {
    if (!isReceiveMode) return;
    
    messagesReceived++;
    
    // Convert data to string
    String message = "";
    for (int i = 0; i < len; i++) {
        message += (char)data[i];
    }
    
    // Update peer activity
    updatePeerActivity(mac);
    
    // Add to message history
    addToMessageHistory(mac, message);
    
    // Forward to StreamProcessor for parsing and routing
    if (streamProcessor) {
        streamProcessor->processData((uint8_t*)message.c_str(), message.length());
    }
}

void Helper_ESPNOW::handleDataSent(const uint8_t* mac, esp_now_send_status_t status) {
    if (status == ESP_NOW_SEND_SUCCESS) {
        messagesSent++;
    } else {
        sendErrors++;
        Serial.printf("[Helper_ESPNOW] ❌ Send failed to %s\n", macToString(mac).c_str());
    }
}

// ==========================================
// UTILITY METHODS
// ==========================================

String Helper_ESPNOW::macToString(const uint8_t* mac) {
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    return String(macStr);
}

void Helper_ESPNOW::updatePeerActivity(const uint8_t* mac, int rssi) {
    for (auto& peer : peers) {
        if (memcmp(peer.macAddress, mac, 6) == 0) {
            peer.lastSeen = millis();
            peer.isActive = true;
            if (rssi != 0) peer.rssi = rssi;
            return;
        }
    }
    
    // Auto-add unknown peers
    String unknownName = "Unknown_" + macToString(mac).substring(12); // Use last 2 bytes
    addPeerInternal(mac, unknownName);
}

void Helper_ESPNOW::cleanupInactivePeers() {
    unsigned long now = millis();
    for (auto it = peers.begin(); it != peers.end();) {
        if (now - it->lastSeen > PEER_TIMEOUT_MS) {
            Serial.printf("[Helper_ESPNOW] Removing inactive peer %s\n", macToString(it->macAddress).c_str());
            esp_now_del_peer(it->macAddress);
            it = peers.erase(it);
        } else {
            ++it;
        }
    }
}

void Helper_ESPNOW::addToMessageHistory(const uint8_t* senderMac, const String& data, int rssi) {
    if (messageHistory.size() >= MAX_MESSAGE_HISTORY) {
        messageHistory.erase(messageHistory.begin());
    }
    messageHistory.emplace_back(senderMac, data, rssi);
}

std::vector<ESPNowMessage> Helper_ESPNOW::getMessageHistory(int limit) {
    if (limit < 0 || limit > (int)messageHistory.size()) {
        return messageHistory;
    }
    
    std::vector<ESPNowMessage> result;
    int start = messageHistory.size() - limit;
    for (int i = start; i < (int)messageHistory.size(); i++) {
        result.push_back(messageHistory[i]);
    }
    return result;
}

void Helper_ESPNOW::clearMessageHistory() {
    messageHistory.clear();
    Serial.println("[Helper_ESPNOW] ✅ Message history cleared");
}

String Helper_ESPNOW::getStatisticsJSON() {
    StaticJsonDocument<512> doc;
    
    doc["initialized"] = initialized;
    doc["receiveMode"] = isReceiveMode;
    doc["sendMode"] = isSendMode;
    doc["peerCount"] = peers.size();
    doc["maxPeers"] = MAX_PEERS;
    doc["messageHistoryCount"] = messageHistory.size();
    doc["maxMessageHistory"] = MAX_MESSAGE_HISTORY;
    
    JsonObject stats = doc.createNestedObject("statistics");
    stats["messagesSent"] = messagesSent;
    stats["messagesReceived"] = messagesReceived;
    stats["sendErrors"] = sendErrors;
    stats["receiveErrors"] = receiveErrors;
    
    JsonObject network = doc.createNestedObject("network");
    network["localMac"] = getLocalMacAddress();
    network["channel"] = WiFi.channel();
    network["wifiMode"] = "STA";
    
    String output;
    serializeJson(doc, output);
    return output;
}

String Helper_ESPNOW::getStatusJSON() {
    StaticJsonDocument<1024> doc;
    
    doc["status"] = initialized ? "active" : "inactive";
    doc["localMac"] = getLocalMacAddress();
    doc["channel"] = WiFi.channel();
    doc["receiveMode"] = isReceiveMode;
    doc["sendMode"] = isSendMode;
    
    JsonArray peersArray = doc.createNestedArray("peers");
    for (const auto& peer : peers) {
        JsonObject peerObj = peersArray.createNestedObject();
        peerObj["mac"] = macToString(peer.macAddress);
        peerObj["name"] = peer.name;
        peerObj["active"] = peer.isActive;
        peerObj["lastSeen"] = peer.lastSeen;
        peerObj["rssi"] = peer.rssi;
    }
    
    JsonArray recentMessages = doc.createNestedArray("recentMessages");
    auto recent = getMessageHistory(5); // Last 5 messages
    for (const auto& msg : recent) {
        JsonObject msgObj = recentMessages.createNestedObject();
        msgObj["from"] = macToString(msg.senderMac);
        msgObj["data"] = msg.data.substring(0, 50); // Truncate for display
        msgObj["timestamp"] = msg.timestamp;
        msgObj["rssi"] = msg.rssi;
    }
    
    String output;
    serializeJson(doc, output);
    return output;
}

void Helper_ESPNOW::printStatistics() {
    Serial.println("\n[Helper_ESPNOW] === Statistics ===");
    Serial.printf("Status: %s\n", initialized ? "Active" : "Inactive");
    Serial.printf("Local MAC: %s\n", getLocalMacAddress().c_str());
    Serial.printf("Channel: %d\n", WiFi.channel());
    Serial.printf("Peers: %d/%d\n", peers.size(), MAX_PEERS);
    Serial.printf("Messages Sent: %lu\n", messagesSent);
    Serial.printf("Messages Received: %lu\n", messagesReceived);
    Serial.printf("Send Errors: %lu\n", sendErrors);
    Serial.printf("Receive Errors: %lu\n", receiveErrors);
    Serial.printf("Message History: %d/%d\n", messageHistory.size(), MAX_MESSAGE_HISTORY);
    Serial.println("=======================\n");
}

String Helper_ESPNOW::getLocalMacAddress() {
    uint8_t mac[6];
    esp_wifi_get_mac(WIFI_IF_STA, mac);
    return macToString(mac);
}

bool Helper_ESPNOW::isValidMacString(const String& macString) {
    if (macString.length() != 17) return false;
    
    for (int i = 0; i < 17; i++) {
        if (i % 3 == 2) {
            if (macString.charAt(i) != ':') return false;
        } else {
            char c = macString.charAt(i);
            if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f'))) {
                return false;
            }
        }
    }
    return true;
}

void Helper_ESPNOW::parseMacString(const String& macString, uint8_t* macArray) {
    for (int i = 0; i < 6; i++) {
        String byteString = macString.substring(i * 3, i * 3 + 2);
        macArray[i] = strtol(byteString.c_str(), NULL, 16);
    }
}