#ifndef HELPER_STARTUP_SCHEDULER_H
#define HELPER_STARTUP_SCHEDULER_H

#include <Arduino.h>
#include <functional>
#include <vector>
#include "Device.h"  // Need full definitions for member variables

// Forward declarations
class Manager_NeoPixels;
class Manager_QuadDisplay;
class Manager_Charlieplex;
class Manager_Matrix;
class Manager_Connections;
class ScreenRouter;
class DeviceConfig;
class Display_Manager_LVGL;  // Add Display_Manager_LVGL forward declaration

class Helper_StartupScheduler {
public:
    // Singleton pattern
    static Helper_StartupScheduler* getInstance();
    
    // Main initialization method
    void initializeFromInventory(const HardwareInventory& inventory, ScreenRouter* screenRouter, DeviceConfig* device = nullptr);
    
    // Method to set connection manager after it's created
    void setManager_Connections(Manager_Connections* connMgr);
    
    // Get created manager instances (for registration with other systems)
    Manager_NeoPixels* getNeoPixelManager() const { return neoPixelManager; }
    Manager_QuadDisplay* getQuadDisplayManager() const { return quadDisplayManager; }
    Manager_Charlieplex* getCharliplexManager() const { return charliplexManager; }
    Manager_Matrix* getMatrixManager() const { return matrixManager; }
    Display_Manager_LVGL* getDisplayManager() const { return displayManager; }  // Add Display manager getter
    
    // Get initialization status
    bool isInitialized() const { return initialized; }
    
    // Cleanup
    static void cleanup();

private:
    // Private constructor for singleton
    Helper_StartupScheduler();
    static Helper_StartupScheduler* instance;
    
    // Manager instances created by this scheduler
    Manager_NeoPixels* neoPixelManager;
    Manager_QuadDisplay* quadDisplayManager;
    Manager_Charlieplex* charliplexManager;
    Manager_Matrix* matrixManager;
    Display_Manager_LVGL* displayManager;  // Add Display manager instance
    Manager_Connections* connectionManager;  // Store connection manager reference
    ScreenRouter* screenRouter;
    DeviceConfig* devicePtr;
    
    // State
    bool initialized;
    HardwareInventory detectedHardware;
    
    // Phase methods
    void createManagers(const HardwareInventory& inventory);
    void registerScreenDestinations();
    void startManagerTasks();
    
    // Individual manager setup methods
    void setupNeoPixelManager(const std::vector<NeoPixelInfo>& neoPixels);
    void setupQuadDisplayManager(const std::vector<I2CDeviceInfo>& i2cDevices);
    void setupCharliplexManager(const std::vector<I2CDeviceInfo>& i2cDevices);
    void setupMatrixManager();
    void setupDisplayManager();  // Add Display manager setup method
    void startNeoPixelTasks();
    void startQuadDisplayTasks();
    void startCharliplexTasks();
    void startMatrixTasks();
    void startDisplayTasks();  // Add Display task start method
    
    // Helper methods
    void logInventory(const HardwareInventory& inventory);
    void addDelay(int ms);
};

#endif // HELPER_STARTUP_SCHEDULER_H