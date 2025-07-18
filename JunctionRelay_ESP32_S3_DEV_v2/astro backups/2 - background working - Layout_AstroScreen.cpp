// Layout_AstroScreen.cpp - With starfield and console frame layer

#include "DisplayManager.h"
#include <vector>
#include <ArduinoJson.h>
#include <algorithm> // For std::max and std::min

// Structure to hold star data (simplified)
struct Star {
    int x;
    int y;
    uint8_t brightness;       // 0-255
    uint8_t maxBrightness;    // The brightest this star gets
    int8_t twinkleDirection;  // 1 = getting brighter, -1 = getting dimmer
    uint8_t twinkleSpeed;     // Varies per star for more natural effect
    uint16_t minBrightness;   // Allow stars to get very dim
};

// Global variables to monitor animation
static uint32_t lastAnimationUpdate = 0;
static uint32_t animationFrameCount = 0;
static bool animationRunning = false;

// Track screen objects for updates and cleanup
static lv_obj_t* consoleFrame = nullptr;

// Using flex layout for absolute reliability
void addSciFiDecorations(lv_obj_t* container, uint32_t borderColor, uint8_t borderThickness, bool roundedCorners, uint16_t screenWidth) {
    Serial.println("[LAYOUT] Creating a very simple flex-based layout");
    
    // ===== ULTRA SIMPLE APPROACH =====
    
    // Create corner indicators
    lv_obj_t* corners[4];
    lv_align_t alignments[4] = {
        LV_ALIGN_TOP_LEFT,
        LV_ALIGN_TOP_RIGHT,
        LV_ALIGN_BOTTOM_LEFT,
        LV_ALIGN_BOTTOM_RIGHT
    };
    
    // Create each corner and position it
    for (int i = 0; i < 4; i++) {
        corners[i] = lv_obj_create(container);
        if (!corners[i]) {
            Serial.printf("[ERROR] Failed to create corner %d\n", i);
            continue;
        }
        
        // Set size and style
        lv_obj_set_size(corners[i], 25, 25);
        lv_obj_set_style_radius(corners[i], 0, 0);
        lv_obj_set_style_bg_color(corners[i], lv_color_hex(borderColor), 0);
        lv_obj_set_style_border_width(corners[i], 0, 0);
        
        // Align to corresponding corner
        lv_obj_align(corners[i], alignments[i], 0, 0);
        
        Serial.printf("[LAYOUT] Created corner at position %d\n", i);
    }
    
    // Create top and bottom bars
    lv_obj_t* topBar = lv_obj_create(container);
    if (topBar) {
        lv_obj_set_size(topBar, 100, 5);
        lv_obj_set_style_bg_color(topBar, lv_color_hex(borderColor), 0);
        lv_obj_set_style_border_width(topBar, 0, 0);
        lv_obj_align(topBar, LV_ALIGN_TOP_MID, 0, 0);
    }
    
    lv_obj_t* bottomBar = lv_obj_create(container);
    if (bottomBar) {
        lv_obj_set_size(bottomBar, 100, 5);
        lv_obj_set_style_bg_color(bottomBar, lv_color_hex(borderColor), 0);
        lv_obj_set_style_border_width(bottomBar, 0, 0);
        lv_obj_align(bottomBar, LV_ALIGN_BOTTOM_MID, 0, 0);
    }
    
    Serial.println("[LAYOUT] Minimal decorations completed");
}

// Simplified class for the background effect
class StarfieldBackground {
private:
    std::vector<Star> stars;
    uint32_t lastUpdateTime = 0;
    uint32_t creationTime = 0;
    
