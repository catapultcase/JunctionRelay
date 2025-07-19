#include "Manager_QuadDisplay.h"
#include "Utils.h"
#include <Wire.h>
#include <vector>

// Initialize static instance pointer to nullptr
Manager_QuadDisplay* Manager_QuadDisplay::instance = nullptr;

// Static method to get the singleton instance
Manager_QuadDisplay* Manager_QuadDisplay::getInstance(TwoWire* wireInterface) {
    if (instance == nullptr) {
        instance = new Manager_QuadDisplay(wireInterface);
        Serial.printf("[DEBUG][QuadDisplay] Created singleton instance with interface: %s\n", 
                     (wireInterface == &Wire1) ? "Wire1" : "Wire");
    }
    return instance;
}

// Static cleanup method
void Manager_QuadDisplay::cleanup() {
    if (instance != nullptr) {
        Serial.printf("[DEBUG][QuadDisplay] Cleaning up singleton with %d displays\n", instance->displays.size());
        delete instance;
        instance = nullptr;
    }
}

// Private constructor for singleton pattern
Manager_QuadDisplay::Manager_QuadDisplay(TwoWire* wireInterface)
    : wireInterface(wireInterface) {
    Serial.println("[DEBUG][QuadDisplay] Singleton constructor called");
}

void Manager_QuadDisplay::begin() {
    Serial.printf("[DEBUG][QuadDisplay] Beginning initialization for %d displays\n", displays.size());
    
    for (auto& pair : displays) {
        uint8_t address = pair.first;
        DisplayInfo& info = pair.second;
        
        if (info.initialized) {
            Serial.printf("[DEBUG][QuadDisplay] Display 0x%02X already initialized\n", address);
            continue;
        }
        
        Serial.printf("[DEBUG][QuadDisplay] Initializing display at 0x%02X\n", address);
        
        // Test I2C communication
        wireInterface->beginTransmission(address);
        int error = wireInterface->endTransmission();
        
        if (error != 0) {
            Serial.printf("[ERROR][QuadDisplay] I2C communication failed for 0x%02X (error: %d)\n", address, error);
            continue;
        }
        
        // Initialize the display
        bool beginResult = info.display.begin(address, wireInterface);
        if (!beginResult) {
            Serial.printf("[ERROR][QuadDisplay] Display initialization failed for 0x%02X\n", address);
            continue;
        }
        
        info.display.clear();
        info.display.setBrightness(15);
        info.display.writeDisplay();
        info.initialized = true;
        
        Serial.printf("[DEBUG][QuadDisplay] Successfully initialized display at 0x%02X\n", address);
    }
    
    showReadyScreen();
}

void Manager_QuadDisplay::addDisplay(uint8_t i2cAddress) {
    if (displays.find(i2cAddress) == displays.end()) {
        displays[i2cAddress] = DisplayInfo();
        Serial.printf("[DEBUG][QuadDisplay] Added display at address 0x%02X\n", i2cAddress);
    } else {
        Serial.printf("[DEBUG][QuadDisplay] Display 0x%02X already exists\n", i2cAddress);
    }
}

void Manager_QuadDisplay::showReadyScreen() {
    // Get the full firmware version string
    const char* fullVersion = getFirmwareVersion();
    
    // Create a scrolling string with "JR" followed by the version number
    String scrollingContent = "JR ";
    
    // If version starts with "JunctionRelay", extract just the version part
    if (strncmp(fullVersion, "JunctionRelay", 13) == 0) {
        const char* versionPart = fullVersion + 13;
        while (*versionPart == ' ' && *versionPart != '\0') {
            versionPart++;
        }
        scrollingContent += versionPart;
    } else {
        scrollingContent += fullVersion;
    }
    
    // If multiple displays, add address to distinguish them
    if (displays.size() > 1) {
        for (auto& pair : displays) {
            uint8_t address = pair.first;
            String addressContent = scrollingContent + " 0x" + String(address, HEX) + "   ";
            setScrollingText(addressContent.c_str(), address);
        }
    } else {
        scrollingContent += "   ";
        setScrollingText(scrollingContent.c_str(), 0);  // Apply to all (single display)
    }
}

