#include "Helper_DebugScreen.h"

Helper_DebugScreen::Helper_DebugScreen() {}

void Helper_DebugScreen::begin() {
    Serial.println("[DebugScreen] Starting I2C...");
    Wire.begin();

    Serial.println("[DebugScreen] Attempting to initialize OLED...");

    if (narrowOLED.begin()) {
        oledType = OLEDType::Narrow;
        Serial.println("[DebugScreen] ✅ Narrow OLED detected and initialized");
    } else if (tallOLED.begin()) {
        oledType = OLEDType::Tall;
        Serial.println("[DebugScreen] ✅ Tall OLED detected and initialized");
    } else {
        oledType = OLEDType::None;
        Serial.println("[DebugScreen] ❌ No OLED detected");
    }

    updateDisplay(0, 0, 0, 0);
}

void Helper_DebugScreen::loop() {
    // No-op for now
}

void Helper_DebugScreen::handleParsedPayload(const JsonDocument& doc, size_t rawSize, uint8_t typeField, uint8_t routeField) {
    totalPayloads++;
    unsigned long now = millis();
    if (totalPayloads > 1) {
        payloadInterval = now - lastPayloadTime;
    }
    lastPayloadTime = now;

    updateDisplay(totalPayloads, typeField, rawSize, payloadInterval);
}

void Helper_DebugScreen::updateDisplay(unsigned long count, uint8_t typeCode, int bytes, unsigned long interval) {
    if (oledType == OLEDType::None) return;

    if (oledType == OLEDType::Tall) {
        tallOLED.erase();
        tallOLED.setCursor(0, 0);
        tallOLED.setFont(0);
        tallOLED.print("Payloads: "); tallOLED.print(count);
        tallOLED.setCursor(0, 8);
        tallOLED.print("Type: ");
        switch (typeCode) {
            case 1: tallOLED.print("JSON"); break;
            case 2: tallOLED.print("JSON+PFX"); break;
            case 3: tallOLED.print("GZIP"); break;
            case 4: tallOLED.print("GZIP+PFX"); break;
            default: tallOLED.print("UNKNOWN"); break;
        }
        tallOLED.setCursor(0, 16);
        tallOLED.print("Size: "); tallOLED.print(bytes); tallOLED.print(" b");
        tallOLED.setCursor(0, 24);
        tallOLED.print("Rate: ");
        if (interval > 0) {
            if (interval < 1000) {
                tallOLED.print(interval); tallOLED.print("ms");
            } else {
                tallOLED.print(interval / 1000.0, 1); tallOLED.print("s");
            }
        } else {
            tallOLED.print("---");
        }
        tallOLED.display();
    } else {
        narrowOLED.erase();
        narrowOLED.setCursor(0, 0);
        narrowOLED.setFont(0);
        narrowOLED.print("Payloads: "); narrowOLED.print(count);
        narrowOLED.setCursor(0, 8);
        narrowOLED.print("Type: ");
        switch (typeCode) {
            case 1: narrowOLED.print("JSON"); break;
            case 2: narrowOLED.print("JSON+PFX"); break;
            case 3: narrowOLED.print("GZIP"); break;
            case 4: narrowOLED.print("GZIP+PFX"); break;
            default: narrowOLED.print("UNKNOWN"); break;
        }
        narrowOLED.setCursor(0, 16);
        narrowOLED.print("Size: "); narrowOLED.print(bytes); narrowOLED.print(" b");
        narrowOLED.setCursor(0, 24);
        narrowOLED.print("Rate: ");
        if (interval > 0) {
            if (interval < 1000) {
                narrowOLED.print(interval); narrowOLED.print("ms");
            } else {
                narrowOLED.print(interval / 1000.0, 1); narrowOLED.print("s");
            }
        } else {
            narrowOLED.print("---");
        }
        narrowOLED.display();
    }
}