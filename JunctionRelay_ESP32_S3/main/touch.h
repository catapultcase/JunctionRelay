#ifndef TOUCH_H
#define TOUCH_H

#include <Wire.h>
#include <lvgl.h>
#include "Device_CrowPanel5.h"  // Full definition is required for g_device
#include "Device_CrowPanel7.h"  // Full definition is required for g_device

// Global pointer to the display device (for touch coordinate mapping)
// (Defined in touch.cpp)
extern DeviceConfig* g_device;

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

// Function declarations
void touch_init();
bool touch_has_signal();
bool touch_touched();
bool touch_released();

#endif // TOUCH_H
