#include "Display_Manager_LVGL.h"
#include "Helper_Utils.h"

// Layout headers - include all layouts
#include "Layout_DefaultHomeScreen.h"
#include "Layout_GridScreen.h"
#include "Layout_PlotterScreen.h"
#include "Layout_RadioScreen.h"
#include "Layout_RunScreen.h"

const char* getLayoutTypeName(LayoutType type) {
    switch (type) {
        case LayoutType::NONE: return "NONE";
        case LayoutType::HOME: return "HOME";
        case LayoutType::GRID: return "GRID";
        case LayoutType::PLOTTER: return "PLOTTER";
        case LayoutType::RADIO: return "RADIO";
        case LayoutType::RUN: return "RUN";
        default: return "UNKNOWN";
    }
}

Display_Manager_LVGL::Display_Manager_LVGL(DeviceConfig* device)
    : device(device)
    , connectionManager(nullptr)
    , lvglInitialized(false)
    , lvglTaskHandle(nullptr)
    , currentLayout(nullptr)
    , homeLayout(nullptr)
    , gridLayout(nullptr)
    , plotterLayout(nullptr)
    , radioLayout(nullptr)
    , runLayout(nullptr)
    , currentLayoutType(LayoutType::NONE)
    , lastKnownStatus("Connecting...")
    , isTransitioning(false)
    , transitionStartTime(0)
    , safeScreen(nullptr)
{
    // Only create layout objects, don't initialize LVGL components yet
    try {
        homeLayout = new Layout_DefaultHomeScreen(this);
        gridLayout = new Layout_GridScreen(this);
        plotterLayout = new Layout_PlotterScreen(this);
        radioLayout = new Layout_RadioScreen(this);
        runLayout = new Layout_RunScreen(this);
    } catch (...) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Exception in constructor");
        // Clean up any partially allocated resources
        if (homeLayout) delete homeLayout;
        if (gridLayout) delete gridLayout;
        if (plotterLayout) delete plotterLayout;
        if (radioLayout) delete radioLayout;
        if (runLayout) delete runLayout;

        homeLayout = nullptr;
        gridLayout = nullptr;
        plotterLayout = nullptr;
        radioLayout = nullptr;
        runLayout = nullptr;
    }
}

Display_Manager_LVGL::~Display_Manager_LVGL() {
    // Ensure we cleanup without crashes
    isTransitioning = false;
    
    // Clear current layout FIRST to avoid callbacks to destroyed objects
    currentLayout = nullptr;
    currentLayoutType = LayoutType::NONE;
    
    // Clean up LVGL screens if initialized
    if (lvglInitialized) {
        if (safeScreen) {
            try {
                lv_obj_del(safeScreen);
            } catch (...) {
                Serial.println("[DISPLAY_MANAGER_LVGL] Exception deleting safe screen");
            }
            safeScreen = nullptr;
        }
    }
    
    // Safely delete layout objects
    if (homeLayout) delete homeLayout;
    if (gridLayout) delete gridLayout;
    if (plotterLayout) delete plotterLayout;
    if (radioLayout) delete radioLayout;
    if (runLayout) delete runLayout;
    
    // Clean up LVGL task
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
    
    // Log initial memory state
    printMemoryInfo();
    
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

void Display_Manager_LVGL::printMemoryInfo() {
    Serial.printf("[MEMORY] Free heap: %d bytes\n", ESP.getFreeHeap());
    #if LV_MEM_CUSTOM == 0
    Serial.printf("[MEMORY] LVGL usage: %d bytes\n", lv_mem_get_size_used());
    #endif
}

void Display_Manager_LVGL::processLVGLTasks(int iterations, int delayMs) {
    for (int i = 0; i < iterations; i++) {
        lv_timer_handler();
        delay(delayMs);
    }
}

lv_obj_t* Display_Manager_LVGL::createTransitionScreen() {
    lv_obj_t* screen = nullptr;
    try {
        screen = lv_obj_create(nullptr);
        if (screen) {
            lv_obj_set_size(screen, device->width(), device->height());
            lv_obj_set_style_bg_color(screen, lv_color_black(), LV_PART_MAIN);
            
            // Add loading text
            lv_obj_t* label = lv_label_create(screen);
            lv_label_set_text(label, "Loading...");
            lv_obj_align(label, LV_ALIGN_CENTER, 0, 0);
            lv_obj_set_style_text_color(label, lv_color_white(), LV_PART_MAIN);
        }
    } catch (...) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Exception creating transition screen");
        if (screen) {
            lv_obj_del(screen);
            screen = nullptr;
        }
    }
    return screen;
}

