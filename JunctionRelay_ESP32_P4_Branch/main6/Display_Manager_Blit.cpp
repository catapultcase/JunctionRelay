#include "Display_Manager_Blit.h"
#include "Device.h"

// Only include LGFX if we're compiling for a device that supports it
#ifdef DEVICE_CROWPANEL5
#include <LovyanGFX.hpp>
#endif

Display_Manager_Blit::Display_Manager_Blit(DeviceConfig* device)
    : device(device)
    , displayPtr(nullptr)
    , decompressor(nullptr)
    , initialized(false)
{
    Serial.println("[BLIT] Constructor called");
    
    // Initialize decompressor for compressed blit frames
    decompressor = new Helper_Decompression();
    
    // Reset statistics
    resetStats();
}

Display_Manager_Blit::~Display_Manager_Blit() {
    if (decompressor) {
        delete decompressor;
        decompressor = nullptr;
    }
    Serial.println("[BLIT] Destructor called");
}

bool Display_Manager_Blit::init() {
    Serial.println("[BLIT] Initializing blit manager...");
    
    if (!device) {
        Serial.println("[BLIT] ERROR: No device provided");
        return false;
    }
    
    if (!device->hasOnboardScreen()) {
        Serial.println("[BLIT] ERROR: Device has no onboard screen for blit operations");
        return false;
    }
    
    // Get display pointer from device
    displayPtr = device->getDisplay();
    if (!displayPtr) {
        Serial.println("[BLIT] ERROR: Failed to get display pointer from device");
        return false;
    }
    
    // Verify display dimensions using device methods
    int width = device->width();
    int height = device->height();
    
    if (width == 0 || height == 0) {
        Serial.println("[BLIT] ERROR: Device reports invalid display dimensions");
        return false;
    }
    
    Serial.printf("[BLIT] Display ready: %dx%d\n", width, height);
    
    // Set default configuration based on display size
    config.frameWidth = width;
    config.frameHeight = height;
    config.expectedFrameSize = calculateExpectedFrameSize(config.frameWidth, config.frameHeight);
    
    initialized = true;
    
    Serial.println("[BLIT] Initialization complete - display ready for frames");
    return true;
}

String Display_Manager_Blit::getScreenId() const {
    return "blit";
}

void Display_Manager_Blit::applyConfig(const JsonDocument& configDoc) {
    Serial.println("[BLIT] applyConfig called");
    
    // Check if this is a blit frame or blit configuration
    const char* type = configDoc["type"];
    if (type && strcmp(type, "blit_frame") == 0) {
        processBlitFrame(configDoc);
    } else if (type && strcmp(type, "blit_config") == 0) {
        handleBlitConfig(configDoc);
    } else {
        Serial.printf("[BLIT] Unknown config type: %s\n", type ? type : "null");
    }
}

void Display_Manager_Blit::updateSensorData(const JsonDocument& sensorDoc) {
    // Blit manager doesn't handle sensor data
    Serial.println("[BLIT] updateSensorData called (ignored)");
}

bool Display_Manager_Blit::matchesScreenId(const String& screenId, const JsonDocument& doc) const {
    return screenId.equalsIgnoreCase(getScreenId());
}

const char* Display_Manager_Blit::getConfigKey() const {
    return "blit";
}

void Display_Manager_Blit::processBlitFrame(const JsonDocument& frameDoc) {
    if (!initialized) {
        Serial.println("[BLIT] ERROR: Not initialized, dropping frame");
        stats.framesDropped++;
        return;
    }
    
    stats.framesReceived++;
    
    // Extract frame information
    uintptr_t frameDataPtr = frameDoc["frameData"];
    size_t frameSize = frameDoc["frameSize"];
    bool compressed = frameDoc["compressed"] | false;
    
    if (frameDataPtr == 0) {
        Serial.println("[BLIT] ERROR: Invalid frame data pointer");
        stats.framesDropped++;
        return;
    }
    
    uint8_t* frameData = reinterpret_cast<uint8_t*>(frameDataPtr);
    
    Serial.printf("[BLIT] Processing %s frame: %u bytes\n", 
                  compressed ? "compressed" : "uncompressed", frameSize);
    
    // Update statistics
    if (compressed) {
        stats.compressedFrames++;
    } else {
        stats.uncompressedFrames++;
    }
    stats.bytesProcessed += frameSize;
    
    // Auto-configure if needed
    if (config.autoConfig && !config.streamActive) {
        autoConfigureFromFrame(frameSize, compressed);
    }
    
    // Validate frame size
    if (!validateFrameSize(frameSize)) {
        Serial.printf("[BLIT] ERROR: Invalid frame size: %u (expected: %u)\n", 
                     frameSize, config.expectedFrameSize);
        stats.framesDropped++;
        return;
    }
    
    // Render the frame
    renderRGB565Frame(frameData, frameSize);
    
    stats.framesRendered++;
    updateFPS();
    
    logFrameInfo(frameSize, compressed);
}

