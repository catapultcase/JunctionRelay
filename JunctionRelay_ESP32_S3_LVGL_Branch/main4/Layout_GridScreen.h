#ifndef LAYOUT_GRIDSCREEN_H
#define LAYOUT_GRIDSCREEN_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <lvgl.h>
#include <map>
#include <vector>
#include "Interface_ScreenLayout_LVGL.h"

class Display_Manager_LVGL;

class Layout_GridScreen : public LayoutInterface {
public:
    explicit Layout_GridScreen(Display_Manager_LVGL* displayManager);
    ~Layout_GridScreen() override;
    
    void create(const JsonDocument& config) override;
    void destroy() override;
    void destroyTimers() override;
    void update(const JsonDocument& data) override;
    void registerSensors(const JsonDocument& config) override;
    lv_obj_t* getScreen() const override;
    bool isCreated() const override;
    bool isDestroyed() const override;

private:
    const lv_font_t* getGridFont(int size);
    lv_color_t parseColor(const char* c);
    
    Display_Manager_LVGL* mDisplayManager;
    bool mIsCreated;
    lv_obj_t* mScreen;
    lv_obj_t** mLabelNames;
    lv_obj_t** mLabelValues;
    std::map<String, int> mSensorTagToIndex;
    int mGridRows, mGridCols, mSensorCount;
    std::vector<lv_timer_t*> mTimers;
};

#endif