bool Display_Manager_LVGL::enterSafeMode() {
    if (!lvglInitialized) {
        return false;
    }
    
    Serial.println("[DISPLAY_MANAGER_LVGL] Entering safe mode");
    
    // Clear transition state
    isTransitioning = false;
    
    // Clear current layout first to avoid callbacks
    currentLayout = nullptr;
    currentLayoutType = LayoutType::NONE;
    
    // Create a minimal safe screen
    try {
        // Delete previous safe screen if exists
        if (safeScreen) {
            lv_obj_del(safeScreen);
            processLVGLTasks(3, 10);
        }
        
        safeScreen = lv_obj_create(nullptr);
        if (!safeScreen) {
            return false;
        }
        
        lv_obj_set_size(safeScreen, device->width(), device->height());
        lv_obj_set_style_bg_color(safeScreen, lv_color_make(0, 0, 64), LV_PART_MAIN);
        
        // Add a simple label
        lv_obj_t* label = lv_label_create(safeScreen);
        lv_label_set_text(label, "Safe Mode\nRecovering...");
        lv_obj_align(label, LV_ALIGN_CENTER, 0, 0);
        lv_obj_set_style_text_color(label, lv_color_white(), LV_PART_MAIN);
        
        // Load safe screen
        lv_scr_load(safeScreen);
        processLVGLTasks(5, 10);
        
        return true;
    } catch (...) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Exception in safe mode");
        return false;
    }
}

void Display_Manager_LVGL::createHomeScreen() {
    // Safety check for LVGL initialization
    if (!lvglInitialized) {
        Serial.println("[DISPLAY_MANAGER_LVGL] ERROR: Attempted to create home screen before LVGL init");
        return;
    }
    
    DynamicJsonDocument emptyCfg(128);
    switchToLayout(LayoutType::HOME, emptyCfg);
}

void Display_Manager_LVGL::updateStatusLabel(const String& status) {
    lastKnownStatus = status;
    if (lvglInitialized && currentLayoutType == LayoutType::HOME && currentLayout) {
        DynamicJsonDocument doc(128);
        doc["status"] = status;
        try {
            currentLayout->update(doc);
        } catch (...) {
            Serial.println("[DISPLAY_MANAGER_LVGL] Exception in updateStatusLabel");
        }
    }
}

// Enhanced switchToLayout method with mandatory rebuilding and loading screen
bool Display_Manager_LVGL::switchToLayout(LayoutType newType, const JsonDocument &cfg) {
    // Safety checks
    if (!lvglInitialized || isTransitioning) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Not ready for transition");
        return false;
    }
    
    // Additional validation for the layout type
    if (newType <= LayoutType::NONE || newType > LayoutType::RUN) {
        Serial.printf("[DISPLAY_MANAGER_LVGL] Invalid layout type: %d\n", (int)newType);
        return false;
    }
    
    // Log the transition attempt
    Serial.printf("[DISPLAY_MANAGER_LVGL] Switching %s → %s\n", 
                  getLayoutTypeName(currentLayoutType),
                  getLayoutTypeName(newType));
    
    // Start transition process
    isTransitioning = true;
    transitionStartTime = millis();
    printMemoryInfo();

    // Get new layout reference
    LayoutInterface* newLayout = getLayoutForType(newType);
    if (!newLayout) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Layout object is null");
        isTransitioning = false;
        return false;
    }
    
    // *** CRITICAL: PAUSE ALL LVGL ANIMATIONS AND TIMERS ***
#if LV_USE_ANIMATION
    // Delete all animations
    lv_anim_del_all();
