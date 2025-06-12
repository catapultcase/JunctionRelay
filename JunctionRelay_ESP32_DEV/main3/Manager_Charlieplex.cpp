#include "Manager_Charlieplex.h"
#include "Utils.h"
#include <Wire.h>
#include <vector>
// Try these fonts (one at a time to see which works):
#include <Fonts/TomThumb.h>           // Very small 3x5 font
// #include <Fonts/Tiny3x3a2pt7b.h>   // Alternative tiny font
// #include <Fonts/FreeMono6pt7b.h>   // Small monospace font

Manager_Charlieplex* Manager_Charlieplex::instance = nullptr;

Manager_Charlieplex* Manager_Charlieplex::getInstance(TwoWire* wireInterface) {
    if (instance == nullptr) {
        instance = new Manager_Charlieplex(wireInterface);
        Serial.printf("[DEBUG][Charlieplex] Created singleton instance with interface: %s\n", 
                     (wireInterface == &Wire1) ? "Wire1" : "Wire");
    }
    return instance;
}

void Manager_Charlieplex::cleanup() {
    if (instance != nullptr) {
        Serial.printf("[DEBUG][Charlieplex] Cleaning up singleton with %d displays\n", instance->displays.size());
        delete instance;
        instance = nullptr;
    }
}

Manager_Charlieplex::Manager_Charlieplex(TwoWire* wireInterface)
    : wireInterface(wireInterface) {
    Serial.println("[DEBUG][Charlieplex] Singleton constructor called");
}

void Manager_Charlieplex::begin() {
    Serial.printf("[DEBUG][Charlieplex] Beginning initialization for %d displays\n", displays.size());
    
    for (auto& pair : displays) {
        uint8_t address = pair.first;
        DisplayInfo& info = pair.second;
        
        if (info.initialized) {
            Serial.printf("[DEBUG][Charlieplex] Display 0x%02X already initialized\n", address);
            continue;
        }
        
        Serial.printf("[DEBUG][Charlieplex] Initializing display at 0x%02X\n", address);
        
        // Test I2C communication
        wireInterface->beginTransmission(address);
        int error = wireInterface->endTransmission();
        
        if (error != 0) {
            Serial.printf("[ERROR][Charlieplex] I2C communication failed for 0x%02X (error: %d)\n", address, error);
            continue;
        }
        
        // Initialize the display
        bool beginResult = info.display.begin(address, wireInterface);
        if (!beginResult) {
            Serial.printf("[ERROR][Charlieplex] Display initialization failed for 0x%02X\n", address);
            continue;
        }
        
        info.display.clear();
        info.display.setFrame(0);
        
        // Set the TomThumb font for smaller text
        info.display.setFont(&TomThumb);
        
        info.initialized = true;
        
        Serial.printf("[DEBUG][Charlieplex] Successfully initialized display at 0x%02X with TomThumb font\n", address);
    }
    
    showReadyScreen();
}

void Manager_Charlieplex::addDisplay(uint8_t i2cAddress) {
    if (displays.find(i2cAddress) == displays.end()) {
        displays[i2cAddress] = DisplayInfo();
        Serial.printf("[DEBUG][Charlieplex] Added display at address 0x%02X\n", i2cAddress);
    } else {
        Serial.printf("[DEBUG][Charlieplex] Display 0x%02X already exists\n", i2cAddress);
    }
}

