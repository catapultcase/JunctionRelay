#ifndef LAYOUT_RADIOSCREEN_H
#define LAYOUT_RADIOSCREEN_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <lvgl.h>
#include <map>
#include <vector>
#include "Interface_ScreenLayout_LVGL.h"

class Display_Manager_LVGL;

// Helper to hold triangle & label pointers for the bar indicators
struct IndicatorData {
    lv_obj_t* triangle;
    lv_obj_t* label;
};

class Layout_RadioScreen : public LayoutInterface {
public:
    explicit Layout_RadioScreen(Display_Manager_LVGL* displayManager);
    ~Layout_RadioScreen() override;

    void create(const JsonDocument& configDoc) override;
    void destroy() override;
    void destroyTimers() override;
    void update(const JsonDocument& sensorDoc) override;
    void registerSensors(const JsonDocument& configDoc) override;
    lv_obj_t* getScreen() const override;
    bool isCreated() const override;
    bool isDestroyed() const override;

private:
    const lv_font_t* getGridFont(int size);
    lv_color_t parseColor(const char* c, lv_color_t defaultColor = lv_color_black());
    
    // Event callback for updating indicators
    static void indicatorUpdateCallback(lv_event_t* e);

    Display_Manager_LVGL* mDisplayManager;
    bool mIsCreated;
    lv_obj_t* mScreen;
    lv_obj_t** mLabelNames;
    lv_obj_t** mLabelValues;
    std::map<String, int> mSensorTagToIndex;
    std::map<String, lv_obj_t*> mSensorBarMap;
    std::vector<IndicatorData*> mIndicators;
    std::vector<lv_timer_t*> mTimers;
    int mSensorCount;
};

#endif