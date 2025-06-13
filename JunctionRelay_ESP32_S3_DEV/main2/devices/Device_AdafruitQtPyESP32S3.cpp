#include "Device.h"
#include "Utils.h"

// Make sure we have all required managers included
#if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    #include "Manager_QuadDisplay.h"
    #include "Manager_Charlieplex.h"
#endif

#if DEVICE_HAS_EXTERNAL_NEOPIXELS
    #include "Manager_NeoPixels.h"
#endif

Device_AdafruitQtPyESP32S3::Device_AdafruitQtPyESP32S3(ConnectionManager* connMgr)
: connMgr(connMgr)
{
    #if DEVICE_HAS_ONBOARD_RGB_LED
    onboardPixel = Adafruit_NeoPixel(NUMPIXELS, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);
    #endif

    #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    detectedQuadDisplay = false;
    detectedCharlieDisplay = false;
    i2cInitTaskHandle = NULL;
    quadDisplayTaskHandle = NULL;
    charlieDisplayTaskHandle = NULL;
    #endif

    // Initialize NeoPixel pin defaults
    externalNeoPixelPin1 = DEFAULT_EXTERNAL_PIN_1;
    externalNeoPixelPin2 = DEFAULT_EXTERNAL_PIN_2;
}

// Device-specific setup method called by main.ino
void Device_AdafruitQtPyESP32S3::setupDeviceSpecific() {
    Serial.println("[DEBUG][DEVICE] Device-specific setup complete (no additional setup required)");
}

#if DEVICE_HAS_EXTERNAL_NEOPIXELS
void Device_AdafruitQtPyESP32S3::loadNeoPixelPreferences() {
    Preferences prefs;
    prefs.begin("neopixelConfig", true); // Read-only mode
    
    externalNeoPixelPin1 = prefs.getInt("neoPin1", DEFAULT_EXTERNAL_PIN_1);
    externalNeoPixelPin2 = prefs.getInt("neoPin2", DEFAULT_EXTERNAL_PIN_2);
    
    prefs.end();
    
    Serial.printf("[DEBUG][DEVICE] Loaded NeoPixel preferences: Pin1=%d, Pin2=%d\n", 
                  externalNeoPixelPin1, externalNeoPixelPin2);
}

void Device_AdafruitQtPyESP32S3::saveNeoPixelPreferences() {
    Preferences prefs;
    prefs.begin("neopixelConfig", false); // Read-write mode
    
    prefs.putInt("neoPin1", externalNeoPixelPin1);
    prefs.putInt("neoPin2", externalNeoPixelPin2);
    
    prefs.end();
    
    Serial.printf("[DEBUG][DEVICE] Saved NeoPixel preferences: Pin1=%d, Pin2=%d\n", 
                  externalNeoPixelPin1, externalNeoPixelPin2);
}

int Device_AdafruitQtPyESP32S3::getNeoPixelPin(int index) {
    switch(index) {
        case 0:
            return externalNeoPixelPin1;
        case 1:
            return externalNeoPixelPin2;
        default:
            Serial.printf("[ERROR][DEVICE] Invalid NeoPixel pin index: %d\n", index);
            return externalNeoPixelPin1; // Default to pin 1
    }
}

void Device_AdafruitQtPyESP32S3::setNeoPixelPin(int pin, int index) {
    switch(index) {
        case 0:
            if (externalNeoPixelPin1 != pin) {
                externalNeoPixelPin1 = pin;
                Serial.printf("[DEBUG][DEVICE] NeoPixel Pin 1 updated to: %d\n", pin);
            }
            break;
        case 1:
            if (externalNeoPixelPin2 != pin) {
                externalNeoPixelPin2 = pin;
                Serial.printf("[DEBUG][DEVICE] NeoPixel Pin 2 updated to: %d\n", pin);
            }
            break;
        default:
            Serial.printf("[ERROR][DEVICE] Invalid NeoPixel pin index: %d\n", index);
            break;
    }
}
#endif

