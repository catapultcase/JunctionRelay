#include "Layout_GridScreen.h"
#include "DisplayManager.h"
#include "DeviceConfig.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <cstring>
#include <cstdlib>

// Constructor / Destructor
Layout_GridScreen::Layout_GridScreen(DisplayManager* displayManager)
    : mDisplayManager(displayManager)
    , mIsCreated(false)
    , mScreen(nullptr)
    , mLabelNames(nullptr)
    , mLabelValues(nullptr)
    , mGridRows(0)
    , mGridCols(0)
    , mSensorCount(0)
{}

Layout_GridScreen::~Layout_GridScreen() {
    destroyTimers();
    destroy();
}

lv_color_t Layout_GridScreen::parseColor(const char* c) {
    if (!c || c[0] != '#' || std::strlen(c) < 7) return lv_color_black();
    long hex = std::strtoul(c + 1, nullptr, 16);
    return lv_color_make((hex >> 16) & 0xFF,
                         (hex >>  8) & 0xFF,
                          hex        & 0xFF);
}

const lv_font_t* Layout_GridScreen::getGridFont(int size) {
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

void Layout_GridScreen::create(const JsonDocument &cfg) {
    if (mIsCreated) {
        destroyTimers();
        destroy();
    }

    mGridRows = cfg["lvgl_grid"]["rows"] | 2;
    mGridCols = cfg["lvgl_grid"]["columns"] | 2;
    JsonArrayConst layout = cfg["layout"].as<JsonArrayConst>();
    mSensorCount = layout.size();

    int topMargin    = cfg["lvgl_grid"]["top_margin"]    | 0;
    int bottomMargin = cfg["lvgl_grid"]["bottom_margin"] | 0;
    int leftMargin   = cfg["lvgl_grid"]["left_margin"]   | 0;
    int rightMargin  = cfg["lvgl_grid"]["right_margin"]  | 0;
    int outerPadding = cfg["lvgl_grid"]["outer_padding"] | 0;
    int innerPadding = cfg["lvgl_grid"]["inner_padding"] | 0;

    bool borderVisible    = cfg["lvgl_grid"]["border_visible"]   | false;
    int  borderThickness  = cfg["lvgl_grid"]["border_thickness"]  | 1;
    bool roundedCorners   = cfg["lvgl_grid"]["rounded_corners"]   | false;
    int  borderRadius     = cfg["lvgl_grid"]["border_radius_size"]| 0;
    int  opacityPct       = cfg["lvgl_grid"]["opacity_percentage"] | 100;
    lv_opa_t opa = (opacityPct * 255) / 100;

    const char* alignStr = cfg["lvgl_grid"]["text_alignment"] | "center";
    lv_text_align_t txtAlign = LV_TEXT_ALIGN_CENTER;
    if (strcmp(alignStr, "left") == 0)  txtAlign = LV_TEXT_ALIGN_LEFT;
    if (strcmp(alignStr, "right") == 0) txtAlign = LV_TEXT_ALIGN_RIGHT;

    auto parseSz = [&](const char* s, int def) {
        int f = def;
        if (s && sscanf(s, "%dpx", &f) != 1 && isdigit(s[0])) f = atoi(s);
        return f;
    };
    int lblSz = parseSz(cfg["lvgl_grid"]["label_size"] | "24px", 24);
    int valSz = parseSz(cfg["lvgl_grid"]["value_size"] | "24px", 24);
    const lv_font_t* lblFont = getGridFont(lblSz);
    const lv_font_t* valFont = getGridFont(valSz);

    lv_color_t bgColor     = parseColor(cfg["lvgl_grid"]["background_color"] | "#000000");
    lv_color_t borderColor = parseColor(cfg["lvgl_grid"]["border_color"]     | "#ffffff");
    lv_color_t textColor   = parseColor(cfg["lvgl_grid"]["text_color"]       | "#ffffff");

    uint16_t w = mDisplayManager->getDevice()->width();
    uint16_t h = mDisplayManager->getDevice()->height();
    int rot = mDisplayManager->getDevice()->getRotation();
    if (rot == 90 || rot == 270) std::swap(w, h);

    int cellW = (w - leftMargin - rightMargin - (mGridCols - 1) * outerPadding) / mGridCols;
    int cellH = (h - topMargin - bottomMargin - (mGridRows - 1) * outerPadding) / mGridRows;

    mScreen = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(mScreen, bgColor, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(mScreen, opa, LV_PART_MAIN);

    mLabelNames  = new lv_obj_t*[mSensorCount];
    mLabelValues = new lv_obj_t*[mSensorCount];
    mSensorTagToIndex.clear();

    for (int i = 0; i < mSensorCount; ++i) {
        int row = i / mGridCols, col = i % mGridCols;
        const char* lbl = layout[i]["label"].as<const char*>();
        const char* id  = layout[i]["id"] | lbl;

        mSensorTagToIndex[String(id)]  = i;
        mSensorTagToIndex[String(lbl)] = i;

        lv_obj_t* cell = lv_obj_create(mScreen);
        lv_obj_set_size(cell, cellW, cellH);
        lv_obj_set_style_bg_color(cell, bgColor, LV_PART_MAIN);
        lv_obj_set_style_bg_opa(cell, opa, LV_PART_MAIN);
        lv_obj_set_style_border_width(cell, borderVisible ? borderThickness : 0, LV_PART_MAIN);
        if (borderVisible) {
            lv_obj_set_style_border_color(cell, borderColor, LV_PART_MAIN);
        }
        lv_obj_set_style_radius(cell, roundedCorners ? borderRadius : 0, LV_PART_MAIN);
        lv_obj_clear_flag(cell, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_align(cell, LV_ALIGN_TOP_LEFT,
                     leftMargin + col * (cellW + outerPadding),
                     topMargin  + row * (cellH + outerPadding));

        mLabelNames[i] = lv_label_create(cell);
        lv_label_set_text(mLabelNames[i], lbl);
        lv_obj_set_style_text_font(mLabelNames[i], lblFont, LV_PART_MAIN);
        lv_obj_set_style_text_color(mLabelNames[i], textColor, LV_PART_MAIN);
        lv_obj_set_style_text_align(mLabelNames[i], txtAlign, LV_PART_MAIN);
        lv_obj_align(mLabelNames[i], LV_ALIGN_TOP_MID, 0, innerPadding);

        mLabelValues[i] = lv_label_create(cell);
        lv_label_set_text(mLabelValues[i], "");
        lv_obj_set_style_text_font(mLabelValues[i], valFont, LV_PART_MAIN);
        lv_obj_set_style_text_color(mLabelValues[i], textColor, LV_PART_MAIN);
        lv_obj_set_style_text_align(mLabelValues[i], txtAlign, LV_PART_MAIN);
        lv_obj_align(mLabelValues[i], LV_ALIGN_BOTTOM_MID, 0, -innerPadding);
    }

    mIsCreated = true;
}

void Layout_GridScreen::destroy() {
    if (!mIsCreated) return;
    delete[] mLabelNames;
    delete[] mLabelValues;
    mLabelNames = mLabelValues = nullptr;
    if (mScreen) lv_obj_del(mScreen);
    mScreen = nullptr;
    mSensorTagToIndex.clear();
    mIsCreated = false;
}

void Layout_GridScreen::update(const JsonDocument &doc) {
    if (!mIsCreated || !mLabelValues) return;
    auto root = doc.as<JsonObjectConst>();
    if (!root.containsKey("sensors")) return;
    auto sensors = root["sensors"].as<JsonObjectConst>();
    for (auto kv : sensors) {
        const char* tag = kv.key().c_str();
        auto arr = kv.value().as<JsonArrayConst>();
        if (arr.isNull() || arr.size() == 0) continue;
        auto obj = arr[0].as<JsonObjectConst>();
        const char* unit = obj["Unit"].as<const char*>();
        const char* vs   = obj["Value"].as<const char*>();
        auto it = mSensorTagToIndex.find(tag);
        if (it == mSensorTagToIndex.end()) continue;
        int idx = it->second;
        String txt = String(vs ? vs : "") + " " + String(unit ? unit : "");
        lv_label_set_text(mLabelValues[idx], txt.c_str());
    }
}

void Layout_GridScreen::registerSensors(const JsonDocument &cfg) {
    auto layout = cfg["layout"].as<JsonArrayConst>();
    for (auto v : layout) {
        if (v.containsKey("id")) {
            String id = v["id"].as<String>();
            Serial.printf("[DEBUG] Grid register sensor: %s\n", id.c_str());
        }
    }
}

lv_obj_t* Layout_GridScreen::getScreen() const {
    return mScreen;
}

void Layout_GridScreen::destroyTimers() {
    for (auto t : mTimers) {
        lv_timer_del(t);
    }
    mTimers.clear();
}
