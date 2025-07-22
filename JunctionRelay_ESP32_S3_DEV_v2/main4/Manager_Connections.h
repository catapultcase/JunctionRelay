#ifndef MANAGER_CONNECTIONS_H
#define MANAGER_CONNECTIONS_H

#include <Arduino.h>

// Forward declarations
class ScreenRouter;
class Helper_Preferences;
class Helper_DeviceInfo;
class Helper_DeviceCapabilities;
class Branch_UsbDirect;
class Branch_Wifi;
class DeviceConfig;
struct HardwareInventory;

struct ConnectionStatus {
    bool usbActive = false;
    bool wifiConnected = false;
    bool ethernetConnected = false;
    bool mqttConnected = false;
    bool webSocketConnected = false;
    bool espNowActive = false;
    String ipAddress = "";
    String macAddress = "";
    String activeNetworkType = "None";
    String backendServerIP = "";
    String ethernetIP = "";
    String ethernetMAC = "";
};

class Manager_Connections {
public:
    Manager_Connections();
    ~Manager_Connections();

    // Configuration setters
    void setConnMode(const String& mode);
    void setScreenRouter(ScreenRouter* router) { screenRouter = router; }
    void setPreferences(Helper_Preferences* prefs) { preferences = prefs; }
    void setDevice(DeviceConfig* device) { devicePtr = device; }
    void setInventory(HardwareInventory* inv) { inventory = inv; }

    // Initialize based on connection mode
    void init();

    // Periodic processing - call from main loop
    void loop();

    // Get connection status
    ConnectionStatus getConnectionStatus() const;

private:
    String connMode;
    ScreenRouter* screenRouter;
    Helper_Preferences* preferences;
    DeviceConfig* devicePtr;
    HardwareInventory* inventory;

    // Helper instances (created once, injected into branches)
    Helper_DeviceInfo* deviceInfo;
    Helper_DeviceCapabilities* deviceCapabilities;

    // Connection branches
    Branch_UsbDirect* usbDirectBranch;
    Branch_Wifi* wifiBranch;

    // Branch initialization methods
    void branchUsbDirect();
    void branchWifi();
    void branchEthernet();
    void branchEspNow();
    void branchGatewayWifi();
    void branchGatewayEthernet();
    void branchGatewayUsb();

    // Helper management
    void initializeHelpers();
    void cleanupHelpers();
};

#endif // MANAGER_CONNECTIONS_H