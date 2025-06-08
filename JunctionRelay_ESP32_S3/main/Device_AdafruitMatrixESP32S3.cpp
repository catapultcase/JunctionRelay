#include "Device_AdafruitMatrixESP32S3.h"
#include "Utils.h"

// Define the RGBMatrix pins here (only in one file to avoid multiple definitions)
uint8_t rgbPins[]  = {42, 41, 40, 38, 39, 37}; // RGB channels (Red, Green, Blue)
uint8_t addrPins[] = {45, 36, 48, 35, 21};     // Address pins
uint8_t clockPin   = 2;                        // Clock pin
uint8_t latchPin   = 47;                       // Latch pin
uint8_t oePin      = 14;                       // Output enable pin

// Initialize the static task handle
TaskHandle_t Device_AdafruitMatrixESP32S3::matrixTaskHandle = NULL;

Device_AdafruitMatrixESP32S3::Device_AdafruitMatrixESP32S3(ConnectionManager* connMgr)
: connMgr(connMgr) {
    // Store the connection manager reference for future use if needed
}

// Matrix manager task that runs on core 1
void Device_AdafruitMatrixESP32S3::matrixTask(void* parameter) {
    Serial.println("[DEBUG][MATRIX] Task started on core 1");
    
    // Cast the parameter to get the connection manager
    ConnectionManager* connMgr = static_cast<ConnectionManager*>(parameter);
    
    // Get the singleton instance and initialize it with our pins
    Manager_Matrix* matrixManager = Manager_Matrix::getInstance();
    matrixManager->setConnectionManager(connMgr);  // Set the connection manager
    matrixManager->begin(rgbPins, addrPins, clockPin, latchPin, oePin);
    
    Serial.println("[DEBUG][MATRIX] Manager initialized on core 1");
    
    // Task should keep running to handle matrix updates
    uint32_t lastMemoryCheck = 0;
    const uint32_t memoryCheckInterval = 30000; // Check memory every 30 seconds
    
    while (true) {
        // Periodic memory check - reduced frequency
        uint32_t currentMillis = millis();
        if (currentMillis - lastMemoryCheck > memoryCheckInterval) {
            lastMemoryCheck = currentMillis;
            
            // Only check for critical conditions
            if (uxTaskGetStackHighWaterMark(NULL) < 500) {
                Serial.println("[WARNING][MATRIX] Stack space critically low!");
            }
            
            if (ESP.getMaxAllocHeap() < 10000) {
                Serial.println("[WARNING][MATRIX] Heap fragmentation detected!");
            }
        }
        
        // Allow matrix manager to handle updates, if needed
        // Uncomment if you have an update method that needs to be called frequently
        // matrixManager->update();
        
        // Give other tasks a chance to run
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

bool Device_AdafruitMatrixESP32S3::begin() {
    Serial.println("[DEBUG][MATRIX] Initializing Adafruit Matrix ESP32-S3...");

    // Create a task on core 1 to handle the matrix initialization and updates
    xTaskCreatePinnedToCore(
        matrixTask,                 // Task function
        "MatrixTask",               // Task name
        8192,                       // Stack size (bytes)
        connMgr,                    // Pass connection manager as parameter
        1,                          // Task priority (1 is low)
        &matrixTaskHandle,          // Task handle
        1                           // Core to run on (1)
    );
    
    // Verify the task was created
    if (matrixTaskHandle == NULL) {
        Serial.println("[ERROR][MATRIX] Failed to create task on core 1");
        return false;
    }
    
    Serial.println("[DEBUG][MATRIX] Matrix initialization queued on core 1");
    return true;
}

const char* Device_AdafruitMatrixESP32S3::getName() {
    return "Adafruit Matrix ESP32-S3";
}

void Device_AdafruitMatrixESP32S3::setRotation(uint8_t rotation) {
    Serial.printf("[DEBUG][MATRIX] Rotation set to: %d\n", rotation);
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

void Device_AdafruitMatrixESP32S3::testText(const char* text) {
    Manager_Matrix* matrixManager = Manager_Matrix::getInstance();
    if (matrixManager) {
        matrixManager->clearDisplay();
        matrixManager->displayText(text, 0, 0);
    } else {
        Serial.println("[ERROR][MATRIX] Manager not initialized in testText");
    }
}