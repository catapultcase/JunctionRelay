#ifndef MANAGER_NEOPIXELS_H
#define MANAGER_NEOPIXELS_H

#include <Adafruit_NeoPixel.h>
#include "ScreenDestination.h"
#include <vector>

enum EffectType {
    EFFECT_SINGLE_PIXEL,     // 1 pixel: breathing/pulsing
    EFFECT_LINEAR_WAVE,      // 2-16 pixels: sine wave across strip
    EFFECT_DUAL_WAVE,        // 17-32 pixels: waves from both ends
    EFFECT_SEGMENT_CHASE,    // 33-64 pixels: segment-based patterns
    EFFECT_MATRIX_2D,        // 65-127 pixels: 2D matrix effects
    EFFECT_CM5_MATRIX        // 128+ pixels: full CM5 matrix (2x64)
};

// FIXED: Simple approach without smart pointers - use raw pointer with manual management
struct NeoPixelStrip {
    Adafruit_NeoPixel* pixels;
    EffectType effectType;
    bool effectActive;
    uint32_t effectColor;
    bool flipDirection;
    unsigned long lastUpdate;
    int pin;        // Store pin separately for debugging
    int numPixels;  // Store count separately for debugging
    bool valid;     // Track if this strip is valid
    
    // CM5-specific data (only used when effectType == EFFECT_CM5_MATRIX)
    float baseBrightness[16];
    
    // FIXED: Constructor that creates the pixel object with raw pointer
    NeoPixelStrip(int pinNum, int pixelCount) 
        : pixels(nullptr),
          effectActive(false), 
          effectColor(0xFF0000), 
          flipDirection(false), 
          lastUpdate(0),
          pin(pinNum),
          numPixels(pixelCount),
          valid(false) {
        
        // Only create valid strips
        if (pinNum > 0 && pixelCount > 0) {
            pixels = new Adafruit_NeoPixel(pixelCount, pinNum, NEO_GRB + NEO_KHZ800);
            valid = true;
            
            // Auto-detect effect type based on pixel count
            if (pixelCount == 1) effectType = EFFECT_SINGLE_PIXEL;
            else if (pixelCount <= 16) effectType = EFFECT_LINEAR_WAVE;
            else if (pixelCount <= 32) effectType = EFFECT_DUAL_WAVE;
            else if (pixelCount <= 64) effectType = EFFECT_SEGMENT_CHASE;
            else if (pixelCount < 128) effectType = EFFECT_MATRIX_2D;
            else effectType = EFFECT_CM5_MATRIX;
        } else {
            effectType = EFFECT_SINGLE_PIXEL;
        }
        
        // Initialize brightness array
        for (int i = 0; i < 16; i++) {
            baseBrightness[i] = 1.0f;
        }
    }
    
    // FIXED: Destructor to clean up memory
    ~NeoPixelStrip() {
        if (pixels != nullptr) {
            delete pixels;
            pixels = nullptr;
        }
    }
    
    // FIXED: Move constructor 
    NeoPixelStrip(NeoPixelStrip&& other) noexcept
        : pixels(other.pixels),
          effectType(other.effectType),
          effectActive(other.effectActive),
          effectColor(other.effectColor),
          flipDirection(other.flipDirection),
          lastUpdate(other.lastUpdate),
          pin(other.pin),
          numPixels(other.numPixels),
          valid(other.valid) {
        
        // Transfer ownership
        other.pixels = nullptr;
        other.valid = false;
        
        // Copy brightness array
        for (int i = 0; i < 16; i++) {
            baseBrightness[i] = other.baseBrightness[i];
        }
    }
    
    // FIXED: Move assignment 
    NeoPixelStrip& operator=(NeoPixelStrip&& other) noexcept {
        if (this != &other) {
            // Clean up existing
            if (pixels != nullptr) {
                delete pixels;
            }
            
            // Transfer from other
            pixels = other.pixels;
            effectType = other.effectType;
            effectActive = other.effectActive;
            effectColor = other.effectColor;
            flipDirection = other.flipDirection;
            lastUpdate = other.lastUpdate;
            pin = other.pin;
            numPixels = other.numPixels;
            valid = other.valid;
            
            // Transfer ownership
            other.pixels = nullptr;
            other.valid = false;
            
            // Copy brightness array
            for (int i = 0; i < 16; i++) {
                baseBrightness[i] = other.baseBrightness[i];
            }
        }
        return *this;
    }
    
    // Delete copy constructor and copy assignment to prevent issues
    NeoPixelStrip(const NeoPixelStrip&) = delete;
    NeoPixelStrip& operator=(const NeoPixelStrip&) = delete;
};

class Manager_NeoPixels : public ScreenDestination {
public:
    // Public static methods to access singleton
    static Manager_NeoPixels* getInstance();
    
    // Strip management
    void addStrip(int stripId, int pin, int numPixels);
    void begin();

    // Generic effect control (applies to all strips)
    void setEffectActive(bool active);
    void setEffectColor(uint32_t color);
    void setFlipDirection(bool flip);
    
    // Individual strip control (for future backend use)
    void setEffectActive(int stripId, bool active);
    void setEffectColor(int stripId, uint32_t color);
    void setFlipDirection(int stripId, bool flip);

    // Test and utility functions
    void runTestPattern();
    void runTestPattern(int stripId);
    void setAllPixels(uint32_t color);
    void setAllPixels(int stripId, uint32_t color);
    void clearAllPixels();
    void clearAllPixels(int stripId);

    // ScreenDestination interface
    String getScreenId() const override;
    void applyConfig(const JsonDocument& configDoc) override;
    void updateSensorData(const JsonDocument& sensorDoc) override;
    bool matchesScreenId(const String& screenId, const JsonDocument& doc) const override;
    const char* getConfigKey() const override;
    void update() override; // Called from main loop

    // Data interface for external systems (alternative to ScreenDestination)
    void setColorFromHex(const String& hexColor);
    void processCommand(const String& command, const String& value);

    // Public accessors for debugging
    int getStripCount() const { return (int)strips.size(); }
    int getPixelCount(int stripId = 0) const;
    int getPixelPin(int stripId = 0) const;
    bool isEffectActive(int stripId = 0) const;
    EffectType getCurrentEffect(int stripId = 0) const;

private:
    // Private constructor
    Manager_NeoPixels();

    static Manager_NeoPixels* instance;
    std::vector<NeoPixelStrip> strips;
    const long updateDelay = 50;
    bool initialized;
    
    // Helper methods
    bool isValidStripId(int stripId) const;
    
    // Individual effect methods
    void updateSinglePixelEffect(NeoPixelStrip& strip);
    void updateLinearWaveEffect(NeoPixelStrip& strip);
    void updateDualWaveEffect(NeoPixelStrip& strip);
    void updateSegmentChaseEffect(NeoPixelStrip& strip);
    void updateMatrix2DEffect(NeoPixelStrip& strip);
    void updateCM5Effect(NeoPixelStrip& strip);
    
    // CM5-specific constants and methods
    static const int PANEL_WIDTH = 16;
    static const int PANEL_HEIGHT = 8;
    static const int LEFT_PANEL_OFFSET = 0;
    static const int RIGHT_PANEL_OFFSET = 64;
    int mapMatrixIndex(int col, int row);
};

#endif  // MANAGER_NEOPIXELS_H