#include "Manager_NeoPixels.h"
#include <math.h>

// Initialize static instance pointer to nullptr
Manager_NeoPixels* Manager_NeoPixels::instance = nullptr;

// Private constructor
Manager_NeoPixels::Manager_NeoPixels() : initialized(false) {
    // Clean constructor - no task-related initialization needed
}

// Static method to get the singleton instance
Manager_NeoPixels* Manager_NeoPixels::getInstance() {
    if (instance == nullptr) {
        instance = new Manager_NeoPixels();
    }
    return instance;
}

void Manager_NeoPixels::addStrip(int stripId, int pin, int numPixels) {
    // Only create valid strips
    if (pin <= 0 || numPixels <= 0) {
        Serial.printf("[ERROR][MANAGER_NEOPIXELS] Invalid parameters for Strip %d: Pin %d, Pixels %d\n", 
                      stripId, pin, numPixels);
        return;
    }
    
    Serial.printf("[MANAGER_NEOPIXELS] Adding strip %d: Pin %d, %d pixels\n", stripId, pin, numPixels);
    
    // FIXED: Use emplace_back with move semantics to avoid copy issues
    if (stripId >= strips.size()) {
        // Reserve extra capacity to avoid multiple reallocations
        strips.reserve(stripId + 4);
        
        // Add placeholder strips up to the desired index
        while (strips.size() <= stripId) {
            strips.emplace_back(-1, 0); // Invalid placeholder
        }
    }
    
    // Replace the placeholder with the actual strip using move assignment
    strips[stripId] = NeoPixelStrip(pin, numPixels);
    
    Serial.printf("[MANAGER_NEOPIXELS] Added Strip %d: Pin %d, %d pixels, Effect Type %d\n", 
                  stripId, pin, numPixels, strips[stripId].effectType);
}

void Manager_NeoPixels::begin() {
    if (initialized) {
        Serial.println("[MANAGER_NEOPIXELS] Already initialized, skipping...");
        return;
    }
    
    #if defined(NEOPIXEL_POWER)
    pinMode(NEOPIXEL_POWER, OUTPUT);
    digitalWrite(NEOPIXEL_POWER, HIGH);
    #endif

    // FIXED: Use index-based loop to avoid iterator issues
    for (size_t i = 0; i < strips.size(); i++) {
        auto& strip = strips[i];
        
        // Debug logging to see what's happening
        Serial.printf("[MANAGER_NEOPIXELS] Strip %zu Debug: Pin=%d, Pixels=%d, EffectType=%d\n", 
                      i, strip.pin, strip.numPixels, strip.effectType);
        
        // Skip invalid strips (created with pin -1)
        if (!strip.valid || strip.pixels == nullptr) {
            Serial.printf("[MANAGER_NEOPIXELS] Skipping invalid Strip %zu (Pin=%d, Pixels=%d)\n", 
                          i, strip.pin, strip.numPixels);
            continue;
        }
        
        strip.pixels->begin();
        strip.pixels->setBrightness(20);
        strip.pixels->clear();
        strip.pixels->show();
        
        Serial.printf("[MANAGER_NEOPIXELS] Initialized Strip %zu: Pin %d, %d pixels, Effect Type %d\n", 
                      i, strip.pin, strip.numPixels, strip.effectType);

        // Only precompute CM5 data if using CM5 effect
        if (strip.effectType == EFFECT_CM5_MATRIX) {
            for (int col = 0; col < PANEL_WIDTH; col++) {
                if (col < 8) {
                    strip.baseBrightness[col] = 0.3 + 0.7 * ((float)col / 7.0);
                } else {
                    strip.baseBrightness[col] = 1.0 - 0.7 * ((float)(col - 8) / 7.0);
                }
            }
        }
    }
    
    initialized = true;
    
    // Run test pattern on all valid strips
    runTestPattern();
    
    Serial.println("[MANAGER_NEOPIXELS] ✅ NeoPixel strips initialized and ready for updates from main loop.");
}

bool Manager_NeoPixels::isValidStripId(int stripId) const {
    return stripId >= 0 && stripId < (int)strips.size() && strips[stripId].valid && strips[stripId].pixels != nullptr;
}

// Generic effect control methods (apply to all strips)
void Manager_NeoPixels::setEffectActive(bool active) {
    if (!initialized) return;
    
    for (size_t i = 0; i < strips.size(); i++) {
        auto& strip = strips[i];
        if (!strip.valid || strip.pixels == nullptr) continue; // Skip invalid strips
        
        strip.effectActive = active;
        if (!active) {
            strip.pixels->clear();
            strip.pixels->show();
        }
    }
    Serial.printf("[MANAGER_NEOPIXELS] All strips effect %s\n", active ? "enabled" : "disabled");
}

