#ifndef DISPLAY_MANAGER_BLIT_CHARLIEPLEX_H
#define DISPLAY_MANAGER_BLIT_CHARLIEPLEX_H

#include "Interface_BlitRenderer.h"
#include "DeviceConfig.h"

// Forward declaration
class Adafruit_IS31FL3731;

// Blit renderer for CharliePlex displays using Adafruit_IS31FL3731
class Display_Manager_Blit_Charlieplex : public IBlitRenderer {
public:
    Display_Manager_Blit_Charlieplex();
    ~Display_Manager_Blit_Charlieplex();

    bool init(DeviceConfig* device, void* displayPtr) override;
    bool render(uint8_t* frameData, size_t frameSize, int frameWidth, int frameHeight) override;
    void getFrameDimensions(int& width, int& height) const override;
    const char* getRendererName() const override;

private:
    DeviceConfig* device;
    Adafruit_IS31FL3731* charlieplex;
    bool initialized;

    // CharliePlex display dimensions
    static const int DISPLAY_WIDTH = 16;
    static const int DISPLAY_HEIGHT = 9;

    // Expected frame dimensions (portrait orientation)
    static const int FRAME_WIDTH = 9;
    static const int FRAME_HEIGHT = 16;

    uint8_t currentFrame;  // Double buffering: alternates between 0 and 1

    // Helper methods
    void rotatePortraitToLandscape(int frameX, int frameY, int& displayX, int& displayY);
    uint8_t rgb565ToGrayscale(uint16_t pixel565);
};

#endif // DISPLAY_MANAGER_BLIT_CHARLIEPLEX_H