bool Device_AdafruitQtPyESP32S3::begin() {
    Serial.println("[DEBUG][DEVICE] Initializing Adafruit QtPy ESP32-S3...");

    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    // Load NeoPixel pin configuration from preferences
    loadNeoPixelPreferences();
    #endif

    #if defined(NEOPIXEL_POWER)
    pinMode(NEOPIXEL_POWER, OUTPUT);
    digitalWrite(NEOPIXEL_POWER, HIGH);
    Serial.println("[DEBUG][DEVICE] NeoPixel power pin enabled");
    #endif

    #if DEVICE_HAS_ONBOARD_RGB_LED
    Serial.println("[DEBUG][DEVICE] Initializing onboard NeoPixel...");
    onboardPixel.begin();
    onboardPixel.setBrightness(20);
    onboardPixel.clear(); 
    onboardPixel.show();
    Serial.println("[DEBUG][DEVICE] Onboard NeoPixel initialized.");
    #endif

    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    Serial.println("[DEBUG][DEVICE] Initializing external NeoPixels manager...");
    Serial.printf("[DEBUG][DEVICE] Creating NeoPixel manager with pin %d, count %d\n", 
                  externalNeoPixelPin1, EXTERNAL_NUMPIXELS);
    
    Manager_NeoPixels* neoManager = Manager_NeoPixels::getInstance(externalNeoPixelPin1, EXTERNAL_NUMPIXELS);
    neoManager->begin(externalNeoPixelPin1, EXTERNAL_NUMPIXELS);
    
    Serial.println("[DEBUG][DEVICE] External NeoPixels manager initialized.");
    
    neoManager->setCM5EffectActive(true);
    neoManager->setCM5Color(0x0000FF);
    Serial.println("[DEBUG][DEVICE] NeoPixel test pattern activated.");
    #endif

    #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    StaticJsonDocument<2048> doc;
    String scanResult = performI2CScan(doc);
    Serial.print("[DEBUG] I2C scan result at boot: ");
    Serial.println(scanResult);
    #endif

    Serial.println("[DEBUG][DEVICE] Adafruit QtPy ESP32-S3 initialization complete.");
    return true;
}

const char* Device_AdafruitQtPyESP32S3::getName() {
    return "Adafruit QtPy ESP32-S3";
}

void Device_AdafruitQtPyESP32S3::setRotation(uint8_t r) {
    Serial.print("[DEBUG][DEVICE] Rotation set to: ");
    Serial.println(r);
}

uint8_t Device_AdafruitQtPyESP32S3::getRotation() {
    return 0;
}

int Device_AdafruitQtPyESP32S3::width() {
    return 0;  
}

int Device_AdafruitQtPyESP32S3::height() {
    return 0;  
}

// Implement I2C interface method
TwoWire* Device_AdafruitQtPyESP32S3::getI2CInterface() {
    return &Wire1;  // QtPy uses Wire1
}