void Manager_NeoPixels::setEffectColor(uint32_t color) {
    if (!initialized) return;
    
    for (size_t i = 0; i < strips.size(); i++) {
        auto& strip = strips[i];
        if (!strip.valid || strip.pixels == nullptr) continue; // Skip invalid strips
        strip.effectColor = color;
    }
    Serial.printf("[MANAGER_NEOPIXELS] All strips color set to: 0x%08X\n", color);
}

void Manager_NeoPixels::setFlipDirection(bool flip) {
    if (!initialized) return;
    
    for (size_t i = 0; i < strips.size(); i++) {
        auto& strip = strips[i];
        if (!strip.valid || strip.pixels == nullptr) continue; // Skip invalid strips
        strip.flipDirection = flip;
    }
    Serial.printf("[MANAGER_NEOPIXELS] All strips flip direction set to: %s\n", flip ? "true" : "false");
}

// Individual strip control methods
void Manager_NeoPixels::setEffectActive(int stripId, bool active) {
    if (!initialized || !isValidStripId(stripId)) return;
    
    auto& strip = strips[stripId];
    strip.effectActive = active;
    if (!active) {
        strip.pixels->clear();
        strip.pixels->show();
    }
    Serial.printf("[MANAGER_NEOPIXELS] Strip %d effect %s\n", stripId, active ? "enabled" : "disabled");
}

void Manager_NeoPixels::setEffectColor(int stripId, uint32_t color) {
    if (!initialized || !isValidStripId(stripId)) return;
    
    auto& strip = strips[stripId];
    strip.effectColor = color;
    Serial.printf("[MANAGER_NEOPIXELS] Strip %d color set to: 0x%08X\n", stripId, color);
}

void Manager_NeoPixels::setFlipDirection(int stripId, bool flip) {
    if (!initialized || !isValidStripId(stripId)) return;
    
    auto& strip = strips[stripId];
    strip.flipDirection = flip;
    Serial.printf("[MANAGER_NEOPIXELS] Strip %d flip direction set to: %s\n", stripId, flip ? "true" : "false");
}

// Test pattern methods
void Manager_NeoPixels::runTestPattern() {
    if (!initialized) return;
    
    Serial.println("[MANAGER_NEOPIXELS] Running test pattern on all strips...");
    for (size_t i = 0; i < strips.size(); i++) {
        runTestPattern((int)i);
    }
}

void Manager_NeoPixels::runTestPattern(int stripId) {
    if (!initialized || !isValidStripId(stripId)) return;
    
    auto& strip = strips[stripId];
    
    Serial.printf("[MANAGER_NEOPIXELS] Running test pattern on Strip %d...\n", stripId);
    
    // Temporarily disable effect
    bool wasActive = strip.effectActive;
    strip.effectActive = false;
    
    // Quick rainbow sweep
    int totalFrames = 60;
    int frameDelay = 20;
    
    for (int frame = 0; frame < totalFrames; frame++) {
        for (int i = 0; i < strip.numPixels; i++) {
            uint16_t hue = ((i * 65536L / strip.numPixels) + (frame * 1000)) & 0xFFFF;
            uint32_t color = strip.pixels->ColorHSV(hue, 255, 200);
            strip.pixels->setPixelColor(i, color);
        }
        strip.pixels->show();
        delay(frameDelay);
    }
    
    // Clear and restore
    strip.pixels->clear();
    strip.pixels->show();
    strip.effectActive = wasActive;
    
    Serial.printf("[MANAGER_NEOPIXELS] Strip %d test pattern complete\n", stripId);

    // Turn off all pixels after test pattern
    clearAllPixels(stripId);
}

// Utility methods
void Manager_NeoPixels::setAllPixels(uint32_t color) {
    if (!initialized) return;
    
    for (size_t i = 0; i < strips.size(); i++) {
        setAllPixels((int)i, color);
    }
}

void Manager_NeoPixels::setAllPixels(int stripId, uint32_t color) {
    if (!initialized || !isValidStripId(stripId)) return;
    
    auto& strip = strips[stripId];
    for (int i = 0; i < strip.numPixels; i++) {
        strip.pixels->setPixelColor(i, color);
    }
    strip.pixels->show();
    Serial.printf("[MANAGER_NEOPIXELS] Strip %d: Set all %d pixels to 0x%08X\n", 
                  stripId, strip.numPixels, color);
}

