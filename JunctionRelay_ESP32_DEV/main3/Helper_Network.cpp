#include "Helper_Network.h"
#include "ConnectionManager.h"
#include "Utils.h"
#include <ESPmDNS.h>

Helper_Network::Helper_Network(ConnectionManager* manager)
    : connectionManager(manager),
      wifiTaskHandle(nullptr),
      networkMonitorTaskHandle(nullptr),
      mdnsTaskHandle(nullptr)
{
}

Helper_Network::~Helper_Network() {
    // Clean up tasks
    if (wifiTaskHandle) {
        vTaskDelete(wifiTaskHandle);
        wifiTaskHandle = nullptr;
    }
    if (networkMonitorTaskHandle) {
        vTaskDelete(networkMonitorTaskHandle);
        networkMonitorTaskHandle = nullptr;
    }
    if (mdnsTaskHandle) {
        vTaskDelete(mdnsTaskHandle);
        mdnsTaskHandle = nullptr;
    }
}

void Helper_Network::setupWiFiPrimary() {
    Serial.println("[Network] Setting up WiFi as primary connection");
    WiFi.mode(WIFI_STA);
    
    xTaskCreatePinnedToCore(
        wifiPrimaryTask,
        "WiFiPrimaryTask",
        4096,
        this,
        1,
        &wifiTaskHandle,
        1
    );
}

void Helper_Network::setupWiFiBackup() {
    Serial.println("[Network] Setting up WiFi as backup connection");
    
    xTaskCreatePinnedToCore(
        wifiBackupTask,
        "WiFiBackupTask",
        4096,
        this,
        1,
        &wifiTaskHandle,
        1
    );
}

void Helper_Network::connectWiFi(const String& ssid, const String& password) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), password.c_str());
    
    Serial.printf("[Network] Connecting to WiFi: %s\n", ssid.c_str());
}

void Helper_Network::disconnectWiFi() {
    WiFi.disconnect();
    Serial.println("[Network] WiFi disconnected");
}

bool Helper_Network::isEthernetConnected() const {
    if (connectionManager && connectionManager->getDevice()) {
        return connectionManager->getDevice()->supportsEthernet() && 
               connectionManager->getDevice()->isEthernetConnected();
    }
    return false;
}

bool Helper_Network::isAnyNetworkAvailable() const {
    return isWiFiConnected() || isEthernetConnected();
}

String Helper_Network::getActiveNetworkType() const {
    if (isEthernetConnected()) {
        return "Ethernet";
    } else if (isWiFiConnected()) {
        return "WiFi";
    }
    return "None";
}

String Helper_Network::getActiveIP() const {
    if (isEthernetConnected() && connectionManager && connectionManager->getDevice()) {
        return connectionManager->getDevice()->getEthernetIP().toString();
    } else if (isWiFiConnected()) {
        return WiFi.localIP().toString();
    }
    return "";
}

String Helper_Network::getActiveMAC() const {
    if (isEthernetConnected() && connectionManager && connectionManager->getDevice()) {
        return connectionManager->getDevice()->getEthernetMAC();
    } else {
        return getFormattedMacAddress(); // WiFi MAC
    }
}

void Helper_Network::startNetworkMonitoringTask() {
    xTaskCreatePinnedToCore(
        networkMonitoringTask,
        "NetworkMonitorTask",
        2048,
        this,
        1,
        &networkMonitorTaskHandle,
        1
    );
}

void Helper_Network::startMDNSTask() {
    xTaskCreatePinnedToCore(
        mdnsTask,
        "mDNSTask",
        2048,
        this,
        1,
        &mdnsTaskHandle,
        1
    );
}

void Helper_Network::setupMDNS(const String& networkType) {
    String mac = getFormattedMacAddress();
    String host = "JunctionRelay_Device_" + mac;
    
    if (MDNS.begin(host.c_str())) {
        MDNS.addService("junctionrelay", "tcp", 80);
        Serial.printf("[mDNS] ✅ Started with hostname: %s (%s)\n", host.c_str(), networkType.c_str());
    } else {
        Serial.printf("[mDNS] ❌ Failed to start for %s connection\n", networkType.c_str());
    }
}

