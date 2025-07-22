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
class Manager_Matrix;  // Add Matrix forward declaration
class Manager_Connections;  // Add Manager_Connections forward declaration
class ScreenRouter;
class DeviceConfig;

class Helper_StartupScheduler {
public:
    // Singleton pattern
    static Helper_StartupScheduler* getInstance();
    
    // Main initialization method
    void initializeFromInventory(const HardwareInventory& inventory, ScreenRouter* screenRouter, DeviceConfig* device = nullptr);
    
    // NEW: Method to set connection manager after it's created
    void setConnectionManager(Manager_Connections* connMgr);
    
    // Get created manager instances (for registration with other systems)
    Manager_NeoPixels* getNeoPixelManager() const { return neoPixelManager; }
    Manager_QuadDisplay* getQuadDisplayManager() const { return quadDisplayManager; }
    Manager_Charlieplex* getCharliplexManager() const { return charliplexManager; }
    Manager_Matrix* getMatrixManager() const { return matrixManager; }  // Add Matrix getter
    
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
    Manager_Matrix* matrixManager;  // Add Matrix manager instance
    ScreenRouter* screenRouter;
    DeviceConfig* devicePtr;  // Store device pointer for matrix pin access
    
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
    void setupMatrixManager();  // Add Matrix setup method
    void startNeoPixelTasks();
    void startQuadDisplayTasks();
    void startCharliplexTasks();
    void startMatrixTasks();  // Add Matrix task start method
    
    // Helper methods
    void logInventory(const HardwareInventory& inventory);
    void addDelay(int ms);
};

#endif // HELPER_STARTUP_SCHEDULER_H