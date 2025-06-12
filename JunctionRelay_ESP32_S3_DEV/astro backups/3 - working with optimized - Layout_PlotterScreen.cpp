// Layout_PlotterScreen.cpp

#include "DisplayManager.h"
#include <ArduinoJson.h>
#include <string.h>

// Simple structure to pass chart and series to the timer callback
struct TimerChartData {
    lv_obj_t* chart;
    lv_chart_series_t* series;
    lv_timer_t* timer;  // Store the timer reference for cleanup
};

// Global map to track last values for each chart
static std::map<lv_chart_series_t*, lv_coord_t> lastValues;
// Store timer data pointers for proper cleanup
static std::vector<TimerChartData*> timerDataList;

// Timer callback for continuous scrolling
static void scroll_chart_timer_cb(lv_timer_t* timer) {
    // Get chart info from user_data
    auto data = static_cast<TimerChartData*>(timer->user_data);
    if (data && data->chart && data->series) {
        // Check if we have a stored last value for this series
        auto it = lastValues.find(data->series);
        if (it != lastValues.end()) {
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
}

// Helper to clean up static resources
static void cleanupStaticResources() {
    // Delete all timer data structures
    for (auto timerData : timerDataList) {
        if (timerData->timer) {
            lv_timer_del(timerData->timer);
        }
        delete timerData;
    }
    timerDataList.clear();
    
    // Clear all cached values
    lastValues.clear();
    
    Serial.println("[DEBUG] Cleaned up all static chart resources");
}

// ——————————————————————————————————————————————————————————
// Single-sensor plotter
// ——————————————————————————————————————————————————————————
void DisplayManager::createPlotterScreen(const JsonDocument &configDoc) {
    Serial.println("[DEBUG] Starting createPlotterScreen");
    
    // Clean up any existing static resources first
    cleanupStaticResources();
    
    // Clear class members
    chartMap.clear();
    sensorTagToIndex.clear();
    
    delete[] labelNames;
    labelNames = nullptr;
    
    delete[] labelValues;
    labelValues = nullptr;

    // Extract configuration
    const char* textColorStr       = configDoc["lvgl_plotter"]["text_color"]       | "#FFFFFF";
    const char* backgroundColorStr = configDoc["lvgl_plotter"]["background_color"] | "#000000";
    const char* borderColorStr     = configDoc["lvgl_plotter"]["border_color"]     | "#444444";
    int topMargin        = configDoc["lvgl_plotter"]["top_margin"]        | 10;
    int bottomMargin     = configDoc["lvgl_plotter"]["bottom_margin"]     | 10;
    int leftMargin       = configDoc["lvgl_plotter"]["left_margin"]       | 10;
    int rightMargin      = configDoc["lvgl_plotter"]["right_margin"]      | 10;
    int innerPadding     = configDoc["lvgl_plotter"]["inner_padding"]     | 5;
    bool borderVisible   = configDoc["lvgl_plotter"]["border_visible"]    | true;
    int borderThickness  = configDoc["lvgl_plotter"]["border_thickness"]  | 1;

    bool showLegend           = configDoc["lvgl_plotter"]["show_legend"]             | true;
    bool legendInside         = configDoc["lvgl_plotter"]["position_legend_inside"] | false;
    bool chartOutlineVisible  = configDoc["lvgl_plotter"]["chart_outline_visible"]  | true;
    int historyPoints         = configDoc["lvgl_plotter"]["history_points_to_show"] | 100;
    int gridDensity           = configDoc["lvgl_plotter"]["grid_density"]           | 5;
    bool showUnits            = configDoc["lvgl_plotter"]["show_units"]             | true;
    // Get scroll rate (in ms) - default to 100ms (10fps)
    int scrollRate            = configDoc["lvgl_plotter"]["scroll_rate_ms"]         | 100;

    // Determine screen size
    uint16_t w = device->width(), h = device->height();
    if (device->getRotation()==90 || device->getRotation()==270) std::swap(w,h);
    Serial.printf("[DEBUG] Screen %dx%d\n", w, h);

    // Color parser
    auto parseColor = [](const char* s){
      uint32_t v = strtol(s+1,nullptr,16);
      return lv_color_make((v>>16)&0xFF,(v>>8)&0xFF,v&0xFF);
    };
    lv_color_t bgCol  = parseColor(backgroundColorStr);
    lv_color_t txtCol = parseColor(textColorStr);
    lv_color_t brdCol = parseColor(borderColorStr);

    // Build LVGL hierarchy
    lv_obj_t* scr = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(scr,bgCol,LV_PART_MAIN);

    lv_obj_t* mainC = lv_obj_create(scr);
    lv_obj_remove_style_all(mainC);
    int mw = w - leftMargin - rightMargin;
    int mh = h - topMargin  - bottomMargin;
    lv_obj_set_size(mainC,mw,mh);
    lv_obj_set_pos(mainC,leftMargin,topMargin);

    // Chart container
    int chartH = (!showLegend||legendInside) ? mh : (mh*4)/5;
    lv_obj_t* chartC = lv_obj_create(mainC);
    lv_obj_remove_style_all(chartC);
    lv_obj_set_size(chartC,mw,chartH);
    lv_obj_align(chartC,LV_ALIGN_TOP_MID,0,0);
    if(borderVisible) {
      lv_obj_set_style_border_width(chartC,borderThickness,0);
      lv_obj_set_style_border_color(chartC,brdCol,0);
    }

    // The chart
    lv_obj_t* chart = lv_chart_create(chartC);
    int cw = mw-2*innerPadding, ch = chartH-2*innerPadding;
    lv_obj_set_size(chart,cw,ch);
    lv_obj_center(chart);
    lv_chart_set_type(chart,LV_CHART_TYPE_LINE);
    lv_obj_set_style_bg_color(chart,bgCol,0);
    lv_chart_set_div_line_count(chart,gridDensity,gridDensity);
    lv_obj_set_style_line_color(chart,brdCol,LV_PART_MAIN);
    lv_obj_set_style_line_width(chart,1,LV_PART_MAIN);
    lv_obj_set_style_line_opa(chart,LV_OPA_30,LV_PART_MAIN);
    lv_obj_set_style_text_color(chart,txtCol,0);
    lv_obj_set_style_text_font(chart,&lv_font_montserrat_16,0);

    if(chartOutlineVisible) {
      lv_obj_set_style_border_width(chart,1,LV_PART_MAIN);
      lv_obj_set_style_border_color(chart,brdCol,LV_PART_MAIN);
    }

    lv_chart_set_point_count(chart,historyPoints);
    lv_chart_set_range(chart,LV_CHART_AXIS_PRIMARY_Y,0,100);
    lv_chart_set_update_mode(chart,LV_CHART_UPDATE_MODE_SHIFT);

    lv_chart_series_t* ser = lv_chart_add_series(chart,txtCol,LV_CHART_AXIS_PRIMARY_Y);
    
    // Initialize all points with a consistent value to ensure the line is connected
    lv_coord_t initialValue = 0;
    for (uint16_t i = 0; i < historyPoints; i++) {
        lv_chart_set_next_value(chart, ser, initialValue);
    }
    
    // Initialize our global tracking with the initial value
    lastValues[ser] = initialValue;

    // Create a timer data structure that will persist for the lifetime of the timer
    TimerChartData* timerData = new TimerChartData{chart, ser, nullptr};
    
    // Create a timer for continuous scrolling with the timer data
    timerData->timer = lv_timer_create(scroll_chart_timer_cb, scrollRate, timerData);
    
    // Add to the list for proper cleanup later
    timerDataList.push_back(timerData);
    
    Serial.printf("[DEBUG] Created continuous scroll timer with rate: %dms\n", scrollRate);

    // Legend & value labels
    lv_obj_t* nameLbl=nullptr;
    lv_obj_t* valLbl =nullptr;

    auto layout = configDoc["layout"].as<JsonArrayConst>();
    if(showLegend && layout.size()>0) {
      auto e = layout[0].as<JsonObjectConst>();
      const char* sensorId = e["id"].as<const char*>();
      const char* label    = e["label"]|sensorId;
      const char* unit     = e["unit"]| "";

      sensorTagToIndex.clear();
      sensorTagToIndex[String(sensorId)] = 0;
      // Also map by label if different from ID
      if (label && strcmp(label, sensorId) != 0) {
          sensorTagToIndex[String(label)] = 0;
      }

      // Store chart for updates
      chartMap.clear();
      chartMap[String(sensorId)] = { chart, ser, 100.0f };

      if(legendInside) {
        lv_obj_t* lg = lv_obj_create(chart);
        lv_obj_remove_style_all(lg);
        lv_obj_set_style_bg_color(lg,bgCol,0);
        lv_obj_set_style_bg_opa(lg,LV_OPA_70,0);
        lv_obj_set_style_pad_all(lg,5,0);
        lv_obj_align(lg,LV_ALIGN_TOP_RIGHT,-10,10);

        nameLbl = lv_label_create(lg);
        lv_obj_set_style_text_color(nameLbl,txtCol,0);
        lv_obj_set_style_text_font(nameLbl,&lv_font_montserrat_16,0);
        if(showUnits && *unit) {
          lv_label_set_text_fmt(nameLbl,"%s (%s): ",label,unit);
        } else {
          lv_label_set_text_fmt(nameLbl,"%s: ",label);
        }

        valLbl = lv_label_create(lg);
        lv_obj_set_style_text_color(valLbl,txtCol,0);
        lv_obj_set_style_text_font(valLbl,&lv_font_montserrat_16,0);
        lv_obj_align_to(valLbl,nameLbl,LV_ALIGN_OUT_RIGHT_MID,5,0);
        lv_label_set_text(valLbl,"N/A");
      }
      else {
        lv_obj_t* lg = lv_obj_create(mainC);
        lv_obj_remove_style_all(lg);
        int lh = mh-chartH;
        lv_obj_set_size(lg,mw,lh);
        lv_obj_align(lg,LV_ALIGN_BOTTOM_MID,0,0);

        lv_obj_t* flex = lv_obj_create(lg);
        lv_obj_remove_style_all(flex);
        lv_obj_set_size(flex,mw,LV_SIZE_CONTENT);
        lv_obj_align(flex,LV_ALIGN_CENTER,0,0);
        lv_obj_set_flex_flow(flex,LV_FLEX_FLOW_ROW);
        lv_obj_set_flex_align(flex,LV_FLEX_ALIGN_SPACE_EVENLY,LV_FLEX_ALIGN_CENTER,LV_FLEX_ALIGN_CENTER);

        nameLbl = lv_label_create(flex);
        lv_obj_set_style_text_color(nameLbl,txtCol,0);
        lv_obj_set_style_text_font(nameLbl,&lv_font_montserrat_20,0);
        if(showUnits && *unit) {
          lv_label_set_text_fmt(nameLbl,"%s (%s): ",label,unit);
        } else {
          lv_label_set_text_fmt(nameLbl,"%s: ",label);
        }

        valLbl = lv_label_create(flex);
        lv_obj_set_style_text_color(valLbl,txtCol,0);
        lv_obj_set_style_text_font(valLbl,&lv_font_montserrat_20,0);
        lv_label_set_text(valLbl,"N/A");
      }
    }

    // Save pointers for updateSensorDisplay()
    labelNames  = new lv_obj_t*[1]{ nameLbl };
    labelValues = new lv_obj_t*[1]{ valLbl  };

    lv_scr_load(scr);
    lv_task_handler();
    Serial.println("[DEBUG] Single-plotter ready with continuous scrolling");
}

// ——————————————————————————————————————————————————————————
// Multi-sensor plotter
// ——————————————————————————————————————————————————————————
void DisplayManager::createMultiPlotterScreen(const JsonDocument &configDoc) {
    Serial.println("[DEBUG] Starting createMultiPlotterScreen");
    
    // Clean up any existing static resources first
    cleanupStaticResources();
    
    // Clear class members
    chartMap.clear();
    sensorTagToIndex.clear();
    
    delete[] labelNames;
    labelNames = nullptr;
    
    delete[] labelValues;
    labelValues = nullptr;

    // (reuse same config keys as single)
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

    bool showLegend           = configDoc["lvgl_plotter"]["show_legend"]             | true;
    bool legendInside         = configDoc["lvgl_plotter"]["position_legend_inside"] | false;
    bool chartOutlineVisible  = configDoc["lvgl_plotter"]["chart_outline_visible"]  | true;
    int historyPoints         = configDoc["lvgl_plotter"]["history_points_to_show"] | 100;
    int gridDensity           = configDoc["lvgl_plotter"]["grid_density"]           | 5;
    bool showUnits            = configDoc["lvgl_plotter"]["show_units"]             | true;
    // Get scroll rate (in ms) - default to 100ms (10fps)
    int scrollRate            = configDoc["lvgl_plotter"]["scroll_rate_ms"]         | 100;

    uint16_t w = device->width(), h = device->height();
    if(device->getRotation()==90||device->getRotation()==270) std::swap(w,h);
    Serial.printf("[DEBUG] Screen %dx%d\n", w,h);

    auto parseColor = [](const char* s){
      uint32_t v = strtol(s+1,nullptr,16);
      return lv_color_make((v>>16)&0xFF,(v>>8)&0xFF,v&0xFF);
    };
    lv_color_t bgCol  = parseColor(backgroundColorStr);
    lv_color_t txtCol = parseColor(textColorStr);
    lv_color_t brdCol = parseColor(borderColorStr);

    // Base
    lv_obj_t* scr = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(scr,bgCol,LV_PART_MAIN);
    lv_obj_t* mainC = lv_obj_create(scr);
    lv_obj_remove_style_all(mainC);
    int mw = w-leftMargin-rightMargin;
    int mh = h-topMargin-bottomMargin;
    lv_obj_set_size(mainC,mw,mh);
    lv_obj_set_pos(mainC,leftMargin,topMargin);

    // Layout sensors (max 4)
    auto layout = configDoc["layout"].as<JsonArrayConst>();
    int count = std::min((int)layout.size(),4);
    sensorTagToIndex.clear();
    chartMap.clear();

    labelNames  = new lv_obj_t*[count];
    labelValues = new lv_obj_t*[count];

    // Choose grid dims
    int rows=1, cols=1;
    if(count==2) cols=2;
    else if(count>=3) { cols=2; rows=2; }

    int pw = (mw-(cols-1)*outerPadding)/cols;
    int ph = (mh-(rows-1)*outerPadding)/rows;

    for(int i=0;i<count;i++){
      int r=i/cols, c=i%cols;
      auto e = layout[i].as<JsonObjectConst>();
      const char* sensorId = e["id"].as<const char*>();
      const char* label    = e["label"]|sensorId;
      const char* unit     = e["unit"]|"";

      sensorTagToIndex[String(sensorId)] = i;
      // Also map by label if different from ID
      if (label && strcmp(label, sensorId) != 0) {
          sensorTagToIndex[String(label)] = i;
      }

      // Container
      lv_obj_t* pC = lv_obj_create(mainC);
      lv_obj_remove_style_all(pC);
      lv_obj_set_size(pC,pw,ph);
      lv_obj_set_pos(pC,c*(pw+outerPadding),r*(ph+outerPadding));

      // Chart container
      int chartH = (!showLegend||legendInside)? (ph-innerPadding*2)
                                               : ((ph-innerPadding*3)*4/5);
      lv_obj_t* chartC = lv_obj_create(pC);
      lv_obj_remove_style_all(chartC);
      int chartW = pw-innerPadding*2;
      lv_obj_set_size(chartC,chartW,chartH);
      lv_obj_align(chartC,LV_ALIGN_TOP_MID,0,innerPadding);
      if(borderVisible){
        lv_obj_set_style_border_width(chartC,borderThickness,0);
        lv_obj_set_style_border_color(chartC,brdCol,0);
      }

      // Chart
      lv_obj_t* chart = lv_chart_create(chartC);
      int cw = chartW-2*innerPadding;
      int ch = chartH-2*innerPadding;
      cw = std::max(cw,60); ch = std::max(ch,60);
      lv_obj_set_size(chart,cw,ch);
      lv_obj_center(chart);
      lv_chart_set_type(chart,LV_CHART_TYPE_LINE);
      lv_obj_set_style_bg_color(chart,bgCol,0);
      lv_chart_set_div_line_count(chart,gridDensity,gridDensity);
      lv_obj_set_style_line_color(chart,brdCol,LV_PART_MAIN);
      lv_obj_set_style_line_width(chart,1,LV_PART_MAIN);
      lv_obj_set_style_line_opa(chart,LV_OPA_30,LV_PART_MAIN);
      lv_obj_set_style_text_color(chart,txtCol,0);
      lv_obj_set_style_text_font(chart,&lv_font_montserrat_12,0);
      if(chartOutlineVisible){
        lv_obj_set_style_border_width(chart,1,LV_PART_MAIN);
        lv_obj_set_style_border_color(chart,brdCol,LV_PART_MAIN);
      }
      lv_chart_set_point_count(chart,historyPoints);
      lv_chart_set_range(chart,LV_CHART_AXIS_PRIMARY_Y,0,100);
      lv_chart_set_update_mode(chart,LV_CHART_UPDATE_MODE_SHIFT);

      lv_chart_series_t* ser = lv_chart_add_series(chart,txtCol,LV_CHART_AXIS_PRIMARY_Y);
      
      // Initialize all points with a consistent value to ensure the line is connected
      lv_coord_t initialValue = 0;
      for (uint16_t j = 0; j < historyPoints; j++) {
          lv_chart_set_next_value(chart, ser, initialValue);
      }
      
      // Initialize our global tracking with the initial value
      lastValues[ser] = initialValue;
      
      // Create a timer data structure that will persist
      TimerChartData* timerData = new TimerChartData{chart, ser, nullptr};
      
      // Create a timer for continuous scrolling
      timerData->timer = lv_timer_create(scroll_chart_timer_cb, scrollRate, timerData);
      
      // Add to our list for proper cleanup later
      timerDataList.push_back(timerData);
      
      chartMap[String(sensorId)] = { chart, ser, 100.0f };

      // Legend/value labels
      lv_obj_t* nameLbl=nullptr;
      lv_obj_t* valLbl =nullptr;
      if(showLegend){
        if(legendInside){
          lv_obj_t* lg = lv_obj_create(chart);
          lv_obj_remove_style_all(lg);
          lv_obj_set_style_bg_color(lg,bgCol,0);
          lv_obj_set_style_bg_opa(lg,LV_OPA_70,0);
          lv_obj_set_style_pad_all(lg,5,0);
          lv_obj_align(lg,LV_ALIGN_TOP_RIGHT,-10,10);

          nameLbl = lv_label_create(lg);
          lv_obj_set_style_text_color(nameLbl,txtCol,0);
          lv_obj_set_style_text_font(nameLbl,&lv_font_montserrat_12,0);
          if(showUnits && *unit){
            lv_label_set_text_fmt(nameLbl,"%s (%s): ",label,unit);
          } else {
            lv_label_set_text_fmt(nameLbl,"%s: ",label);
          }

          valLbl = lv_label_create(lg);
          lv_obj_set_style_text_color(valLbl,txtCol,0);
          lv_obj_set_style_text_font(valLbl,&lv_font_montserrat_12,0);
          lv_obj_align_to(valLbl,nameLbl,LV_ALIGN_OUT_RIGHT_MID,5,0);
          lv_label_set_text(valLbl,"N/A");

        } else {
          lv_obj_t* bot = lv_obj_create(pC);
          lv_obj_remove_style_all(bot);
          int bh = (ph-innerPadding*3)/5;
          lv_obj_set_size(bot,chartW,bh);
          lv_obj_align(bot,LV_ALIGN_BOTTOM_MID,0,-innerPadding);

          lv_obj_t* flex = lv_obj_create(bot);
          lv_obj_remove_style_all(flex);
          lv_obj_set_size(flex,chartW,LV_SIZE_CONTENT);
          lv_obj_set_style_pad_all(flex,0,0);
          lv_obj_align(flex,LV_ALIGN_CENTER,0,0);
          lv_obj_set_flex_flow(flex,LV_FLEX_FLOW_ROW);
          lv_obj_set_flex_align(flex,LV_FLEX_ALIGN_SPACE_EVENLY,
                                LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

          nameLbl = lv_label_create(flex);
          lv_obj_set_style_text_color(nameLbl,txtCol,0);
          const lv_font_t* f = (count<=2)? getGridFont(24)
                                         : &lv_font_montserrat_16;
          lv_obj_set_style_text_font(nameLbl,f,0);
          lv_label_set_text_fmt(nameLbl,"%s: ",label);

          valLbl = lv_label_create(flex);
          lv_obj_set_style_text_color(valLbl,txtCol,0);
          lv_obj_set_style_text_font(valLbl,f,0);
          lv_label_set_text(valLbl,"N/A");
        }
      }

      labelNames[i]  = nameLbl;
      labelValues[i] = valLbl;
    }

    lv_scr_load(scr);
    lv_task_handler();
    Serial.printf("[DEBUG] Multi-plotter ready with continuous scrolling (rate: %dms)\n", scrollRate);
}

// ——————————————————————————————————————————————————————————
// Chart update helper
// ——————————————————————————————————————————————————————————
void DisplayManager::updateChartData(const String& sensorTag, float value) {
    auto it = chartMap.find(sensorTag);
    if(it==chartMap.end()) {
      Serial.printf("[ERROR] '%s' not in chartMap\n", sensorTag.c_str());
      return;
    }
    ChartInfo& ci = it->second;
    if(!ci.chart || !ci.series) {
      Serial.printf("[ERROR] Null chart/series for '%s'\n", sensorTag.c_str());
      return;
    }

    // FIXED: Don't add to chart directly, just update the buffer value
    // lv_chart_set_next_value(ci.chart, ci.series, value);
    
    // Update our global tracking - this is the only operation we need
    lastValues[ci.series] = value;

    // Auto-scale if needed
    if(value > ci.maxValue) {
      ci.maxValue = value * 1.2f;
      lv_chart_set_range(ci.chart, LV_CHART_AXIS_PRIMARY_Y, 0, (int)ci.maxValue);
      Serial.printf("[DEBUG] Rescaled '%s' to 0–%d\n",
                    sensorTag.c_str(), (int)ci.maxValue);
    }
}

// No need to add anything to DisplayManager.h - all handled in the cpp file