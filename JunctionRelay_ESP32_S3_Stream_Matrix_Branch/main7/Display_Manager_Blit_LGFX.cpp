#include "Display_Manager_Blit_LGFX.h"
#include "Device.h"

// Only compile this renderer for CrowPanel devices
#if defined(DEVICE_CROWPANEL5) || defined(DEVICE_CROWPANEL7)

#include <LovyanGFX.hpp>

Display_Manager_Blit_LGFX::Display_Manager_Blit_LGFX()
    : device(nullptr)
    , lgfxDisplay(nullptr)
    , initialized(false)
{
}

Display_Manager_Blit_LGFX::~Display_Manager_Blit_LGFX() {
}

bool Display_Manager_Blit_LGFX::init(DeviceConfig* device, void* displayPtr) {
    this->device = device;
    this->lgfxDisplay = static_cast<lgfx::LGFX_Device*>(displayPtr);

    if (!lgfxDisplay) {
        Serial.println("[BLIT_LGFX] ERROR: Invalid display pointer");
        return false;
    }

    // Verify device is CrowPanel
    const char* deviceModel = device->getDeviceModel();
    bool isCrowPanel5 = (strcmp(deviceModel, "CrowPanel5 5-inch") == 0);
    bool isCrowPanel7 = (strcmp(deviceModel, "CrowPanel7 7-inch") == 0);

    if (!isCrowPanel5 && !isCrowPanel7) {
        Serial.printf("[BLIT_LGFX] ERROR: Unsupported device: %s\n", deviceModel);
        return false;
    }

    initialized = true;
    Serial.printf("[BLIT_LGFX] Initialized for %s\n", deviceModel);
    return true;
}

bool Display_Manager_Blit_LGFX::render(uint8_t* frameData, size_t frameSize, int frameWidth, int frameHeight) {
    if (!initialized || !lgfxDisplay || !frameData) {
        Serial.println("[BLIT_LGFX] ERROR: Cannot render - not initialized");
        return false;
    }

    // Determine render dimensions (don't exceed display size)
    int renderWidth = min(frameWidth, device->width());
    int renderHeight = min(frameHeight, device->height());

    // Render RGB565 frame directly using LGFX DMA
    lgfxDisplay->pushImageDMA(0, 0, renderWidth, renderHeight,
                             reinterpret_cast<const lgfx::rgb565_t*>(frameData));

    return true;
}

void Display_Manager_Blit_LGFX::getFrameDimensions(int& width, int& height) const {
    // Query dimensions from device (CrowPanel 5: 800x480, CrowPanel 7: 1024x600)
    width = device ? device->width() : 800;
    height = device ? device->height() : 480;
}

const char* Display_Manager_Blit_LGFX::getRendererName() const {
    return "LGFX_CrowPanel";
}

#endif // DEVICE_CROWPANEL5 || DEVICE_CROWPANEL7
