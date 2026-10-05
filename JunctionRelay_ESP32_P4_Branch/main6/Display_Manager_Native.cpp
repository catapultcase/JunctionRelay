#include "Display_Manager_Native.h"
#include "Device.h"

// Only include LGFX if we're compiling for a device that supports it
#ifdef DEVICE_CROWPANEL5
#include <LovyanGFX.hpp>
#endif

Display_Manager_Native::Display_Manager_Native(DeviceConfig* device)
    : device(device)
    , connectionManager(nullptr)
    , displayPtr(nullptr)
    , initialized(false)
    , lastStatus("Initializing...")
{
    Serial.println("[DISPLAY_NATIVE] Constructor called");
}

Display_Manager_Native::~Display_Manager_Native() {
    Serial.println("[DISPLAY_NATIVE] Destructor called");
}

bool Display_Manager_Native::init() {
    Serial.println("[DISPLAY_NATIVE] Initializing...");
    
    if (!device) {
        Serial.println("[DISPLAY_NATIVE] ERROR: No device provided");
        return false;
    }
    
    if (!device->hasOnboardScreen()) {
        Serial.println("[DISPLAY_NATIVE] ERROR: Device has no onboard screen");
        return false;
    }
    
    // Get display pointer from device
    displayPtr = device->getDisplay();
    if (!displayPtr) {
        Serial.println("[DISPLAY_NATIVE] ERROR: Failed to get display pointer from device");
        return false;
    }
    
    // Verify display dimensions using device methods
    int width = device->width();
    int height = device->height();
    
    if (width == 0 || height == 0) {
        Serial.println("[DISPLAY_NATIVE] ERROR: Device reports invalid display dimensions");
        return false;
    }
    
    Serial.printf("[DISPLAY_NATIVE] Display ready: %dx%d\n", width, height);
    
    // Device-specific initialization (if needed)
    if (strcmp(device->getDeviceModel(), "CrowPanel5 5-inch") == 0) {
        // Set backlight via GPIO for CrowPanel5 (device.begin() already handles LEDC)
        pinMode(2, OUTPUT);
        digitalWrite(2, HIGH);
        Serial.println("[DISPLAY_NATIVE] CrowPanel5 backlight enabled");
    }
    
    initialized = true;
    Serial.println("[DISPLAY_NATIVE] Initialization complete");
    return true;
}

String Display_Manager_Native::getScreenId() const {
    return "onboard";
}

void Display_Manager_Native::applyConfig(const JsonDocument& configDoc) {
    Serial.println("[DISPLAY_NATIVE] applyConfig called");
    // For now, just show home screen for any config
    showHomeScreen();
}

void Display_Manager_Native::updateSensorData(const JsonDocument& sensorDoc) {
    Serial.println("[DISPLAY_NATIVE] updateSensorData called");
}

bool Display_Manager_Native::matchesScreenId(const String& screenId, const JsonDocument& doc) const {
    return screenId.equalsIgnoreCase(getScreenId());
}

const char* Display_Manager_Native::getConfigKey() const {
    return "onboard";
}

void Display_Manager_Native::updateStatusLabel(const String& status) {
    lastStatus = status;
    Serial.printf("[DISPLAY_NATIVE] Status updated: %s\n", status.c_str());
    // Refresh display if showing home screen and initialized
    if (initialized) {
        showHomeScreen();
    }
}

void Display_Manager_Native::createHomeScreen() {
    Serial.println("[DISPLAY_NATIVE] createHomeScreen called");
    showHomeScreen();
}

