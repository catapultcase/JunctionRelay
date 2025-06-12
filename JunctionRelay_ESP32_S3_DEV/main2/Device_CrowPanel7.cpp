#include "Device_CrowPanel7.h"
#include "touch.h"
#include <driver/gpio.h>
#include <PCA9557.h>

Device_CrowPanel7::CustomLGFX::CustomLGFX() {
    auto cfg = _panel_instance.config();
    cfg.memory_width  = 800;
    cfg.memory_height = 480;
    cfg.panel_width   = 800;
    cfg.panel_height  = 480;
    cfg.offset_x = 0;
    cfg.offset_y = 0;
    _panel_instance.config(cfg);

    auto cfgDetail = _panel_instance.config_detail();
    cfgDetail.use_psram = 0;
    _panel_instance.config_detail(cfgDetail);

    auto bus_cfg = _bus_instance.config();
    bus_cfg.panel = &_panel_instance;

    // CrowPanel7 specific pin configuration
    bus_cfg.pin_d0  = GPIO_NUM_15;  // B0
    bus_cfg.pin_d1  = GPIO_NUM_7;   // B1
    bus_cfg.pin_d2  = GPIO_NUM_6;   // B2
    bus_cfg.pin_d3  = GPIO_NUM_5;   // B3
    bus_cfg.pin_d4  = GPIO_NUM_4;   // B4

    bus_cfg.pin_d5  = GPIO_NUM_9;   // G0
    bus_cfg.pin_d6  = GPIO_NUM_46;  // G1
    bus_cfg.pin_d7  = GPIO_NUM_3;   // G2
    bus_cfg.pin_d8  = GPIO_NUM_8;   // G3
    bus_cfg.pin_d9  = GPIO_NUM_16;  // G4
    bus_cfg.pin_d10 = GPIO_NUM_1;   // G5

    bus_cfg.pin_d11 = GPIO_NUM_14;  // R0
    bus_cfg.pin_d12 = GPIO_NUM_21;  // R1
    bus_cfg.pin_d13 = GPIO_NUM_47;  // R2
    bus_cfg.pin_d14 = GPIO_NUM_48;  // R3
    bus_cfg.pin_d15 = GPIO_NUM_45;  // R4

    bus_cfg.pin_henable = GPIO_NUM_41;
    bus_cfg.pin_vsync   = GPIO_NUM_40;
    bus_cfg.pin_hsync   = GPIO_NUM_39;
    bus_cfg.pin_pclk    = GPIO_NUM_0;
    bus_cfg.freq_write  = 15000000;

    // CrowPanel7 specific timing parameters
    bus_cfg.hsync_polarity    = 0;
    bus_cfg.hsync_front_porch = 40;
    bus_cfg.hsync_pulse_width = 48;
    bus_cfg.hsync_back_porch  = 40;

    bus_cfg.vsync_polarity    = 0;
    bus_cfg.vsync_front_porch = 1;
    bus_cfg.vsync_pulse_width = 31;
    bus_cfg.vsync_back_porch  = 13;

    bus_cfg.pclk_active_neg   = 1;
    bus_cfg.de_idle_high      = 0;
    bus_cfg.pclk_idle_high    = 0;

    _bus_instance.config(bus_cfg);

    auto light_cfg = _light_instance.config();
    light_cfg.pin_bl = GPIO_NUM_2;
    _light_instance.config(light_cfg);

    _panel_instance.light(&_light_instance);
    _panel_instance.setBus(&_bus_instance);
    setPanel(&_panel_instance);
}

Device_CrowPanel7::Device_CrowPanel7(ConnectionManager* connMgr) : rotation(0), connMgr(connMgr) {
    g_device = this;
}

bool Device_CrowPanel7::begin() {
    Serial.println("[DEBUG] Initializing CrowPanel7...");

    // Initialize hardware first
    pinMode(38, OUTPUT); digitalWrite(38, LOW);
    pinMode(17, OUTPUT); digitalWrite(17, LOW);
    pinMode(18, OUTPUT); digitalWrite(18, LOW);
    pinMode(42, OUTPUT); digitalWrite(42, LOW);

    Wire.begin(19, 20);
    PCA9557 Out;
    Out.reset();
    Out.setMode(IO_OUTPUT);
    Out.setState(IO0, IO_LOW);
    Out.setState(IO1, IO_LOW);
    delay(20);
    Out.setState(IO0, IO_HIGH);
    delay(100);
    Out.setMode(IO1, IO_INPUT);

    lgfx_dev.init();
    lgfx_dev.setColorDepth(16);

    // ✅ Optional: Test render
    lgfx_dev.fillScreen(TFT_RED); delay(300);
    lgfx_dev.fillScreen(TFT_GREEN); delay(300);
    lgfx_dev.fillScreen(TFT_BLUE); delay(300);
    lgfx_dev.fillScreen(TFT_BLACK);

    // ✅ Backlight brightness control
    ledcSetup(1, 300, 8);
    ledcAttachPin(2, 1);
    ledcWrite(1, 255); // Max brightness

    // Return success even before LVGL setup
    // The LVGL-specific initialization will happen in initLVGLHelper()
    return true;
}

