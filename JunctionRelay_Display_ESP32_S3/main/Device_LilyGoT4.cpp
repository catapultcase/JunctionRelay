#include "Device_LilyGoT4.h"
#include <LV_Helper.h>  // Shared LVGL init

Device_LilyGoT4::Device_LilyGoT4() : rotation(1) {}

bool Device_LilyGoT4::begin() {
    Serial.println("[DEBUG][DEVICE] Initializing LilyGo T4...");

    if (!amoled.begin()) {
        Serial.println("[ERROR][DEVICE] Failed to initialize LilyGo AMOLED.");
        return false;
    }

    beginLvglHelper(amoled);

    if (lv_disp_get_default()) {
        setRotation(rotation);
    } else {
        Serial.println("[ERROR][DEVICE] LVGL not initialized. Rotation skipped.");
    }

    return true;
}

const char* Device_LilyGoT4::getName() {
    return "LilyGo T4 AMOLED";
}

void Device_LilyGoT4::setRotation(uint8_t r) {
    if (!lv_disp_get_default()) {
        Serial.println("[ERROR][DEVICE] LVGL not initialized for rotation.");
        return;
    }

    rotation = r % 4;
    Serial.printf("[DEBUG][DEVICE] Applying rotation: %d (%d degrees)\n", rotation, rotation * 90);
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
