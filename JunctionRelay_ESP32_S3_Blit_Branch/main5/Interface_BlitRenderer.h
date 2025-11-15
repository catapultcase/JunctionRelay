#ifndef INTERFACE_BLIT_RENDERER_H
#define INTERFACE_BLIT_RENDERER_H

#include <Arduino.h>

// Forward declaration
class DeviceConfig;

// Interface for device-specific blit rendering implementations
class IBlitRenderer {
public:
    virtual ~IBlitRenderer() {}

    // Initialize the renderer with device and display pointer
    virtual bool init(DeviceConfig* device, void* displayPtr) = 0;

    // Render RGB565 frame data to the display
    // Returns true if rendering succeeded, false otherwise
    virtual bool render(uint8_t* frameData, size_t frameSize, int frameWidth, int frameHeight) = 0;

    // Get expected frame dimensions for this renderer
    // Returns the width and height that incoming frames should match
    virtual void getFrameDimensions(int& width, int& height) const = 0;

    // Get renderer name for debugging
    virtual const char* getRendererName() const = 0;
};

#endif // INTERFACE_BLIT_RENDERER_H