// New method to init LVGL display helpers after LVGL is initialized
void Device_CrowPanel7::initLVGLHelper() {
    // Create and initialize LVGL display buffer
    static lv_color_t draw_buf_mem[800 * 480 / 15];
    static lv_disp_draw_buf_t draw_buf;
    lv_disp_draw_buf_init(&draw_buf, draw_buf_mem, NULL, sizeof(draw_buf_mem) / sizeof(draw_buf_mem[0]));

    // Initialize and register the display driver
    lv_disp_drv_init(&disp_drv);
    disp_drv.hor_res = 800;
    disp_drv.ver_res = 480;
    disp_drv.flush_cb = my_disp_flush;
    disp_drv.draw_buf = &draw_buf;
    disp_drv.user_data = this;
    lv_disp_drv_register(&disp_drv);

    // Initialize and register the touch input driver
    lv_indev_drv_init(&indev_drv);
    indev_drv.type = LV_INDEV_TYPE_POINTER;
    indev_drv.read_cb = my_touchpad_read;
    indev_drv.user_data = this;
    lv_indev_drv_register(&indev_drv);

    Serial.print("[DEBUG] Setting display rotation: ");
    Serial.println(rotation);
    if (lv_disp_get_default()) {
        setRotation(rotation);
    }
}

int Device_CrowPanel7::width() {
    return lgfx_dev.width();
}

int Device_CrowPanel7::height() {
    return lgfx_dev.height();
}

void Device_CrowPanel7::setRotation(uint8_t r) {
    if (!lv_disp_get_default()) return;
    rotation = r % 4;
    lgfx_dev.setRotation(rotation);
    lv_disp_drv_t *drv = lv_disp_get_default()->driver;
    if (drv) {
        drv->hor_res = lgfx_dev.width();
        drv->ver_res = lgfx_dev.height();
        lv_disp_drv_update(lv_disp_get_default(), drv);
    }
}

uint8_t Device_CrowPanel7::getRotation() {
    return rotation;
}

const char* Device_CrowPanel7::getName() {
    return "Elecrow 7-inch Panel";
}

void Device_CrowPanel7::my_disp_flush(lv_disp_drv_t *disp, const lv_area_t *area, lv_color_t *color_p) {
    Device_CrowPanel7* instance = static_cast<Device_CrowPanel7*>(disp->user_data);
    if (instance) {
        int32_t w = area->x2 - area->x1 + 1;
        int32_t h = area->y2 - area->y1 + 1;
        instance->lgfx_dev.pushImageDMA(
            area->x1, area->y1,
            w, h,
            reinterpret_cast<const lgfx::rgb565_t*>(&color_p->full)  // <- match manufacturer
        );
    }
    lv_disp_flush_ready(disp);
}

void Device_CrowPanel7::my_touchpad_read(lv_indev_drv_t *indev_driver, lv_indev_data_t *data) {
    Device_CrowPanel7* instance = static_cast<Device_CrowPanel7*>(indev_driver->user_data);
    if (!instance) return;

    if (touch_has_signal()) {
        if (touch_touched()) {
            uint16_t rawX = touch_last_x;
            uint16_t rawY = touch_last_y;
            uint16_t touchX = rawX, touchY = rawY;
            uint8_t rot = instance->getRotation();
            uint16_t screenWidth = instance->width();
            uint16_t screenHeight = instance->height();

            switch (rot) {
                case 0:
                    touchX = map(rawX, 0, 800, 0, screenWidth);
                    touchY = map(rawY, 0, 480, 0, screenHeight);
                    break;
                case 1:
                    touchX = map(rawY, 0, 480, 0, screenWidth);
                    touchY = map(800 - rawX, 0, 800, 0, screenHeight);
                    break;
                case 2:
                    touchX = map(800 - rawX, 0, 800, 0, screenWidth);
                    touchY = map(480 - rawY, 0, 480, 0, screenHeight);
                    break;
                case 3:
                    touchX = map(800 - rawY, 0, 800, 0, screenWidth);
                    touchY = map(rawX, 0, 480, 0, screenHeight);
                    break;
            }

            data->state = LV_INDEV_STATE_PR;
            data->point.x = touchX;
            data->point.y = touchY;
            delay(15);
        } else if (touch_released()) {
            data->state = LV_INDEV_STATE_REL;
        }
    } else {
        data->state = LV_INDEV_STATE_REL;
    }
}