#ifndef LAYOUT_RADIO_SCREEN_H
#define LAYOUT_RADIO_SCREEN_H

#include <lvgl.h>
#include <ArduinoJson.h>
#include <Arduino.h>
#include <map>
#include <vector>
#include "LayoutInterface.h"

class DisplayManager;

// Helper to hold triangle & label pointers for the bar indicators
struct IndicatorData {
    lv_obj_t* triangle;
    lv_obj_t* label;
};

class Layout_RadioScreen : public LayoutInterface {
public:
    explicit Layout_RadioScreen(DisplayManager* displayManager);
    ~Layout_RadioScreen() override;

    void create(const JsonDocument &configDoc) override;
    void destroy() override;
    void update(const JsonDocument &sensorDoc) override;

    lv_obj_t* getScreen() const override;
    void destroyTimers() override;
    void registerSensors(const JsonDocument &configDoc) override;

    bool isCreated()   const override { return mIsCreated; }
    bool isDestroyed() const override { return !mIsCreated; }

private:
    const lv_font_t* getGridFont(int size);
    lv_color_t parseColor(const char* c, lv_color_t defaultColor = lv_color_black());
    
    // Event callback for updating indicators
    static void indicatorUpdateCallback(lv_event_t* e);

    DisplayManager*          mDisplayManager;
    bool                     mIsCreated;
    lv_obj_t*                mScreen;
    lv_obj_t**               mLabelNames;
    lv_obj_t**               mLabelValues;
    std::map<String, int>    mSensorTagToIndex;
    std::map<String, lv_obj_t*> mSensorBarMap;
    std::vector<IndicatorData*> mIndicators;
    std::vector<lv_timer_t*> mTimers;
    int                      mSensorCount;
};

#endif // LAYOUT_RADIO_SCREEN_H