void Display_Manager_Blit::renderRGB565Frame(uint8_t* frameData, size_t frameSize) {
    if (!device || !displayPtr || !frameData) {
        Serial.println("[BLIT] ERROR: Cannot render frame - invalid parameters");
        stats.framesDropped++;
        return;
    }
    
    // Try device-specific optimized rendering first
    if (renderWithLGFX(frameData, frameSize)) {
        return; // Successfully rendered with LGFX
    }
    
    // Fall back to generic rendering
    if (renderGeneric(frameData, frameSize)) {
        return; // Successfully rendered with generic method
    }
    
    // If we get here, rendering failed
    Serial.println("[BLIT] ERROR: All rendering methods failed");
    stats.framesDropped++;
}

bool Display_Manager_Blit::renderWithLGFX(uint8_t* frameData, size_t frameSize) {
#ifdef DEVICE_CROWPANEL5
    // Cast to LGFX device if we're dealing with CrowPanel5
    if (strcmp(device->getDeviceModel(), "CrowPanel5 5-inch") == 0) {
        lgfx::LGFX_Device* lgfxDisplay = static_cast<lgfx::LGFX_Device*>(displayPtr);
        if (lgfxDisplay) {
            // Determine render dimensions (don't exceed display size)
            int renderWidth = min(config.frameWidth, device->width());
            int renderHeight = min(config.frameHeight, device->height());
            
            // Render RGB565 frame directly using LGFX
            lgfxDisplay->pushImageDMA(0, 0, renderWidth, renderHeight, 
                                     reinterpret_cast<const lgfx::rgb565_t*>(frameData));
            
            // Serial.printf("[BLIT] LGFX frame rendered: %dx%d\n", renderWidth, renderHeight);
            return true;
        }
    }
#endif
    return false; // LGFX rendering not available or failed
}

bool Display_Manager_Blit::renderGeneric(uint8_t* frameData, size_t frameSize) {
    // Generic fallback rendering - would need to be implemented per device type
    // For now, just log that we would render here
    Serial.printf("[BLIT] Generic rendering not implemented for device: %s\n", 
                  device->getDeviceModel());
    return false;
}

void Display_Manager_Blit::autoConfigureFromFrame(size_t frameSize, bool wasCompressed) {
    // Common RGB565 frame sizes (2 bytes per pixel)
    if (frameSize == 768000) { // 800x480x2
        config.frameWidth = 800;
        config.frameHeight = 480;
        config.expectedFrameSize = 768000;
        Serial.printf("[BLIT] Auto-configured: 800x480 RGB565%s\n", wasCompressed ? " (compressed)" : "");
    } else if (frameSize == 20000) { // 100x100x2
        config.frameWidth = 100;
        config.frameHeight = 100;
        config.expectedFrameSize = 20000;
        Serial.printf("[BLIT] Auto-configured: 100x100 RGB565%s\n", wasCompressed ? " (compressed)" : "");
    } else if (frameSize == 12800) { // 80x80x2
        config.frameWidth = 80;
        config.frameHeight = 80;
        config.expectedFrameSize = 12800;
        Serial.printf("[BLIT] Auto-configured: 80x80 RGB565%s\n", wasCompressed ? " (compressed)" : "");
    } else if (frameSize == 307200) { // 640x480x2 / 2 (half resolution)
        config.frameWidth = 400;
        config.frameHeight = 240;
        config.expectedFrameSize = 192000;
        Serial.printf("[BLIT] Auto-configured: 400x240 RGB565%s\n", wasCompressed ? " (compressed)" : "");
    } else {
        Serial.printf("[BLIT] WARNING: Unknown frame size %u, using as-is\n", frameSize);
        // Try to guess dimensions (assume square-ish aspect ratio)
        float pixels = frameSize / 2.0; // RGB565 = 2 bytes per pixel
        int dimension = sqrt(pixels);
        config.frameWidth = dimension;
        config.frameHeight = dimension;
        config.expectedFrameSize = frameSize;
    }
    
    config.streamActive = true;
    
    Serial.printf("[BLIT] Auto-configured: %dx%d RGB565%s\n", 
                  config.frameWidth, config.frameHeight, wasCompressed ? " (compressed)" : "");
}