void Manager_NeoPixels::clearAllPixels() {
    if (!initialized) return;
    
    for (size_t i = 0; i < strips.size(); i++) {
        clearAllPixels((int)i);
    }
}

void Manager_NeoPixels::clearAllPixels(int stripId) {
    if (!initialized || !isValidStripId(stripId)) return;
    
    auto& strip = strips[stripId];
    strip.pixels->clear();
    strip.pixels->show();
    Serial.printf("[MANAGER_NEOPIXELS] Strip %d: Cleared all %d pixels\n", 
                  stripId, strip.numPixels);
}

// Accessor methods
int Manager_NeoPixels::getPixelCount(int stripId) const {
    if (!initialized || !isValidStripId(stripId)) return 0;
    return strips[stripId].numPixels;
}

int Manager_NeoPixels::getPixelPin(int stripId) const {
    if (!initialized || !isValidStripId(stripId)) return -1;
    return strips[stripId].pin;
}

bool Manager_NeoPixels::isEffectActive(int stripId) const {
    if (!initialized || !isValidStripId(stripId)) return false;
    return strips[stripId].effectActive;
}

EffectType Manager_NeoPixels::getCurrentEffect(int stripId) const {
    if (!initialized || !isValidStripId(stripId)) return EFFECT_SINGLE_PIXEL;
    return strips[stripId].effectType;
}

// Main update method - called from main loop
void Manager_NeoPixels::update() {
    if (!initialized) return;
    
    size_t stripCount = strips.size();
    for (size_t i = 0; i < stripCount; i++) {
        if (i >= strips.size()) break; // Double-check bounds
        
        auto& strip = strips[i];
        
        // Skip invalid strips
        if (!strip.valid || strip.pixels == nullptr) {
            continue;
        }
        
        switch (strip.effectType) {
            case EFFECT_SINGLE_PIXEL:
                updateSinglePixelEffect(strip);
                break;
            case EFFECT_LINEAR_WAVE:
                updateLinearWaveEffect(strip);
                break;
            case EFFECT_DUAL_WAVE:
                updateDualWaveEffect(strip);
                break;
            case EFFECT_SEGMENT_CHASE:
                updateSegmentChaseEffect(strip);
                break;
            case EFFECT_MATRIX_2D:
                updateMatrix2DEffect(strip);
                break;
            case EFFECT_CM5_MATRIX:
                updateCM5Effect(strip);
                break;
        }
    }
}

// Individual effect implementations
void Manager_NeoPixels::updateSinglePixelEffect(NeoPixelStrip& strip) {
    if (!strip.effectActive || !strip.valid || strip.pixels == nullptr) return;
    
    unsigned long currentTime = millis();
    if (currentTime - strip.lastUpdate < updateDelay) return;
    strip.lastUpdate = currentTime;
    
    float timeSec = millis() / 1000.0;
    float pulseFactor = (sin(timeSec * 2.0) + 1.0) / 2.0;
    
    uint8_t red = (uint8_t)((strip.effectColor >> 16) & 0xFF);
    uint8_t green = (uint8_t)((strip.effectColor >> 8) & 0xFF);
    uint8_t blue = (uint8_t)(strip.effectColor & 0xFF);
    
    uint32_t color = strip.pixels->Color(red * pulseFactor, green * pulseFactor, blue * pulseFactor);
    strip.pixels->setPixelColor(0, color);
    strip.pixels->show();
}

void Manager_NeoPixels::updateLinearWaveEffect(NeoPixelStrip& strip) {
    if (!strip.effectActive || !strip.pixels) return;
    
    unsigned long currentTime = millis();
    if (currentTime - strip.lastUpdate < updateDelay) return;
    strip.lastUpdate = currentTime;
    
    strip.pixels->clear();
    float timeSec = millis() / 1000.0;
    float speed = 3.0;
    
    for (int i = 0; i < strip.numPixels; i++) {
        float phase = strip.flipDirection ? -timeSec * speed + i * 0.8 : timeSec * speed + i * 0.8;
        float pulseFactor = (sin(phase) + 1.0) / 2.0;
        
        uint8_t red = (uint8_t)((strip.effectColor >> 16) & 0xFF);
        uint8_t green = (uint8_t)((strip.effectColor >> 8) & 0xFF);
        uint8_t blue = (uint8_t)(strip.effectColor & 0xFF);
        
        uint32_t color = strip.pixels->Color(red * pulseFactor, green * pulseFactor, blue * pulseFactor);
        strip.pixels->setPixelColor(i, color);
    }
    strip.pixels->show();
}

