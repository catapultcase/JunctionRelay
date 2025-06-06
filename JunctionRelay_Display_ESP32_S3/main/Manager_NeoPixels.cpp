#include "Manager_NeoPixels.h"
#include <math.h>  // For sin()

// Initialize static instance pointer to nullptr
Manager_NeoPixels* Manager_NeoPixels::instance = nullptr;

// Private constructor for singleton pattern
Manager_NeoPixels::Manager_NeoPixels(int pin, int numPixels) 
    : pixels(numPixels, pin, NEO_GRB + NEO_KHZ800) {
    // Nothing else to initialize
}

// Static method to get the singleton instance
Manager_NeoPixels* Manager_NeoPixels::getInstance(int pin, int numPixels) {
    if (instance == nullptr) {
        instance = new Manager_NeoPixels(pin, numPixels);
    }
    return instance;
}

// Reuse-only access: must be called after init
Manager_NeoPixels* Manager_NeoPixels::getInstance() {
    if (!instance) {
        Serial.println("[ERROR] Manager_NeoPixels::getInstance() called before initialization.");
    }
    return instance;
}

void Manager_NeoPixels::begin(int pin, int numPixels) {
    // Update pixels if pin or numPixels has changed and parameters were provided
    if ((pin != -1 && pin != pixels.getPin()) || 
        (numPixels != -1 && numPixels != pixels.numPixels())) {
        if (pin == -1) pin = pixels.getPin();
        if (numPixels == -1) numPixels = pixels.numPixels();
        pixels = Adafruit_NeoPixel(numPixels, pin, NEO_GRB + NEO_KHZ800);
    }
    
    #if defined(NEOPIXEL_POWER)
    pinMode(NEOPIXEL_POWER, OUTPUT);
    digitalWrite(NEOPIXEL_POWER, HIGH);
    #endif

    pixels.begin();
    pixels.setBrightness(20);
    pixels.clear();
    pixels.show();
    Serial.println("[MANAGER_NEOPIXELS] Initialized External NeoPixels");

    // Precompute base brightness for each of the 16 columns.
    for (int col = 0; col < PANEL_WIDTH; col++) {
        if (col < 8) {
            baseBrightness[col] = 0.3 + 0.7 * ((float)col / 7.0);
        } else {
            baseBrightness[col] = 1.0 - 0.7 * ((float)(col - 8) / 7.0);
        }
    }
    
    // Run a brief test pattern to verify functionality (keep this from working version)
    runTestPattern();
}

// Test and utility functions (keep from working version)
void Manager_NeoPixels::runTestPattern() {
    Serial.println("[MANAGER_NEOPIXELS] Running test pattern...");
    
    // Temporarily disable CM5 effect
    bool wasActive = cm5EffectActive;
    setCM5EffectActive(false);
    
    // Set first 5 pixels to red, next 5 to green, next 5 to blue
    for(int i = 0; i < 5 && i < pixels.numPixels(); i++) {
        pixels.setPixelColor(i, pixels.Color(255, 0, 0)); // Red
    }
    for(int i = 5; i < 10 && i < pixels.numPixels(); i++) {
        pixels.setPixelColor(i, pixels.Color(0, 255, 0)); // Green
    }
    for(int i = 10; i < 15 && i < pixels.numPixels(); i++) {
        pixels.setPixelColor(i, pixels.Color(0, 0, 255)); // Blue
    }
    
    pixels.show();
    delay(1000); // Show for 1 second
    
    // Clear all pixels
    pixels.clear();
    pixels.show();
    delay(500);
    
    // Restore CM5 effect if it was active
    if (wasActive) {
        setCM5EffectActive(true);
    }
    
    Serial.println("[MANAGER_NEOPIXELS] Test pattern complete");
}

void Manager_NeoPixels::setAllPixels(uint32_t color) {
    for(int i = 0; i < pixels.numPixels(); i++) {
        pixels.setPixelColor(i, color);
    }
    pixels.show();
    Serial.printf("[MANAGER_NEOPIXELS] Set all %d pixels to color 0x%08X\n", pixels.numPixels(), color);
}

void Manager_NeoPixels::clearAllPixels() {
    pixels.clear();
    pixels.show();
    Serial.printf("[MANAGER_NEOPIXELS] Cleared all %d pixels\n", pixels.numPixels());
}

// --- CM5 Effect Control ---
void Manager_NeoPixels::setCM5EffectActive(bool active) {
    cm5EffectActive = active;
    if (!active) {
        pixels.clear();
        pixels.show();
        Serial.println("[MANAGER_NEOPIXELS] CM5 Effect Disabled.");
    } else {
        Serial.println("[MANAGER_NEOPIXELS] CM5 Effect Enabled.");
    }
}

// --- Generalized CM5 Color Setter ---
void Manager_NeoPixels::setCM5Color(uint32_t color) {
    cm5Color = color;  // Set the CM5 color to the provided color value
    Serial.printf("[MANAGER_NEOPIXELS] CM5 Effect Color Set: 0x%08X\n", color);
}

