#include "Layout_RadioScreen.h"
#include "DisplayManager.h"
#include "DeviceConfig.h"
#include <ArduinoJson.h>
#include <cstring>
#include <cstdlib>

// Static callback function for indicator updates
void Layout_RadioScreen::indicatorUpdateCallback(lv_event_t* e) {
    auto bar = lv_event_get_target(e);
    auto data = static_cast<IndicatorData*>(lv_event_get_user_data(e));
    if (!data || !data->triangle || !data->label) return;
    
    int value = lv_bar_get_value(bar);
    int width = lv_obj_get_width(bar);
    
    // Calculate the position based on the value (0-100) and bar width
    // The calculation centers the triangle on the bar position
    int triangle_width = 20; // Triangle width from the drawing code
    int x_pos = lv_obj_get_x(bar) + ((width * value) / 100) - (triangle_width / 2);
    
    // Set triangle position and update the label text
    lv_obj_set_x(data->triangle, x_pos);
    lv_label_set_text_fmt(data->label, "%d", value);
    lv_obj_align_to(data->label, data->triangle, LV_ALIGN_OUT_TOP_MID, 0, -5);
    
    // Debug output
    Serial.printf("[DEBUG] Bar value: %d, width: %d, x_pos: %d\n", value, width, x_pos);
}

// Constructor / Destructor
Layout_RadioScreen::Layout_RadioScreen(DisplayManager* displayManager)
    : mDisplayManager(displayManager)
    , mIsCreated(false)
    , mScreen(nullptr)
    , mLabelNames(nullptr)
    , mLabelValues(nullptr)
    , mSensorCount(0)
{}

Layout_RadioScreen::~Layout_RadioScreen() {
    destroyTimers();
    destroy();
}

lv_color_t Layout_RadioScreen::parseColor(const char* c, lv_color_t defaultColor) {
    if (!c || c[0] != '#' || std::strlen(c) < 7) return defaultColor;
    long hex = std::strtoul(c + 1, nullptr, 16);
    return lv_color_make((hex >> 16) & 0xFF,
                         (hex >>  8) & 0xFF,
                          hex        & 0xFF);
}

