#ifndef LAYOUT_DEFAULTHOMESCREEN_H
#define LAYOUT_DEFAULTHOMESCREEN_H

#include <lvgl.h>
#include <ArduinoJson.h>
#include "Interface_ScreenLayout_LVGL.h"
#include <vector>

// Forward declarations to avoid circular includes
class Display_Manager_LVGL;

class Layout_DefaultHomeScreen : public LayoutInterface {
public:
    explicit Layout_DefaultHomeScreen(Display_Manager_LVGL* displayManager);
    ~Layout_DefaultHomeScreen() override;

    // Core lifecycle
    void create(const JsonDocument &configDoc) override;
    void destroy() override;
    void update(const JsonDocument &sensorDoc) override;

    // Screen swapping & timers
    lv_obj_t* getScreen() const override;
    void destroyTimers() override;
    void registerSensors(const JsonDocument &configDoc) override {}

    // State queries
    bool isCreated()   const override { return mIsCreated; }
    bool isDestroyed() const override { return !mIsCreated; }

private:
    Display_Manager_LVGL* mDisplayManager;
    bool mIsCreated;
    
    // UI objects
    lv_obj_t* mScreen;
    lv_obj_t* mMainContainer;
    lv_obj_t* mTitleLabel;
    lv_obj_t* mStatusLabel;
    lv_obj_t* mRotateBtn;
    lv_obj_t* mResetBtn;
    
    // State tracking for optimization
    String mLastConfigJson;
    int mLastRotation;
    
    // Timers
    std::vector<lv_timer_t*> mTimers;
    
    // Event handlers
    static void rotate_event_cb(lv_event_t* e);
    static void reset_event_cb(lv_event_t* e);
    static void status_update_timer_cb(lv_timer_t* timer);  // NEW: Timer callback
    void handleRotate();
    void handleReset();
    void updateStatus();  // NEW: Manual status update method
    
    // Helper methods
    String buildStatusText();
};

#endif // LAYOUT_DEFAULTHOMESCREEN_H