void Display_Manager_Blit::handleBlitConfig(const JsonDocument& configDoc) {
    Serial.println("[BLIT] Processing blit configuration");
    
    // Extract configuration parameters
    int frameWidth = configDoc["frameWidth"] | config.frameWidth;
    int frameHeight = configDoc["frameHeight"] | config.frameHeight;
    size_t frameSize = configDoc["frameSize"] | 0;
    String frameFormat = configDoc["frameFormat"] | "RGB565";
    bool autoConfig = configDoc["autoConfig"] | true;
    
    // Validate format
    if (frameFormat != "RGB565") {
        Serial.printf("[BLIT] ERROR: Unsupported format '%s' - only RGB565 supported\n", 
                     frameFormat.c_str());
        return;
    }
    
    // Apply configuration
    config.frameWidth = frameWidth;
    config.frameHeight = frameHeight;
    config.frameFormat = frameFormat;
    config.autoConfig = autoConfig;
    
    // Calculate expected frame size if not provided
    if (frameSize > 0) {
        config.expectedFrameSize = frameSize;
    } else {
        config.expectedFrameSize = calculateExpectedFrameSize(frameWidth, frameHeight);
    }
    
    // Reset statistics for new stream
    resetStats();
    config.streamActive = true;
    
    Serial.printf("[BLIT] Configuration applied: %dx%d %s (%u bytes)\n",
                  config.frameWidth, config.frameHeight, 
                  config.frameFormat.c_str(), config.expectedFrameSize);
}

bool Display_Manager_Blit::validateFrameSize(size_t frameSize) const {
    // Allow some tolerance for different frame sizes during auto-configuration
    if (config.autoConfig) {
        return frameSize > 0 && frameSize <= 768000 * 4; // Up to 4x max expected size
    }
    
    // Strict validation when manually configured
    return frameSize == config.expectedFrameSize;
}

void Display_Manager_Blit::updateFPS() {
    unsigned long now = millis();
    if (stats.lastFrameTime > 0) {
        float deltaTime = (now - stats.lastFrameTime) / 1000.0;
        if (deltaTime > 0) {
            stats.currentFPS = 1.0 / deltaTime;
        }
    }
    stats.lastFrameTime = now;
    stats.streamActive = true;
}

size_t Display_Manager_Blit::calculateExpectedFrameSize(int width, int height) const {
    return width * height * 2; // RGB565 = 2 bytes per pixel
}

void Display_Manager_Blit::logFrameInfo(size_t frameSize, bool compressed) const {
    // Only log every 30th frame to avoid spam
    static uint32_t logCounter = 0;
    logCounter++;
    
    if (logCounter % 30 == 0) {
        Serial.printf("[BLIT] Stats: %u frames rendered, %.1f FPS, %s\n",
                      stats.framesRendered, stats.currentFPS,
                      compressed ? "compressed" : "uncompressed");
    }
}

void Display_Manager_Blit::resetStats() {
    stats = BlitStats(); // Reset to defaults
}

void Display_Manager_Blit::printStats() const {
    Serial.println("=== Blit Manager Statistics ===");
    Serial.printf("Frames Received: %u\n", stats.framesReceived);
    Serial.printf("Frames Rendered: %u\n", stats.framesRendered);
    Serial.printf("Frames Dropped: %u\n", stats.framesDropped);
    Serial.printf("Compressed Frames: %u\n", stats.compressedFrames);
    Serial.printf("Uncompressed Frames: %u\n", stats.uncompressedFrames);
    Serial.printf("Bytes Processed: %u\n", stats.bytesProcessed);
    Serial.printf("Current FPS: %.2f\n", stats.currentFPS);
    Serial.printf("Stream Active: %s\n", stats.streamActive ? "Yes" : "No");
    Serial.printf("Configuration: %dx%d %s (%u bytes)\n",
                  config.frameWidth, config.frameHeight,
                  config.frameFormat.c_str(), config.expectedFrameSize);
    Serial.printf("Auto-Config: %s\n", config.autoConfig ? "Enabled" : "Disabled");
    Serial.println("===============================");
}