void Manager_NeoPixels::setFlipPulseDirection(bool flip) {
    flipPulseDirection = flip;
    Serial.print("[MANAGER_NEOPIXELS] Flip Pulse Direction set to: ");
    Serial.println(flipPulseDirection ? "true" : "false");
}

// --- Mapping function: converts (col, row) into NeoPixel index ---
int Manager_NeoPixels::mapMatrixIndex(int col, int row) {
    int correctedRow = (PANEL_HEIGHT - 1) - row; // Reverse row order
    if (col < 8) {
        return LEFT_PANEL_OFFSET + (correctedRow * 8) + col;
    } else {
        return RIGHT_PANEL_OFFSET + (correctedRow * 8) + (col - 8);
    }
}

// --- CM5 Effect Update Function ---
void Manager_NeoPixels::updateCM5Effect() {
    if (!cm5EffectActive) return;

    unsigned long currentTime = millis();
    if (currentTime - lastCM5Update < cm5UpdateDelay) return;
    lastCM5Update = currentTime;

    pixels.clear();
    float timeSec = millis() / 1000.0;
    float speed = 4.0;

    for (int col = 0; col < PANEL_WIDTH; col++) {
        float pulseFactor;
        if (!flipPulseDirection) {
            // Default pulse direction:
            if (col < 8) {
                pulseFactor = (sin(timeSec * speed + (7 - col)) + 1.0) / 2.0;
            } else {
                pulseFactor = (sin(-timeSec * speed - (col - 8)) + 1.0) / 2.0;
            }
        } else {
            // Flipped pulse direction:
            if (col < 8) {
                pulseFactor = (sin(-timeSec * speed + (7 - col)) + 1.0) / 2.0;
            } else {
                pulseFactor = (sin(timeSec * speed - (col - 8)) + 1.0) / 2.0;
            }
        }

        float brightness = baseBrightness[col] * pulseFactor;
        if (brightness > 1.0) brightness = 1.0;
        if (brightness < 0) brightness = 0;

        // Break the cm5Color down into RGB components
        uint8_t red = (uint8_t)((cm5Color >> 16) & 0xFF);  // Red channel
        uint8_t green = (uint8_t)((cm5Color >> 8) & 0xFF); // Green channel
        uint8_t blue = (uint8_t)(cm5Color & 0xFF);         // Blue channel

        // Apply brightness scaling to the entire color, maintaining the hue
        uint32_t colVal = pixels.Color(
            red * brightness, 
            green * brightness, 
            blue * brightness
        );

        // Apply color to LEDs, skipping the top and bottom rows:
        for (int row = 1; row < PANEL_HEIGHT - 1; row++) {
            int pixelIndex = mapMatrixIndex(col, row);
            if (pixelIndex >= 0 && pixelIndex < pixels.numPixels()) {
                pixels.setPixelColor(pixelIndex, colVal);
            }
        }
    }

    pixels.show();
}

// --- Implement ScreenDestination Methods ---

String Manager_NeoPixels::getScreenId() const {
    return "neopixel";
}

bool Manager_NeoPixels::matchesScreenId(const String& screenId, const JsonDocument& doc) const {
    bool match = (screenId == getScreenId());
    return match;
}

const char* Manager_NeoPixels::getConfigKey() const {
    return "neopixel";
}

void Manager_NeoPixels::applyConfig(const JsonDocument& configDoc) {
    // Example: If a 'text' key exists, display it on the NeoPixel display
    if (configDoc.containsKey("text")) {
        const char* text = configDoc["text"];
        // You can implement logic to map the text to NeoPixel behavior
        Serial.printf("[MANAGER_NEOPIXELS] Displaying text on NeoPixel: %s\n", text);
    }
}

void Manager_NeoPixels::updateSensorData(const JsonDocument& sensorDoc) {
    // Handle new format: "neopixel_color": [{"Value": "DE86B6", "Unit": "RGB"}]
    if (sensorDoc.containsKey("sensors") && sensorDoc["sensors"].containsKey("neopixel_color")) {
        if (sensorDoc["sensors"]["neopixel_color"].size() > 0) {
            const char* hexStr = sensorDoc["sensors"]["neopixel_color"][0]["Value"].as<const char*>();
            uint32_t color = strtoul(hexStr, nullptr, 16); // Parse as hex (no conversion!)
            
            Serial.printf("[MANAGER_NEOPIXELS] Received hex: %s, Using color: 0x%06X\n", hexStr, color);
            setCM5Color(color);  // Set the CM5 effect color
        } else {
            Serial.println("[MANAGER_NEOPIXELS] Empty neopixel_color array");
        }
    } else {
        Serial.println("[MANAGER_NEOPIXELS] No valid neopixel_color found in sensor payload.");
    }
}

void Manager_NeoPixels::update() {
    // Call the CM5 effect update if it's active
    updateCM5Effect();
}