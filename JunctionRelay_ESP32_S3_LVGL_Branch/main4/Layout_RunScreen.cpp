#include "Layout_RunScreen.h"
#include "Display_Manager_LVGL.h"
#include "Helper_Utils.h"
#include <Arduino.h>

// Include EEZStudio generated UI files
#include "src/eezstudio/ui.h"
#include "src/eezstudio/screens.h"

Layout_RunScreen::Layout_RunScreen(Display_Manager_LVGL* displayManager)
  : mDisplayManager(displayManager)
  , mIsCreated(false)
  , mScreen(nullptr)
  , mLastConfigJson("")
{}

Layout_RunScreen::~Layout_RunScreen() {
    destroyTimers();
    destroy();
}

void Layout_RunScreen::create(const JsonDocument &cfg) {
    Serial.println("[LAYOUT_RUN] Creating EEZStudio layout");
    
    // Serialize config for comparison
    String cfgJson;
    serializeJson(cfg, cfgJson);
    
    // If already created with same config, just update
    if (mIsCreated && cfgJson == mLastConfigJson) {
        update(cfg);
        return;
    }
    
    // Clean up if already created
    if (mIsCreated) {
        destroyTimers();
        destroy();
    }

    // Initialize the EEZ UI
    ui_init();  // Calls EEZ's ui_init() to initialize screens
    
    // Get the EEZStudio screen
    mScreen = objects.main;
    
    if (!mScreen) {
        Serial.println("[LAYOUT_RUN] Error: Failed to get EEZStudio screen");
        throw std::runtime_error("EEZStudio screen not found");
    }
    
    // Update state
    mIsCreated = true;
    mLastConfigJson = cfgJson;
    
    Serial.println("[LAYOUT_RUN] EEZStudio layout created successfully");
}

void Layout_RunScreen::destroy() {
    Serial.println("[LAYOUT_RUN] Destroying EEZStudio layout");
    
    if (!mIsCreated) return;
    
    // We don't delete the EEZStudio screens - they're managed differently
    // Just mark our instance as destroyed
    mScreen = nullptr;
    mIsCreated = false;
    
    Serial.println("[LAYOUT_RUN] EEZStudio layout destroyed");
}

void Layout_RunScreen::destroyTimers() {
    for (auto timer : mTimers) {
        if (timer) {
            lv_timer_del(timer);
        }
    }
    mTimers.clear();
}

void Layout_RunScreen::update(const JsonDocument &sensorDoc) {
    if (!mIsCreated || !mScreen) return;
    
    // Pass updates to EEZStudio UI system if needed
    // Note: For the simple "Hello, world" we don't need to do anything here
    
    // If you need to update any dynamic elements, do it here
    // For example:
    // if (sensorDoc.containsKey("some_value")) {
    //    lv_label_set_text(some_label, sensorDoc["some_value"].as<String>().c_str());
    // }
    
    // Call the EEZStudio tick function to handle any animations or updates
    tick_screen_main();
}

void Layout_RunScreen::registerSensors(const JsonDocument &configDoc) {
    // Register any sensors needed for this layout
    auto layout = configDoc["layout"].as<JsonArrayConst>();
    for (auto v : layout) {
        if (v.containsKey("id")) {
            String id = v["id"].as<String>();
            Serial.printf("[DEBUG] Run register sensor: %s\n", id.c_str());
        }
    }
}

lv_obj_t* Layout_RunScreen::getScreen() const {
    return mScreen;
}

bool Layout_RunScreen::isCreated() const {
    return mIsCreated;
}

bool Layout_RunScreen::isDestroyed() const {
    return !mIsCreated;
}