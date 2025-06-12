#ifndef MANAGER_ESPNOW_H
#define MANAGER_ESPNOW_H

#include <esp_now.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <vector>

// Forward declaration
class ConnectionManager;

struct ESPNowPeer {
    uint8_t macAddress[6];
    String name;
    bool isActive;
    unsigned long lastSeen;
    int rssi;
    
    ESPNowPeer(const uint8_t* mac, const String& peerName = "") {
        memcpy(macAddress, mac, 6);
        name = peerName;
        isActive = true;
        lastSeen = millis();
        rssi = 0;
    }
};

struct ESPNowMessage {
    uint8_t senderMac[6];
    String data;
    unsigned long timestamp;
    int rssi;
    
    ESPNowMessage(const uint8_t* mac, const String& messageData, int signalStrength = 0) {
        memcpy(senderMac, mac, 6);
        data = messageData;
        timestamp = millis();
        rssi = signalStrength;
    }
};

class Manager_ESPNOW {
private:
    ConnectionManager* connectionManager;
    std::vector<ESPNowPeer> peers;
    std::vector<ESPNowMessage> messageHistory;
    bool initialized;
    bool isReceiveMode;
    bool isSendMode;
    
    // Statistics
    unsigned long messagesSent;
    unsigned long messagesReceived;
    unsigned long sendErrors;
    unsigned long receiveErrors;
    
    // Configuration
    static const size_t MAX_MESSAGE_HISTORY = 50;
    static const size_t MAX_PEERS = 20;
    static const unsigned long PEER_TIMEOUT_MS = 30000; // 30 seconds
    
    // Internal methods
    bool addPeerInternal(const uint8_t* mac, const String& name = "");
    void updatePeerActivity(const uint8_t* mac, int rssi = 0);
    void cleanupInactivePeers();
    void addToMessageHistory(const uint8_t* senderMac, const String& data, int rssi = 0);
    
public:
    Manager_ESPNOW(ConnectionManager* connMgr);
    ~Manager_ESPNOW();
    
    // Core functionality
    bool begin();
    void end();
    bool isInitialized() const { return initialized; }
    
    // Peer management
    bool addPeer(const uint8_t* macAddress, const String& name = "");
    bool addPeer(const String& macString, const String& name = "");
    bool removePeer(const uint8_t* macAddress);
    bool removePeer(const String& macString);
    void clearPeers();
    std::vector<ESPNowPeer> getPeers();
    String getPeersJSON();
    int getPeerCount() const { return peers.size(); }
    
    // Messaging
    bool sendMessage(const uint8_t* targetMac, const String& message);
    bool sendMessage(const String& targetMacString, const String& message);
    bool broadcastMessage(const String& message);
    bool sendJSON(const uint8_t* targetMac, const JsonDocument& doc);
    bool sendJSON(const String& targetMacString, const JsonDocument& doc);
    bool broadcastJSON(const JsonDocument& doc);
    
    // Message history
    std::vector<ESPNowMessage> getMessageHistory(int limit = -1);
    void clearMessageHistory();
    
    // Statistics and status
    String getStatisticsJSON();
    String getStatusJSON();
    void printStatistics();
    
    // Mode control
    void setReceiveMode(bool enabled) { isReceiveMode = enabled; }
    void setSendMode(bool enabled) { isSendMode = enabled; }
    bool getReceiveMode() const { return isReceiveMode; }
    bool getSendMode() const { return isSendMode; }
    
    // Utility
    String getLocalMacAddress();
    String macToString(const uint8_t* mac);
    static bool isValidMacString(const String& macString);
    static void parseMacString(const String& macString, uint8_t* macArray);
    
    // Callbacks (called by static ESP-NOW handlers)
    void handleDataReceived(const uint8_t* mac, const uint8_t* data, int len);
    void handleDataSent(const uint8_t* mac, esp_now_send_status_t status);
};

#endif // MANAGER_ESPNOW_H