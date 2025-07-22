#include "Manager_Connections.h"
#include "Branch_UsbDirect.h"
#include "Branch_Wifi.h"
#include "Helper_Preferences.h"
#include "Helper_DeviceInfo.h"
#include "Helper_DeviceCapabilities.h"
#include "ScreenRouter.h"
#include "DeviceConfig.h"
#include "Device.h"

Manager_Connections::Manager_Connections() 
    : connMode(""),
      screenRouter(nullptr),
      preferences(nullptr),
      devicePtr(nullptr),
      inventory(nullptr),
      deviceInfo(nullptr),
      deviceCapabilities(nullptr),
      usbDirectBranch(nullptr),
      wifiBranch(nullptr)
{
    // Serial.println("[Manager_Connections] Constructor called");
}

Manager_Connections::~Manager_Connections() {
    if (usbDirectBranch) {
        delete usbDirectBranch;
        usbDirectBranch = nullptr;
    }
    if (wifiBranch) {
        delete wifiBranch;
        wifiBranch = nullptr;
    }
    
    cleanupHelpers();
    
    Serial.println("[Manager_Connections] Destructor called");
}

ConnectionStatus Manager_Connections::getConnectionStatus() const {
    ConnectionStatus status;
    
    if (connMode == "usb_direct") {
        status.usbActive = (usbDirectBranch && usbDirectBranch->isActive());
    } 
    else if (connMode == "wifi") {
        if (wifiBranch) {
            status.wifiConnected = wifiBranch->isWiFiConnected();
            if (status.wifiConnected) {
                status.ipAddress = wifiBranch->getIPAddress();
                status.macAddress = wifiBranch->getMacAddress();
                status.activeNetworkType = "WiFi";
            }
            // Would need to get MQTT and WebSocket status from branch
            // status.mqttConnected = wifiBranch->isMQTTConnected();
            // status.webSocketConnected = wifiBranch->isWebSocketConnected();
        }
    } 
    else if (connMode == "gateway_usb") {
        status.usbActive = true; // Would check gateway USB branch when implemented
    }
    
    // Add other status updates based on connection mode as branches are implemented
    
    return status;
}

void Manager_Connections::setConnMode(const String& mode) {
    connMode = mode;
    Serial.print("[Manager_Connections] connMode set to: ");
    Serial.println(connMode);
}

void Manager_Connections::init() {
    // Serial.println("[Manager_Connections] Initializing connection mode...");
    
    if (!screenRouter) {
        Serial.println("[Manager_Connections] ERROR: ScreenRouter not set! Call setScreenRouter() first.");
        return;
    }
    
    if (!preferences) {
        Serial.println("[Manager_Connections] ERROR: Preferences not set! Call setPreferences() first.");
        return;
    }
    
    if (!devicePtr) {
        Serial.println("[Manager_Connections] ERROR: Device not set! Call setDevice() first.");
        return;
    }
    
    if (!inventory) {
        Serial.println("[Manager_Connections] ERROR: Inventory not set! Call setInventory() first.");
        return;
    }
    
    // Initialize helper instances once
    initializeHelpers();
    
    if (connMode == "wifi") {
        branchWifi();
    }
    else if (connMode == "usb_direct") {
        branchUsbDirect();
    }
    else if (connMode == "ethernet") {
        branchEthernet();
    }
    else if (connMode == "espnow") {
        branchEspNow();
    }
    else if (connMode == "gateway_wifi") {
        branchGatewayWifi();
    }
    else if (connMode == "gateway_eth") {
        branchGatewayEthernet();
    }
    else if (connMode == "gateway_usb") {
        branchGatewayUsb();
    }
    else {
        Serial.print("[Manager_Connections] ERROR: Unknown connMode: ");
        Serial.println(connMode);
    }
}