    lv_obj_t* canvas = nullptr;
    uint8_t* canvasBuffer = nullptr;
    int canvasWidth = 0;
    int canvasHeight = 0;
    
public:
    StarfieldBackground(lv_obj_t* parent, int width, int height) {
        Serial.println("[DEBUG] Creating starfield background with enhanced twinkling");
        
        // Record creation time
        creationTime = millis();
        
        // Initialize canvas
        canvasWidth = width;
        canvasHeight = height;
        
        // Create stars (kept at 100 for performance)
        createStars(100);
        
        // Create the canvas for drawing
        canvasBuffer = new uint8_t[LV_CANVAS_BUF_SIZE_TRUE_COLOR(width, height)];
        if (!canvasBuffer) {
            Serial.println("[ERROR] Failed to allocate canvas buffer memory");
            return;
        }
        
        canvas = lv_canvas_create(parent);
        if (!canvas) {
            Serial.println("[ERROR] Failed to create canvas");
            delete[] canvasBuffer;
            canvasBuffer = nullptr;
            return;
        }
        
        lv_canvas_set_buffer(canvas, canvasBuffer, width, height, LV_IMG_CF_TRUE_COLOR);
        lv_obj_center(canvas);
        
        // Move to bottom of z-order
        lv_obj_move_background(canvas);
        
        // Initial render
        lv_canvas_fill_bg(canvas, lv_color_hex(0x000000), LV_OPA_COVER);
        render();
        
        Serial.println("[DEBUG] Starfield background created successfully");
    }
    
    ~StarfieldBackground() {
        if (canvasBuffer) {
            delete[] canvasBuffer;
        }
    }
    
    void createStars(int count) {
        Serial.printf("[DEBUG] Creating %d stars with varied twinkling\n", count);
        stars.resize(count);
        
        for (int i = 0; i < count; i++) {
            stars[i].x = random(0, canvasWidth);
            stars[i].y = random(0, canvasHeight);
            
            // More varied brightness for more visible twinkling
            stars[i].maxBrightness = random(180, 255);
            
            // Let some stars get very dim for dramatic twinkling
            stars[i].minBrightness = random(0, 20);
            
            // Start at random brightness
            stars[i].brightness = random(stars[i].minBrightness, stars[i].maxBrightness);
            
            // Random direction
            stars[i].twinkleDirection = random(0, 2) * 2 - 1; // Either -1 or 1
            
            // Varied twinkling speeds between stars
            stars[i].twinkleSpeed = random(3, 12);
        }
    }
    
    void updateStars() {
        // More pronounced twinkling with varied speeds
        for (auto& star : stars) {
            // Use the star's twinkle speed for brightness change
            // plus a bit of randomness for natural variation
            int brightnessChange = star.twinkleSpeed + random(0, 3);
            
            if (star.twinkleDirection > 0) {
                // Getting brighter
                star.brightness += brightnessChange;
                if (star.brightness >= star.maxBrightness) {
                    star.brightness = star.maxBrightness;
                    star.twinkleDirection = -1; // Start dimming
                }
            } else {
                // Getting dimmer
                star.brightness = (star.brightness > brightnessChange) ? 
                                  star.brightness - brightnessChange : star.minBrightness;
                
                if (star.brightness <= star.minBrightness) {
                    star.brightness = star.minBrightness;
                    star.twinkleDirection = 1; // Start brightening
                }
            }
        }
    }
    
    void render() {
        // First, erase all stars from their previous positions
        for (const auto& star : stars) {
            lv_canvas_set_px(canvas, star.x, star.y, lv_color_hex(0x000000));
        }
        
        // Update stars
        updateStars();
        
        // Now draw all stars at their current brightness
        for (const auto& star : stars) {
            uint8_t b = star.brightness;
            lv_canvas_set_px(canvas, star.x, star.y, lv_color_make(b, b, b));
        }
    }
    
    void update() {
        // Update animation tracking
        uint32_t now = millis();
        uint32_t elapsed = now - lastUpdateTime;
        
        // Only update if enough time has passed (throttling)
        if (elapsed < 100) { // Keep at 10fps for performance
            return;
        }
        
        lastUpdateTime = now;
        lastAnimationUpdate = now;
        animationFrameCount++;
        animationRunning = true;
        
        // Print animation stats occasionally
        if (animationFrameCount % 100 == 0) {
            float runTimeSeconds = (now - creationTime) / 1000.0f;
            float fps = animationFrameCount / runTimeSeconds;
            Serial.printf("[DEBUG] Starfield stats: frames=%u, time=%.1fs, fps=%.1f\n",
                         animationFrameCount, runTimeSeconds, fps);
        }
        
        render();
    }
};

