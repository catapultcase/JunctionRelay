#include "Manager_QuadDisplay.h"
#include "Utils.h"
#include <Wire.h>

// Initialize static instance pointer to nullptr
Manager_QuadDisplay* Manager_QuadDisplay::instance = nullptr;

// Static method to get the singleton instance
Manager_QuadDisplay* Manager_QuadDisplay::getInstance(uint8_t i2cAddress) {
    if (instance == nullptr) {
        instance = new Manager_QuadDisplay(i2cAddress);
    }
    return instance;
}

// Private constructor for singleton pattern
Manager_QuadDisplay::Manager_QuadDisplay(uint8_t i2cAddress)
    : i2cAddr(i2cAddress), initialized(false) {
    // Nothing else to initialize
}

void Manager_QuadDisplay::begin() {
    if (initialized) {
        return;  // Skip initialization if already done
    }

    display.begin(i2cAddr, &Wire1);  // Uses the dynamic address
    clearDisplay();
    setBrightness(15);
    initialized = true;
    
    // Display firmware version similar to Matrix implementation
    showReadyScreen();
}

void Manager_QuadDisplay::showReadyScreen() {
    if (!initialized) return;
    
    clearDisplay();
    
    // Get the full firmware version string
    const char* fullVersion = getFirmwareVersion();
    
    // Create a scrolling string with "JR" followed by the version number
    String scrollingContent = "JR ";
    
    // If version starts with "JunctionRelay", extract just the version part
    if (strncmp(fullVersion, "JunctionRelay", 13) == 0) {
        // Extract version number after "JunctionRelay" prefix
        const char* versionPart = fullVersion + 13;
        
        // Skip any leading spaces
        while (*versionPart == ' ' && *versionPart != '\0') {
            versionPart++;
        }
        
        // Add the version part to the scrolling content
        scrollingContent += versionPart;
    } else {
        // If not using JunctionRelay prefix, use the full version
        scrollingContent += fullVersion;
    }
    
    // Add some spacing at the end for readability when scrolling loops
    scrollingContent += "   ";
    
    // Clear the frame queue to ensure sensor values will be displayed
    frameQueue = std::queue<String>();
    
    // Set the combined text as scrolling text
    setScrollingText(scrollingContent.c_str());
}

void Manager_QuadDisplay::clearDisplay() {
    if (!initialized) return;
    
    display.clear();
    display.writeDisplay();
}

void Manager_QuadDisplay::setBrightness(uint8_t brightness) {
    if (!initialized) return;
    
    display.setBrightness(brightness);
    display.writeDisplay();
}

void Manager_QuadDisplay::printText(const char *text) {
    if (!initialized) return;
    
    display.clear();
    for (uint8_t i = 0; i < 4; i++) {
        char c = text[i];
        if (c == '\0') break;
        display.writeDigitAscii(i, c);
    }
    display.writeDisplay();
}

void Manager_QuadDisplay::processNextFrame() {
    if (!initialized) return;
    
    if (!frameQueue.empty()) {
        // Stop any scrolling text when we process frames
        if (scrollingActive) {
            scrollingActive = false;
        }
        
        String next = frameQueue.front();
        frameQueue.pop();
        printText(next.c_str());
    }
}

void Manager_QuadDisplay::queueTextFrame(const String& text) {
    if (!initialized) return;
    
    if (frameQueue.size() >= maxQueueSize) {
        frameQueue.pop();  // Drop the oldest frame if the queue is full
    }
    frameQueue.push(text);
}

void Manager_QuadDisplay::printNumber(int number) {
    if (!initialized) return;
    
    char buf[5];
    snprintf(buf, sizeof(buf), "%4d", number);
    printText(buf);
}

void Manager_QuadDisplay::setScrollingText(const char* text) {
    if (!initialized) return;
    
    scrollText = String(text);
    scrollIndex = 0;
    scrollingActive = true;
}

void Manager_QuadDisplay::setScrollingActive(bool active) {
    if (!initialized) return;
    
    scrollingActive = active;
}

