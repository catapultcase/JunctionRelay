#ifndef MANAGER_QUADDISPLAY_H
#define MANAGER_QUADDISPLAY_H

#include "Adafruit_LEDBackpack.h"
#include "ScreenDestination.h"
#include <ArduinoJson.h>
#include <Wire.h>
#include <vector>
#include <map>
#include <functional>

class Manager_QuadDisplay : public ScreenDestination {
public:
    // Static method to get the singleton instance
    static Manager_QuadDisplay* getInstance(TwoWire* wireInterface = &Wire);
    
    // Static cleanup method
    static void cleanup();
    
    void begin();
    void addDisplay(uint8_t i2cAddress);
    void showReadyScreen();

    void clearDisplay(uint8_t address = 0);  // 0 = all displays
    void setBrightness(uint8_t brightness, uint8_t address = 0);  // 0 = all displays
    void printText(const char *text, uint8_t address = 0);  // 0 = all displays
    void printNumber(int number, uint8_t address = 0);  // 0 = all displays

    void setScrollingText(const char* text, uint8_t address = 0);  // 0 = all displays
    void setScrollingActive(bool active, uint8_t address = 0);  // 0 = all displays
    void updateScrollingText();
    void setStaticText(const char* text, uint8_t address = 0);  // 0 = all displays

    // Get list of all detected display addresses
    std::vector<uint8_t> getDisplayAddresses() const;
    bool hasDisplay(uint8_t address) const;

    // ScreenDestination interface
    String getScreenId() const override;
    void applyConfig(const JsonDocument& configDoc) override;
    void updateSensorData(const JsonDocument& sensorDoc) override;
    bool matchesScreenId(const String& screenId, const JsonDocument& doc) const override;
    const char* getConfigKey() const override;
    void update() override;  // For scrolling text updates only

private:
    // Private constructor for singleton pattern
    explicit Manager_QuadDisplay(TwoWire* wireInterface);
    
    // Static instance pointer
    static Manager_QuadDisplay* instance;
    
    struct DisplayInfo {
        Adafruit_AlphaNum4 display;
        bool initialized;
        bool scrollingActive;
        String scrollText;
        int scrollIndex;
        unsigned long lastScrollUpdate;
        String staticText;
        
        DisplayInfo() : initialized(false), scrollingActive(false), 
                       scrollIndex(0), lastScrollUpdate(0) {}
    };
    
    std::map<uint8_t, DisplayInfo> displays;  // address -> display info
    TwoWire* wireInterface;
    const unsigned long scrollDelay = 250;

    void updateScrollingText(uint8_t address);
    
    // Helper methods for address handling
    void executeOnDisplay(uint8_t address, std::function<void(uint8_t)> func);
    void executeOnAllDisplays(std::function<void(uint8_t)> func);
};

#endif // MANAGER_QUADDISPLAY_H