void Display_Manager_Native::showHomeScreen() {
    Serial.println("[DISPLAY_NATIVE] showHomeScreen() - Entry point");
    
    if (!initialized) {
        Serial.println("[DISPLAY_NATIVE] ERROR: Not initialized, cannot show home screen");
        return;
    }
    
    if (!device || !displayPtr) {
        Serial.println("[DISPLAY_NATIVE] ERROR: Device or display not available");
        return;
    }
    
    Serial.println("[DISPLAY_NATIVE] Drawing home screen...");
    
    // Try device-specific optimized rendering first
    if (renderWithLGFX()) {
        Serial.println("[DISPLAY_NATIVE] Home screen rendered with LGFX");
        return;
    }
    
    // Fall back to generic rendering
    if (renderGeneric()) {
        Serial.println("[DISPLAY_NATIVE] Home screen rendered with generic method");
        return;
    }
    
    // If we get here, rendering failed
    Serial.println("[DISPLAY_NATIVE] ERROR: All rendering methods failed");
}

bool Display_Manager_Native::renderWithLGFX() {
#ifdef DEVICE_CROWPANEL5
    // Cast to LGFX device if we're dealing with CrowPanel5
    if (strcmp(device->getDeviceModel(), "CrowPanel5 5-inch") == 0) {
        lgfx::LGFX_Device* display = static_cast<lgfx::LGFX_Device*>(displayPtr);
        if (display) {
            // Clear screen with black background
            display->fillScreen(0x0000); // Black
            
            // Main title - large and prominent
            display->setTextColor(0xFFFF, 0x0000); // White on black
            display->setTextSize(8);
            display->setCursor(50, 50);
            display->print("Junction");
            display->setCursor(50, 150);
            display->print("Relay");
            
            // Device info
            display->setTextSize(4);
            display->setTextColor(0x07FF, 0x0000); // Cyan
            display->setCursor(50, 270);
            display->print("Device: ");
            display->setTextColor(0xFFFF, 0x0000); // White
            display->print(device->getName());
            
            // Network status
            display->setTextSize(3);
            display->setTextColor(0x07FF, 0x0000); // Cyan
            display->setCursor(50, 320);
            display->print("Network: ");
            if (connectionManager) {
                display->setTextColor(0x07E0, 0x0000); // Green
                display->print("Connected");
            } else {
                display->setTextColor(0xF800, 0x0000); // Red
                display->print("Disconnected");
            }
            
            // Status
            display->setCursor(50, 360);
            display->setTextColor(0x07FF, 0x0000); // Cyan
            display->print("Status: ");
            display->setTextColor(0x07E0, 0x0000); // Green
            display->print(lastStatus);
            
            // System info
            display->setCursor(50, 400);
            display->setTextColor(0xFFE0, 0x0000); // Yellow
            display->print("Free RAM: ");
            display->setTextColor(0xFFFF, 0x0000); // White
            display->print(ESP.getFreeHeap());
            display->print(" bytes");
            
            Serial.println("[DISPLAY_NATIVE] LGFX home screen completed");
            return true;
        }
    }
#endif
    return false; // LGFX rendering not available or failed
}

bool Display_Manager_Native::renderGeneric() {
    // Generic fallback rendering - would need to be implemented per device type
    // For now, just log that we would render here
    Serial.printf("[DISPLAY_NATIVE] Generic rendering not implemented for device: %s\n", 
                  device->getDeviceModel());
    
    // Example: For devices with basic text output, you could implement:
    // Serial.println("=== Junction Relay ===");
    // Serial.printf("Device: %s\n", device->getName());
    // Serial.printf("Status: %s\n", lastStatus.c_str());
    // etc.
    
    return false; // Generic rendering not implemented yet
}

void Display_Manager_Native::drawTitle(void* display) {
    // Helper method for drawing title - can be implemented per device type
    // This would be called from device-specific render methods
}

void Display_Manager_Native::drawDeviceInfo(void* display) {
    // Helper method for drawing device info - can be implemented per device type
}

void Display_Manager_Native::drawNetworkStatus(void* display) {
    // Helper method for drawing network status - can be implemented per device type
}

void Display_Manager_Native::drawSystemInfo(void* display) {
    // Helper method for drawing system info - can be implemented per device type
}