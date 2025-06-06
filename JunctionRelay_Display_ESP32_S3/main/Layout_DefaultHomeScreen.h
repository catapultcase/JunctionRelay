#ifndef LAYOUT_DEFAULTHOMESCREEN_H
#define LAYOUT_DEFAULTHOMESCREEN_H

#include <lvgl.h>
#include <ArduinoJson.h>
#include <Arduino.h>        // for String
#include <Preferences.h>
#include <vector>
#include "LayoutInterface.h"

class DisplayManager;

class Layout_DefaultHomeScreen : public LayoutInterface {
public:
    explicit Layout_DefaultHomeScreen(DisplayManager* displayManager);
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
    DisplayManager*          mDisplayManager;
    bool                     mIsCreated;
    String                   mLastConfigJson;  // Added this missing member
    int                      mLastRotation;    // Added this missing member

    // UI objects
    lv_obj_t*                mScreen;
    lv_obj_t*                mMainContainer;
    lv_obj_t*                mTitleLabel;
    lv_obj_t*                mStatusLabel;
    lv_obj_t*                mRotateBtn;
    lv_obj_t*                mResetBtn;
    std::vector<lv_timer_t*> mTimers;

    // Event callbacks
    static void rotate_event_cb(lv_event_t* e);
    static void reset_event_cb(lv_event_t* e);

    // Handlers
    void handleRotate();
    void handleReset();
};

#endif // LAYOUT_DEFAULTHOMESCREEN_H