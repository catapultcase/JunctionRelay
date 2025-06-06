#ifndef DEVICE_ADAFRUIT_QT_PY_ESP32S3_H
#define DEVICE_ADAFRUIT_QT_PY_ESP32S3_H

#include "DeviceConfig.h"
#include <Adafruit_NeoPixel.h>
#include "Manager_NeoPixels.h" 

// Define capabilities for this device
#define DEVICE_HAS_SCREEN      0 
#define DEVICE_HAS_ONBOARD_LED 0 
#define DEVICE_HAS_ONBOARD_RGB_LED  0
#define DEVICE_HAS_EXTERNAL_NEOPIXELS 1 
#define DEVICE_HAS_EXTERNAL_ROTARY_ENCODER 0 
#define DEVICE_HAS_TOUCH       0 
#define DEVICE_HAS_BUTTONS     0
#define DEVICE_HAS_BATTERY     0
#define DEVICE_SUPPORTS_WIFI   1
#define DEVICE_SUPPORTS_ESPNOW 1
#define DEVICE_SUPPORTS_BLE    0
#define DEVICE_HAS_SPEAKER     0
#define DEVICE_HAS_MICROSD     0
#define DEVICE_SUPPORTS_USB    0


// Only define the pin if the device has an onboard RGB LED
#if DEVICE_HAS_ONBOARD_RGB_LED
    #define PIN_NEOPIXEL 39 // Default pin for onboard NeoPixel
    #define NUMPIXELS 1
#endif

// External NeoPixel settings (only if external NeoPixels are enabled)
#if DEVICE_HAS_EXTERNAL_NEOPIXELS
    #define EXTERNAL_PIN A3
    #define EXTERNAL_NUMPIXELS 128  // External NeoPixel size
#endif

class Device_AdafruitQtPyESP32S3 : public DeviceConfig {
public:
    Device_AdafruitQtPyESP32S3();  // Constructor

    bool begin();  
    const char* getName();  

    void setRotation(uint8_t rotation);  
    uint8_t getRotation();  
    int width(); 
    int height(); 

    void setLEDRed();
    void setLEDGreen();
    void setLEDBlue();
    void setExternalLEDRed();
    void setExternalLEDGreen();
    void setExternalLEDBlue();

private:
    // Onboard NeoPixel for built-in RGB LED
    #if DEVICE_HAS_ONBOARD_RGB_LED
    Adafruit_NeoPixel onboardPixel;
    #endif

public:
    // External NeoPixel manager
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    Manager_NeoPixels* neoPixelManager;  // Pointer for external NeoPixel manager
    #endif

};

#endif // DEVICE_ADAFRUIT_QT_PY_ESP32S3_H
