#ifndef DISPLAY_MANAGER_NATIVE_H
#define DISPLAY_MANAGER_NATIVE_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include "DeviceConfig.h"
#include "Manager_Connections.h"
#include "Interface_ScreenDestination.h"

class Display_Manager_Native : public ScreenDestination {
public:
    Display_Manager_Native(DeviceConfig* device);
    ~Display_Manager_Native();
    
    // Initialize hardware and display
    bool init();
    
    // Check if display is ready
    bool isReady() const { return initialized; }
    
    // Set connection manager
    void setConnectionManager(Manager_Connections* connMgr) { connectionManager = connMgr; }
    Manager_Connections* getConnectionManager() const { return connectionManager; }
    
    // Interface methods
    DeviceConfig* getDevice() const { return device; }
    
    // ScreenDestination interface implementation
    String getScreenId() const override;
    void applyConfig(const JsonDocument& configDoc) override;
    void updateSensorData(const JsonDocument& sensorDoc) override;
    bool matchesScreenId(const String& screenId, const JsonDocument& doc) const override;
    const char* getConfigKey() const override;
    
    // Status updates
    void updateStatusLabel(const String& status);
    void createHomeScreen();
    void showHomeScreen();

private:
    DeviceConfig* device;
    Manager_Connections* connectionManager;
    void* displayPtr;  // Generic display pointer
    bool initialized;
    String lastStatus;
    
    // Device-specific rendering methods
    bool renderWithLGFX();
    bool renderGeneric();
    
    // Helper methods for drawing
    void drawTitle(void* display);
    void drawDeviceInfo(void* display);
    void drawNetworkStatus(void* display);
    void drawSystemInfo(void* display);
    
    // Helper methods for connection status display
    String getConnectionModeName() const;
    uint16_t getConnectionStatusColor() const;
    String getStatusText() const;
    uint16_t getMqttStatusColor() const;
};

#endif // DISPLAY_MANAGER_NATIVE_H