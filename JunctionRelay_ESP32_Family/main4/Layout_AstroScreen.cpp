#include "Layout_AstroScreen.h"
#include "Display_Manager_LVGL.h"

Layout_AstroScreen::Layout_AstroScreen(Display_Manager_LVGL* displayMgr)
    : displayManager(displayMgr), screen(nullptr), titleLabel(nullptr) {}

Layout_AstroScreen::~Layout_AstroScreen() {
    destroy();
}

void Layout_AstroScreen::create(const JsonDocument& config) {
    if (screen) destroy();
    
    screen = lv_obj_create(nullptr);
    lv_obj_set_size(screen, LV_HOR_RES, LV_VER_RES);
    lv_obj_set_style_bg_color(screen, lv_color_make(40, 20, 0), LV_PART_MAIN);
    
    titleLabel = lv_label_create(screen);
    lv_label_set_text(titleLabel, "Astro Layout\n(Placeholder)");
    lv_obj_align(titleLabel, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_text_color(titleLabel, lv_color_white(), LV_PART_MAIN);
}

void Layout_AstroScreen::destroy() {
    if (screen) {
        lv_obj_del(screen);
        screen = nullptr;
        titleLabel = nullptr;
    }
}

void Layout_AstroScreen::destroyTimers() {
    // No timers in placeholder
}

void Layout_AstroScreen::update(const JsonDocument& data) {
    // Placeholder - no updates
}

void Layout_AstroScreen::registerSensors(const JsonDocument& config) {
    // Placeholder - no sensors
}

lv_obj_t* Layout_AstroScreen::getScreen() const {
    return screen;
}

bool Layout_AstroScreen::isCreated() const {
    return screen != nullptr;
}

bool Layout_AstroScreen::isDestroyed() const {
    return screen == nullptr;
}