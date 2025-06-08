#include "Device_LilyGoT4.h"
#include <LV_Helper.h>

Device_LilyGoT4::Device_LilyGoT4(ConnectionManager* connMgr) : rotation(1), connMgr(connMgr) {
    // Store the connection manager reference for future use if needed
}

bool Device_LilyGoT4::begin() {
    Serial.println("[DEBUG] Initializing LilyGo T4...");
    
    if (!amoled.begin()) {
        Serial.println("[ERROR] Failed to initialize LilyGo AMOLED.");
        return false;
    }
    
    Serial.println("[DEBUG] LilyGo T4 hardware initialized successfully.");
    
    // Return success even before LVGL setup
    // The LVGL-specific initialization will happen in initLVGLHelper()
    return true;
}

// New method to init LVGL display helpers after LVGL is initialized
void Device_LilyGoT4::initLVGLHelper() {
    Serial.println("[DEBUG] Initializing LilyGo T4 LVGL helpers...");
    
    // Initialize LVGL helpers using the shared helper function
    beginLvglHelper(amoled);
    
    Serial.print("[DEBUG] Setting display rotation: ");
    Serial.println(rotation);
    if (lv_disp_get_default()) {
        setRotation(rotation);
    } else {
        Serial.println("[ERROR] LVGL not initialized. Rotation skipped.");
    }
    
    Serial.println("[DEBUG] LilyGo T4 LVGL helpers initialized.");
}

const char* Device_LilyGoT4::getName() {
    return "LilyGo T4 AMOLED";
}

void Device_LilyGoT4::setRotation(uint8_t r) {
    if (!lv_disp_get_default()) {
        Serial.println("[ERROR] LVGL not initialized for rotation.");
        return;
    }
    
    rotation = r % 4;
    Serial.printf("[DEBUG] Applying rotation: %d (%d degrees)\n", rotation, rotation * 90);
    
    amoled.setRotation(rotation);
    
    lv_disp_drv_t *drv = lv_disp_get_default()->driver;
    if (drv) {
        drv->hor_res = amoled.width();
        drv->ver_res = amoled.height();
        lv_disp_drv_update(lv_disp_get_default(), drv);
    }
}

uint8_t Device_LilyGoT4::getRotation() {
    return rotation;
}

int Device_LilyGoT4::width() {
    return amoled.width();
}

int Device_LilyGoT4::height() {
    return amoled.height();
}

// Implement I2C interface method (required by DeviceConfig base class)
TwoWire* Device_LilyGoT4::getI2CInterface() {
    return &Wire;  // Return default Wire even though LilyGo doesn't use external I2C
}