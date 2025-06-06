#ifndef MANAGER_QUADDISPLAY_H
#define MANAGER_QUADDISPLAY_H

#include "Adafruit_LEDBackpack.h"
#include "ScreenDestination.h"
#include <ArduinoJson.h>
#include <queue>

class Manager_QuadDisplay : public ScreenDestination {
public:
    // Static method to get the singleton instance
    static Manager_QuadDisplay* getInstance(uint8_t i2cAddress = 0x70);
    
    void begin();
    void showReadyScreen();

    void clearDisplay();
    void setBrightness(uint8_t brightness);
    void printText(const char *text);
    void printNumber(int number);

    void setScrollingText(const char* text);
    void setScrollingActive(bool active);
    void updateScrollingText();
    void setStaticText(const char* text);

    // ScreenDestination interface
    String getScreenId() const override;
    void applyConfig(const JsonDocument& configDoc) override;
    void updateSensorData(const JsonDocument& sensorDoc) override;
    bool matchesScreenId(const String& screenId, const JsonDocument& doc) const override;
    const char* getConfigKey() const override;
    void update() override;

private:
    // Private constructor for singleton pattern
    explicit Manager_QuadDisplay(uint8_t i2cAddress);
    
    // Static instance pointer
    static Manager_QuadDisplay* instance;
    
    Adafruit_AlphaNum4 display;
    uint8_t i2cAddr;
    bool initialized;

    bool scrollingActive = false;
    String scrollText;
    int scrollIndex = 0;
    unsigned long lastScrollUpdate = 0;
    const unsigned long scrollDelay = 250;

    String staticText;

    std::queue<String> frameQueue;
    const size_t maxQueueSize = 10;

    void processNextFrame();
    void queueTextFrame(const String& text);
};

#endif // MANAGER_QUADDISPLAY_H