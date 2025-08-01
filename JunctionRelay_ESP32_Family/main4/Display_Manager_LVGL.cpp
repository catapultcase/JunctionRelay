#include "Display_Manager_LVGL.h"
#include "Helper_Utils.h"

Display_Manager_LVGL::Display_Manager_LVGL(DeviceConfig* device)
    : device(device)
    , connectionManager(nullptr)
    , lvglInitialized(false)
    , lvglTaskHandle(nullptr)
    , homeLayout(nullptr)
{
}

Display_Manager_LVGL::~Display_Manager_LVGL() {
    if (homeLayout) {
        delete homeLayout;
        homeLayout = nullptr;
    }
    
    if (lvglTaskHandle) {
        vTaskDelete(lvglTaskHandle);
        lvglTaskHandle = nullptr;
    }
}

bool Display_Manager_LVGL::init() {
    Serial.println("[DISPLAY_MANAGER_LVGL] Initializing...");
    
    if (!device) {
        Serial.println("[DISPLAY_MANAGER_LVGL] No device provided");
        return false;
    }
    
    // Check if device has an onboard screen - if not, skip LVGL entirely
    if (!device->hasOnboardScreen()) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Device has no onboard screen - LVGL not needed");
        return false;
    }
    
    // Initialize device hardware using the base interface
    if (!device->begin()) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Device hardware initialization failed");
        return false;
    }
    Serial.println("[DISPLAY_MANAGER_LVGL] Device hardware initialized");
    
    // Initialize LVGL core
    lv_init();
    Serial.println("[DISPLAY_MANAGER_LVGL] LVGL core initialized");
    
    // Initialize device LVGL helpers using the base interface
    device->initLVGLHelper();
    Serial.println("[DISPLAY_MANAGER_LVGL] Device LVGL helpers initialized");
    
    // Create LVGL task
    BaseType_t result = xTaskCreatePinnedToCore(
        lvglTaskFunction,
        "lvglTask",
        4096,
        this,
        2,
        &lvglTaskHandle,
        1
    );
    
    if (result != pdPASS) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Failed to create LVGL task");
        return false;
    }
    
    delay(100);
    
    lvglInitialized = true;
    Serial.println("[DISPLAY_MANAGER_LVGL] Initialization complete");
    return true;
}

void Display_Manager_LVGL::lvglTaskFunction(void* parameter) {
    Display_Manager_LVGL* manager = static_cast<Display_Manager_LVGL*>(parameter);
    Serial.printf("[LVGL Task] Started on core %d\n", xPortGetCoreID());
    
    while (true) {
        lv_timer_handler();
        vTaskDelay(pdMS_TO_TICKS(5));
    }
}

void Display_Manager_LVGL::createHomeScreen() {
    if (!lvglInitialized) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Cannot create home screen - LVGL not initialized");
        return;
    }
    
    if (!device || !device->hasOnboardScreen()) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Cannot create home screen - device has no onboard screen");
        return;
    }
    
    if (!connectionManager) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Warning: No connection manager set - layouts may not show connectivity data");
    }
    
    Serial.println("[DISPLAY_MANAGER_LVGL] Creating home screen using Layout_DefaultHomeScreen...");
    
    homeLayout = new Layout_DefaultHomeScreen(this);
    
    JsonDocument emptyConfig;
    homeLayout->create(emptyConfig);
    
    lv_obj_t* screen = homeLayout->getScreen();
    if (screen) {
        lv_scr_load(screen);
        Serial.println("[DISPLAY_MANAGER_LVGL] Home screen created and loaded via Layout_DefaultHomeScreen");
    } else {
        Serial.println("[DISPLAY_MANAGER_LVGL] ERROR: Layout failed to create screen");
        delete homeLayout;
        homeLayout = nullptr;
    }
}