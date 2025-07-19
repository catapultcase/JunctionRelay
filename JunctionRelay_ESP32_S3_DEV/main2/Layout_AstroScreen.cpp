#include "Layout_AstroScreen.h"
#include "DisplayManager.h"
#include "DeviceConfig.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <algorithm> // For std::max and std::min
#include <map>       // For std::map
#include <cmath>     // For sin, cos, and other math functions

// Static callback function for the starfield background update
void starfield_update_cb(lv_timer_t* timer) {
    auto background = static_cast<Layout_AstroScreen::StarfieldBackground*>(timer->user_data);
    if (background) {
        background->update();
    } else {
        Serial.println("[ERROR] Background pointer is null in timer callback");
    }
}

// Constructor / Destructor
Layout_AstroScreen::Layout_AstroScreen(DisplayManager* displayManager)
    : mDisplayManager(displayManager)
    , mIsCreated(false)
    , mScreen(nullptr)
    , mConsoleFrame(nullptr)
    , mTerminalArea(nullptr)
    , mLabelNames(nullptr)
    , mLabelValues(nullptr)
    , mSensorCount(0)
    , mBackground(nullptr)
    , mLastAnimationUpdate(0)
    , mAnimationFrameCount(0)
    , mAnimationRunning(false)
{}

Layout_AstroScreen::~Layout_AstroScreen() {
    destroyTimers();
    destroy();
}

int Layout_AstroScreen::estimateTextWidth(const char* text, const lv_font_t* font) {
    // Simple estimation: average character width * string length
    // This is not exact but good enough for layout adjustments
    if (!text || !font) return 0;
    
    // Estimate width based on font size and text length
    int avgCharWidth = font->line_height / 2; // Approximation
    return strlen(text) * avgCharWidth;
}

void Layout_AstroScreen::addSciFiDecorations(lv_obj_t* container, uint32_t borderColor, 
                                          uint8_t borderThickness, bool roundedCorners, 
                                          uint16_t screenWidth, uint16_t screenHeight) {
    // Calculate proportional sizes based on screen dimensions
    int cornerSize = std::max(15, std::min(30, (int)(screenWidth * 0.03))); // 3% of width, min 15px, max 30px
    int barWidth = std::max(80, std::min(300, (int)(screenWidth * 0.25))); // 25% of width, between 80-300px
    int barHeight = std::max(3, std::min(8, (int)(screenHeight * 0.01))); // 1% of height for bar thickness
    
    Serial.printf("[LAYOUT] Creating responsive decorations: corners=%dpx, bars=%dx%dpx\n", 
                 cornerSize, barWidth, barHeight);
    
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
        lv_obj_set_size(corners[i], cornerSize, cornerSize);
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
        lv_obj_set_size(topBar, barWidth, barHeight);
        lv_obj_set_style_bg_color(topBar, lv_color_hex(borderColor), 0);
        lv_obj_set_style_border_width(topBar, 0, 0);
        lv_obj_align(topBar, LV_ALIGN_TOP_MID, 0, 0);
    }
    
    lv_obj_t* bottomBar = lv_obj_create(container);
    if (bottomBar) {
        lv_obj_set_size(bottomBar, barWidth, barHeight);
        lv_obj_set_style_bg_color(bottomBar, lv_color_hex(borderColor), 0);
        lv_obj_set_style_border_width(bottomBar, 0, 0);
        lv_obj_align(bottomBar, LV_ALIGN_BOTTOM_MID, 0, 0);
    }
    
    Serial.println("[LAYOUT] Responsive decorations completed");
}

