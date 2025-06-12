#include "touch.h"

// Define the global pointer (only defined here)
DeviceConfig* g_device = nullptr;

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

bool touch_has_signal() {
    // For GT911, we assume a signal is always available.
    return true;
}

bool touch_touched() {
    ts.read();
    if (ts.isTouched) {
        //Serial.println("Touch detected!");
        //Serial.print("Raw X: "); Serial.println(ts.points[0].x);
        //Serial.print("Raw Y: "); Serial.println(ts.points[0].y);
        if (g_device) {
            // Use the device instance to map raw coordinates.
            touch_last_x = map(ts.points[0].x, TOUCH_MAP_X1, TOUCH_MAP_X2, 0, g_device->width() - 1);
            touch_last_y = map(ts.points[0].y, TOUCH_MAP_Y1, TOUCH_MAP_Y2, 0, g_device->height() - 1);
            //Serial.print("Mapped X: "); Serial.println(touch_last_x);
            //Serial.print("Mapped Y: "); Serial.println(touch_last_y);
        } else {
            Serial.println("g_device is not set!");
        }
        return true;
    }
    return false;
}

bool touch_released() {
    bool released = !ts.isTouched;
    if (released) {
        // Serial.println("Touch released.");
    }
    return released;
}