void Helper_Network::checkNetworkChanges() {
    static String lastNetworkType = "";
    static bool lastConnectedState = false;
    
    String currentNetworkType = getActiveNetworkType();
    bool currentConnectedState = isAnyNetworkAvailable();
    
    if (currentNetworkType != lastNetworkType || currentConnectedState != lastConnectedState) {
        Serial.printf("[Network] Network change detected: %s -> %s (connected: %s)\n",
                     lastNetworkType.c_str(), currentNetworkType.c_str(),
                     currentConnectedState ? "yes" : "no");
        
        if (networkEventCallback) {
            networkEventCallback(currentNetworkType, currentConnectedState);
        }
        
        lastNetworkType = currentNetworkType;
        lastConnectedState = currentConnectedState;
    }
}

// Static task implementations
void Helper_Network::wifiPrimaryTask(void* parameter) {
    Helper_Network* network = static_cast<Helper_Network*>(parameter);
    ConnectionManager* cm = network->connectionManager;
    
    for (;;) {
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[WiFi-Primary] Connecting...");
            WiFi.begin(cm->ssid.c_str(), cm->pass.c_str());

            uint32_t start = millis();
            while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
                vTaskDelay(500 / portTICK_PERIOD_MS);
            }

            if (WiFi.status() == WL_CONNECTED) {
                Serial.printf("[WiFi-Primary] ✅ Connected, IP: %s\n", WiFi.localIP().toString().c_str());
                
                if (network->networkEventCallback) {
                    network->networkEventCallback("WiFi", true);
                }
            } else {
                Serial.println("[WiFi-Primary] ❌ Failed to connect");
                if (network->networkEventCallback) {
                    network->networkEventCallback("WiFi", false);
                }
            }
        }
        vTaskDelay(5000 / portTICK_PERIOD_MS);
    }
}

void Helper_Network::wifiBackupTask(void* parameter) {
    Helper_Network* network = static_cast<Helper_Network*>(parameter);
    ConnectionManager* cm = network->connectionManager;
    
    for (;;) {
        // Only try WiFi if primary network (Ethernet) is not available
        bool primaryAvailable = false;
        
        if (cm->getConnMode() == "ethernet" || cm->getConnMode() == "gateway") {
            primaryAvailable = network->isEthernetConnected();
        }
        
        if (!primaryAvailable && WiFi.status() != WL_CONNECTED) {
            Serial.println("[WiFi-Backup] Primary network down, connecting to WiFi backup...");
            WiFi.mode(WIFI_STA);
            WiFi.begin(cm->ssid.c_str(), cm->pass.c_str());

            uint32_t start = millis();
            while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
                vTaskDelay(500 / portTICK_PERIOD_MS);
            }

            if (WiFi.status() == WL_CONNECTED) {
                Serial.printf("[WiFi-Backup] ✅ Backup WiFi connected, IP: %s\n", 
                            WiFi.localIP().toString().c_str());
                if (network->networkEventCallback) {
                    network->networkEventCallback("WiFi-Backup", true);
                }
            }
        } else if (primaryAvailable && WiFi.status() == WL_CONNECTED) {
            Serial.println("[WiFi-Backup] Primary network restored, disconnecting backup WiFi");
            WiFi.disconnect();
            if (network->networkEventCallback) {
                network->networkEventCallback("Ethernet", true);
            }
        }
        
        vTaskDelay(10000 / portTICK_PERIOD_MS);  // Check every 10 seconds
    }
}

void Helper_Network::networkMonitoringTask(void* parameter) {
    Helper_Network* network = static_cast<Helper_Network*>(parameter);
    
    for (;;) {
        network->checkNetworkChanges();
        vTaskDelay(2000 / portTICK_PERIOD_MS);  // Check every 2 seconds
    }
}

void Helper_Network::mdnsTask(void* parameter) {
    Helper_Network* network = static_cast<Helper_Network*>(parameter);
    bool mdnsInitialized = false;
    
    for (;;) {
        bool networkUp = network->isAnyNetworkAvailable();
        String networkType = network->getActiveNetworkType();
        
        // Initialize mDNS when network comes up
        if (networkUp && !mdnsInitialized) {
            Serial.printf("[mDNS] Setting up mDNS for %s connection...\n", networkType.c_str());
            network->setupMDNS(networkType);
            mdnsInitialized = true;
        }
        // Reset mDNS flag if network goes down
        else if (!networkUp && mdnsInitialized) {
            Serial.println("[mDNS] Network down, will reinitialize mDNS when network returns");
            mdnsInitialized = false;
        }
        
        vTaskDelay(5000 / portTICK_PERIOD_MS);  // Check every 5 seconds
    }
}