#include "Layout_PlotterScreen.h"
#include "DisplayManager.h"
#include "DeviceConfig.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <cstring>
#include <cstdlib>

// Implementation of the static callback function
void scroll_chart_timer_cb(lv_timer_t* timer) {
    // Get chart info from user_data
    auto data = static_cast<TimerChartData*>(timer->user_data);
    if (!data || !data->chart || !data->series) return;
    
    // Get access to the Layout_PlotterScreen instance
    auto* self = static_cast<Layout_PlotterScreen*>(lv_obj_get_user_data(data->chart));
    if (!self) return;
    
    // With friend declaration, we can access private members directly
    auto it = self->mLastValues.find(data->series);
    if (it != self->mLastValues.end()) {
        // Use the stored last value (from real data)
        lv_chart_set_next_value(data->chart, data->series, it->second);
    } else {
        // Fallback: use the current last value in the chart
        uint16_t point_count = lv_chart_get_point_count(data->chart);
        if (point_count > 0) {
            lv_coord_t last_value = data->series->y_points[point_count - 1];
            lv_chart_set_next_value(data->chart, data->series, last_value);
        }
    }
}

// Constructor / Destructor
Layout_PlotterScreen::Layout_PlotterScreen(DisplayManager* displayManager)
    : mDisplayManager(displayManager)
    , mIsCreated(false)
    , mScreen(nullptr)
    , mLabelNames(nullptr)
    , mLabelValues(nullptr)
    , mSensorCount(0)
{}

Layout_PlotterScreen::~Layout_PlotterScreen() {
    destroyTimers();
    destroy();
}

lv_color_t Layout_PlotterScreen::parseColor(const char* c) {
    if (!c || c[0] != '#' || std::strlen(c) < 7) return lv_color_black();
    long hex = std::strtoul(c + 1, nullptr, 16);
    return lv_color_make((hex >> 16) & 0xFF,
                         (hex >>  8) & 0xFF,
                          hex        & 0xFF);
}

const lv_font_t* Layout_PlotterScreen::getGridFont(int size) {
    if (size <= 12) return &lv_font_montserrat_12;
    if (size <= 14) return &lv_font_montserrat_14;
    if (size <= 16) return &lv_font_montserrat_16;
    if (size <= 18) return &lv_font_montserrat_18;
    if (size <= 20) return &lv_font_montserrat_20;
    if (size <= 22) return &lv_font_montserrat_22;
    if (size <= 24) return &lv_font_montserrat_24;
    if (size <= 26) return &lv_font_montserrat_26;
    if (size <= 28) return &lv_font_montserrat_28;
    if (size <= 32) return &lv_font_montserrat_32;
    if (size <= 36) return &lv_font_montserrat_36;
    if (size <= 40) return &lv_font_montserrat_40;
    return &lv_font_montserrat_48;
}

