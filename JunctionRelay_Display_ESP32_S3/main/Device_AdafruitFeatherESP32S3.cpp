#include "Device_AdafruitFeatherESP32S3.h"
#include "Utils.h"
#include "Manager_I2C.h"
#include "I2CScanner.h"

// Make sure we have all required managers included
#if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    #include "Manager_QuadDisplay.h"
#endif

// Static task handle for QuadDisplay
#if DEVICE_HAS_EXTERNAL_I2C_DEVICES
TaskHandle_t Device_AdafruitFeatherESP32S3::quadDisplayTaskHandle = NULL;
#endif

Device_AdafruitFeatherESP32S3::Device_AdafruitFeatherESP32S3(ConnectionManager* connMgr)
: connMgr(connMgr)
{
    #if DEVICE_HAS_ONBOARD_RGB_LED
    onboardPixel = Adafruit_NeoPixel(NUMPIXELS, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);
    #endif

    #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    detectedQuadDisplay = false;
    i2cInitTaskHandle = NULL;
    #endif
}

#if DEVICE_HAS_EXTERNAL_I2C_DEVICES
void Device_AdafruitFeatherESP32S3::quadDisplayTask(void* parameter) {
    Serial.println("[MANAGER_QUADDISPLAY][INFO] Task started on core 1");
    
    uint8_t i2cAddress = *((uint8_t*)parameter);
    free(parameter);
    
    Wire.setClock(400000);  // Maximum I2C speed: 400kHz (using Wire for Feather)
    
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

// This would be the equivalent for Device_AdafruitFeatherESP32S3.cpp
String Device_AdafruitFeatherESP32S3::performI2CScan(StaticJsonDocument<2048>& doc) {
    Serial.println("[DEBUG][I2C] Starting I2C scan on Wire...");
    
    // Use the enhanced scanner with device recognition - it will handle Wire initialization
    String result = I2CScanner::scanAndConfigureDevices(Wire, doc, "feather");
    
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
                
                // Initialize the shared I2C manager with Wire interface (like old code)
                Manager_I2C* i2cManager = Manager_I2C::getInstance(cm, &Wire);  // Note: &Wire for Feather
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