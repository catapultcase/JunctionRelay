#ifndef TOUCH_H
#define TOUCH_H

#include <Wire.h>
#include <lvgl.h>

// Forward declaration instead of including Device.h
class DeviceConfig;

// GT911 Touch Configuration
#define TOUCH_GT911
#define TOUCH_GT911_SCL 20
#define TOUCH_GT911_SDA 19
#define TOUCH_GT911_INT -1
#define TOUCH_GT911_RST -1
#define TOUCH_GT911_ROTATION ROTATION_NORMAL
#define TOUCH_MAP_X1 800
#define TOUCH_MAP_X2 0
#define TOUCH_MAP_Y1 480
#define TOUCH_MAP_Y2 0

#include <TAMC_GT911.h>

// Declare the GT911 touch controller instance (defined in touch.cpp)
extern TAMC_GT911 ts;

// Declare global variables for touch coordinates (defined in touch.cpp)
extern int touch_last_x;
extern int touch_last_y;

// Function declarations - now pass device instance directly
void touch_init();
void touch_setDevice(DeviceConfig* device);  // NEW: Set device reference
bool touch_has_signal();
bool touch_touched();
bool touch_released();

#endif // TOUCH_H