#include "Device.h"
#include "Helper_Utils.h"
#include "touch.h"
#include <driver/gpio.h>

Device_CrowPanel7::CustomLGFX::CustomLGFX() {
    {
        auto cfg = _panel_instance.config();
        cfg.memory_width  = 800;
        cfg.memory_height = 480;
        cfg.panel_width   = 800;
        cfg.panel_height  = 480;
        cfg.offset_x = 0;
        cfg.offset_y = 0;
        _panel_instance.config(cfg);
    }

    {
        auto cfgDetail = _panel_instance.config_detail();
        cfgDetail.use_psram = 1;
        _panel_instance.config_detail(cfgDetail);
    }

    {
        auto bus_cfg = _bus_instance.config();
        bus_cfg.panel = &_panel_instance;

        // RGB pins - CrowPanel7 specific pin configuration
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

        // Control pins - CrowPanel7 specific
        bus_cfg.pin_henable = GPIO_NUM_41;
        bus_cfg.pin_vsync   = GPIO_NUM_40;
        bus_cfg.pin_hsync   = GPIO_NUM_39;
        bus_cfg.pin_pclk    = GPIO_NUM_0;
        bus_cfg.freq_write  = 15000000;

        // Timing parameters - CrowPanel7 specific
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
    }

    {
        auto light_cfg = _light_instance.config();
        light_cfg.pin_bl = GPIO_NUM_2;
        _light_instance.config(light_cfg);
    }

    _panel_instance.light(&_light_instance);
    _panel_instance.setBus(&_bus_instance);
    setPanel(&_panel_instance);
}

Device_CrowPanel7::Device_CrowPanel7(Manager_Connections* connMgr) 
: rotation(0), connMgr(connMgr) {
    touch_setDevice(this);  // Set device reference for touch system
}

// Device-specific setup method called by main.ino
void Device_CrowPanel7::setupDeviceSpecific() {
    Serial.println("[DEVICE] Device-specific setup complete (no additional setup required)");
}

// Hardware detection method
HardwareInventory Device_CrowPanel7::detectHardware() {
    Serial.println("[DEVICE] Detecting hardware for CrowPanel7...");
    
    HardwareInventory inventory;
    
    // CrowPanel7 has an onboard screen
    inventory.hasOnboardScreen = true;
    Serial.println("[DEVICE] Onboard 7-inch RGB LCD detected");
    
    // No NeoPixels or I2C devices on CrowPanel7 
    // (DEVICE_HAS_EXTERNAL_NEOPIXELS = 0, DEVICE_HAS_EXTERNAL_I2C_DEVICES = 0)

    Serial.printf("[DEVICE] Hardware detection complete: Onboard Screen=%s, %d NeoPixel strips, %d I2C devices\n",
                  inventory.hasOnboardScreen ? "Yes" : "No",
                  inventory.neopixelPins.size(), 
                  inventory.i2cDevices.size());
    
    return inventory;
}

void Device_CrowPanel7::initializeHardware() {
    Serial.println("[DEVICE] Initializing hardware...");
    
    // Check PSRAM first - critical for display
    if (!psramFound()) {
        Serial.println("[DEVICE] ERROR: PSRAM not found!");
        while(1) delay(1000);
    }
    Serial.println("[DEVICE] PSRAM detected OK");
    
    // Initialize control pins - CrowPanel7 specific
    pinMode(38, OUTPUT); digitalWrite(38, LOW);
    pinMode(17, OUTPUT); digitalWrite(17, LOW);
    pinMode(18, OUTPUT); digitalWrite(18, LOW);
    pinMode(42, OUTPUT); digitalWrite(42, LOW);

    // Initialize I2C and PCA9557 - CrowPanel7 specific
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
    
    Serial.println("[DEVICE] Hardware initialization complete");
}

bool Device_CrowPanel7::begin() {
    Serial.println("[DEVICE] Initializing CrowPanel7...");

    // Initialize hardware first - exactly like working code
    initializeHardware();

    // Initialize display hardware
    Serial.println("[DEVICE] Initializing display...");
    bool initResult = lgfx_dev.init();
    Serial.printf("[DEVICE] Display init result: %s\n", initResult ? "SUCCESS" : "FAILED");
    
    if (!initResult) {
        Serial.println("[DEVICE] ERROR: Display init failed!");
        while(1) delay(1000);
    }
    Serial.println("[DEVICE] Display init OK");

    // Set color depth
    lgfx_dev.setColorDepth(16);
    
    // Check dimensions immediately after init
    Serial.printf("[DEVICE] Display size: %dx%d\n", lgfx_dev.width(), lgfx_dev.height());
    
    if (lgfx_dev.width() == 0 || lgfx_dev.height() == 0) {
        Serial.println("[DEVICE] ERROR: Display dimensions are invalid!");
        while(1) delay(1000);
    }

    // Set backlight to maximum
    lgfx_dev.setBrightness(255);
    
    // Also set via LEDC for redundancy
    ledcSetup(0, 1000, 8);
    ledcAttachPin(2, 0);
    ledcWrite(0, 255);

    Serial.println("[DEVICE] CrowPanel7 hardware initialization complete");
    return true;
}

int Device_CrowPanel7::width() {
    return lgfx_dev.width();
}

int Device_CrowPanel7::height() {
    return lgfx_dev.height();
}

void Device_CrowPanel7::setRotation(uint8_t r) {
    rotation = r % 4;
    lgfx_dev.setRotation(rotation);
    Serial.printf("[DEVICE] Display rotation set to: %d\n", rotation);
}

uint8_t Device_CrowPanel7::getRotation() {
    return rotation;
}

const char* Device_CrowPanel7::getName() {
    return "Elecrow 7-inch Panel";
}

TwoWire* Device_CrowPanel7::getI2CInterface() {
    return &Wire; // Return default Wire even though device doesn't use external I2C
}

void* Device_CrowPanel7::getDisplay() {
    return &lgfx_dev;
}