#ifndef LAYOUT_ASTRO_SCREEN_H
#define LAYOUT_ASTRO_SCREEN_H

#include <lvgl.h>
#include <ArduinoJson.h>
#include <Arduino.h>
#include <map>
#include <vector>
#include "LayoutInterface.h"

// Forward declarations
class DisplayManager;

// Structure to hold star data (simplified)
struct Star {
    int x;
    int y;
    uint8_t brightness;       // 0-255
    uint8_t maxBrightness;    // The brightest this star gets
    uint8_t prevBrightness;   // Previous frame brightness for change detection
    int8_t twinkleDirection;  // 1 = getting brighter, -1 = getting dimmer
    uint8_t twinkleSpeed;     // Varies per star for more natural effect
    uint16_t minBrightness;   // Allow stars to get very dim
    bool needsRedraw;         // Flag to indicate if this star changed
};

// Forward declaration for the timer callback
static void starfield_update_cb(lv_timer_t* timer);

class Layout_AstroScreen : public LayoutInterface {
public:
    // Starfield class for background - made public so callback can access it
    class StarfieldBackground {
    private:
        std::vector<Star> stars;
        uint32_t lastUpdateTime = 0;
        uint32_t creationTime = 0;
        
        lv_obj_t* canvas = nullptr;
        uint8_t* canvasBuffer = nullptr;
        int canvasWidth = 0;
        int canvasHeight = 0;
        
        // Calculate optimal star count based on screen size
        int calculateStarCount(int width, int height);
        
    public:
        StarfieldBackground(lv_obj_t* parent, int width, int height);
        ~StarfieldBackground();
        
        void createStars(int count);
        void updateStars();
        void render();
        void update();
    };

    explicit Layout_AstroScreen(DisplayManager* displayManager);
    ~Layout_AstroScreen() override;

    void create(const JsonDocument &configDoc) override;
    void destroy() override;
    void update(const JsonDocument &sensorDoc) override;

    lv_obj_t* getScreen() const override;
    void destroyTimers() override;
    void registerSensors(const JsonDocument &configDoc) override;

    bool isCreated()   const override { return mIsCreated; }
    bool isDestroyed() const override { return !mIsCreated; }

    // Friend declaration for the static callback function
    friend void starfield_update_cb(lv_timer_t* timer);

private:
    // Helper methods
    int estimateTextWidth(const char* text, const lv_font_t* font);
    void addSciFiDecorations(lv_obj_t* container, uint32_t borderColor, uint8_t borderThickness, 
                           bool roundedCorners, uint16_t screenWidth, uint16_t screenHeight);
    void updateSensorDisplay(const char* sensorTag, float value);

    DisplayManager* mDisplayManager;
    bool mIsCreated;
    lv_obj_t* mScreen;
    lv_obj_t* mConsoleFrame;
    lv_obj_t* mTerminalArea;
    lv_obj_t** mLabelNames;
    lv_obj_t** mLabelValues;
    std::map<String, int> mSensorTagToIndex;
    std::vector<lv_timer_t*> mTimers;
    int mSensorCount;
    
    // Starfield background instance
    StarfieldBackground* mBackground;
    static const int MAX_SENSORS = 8;
    
    // Animation tracking
    uint32_t mLastAnimationUpdate;
    uint32_t mAnimationFrameCount;
    bool mAnimationRunning;
};

#endif // LAYOUT_ASTRO_SCREEN_H