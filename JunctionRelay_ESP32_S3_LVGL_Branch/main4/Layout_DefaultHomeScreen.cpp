#include "Layout_DefaultHomeScreen.h"
#include "Display_Manager_LVGL.h"
#include "Helper_Utils.h"
#include <Preferences.h>
#include <esp_system.h>

Layout_DefaultHomeScreen::Layout_DefaultHomeScreen(Display_Manager_LVGL* displayManager)
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
{
    // Add safety check in constructor
    if (!mDisplayManager) {
        Serial.println("[HOME_LAYOUT] ERROR: DisplayManager is null");
    }
}

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

    // Title - Show firmware version
    mTitleLabel = lv_label_create(mMainContainer);
    lv_label_set_text(mTitleLabel, getFirmwareVersion());
    lv_obj_set_style_text_color(mTitleLabel, lv_color_white(), LV_PART_MAIN);
    lv_obj_set_style_text_font(mTitleLabel, &lv_font_montserrat_24, LV_PART_MAIN);
    lv_obj_align(mTitleLabel, LV_ALIGN_TOP_LEFT, 0, 0);

    // Status
    mStatusLabel = lv_label_create(mMainContainer);
    lv_obj_set_style_text_color(mStatusLabel, lv_color_make(0xFF,0xFF,0x00), LV_PART_MAIN);
    lv_obj_set_style_text_font(mStatusLabel, &lv_font_montserrat_24, LV_PART_MAIN);
    lv_obj_align(mStatusLabel, LV_ALIGN_TOP_LEFT, 0, 40);

    // Build status text using connection manager
    String currentStatus = buildStatusText();
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

    // Mark as created
    mIsCreated = true;

    // 5) Cache values
    mLastConfigJson = cfgJson;
    mLastRotation   = rot;

    // NEW: Create timer for periodic status updates (every 2 seconds)
    lv_timer_t* statusTimer = lv_timer_create(status_update_timer_cb, 2000, this);
    if (statusTimer) {
        mTimers.push_back(statusTimer);
        Serial.println("[HOME_LAYOUT] Status update timer created");
    } else {
        Serial.println("[HOME_LAYOUT] Failed to create status update timer");
    }

    Serial.println("[HOME_LAYOUT] Create completed successfully");
}

String Layout_DefaultHomeScreen::buildStatusText() {
    String currentStatus;

    // Use connection manager as the primary source of truth
    Manager_Connections* connMgr = mDisplayManager->getConnectionManager();
    if (connMgr) {
        ConnectionStatus status = connMgr->getConnectionStatus();
        
        // Build status based on actual connection state
        currentStatus = 
            String("ESP-NOW: ") + (status.espNowActive ? "Active\n" : "Inactive\n") +
            "WiFi: " + (status.wifiConnected ? "Connected\n" : "Disconnected\n");

        if (status.wifiConnected) {
            currentStatus += "IP: " + status.ipAddress + "\n";
            currentStatus += "MAC: " + status.macAddress + "\n";
        }

        if (status.ethernetConnected) {
            currentStatus += "Ethernet: Connected\n";
            currentStatus += "Eth IP: " + status.ethernetIP + "\n";
        }

        currentStatus += "MQTT: " + String(status.mqttConnected ? "Connected\n" : "Disconnected\n");
        currentStatus += "Type: " + status.activeNetworkType;
    } else {
        // Fallback if no connection manager available
        currentStatus = "Connection Manager: Not Available\n";
        currentStatus += "Status: Unknown";
    }
    
    return currentStatus;
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
    Serial.println("[HOME_LAYOUT] Screen destroyed successfully");
}

void Layout_DefaultHomeScreen::update(const JsonDocument &sensorDoc) {
    if (!mIsCreated || !mStatusLabel) return;
    
    // If sensor document contains explicit status, use it
    if (sensorDoc.containsKey("status")) {
        String status = sensorDoc["status"].as<String>();
        lv_label_set_text(mStatusLabel, status.c_str());
        return;
    }
    
    // Otherwise, refresh the connection status display
    String currentStatus = buildStatusText();
    lv_label_set_text(mStatusLabel, currentStatus.c_str());
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

// NEW: Timer callback for periodic status updates
void Layout_DefaultHomeScreen::status_update_timer_cb(lv_timer_t* timer) {
    // Serial.println("[HOME_LAYOUT] Timer callback triggered");
    Layout_DefaultHomeScreen* self = static_cast<Layout_DefaultHomeScreen*>(timer->user_data);
    if (self) {
        // Serial.println("[HOME_LAYOUT] Updating status via timer");
        self->updateStatus();
    } else {
        Serial.println("[HOME_LAYOUT] Timer user_data is null");
    }
}

void Layout_DefaultHomeScreen::updateStatus() {
    if (!mIsCreated || !mStatusLabel) {
        Serial.println("[HOME_LAYOUT] updateStatus called but screen not ready");
        return;
    }
    
    // Serial.println("[HOME_LAYOUT] Building new status text");
    String currentStatus = buildStatusText();
    
    // NEW: Debug the actual status content
    // Serial.printf("[HOME_LAYOUT] New status text (%d chars): %s\n", 
    //               currentStatus.length(), currentStatus.c_str());
    
    lv_label_set_text(mStatusLabel, currentStatus.c_str());
    
    // NEW: Force LVGL to refresh the label
    lv_obj_invalidate(mStatusLabel);
    
    // Serial.println("[HOME_LAYOUT] Status text updated and invalidated");
}

void Layout_DefaultHomeScreen::handleRotate() {
    auto dev = mDisplayManager->getDevice();
    dev->setRotation((dev->getRotation() + 1) % 4);  // Cycle through 0-3
    
    // Save rotation to preferences
    Preferences prefs;
    prefs.begin("connConfig", false);
    prefs.putInt("rotation", dev->getRotation());
    prefs.end();
    
    // Trigger recreation with new rotation
    mDisplayManager->createHomeScreen();
}

void Layout_DefaultHomeScreen::handleReset() {
    // Clear all preferences and restart
    Preferences prefs;
    prefs.begin("connConfig", false);
    prefs.clear();
    prefs.end();
    
    Serial.println("[HOME_LAYOUT] Preferences cleared, restarting...");
    esp_restart();
}