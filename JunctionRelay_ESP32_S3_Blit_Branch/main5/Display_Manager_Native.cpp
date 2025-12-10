#include "Display_Manager_Native.h"
#include "Device.h"
#include "Helper_Utils.h"  // Added for getFirmwareVersion() and getFormattedMacAddress()

// Include LGFX if we're compiling for devices that support it
#if defined(DEVICE_CROWPANEL5) || defined(DEVICE_CROWPANEL7)
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
    const char* deviceModel = device->getDeviceModel();
    bool isCrowPanel5 = (strcmp(deviceModel, "CrowPanel5 5-inch") == 0);
    bool isCrowPanel7 = (strcmp(deviceModel, "CrowPanel7 7-inch") == 0);
    
    if (isCrowPanel5 || isCrowPanel7) {
        // Set backlight via GPIO for CrowPanel devices (device.begin() already handles LEDC)
        pinMode(2, OUTPUT);
        digitalWrite(2, HIGH);
        Serial.printf("[DISPLAY_NATIVE] %s backlight enabled\n", deviceModel);
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

// Helper method to get human-readable connection mode name
String Display_Manager_Native::getConnectionModeName() const {
    if (!connectionManager) {
        return "Unknown";
    }
    
    ConnectionStatus status = connectionManager->getConnectionStatus();
    String activeType = status.activeNetworkType;
    
    // Convert technical names to user-friendly names
    if (activeType == "USB_Direct") {
        return "USB Direct";
    } else if (activeType == "WiFi") {
        return "WiFi";
    } else if (activeType == "Ethernet") {
        return "Ethernet";
    } else if (activeType == "ESP-NOW") {
        return "ESP-NOW";
    } else if (activeType == "Gateway_USB") {
        return "Gateway (USB)";
    } else if (activeType == "Gateway_Ethernet") {
        return "Gateway (Ethernet)";
    } else if (activeType == "None") {
        return "Disconnected";
    } else {
        return activeType; // Return as-is for any other types
    }
}

// Helper method to get connection status color
uint16_t Display_Manager_Native::getConnectionStatusColor() const {
    if (!connectionManager) {
        return 0xF800; // Red for no connection manager
    }
    
    ConnectionStatus status = connectionManager->getConnectionStatus();
    
    // Check if any connection is active
    if (status.usbActive || status.wifiConnected || status.ethernetConnected || status.espNowActive) {
        return 0x07E0; // Green for connected
    } else {
        return 0xF800; // Red for disconnected
    }
}

// Helper method to get status text
String Display_Manager_Native::getStatusText() const {
    if (!connectionManager) {
        return "No Connection Manager";
    }
    
    ConnectionStatus status = connectionManager->getConnectionStatus();
    
    if (status.usbActive) {
        return "USB Active";
    } else if (status.wifiConnected || status.ethernetConnected) {
        return "Network Connected";
    } else if (status.espNowActive) {
        return "ESP-NOW Active";
    } else {
        return "Disconnected";
    }
}

// Helper method to get MQTT status color
uint16_t Display_Manager_Native::getMqttStatusColor() const {
    if (!connectionManager) {
        return 0xF800; // Red
    }
    
    ConnectionStatus status = connectionManager->getConnectionStatus();
    return status.mqttConnected ? 0x07E0 : 0xF800; // Green if connected, Red if not
}

bool Display_Manager_Native::renderWithLGFX() {
#if defined(DEVICE_CROWPANEL5) || defined(DEVICE_CROWPANEL7)
    // Check if we're dealing with a CrowPanel device (5 or 7 inch)
    const char* deviceModel = device->getDeviceModel();
    bool isCrowPanel5 = (strcmp(deviceModel, "CrowPanel5 5-inch") == 0);
    bool isCrowPanel7 = (strcmp(deviceModel, "CrowPanel7 7-inch") == 0);
    
    if (isCrowPanel5 || isCrowPanel7) {
        lgfx::LGFX_Device* display = static_cast<lgfx::LGFX_Device*>(displayPtr);
        if (display) {
            // Clear screen with black background
            display->fillScreen(0x0000); // Black
            
            // Main title - single line at top
            display->setTextColor(0xFFFF, 0x0000); // White on black
            display->setTextSize(8);
            display->setCursor(50, 60);
            display->print("JunctionRelay");
            
            // Consistent text size and color scheme for all info lines
            display->setTextSize(3);
            int yPos = 150;
            int lineSpacing = 35;
            
            // Firmware Version
            display->setCursor(50, yPos);
            display->setTextColor(0x07FF, 0x0000); // Cyan labels
            display->print("Version: ");
            display->setTextColor(0xFFFF, 0x0000); // White values
            display->print(getFirmwareVersion());
            yPos += lineSpacing;
            
            // Device info
            display->setCursor(50, yPos);
            display->setTextColor(0x07FF, 0x0000); // Cyan labels
            display->print("Device: ");
            display->setTextColor(0xFFFF, 0x0000); // White values
            display->print(device->getName());
            yPos += lineSpacing;
            
            // Connection Mode
            display->setCursor(50, yPos);
            display->setTextColor(0x07FF, 0x0000); // Cyan labels
            display->print("Connection: ");
            display->setTextColor(getConnectionStatusColor(), 0x0000); // Dynamic color
            display->print(getConnectionModeName());
            yPos += lineSpacing;
            
            // Status
            display->setCursor(50, yPos);
            display->setTextColor(0x07FF, 0x0000); // Cyan labels
            display->print("Status: ");
            display->setTextColor(getConnectionStatusColor(), 0x0000); // Dynamic color
            display->print(getStatusText());
            yPos += lineSpacing;
            
            // MQTT Status (only show for WiFi/Ethernet modes)
            if (connectionManager) {
                ConnectionStatus status = connectionManager->getConnectionStatus();
                if (status.wifiConnected || status.ethernetConnected) {
                    display->setCursor(50, yPos);
                    display->setTextColor(0x07FF, 0x0000); // Cyan labels
                    display->print("MQTT: ");
                    display->setTextColor(getMqttStatusColor(), 0x0000); // Dynamic color
                    display->print(status.mqttConnected ? "Connected" : "Disconnected");
                    yPos += lineSpacing;
                }
            }
            
            // MAC Address
            display->setCursor(50, yPos);
            display->setTextColor(0x07FF, 0x0000); // Cyan labels
            display->print("MAC: ");
            display->setTextColor(0xFFFF, 0x0000); // White values
            display->print(getFormattedMacAddress());
            yPos += lineSpacing;
            
            // IP Address (if available)
            if (connectionManager) {
                ConnectionStatus status = connectionManager->getConnectionStatus();
                if (status.ipAddress.length() > 0) {
                    display->setCursor(50, yPos);
                    display->setTextColor(0x07FF, 0x0000); // Cyan labels
                    display->print("IP: ");
                    display->setTextColor(0xFFFF, 0x0000); // White values
                    display->print(status.ipAddress);
                    yPos += lineSpacing;
                }
            }
            
            // Free RAM
            display->setCursor(50, yPos);
            display->setTextColor(0x07FF, 0x0000); // Cyan labels
            display->print("Free RAM: ");
            display->setTextColor(0xFFFF, 0x0000); // White values
            display->print(ESP.getFreeHeap());
            display->print(" bytes");
            
            Serial.printf("[DISPLAY_NATIVE] LGFX home screen completed for %s\n", deviceModel);
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
    Serial.println("=== JunctionRelay ===");
    Serial.printf("Version: %s\n", getFirmwareVersion());
    Serial.printf("MAC: %s\n", getFormattedMacAddress().c_str());
    Serial.printf("Device: %s\n", device->getName());
    Serial.printf("Connection: %s\n", getConnectionModeName().c_str());
    Serial.printf("Status: %s\n", getStatusText().c_str());
    
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