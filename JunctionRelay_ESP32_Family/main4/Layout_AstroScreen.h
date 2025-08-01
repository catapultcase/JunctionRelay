#ifndef LAYOUT_ASTROSCREEN_H
#define LAYOUT_ASTROSCREEN_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <lvgl.h>
#include "Interface_ScreenLayout_LVGL.h"

class Display_Manager_LVGL;

class Layout_AstroScreen : public LayoutInterface {
public:
    Layout_AstroScreen(Display_Manager_LVGL* displayMgr);
    ~Layout_AstroScreen();
    
    void create(const JsonDocument& config) override;
    void destroy() override;
    void destroyTimers() override;
    void update(const JsonDocument& data) override;
    void registerSensors(const JsonDocument& config) override;
    lv_obj_t* getScreen() const override;
    bool isCreated() const override;
    bool isDestroyed() const override;

private:
    Display_Manager_LVGL* displayManager;
    lv_obj_t* screen;
    lv_obj_t* titleLabel;
};

#endif