void Manager_Charlieplex::showReadyScreen() {
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

std::vector<uint8_t> Manager_Charlieplex::getDisplayAddresses() const {
    std::vector<uint8_t> addresses;
    for (const auto& pair : displays) {
        addresses.push_back(pair.first);
    }
    return addresses;
}

bool Manager_Charlieplex::hasDisplay(uint8_t address) const {
    return displays.find(address) != displays.end();
}

void Manager_Charlieplex::executeOnDisplay(uint8_t address, std::function<void(uint8_t)> func) {
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

void Manager_Charlieplex::executeOnAllDisplays(std::function<void(uint8_t)> func) {
    for (auto& pair : displays) {
        if (pair.second.initialized) {
            func(pair.first);
        }
    }
}

void Manager_Charlieplex::clearDisplay(uint8_t address) {
    executeOnDisplay(address, [this](uint8_t addr) {
        auto& info = displays[addr];
        uint8_t nextFrame = 1 - info.currentFrame;
        info.display.setFrame(nextFrame);
        info.display.clear();
        info.display.displayFrame(nextFrame);
        info.currentFrame = nextFrame;
    });
}

void Manager_Charlieplex::setBrightness(uint8_t brightness, uint8_t address) {
    executeOnDisplay(address, [this, brightness](uint8_t addr) {
        auto& info = displays[addr];
        // IS31FL3731 doesn't have a global brightness, but we can adjust text color
        info.brightness = brightness;
    });
}

void Manager_Charlieplex::displayTextOnScreen(uint8_t address, const char* text) {
    auto it = displays.find(address);
    if (it == displays.end() || !it->second.initialized) return;
    
    DisplayInfo& info = it->second;
    Adafruit_IS31FL3731& matrix = info.display;
    
    // Keep double buffering for flicker prevention
    uint8_t nextFrame = 1 - info.currentFrame;
    
    // MINIMAL I2C calls - only the essentials
    matrix.setFrame(nextFrame);     // 1 - Switch to off-screen buffer
    matrix.clear();                 // 2 - Clear the buffer
    
    // For TomThumb font, adjust cursor position to account for baseline
    matrix.setCursor(0, 6);         // 3 - Set position (adjusted for TomThumb font baseline)
    matrix.setFont(&TomThumb);      // 4 - Ensure TomThumb font is set
    matrix.print(text);             // 5+ - Write text (varies by length)
    matrix.displayFrame(nextFrame); // 6+ - Display the frame
    
    // Update current frame for next time
    info.currentFrame = nextFrame;
}

void Manager_Charlieplex::setScrollingText(const char* text, uint8_t address) {
    executeOnDisplay(address, [this, text](uint8_t addr) {
        auto& info = displays[addr];
        info.scrollText = String(text);
        info.scrollIndex = 0;
        info.scrollingActive = true;
        Serial.printf("[DEBUG][Charlieplex] Set scrolling text for 0x%02X: %s\n", addr, text);
    });
}

void Manager_Charlieplex::setScrollingActive(bool active, uint8_t address) {
    executeOnDisplay(address, [this, active](uint8_t addr) {
        displays[addr].scrollingActive = active;
    });
}

void Manager_Charlieplex::setStaticText(const char* text, uint8_t address) {
    executeOnDisplay(address, [this, text](uint8_t addr) {
        auto& info = displays[addr];
        info.staticText = String(text);
        info.scrollingActive = false;
        displayTextOnScreen(addr, info.staticText.c_str());
    });
}

void Manager_Charlieplex::updateScrollingText() {
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

void Manager_Charlieplex::updateScrollingText(uint8_t address) {
    auto it = displays.find(address);
    if (it == displays.end() || !it->second.initialized) return;
    
    DisplayInfo& info = it->second;
    
    // For Charlieplex displays with TomThumb font, calculate characters that fit
    // TomThumb font is approximately 3 pixels wide per character
    int maxChars = info.width / 3;  // Adjusted for TomThumb font width
    String displayText = "";
    
    for (int i = 0; i < maxChars && i < info.scrollText.length(); i++) {
        int charIndex = (info.scrollIndex + i) % info.scrollText.length();
        displayText += info.scrollText.charAt(charIndex);
    }
    
    // Use the double-buffered displayTextOnScreen method
    displayTextOnScreen(address, displayText.c_str());
    info.scrollIndex = (info.scrollIndex + 1) % info.scrollText.length();
}

// ScreenDestination Implementation
// ScreenDestination interface implementation
void Manager_Charlieplex::update() {
    // ONLY handle scrolling text updates - no frame queue processing
    updateScrollingText();
}

String Manager_Charlieplex::getScreenId() const {
    if (displays.size() == 1) {
        char buf[6];
        snprintf(buf, sizeof(buf), "0x%02X", displays.begin()->first);
        return String(buf);
    }
    return "charlie_multi";
}

bool Manager_Charlieplex::matchesScreenId(const String& screenId, const JsonDocument& doc) const {
    if (screenId.startsWith("0x")) {
        uint8_t addr = (uint8_t)strtol(screenId.c_str(), NULL, 16);
        return displays.find(addr) != displays.end();
    }
    return (screenId == "charlie_multi" && displays.size() > 1);
}

const char* Manager_Charlieplex::getConfigKey() const {
    return "charlie";
}

void Manager_Charlieplex::applyConfig(const JsonDocument& configDoc) {
    uint8_t targetAddress = 0;  // Default to all displays
    
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

void Manager_Charlieplex::updateSensorData(const JsonDocument& sensorDoc) {
    if (!sensorDoc.containsKey("sensors")) return;

    // 1) Top-level override: look for "screenId"
    uint8_t targetAddress = 0;  // 0 = broadcast
    if (sensorDoc.containsKey("screenId")) {
        const char* sid = sensorDoc["screenId"].as<const char*>();
        if (sid && strlen(sid) > 2 && sid[0] == '0' && sid[1] == 'x') {
            targetAddress = static_cast<uint8_t>(strtol(sid, nullptr, 16));
        }
    }

    JsonObjectConst sensors = sensorDoc["sensors"];
    for (JsonPairConst kv : sensors) {
        JsonArrayConst dataArray = kv.value().as<JsonArrayConst>();
        if (dataArray.size() == 0) continue;

        JsonObjectConst dataItem = dataArray[0];

        // 2) Fallback per-item override (exactly as before)
        if (dataItem.containsKey("Screen")) {
            const char* screenStr = dataItem["Screen"].as<const char*>();
            if (screenStr && strlen(screenStr) > 2 && screenStr[0] == '0' && screenStr[1] == 'x') {
                targetAddress = static_cast<uint8_t>(strtol(screenStr, nullptr, 16));
            }
        }

        // 3) Value → text
        if (!dataItem.containsKey("Value")) continue;
        const char* value = dataItem["Value"].as<const char*>();

        String displayText = String(value);

        if (dataItem.containsKey("Unit")) {
            const char* unit = dataItem["Unit"].as<const char*>();
            displayText += unit;  // c-string append
        }

        if (displayText.length() == 0) continue;

        // 4) Double-buffered write (unchanged)
        setScrollingActive(false, targetAddress);
        if (targetAddress == 0) {
            // broadcast
            for (auto& pair : displays) {
                if (pair.second.initialized) {
                    displayTextOnScreen(pair.first, displayText.c_str());
                }
            }
        } else {
            // single display
            auto it = displays.find(targetAddress);
            if (it != displays.end() && it->second.initialized) {
                displayTextOnScreen(targetAddress, displayText.c_str());
            } else {
                Serial.printf("[WARNING][Charlieplex] Target display 0x%02X not found or not initialized\n",
                              targetAddress);
            }
        }

        // only process the first sensor
        return;
    }
}