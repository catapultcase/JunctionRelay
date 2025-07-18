#ifndef HELPER_DEBUG_SCREEN_H
#define HELPER_DEBUG_SCREEN_H

#include <Arduino.h>
#include <Wire.h>
#include <SparkFun_Qwiic_OLED.h>
#include <ArduinoJson.h>

class Helper_DebugScreen {
public:
    Helper_DebugScreen();
    void begin();
    void loop();
    void handleParsedPayload(const JsonDocument& doc, size_t rawSize, uint8_t typeField, uint8_t routeField);

private:
    enum class OLEDType {
        None,
        Narrow,
        Tall
    };

    OLEDType oledType = OLEDType::None;
    QwiicNarrowOLED narrowOLED;
    Qwiic1in3OLED tallOLED;

    unsigned long totalPayloads = 0;
    unsigned long lastPayloadTime = 0;
    unsigned long payloadInterval = 0;

    void updateDisplay(unsigned long count, uint8_t typeCode, int bytes, unsigned long interval);
};

#endif // HELPER_DEBUG_SCREEN_H
