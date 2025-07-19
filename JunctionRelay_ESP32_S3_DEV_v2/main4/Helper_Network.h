#ifndef HELPER_NETWORK_H
#define HELPER_NETWORK_H

#include <WiFi.h>
#include <functional>

class ConnectionManager; // Forward declaration

class Helper_Network {
public:
    Helper_Network(ConnectionManager* manager);
    ~Helper_Network();

    // WiFi management
    void setupWiFiPrimary();
    void setupWiFiBackup();
    void connectWiFi(const String& ssid, const String& password);
    void disconnectWiFi();
    
    // Network status
    bool isWiFiConnected() const { return WiFi.status() == WL_CONNECTED; }
    bool isEthernetConnected() const;
    bool isAnyNetworkAvailable() const;
    String getActiveNetworkType() const;
    String getActiveIP() const;
    String getActiveMAC() const;
    
    // Network monitoring
    void startNetworkMonitoringTask();
    void startMDNSTask();
    
    // Callbacks
    using NetworkEventCallback = std::function<void(const String& networkType, bool connected)>;
    void setNetworkEventCallback(NetworkEventCallback callback) { networkEventCallback = callback; }

private:
    ConnectionManager* connectionManager;
    NetworkEventCallback networkEventCallback;
    
    // Task handles
    TaskHandle_t wifiTaskHandle;
    TaskHandle_t networkMonitorTaskHandle;
    TaskHandle_t mdnsTaskHandle;
    
    // Helper methods
    void setupMDNS(const String& networkType);
    void checkNetworkChanges();
    
    // Static task functions
    static void wifiPrimaryTask(void* parameter);
    static void wifiBackupTask(void* parameter);
    static void networkMonitoringTask(void* parameter);
    static void mdnsTask(void* parameter);
};

#endif // HELPER_NETWORK_H