#endif

    // Create black transition screen with LOADING text
    lv_obj_t* transScreen = nullptr;
    unsigned long transitionDisplayStartTime = 0;
    try {
        transScreen = createTransitionScreen();
        if (transScreen) {
            lv_scr_load(transScreen);
            processLVGLTasks(5, 10); // Process immediately with extra frames
            transitionDisplayStartTime = millis(); // Record when transition screen was displayed
        }
    } catch (...) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Exception in transition screen");
        if (transScreen) lv_obj_del(transScreen);
        isTransitioning = false;
        return false;
    }
    
    // *** CRITICAL: SAVE AND CLEAR CURRENT LAYOUT ***
    LayoutInterface* oldLayout = currentLayout;
    LayoutType oldType = currentLayoutType;
    
    // Clear current references to prevent callbacks during cleanup
    currentLayout = nullptr;
    currentLayoutType = LayoutType::NONE;
    
    // Process LVGL tasks to ensure state update is registered
    processLVGLTasks(3, 10);
    
    // Safely destroy old layout
    bool oldLayoutDestroyed = false;
    if (oldLayout) {
        try {
            // Destroy timers first - critical for preventing callbacks
            Serial.printf("[DISPLAY_MANAGER_LVGL] Destroying timers for %s layout\n", 
                         getLayoutTypeName(oldType));
            oldLayout->destroyTimers();
            processLVGLTasks(3, 10);
            
            // Now destroy the layout UI
            Serial.printf("[DISPLAY_MANAGER_LVGL] Destroying %s layout\n", 
                         getLayoutTypeName(oldType));
            oldLayout->destroy();
            processLVGLTasks(5, 10);
            
            oldLayoutDestroyed = true;
        } catch (...) {
            Serial.printf("[DISPLAY_MANAGER_LVGL] Exception in old layout cleanup\n");
            // Continue anyway - we'll attempt recovery
        }
    }
    
    // Memory check
    printMemoryInfo();
    
    // *** CRITICAL: COMPLETELY FLUSH LVGL TASKS ***
    // This ensures no lingering callbacks from the old layout
    for (int i = 0; i < 8; i++) {
        lv_timer_handler();
        delay(20);
    }
    
    // Ensure we stay on the loading screen for at least 100ms
    unsigned long elapsedTransitionTime = millis() - transitionDisplayStartTime;
    if (elapsedTransitionTime < 100) {
        delay(100 - elapsedTransitionTime);
    }
    
    // Create new layout safely
    bool success = false;
    lv_obj_t* newScreen = nullptr;
    
    try {
        Serial.printf("[DISPLAY_MANAGER_LVGL] Creating new %s layout\n", 
                     getLayoutTypeName(newType));
        
        // Create layout
        newLayout->create(cfg);
        processLVGLTasks(3, 10);
        
        // Get screen
        newScreen = newLayout->getScreen();
        if (!newScreen) {
            Serial.println("[DISPLAY_MANAGER_LVGL] New screen is null");
            throw std::runtime_error("Null screen");
        }
        
        // Register sensors
        newLayout->registerSensors(cfg);
        processLVGLTasks(3, 10);
        
        // Show screen
        lv_scr_load(newScreen);
        processLVGLTasks(5, 10);
        
        // Update state on success
        success = true;
        currentLayout = newLayout;
        currentLayoutType = newType;
    } catch (...) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Exception in creating new layout");
        success = false;
    }
    
    // Clean up transition screen
    if (transScreen) {
        try {
            lv_obj_del(transScreen);
            processLVGLTasks(3, 10);
        } catch (...) {
            Serial.println("[DISPLAY_MANAGER_LVGL] Exception deleting transition screen");
        }
    }
    
    // Print memory status after transition
    printMemoryInfo();
    
    // Final status
    if (success) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Switch complete");
    } else {
        Serial.println("[DISPLAY_MANAGER_LVGL] Switch failed");
        enterSafeMode();
        
        if (newType != LayoutType::HOME) {
            isTransitioning = false;
            DynamicJsonDocument homeDoc(128);
            delay(500);
            switchToLayout(LayoutType::HOME, homeDoc);
            return false;
        }
    }
    
    isTransitioning = false;
    return success;
}

