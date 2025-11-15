#ifndef DISPLAY_MANAGER_BLIT_MATRIX_H
#define DISPLAY_MANAGER_BLIT_MATRIX_H

#include "Interface_BlitRenderer.h"
#include "DeviceConfig.h"

// Forward declaration
class Adafruit_Protomatter;

// Blit renderer for RGB Matrix displays using Adafruit_Protomatter
class Display_Manager_Blit_Matrix : public IBlitRenderer {
public:
    Display_Manager_Blit_Matrix();
    ~Display_Manager_Blit_Matrix();

    bool init(DeviceConfig* device, void* displayPtr) override;
    bool render(uint8_t* frameData, size_t frameSize, int frameWidth, int frameHeight) override;
    void getFrameDimensions(int& width, int& height) const override;
    const char* getRendererName() const override;

private:
    DeviceConfig* device;
    Adafruit_Protomatter* matrix;
    bool initialized;
    bool swapBlueGreen;  // Swap B/G channels when rendering

    // Expected blit frame dimensions (64x32 RGB Matrix)
    static const int BLIT_FRAME_WIDTH = 64;
    static const int BLIT_FRAME_HEIGHT = 32;
};

#endif // DISPLAY_MANAGER_BLIT_MATRIX_H