void Manager_NeoPixels::updateDualWaveEffect(NeoPixelStrip& strip) {
    if (!strip.effectActive || !strip.pixels) return;
    
    unsigned long currentTime = millis();
    if (currentTime - strip.lastUpdate < updateDelay) return;
    strip.lastUpdate = currentTime;
    
    strip.pixels->clear();
    float timeSec = millis() / 1000.0;
    float speed = 4.0;
    int midPoint = strip.numPixels / 2;
    
    for (int i = 0; i < strip.numPixels; i++) {
        float distFromCenter = abs(i - midPoint);
        float phase1 = timeSec * speed + distFromCenter * 0.5;
        float phase2 = -timeSec * speed + distFromCenter * 0.5;
        
        float wave1 = (sin(phase1) + 1.0) / 2.0;
        float wave2 = (sin(phase2) + 1.0) / 2.0;
        float pulseFactor = strip.flipDirection ? wave2 : wave1;
        
        uint8_t red = (uint8_t)((strip.effectColor >> 16) & 0xFF);
        uint8_t green = (uint8_t)((strip.effectColor >> 8) & 0xFF);
        uint8_t blue = (uint8_t)(strip.effectColor & 0xFF);
        
        uint32_t color = strip.pixels->Color(red * pulseFactor, green * pulseFactor, blue * pulseFactor);
        strip.pixels->setPixelColor(i, color);
    }
    strip.pixels->show();
}

void Manager_NeoPixels::updateSegmentChaseEffect(NeoPixelStrip& strip) {
    if (!strip.effectActive || !strip.pixels) return;
    
    unsigned long currentTime = millis();
    if (currentTime - strip.lastUpdate < updateDelay) return;
    strip.lastUpdate = currentTime;
    
    strip.pixels->clear();
    float timeSec = millis() / 1000.0;
    float speed = 5.0;
    int segmentSize = strip.numPixels / 4;
    
    for (int seg = 0; seg < 4; seg++) {
        float phase = strip.flipDirection ? -timeSec * speed + seg * 1.5 : timeSec * speed + seg * 1.5;
        float pulseFactor = (sin(phase) + 1.0) / 2.0;
        
        uint8_t red = (uint8_t)((strip.effectColor >> 16) & 0xFF);
        uint8_t green = (uint8_t)((strip.effectColor >> 8) & 0xFF);
        uint8_t blue = (uint8_t)(strip.effectColor & 0xFF);
        
        uint32_t color = strip.pixels->Color(red * pulseFactor, green * pulseFactor, blue * pulseFactor);
        
        for (int i = seg * segmentSize; i < (seg + 1) * segmentSize && i < strip.numPixels; i++) {
            strip.pixels->setPixelColor(i, color);
        }
    }
    strip.pixels->show();
}

void Manager_NeoPixels::updateMatrix2DEffect(NeoPixelStrip& strip) {
    if (!strip.effectActive || !strip.pixels) return;
    
    unsigned long currentTime = millis();
    if (currentTime - strip.lastUpdate < updateDelay) return;
    strip.lastUpdate = currentTime;
    
    strip.pixels->clear();
    float timeSec = millis() / 1000.0;
    float speed = 3.0;
    
    int approxWidth = sqrt(strip.numPixels);
    int approxHeight = strip.numPixels / approxWidth;
    
    for (int i = 0; i < strip.numPixels; i++) {
        int x = i % approxWidth;
        int y = i / approxWidth;
        
        float distance = sqrt(x*x + y*y);
        float phase = strip.flipDirection ? -timeSec * speed + distance * 0.3 : timeSec * speed + distance * 0.3;
        float pulseFactor = (sin(phase) + 1.0) / 2.0;
        
        uint8_t red = (uint8_t)((strip.effectColor >> 16) & 0xFF);
        uint8_t green = (uint8_t)((strip.effectColor >> 8) & 0xFF);
        uint8_t blue = (uint8_t)(strip.effectColor & 0xFF);
        
        uint32_t color = strip.pixels->Color(red * pulseFactor, green * pulseFactor, blue * pulseFactor);
        strip.pixels->setPixelColor(i, color);
    }
    strip.pixels->show();
}

