#ifndef LAYOUT_PLOTTER_SCREEN_H
#define LAYOUT_PLOTTER_SCREEN_H

#include <lvgl.h>
#include <ArduinoJson.h>
#include <Arduino.h>
#include <map>
#include <vector>
#include "LayoutInterface.h"

class DisplayManager;

// Structure to hold chart information
struct ChartInfo {
    lv_obj_t* chart;
    lv_chart_series_t* series;
    float maxValue;
};

// Forward declaration for the timer callback
static void scroll_chart_timer_cb(lv_timer_t* timer);

// Structure to pass chart and series to the timer callback
struct TimerChartData {
    lv_obj_t* chart;
    lv_chart_series_t* series;
    lv_timer_t* timer;  // Store the timer reference for cleanup
};

class Layout_PlotterScreen : public LayoutInterface {
public:
    explicit Layout_PlotterScreen(DisplayManager* displayManager);
    ~Layout_PlotterScreen() override;

    void create(const JsonDocument &configDoc) override;
    void destroy() override;
    void update(const JsonDocument &sensorDoc) override;

    lv_obj_t* getScreen() const override;
    void destroyTimers() override;
    void registerSensors(const JsonDocument &configDoc) override;

    bool isCreated()   const override { return mIsCreated; }
    bool isDestroyed() const override { return !mIsCreated; }
    
    // Friend declaration to allow the static callback to access private members
    friend void scroll_chart_timer_cb(lv_timer_t* timer);

private:
    const lv_font_t* getGridFont(int size);
    lv_color_t parseColor(const char* c);
    void updateChartData(const String& sensorTag, float value);
    void cleanupResources();

    DisplayManager*          mDisplayManager;
    bool                     mIsCreated;
    lv_obj_t*                mScreen;
    lv_obj_t**               mLabelNames;
    lv_obj_t**               mLabelValues;
    std::map<String, int>    mSensorTagToIndex;
    std::map<String, ChartInfo> mChartMap;
    std::vector<TimerChartData*> mTimerDataList;
    std::map<lv_chart_series_t*, lv_coord_t> mLastValues;
    int                      mSensorCount;
};

#endif // LAYOUT_PLOTTER_SCREEN_H