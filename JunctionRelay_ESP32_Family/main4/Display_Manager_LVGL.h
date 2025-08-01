#ifndef DISPLAY_MANAGER_LVGL_H
#define DISPLAY_MANAGER_LVGL_H

#include <Arduino.h>
#include <lvgl.h>
#include "DeviceConfig.h"
#include "Device.h"  // Need concrete device type for casting
#include "Layout_DefaultHomeScreen.h"  // NEW: Include the layout class

// Forward declaration to avoid circular dependency
class Layout_DefaultHomeScreen;

class Display_Manager_LVGL {
public:
    Display_Manager_LVGL(DeviceConfig* device);
    ~Display_Manager_LVGL();
    
    // Initialize device hardware, LVGL, and create Core 1 task
    bool init();
    
    // Create and show the home screen using external class
    void createHomeScreen();
    
    // Check if LVGL is ready
    bool isReady() const { return lvglInitialized; }
    
    // NEW: Interface methods for Layout_DefaultHomeScreen compatibility
    DeviceConfig* getDevice() const { return device; }
    
    // NEW: Set connection manager for layouts to access connectivity data
    void setConnectionManager(Manager_Connections* connMgr) { connectionManager = connMgr; }
    Manager_Connections* getConnectionManager() const { return connectionManager; }

private:
    DeviceConfig* device;
    Manager_Connections* connectionManager;  // NEW: Store connection manager reference
    bool lvglInitialized;
    
    // LVGL task handle
    TaskHandle_t lvglTaskHandle;
    
    // LVGL task function (static)
    static void lvglTaskFunction(void* parameter);
    
    // NEW: Use layout class instead of hardcoded screen
    Layout_DefaultHomeScreen* homeLayout;
    
    // REMOVED: These are now handled by Layout_DefaultHomeScreen
    // lv_obj_t* homeScreen;
    // lv_obj_t* titleLabel;
    // lv_obj_t* statusLabel;
    // void buildHomeScreenUI();
};

#endif // DISPLAY_MANAGER_LVGL_H