void Layout_PlotterScreen::create(const JsonDocument &configDoc) {
    Serial.println("[DEBUG] Starting Layout_PlotterScreen::create");
    
    if (mIsCreated) {
        destroyTimers();
        destroy();
    }
    
    // Clear state
    mChartMap.clear();
    mSensorTagToIndex.clear();
    mLastValues.clear();
    
    delete[] mLabelNames;
    mLabelNames = nullptr;
    
    delete[] mLabelValues;
    mLabelValues = nullptr;

    // Extract configuration
    const char* textColorStr       = configDoc["lvgl_plotter"]["text_color"]       | "#FFFFFF";
    const char* backgroundColorStr = configDoc["lvgl_plotter"]["background_color"] | "#000000";
    const char* borderColorStr     = configDoc["lvgl_plotter"]["border_color"]     | "#444444";
    int topMargin        = configDoc["lvgl_plotter"]["top_margin"]        | 10;
    int bottomMargin     = configDoc["lvgl_plotter"]["bottom_margin"]     | 10;
    int leftMargin       = configDoc["lvgl_plotter"]["left_margin"]       | 10;
    int rightMargin      = configDoc["lvgl_plotter"]["right_margin"]      | 10;
    int innerPadding     = configDoc["lvgl_plotter"]["inner_padding"]     | 5;
    int outerPadding     = configDoc["lvgl_plotter"]["outer_padding"]     | 10;
    bool borderVisible   = configDoc["lvgl_plotter"]["border_visible"]    | true;
    int borderThickness  = configDoc["lvgl_plotter"]["border_thickness"]  | 1;

    bool showLegend           = configDoc["lvgl_plotter"]["show_legend"]           | true;
    bool legendInside         = configDoc["lvgl_plotter"]["position_legend_inside"] | false;
    bool chartOutlineVisible  = configDoc["lvgl_plotter"]["chart_outline_visible"]  | true;
    int historyPoints         = configDoc["lvgl_plotter"]["history_points_to_show"] | 100;
    int gridDensity           = configDoc["lvgl_plotter"]["grid_density"]           | 5;
    bool showUnits            = configDoc["lvgl_plotter"]["show_units"]             | false;
    
    // Get scroll rate
    int scrollRate = 100; // Default to 100ms (10fps)
    if (configDoc["lvgl_plotter"].containsKey("chart_scroll_speed")) {
        scrollRate = configDoc["lvgl_plotter"]["chart_scroll_speed"];
        Serial.println("[DEBUG] Using chart_scroll_speed parameter");
    } else {
        Serial.println("[DEBUG] No scroll rate specified, using default");
    }

    // Determine screen size
    uint16_t w = mDisplayManager->getDevice()->width();
    uint16_t h = mDisplayManager->getDevice()->height();
    if (mDisplayManager->getDevice()->getRotation() == 90 || 
        mDisplayManager->getDevice()->getRotation() == 270) {
        std::swap(w, h);
    }
    Serial.printf("[DEBUG] Screen %dx%d\n", w, h);

    // Color setup
    lv_color_t bgCol  = parseColor(backgroundColorStr);
    lv_color_t txtCol = parseColor(textColorStr);
    lv_color_t brdCol = parseColor(borderColorStr);

    // Create base screen
    mScreen = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(mScreen, bgCol, LV_PART_MAIN);
    
    // Main container
    lv_obj_t* mainC = lv_obj_create(mScreen);
    lv_obj_remove_style_all(mainC);
    int mw = w - leftMargin - rightMargin;
    int mh = h - topMargin - bottomMargin;
    lv_obj_set_size(mainC, mw, mh);
    lv_obj_set_pos(mainC, leftMargin, topMargin);

    // Layout sensors (max 4)
    auto layout = configDoc["layout"].as<JsonArrayConst>();
    mSensorCount = std::min((int)layout.size(), 4);
    
    mLabelNames = new lv_obj_t*[mSensorCount];
    mLabelValues = new lv_obj_t*[mSensorCount];

    // Choose grid dimensions
    int rows = 1, cols = 1;
    if (mSensorCount == 2) cols = 2;
    else if (mSensorCount >= 3) { cols = 2; rows = 2; }

    int pw = (mw - (cols - 1) * outerPadding) / cols;
    int ph = (mh - (rows - 1) * outerPadding) / rows;

    for (int i = 0; i < mSensorCount; i++) {
        int r = i / cols, c = i % cols;
        auto e = layout[i].as<JsonObjectConst>();
        const char* sensorId = e["id"].as<const char*>();
        const char* label = e["label"] | sensorId;
        const char* unit = e["unit"] | "";

        mSensorTagToIndex[String(sensorId)] = i;
        // Also map by label if different from ID
        if (label && strcmp(label, sensorId) != 0) {
            mSensorTagToIndex[String(label)] = i;
        }

        // Container
        lv_obj_t* pC = lv_obj_create(mainC);
        lv_obj_remove_style_all(pC);
        lv_obj_set_size(pC, pw, ph);
        lv_obj_set_pos(pC, c * (pw + outerPadding), r * (ph + outerPadding));

        // Chart container
        int chartH = (!showLegend || legendInside) ? 
                    (ph - innerPadding * 2) : 
                    ((ph - innerPadding * 3) * 4 / 5);
        lv_obj_t* chartC = lv_obj_create(pC);
        lv_obj_remove_style_all(chartC);
        int chartW = pw - innerPadding * 2;
        lv_obj_set_size(chartC, chartW, chartH);
        lv_obj_align(chartC, LV_ALIGN_TOP_MID, 0, innerPadding);
        if (borderVisible) {
            lv_obj_set_style_border_width(chartC, borderThickness, 0);
            lv_obj_set_style_border_color(chartC, brdCol, 0);
        }

        // Chart
        lv_obj_t* chart = lv_chart_create(chartC);
        // Store the Layout_PlotterScreen instance for the callback
        lv_obj_set_user_data(chart, this);
        
        int cw = chartW - 2 * innerPadding;
        int ch = chartH - 2 * innerPadding;
        cw = std::max(cw, 60);
        ch = std::max(ch, 60);
        lv_obj_set_size(chart, cw, ch);
        lv_obj_center(chart);
        lv_chart_set_type(chart, LV_CHART_TYPE_LINE);
        lv_obj_set_style_bg_color(chart, bgCol, 0);
        lv_chart_set_div_line_count(chart, gridDensity, gridDensity);
        lv_obj_set_style_line_color(chart, brdCol, LV_PART_MAIN);
        lv_obj_set_style_line_width(chart, 1, LV_PART_MAIN);
        lv_obj_set_style_line_opa(chart, LV_OPA_30, LV_PART_MAIN);
        lv_obj_set_style_text_color(chart, txtCol, 0);
        
        // Choose appropriate font size based on number of charts
        const lv_font_t* chartFont = (mSensorCount == 1) ?
                                    &lv_font_montserrat_16 :
                                    &lv_font_montserrat_12;
        lv_obj_set_style_text_font(chart, chartFont, 0);
        
        if (chartOutlineVisible) {
            lv_obj_set_style_border_width(chart, 1, LV_PART_MAIN);
            lv_obj_set_style_border_color(chart, brdCol, LV_PART_MAIN);
        }
        
        lv_chart_set_point_count(chart, historyPoints);
        lv_chart_set_range(chart, LV_CHART_AXIS_PRIMARY_Y, 0, 100);
        lv_chart_set_update_mode(chart, LV_CHART_UPDATE_MODE_SHIFT);

        lv_chart_series_t* ser = lv_chart_add_series(chart, txtCol, LV_CHART_AXIS_PRIMARY_Y);
        
        // Initialize all points with zero to ensure connected line
        lv_coord_t initialValue = 0;
        for (uint16_t j = 0; j < historyPoints; j++) {
            lv_chart_set_next_value(chart, ser, initialValue);
        }
        
        // Initialize tracking with the initial value
        mLastValues[ser] = initialValue;
        
        // Create a timer data structure
        TimerChartData* timerData = new TimerChartData{chart, ser, nullptr};
        
        // Create a timer for continuous scrolling
        timerData->timer = lv_timer_create(scroll_chart_timer_cb, scrollRate, timerData);
        
        // Add to our list for proper cleanup later
        mTimerDataList.push_back(timerData);
        
        // Store chart info for updates
        mChartMap[String(sensorId)] = { chart, ser, 100.0f };

        // Legend/value labels
        lv_obj_t* nameLbl = nullptr;
        lv_obj_t* valLbl = nullptr;
        
        if (showLegend) {
            if (legendInside) {
                // Create legend inside chart
                lv_obj_t* lg = lv_obj_create(chart);
                lv_obj_remove_style_all(lg);
                lv_obj_set_style_bg_color(lg, bgCol, 0);
                lv_obj_set_style_bg_opa(lg, LV_OPA_70, 0);
                lv_obj_set_style_pad_all(lg, 5, 0);
                
                // Create flexible container
                lv_obj_t* flex = lv_obj_create(lg);
                lv_obj_remove_style_all(flex);
                lv_obj_set_size(flex, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
                lv_obj_set_style_pad_all(flex, 0, 0);
                lv_obj_set_flex_flow(flex, LV_FLEX_FLOW_ROW);
                lv_obj_set_flex_align(flex, LV_FLEX_ALIGN_START, 
                                     LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

                nameLbl = lv_label_create(flex);
                lv_obj_set_style_text_color(nameLbl, txtCol, 0);
                lv_obj_set_style_text_font(nameLbl, chartFont, 0);
                
                if (showUnits && unit && strlen(unit) > 0) {
                    lv_label_set_text_fmt(nameLbl, "%s (%s): ", label, unit);
                } else {
                    lv_label_set_text_fmt(nameLbl, "%s: ", label);
                }

                valLbl = lv_label_create(flex);
                lv_obj_set_style_text_color(valLbl, txtCol, 0);
                lv_obj_set_style_text_font(valLbl, chartFont, 0);
                lv_label_set_text(valLbl, "N/A");
                
                // After setting the label content, adjust container sizes
                lv_obj_update_layout(flex);
                // Make lg auto-size to fit the flex container
                lv_obj_set_size(lg, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
                lv_obj_align(lg, LV_ALIGN_TOP_RIGHT, -10, 10);
            } else {
                // Create legend below chart
                lv_obj_t* bot = lv_obj_create(pC);
                lv_obj_remove_style_all(bot);
                int bh = (ph - innerPadding * 3) / 5;
                lv_obj_set_size(bot, chartW, bh);
                lv_obj_align(bot, LV_ALIGN_BOTTOM_MID, 0, -innerPadding);

                lv_obj_t* flex = lv_obj_create(bot);
                lv_obj_remove_style_all(flex);
                lv_obj_set_size(flex, chartW, LV_SIZE_CONTENT);
                lv_obj_set_style_pad_all(flex, 0, 0);
                lv_obj_align(flex, LV_ALIGN_CENTER, 0, 0);
                lv_obj_set_flex_flow(flex, LV_FLEX_FLOW_ROW);
                lv_obj_set_flex_align(flex, LV_FLEX_ALIGN_SPACE_EVENLY,
                                     LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

                nameLbl = lv_label_create(flex);
                lv_obj_set_style_text_color(nameLbl, txtCol, 0);
                
                // Choose appropriate font size based on number of charts
                const lv_font_t* labelFont = (mSensorCount <= 2) ? 
                                            getGridFont(24) : 
                                            &lv_font_montserrat_16;
                lv_obj_set_style_text_font(nameLbl, labelFont, 0);
                
                if (showUnits && unit && strlen(unit) > 0) {
                    lv_label_set_text_fmt(nameLbl, "%s (%s): ", label, unit);
                } else {
                    lv_label_set_text_fmt(nameLbl, "%s: ", label);
                }

                valLbl = lv_label_create(flex);
                lv_obj_set_style_text_color(valLbl, txtCol, 0);
                lv_obj_set_style_text_font(valLbl, labelFont, 0);
                lv_label_set_text(valLbl, "N/A");
            }
        }

        mLabelNames[i] = nameLbl;
        mLabelValues[i] = valLbl;
    }

    lv_scr_load(mScreen);
    mIsCreated = true;
    Serial.printf("[DEBUG] Plotter screen created with %d charts (scroll rate: %dms)\n", 
                  mSensorCount, scrollRate);
}

void Layout_PlotterScreen::destroy() {
    if (!mIsCreated) return;
    
    Serial.println("[DEBUG] Destroying plotter screen");
    
    // Clean up timers first
    destroyTimers();
    
    // Delete label arrays
    delete[] mLabelNames;
    mLabelNames = nullptr;
    
    delete[] mLabelValues;
    mLabelValues = nullptr;
    
    // Delete screen (which deletes all child objects)
    if (mScreen) {
        lv_obj_del(mScreen);
        mScreen = nullptr;
    }
    
    // Clear all maps
    mSensorTagToIndex.clear();
    mChartMap.clear();
    mLastValues.clear();
    
    mIsCreated = false;
    Serial.println("[DEBUG] Plotter screen destroyed");
}

void Layout_PlotterScreen::destroyTimers() {
    Serial.println("[DEBUG] Destroying plotter timers");
    
    // Delete all timer objects
    for (auto timerData : mTimerDataList) {
        if (timerData->timer) {
            lv_timer_del(timerData->timer);
            timerData->timer = nullptr;
        }
        delete timerData;
    }
    
    mTimerDataList.clear();
}

void Layout_PlotterScreen::update(const JsonDocument &doc) {
    if (!mIsCreated) return;
    
    auto root = doc.as<JsonObjectConst>();
    if (!root.containsKey("sensors")) return;
    
    auto sensors = root["sensors"].as<JsonObjectConst>();
    for (auto kv : sensors) {
        const char* tag = kv.key().c_str();
        auto arr = kv.value().as<JsonArrayConst>();
        if (arr.isNull() || arr.size() == 0) continue;
        
        auto obj = arr[0].as<JsonObjectConst>();
        const char* unit = obj["Unit"].as<const char*>();
        const char* vs = obj["Value"].as<const char*>();
        
        // Update chart data
        if (vs) {
            float value = atof(vs);
            updateChartData(String(tag), value);
        }
        
        // Update value label if it exists
        auto it = mSensorTagToIndex.find(tag);
        if (it != mSensorTagToIndex.end()) {
            int idx = it->second;
            if (mLabelValues && mLabelValues[idx]) {
                String txt = String(vs ? vs : "") + " " + String(unit ? unit : "");
                lv_label_set_text(mLabelValues[idx], txt.c_str());
            }
        }
    }
}

void Layout_PlotterScreen::updateChartData(const String& sensorTag, float value) {
    auto it = mChartMap.find(sensorTag);
    if (it == mChartMap.end()) {
        Serial.printf("[ERROR] '%s' not in chartMap\n", sensorTag.c_str());
        return;
    }
    
    ChartInfo& ci = it->second;
    if (!ci.chart || !ci.series) {
        Serial.printf("[ERROR] Null chart/series for '%s'\n", sensorTag.c_str());
        return;
    }

    // Update the value in our tracking map - this is picked up by the timer callback
    mLastValues[ci.series] = value;

    // Auto-scale if needed
    if (value > ci.maxValue) {
        ci.maxValue = value * 1.2f;
        lv_chart_set_range(ci.chart, LV_CHART_AXIS_PRIMARY_Y, 0, (int)ci.maxValue);
        Serial.printf("[DEBUG] Rescaled '%s' to 0–%d\n",
                     sensorTag.c_str(), (int)ci.maxValue);
    }
}

void Layout_PlotterScreen::registerSensors(const JsonDocument &configDoc) {
    auto layout = configDoc["layout"].as<JsonArrayConst>();
    for (auto v : layout) {
        if (v.containsKey("id")) {
            String id = v["id"].as<String>();
            Serial.printf("[DEBUG] Plotter register sensor: %s\n", id.c_str());
        }
    }
}

lv_obj_t* Layout_PlotterScreen::getScreen() const {
    return mScreen;
}