std::vector<uint8_t> Manager_QuadDisplay::getDisplayAddresses() const {
    std::vector<uint8_t> addresses;
    for (const auto& pair : displays) {
        addresses.push_back(pair.first);
    }
    return addresses;
}

bool Manager_QuadDisplay::hasDisplay(uint8_t address) const {
    return displays.find(address) != displays.end();
}

void Manager_QuadDisplay::executeOnDisplay(uint8_t address, std::function<void(uint8_t)> func) {
    if (address == 0) {
        // Execute on all displays
        executeOnAllDisplays(func);
    } else {
        // Execute on specific display
        auto it = displays.find(address);
        if (it != displays.end() && it->second.initialized) {
            func(address);
        }
    }
}

void Manager_QuadDisplay::executeOnAllDisplays(std::function<void(uint8_t)> func) {
    for (auto& pair : displays) {
        if (pair.second.initialized) {
            func(pair.first);
        }
    }
}

void Manager_QuadDisplay::clearDisplay(uint8_t address) {
    executeOnDisplay(address, [this](uint8_t addr) {
        auto& info = displays[addr];
        info.display.clear();
        info.display.writeDisplay();
    });
}

void Manager_QuadDisplay::setBrightness(uint8_t brightness, uint8_t address) {
    executeOnDisplay(address, [this, brightness](uint8_t addr) {
        auto& info = displays[addr];
        info.display.setBrightness(brightness);
        info.display.writeDisplay();
    });
}

void Manager_QuadDisplay::printText(const char *text, uint8_t address) {
    executeOnDisplay(address, [this, text](uint8_t addr) {
        auto& info = displays[addr];
        info.display.clear();
        for (uint8_t i = 0; i < 4; i++) {
            char c = text[i];
            if (c == '\0') break;
            info.display.writeDigitAscii(i, c);
        }
        info.display.writeDisplay();
    });
}

void Manager_QuadDisplay::printNumber(int number, uint8_t address) {
    char buf[5];
    snprintf(buf, sizeof(buf), "%4d", number);
    printText(buf, address);
}

void Manager_QuadDisplay::setScrollingText(const char* text, uint8_t address) {
    executeOnDisplay(address, [this, text](uint8_t addr) {
        auto& info = displays[addr];
        info.scrollText = String(text);
        info.scrollIndex = 0;
        info.scrollingActive = true;
        Serial.printf("[DEBUG][QuadDisplay] Set scrolling text for 0x%02X: %s\n", addr, text);
    });
}

void Manager_QuadDisplay::setScrollingActive(bool active, uint8_t address) {
    executeOnDisplay(address, [this, active](uint8_t addr) {
        displays[addr].scrollingActive = active;
    });
}

void Manager_QuadDisplay::setStaticText(const char* text, uint8_t address) {
    executeOnDisplay(address, [this, text](uint8_t addr) {
        auto& info = displays[addr];
        info.staticText = String(text);
        info.scrollingActive = false;
        printText(info.staticText.c_str(), addr);
    });
}

void Manager_QuadDisplay::updateScrollingText() {
    unsigned long currentTime = millis();
    
    for (auto& pair : displays) {
        uint8_t address = pair.first;
        DisplayInfo& info = pair.second;
        
        if (!info.initialized || !info.scrollingActive || info.scrollText.length() == 0) 
            continue;
        
        if (currentTime - info.lastScrollUpdate < scrollDelay) 
            continue;
            
        info.lastScrollUpdate = currentTime;
        updateScrollingText(address);
    }
}

void Manager_QuadDisplay::updateScrollingText(uint8_t address) {
    auto it = displays.find(address);
    if (it == displays.end() || !it->second.initialized) return;
    
    DisplayInfo& info = it->second;
    
    info.display.clear();
    for (int i = 0; i < 4; i++) {
        int charIndex = (info.scrollIndex + i) % info.scrollText.length();
        char c = info.scrollText.charAt(charIndex);
        info.display.writeDigitAscii(i, c);
    }
    info.display.writeDisplay();
    info.scrollIndex = (info.scrollIndex + 1) % info.scrollText.length();
}