void Layout_AstroScreen::create(const JsonDocument &configDoc) {
    Serial.println("[DEBUG] Starting Layout_AstroScreen::create");
    
    if (mIsCreated) {
        destroyTimers();
        destroy();
    }
    
    // Clear state
    mSensorTagToIndex.clear();
    
    delete[] mLabelNames;
    mLabelNames = nullptr;
    
    delete[] mLabelValues;
    mLabelValues = nullptr;

    // Get screen dimensions
    uint16_t screenWidth = mDisplayManager->getDevice()->width();
    uint16_t screenHeight = mDisplayManager->getDevice()->height();
    uint8_t rotation = mDisplayManager->getDevice()->getRotation();
    if (rotation == 90 || rotation == 270) std::swap(screenWidth, screenHeight);
    
    Serial.printf("[DEBUG] Screen dimensions: %dx%d (rotation: %d)\n", 
                  screenWidth, screenHeight, rotation);
    
    // Create main screen with black background
    mScreen = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(mScreen, lv_color_black(), 0);
    
    // Create the starfield background
    mBackground = new StarfieldBackground(mScreen, screenWidth, screenHeight);
    
    // Register a timer to update the background every 100ms (10fps)
    lv_timer_t* bgTimer = lv_timer_create(starfield_update_cb, 100, mBackground);
    mTimers.push_back(bgTimer);
    
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
    float terminalWidthRatio = 0.6; // Default: terminal takes 60% of width
    uint32_t borderColor = 0xFFCB6B; // Default gold
    uint32_t backgroundColor = 0x000000; // Default black
    uint32_t textColor = 0xFFCB6B; // Default gold
    uint32_t terminalColor = 0x00FF00; // Default terminal green
    uint8_t consoleOpacity = 60; // Default console opacity (60%)
    uint8_t terminalOpacity = 80; // Default terminal opacity (80%)
    
    // Check if the lvgl_astro config section exists
    if (configDoc.containsKey("lvgl_astro")) {
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
            
        if (configDoc["lvgl_astro"].containsKey("terminal_width_ratio"))
            terminalWidthRatio = configDoc["lvgl_astro"]["terminal_width_ratio"].as<float>();
        
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
        
        if (configDoc["lvgl_astro"].containsKey("terminal_color")) {
            const char* colorStr = configDoc["lvgl_astro"]["terminal_color"].as<const char*>();
            if (colorStr && colorStr[0] == '#') {
                terminalColor = strtoul(colorStr + 1, NULL, 16);
            }
        }
        
        // Read opacity values
        if (configDoc["lvgl_astro"].containsKey("console_opacity")) {
            consoleOpacity = configDoc["lvgl_astro"]["console_opacity"].as<uint8_t>();
            // Constrain to valid values (0-255)
            consoleOpacity = std::min(uint8_t(255), std::max(uint8_t(0), consoleOpacity));
        }
        
        if (configDoc["lvgl_astro"].containsKey("terminal_opacity")) {
            terminalOpacity = configDoc["lvgl_astro"]["terminal_opacity"].as<uint8_t>();
            // Constrain to valid values (0-255)
            terminalOpacity = std::min(uint8_t(255), std::max(uint8_t(0), terminalOpacity));
        }
    }
    
    Serial.printf("[DEBUG] Config - margins: T:%d R:%d B:%d L:%d, border: %s thickness: %d\n",
                 marginTop, marginRight, marginBottom, marginLeft,
                 borderVisible ? "visible" : "hidden", borderThickness);
    
    Serial.printf("[DEBUG] Colors - Border:0x%06X, BG:0x%06X, Text:0x%06X, Terminal:0x%06X\n", 
                 borderColor, backgroundColor, textColor, terminalColor);
                 
    Serial.printf("[DEBUG] Opacity - Console:%d%%, Terminal:%d%%\n", 
                 (consoleOpacity * 100) / 255, (terminalOpacity * 100) / 255);
    
    // Create the console frame container
    mConsoleFrame = lv_obj_create(mScreen);
    
    // Set size based on screen dimensions and margins
    lv_obj_set_size(mConsoleFrame, 
                    screenWidth - marginLeft - marginRight,
                    screenHeight - marginTop - marginBottom);
    
    // Position with margins
    lv_obj_set_pos(mConsoleFrame, marginLeft, marginTop);
    
    // Style the console frame with sci-fi look
    lv_obj_set_style_bg_color(mConsoleFrame, lv_color_hex(backgroundColor), 0);
    lv_obj_set_style_bg_opa(mConsoleFrame, consoleOpacity, 0);  // Use configured opacity
    
    // Apply border if visible
    if (borderVisible) {
        lv_obj_set_style_border_color(mConsoleFrame, lv_color_hex(borderColor), 0);
        lv_obj_set_style_border_width(mConsoleFrame, borderThickness, 0);
        lv_obj_set_style_border_opa(mConsoleFrame, LV_OPA_COVER, 0);
    } else {
        lv_obj_set_style_border_width(mConsoleFrame, 0, 0);
    }
    
    // Apply corner radius if rounded corners enabled
    lv_obj_set_style_radius(mConsoleFrame, roundedCorners ? 10 : 0, 0);
    
    // Apply padding
    lv_obj_set_style_pad_all(mConsoleFrame, innerPadding, 0);
    
    // Disable scrollbars if specified
    if (!enableScrollbars) {
        lv_obj_clear_flag(mConsoleFrame, LV_OBJ_FLAG_SCROLLABLE);
    }
    
    // Add sci-fi styling corners and decorations
    if (borderVisible) {
        addSciFiDecorations(mConsoleFrame, borderColor, borderThickness, roundedCorners, screenWidth, screenHeight);
    }

    // Map the sensors from the layout configuration to determine sensor count
    int maxLabelWidth = 0;
    
    // First calculate sensorCount and find the longest label
    if (configDoc.containsKey("layout")) {
        const JsonArrayConst& layout = configDoc["layout"].as<JsonArrayConst>();
        mSensorCount = std::min((int)layout.size(), MAX_SENSORS);
        
        // Analyze label lengths to determine optimal terminal width
        for (int i = 0; i < mSensorCount; i++) {
            const JsonObjectConst& sensorConfig = layout[i].as<JsonObjectConst>();
            
            if (sensorConfig.containsKey("label")) {
                const char* sensorLabelText = sensorConfig["label"].as<const char*>();
                // Calculate width of label + some space for value ("> label: 00.00")
                char buffer[50];
                snprintf(buffer, sizeof(buffer), "> %s: 00.00", sensorLabelText);
                int labelWidth = estimateTextWidth(buffer, &lv_font_montserrat_14);
                maxLabelWidth = std::max(maxLabelWidth, labelWidth);
            }
        }
        
        Serial.printf("[DEBUG] Found %d sensors in layout configuration. Longest label width: ~%dpx\n", 
                     mSensorCount, maxLabelWidth);
    }
    
    // Determine terminal width - either based on content or use the ratio from config
    int availWidth = screenWidth - marginLeft - marginRight - (innerPadding * 2);
    int contentBasedWidth = maxLabelWidth + 30; // Add some padding
    int ratioBasedWidth = (int)(availWidth * terminalWidthRatio);
    
    // Use the larger of content-based or ratio-based width
    int terminalWidth = std::max(contentBasedWidth, ratioBasedWidth);
    
    // Calculate terminal height dynamically based on number of sensors
    // Height calculation: header (30px) + separator (5px) + (sensor count * sensor line height)
    const int sensorLineHeight = 22; // For larger font
    const int terminalHeaderHeight = 35; // For larger font
    const int terminalHeight = terminalHeaderHeight + (mSensorCount * sensorLineHeight) + 10; // Added padding
    
    Serial.printf("[DEBUG] Terminal dimensions: width=%d, height=%d (for %d sensors)\n", 
                 terminalWidth, terminalHeight, mSensorCount);
    
    // Create terminal container - centered in frame
    mTerminalArea = lv_obj_create(mConsoleFrame);
    lv_obj_set_size(mTerminalArea, terminalWidth, terminalHeight);
    lv_obj_align(mTerminalArea, LV_ALIGN_CENTER, 0, 0);
    
    // Style terminal with vintage look
    lv_obj_set_style_bg_color(mTerminalArea, lv_color_hex(backgroundColor), 0);
    lv_obj_set_style_bg_opa(mTerminalArea, terminalOpacity, 0); // Use configured opacity
    
    if (borderVisible) {
        lv_obj_set_style_border_color(mTerminalArea, lv_color_hex(terminalColor), 0);
        lv_obj_set_style_border_width(mTerminalArea, 1, 0);
        lv_obj_set_style_border_opa(mTerminalArea, LV_OPA_COVER, 0);
    }
    
    // Disable scrolling for terminal - we're sizing it properly now
    lv_obj_clear_flag(mTerminalArea, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_pad_all(mTerminalArea, 5, 0); // Smaller padding for terminal
    
    // Create a terminal header
    lv_obj_t* terminalHeader = lv_label_create(mTerminalArea);
    lv_obj_set_style_text_color(terminalHeader, lv_color_hex(terminalColor), 0);
    // Use larger font for terminal header
    lv_obj_set_style_text_font(terminalHeader, &lv_font_montserrat_14, 0); 
    lv_label_set_text(terminalHeader, "SENSOR TERMINAL v1.0");
    lv_obj_align(terminalHeader, LV_ALIGN_TOP_LEFT, 0, 0);
    
    // Create a separator line
    lv_obj_t* separator = lv_line_create(mTerminalArea);
    static lv_point_t line_points[] = {{0, 0}, {terminalWidth - 10, 0}};
    lv_line_set_points(separator, line_points, 2);
    lv_obj_set_style_line_color(separator, lv_color_hex(terminalColor), 0);
    lv_obj_set_style_line_width(separator, 1, 0);
    lv_obj_align_to(separator, terminalHeader, LV_ALIGN_OUT_BOTTOM_MID, 0, 2);
    
    // Reset sensor mapping
    mSensorTagToIndex.clear();

    // Create arrays for sensor value display
    const int yStart = 30; // Starting Y position for sensor data
    
    // Map the sensors from the layout configuration
    if (configDoc.containsKey("layout")) {
        const JsonArrayConst& layout = configDoc["layout"].as<JsonArrayConst>();
        mSensorCount = std::min((int)layout.size(), MAX_SENSORS);
        
        // Allocate arrays
        mLabelNames = new lv_obj_t*[mSensorCount];
        mLabelValues = new lv_obj_t*[mSensorCount];
        
        for (int i = 0; i < mSensorCount; i++) {
            const JsonObjectConst& sensorConfig = layout[i].as<JsonObjectConst>();
            
            if (sensorConfig.containsKey("id") && sensorConfig.containsKey("label")) {
                const char* sensorId = sensorConfig["id"].as<const char*>();
                const char* sensorLabelText = sensorConfig["label"].as<const char*>();
                
                // Map sensor ID to index
                mSensorTagToIndex[String(sensorId)] = i;
                
                // Create label for this sensor
                lv_obj_t* sensorLabelObj = lv_label_create(mTerminalArea);
                lv_obj_set_style_text_color(sensorLabelObj, lv_color_hex(terminalColor), 0);
                // Use larger font for sensor values
                lv_obj_set_style_text_font(sensorLabelObj, &lv_font_montserrat_14, 0);
                
                // Initialize with sensor name
                char buffer[50];
                snprintf(buffer, sizeof(buffer), "> %s: ---", sensorLabelText);
                lv_label_set_text(sensorLabelObj, buffer);
                lv_obj_set_pos(sensorLabelObj, 0, yStart + i * sensorLineHeight);
                
                // Store in our arrays
                mLabelNames[i] = nullptr; // We don't use separate name labels in this layout
                mLabelValues[i] = sensorLabelObj;
                
                Serial.printf("[DEBUG] Mapped sensor '%s' (label: '%s') to index %d\n", 
                             sensorId, sensorLabelText, i);
            }
        }
    }
    
    // Load the screen
    lv_scr_load(mScreen);
    mIsCreated = true;
    
    Serial.println("[DEBUG] AstroScreen created successfully");
}

void Layout_AstroScreen::destroy() {
    if (!mIsCreated) return;
    
    Serial.println("[DEBUG] Destroying AstroScreen");
    
    // Clean up timers first
    destroyTimers();
    
    // Clean up starfield background
    if (mBackground) {
        delete mBackground;
        mBackground = nullptr;
    }
    
    // Delete label arrays
    delete[] mLabelNames;
    mLabelNames = nullptr;
    
    delete[] mLabelValues;
    mLabelValues = nullptr;
    
    // Delete screen (which deletes all child objects)
    if (mScreen) {
        lv_obj_del(mScreen);
        mScreen = nullptr;
        mConsoleFrame = nullptr; // Will be deleted by parent
        mTerminalArea = nullptr; // Will be deleted by parent
    }
    
    // Clear all maps
    mSensorTagToIndex.clear();
    
    mIsCreated = false;
    Serial.println("[DEBUG] AstroScreen destroyed");
}

void Layout_AstroScreen::destroyTimers() {
    Serial.println("[DEBUG] Destroying AstroScreen timers");
    
    // Delete all timer objects
    for (auto timer : mTimers) {
        if (timer) {
            lv_timer_del(timer);
        }
    }
    
    mTimers.clear();
}

void Layout_AstroScreen::update(const JsonDocument &doc) {
    if (!mIsCreated) return;
    
    // Check animation status
    uint32_t now = millis();
    if (now - mLastAnimationUpdate > 1000) {
        // Animation may have stalled - no updates in over 1 second
        mAnimationRunning = false;
    }
    
    auto root = doc.as<JsonObjectConst>();
    if (!root.containsKey("sensors")) return;
    
    auto sensors = root["sensors"].as<JsonObjectConst>();
    for (auto kv : sensors) {
        const char* tag = kv.key().c_str();
        auto arr = kv.value().as<JsonArrayConst>();
        if (arr.isNull() || arr.size() == 0) continue;
        
        auto obj = arr[0].as<JsonObjectConst>();
        const char* vs = obj["Value"].as<const char*>();
        
        // Update sensor display
        if (vs) {
            float value = atof(vs);
            updateSensorDisplay(tag, value);
        }
    }
}

void Layout_AstroScreen::updateSensorDisplay(const char* sensorTag, float value) {
    // Update the terminal display with new sensor data
    auto it = mSensorTagToIndex.find(sensorTag);
    if (it != mSensorTagToIndex.end()) {
        int idx = it->second;
        
        // Check if this is a valid index
        if (idx >= 0 && idx < MAX_SENSORS && mLabelValues[idx] != nullptr) {
            // Get the current label text to extract the sensor name
            const char* currentText = lv_label_get_text(mLabelValues[idx]);
            char sensorName[30] = "";
            
            // Extract sensor name from current text (between '>' and ':')
            const char* colonPos = strchr(currentText, ':');
            if (colonPos != nullptr) {
                size_t nameLen = std::min(size_t(colonPos - currentText - 2), sizeof(sensorName) - 1);
                strncpy(sensorName, currentText + 2, nameLen);
                sensorName[nameLen] = '\0';
            }
            
            // Create updated text with the value
            char buffer[50];
            snprintf(buffer, sizeof(buffer), "> %s: %.2f", sensorName, value);
            
            // Update the label text
            lv_label_set_text(mLabelValues[idx], buffer);
            
            // Add blinking effect to the updated label (briefly change color)
            lv_obj_set_style_text_color(mLabelValues[idx], lv_color_white(), 0);
            
            // Schedule a timer to restore original color after 200ms
            lv_timer_t* timer = lv_timer_create([](lv_timer_t* timer) {
                lv_obj_t* label = (lv_obj_t*)timer->user_data;
                // Restore terminal color (assuming green)
                lv_obj_set_style_text_color(label, lv_color_hex(0x00FF00), 0);
                lv_timer_del(timer); // Delete the timer after use
            }, 200, mLabelValues[idx]);
        }
    }
}

void Layout_AstroScreen::registerSensors(const JsonDocument &configDoc) {
    if (configDoc.containsKey("layout")) {
        const JsonArrayConst& layout = configDoc["layout"].as<JsonArrayConst>();
        for (auto v : layout) {
            if (v.containsKey("id")) {
                String id = v["id"].as<String>();
                Serial.printf("[DEBUG] Astro register sensor: %s\n", id.c_str());
            }
        }
    }
}

lv_obj_t* Layout_AstroScreen::getScreen() const {
    return mScreen;
}

// StarfieldBackground Implementation
int Layout_AstroScreen::StarfieldBackground::calculateStarCount(int width, int height) {
    // Aim for approximately 1 star per 2500 square pixels, with some constraints
    int area = width * height;
    int count = area / 2500;
    
    // Constrain between reasonable limits
    return std::max(50, std::min(200, count));
}

Layout_AstroScreen::StarfieldBackground::StarfieldBackground(lv_obj_t* parent, int width, int height) {
    Serial.println("[DEBUG] Creating optimized starfield background");
    
    // Record creation time
    creationTime = millis();
    
    // Initialize canvas
    canvasWidth = width;
    canvasHeight = height;
    
    // Create stars (dynamically based on screen size)
    int starCount = calculateStarCount(width, height);
    createStars(starCount);
    
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
    
    Serial.printf("[DEBUG] Starfield background created with %d stars\n", starCount);
}

Layout_AstroScreen::StarfieldBackground::~StarfieldBackground() {
    if (canvasBuffer) {
        delete[] canvasBuffer;
        canvasBuffer = nullptr;
    }
    // Canvas object will be deleted with parent
}

void Layout_AstroScreen::StarfieldBackground::createStars(int count) {
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
        stars[i].prevBrightness = stars[i].brightness;
        
        // Random direction
        stars[i].twinkleDirection = random(0, 2) * 2 - 1; // Either -1 or 1
        
        // Varied twinkling speeds between stars
        stars[i].twinkleSpeed = random(3, 12);
        
        // Initial draw requires all stars
        stars[i].needsRedraw = true;
    }
}

