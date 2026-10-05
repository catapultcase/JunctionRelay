#ifndef DISPLAY_MANAGER_BLIT_LGFX_H
#define DISPLAY_MANAGER_BLIT_LGFX_H

#include "Interface_BlitRenderer.h"
#include "DeviceConfig.h"

// Forward declaration
namespace lgfx {
    class LGFX_Device;
}

// Blit renderer for CrowPanel devices using LovyanGFX
class Display_Manager_Blit_LGFX : public IBlitRenderer {
public:
    Display_Manager_Blit_LGFX();
    ~Display_Manager_Blit_LGFX();

    bool init(DeviceConfig* device, void* displayPtr) override;
    bool render(uint8_t* frameData, size_t frameSize, int frameWidth, int frameHeight) override;
    void getFrameDimensions(int& width, int& height) const override;
    const char* getRendererName() const override;

private:
    DeviceConfig* device;
    lgfx::LGFX_Device* lgfxDisplay;
    bool initialized;
};

#endif // DISPLAY_MANAGER_BLIT_LGFX_H