void Manager_QuadDisplay::updateScrollingText() {
    if (!initialized || !scrollingActive || scrollText.length() == 0) return;

    unsigned long currentTime = millis();
    if (currentTime - lastScrollUpdate < scrollDelay) return;
    lastScrollUpdate = currentTime;

    display.clear();
    for (int i = 0; i < 4; i++) {
        int charIndex = (scrollIndex + i) % scrollText.length();
        display.writeDigitAscii(i, scrollText.charAt(charIndex));
    }
    display.writeDisplay();

    scrollIndex = (scrollIndex + 1) % scrollText.length();
}

void Manager_QuadDisplay::setStaticText(const char* text) {
    if (!initialized) return;
    
    staticText = String(text);
    scrollingActive = false;
    printText(staticText.c_str());
}

// -------- ScreenDestination Implementation --------

String Manager_QuadDisplay::getScreenId() const {
    // Return dynamic ID based on I2C address, e.g. "0x70"
    char buf[6];
    snprintf(buf, sizeof(buf), "0x%02X", i2cAddr);
    return String(buf);
}

bool Manager_QuadDisplay::matchesScreenId(const String& screenId, const JsonDocument& doc) const {
    return (screenId == getScreenId());
}

const char* Manager_QuadDisplay::getConfigKey() const {
    return "quad";
}

void Manager_QuadDisplay::applyConfig(const JsonDocument& configDoc) {
    if (!initialized) return;
    
    if (configDoc.containsKey("scroll")) {
        setScrollingText(configDoc["scroll"]);
    } else if (configDoc.containsKey("static")) {
        setStaticText(configDoc["static"]);
    }

    if (configDoc.containsKey("brightness")) {
        setBrightness(configDoc["brightness"]);
    }
}

void Manager_QuadDisplay::update() {
    if (!initialized) return;
    
    // Handle frame queue with ultra-minimal delay
    static unsigned long lastFrameUpdate = 0;
    const unsigned long frameDelay = 10;  // 10ms between displayed values - as requested
    
    // Process the queue if there are items
    if (!frameQueue.empty()) {
        // If scrolling is active but we have items in queue, disable scrolling permanently
        if (scrollingActive) {
            scrollingActive = false;
        }
        
        if (millis() - lastFrameUpdate > frameDelay) {
            processNextFrame();
            lastFrameUpdate = millis();
        }
        return;
    }
    
    // Only update scrolling text if the queue is empty AND we haven't received any sensor data yet
    static bool receivedSensorData = false;
    
    if (!receivedSensorData && scrollingActive) {
        updateScrollingText();
    }
}

void Manager_QuadDisplay::updateSensorData(const JsonDocument& sensorDoc) {
    if (!initialized) return;
    
    if (!sensorDoc.containsKey("sensors")) return;

    JsonObjectConst sensors = sensorDoc["sensors"];
    
    // Process each sensor in the payload - we only care about the most recent one
    for (JsonPairConst kv : sensors) {
        // Get the array of values
        JsonArrayConst dataArray = kv.value().as<JsonArrayConst>();
        if (dataArray.size() == 0) continue;
        
        // Get first data item
        JsonObjectConst dataItem = dataArray[0];
        
        // Check for Value field
        if (dataItem.containsKey("Value")) {
            const char* value = dataItem["Value"];
            
            // Format display text based on whether Unit is available
            String displayText;
            if (dataItem.containsKey("Unit")) {
                const char* unit = dataItem["Unit"];
                displayText = String(value) + String(unit);
            } else {
                displayText = String(value);
            }
            
            if (displayText.length() > 0) {
                // Signal that we've received sensor data - disable welcome message on first data
                static bool firstSensorReceived = false;
                if (!firstSensorReceived) {
                    firstSensorReceived = true;
                    scrollingActive = false;
                    clearDisplay();
                }
                
                // Always display immediately for ultra-high speed updates
                printText(displayText.c_str());
                
                // Skip queue system entirely for maximum speed
                return;
            }
        }
    }
}