// ScreenDestination Implementation
// ScreenDestination interface implementation
void Manager_QuadDisplay::update() {
    // ONLY handle scrolling text updates - no frame queue processing
    updateScrollingText();
}

String Manager_QuadDisplay::getScreenId() const {
    if (displays.size() == 1) {
        char buf[6];
        snprintf(buf, sizeof(buf), "0x%02X", displays.begin()->first);
        return String(buf);
    }
    return "quad_multi";  // Multiple displays
}

bool Manager_QuadDisplay::matchesScreenId(const String& screenId, const JsonDocument& doc) const {
    // Handle specific address
    if (screenId.startsWith("0x")) {
        uint8_t addr = (uint8_t)strtol(screenId.c_str(), NULL, 16);
        return hasDisplay(addr);
    }
    // Handle multi-display case
    return (screenId == "quad_multi" && displays.size() > 1);
}

const char* Manager_QuadDisplay::getConfigKey() const {
    return "quad";
}

void Manager_QuadDisplay::applyConfig(const JsonDocument& configDoc) {
    // Apply to specific display or all displays based on config
    uint8_t targetAddress = 0;  // Default to all
    
    if (configDoc.containsKey("address")) {
        const char* addrStr = configDoc["address"];
        targetAddress = (uint8_t)strtol(addrStr, NULL, 16);
    }
    
    if (configDoc.containsKey("scroll")) {
        setScrollingText(configDoc["scroll"], targetAddress);
    } else if (configDoc.containsKey("static")) {
        setStaticText(configDoc["static"], targetAddress);
    }

    if (configDoc.containsKey("brightness")) {
        setBrightness(configDoc["brightness"], targetAddress);
    }
}

void Manager_QuadDisplay::updateSensorData(const JsonDocument& sensorDoc) {
    if (!sensorDoc.containsKey("sensors")) return;

    // 1) Top‐level override: look for "screenId"
    uint8_t targetAddress = 0;  // 0 = broadcast
    if (sensorDoc.containsKey("screenId")) {
        const char* sid = sensorDoc["screenId"].as<const char*>();
        if (sid && strlen(sid) > 2 && sid[0] == '0' && sid[1] == 'x') {
            targetAddress = static_cast<uint8_t>(strtol(sid, nullptr, 16));
            // Serial.printf("[DEBUG][QuadDisplay] Payload targeted for 0x%02X via screenId\n", targetAddress);
        }
    }

    JsonObjectConst sensors = sensorDoc["sensors"];
    for (JsonPairConst kv : sensors) {
        JsonArrayConst dataArray = kv.value().as<JsonArrayConst>();
        if (dataArray.size() == 0) continue;

        JsonObjectConst dataItem = dataArray[0];

        // 2) Fallback per-item override (optional)
        if (dataItem.containsKey("Screen")) {
            const char* screenStr = dataItem["Screen"].as<const char*>();
            if (screenStr && strlen(screenStr) > 2 && screenStr[0] == '0' && screenStr[1] == 'x') {
                targetAddress = static_cast<uint8_t>(strtol(screenStr, nullptr, 16));
                // Serial.printf("[DEBUG][QuadDisplay] Payload targeted for 0x%02X via dataItem\n", targetAddress);
            }
        }

        if (!dataItem.containsKey("Value")) continue;
        const char* value = dataItem["Value"].as<const char*>();

        // Build the display string
        String displayText = String(value);
        if (dataItem.containsKey("Unit")) {
            const char* unit = dataItem["Unit"].as<const char*>();
            displayText += unit;
        }
        if (displayText.length() == 0) continue;

        // 3) Stop any scrolling on the target
        setScrollingActive(false, targetAddress);

        // 4) Print to the specific display (or broadcast if targetAddress == 0)
        printText(displayText.c_str(), targetAddress);

        // Only process the first sensor entry
        return;
    }
}
