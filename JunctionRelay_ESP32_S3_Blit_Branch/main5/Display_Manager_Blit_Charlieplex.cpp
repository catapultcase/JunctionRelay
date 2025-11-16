#include "Display_Manager_Blit_Charlieplex.h"
#include "Device.h"

// Compile this renderer for any device that might have I2C CharliePlex displays
#if defined(DEVICE_ADAFRUIT_FEATHER_ESP32S3) || defined(DEVICE_ADAFRUIT_QTPY_ESP32S3) || defined(DEVICE_SILICOGNITION_WESP32)

#include <Adafruit_IS31FL3731.h>
#include "Manager_Charlieplex.h"

Display_Manager_Blit_Charlieplex::Display_Manager_Blit_Charlieplex()
    : device(nullptr)
    , charlieplex(nullptr)
    , initialized(false)
    , currentFrame(0)
{
}

Display_Manager_Blit_Charlieplex::~Display_Manager_Blit_Charlieplex() {
    // Disable blit mode to resume scrolling text
    if (initialized) {
        Manager_Charlieplex* charlieManager = Manager_Charlieplex::getInstance();
        if (charlieManager) {
            charlieManager->setBlitMode(false);
        }
    }
}

bool Display_Manager_Blit_Charlieplex::init(DeviceConfig* device, void* displayPtr) {
    this->device = device;

    if (!device->hasExternalI2CDevices()) {
        Serial.println("[BLIT_CHARLIE] ERROR: Device does not have external I2C devices");
        return false;
    }

    // Get charlieplex instance from Manager_Charlieplex singleton
    Manager_Charlieplex* charlieManager = Manager_Charlieplex::getInstance();
    if (!charlieManager) {
        Serial.println("[BLIT_CHARLIE] ERROR: Manager_Charlieplex singleton not available");
        return false;
    }

    // Get the first available display (default address 0x74)
    // Note: For multi-display support, we'd use routing field to select which display
    std::vector<uint8_t> addresses = charlieManager->getDisplayAddresses();
    if (addresses.empty()) {
        Serial.println("[BLIT_CHARLIE] ERROR: No CharliePlex displays found");
        return false;
    }

    // Use the first display for now (typically 0x74)
    this->charlieplex = charlieManager->getDisplay(addresses[0]);
    if (!this->charlieplex) {
        Serial.printf("[BLIT_CHARLIE] ERROR: Failed to get display at address 0x%02X\n", addresses[0]);
        return false;
    }

    // Enable blit mode to pause scrolling text updates
    charlieManager->setBlitMode(true);

    initialized = true;
    Serial.printf("[BLIT_CHARLIE] Initialized for CharliePlex (16x9) at address 0x%02X\n", addresses[0]);
    return true;
}

bool Display_Manager_Blit_Charlieplex::render(uint8_t* frameData, size_t frameSize, int frameWidth, int frameHeight) {
    if (!initialized || !charlieplex || !frameData) {
        Serial.println("[BLIT_CHARLIE] ERROR: Cannot render - not initialized");
        return false;
    }

    // Double buffering: render to off-screen buffer (alternating between 0 and 1)
    uint8_t nextFrame = 1 - currentFrame;
    charlieplex->setFrame(nextFrame);
    charlieplex->clear();

    // Process each pixel in the portrait frame
    for (int frameY = 0; frameY < FRAME_HEIGHT; frameY++) {
        for (int frameX = 0; frameX < FRAME_WIDTH; frameX++) {
            // Calculate pixel index in RGB565 data (2 bytes per pixel)
            int pixelIndex = (frameY * FRAME_WIDTH + frameX) * 2;

            if (pixelIndex + 1 < frameSize) {
                // Read RGB565 pixel (little endian)
                uint16_t pixel565 = frameData[pixelIndex] | (frameData[pixelIndex + 1] << 8);

                // Convert to grayscale brightness
                uint8_t brightness = rgb565ToGrayscale(pixel565);

                // Only draw visible pixels (threshold to avoid noise)
                if (brightness > 10) {
                    // Rotate portrait coordinates to landscape display coordinates
                    int displayX, displayY;
                    rotatePortraitToLandscape(frameX, frameY, displayX, displayY);

                    // Ensure coordinates are within display bounds
                    if (displayX >= 0 && displayX < DISPLAY_WIDTH &&
                        displayY >= 0 && displayY < DISPLAY_HEIGHT) {
                        charlieplex->drawPixel(displayX, displayY, brightness);
                    }
                }
            }
        }
    }

    // Display the completed frame (flicker-free swap)
    charlieplex->displayFrame(nextFrame);
    currentFrame = nextFrame;

    return true;
}

void Display_Manager_Blit_Charlieplex::rotatePortraitToLandscape(int frameX, int frameY, int& displayX, int& displayY) {
    // Rotate 90° clockwise: (x,y) -> (frameHeight-1-y, x)
    displayX = (FRAME_HEIGHT - 1) - frameY;  // frameY becomes displayX (inverted)
    displayY = frameX;                       // frameX becomes displayY
}

uint8_t Display_Manager_Blit_Charlieplex::rgb565ToGrayscale(uint16_t pixel565) {
    // Convert RGB565 to RGB components
    uint8_t r = (pixel565 >> 11) << 3;        // 5 bits -> 8 bits
    uint8_t g = ((pixel565 >> 5) & 0x3F) << 2; // 6 bits -> 8 bits
    uint8_t b = (pixel565 & 0x1F) << 3;       // 5 bits -> 8 bits

    // Calculate grayscale brightness using luminance formula
    // Weights: R=0.299, G=0.587, B=0.114 (standard ITU-R BT.601 coefficients)
    // Multiplied by 256 for integer math: 77, 151, 28
    uint8_t brightness = (r * 77 + g * 151 + b * 28) >> 8;

    return brightness;
}

void Display_Manager_Blit_Charlieplex::getFrameDimensions(int& width, int& height) const {
    width = FRAME_WIDTH;   // 9 pixels wide (portrait)
    height = FRAME_HEIGHT; // 16 pixels tall (portrait)
}

const char* Display_Manager_Blit_Charlieplex::getRendererName() const {
    return "IS31FL3731_Charlieplex";
}

#endif // DEVICE_ADAFRUIT_FEATHER_ESP32S3 || DEVICE_ADAFRUIT_QTPY_ESP32S3 || DEVICE_SILICOGNITION_WESP32
