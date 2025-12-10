#ifndef DISPLAY_MANAGER_LVGL_H
#define DISPLAY_MANAGER_LVGL_H

#include <Arduino.h>
#include <lvgl.h>
#include <ArduinoJson.h>
#include "DeviceConfig.h"
#include "Manager_Connections.h"
#include "Interface_ScreenDestination.h"
#include "Interface_ScreenLayout_LVGL.h"

// Forward declarations to avoid circular dependencies
class Layout_DefaultHomeScreen;
class Layout_GridScreen;
class Layout_PlotterScreen;
class Layout_RadioScreen;
class Layout_RunScreen;

// Layout types enum
enum class LayoutType {
    NONE,
    HOME,
    GRID,
    PLOTTER,
    RADIO,
    RUN
};

const char* getLayoutTypeName(LayoutType type);

class Display_Manager_LVGL : public ScreenDestination {
public:
    Display_Manager_LVGL(DeviceConfig* device);
    ~Display_Manager_LVGL();
    
    // Initialize device hardware, LVGL, and create Core 1 task
    bool init();
    
    // Create and show the home screen using external class
    void createHomeScreen();
    
    // Check if LVGL is ready
    bool isReady() const { return lvglInitialized; }
    
    // Set connection manager for layouts to access connectivity data
    void setConnectionManager(Manager_Connections* connMgr) { connectionManager = connMgr; }
    Manager_Connections* getConnectionManager() const { return connectionManager; }
    
    // Interface methods for Layout compatibility
    DeviceConfig* getDevice() const { return device; }
    
    // ScreenDestination interface implementation
    String getScreenId() const override;
    void applyConfig(const JsonDocument& configDoc) override;
    void updateSensorData(const JsonDocument& sensorDoc) override;
    bool matchesScreenId(const String& screenId, const JsonDocument& doc) const override;
    const char* getConfigKey() const override;
    
    // Update only the status label on the home screen
    void updateStatusLabel(const String& status);
    
    // Memory debugging and safe recovery
    void printMemoryInfo();
    bool enterSafeMode();

private:
    DeviceConfig* device;
    Manager_Connections* connectionManager;
    bool lvglInitialized;
    
    // LVGL task handle
    TaskHandle_t lvglTaskHandle;
    
    // LVGL task function (static)
    static void lvglTaskFunction(void* parameter);
    
    // Layout management
    LayoutInterface* currentLayout;
    Layout_DefaultHomeScreen* homeLayout;
    Layout_GridScreen* gridLayout;
    Layout_PlotterScreen* plotterLayout;
    Layout_RadioScreen* radioLayout;
    Layout_RunScreen* runLayout;
    LayoutType currentLayoutType;
    
    // Layout switching and management
    bool switchToLayout(LayoutType newType, const JsonDocument& configDoc);
    LayoutInterface* getLayoutForType(LayoutType type);
    
    // State tracking
    String lastKnownStatus;
    bool isTransitioning;
    unsigned long transitionStartTime;
    static const unsigned long TRANSITION_TIMEOUT = 5000; // 5 seconds timeout
    
    // LVGL task processing
    void processLVGLTasks(int iterations, int delayMs);
    
    // Safe screen management
    lv_obj_t* createTransitionScreen();
    lv_obj_t* safeScreen;
};

#endif // DISPLAY_MANAGER_LVGL_H