#include "Device_AdafruitQtPyESP32S3.h"
#include "Utils.h"

// Make sure we have all required managers included
#if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    #include "Manager_QuadDisplay.h"
#endif

#if DEVICE_HAS_EXTERNAL_NEOPIXELS
    #include "Manager_NeoPixels.h"
#endif

// Static task handle for QuadDisplay
#if DEVICE_HAS_EXTERNAL_I2C_DEVICES
TaskHandle_t Device_AdafruitQtPyESP32S3::quadDisplayTaskHandle = NULL;
#endif

Device_AdafruitQtPyESP32S3::Device_AdafruitQtPyESP32S3(ConnectionManager* connMgr)
: connMgr(connMgr)
{
    #if DEVICE_HAS_ONBOARD_RGB_LED
    onboardPixel = Adafruit_NeoPixel(NUMPIXELS, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);
    #endif

    #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    detectedQuadDisplay = false;
    i2cInitTaskHandle = NULL;
    #endif

    // Initialize NeoPixel pin defaults
    externalNeoPixelPin1 = DEFAULT_EXTERNAL_PIN_1;
    externalNeoPixelPin2 = DEFAULT_EXTERNAL_PIN_2;
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

#if DEVICE_HAS_EXTERNAL_I2C_DEVICES
void Device_AdafruitQtPyESP32S3::quadDisplayTask(void* parameter) {
    Serial.println("[MANAGER_QUADDISPLAY][INFO] Task started on core 1");
    
    uint8_t i2cAddress = *((uint8_t*)parameter);
    free(parameter);
    
    Wire1.setClock(400000);  // Maximum I2C speed: 400kHz
    
    Manager_QuadDisplay* quadDisplay = Manager_QuadDisplay::getInstance(i2cAddress);
    quadDisplay->begin();
    
    Serial.printf("[MANAGER_QUADDISPLAY][INFO] Initialized on core 1 with address 0x%02X\n", i2cAddress);
    
    uint32_t lastMemoryCheck = 0;
    const uint32_t memoryCheckInterval = 30000;
    
    while (true) {
        uint32_t currentMillis = millis();
        if (currentMillis - lastMemoryCheck > memoryCheckInterval) {
            lastMemoryCheck = currentMillis;
            
            if (uxTaskGetStackHighWaterMark(NULL) < 500) {
                Serial.println("[MANAGER_QUADDISPLAY][WARNING] Stack space critically low!");
            }
            
            if (ESP.getMaxAllocHeap() < 10000) {
                Serial.println("[MANAGER_QUADDISPLAY][WARNING] Heap fragmentation detected!");
            }
        }
        
        quadDisplay->update();
        vTaskDelay(pdMS_TO_TICKS(10));
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
    
    if (detectedQuadDisplay) {
        Serial.println("[DEBUG][DEVICE] QuadDisplay detected, launching task on core 1...");
        
        uint8_t* taskParam = (uint8_t*)malloc(sizeof(uint8_t));
        *taskParam = 0x70;
        
        xTaskCreatePinnedToCore(
            quadDisplayTask,
            "QuadDisplayTask",
            4096,
            taskParam,
            1,
            &quadDisplayTaskHandle,
            1
        );
        
        if (quadDisplayTaskHandle == NULL) {
            Serial.println("[ERROR] Failed to create QuadDisplay task on core 1");
            free(taskParam);
        } else {
            Serial.println("[DEBUG][DEVICE] QuadDisplay initialization queued on core 1");
        }
    }
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

String Device_AdafruitQtPyESP32S3::performI2CScan(StaticJsonDocument<2048>& doc) {
    Serial.println("[DEBUG][I2C] Starting I2C scan on Wire1...");
    
    // Use the enhanced scanner with device recognition - it will handle Wire1 initialization
    String result = I2CScanner::scanAndConfigureDevices(Wire1, doc, "qtpy");
    
    // Check what was found and initialize accordingly
    bool foundSeesaw = doc["FoundSeesaw"] | false;
    bool foundQuadDisplay = doc["FoundQuadDisplay"] | false;
    
    if (foundQuadDisplay) {
        detectedQuadDisplay = true;
        Serial.println("[DEBUG][I2C] QuadDisplay will be initialized in task");
    }
    
    if (foundSeesaw) {
        Serial.println("[DEBUG][I2C] Seesaw found, initializing shared I2C manager...");
        
        xTaskCreatePinnedToCore(
            [](void* param) {
                ConnectionManager* cm = static_cast<ConnectionManager*>(param);
                Serial.printf("[I2CInitTask] Running on core %d\n", xPortGetCoreID());
                
                // Initialize the shared I2C manager with Wire1 interface (like old code)
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
    
    return result;
}