void Manager_NeoPixels::updateCM5Effect(NeoPixelStrip& strip) {
    if (!strip.effectActive || !strip.pixels) return;

    unsigned long currentTime = millis();
    if (currentTime - strip.lastUpdate < updateDelay) return;
    strip.lastUpdate = currentTime;

    strip.pixels->clear();
    float timeSec = millis() / 1000.0;
    float speed = 4.0;

    for (int col = 0; col < PANEL_WIDTH; col++) {
        float pulseFactor;
        if (!strip.flipDirection) {
            if (col < 8) {
                pulseFactor = (sin(timeSec * speed + (7 - col)) + 1.0) / 2.0;
            } else {
                pulseFactor = (sin(-timeSec * speed - (col - 8)) + 1.0) / 2.0;
            }
        } else {
            if (col < 8) {
                pulseFactor = (sin(-timeSec * speed + (7 - col)) + 1.0) / 2.0;
            } else {
                pulseFactor = (sin(timeSec * speed - (col - 8)) + 1.0) / 2.0;
            }
        }

        float brightness = strip.baseBrightness[col] * pulseFactor;
        if (brightness > 1.0) brightness = 1.0;
        if (brightness < 0) brightness = 0;

        uint8_t red = (uint8_t)((strip.effectColor >> 16) & 0xFF);
        uint8_t green = (uint8_t)((strip.effectColor >> 8) & 0xFF);
        uint8_t blue = (uint8_t)(strip.effectColor & 0xFF);

        uint32_t colVal = strip.pixels->Color(red * brightness, green * brightness, blue * brightness);

        for (int row = 1; row < PANEL_HEIGHT - 1; row++) {
            int pixelIndex = mapMatrixIndex(col, row);
            if (pixelIndex >= 0 && pixelIndex < strip.numPixels) {
                strip.pixels->setPixelColor(pixelIndex, colVal);
            }
        }
    }
    strip.pixels->show();
}

int Manager_NeoPixels::mapMatrixIndex(int col, int row) {
    int correctedRow = (PANEL_HEIGHT - 1) - row;
    if (col < 8) {
        return LEFT_PANEL_OFFSET + (correctedRow * 8) + col;
    } else {
        return RIGHT_PANEL_OFFSET + (correctedRow * 8) + (col - 8);
    }
}

// ScreenDestination interface methods
String Manager_NeoPixels::getScreenId() const {
    return "neopixel";
}

bool Manager_NeoPixels::matchesScreenId(const String& screenId, const JsonDocument& doc) const {
    return (screenId == getScreenId());
}

const char* Manager_NeoPixels::getConfigKey() const {
    return "neopixel";
}

void Manager_NeoPixels::applyConfig(const JsonDocument& configDoc) {
    if (configDoc.containsKey("text")) {
        const char* text = configDoc["text"];
        Serial.printf("[MANAGER_NEOPIXELS] Displaying text on NeoPixels: %s\n", text);
    }
}

void Manager_NeoPixels::updateSensorData(const JsonDocument& sensorDoc) {
    if (sensorDoc.containsKey("sensors") && sensorDoc["sensors"].containsKey("neopixel_color")) {
        if (sensorDoc["sensors"]["neopixel_color"].size() > 0) {
            const char* hexStr = sensorDoc["sensors"]["neopixel_color"][0]["Value"].as<const char*>();
            uint32_t color = strtoul(hexStr, nullptr, 16);
            
            Serial.printf("[MANAGER_NEOPIXELS] Received hex: %s, Using color: 0x%06X\n", hexStr, color);
            setEffectColor(color);  // Apply to all strips
        } else {
            Serial.println("[MANAGER_NEOPIXELS] Empty neopixel_color array");
        }
    } else {
        Serial.println("[MANAGER_NEOPIXELS] No valid neopixel_color found in sensor payload.");
    }
}

// Data interface methods
void Manager_NeoPixels::setColorFromHex(const String& hexColor) {
    uint32_t color = strtoul(hexColor.c_str(), nullptr, 16);
    setEffectColor(color);
    Serial.printf("[MANAGER_NEOPIXELS] Color set from hex: %s -> 0x%06X\n", hexColor.c_str(), color);
}

void Manager_NeoPixels::processCommand(const String& command, const String& value) {
    if (command == "color") {
        setColorFromHex(value);
    } else if (command == "active") {
        bool active = value.equalsIgnoreCase("true") || value == "1";
        setEffectActive(active);
    } else if (command == "flip") {
        bool flip = value.equalsIgnoreCase("true") || value == "1";
        setFlipDirection(flip);
    } else {
        Serial.printf("[MANAGER_NEOPIXELS] Unknown command: %s\n", command.c_str());
    }
}