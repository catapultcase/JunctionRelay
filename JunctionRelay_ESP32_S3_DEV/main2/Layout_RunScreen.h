// Layout_RunScreen.h
#ifndef LAYOUT_RUNSCREEN_H
#define LAYOUT_RUNSCREEN_H

#include <lvgl.h>
#include <ArduinoJson.h>
#include <Arduino.h>
#include <vector>
#include "LayoutInterface.h"

class DisplayManager;

class Layout_RunScreen : public LayoutInterface {
public:
    explicit Layout_RunScreen(DisplayManager* displayManager);
    ~Layout_RunScreen() override;
    
    // Core lifecycle
    void create(const JsonDocument &configDoc) override;
    void destroy() override;
    void update(const JsonDocument &sensorDoc) override;

    // Screen swapping & timers
    lv_obj_t* getScreen() const override;
    void destroyTimers() override;
    void registerSensors(const JsonDocument &configDoc) override {}

    // State queries
    bool isCreated() const override { return mIsCreated; }
    bool isDestroyed() const override { return !mIsCreated; }

private:
    DisplayManager* mDisplayManager;
    bool mIsCreated;
    lv_obj_t* mScreen;
    std::vector<lv_timer_t*> mTimers;
    String mLastConfigJson;
};

#endif // LAYOUT_RUNSCREEN_H