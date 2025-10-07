#ifndef LAYOUT_RUNSCREEN_H
#define LAYOUT_RUNSCREEN_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <lvgl.h>
#include <vector>
#include "Interface_ScreenLayout_LVGL.h"

class Display_Manager_LVGL;

class Layout_RunScreen : public LayoutInterface {
public:
    explicit Layout_RunScreen(Display_Manager_LVGL* displayManager);
    ~Layout_RunScreen() override;
    
    void create(const JsonDocument& configDoc) override;
    void destroy() override;
    void destroyTimers() override;
    void update(const JsonDocument& sensorDoc) override;
    void registerSensors(const JsonDocument& configDoc) override;
    lv_obj_t* getScreen() const override;
    bool isCreated() const override;
    bool isDestroyed() const override;

private:
    Display_Manager_LVGL* mDisplayManager;
    bool mIsCreated;
    lv_obj_t* mScreen;
    std::vector<lv_timer_t*> mTimers;
    String mLastConfigJson;
};

#endif