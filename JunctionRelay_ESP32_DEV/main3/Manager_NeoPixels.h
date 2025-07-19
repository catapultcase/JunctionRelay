#ifndef MANAGER_NEOPIXELS_H
#define MANAGER_NEOPIXELS_H

#include <Adafruit_NeoPixel.h>
#include "ScreenDestination.h"  // Include ScreenDestination base class

class Manager_NeoPixels : public ScreenDestination {
public:
    // Public static methods to access singleton
    static Manager_NeoPixels* getInstance(int pin, int numPixels); // First-time setup
    static Manager_NeoPixels* getInstance(); // Subsequent use (must already be initialized)

    void begin(int pin = -1, int numPixels = -1);

    // CM5 Effect Functions
    void updateCM5Effect();
    void setCM5EffectActive(bool active);
    void setCM5Color(uint32_t color);
    void setFlipPulseDirection(bool flip);

    // Test and utility functions
    void runTestPattern();
    void setAllPixels(uint32_t color);
    void clearAllPixels();

    // ScreenDestination interface
    String getScreenId() const override;
    void applyConfig(const JsonDocument& configDoc) override;
    void updateSensorData(const JsonDocument& sensorDoc) override;
    bool matchesScreenId(const String& screenId, const JsonDocument& doc) const override;
    const char* getConfigKey() const override;
    void update() override;

    // Public accessors for debugging
    int getPixelCount() const { return pixels.numPixels(); }
    int getPixelPin() const { return pixels.getPin(); }
    bool isCM5EffectActive() const { return cm5EffectActive; }

private:
    // Private constructor
    Manager_NeoPixels(int pin, int numPixels);

    static Manager_NeoPixels* instance;

    Adafruit_NeoPixel pixels;
    bool cm5EffectActive = false;
    uint32_t cm5Color = 0xFF0000;
    unsigned long lastCM5Update = 0;
    const long cm5UpdateDelay = 50;
    float baseBrightness[16];

    bool flipPulseDirection = false;
    static const int PANEL_WIDTH = 16;
    static const int PANEL_HEIGHT = 8;
    static const int LEFT_PANEL_OFFSET = 0;
    static const int RIGHT_PANEL_OFFSET = 64;

    int mapMatrixIndex(int col, int row);
};

#endif  // MANAGER_NEOPIXELS_H