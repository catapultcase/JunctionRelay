#ifndef LAYOUT_GRIDSCREEN_H
#define LAYOUT_GRIDSCREEN_H

#include <lvgl.h>
#include <ArduinoJson.h>
#include <Arduino.h>
#include <map>
#include <vector>
#include "LayoutInterface.h"

class DisplayManager;

class Layout_GridScreen : public LayoutInterface {
public:
    explicit Layout_GridScreen(DisplayManager* displayManager);
    ~Layout_GridScreen() override;

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
    lv_color_t parseColor(const char* c);

    DisplayManager*          mDisplayManager;
    bool                     mIsCreated;
    lv_obj_t*                mScreen;
    lv_obj_t**               mLabelNames;
    lv_obj_t**               mLabelValues;
    std::map<String, int>    mSensorTagToIndex;
    int                      mGridRows, mGridCols, mSensorCount;
    std::vector<lv_timer_t*> mTimers;
};

#endif // LAYOUT_GRIDSCREEN_H