// ScreenDestination interface implementation
String Display_Manager_LVGL::getScreenId() const {
    return "onboard";
}

void Display_Manager_LVGL::applyConfig(const JsonDocument &cfg) {
    if (!lvglInitialized) {
        Serial.println("[DISPLAY_MANAGER_LVGL] ERROR: LVGL not initialized, skipping config");
        return;
    }
    
    // Print memory info for debugging
    printMemoryInfo();
    
    try {
        LayoutType req = LayoutType::NONE;
        
        // Check for all supported layouts
        if (cfg.containsKey("lvgl_grid")) {
            req = LayoutType::GRID;
        }
        else if (cfg.containsKey("lvgl_plotter")) {
            req = LayoutType::PLOTTER;
        }
        else if (cfg.containsKey("lvgl_radio")) {
            req = LayoutType::RADIO;
        }
        else if (cfg.containsKey("lvgl_run")) {
            req = LayoutType::RUN;
        }
        else if (cfg.containsKey("home") || cfg.size() == 0) {
            req = LayoutType::HOME;
        }
        
        if (req != LayoutType::NONE) {
            // Check if layout object exists
            LayoutInterface* layoutCheck = getLayoutForType(req);
            if (!layoutCheck) {
                Serial.printf("[DISPLAY_MANAGER_LVGL] ERROR: Layout object for type %d is null\n", (int)req);
                return;
            }
            
            // Switch to the requested layout
            switchToLayout(req, cfg);
        } else {
            Serial.println("[DISPLAY_MANAGER_LVGL] Unsupported layout configuration");
        }
    } catch (...) {
        Serial.println("[DISPLAY_MANAGER_LVGL] Exception in applyConfig");
        enterSafeMode();
    }
}

void Display_Manager_LVGL::updateSensorData(const JsonDocument &doc) {
    if (!lvglInitialized) {
        return;
    }
    
    // Check for stuck transitions
    if (isTransitioning) {
        if (millis() - transitionStartTime > TRANSITION_TIMEOUT) {
            Serial.println("[DISPLAY_MANAGER_LVGL] ⚠️ Transition timeout detected, forcing reset");
            isTransitioning = false;
            
            // Try to recover by entering safe mode
            if (enterSafeMode()) {
                // Then try to go to home screen after a delay
                delay(500);
                DynamicJsonDocument homeDoc(128);
                switchToLayout(LayoutType::HOME, homeDoc);
            }
            return;
        }
        return; // Skip updates during transition
    }
    
    // Update current layout if available
    if (currentLayout) {
        try {
            currentLayout->update(doc);
        } catch (...) {
            Serial.println("[DISPLAY_MANAGER_LVGL] Exception in updateSensorData");
        }
    }
}

bool Display_Manager_LVGL::matchesScreenId(const String& id, const JsonDocument&) const {
    return id.equalsIgnoreCase(getScreenId());
}

const char* Display_Manager_LVGL::getConfigKey() const {
    return "onboard";
}

LayoutInterface* Display_Manager_LVGL::getLayoutForType(LayoutType type) {
    // Include all supported layout types
    switch (type) {
        case LayoutType::HOME:
            if (!homeLayout) Serial.println("[DISPLAY_MANAGER_LVGL] ERROR: homeLayout is null");
            return homeLayout;
        case LayoutType::GRID:
            if (!gridLayout) Serial.println("[DISPLAY_MANAGER_LVGL] ERROR: gridLayout is null");
            return gridLayout;
        case LayoutType::PLOTTER:
            if (!plotterLayout) Serial.println("[DISPLAY_MANAGER_LVGL] ERROR: plotterLayout is null");
            return plotterLayout;
        case LayoutType::RADIO:
            if (!radioLayout) Serial.println("[DISPLAY_MANAGER_LVGL] ERROR: radioLayout is null");
            return radioLayout;
        case LayoutType::RUN:
            if (!runLayout) Serial.println("[DISPLAY_MANAGER_LVGL] ERROR: runLayout is null");
            return runLayout;
        default:
            return nullptr;
    }
}