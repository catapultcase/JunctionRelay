#include "touch.h"
#include "DeviceConfig.h"  // Only include base class

// Remove global g_device pointer - use local reference instead
static DeviceConfig* s_device = nullptr;

// Instantiate the GT911 touch controller with the configured parameters.
TAMC_GT911 ts(TOUCH_GT911_SDA, TOUCH_GT911_SCL, TOUCH_GT911_INT, TOUCH_GT911_RST, TOUCH_MAP_X1, TOUCH_MAP_Y1);

// Define global touch coordinate variables.
int touch_last_x = 0;
int touch_last_y = 0;

void touch_init() {
    Serial.println("Initializing GT911 touch...");
    Wire.begin(TOUCH_GT911_SDA, TOUCH_GT911_SCL);
    ts.begin();
    ts.setRotation(TOUCH_GT911_ROTATION);
    Serial.println("Touch initialized.");
}

// NEW: Set device reference (called by device constructor)
void touch_setDevice(DeviceConfig* device) {
    s_device = device;
}

bool touch_has_signal() {
    // For GT911, we assume a signal is always available.
    return true;
}

bool touch_touched() {
    ts.read();
    if (ts.isTouched) {
        if (s_device) {
            // Use the device instance to map raw coordinates.
            touch_last_x = map(ts.points[0].x, TOUCH_MAP_X1, TOUCH_MAP_X2, 0, s_device->width() - 1);
            touch_last_y = map(ts.points[0].y, TOUCH_MAP_Y1, TOUCH_MAP_Y2, 0, s_device->height() - 1);
        } else {
            Serial.println("s_device is not set!");
        }
        return true;
    }
    return false;
}

bool touch_released() {
    bool released = !ts.isTouched;
    return released;
}