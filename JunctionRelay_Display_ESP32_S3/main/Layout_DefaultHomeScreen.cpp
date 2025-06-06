#include "Layout_DefaultHomeScreen.h"
#include "DisplayManager.h"
#include "Utils.h"  // Added this include to access getFirmwareVersion()
#include <esp_system.h>

Layout_DefaultHomeScreen::Layout_DefaultHomeScreen(DisplayManager* displayManager)
  : mDisplayManager(displayManager)
  , mIsCreated(false)
  , mScreen(nullptr)
  , mMainContainer(nullptr)
  , mTitleLabel(nullptr)
  , mStatusLabel(nullptr)
  , mRotateBtn(nullptr)
  , mResetBtn(nullptr)
  , mLastConfigJson("")
  , mLastRotation(-1)
{}

Layout_DefaultHomeScreen::~Layout_DefaultHomeScreen() {
    destroyTimers();
    destroy();
}

void Layout_DefaultHomeScreen::create(const JsonDocument &cfg) {
    // 1) Serialize config (even if unused) and get rotation
    String cfgJson;
    serializeJson(cfg, cfgJson);
    auto dev = mDisplayManager->getDevice();
    int rot = dev->getRotation();

    // 2) If already created & neither config nor rotation changed → just update
    if (mIsCreated && cfgJson == mLastConfigJson && rot == mLastRotation) {
        update(cfg);
        return;
    }

    // 3) Tear down existing UI
    if (mIsCreated) {
        destroyTimers();
        destroy();
    }

    // 4) Build UI sized to current rotation
    uint16_t scrW = dev->width();
    uint16_t scrH = dev->height();
    const int MARGIN = 50;

    // Base screen
    mScreen = lv_obj_create(nullptr);
    lv_obj_set_size(mScreen, scrW, scrH);
    lv_obj_set_style_bg_color(mScreen, lv_color_black(), LV_PART_MAIN);

    // Main container
    mMainContainer = lv_obj_create(mScreen);
    int w = scrW - 2 * MARGIN;
    int h = scrH - 2 * MARGIN;
    lv_obj_set_size(mMainContainer, w, h);
    lv_obj_set_pos(mMainContainer, MARGIN, MARGIN);
    lv_obj_set_style_bg_color(mMainContainer, lv_color_black(), LV_PART_MAIN);
    lv_obj_set_style_border_width(mMainContainer, 0, LV_PART_MAIN);

    // Title - Updated to show firmware version instead of "JunctionRelay"
    mTitleLabel = lv_label_create(mMainContainer);
    lv_label_set_text(mTitleLabel, getFirmwareVersion());  // Use the utility function
    lv_obj_set_style_text_color(mTitleLabel, lv_color_white(), LV_PART_MAIN);
    lv_obj_set_style_text_font(mTitleLabel, &lv_font_montserrat_24, LV_PART_MAIN);
    lv_obj_align(mTitleLabel, LV_ALIGN_TOP_LEFT, 0, 0);

    // Status
    mStatusLabel = lv_label_create(mMainContainer);
    lv_obj_set_style_text_color(mStatusLabel, lv_color_make(0xFF,0xFF,0x00), LV_PART_MAIN);
    lv_obj_set_style_text_font(mStatusLabel, &lv_font_montserrat_24, LV_PART_MAIN);
    lv_obj_align(mStatusLabel, LV_ALIGN_TOP_LEFT, 0, 40);
    ConnectionStatus status = mDisplayManager->getConnectionManager().getConnectionStatus();
        String currentStatus = 
            String("ESP-NOW: ") + (status.espNowActive ? "Active\n" : "Inactive\n") +
            "WiFi: " + (status.wifiConnected ? "Connected\n" : "Disconnected\n");

    if (status.wifiConnected) {
        currentStatus += "IP: " + status.ipAddress + "\n";
        currentStatus += "MAC: " + status.macAddress + "\n";
    }

currentStatus += "MQTT: " + String(status.mqttConnected ? "Connected\n" : "Disconnected\n");
    lv_label_set_text(mStatusLabel, currentStatus.c_str());

    // Rotate button
    mRotateBtn = lv_btn_create(mMainContainer);
    lv_obj_set_size(mRotateBtn, 100, 50);
    lv_obj_align(mRotateBtn, LV_ALIGN_BOTTOM_LEFT, 0, 0);
    lv_obj_add_event_cb(mRotateBtn, rotate_event_cb, LV_EVENT_CLICKED, this);
    {
        lv_obj_t* lbl = lv_label_create(mRotateBtn);
        lv_label_set_text(lbl, "Rotate");
        lv_obj_center(lbl);
    }

    // Reset button
    mResetBtn = lv_btn_create(mMainContainer);
    lv_obj_set_size(mResetBtn, 100, 50);
    lv_obj_align(mResetBtn, LV_ALIGN_BOTTOM_LEFT, 110, 0);
    lv_obj_add_event_cb(mResetBtn, reset_event_cb, LV_EVENT_CLICKED, this);
    {
        lv_obj_t* lbl = lv_label_create(mResetBtn);
        lv_label_set_text(lbl, "Reset");
        lv_obj_center(lbl);
    }

    // Show
    mIsCreated = true;

    // 5) Cache values
    mLastConfigJson = cfgJson;
    mLastRotation   = rot;
}

void Layout_DefaultHomeScreen::destroy() {
    if (!mIsCreated) return;
    if (mScreen) {
        lv_obj_del(mScreen);
        mScreen = nullptr;
    }
    mMainContainer = nullptr;
    mTitleLabel    = nullptr;
    mStatusLabel   = nullptr;
    mRotateBtn     = nullptr;
    mResetBtn      = nullptr;
    mIsCreated     = false;
}

void Layout_DefaultHomeScreen::update(const JsonDocument &sensorDoc) {
    if (!mIsCreated || !mStatusLabel) return;
    if (sensorDoc.containsKey("status")) {
        String status = sensorDoc["status"].as<String>();
        lv_label_set_text(mStatusLabel, status.c_str());
    }
}

lv_obj_t* Layout_DefaultHomeScreen::getScreen() const {
    return mScreen;
}

void Layout_DefaultHomeScreen::destroyTimers() {
    for (auto t : mTimers) lv_timer_del(t);
    mTimers.clear();
}

// Event callbacks
void Layout_DefaultHomeScreen::rotate_event_cb(lv_event_t* e) {
    auto* self = static_cast<Layout_DefaultHomeScreen*>(lv_event_get_user_data(e));
    if (self) self->handleRotate();
}
void Layout_DefaultHomeScreen::reset_event_cb(lv_event_t* e) {
    auto* self = static_cast<Layout_DefaultHomeScreen*>(lv_event_get_user_data(e));
    if (self) self->handleReset();
}

void Layout_DefaultHomeScreen::handleRotate() {
    auto dev = mDisplayManager->getDevice();
    dev->rotateDisplay();
    Preferences prefs;
    prefs.begin("connConfig", false);
    prefs.putInt("rotation", dev->getRotation());
    prefs.end();
    // next create() will detect rotation change and rebuild
    mDisplayManager->createHomeScreen();
}

void Layout_DefaultHomeScreen::handleReset() {
    Preferences prefs;
    prefs.begin("connConfig", false);
    prefs.clear();
    prefs.end();
    esp_restart();
}