// Main implementation of AstroScreen - creating starfield and console frame
void DisplayManager::createAstroScreen(const JsonDocument &configDoc) {
    Serial.println("[DEBUG] Creating AstroScreen with starfield and console frame");
    
    // Get screen dimensions
    uint16_t screenWidth = device->width();
    uint16_t screenHeight = device->height();
    uint8_t rotation = device->getRotation();
    if (rotation == 90 || rotation == 270) std::swap(screenWidth, screenHeight);
    
    Serial.printf("[DEBUG] Screen dimensions: %dx%d (rotation: %d)\n", 
                 screenWidth, screenHeight, rotation);
    
    // Create main screen with black background
    lv_obj_t* scr = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(scr, lv_color_hex(0x000000), 0);
    
    // Create the starfield background
    static StarfieldBackground* background = nullptr;
    
    // Clean up any existing background
    if (background) {
        delete background;
        background = nullptr;
        Serial.println("[DEBUG] Deleted previous background");
    }
    
    // Create new background
    background = new StarfieldBackground(scr, screenWidth, screenHeight);
    
    // Register a timer to update the background every 100ms (10fps)
    lv_timer_t* timer = lv_timer_create([](lv_timer_t* timer) {
        StarfieldBackground* bg = (StarfieldBackground*)timer->user_data;
        if (bg) {
            bg->update();
        } else {
            Serial.println("[ERROR] Background pointer is null in timer callback");
        }
    }, 100, background); // Keep at 10fps for stability
    
    // LOCAL FUNCTION: Create the console frame with sci-fi styling
    auto createConsoleFrame = [&](lv_obj_t* parent, const JsonDocument &configDoc, uint16_t screenWidth, uint16_t screenHeight) {
        Serial.println("[DEBUG] Creating console frame layer");
        
        // Check if the lvgl_astro config section exists
        if (!configDoc.containsKey("lvgl_astro")) {
            Serial.println("[WARN] No lvgl_astro configuration found, using defaults");
            return;
        }
        
        // Initialize with default values
        int marginTop = 5;
        int marginRight = 5;
        int marginBottom = 5;
        int marginLeft = 5;
        int outerPadding = 10;
        int innerPadding = 10;
        bool borderVisible = true;
        uint8_t borderThickness = 2;
        bool roundedCorners = false;
        bool enableScrollbars = false;
        uint32_t borderColor = 0xFFCB6B; // Default gold
        uint32_t backgroundColor = 0x000000; // Default black
        uint32_t textColor = 0xFFCB6B; // Default gold
        
        // Direct access - don't store intermediate JsonVariant
        if (configDoc["lvgl_astro"].containsKey("top_margin")) 
            marginTop = configDoc["lvgl_astro"]["top_margin"].as<int>();
        
        if (configDoc["lvgl_astro"].containsKey("right_margin"))
            marginRight = configDoc["lvgl_astro"]["right_margin"].as<int>();
        
        if (configDoc["lvgl_astro"].containsKey("bottom_margin"))
            marginBottom = configDoc["lvgl_astro"]["bottom_margin"].as<int>();
        
        if (configDoc["lvgl_astro"].containsKey("left_margin"))
            marginLeft = configDoc["lvgl_astro"]["left_margin"].as<int>();
        
        if (configDoc["lvgl_astro"].containsKey("outer_padding"))
            outerPadding = configDoc["lvgl_astro"]["outer_padding"].as<int>();
        
        if (configDoc["lvgl_astro"].containsKey("inner_padding"))
            innerPadding = configDoc["lvgl_astro"]["inner_padding"].as<int>();
        
        if (configDoc["lvgl_astro"].containsKey("border_visible"))
            borderVisible = configDoc["lvgl_astro"]["border_visible"].as<bool>();
        
        if (configDoc["lvgl_astro"].containsKey("border_thickness"))
            borderThickness = configDoc["lvgl_astro"]["border_thickness"].as<uint8_t>();
        
        if (configDoc["lvgl_astro"].containsKey("rounded_corners"))
            roundedCorners = configDoc["lvgl_astro"]["rounded_corners"].as<bool>();
        
        if (configDoc["lvgl_astro"].containsKey("enable_scrollbars"))
            enableScrollbars = configDoc["lvgl_astro"]["enable_scrollbars"].as<bool>();
        
        // Parse color strings
        if (configDoc["lvgl_astro"].containsKey("border_color")) {
            const char* colorStr = configDoc["lvgl_astro"]["border_color"].as<const char*>();
            if (colorStr && colorStr[0] == '#') {
                borderColor = strtoul(colorStr + 1, NULL, 16);
            }
        }
        
        if (configDoc["lvgl_astro"].containsKey("background_color")) {
            const char* colorStr = configDoc["lvgl_astro"]["background_color"].as<const char*>();
            if (colorStr && colorStr[0] == '#') {
                backgroundColor = strtoul(colorStr + 1, NULL, 16);
            }
        }
        
        if (configDoc["lvgl_astro"].containsKey("text_color")) {
            const char* colorStr = configDoc["lvgl_astro"]["text_color"].as<const char*>();
            if (colorStr && colorStr[0] == '#') {
                textColor = strtoul(colorStr + 1, NULL, 16);
            }
        }
        
        Serial.printf("[DEBUG] Config - margins: T:%d R:%d B:%d L:%d, border: %s thickness: %d\n",
                     marginTop, marginRight, marginBottom, marginLeft,
                     borderVisible ? "visible" : "hidden", borderThickness);
        
        Serial.printf("[DEBUG] Colors - Border:0x%06X, BG:0x%06X, Text:0x%06X\n", 
                     borderColor, backgroundColor, textColor);
        
        // Create the console frame container
        if (consoleFrame != nullptr) {
            lv_obj_del(consoleFrame);
            consoleFrame = nullptr;
        }
        
        consoleFrame = lv_obj_create(parent);
        
        // Set size based on screen dimensions and margins
        lv_obj_set_size(consoleFrame, 
                        screenWidth - marginLeft - marginRight,
                        screenHeight - marginTop - marginBottom);
        
        // Position with margins
        lv_obj_set_pos(consoleFrame, marginLeft, marginTop);
        
        // Style the console frame with sci-fi look
        lv_obj_set_style_bg_color(consoleFrame, lv_color_hex(backgroundColor), 0);
        lv_obj_set_style_bg_opa(consoleFrame, LV_OPA_60, 0);  // Semi-transparent background
        
        // Apply border if visible
        if (borderVisible) {
            lv_obj_set_style_border_color(consoleFrame, lv_color_hex(borderColor), 0);
            lv_obj_set_style_border_width(consoleFrame, borderThickness, 0);
            lv_obj_set_style_border_opa(consoleFrame, LV_OPA_COVER, 0);
        } else {
            lv_obj_set_style_border_width(consoleFrame, 0, 0);
        }
        
        // Apply corner radius if rounded corners enabled
        lv_obj_set_style_radius(consoleFrame, roundedCorners ? 10 : 0, 0);
        
        // Apply padding
        lv_obj_set_style_pad_all(consoleFrame, innerPadding, 0);
        
        // Disable scrollbars if specified
        if (!enableScrollbars) {
            lv_obj_clear_flag(consoleFrame, LV_OBJ_FLAG_SCROLLABLE);
        }
        
        // Add sci-fi styling corners and decorations
        if (borderVisible) {
            addSciFiDecorations(consoleFrame, borderColor, borderThickness, roundedCorners, screenWidth);
        }
        
        Serial.println("[DEBUG] Console frame created successfully");
    };
    
    // Call the local function to create the console frame
    createConsoleFrame(scr, configDoc, screenWidth, screenHeight);
    
    // Load the screen
    lv_scr_load(scr);
    
    Serial.println("[DEBUG] AstroScreen created successfully");
}

// Method to update sensor data in the AstroScreen
void DisplayManager::updateAstroSensorData(const char* sensorTag, float value) {
    // Check animation status
    uint32_t now = millis();
    if (now - lastAnimationUpdate > 1000) {
        Serial.println("[WARN] Animation may have stalled - no updates in over 1 second");
        animationRunning = false;
    }
    
    // Currently empty - will be implemented when we add the sensor visualization layer
    Serial.printf("[DEBUG] updateAstroSensorData called for sensor %s with value %.2f\n", sensorTag, value);
    Serial.printf("[DEBUG] Animation status: running=%d, frames=%u\n", 
                 animationRunning ? 1 : 0, animationFrameCount);
}