const lv_font_t* Layout_RadioScreen::getGridFont(int size) {
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

void Layout_RadioScreen::create(const JsonDocument &configDoc) {
    Serial.println("[DEBUG] Starting Layout_RadioScreen::create");
    
    if (mIsCreated) {
        destroyTimers();
        destroy();
    }
    
    // Clear state
    mSensorBarMap.clear();
    mSensorTagToIndex.clear();
    
    delete[] mLabelNames;
    mLabelNames = nullptr;
    
    delete[] mLabelValues;
    mLabelValues = nullptr;
    
    // Clean up indicators
    for (auto indicator : mIndicators) {
        delete indicator;
    }
    mIndicators.clear();

    // 1) Get screen dimensions
    uint16_t w = mDisplayManager->getDevice()->width();
    uint16_t h = mDisplayManager->getDevice()->height();
    uint8_t rot = mDisplayManager->getDevice()->getRotation();
    if (rot == 90 || rot == 270) std::swap(w, h);

    // 2-3) Default colors and parse from config
    lv_color_t bgColor = lv_color_black();
    lv_color_t textColor = lv_color_white();
    lv_color_t borderColor = lv_color_white();

    auto radioCfg = configDoc["lvgl_radio"];
    bgColor = parseColor(radioCfg["background_color"] | "#000000", bgColor);
    textColor = parseColor(radioCfg["text_color"] | "#FFFFFF", textColor);
    borderColor = parseColor(radioCfg["border_color"] | "#FFFFFF", borderColor);

    // 4) Get styling properties
    bool borderVisible = radioCfg["border_visible"] | false;
    int borderThickness = radioCfg["border_thickness"] | 2;
    bool roundedCorners = radioCfg["rounded_corners"] | false;
    int borderRadiusSize = radioCfg["border_radius_size"] | 40;
    int opacityPct = radioCfg["opacity_percentage"] | 100;
    lv_opa_t bgOpacity = (opacityPct * 255) / 100;

    // 5) Create base screen
    mScreen = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(mScreen, bgColor, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(mScreen, bgOpacity, LV_PART_MAIN);

    // 6) Calculate margins and dimensions
    int topM = radioCfg["top_margin"] | 0;
    int botM = radioCfg["bottom_margin"] | 0;
    int leftM = radioCfg["left_margin"] | 0;
    int rightM = radioCfg["right_margin"] | 0;
    int outerP = radioCfg["outer_padding"] | 0;
    int innerP = radioCfg["inner_padding"] | 0;

    int availW = w - leftM - rightM;
    int availH = h - topM - botM;

    // 7) Create top & bottom containers
    auto setupCont = [&](lv_obj_t* cont, int x, int y) {
        lv_obj_set_pos(cont, x, y);
        lv_obj_set_size(cont, availW, availH / 3);
        // Force correct background
        lv_obj_set_style_bg_color(cont, bgColor, LV_PART_MAIN);
        lv_obj_set_style_bg_opa(cont, bgOpacity, LV_PART_MAIN);
        // Apply or clear border
        if (borderVisible) {
            lv_obj_set_style_border_width(cont, borderThickness, LV_PART_MAIN);
            lv_obj_set_style_border_color(cont, borderColor, LV_PART_MAIN);
        } else {
            lv_obj_set_style_border_width(cont, 0, LV_PART_MAIN);
        }
        // Apply rounded corners if enabled
        if (roundedCorners) {
            lv_obj_set_style_radius(cont, borderRadiusSize, LV_PART_MAIN);
        } else {
            lv_obj_set_style_radius(cont, 0, LV_PART_MAIN);
        }
        lv_obj_clear_flag(cont, LV_OBJ_FLAG_SCROLLABLE);
    };

    lv_obj_t* topCont = lv_obj_create(mScreen);
    setupCont(topCont, leftM, topM);

    lv_obj_t* botCont = lv_obj_create(mScreen);
    setupCont(botCont, leftM, topM + 2 * (availH / 3));

    // 8) Create the bars
    lv_obj_t* topBar = lv_bar_create(topCont);
    lv_bar_set_range(topBar, 0, 100);
    lv_obj_set_size(topBar, availW * 0.9f, 10);
    lv_obj_align(topBar, LV_ALIGN_CENTER, 0, 0);
    // White track + white fill
    lv_obj_set_style_bg_color(topBar, textColor, LV_PART_MAIN);
    lv_obj_set_style_bg_color(topBar, textColor, LV_PART_INDICATOR);

    lv_obj_t* botBar = lv_bar_create(botCont);
    lv_bar_set_range(botBar, 0, 100);
    lv_obj_set_size(botBar, availW * 0.9f, 10);
    lv_obj_align(botBar, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_bg_color(botBar, textColor, LV_PART_MAIN);
    lv_obj_set_style_bg_color(botBar, textColor, LV_PART_INDICATOR);

    // 9) Create tick marks
    static lv_point_t ticks[] = {{0, 0}, {0, 15}};
    for (int v = 0; v <= 100; v += 20) {
        float wbar = availW * 0.9f;
        int x0 = int((availW - wbar) / 2 + wbar * v / 100) - 1;
        
        // Top ticks
        {
            lv_obj_t* ln = lv_line_create(topCont);
            lv_line_set_points(ln, ticks, 2);
            lv_obj_set_style_line_color(ln, textColor, 0);
            lv_obj_set_style_line_width(ln, 2, 0);
            lv_obj_set_pos(ln, x0, lv_obj_get_y(topBar) + 42);

            lv_obj_t* lb = lv_label_create(topCont);
            lv_obj_set_style_text_color(lb, textColor, 0);
            lv_obj_set_style_text_font(lb, &lv_font_montserrat_16, 0);
            lv_label_set_text_fmt(lb, "%d", v);
            lv_obj_set_pos(lb, x0 - 5, lv_obj_get_y(topBar) + 62);
        }
        
        // Bottom ticks
        {
            lv_obj_t* ln = lv_line_create(botCont);
            lv_line_set_points(ln, ticks, 2);
            lv_obj_set_style_line_color(ln, textColor, 0);
            lv_obj_set_style_line_width(ln, 2, 0);
            lv_obj_set_pos(ln, x0, lv_obj_get_y(botBar) + 42);

            lv_obj_t* lb = lv_label_create(botCont);
            lv_obj_set_style_text_color(lb, textColor, 0);
            lv_obj_set_style_text_font(lb, &lv_font_montserrat_16, 0);
            lv_label_set_text_fmt(lb, "%d", v);
            lv_obj_set_pos(lb, x0 - 5, lv_obj_get_y(botBar) + 62);
        }
    }

    // 10) Create triangles & their labels
    // Top triangle
    lv_obj_t* topTri = lv_canvas_create(topCont);
    static lv_color_t buf1[LV_CANVAS_BUF_SIZE_TRUE_COLOR(20, 20)];
    lv_canvas_set_buffer(topTri, buf1, 20, 20, LV_IMG_CF_TRUE_COLOR);
    lv_canvas_fill_bg(topTri, bgColor, LV_OPA_COVER);
    lv_point_t poly[3] = {{10, 20}, {0, 0}, {20, 0}};
    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color = lv_palette_main(LV_PALETTE_RED);
    lv_canvas_draw_polygon(topTri, poly, 3, &dsc);
    lv_obj_align_to(topTri, topBar, LV_ALIGN_OUT_TOP_MID, 0, -5);

    // Bottom triangle
    lv_obj_t* botTri = lv_canvas_create(botCont);
    static lv_color_t buf2[LV_CANVAS_BUF_SIZE_TRUE_COLOR(20, 20)];
    lv_canvas_set_buffer(botTri, buf2, 20, 20, LV_IMG_CF_TRUE_COLOR);
    lv_canvas_fill_bg(botTri, bgColor, LV_OPA_COVER);
    lv_canvas_draw_polygon(botTri, poly, 3, &dsc);
    lv_obj_align_to(botTri, botBar, LV_ALIGN_OUT_TOP_MID, 0, -5);

    // Triangle value labels
    lv_obj_t* topVal = lv_label_create(topCont);
    lv_label_set_text(topVal, "0");
    lv_obj_set_style_text_color(topVal, textColor, 0);
    lv_obj_set_style_text_font(topVal, &lv_font_montserrat_20, 0);
    lv_obj_align_to(topVal, topTri, LV_ALIGN_OUT_TOP_MID, 0, -5);

    lv_obj_t* botVal = lv_label_create(botCont);
    lv_label_set_text(botVal, "0");
    lv_obj_set_style_text_color(botVal, textColor, 0);
    lv_obj_set_style_text_font(botVal, &lv_font_montserrat_20, 0);
    lv_obj_align_to(botVal, botTri, LV_ALIGN_OUT_TOP_MID, 0, -5);

    // 11) Create mid-screen flex area (digital readouts)
    lv_obj_t* mid = lv_obj_create(mScreen);
    // Force the same background
    lv_obj_set_style_bg_color(mid, bgColor, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(mid, bgOpacity, LV_PART_MAIN);
    lv_obj_clear_flag(mid, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(mid, availW, availH / 3);
    lv_obj_set_pos(mid, leftM, topM + availH / 3);
    
    // Apply rounded corners to mid section if enabled
    if (roundedCorners) {
        lv_obj_set_style_radius(mid, borderRadiusSize, LV_PART_MAIN);
    } else {
        lv_obj_set_style_radius(mid, 0, LV_PART_MAIN);
    }
    
    // Apply border to mid section if enabled
    if (borderVisible) {
        lv_obj_set_style_border_width(mid, borderThickness, LV_PART_MAIN);
        lv_obj_set_style_border_color(mid, borderColor, LV_PART_MAIN);
    } else {
        lv_obj_set_style_border_width(mid, 0, LV_PART_MAIN);
    }

    // Prepare for label arrays
    const JsonArrayConst& layout = configDoc["layout"].as<JsonArrayConst>();
    mSensorCount = layout.size();
    
    // Allocate for sensor labels
    mLabelNames = new lv_obj_t*[mSensorCount];
    mLabelValues = new lv_obj_t*[mSensorCount];
    
    // Initialize arrays
    for (int i = 0; i < mSensorCount; i++) {
        mLabelNames[i] = nullptr;
        mLabelValues[i] = nullptr;
    }

    // Parse text sizes with defaults
    int labelSize = radioCfg["label_size"] | 28;
    int valueSize = radioCfg["value_size"] | 28;
    
    // Get text alignment with default
    const char* alignStr = radioCfg["text_alignment"] | "center";
    lv_text_align_t textAlign = LV_TEXT_ALIGN_CENTER;
    if (std::strcmp(alignStr, "left") == 0) textAlign = LV_TEXT_ALIGN_LEFT;
    if (std::strcmp(alignStr, "right") == 0) textAlign = LV_TEXT_ALIGN_RIGHT;

    // Middle section: Add digital displays for sensors 2 and 3
    // Sensor 2 (Left middle readout)
    if (mSensorCount > 1) {
        // Create a container for Sensor 2
        lv_obj_t* sensor2Container = lv_obj_create(mid);
        lv_obj_remove_style_all(sensor2Container);
        lv_obj_set_size(sensor2Container, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
        lv_obj_set_style_pad_all(sensor2Container, 0, 0);
        lv_obj_align(sensor2Container, LV_ALIGN_LEFT_MID, 20, 0);

        // Create flex layout
        lv_obj_set_flex_flow(sensor2Container, LV_FLEX_FLOW_ROW);
        lv_obj_set_flex_align(sensor2Container, LV_FLEX_ALIGN_START, 
                             LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

        // Add name label
        lv_obj_t* sensor2NameLabel = lv_label_create(sensor2Container);
        lv_obj_set_style_text_color(sensor2NameLabel, textColor, 0);
        lv_obj_set_style_text_font(sensor2NameLabel, getGridFont(labelSize), 0);
        lv_obj_set_width(sensor2NameLabel, 120);
        lv_obj_set_style_text_align(sensor2NameLabel, textAlign, 0);
        lv_label_set_text(sensor2NameLabel, "Sensor 2: ");

        // Add spacer
        lv_obj_t* sensor2Spacer = lv_obj_create(sensor2Container);
        lv_obj_remove_style_all(sensor2Spacer);
        lv_obj_set_size(sensor2Spacer, 10, 1);

        // Add value label
        lv_obj_t* sensor2ValueLabel = lv_label_create(sensor2Container);
        lv_obj_set_style_text_color(sensor2ValueLabel, textColor, 0);
        lv_obj_set_style_text_font(sensor2ValueLabel, getGridFont(valueSize), 0);
        lv_obj_set_width(sensor2ValueLabel, 150);
        lv_obj_set_style_text_align(sensor2ValueLabel, textAlign, 0);
        lv_label_set_text(sensor2ValueLabel, "N/A");
        
        // Store for updates
        mLabelNames[1] = sensor2NameLabel;
        mLabelValues[1] = sensor2ValueLabel;
    }

    // Sensor 3 (Right middle readout)
    if (mSensorCount > 2) {
        // Create a container for Sensor 3
        lv_obj_t* sensor3Container = lv_obj_create(mid);
        lv_obj_remove_style_all(sensor3Container);
        lv_obj_set_width(sensor3Container, 280);
        lv_obj_set_height(sensor3Container, LV_SIZE_CONTENT);
        lv_obj_set_style_pad_all(sensor3Container, 0, 0);
        lv_obj_align(sensor3Container, LV_ALIGN_RIGHT_MID, -20, 0);

        // Create flex layout
        lv_obj_set_flex_flow(sensor3Container, LV_FLEX_FLOW_ROW);
        lv_obj_set_flex_align(sensor3Container, LV_FLEX_ALIGN_START, 
                             LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

        // Add name label
        lv_obj_t* sensor3NameLabel = lv_label_create(sensor3Container);
        lv_obj_set_style_text_color(sensor3NameLabel, textColor, 0);
        lv_obj_set_style_text_font(sensor3NameLabel, getGridFont(labelSize), 0);
        lv_obj_set_width(sensor3NameLabel, 120);
        lv_obj_set_style_text_align(sensor3NameLabel, textAlign, 0);
        lv_label_set_text(sensor3NameLabel, "Sensor 3: ");

        // Add spacer
        lv_obj_t* sensor3Spacer = lv_obj_create(sensor3Container);
        lv_obj_remove_style_all(sensor3Spacer);
        lv_obj_set_size(sensor3Spacer, 10, 1);

        // Add value label
        lv_obj_t* sensor3ValueLabel = lv_label_create(sensor3Container);
        lv_obj_set_style_text_color(sensor3ValueLabel, textColor, 0);
        lv_obj_set_style_text_font(sensor3ValueLabel, getGridFont(valueSize), 0);
        lv_obj_set_width(sensor3ValueLabel, 150);
        lv_obj_set_style_text_align(sensor3ValueLabel, textAlign, 0);
        lv_label_set_text(sensor3ValueLabel, "N/A");
        
        // Store for updates
        mLabelNames[2] = sensor3NameLabel;
        mLabelValues[2] = sensor3ValueLabel;
    }

    // 12) Indicators callback setup
    // Top indicator
    IndicatorData* topData = new IndicatorData{topTri, topVal};
    mIndicators.push_back(topData);
    lv_obj_add_event_cb(topBar, indicatorUpdateCallback, LV_EVENT_VALUE_CHANGED, topData);
    
    // Bottom indicator
    IndicatorData* botData = new IndicatorData{botTri, botVal};
    mIndicators.push_back(botData);
    lv_obj_add_event_cb(botBar, indicatorUpdateCallback, LV_EVENT_VALUE_CHANGED, botData);

    // 13) Finally wire up sensor→bar mapping
    mSensorBarMap.clear();
    for (int i = 0; i < mSensorCount; ++i) {
        String id = layout[i]["id"].as<const char*>();
        mSensorTagToIndex[id] = i;
        
        // Map by label too, if present
        const char* label = layout[i]["label"].as<const char*>();
        if (label) {
            mSensorTagToIndex[String(label)] = i;
        }
        
        // Connect to the correct bar
        if (i == 0) {
            mSensorBarMap["__bar_" + id] = topBar;
            mLabelNames[0] = nullptr;  // No label for bar sensors
            mLabelValues[0] = topVal;  // Store value label
        }
        if (i == 3) {
            mSensorBarMap["__bar_" + id] = botBar;
            mLabelNames[3] = nullptr;  // No label for bar sensors
            mLabelValues[3] = botVal;  // Store value label
        }
    }

    lv_scr_load(mScreen);
    lv_task_handler();
    mIsCreated = true;
    Serial.println("[DEBUG] Radio screen created");
}

void Layout_RadioScreen::destroy() {
    if (!mIsCreated) return;
    
    Serial.println("[DEBUG] Destroying radio screen");
    
    // Clean up timers first
    destroyTimers();
    
    // Delete label arrays
    delete[] mLabelNames;
    mLabelNames = nullptr;
    
    delete[] mLabelValues;
    mLabelValues = nullptr;
    
    // Clean up indicators
    for (auto indicator : mIndicators) {
        delete indicator;
    }
    mIndicators.clear();
    
    // Delete screen (which deletes all child objects)
    if (mScreen) {
        lv_obj_del(mScreen);
        mScreen = nullptr;
    }
    
    // Clear all maps
    mSensorTagToIndex.clear();
    mSensorBarMap.clear();
    
    mIsCreated = false;
    Serial.println("[DEBUG] Radio screen destroyed");
}

void Layout_RadioScreen::destroyTimers() {
    Serial.println("[DEBUG] Destroying radio timers");
    
    // Delete all timer objects
    for (auto timer : mTimers) {
        if (timer) {
            lv_timer_del(timer);
        }
    }
    
    mTimers.clear();
}

void Layout_RadioScreen::update(const JsonDocument &doc) {
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
        
        // Update bar if this is a bar sensor
        String barKey = "__bar_" + String(tag);
        auto barIt = mSensorBarMap.find(barKey);
        if (barIt != mSensorBarMap.end() && vs) {
            int value = atoi(vs);
            // Set the bar value which triggers the callback
            lv_bar_set_value(barIt->second, value, LV_ANIM_ON);
            
            // Immediately trigger the event callback to update indicator position
            // This is important since sometimes the event callback isn't triggered automatically
            lv_event_t e;
            lv_event_send(barIt->second, LV_EVENT_VALUE_CHANGED, nullptr);
        }
        
        // Update label values if they exist
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

void Layout_RadioScreen::registerSensors(const JsonDocument &configDoc) {
    auto layout = configDoc["layout"].as<JsonArrayConst>();
    for (auto v : layout) {
        if (v.containsKey("id")) {
            String id = v["id"].as<String>();
            Serial.printf("[DEBUG] Radio register sensor: %s\n", id.c_str());
        }
    }
}

lv_obj_t* Layout_RadioScreen::getScreen() const {
    return mScreen;
}