#ifndef DISPLAY_MANAGER_BLIT_H
#define DISPLAY_MANAGER_BLIT_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include "DeviceConfig.h"
#include "Interface_ScreenDestination.h"
#include "Helper_Decompression.h"

class Display_Manager_Blit : public ScreenDestination {
public:
    Display_Manager_Blit(DeviceConfig* device);
    ~Display_Manager_Blit();
    
    // Initialize the blit manager
    bool init();
    
    // Check if blit manager is ready
    bool isReady() const { return initialized; }
    
    // ScreenDestination interface implementation
    String getScreenId() const override;
    void applyConfig(const JsonDocument& configDoc) override;
    void updateSensorData(const JsonDocument& sensorDoc) override;
    bool matchesScreenId(const String& screenId, const JsonDocument& doc) const override;
    const char* getConfigKey() const override;
    
    // Blit-specific statistics
    struct BlitStats {
        uint32_t framesReceived = 0;
        uint32_t framesRendered = 0;
        uint32_t framesDropped = 0;
        uint32_t compressedFrames = 0;
        uint32_t uncompressedFrames = 0;
        uint32_t bytesProcessed = 0;
        float currentFPS = 0.0;
        unsigned long lastFrameTime = 0;
        bool streamActive = false;
    };
    
    BlitStats getStats() const { return stats; }
    void printStats() const;

private:
    DeviceConfig* device;
    void* displayPtr;  // Generic display pointer
    Helper_Decompression* decompressor;
    bool initialized;
    
    // Blit configuration
    struct BlitConfig {
        int frameWidth = 800;
        int frameHeight = 480;
        size_t expectedFrameSize = 768000; // 800x480x2
        String frameFormat = "RGB565";
        bool autoConfig = true;
        bool streamActive = false;
    } config;
    
    BlitStats stats;
    
    // Frame processing methods
    void processBlitFrame(const JsonDocument& frameDoc);
    void renderRGB565Frame(uint8_t* frameData, size_t frameSize);
    void autoConfigureFromFrame(size_t frameSize, bool wasCompressed);
    bool validateFrameSize(size_t frameSize) const;
    void updateFPS();
    
    // Configuration methods
    void handleBlitConfig(const JsonDocument& configDoc);
    void resetStats();
    
    // Utility methods
    size_t calculateExpectedFrameSize(int width, int height) const;
    void logFrameInfo(size_t frameSize, bool compressed) const;
    
    // Device-specific rendering helpers
    bool renderWithLGFX(uint8_t* frameData, size_t frameSize);
    bool renderGeneric(uint8_t* frameData, size_t frameSize);
};

#endif // DISPLAY_MANAGER_BLIT_H