void Manager_Connections::loop() {
    // Delegate to active branch
    if (connMode == "usb_direct" && usbDirectBranch) {
        usbDirectBranch->loop();
    }
    else if (connMode == "wifi" && wifiBranch) {
        wifiBranch->loop();
    }
    
    // Add other connection mode loop handling here as branches are implemented
}

// ==========================================
// HELPER MANAGEMENT
// ==========================================

void Manager_Connections::initializeHelpers() {
    // Serial.println("[Manager_Connections] Initializing helper instances...");
    
    // Create device info helper with inventory
    deviceInfo = new Helper_DeviceInfo();
    deviceInfo->init(devicePtr, inventory);
    
    // Create device capabilities helper with inventory
    deviceCapabilities = new Helper_DeviceCapabilities();
    deviceCapabilities->init(devicePtr, inventory);
    
    Serial.println("[Manager_Connections] ✅ Helper instances created and initialized with inventory");
}

void Manager_Connections::cleanupHelpers() {
    if (deviceInfo) {
        delete deviceInfo;
        deviceInfo = nullptr;
    }
    
    if (deviceCapabilities) {
        delete deviceCapabilities;
        deviceCapabilities = nullptr;
    }
    
    Serial.println("[Manager_Connections] Helper instances cleaned up");
}

// ==========================================
// IMPLEMENTED BRANCHES
// ==========================================

void Manager_Connections::branchUsbDirect() {
    Serial.println("[Manager_Connections] Initializing USB Direct branch...");
    
    // Create and initialize USB Direct branch with device pointer and helpers
    usbDirectBranch = new Branch_UsbDirect();
    usbDirectBranch->init(screenRouter, devicePtr, deviceInfo, deviceCapabilities);
    
    Serial.println("[Manager_Connections] ✅ USB Direct branch initialized");
}

void Manager_Connections::branchWifi() {
    Serial.println("[Manager_Connections] Initializing WiFi branch...");
    
    // Create and initialize WiFi branch with preferences, device pointer, and helpers
    wifiBranch = new Branch_Wifi();
    wifiBranch->init(screenRouter, preferences, devicePtr, deviceInfo, deviceCapabilities);
    
    Serial.println("[Manager_Connections] ✅ WiFi branch initialized");
}

// ==========================================
// STUB IMPLEMENTATIONS FOR UNIMPLEMENTED BRANCHES
// ==========================================

void Manager_Connections::branchEthernet() {
    Serial.println("[Manager_Connections] branchEthernet - NOT IMPLEMENTED");
    Serial.println("[Manager_Connections] Would initialize Ethernet + HTTP/WS/MQTT protocols");
    Serial.println("[Manager_Connections] Will use same Helper_HTTPEndpoints as WiFi branch");
}

void Manager_Connections::branchEspNow() {
    Serial.println("[Manager_Connections] branchEspNow - NOT IMPLEMENTED");
    Serial.println("[Manager_Connections] Would initialize ESP-NOW only mode");
}

void Manager_Connections::branchGatewayWifi() {
    Serial.println("[Manager_Connections] branchGatewayWifi - NOT IMPLEMENTED");
    Serial.println("[Manager_Connections] Would initialize WiFi + ESP-NOW gateway mode");
    Serial.println("[Manager_Connections] Will use Helper_HTTPEndpoints + ESP-NOW helper");
}

void Manager_Connections::branchGatewayEthernet() {
    Serial.println("[Manager_Connections] branchGatewayEthernet - NOT IMPLEMENTED");
    Serial.println("[Manager_Connections] Would initialize Ethernet + ESP-NOW gateway mode");
    Serial.println("[Manager_Connections] Will use Helper_HTTPEndpoints + ESP-NOW helper");
}

void Manager_Connections::branchGatewayUsb() {
    Serial.println("[Manager_Connections] branchGatewayUsb - NOT IMPLEMENTED");
    Serial.println("[Manager_Connections] Would initialize USB CDC + ESP-NOW gateway mode");
}