void Layout_AstroScreen::StarfieldBackground::updateStars() {
    // More pronounced twinkling with varied speeds
    for (auto& star : stars) {
        // Save previous brightness to check for changes
        star.prevBrightness = star.brightness;
        
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
        
        // Mark for redraw only if brightness changed
        star.needsRedraw = (star.brightness != star.prevBrightness);
    }
}

void Layout_AstroScreen::StarfieldBackground::render() {
    // Update stars
    updateStars();
    
    // Optimization: Only redraw stars that changed
    for (const auto& star : stars) {
        if (star.needsRedraw) {
            // Clear old star if it was visible before
            if (star.prevBrightness > 0) {
                lv_canvas_set_px(canvas, star.x, star.y, lv_color_hex(0x000000));
            }
            
            // Draw new star if it should be visible
            if (star.brightness > 0) {
                uint8_t b = star.brightness;
                lv_canvas_set_px(canvas, star.x, star.y, lv_color_make(b, b, b));
            }
        }
    }
}

void Layout_AstroScreen::StarfieldBackground::update() {
    // Update animation tracking
    uint32_t now = millis();
    uint32_t elapsed = now - lastUpdateTime;
    
    // Only update if enough time has passed (throttling)
    if (elapsed < 100) { // Keep at 10fps for performance
        return;
    }
    
    lastUpdateTime = now;
    
    render();
}