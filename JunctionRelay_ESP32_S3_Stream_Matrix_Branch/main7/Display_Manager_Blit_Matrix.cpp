#include "Display_Manager_Blit_Matrix.h"
#include "Device.h"

// Only compile this renderer for Matrix devices
#if defined(DEVICE_ADAFRUIT_MATRIX_ESP32S3)

#include <Adafruit_Protomatter.h>
#include "Manager_Matrix.h"
#include "Helper_Preferences.h"

// External reference to global preferences helper
extern Helper_Preferences prefsHelper;

Display_Manager_Blit_Matrix::Display_Manager_Blit_Matrix()
    : device(nullptr)
    , matrix(nullptr)
    , initialized(false)
    , swapBlueGreen(false)
{
}

Display_Manager_Blit_Matrix::~Display_Manager_Blit_Matrix() {
}

bool Display_Manager_Blit_Matrix::init(DeviceConfig* device, void* displayPtr) {
    this->device = device;

    if (!device->hasExternalMatrix()) {
        Serial.println("[BLIT_MATRIX] ERROR: Device does not have external matrix");
        return false;
    }

    // Get matrix instance from Manager_Matrix singleton
    Manager_Matrix* matrixManager = Manager_Matrix::getInstance();
    if (!matrixManager) {
        Serial.println("[BLIT_MATRIX] ERROR: Manager_Matrix singleton not available");
        return false;
    }

    // Get the matrix pointer from Manager_Matrix
    this->matrix = matrixManager->getMatrix();
    if (!this->matrix) {
        Serial.println("[BLIT_MATRIX] ERROR: Matrix not initialized in Manager_Matrix");
        return false;
    }

    // Load B/G channel swap preference directly from NVS
    swapBlueGreen = prefsHelper.getSwapBlueGreen();
    Serial.printf("[BLIT_MATRIX] B/G channel swap: %s\n", swapBlueGreen ? "enabled" : "disabled");

    initialized = true;
    Serial.println("[BLIT_MATRIX] Initialized for RGB Matrix (64x32)");
    return true;
}

bool Display_Manager_Blit_Matrix::render(uint8_t* frameData, size_t frameSize, int frameWidth, int frameHeight) {
    if (!initialized || !matrix || !frameData) {
        Serial.println("[BLIT_MATRIX] ERROR: Cannot render - not initialized");
        return false;
    }

    // Determine render dimensions (don't exceed matrix size)
    int renderWidth = min(frameWidth, BLIT_FRAME_WIDTH);
    int renderHeight = min(frameHeight, BLIT_FRAME_HEIGHT);

    // Render frame pixel by pixel
    // Note: Protomatter uses internal DMA buffering - drawPixel writes to off-screen buffer
    for (int y = 0; y < renderHeight; y++) {
        for (int x = 0; x < renderWidth; x++) {
            // Calculate source pixel index
            int srcIndex = (y * frameWidth + x) * 2;

            if (srcIndex + 1 < frameSize) {
                // Read RGB565 pixel (little endian)
                uint16_t pixel565 = frameData[srcIndex] | (frameData[srcIndex + 1] << 8);

                // Apply B/G channel swap if enabled
                if (swapBlueGreen) {
                    // Extract RGB565 components
                    // RGB565 format: RRRRR GGGGGG BBBBB
                    uint8_t r = (pixel565 >> 11) & 0x1F;  // 5 bits red
                    uint8_t g = (pixel565 >> 5) & 0x3F;   // 6 bits green
                    uint8_t b = pixel565 & 0x1F;          // 5 bits blue

                    // Rebuild as RBG565 (swap B and G positions)
                    pixel565 = (r << 11) | (b << 5) | g;
                }

                // Set pixel on matrix (writes to DMA buffer)
                matrix->drawPixel(x, y, pixel565);
            }
        }
    }

    // Update display - Protomatter swaps DMA buffers internally (flicker-free)
    matrix->show();

    return true;
}

void Display_Manager_Blit_Matrix::getFrameDimensions(int& width, int& height) const {
    width = BLIT_FRAME_WIDTH;   // 64 pixels wide
    height = BLIT_FRAME_HEIGHT; // 32 pixels tall
}

const char* Display_Manager_Blit_Matrix::getRendererName() const {
    return "Protomatter_Matrix";
}

#endif // DEVICE_ADAFRUIT_MATRIX_ESP32S3