String Device_AdafruitQtPyESP32S3::performI2CScan(StaticJsonDocument<2048>& doc) {
    Serial.println("[DEBUG][I2C] Starting I2C scan...");
    
    // Ensure Wire1 is properly initialized first
    Serial.println("[DEBUG][I2C] Initializing Wire1 interface...");
    Wire1.begin(41, 40);  // QtPy STEMMA QT pins
    Wire1.setClock(400000);
    delay(100);  // Stabilization delay
    
    // Run enhanced scanner with device recognition
    Serial.println("[DEBUG][I2C] Running I2C scan with device recognition...");
    String scanResult = I2CScanner::scanAndConfigureDevices(Wire1, doc, "qtpy");
    Serial.printf("[DEBUG][I2C] Scan result: %s\n", scanResult.c_str());
    
    // Check what was found and initialize accordingly
    bool foundSeesaw = doc["FoundSeesaw"] | false;
    
    // Check for Quad Displays at 0x70, 0x71, 0x72
    bool foundQuadDisplay = false;
    uint8_t quadAddresses[] = {0x70, 0x71, 0x72};
    int quadCount = 0;
    
    Serial.println("[DEBUG][I2C] Checking for Quad displays at addresses 0x70, 0x71, 0x72...");
    for (uint8_t addr : quadAddresses) {
        Wire1.beginTransmission(addr);
        if (Wire1.endTransmission() == 0) {
            Serial.printf("[DEBUG][I2C] Found potential Quad display at 0x%02X\n", addr);
            foundQuadDisplay = true;
            quadCount++;
        }
    }
    
    // Check for Charlieplex displays at 0x74, 0x75, 0x76
    bool foundCharlieplex = false;
    uint8_t charlieAddresses[] = {0x74, 0x75, 0x76};
    int charlieCount = 0;
    
    Serial.println("[DEBUG][I2C] Checking for Charlieplex displays at addresses 0x74, 0x75, 0x76...");
    for (uint8_t addr : charlieAddresses) {
        Wire1.beginTransmission(addr);
        if (Wire1.endTransmission() == 0) {
            Serial.printf("[DEBUG][I2C] Found potential Charlieplex display at 0x%02X\n", addr);
            foundCharlieplex = true;
            charlieCount++;
        }
    }
    
    Serial.printf("[DEBUG][I2C] Scan results: Seesaw=%s, QuadDisplay=%s (%d at 0x70-0x72), Charlieplex=%s (%d at 0x74-0x76)\n", 
                  foundSeesaw ? "YES" : "NO", 
                  foundQuadDisplay ? "YES" : "NO", quadCount,
                  foundCharlieplex ? "YES" : "NO", charlieCount);
    
    // Initialize Quad Displays using singleton manager (ONLY for 0x70, 0x71, 0x72)
    if (foundQuadDisplay) {
        Serial.println("[DEBUG][I2C] Setting up Quad Display manager...");
        
        // Get the singleton manager instance
        Manager_QuadDisplay* quadManager = Manager_QuadDisplay::getInstance(&Wire1);
        
        // Add ONLY the detected quad displays (0x70, 0x71, 0x72)
        for (uint8_t addr : quadAddresses) {
            Wire1.beginTransmission(addr);
            if (Wire1.endTransmission() == 0) {
                Serial.printf("[DEBUG][I2C] Adding Quad Display at address 0x%02X to manager\n", addr);
                quadManager->addDisplay(addr);
            }
        }
        
        // Create single task for the quad display manager - NO update() calls needed
        xTaskCreatePinnedToCore(
            [](void* param) {
                Manager_QuadDisplay* manager = static_cast<Manager_QuadDisplay*>(param);
                Serial.println("[QuadDisplayTask] Starting singleton manager task");
                
                // Initialize all displays
                manager->begin();
                
                // Keep task alive and handle scrolling updates
                while (true) {
                    manager->update();  // For scrolling text only
                    vTaskDelay(pdMS_TO_TICKS(50));  // Check scrolling every 50ms
                }
            },
            "QuadDisplayTask",
            4096,
            quadManager,
            1,
            &quadDisplayTaskHandle,
            1
        );
        
        if (quadDisplayTaskHandle == NULL) {
            Serial.println("[ERROR] Failed to create QuadDisplay manager task");
        } else {
            Serial.printf("[DEBUG][I2C] Created QuadDisplay manager task for %d displays\n", 
                         quadManager->getDisplayAddresses().size());
        }
        
        detectedQuadDisplay = true;
    }
    
    // Initialize Charlieplex displays using singleton manager (ONLY for 0x74, 0x75, 0x76)
    if (foundCharlieplex) {
        Serial.println("[DEBUG][I2C] Setting up Charlieplex Display manager...");
        
        // Get the singleton manager instance
        Manager_Charlieplex* charlieManager = Manager_Charlieplex::getInstance(&Wire1);
        
        // Add ONLY the detected Charlieplex displays (0x74, 0x75, 0x76)
        for (uint8_t addr : charlieAddresses) {
            Wire1.beginTransmission(addr);
            if (Wire1.endTransmission() == 0) {
                Serial.printf("[DEBUG][I2C] Adding Charlieplex Display at address 0x%02X to manager\n", addr);
                charlieManager->addDisplay(addr);
            }
        }
        
        // Create single task for the Charlieplex display manager - NO update() calls needed
        xTaskCreatePinnedToCore(
            [](void* param) {
                Manager_Charlieplex* manager = static_cast<Manager_Charlieplex*>(param);
                Serial.println("[CharlieDisplayTask] Starting singleton manager task");
                
                // Initialize all displays
                manager->begin();
                
                // Keep task alive and handle scrolling updates
                while (true) {
                    manager->update();  // For scrolling text only
                    vTaskDelay(pdMS_TO_TICKS(50));  // Check scrolling every 50ms
                }
            },
            "CharlieDisplayTask",
            4096,
            charlieManager,
            1,
            &charlieDisplayTaskHandle,
            1
        );
        
        if (charlieDisplayTaskHandle == NULL) {
            Serial.println("[ERROR] Failed to create Charlieplex manager task");
        } else {
            Serial.printf("[DEBUG][I2C] Created Charlieplex manager task for %d displays\n", 
                         charlieManager->getDisplayAddresses().size());
        }
        
        detectedCharlieDisplay = true;
    }
    
    // Seesaw initialization (unchanged)
    if (foundSeesaw) {
        Serial.println("[DEBUG][I2C] Seesaw found, initializing shared I2C manager...");
        
        xTaskCreatePinnedToCore(
            [](void* param) {
                ConnectionManager* cm = static_cast<ConnectionManager*>(param);
                Serial.printf("[I2CInitTask] Running on core %d\n", xPortGetCoreID());
                
                Manager_I2C* i2cManager = Manager_I2C::getInstance(cm, &Wire1);
                if (i2cManager) {
                    i2cManager->begin();
                    Serial.println("[I2CInitTask] Shared I2C Manager initialization complete");
                } else {
                    Serial.println("[ERROR][I2CInitTask] Failed to get I2C Manager instance");
                }
                
                vTaskDelete(NULL);
            },
            "I2CInitTask",
            4096,
            connMgr,
            1,
            &i2cInitTaskHandle,
            1
        );
        
        if (i2cInitTaskHandle == NULL) {
            Serial.println("[ERROR] Failed to create I2C Init task on core 1");
        } else {
            Serial.println("[DEBUG][I2C] Shared I2C Manager initialization queued on Core 1");
        }
    }
    
    // Clean up temporary flags
    doc.remove("FoundSeesaw");
    doc.remove("FoundQuadDisplay");
    
    return scanResult;
}