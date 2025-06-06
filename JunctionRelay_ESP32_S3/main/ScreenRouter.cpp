#include "ScreenRouter.h"

void ScreenRouter::registerScreen(ScreenDestination* screen) {
    destinations.push_back(screen);
    Serial.printf("[SCREEN_ROUTER] ✅ Registered screen destination: %s\n", screen->getScreenId().c_str());

    // Debug: Print the current state of the destinations map
    Serial.println("[ScreenRouter] Current screen destinations:");
    for (auto* dest : destinations) {
        Serial.printf("  - %s\n", dest->getScreenId().c_str());
    }
}

void ScreenRouter::routeConfig(const JsonDocument& doc) {
    const char* screenId = doc["screenId"];
    if (!screenId) {
        Serial.println("[SCREEN_ROUTER] ⚠️  Payload missing 'screenId'. Skipping config routing.");
        return;
    }

    Serial.printf("[SCREEN_ROUTER] 🔍 Routing config for screenId: '%s'\n", screenId);

    // Debug: Print the current state of the destinations map before routing
    Serial.println("[SCREEN_ROUTER] Current screen destinations:");
    for (auto* dest : destinations) {
        Serial.printf("  - %s\n", dest->getScreenId().c_str());
    }

    bool matched = false;

    for (auto* dest : destinations) {
        Serial.printf("[SCREEN_ROUTER] → Checking destination: %s\n", dest->getScreenId().c_str());

        // Debug: Check if the screenId matches and if matchesScreenId() works correctly
        Serial.printf("[SCREEN_ROUTER] → Does '%s' match '%s'? %s\n", screenId, dest->getScreenId().c_str(), dest->matchesScreenId(screenId, doc) ? "Yes" : "No");

        if (dest->matchesScreenId(screenId, doc)) {
            const char* configKey = dest->getConfigKey();
            Serial.printf("[SCREEN_ROUTER] ✅ Match found! Using config key: '%s'\n", configKey);

            JsonVariantConst nested = doc.containsKey(configKey)
                ? doc[configKey]
                : doc.as<JsonVariantConst>();

            dest->applyConfig(nested);
            Serial.println("[SCREEN_ROUTER] 📦 Config applied.");
            matched = true;
            break;
        }
    }

    if (!matched) {
        Serial.printf("[SCREEN_ROUTER] ❌ No matching screen found for screenId: '%s'\n", screenId);
    }
}

void ScreenRouter::update() {
    for (auto* dest : destinations) {
        dest->update();  // calls each screen’s update() method
    }
}

void ScreenRouter::routeSensor(const JsonDocument& doc) {
    const char* screenId = doc["screenId"];
    if (!screenId) return;

    // Debug: Print the current state of the destinations map before routing
    // Serial.println("[ScreenRouter] Current screen destinations:");
    // for (auto* dest : destinations) {
    //    Serial.printf("  - %s\n", dest->getScreenId().c_str());
    // }

    for (auto* dest : destinations) {
        if (dest->matchesScreenId(screenId, doc)) {
            dest->updateSensorData(doc);
            break;
        }
    }
}
