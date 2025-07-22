#include "Device.h"
#include "Utils.h"
#include "Manager_Matrix.h"

// Define the RGBMatrix pins here (only in one file to avoid multiple definitions)
uint8_t rgbPins[]  = {42, 41, 40, 38, 39, 37}; // RGB channels (Red, Green, Blue)
uint8_t addrPins[] = {45, 36, 48, 35, 21};     // Address pins
uint8_t clockPin   = 2;                        // Clock pin
uint8_t latchPin   = 47;                       // Latch pin
uint8_t oePin      = 14;                       // Output enable pin

Device_AdafruitMatrixESP32S3::Device_AdafruitMatrixESP32S3(Manager_Connections* connMgr)
: connMgr(connMgr) {
    // Store the connection manager reference for future use
}

// Device-specific setup method called by main.ino
void Device_AdafruitMatrixESP32S3::setupDeviceSpecific() {
    Serial.println("[DEVICE] Device-specific setup complete (no additional setup required)");
}

// NEW: Main hardware detection method
HardwareInventory Device_AdafruitMatrixESP32S3::detectHardware() {
    Serial.println("[DEVICE] Detecting hardware for Adafruit Matrix ESP32-S3...");
    
    HardwareInventory inventory;
    
    // Matrix is always present on this device type - no detection needed
    Serial.println("[DEVICE] External matrix detected (hardwired configuration)");
    
    // No I2C devices on Matrix device (DEVICE_HAS_EXTERNAL_I2C_DEVICES = 0)
    // No NeoPixels on Matrix device (DEVICE_HAS_EXTERNAL_NEOPIXELS = 0)

    Serial.printf("[DEVICE] Hardware detection complete: Matrix=%s, %d NeoPixel strips, %d I2C devices\n",
                  inventory.hasExternalMatrix ? "Yes" : "No",
                  inventory.neopixelPins.size(), 
                  inventory.i2cDevices.size());
    
    return inventory;
}

const char* Device_AdafruitMatrixESP32S3::getName() {
    return "Adafruit Matrix ESP32-S3";
}

void Device_AdafruitMatrixESP32S3::setRotation(uint8_t rotation) {
    Serial.printf("[DEVICE] Rotation set to: %d\n", rotation);
}

uint8_t Device_AdafruitMatrixESP32S3::getRotation() {
    return 0;
}

int Device_AdafruitMatrixESP32S3::width() {
    return MATRIX_WIDTH;
}

int Device_AdafruitMatrixESP32S3::height() {
    return MATRIX_HEIGHT;
}

// Implement I2C interface method (required by DeviceConfig base class)
TwoWire* Device_AdafruitMatrixESP32S3::getI2CInterface() {
    return &Wire;  // Return default Wire even though Matrix doesn't use I2C
}

// Legacy test method - can be removed later
void Device_AdafruitMatrixESP32S3::testText(const char* text) {
    Manager_Matrix* matrixManager = Manager_Matrix::getInstance();
    if (matrixManager) {
        matrixManager->clearDisplay();
        matrixManager->displayText(text, 0, 0);
    } else {
        Serial.println("[ERROR][MATRIX] Manager not initialized in testText");
    }
}

// Matrix pin accessor methods
uint8_t* Device_AdafruitMatrixESP32S3::getRGBPins() const {
    return rgbPins;
}

uint8_t* Device_AdafruitMatrixESP32S3::getAddrPins() const {
    return addrPins;
}

uint8_t Device_AdafruitMatrixESP32S3::getClockPin() const {
    return clockPin;
}

uint8_t Device_AdafruitMatrixESP32S3::getLatchPin() const {
    return latchPin;
}

uint8_t Device_AdafruitMatrixESP32S3::getOEPin() const {
    return oePin;
}