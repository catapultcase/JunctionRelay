#ifndef MANAGER_CHARLIEPLEX_H
#define MANAGER_CHARLIEPLEX_H

#include "Adafruit_IS31FL3731.h"
#include "Interface_ScreenDestination.h"
#include <ArduinoJson.h>
#include <Wire.h>
#include <vector>
#include <map>
#include <functional>
#include "Helper_Utils.h"

class Manager_Charlieplex : public ScreenDestination {
public:
    // Static method to get the singleton instance
    static Manager_Charlieplex* getInstance(TwoWire* wireInterface = &Wire);
    
    // Static cleanup method
    static void cleanup();
    
    void begin(); // Initialize displays but don't start task
    void startUpdateTask(); // Start the background task (called by StartupScheduler)
    void stop(); // Stop the update task
    void addDisplay(uint8_t i2cAddress);
    void showReadyScreen();

    void clearDisplay(uint8_t address = 0);  // 0 = all displays
    void setBrightness(uint8_t brightness, uint8_t address = 0);  // 0 = all displays
    void displayTextOnScreen(uint8_t address, const char* text);

    void setScrollingText(const char* text, uint8_t address = 0);  // 0 = all displays
    void setScrollingActive(bool active, uint8_t address = 0);  // 0 = all displays
    void setStaticText(const char* text, uint8_t address = 0);  // 0 = all displays

    // Get list of all detected display addresses
    std::vector<uint8_t> getDisplayAddresses() const;
    bool hasDisplay(uint8_t address) const;

    // Get display for blit rendering (used by Display_Manager_Blit_Charlieplex)
    Adafruit_IS31FL3731* getDisplay(uint8_t address);

    // Enable/disable blit mode (pauses scrolling text when active)
    void setBlitMode(bool active);

    // ScreenDestination interface
    String getScreenId() const override;
    void applyConfig(const JsonDocument& configDoc) override;
    void updateSensorData(const JsonDocument& sensorDoc) override;
    bool matchesScreenId(const String& screenId, const JsonDocument& doc) const override;
    const char* getConfigKey() const override;
    void update() override;  // Now just a stub - real updates handled by task

private:
    // Private constructor for singleton pattern
    explicit Manager_Charlieplex(TwoWire* wireInterface);
    
    // Static instance pointer
    static Manager_Charlieplex* instance;
    
    struct DisplayInfo {
        Adafruit_IS31FL3731 display;
        bool initialized;
        uint8_t width;
        uint8_t height;
        uint8_t brightness;
        uint8_t currentBrightness;  // Track current brightness to avoid unnecessary updates
        bool scrollingActive;
        String scrollText;
        int scrollIndex;
        unsigned long lastScrollUpdate;
        String staticText;
        uint8_t currentFrame;  // For double buffering between frames 0 and 1
        
        DisplayInfo() : initialized(false), width(16), height(9), brightness(90), currentBrightness(255),
                       scrollingActive(false), scrollIndex(0), lastScrollUpdate(0), currentFrame(0) {}
    };
    
    std::map<uint8_t, DisplayInfo> displays;  // address -> display info
    TwoWire* wireInterface;
    const unsigned long scrollDelay = 350;  // Increased to reduce flicker
    
    // Task management
    TaskHandle_t charliplexTaskHandle;
    bool taskRunning;
    bool blitModeActive;  // When true, pause scrolling text updates
    bool taskStarted;
    static void charliplexTaskFunction(void* parameter);
    void internalUpdate(); // The actual update logic, called by task
    
    // Scrolling methods (now called by task)
    void updateScrollingText();
    void updateScrollingText(uint8_t address);
    
    // Helper methods for address handling
    void executeOnDisplay(uint8_t address, std::function<void(uint8_t)> func);
    void executeOnAllDisplays(std::function<void(uint8_t)> func);
};

#endif // MANAGER_CHARLIEPLEX_H