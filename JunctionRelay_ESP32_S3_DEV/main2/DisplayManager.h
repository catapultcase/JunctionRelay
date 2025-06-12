#ifndef DISPLAY_MANAGER_H
#define DISPLAY_MANAGER_H

#include <lvgl.h>
#include <ArduinoJson.h>
#include <map>
#include <vector>

#include "DeviceConfig.h"
#include "ConnectionManager.h"
#include "ScreenDestination.h"
#include "LayoutInterface.h"
#include "Layout_RunScreen.h"

// Forward declarations
class Layout_DefaultHomeScreen;
class Layout_GridScreen;
class Layout_PlotterScreen;
class Layout_RadioScreen;
class Layout_AstroScreen;

// Layout types
enum class LayoutType {
    NONE,
    HOME,
    GRID,
    PLOTTER,
    RADIO,
    ASTRO,
    RUN
};

const char* getLayoutTypeName(LayoutType type);

class DisplayManager : public ScreenDestination {
public:
    DisplayManager(DeviceConfig* device, ConnectionManager& connManager);
    ~DisplayManager();
    void init();

    // Show home screen
    void createHomeScreen();

    // Update only the status label on the home screen
    void updateStatusLabel(const String& status);

    // ScreenDestination interface
    String getScreenId() const override;
    void applyConfig(const JsonDocument &configDoc) override;
    void updateSensorData(const JsonDocument &sensorDoc) override;
    bool matchesScreenId(const String& screenId, const JsonDocument& doc) const override;
    const char* getConfigKey() const override;

    // Expose device & connection to layouts
    DeviceConfig* getDevice() { return device; }
    ConnectionManager& getConnectionManager() { return connManager; }

    // Memory debugging
    void printMemoryInfo();

    // Safe recovery mode
    bool enterSafeMode();

private:
    DeviceConfig* device;
    ConnectionManager& connManager;

    LayoutInterface* currentLayout;
    Layout_DefaultHomeScreen* homeLayout;
    Layout_GridScreen* gridLayout;
    Layout_PlotterScreen* plotterLayout;
    Layout_RadioScreen* radioLayout;
    Layout_AstroScreen* astroLayout;
    Layout_RunScreen* runLayout;
    LayoutType currentLayoutType;

    // Switch layouts by type
    bool switchToLayout(LayoutType newType, const JsonDocument &configDoc);
    LayoutInterface* getLayoutForType(LayoutType type);

    // State tracking
    String lastKnownStatus;
    bool isTransitioning;
    bool lvglInitialized;
    unsigned long transitionStartTime;
    static const unsigned long TRANSITION_TIMEOUT = 5000; // 5 seconds timeout

    // LVGL task processing
    void processLVGLTasks(int iterations, int delayMs);

    // Safe screen management
    lv_obj_t* createTransitionScreen();
    lv_obj_t* safeScreen;
};

#endif // DISPLAY_MANAGER_H