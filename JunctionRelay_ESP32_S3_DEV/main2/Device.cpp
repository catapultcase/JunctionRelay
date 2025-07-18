#include "Device.h"
#include "Utils.h"
#include "Manager_I2C.h"
#include "I2CScanner.h"

// Make sure we have all required managers included
#if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    #include "Manager_QuadDisplay.h"
    #include "Manager_Charlieplex.h"
#endif

Device_AdafruitFeatherESP32S3::Device_AdafruitFeatherESP32S3(ConnectionManager* connMgr)
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
}

// Device-specific setup method called by main.ino
void Device_AdafruitFeatherESP32S3::setupDeviceSpecific() {
    Serial.println("[DEBUG][DEVICE] Device-specific setup complete (no additional setup required)");
}

bool Device_AdafruitFeatherESP32S3::begin() {
    Serial.println("[DEBUG][DEVICE] Initializing Adafruit Feather ESP32-S3...");

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

    #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    StaticJsonDocument<2048> doc;
    String scanResult = performI2CScan(doc);
    Serial.print("[DEBUG] I2C scan result at boot: ");
    Serial.println(scanResult);
    #endif

    Serial.println("[DEBUG][DEVICE] Adafruit Feather ESP32-S3 initialization complete.");
    return true;
}

const char* Device_AdafruitFeatherESP32S3::getName() {
    return "Adafruit Feather ESP32-S3";
}

void Device_AdafruitFeatherESP32S3::setRotation(uint8_t r) {
    Serial.print("[DEBUG][DEVICE] Rotation set to: ");
    Serial.println(r);
}

uint8_t Device_AdafruitFeatherESP32S3::getRotation() {
    return 0;
}

int Device_AdafruitFeatherESP32S3::width() {
    return 0;  
}

int Device_AdafruitFeatherESP32S3::height() {
    return 0;  
}

// Implement I2C interface method
TwoWire* Device_AdafruitFeatherESP32S3::getI2CInterface() {
    return &Wire;  // Feather uses Wire
}

String Device_AdafruitFeatherESP32S3::performI2CScan(StaticJsonDocument<2048>& doc) {
    Serial.println("[DEBUG][I2C] Starting I2C scan...");
    
    // Ensure Wire is properly initialized first
    Serial.println("[DEBUG][I2C] Initializing Wire interface...");
    Wire.begin();  // Feather uses default Wire pins
    Wire.setClock(400000);
    delay(100);  // Stabilization delay
    
    // Run enhanced scanner with device recognition
    Serial.println("[DEBUG][I2C] Running I2C scan with device recognition...");
    String scanResult = I2CScanner::scanAndConfigureDevices(Wire, doc, "feather");
    Serial.printf("[DEBUG][I2C] Scan result: %s\n", scanResult.c_str());
    
    // Check what was found and initialize accordingly
    bool foundSeesaw = doc["FoundSeesaw"] | false;
    
    // Check for Quad Displays at 0x70, 0x71, 0x72 (correct range)
    bool foundQuadDisplay = false;
    uint8_t quadAddresses[] = {0x70, 0x71, 0x72};
    int quadCount = 0;
    
    Serial.println("[DEBUG][I2C] Checking for Quad displays at addresses 0x70, 0x71, 0x72...");
    for (uint8_t addr : quadAddresses) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
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
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
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
        Manager_QuadDisplay* quadManager = Manager_QuadDisplay::getInstance(&Wire);
        
        // Add ONLY the detected quad displays (0x70, 0x71, 0x72)
        for (uint8_t addr : quadAddresses) {
            Wire.beginTransmission(addr);
            if (Wire.endTransmission() == 0) {
                Serial.printf("[DEBUG][I2C] Adding Quad Display at address 0x%02X to manager\n", addr);
                quadManager->addDisplay(addr);
            }
        }
        
        // Create single task for the quad display manager - handles scrolling updates
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
        Manager_Charlieplex* charlieManager = Manager_Charlieplex::getInstance(&Wire);
        
        // Add ONLY the detected Charlieplex displays (0x74, 0x75, 0x76)
        for (uint8_t addr : charlieAddresses) {
            Wire.beginTransmission(addr);
            if (Wire.endTransmission() == 0) {
                Serial.printf("[DEBUG][I2C] Adding Charlieplex Display at address 0x%02X to manager\n", addr);
                charlieManager->addDisplay(addr);
            }
        }
        
        // Create single task for the Charlieplex display manager
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
                
                Manager_I2C* i2cManager = Manager_I2C::getInstance(cm, &Wire);
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