#include "Manager_Matrix.h"
#include "Utils.h"
#include "ConnectionManager.h"

// Initialize static instance pointer to nullptr
Manager_Matrix* Manager_Matrix::instance = nullptr;
TaskHandle_t Manager_Matrix::refreshTaskHandle = NULL;

// Static method to get the singleton instance
Manager_Matrix* Manager_Matrix::getInstance() {
    if (instance == nullptr) {
        instance = new Manager_Matrix();
    }
    return instance;
}

// Private constructor - initialize member variables
Manager_Matrix::Manager_Matrix() : initialized(false), matrix(nullptr), connMgr(nullptr), 
                                   scrollOffset(0), lastScrollTime(0), pauseStartTime(0), 
                                   isPaused(false), showingReadyScreen(true) {
    // Nothing else to initialize
}

// Method to set the connection manager reference
void Manager_Matrix::setConnectionManager(ConnectionManager* cm) {
    connMgr = cm;
    
    // Start the refresh timer task if we have a connection manager
    if (connMgr && refreshTaskHandle == NULL) {
        xTaskCreatePinnedToCore(
            refreshTimerCallback,
            "MatrixRefresh",
            2048,
            this,
            1,
            &refreshTaskHandle,
            1
        );
    }
}

// begin() method to initialize the matrix with the provided pins
void Manager_Matrix::begin(uint8_t* rgbPins, uint8_t* addrPins, uint8_t clockPin, uint8_t latchPin, uint8_t oePin) {
    if (initialized) {
        Serial.println("[Manager_Matrix] Matrix already initialized.");
        return;  // Skip initialization if already done
    }

    Serial.println("[Manager_Matrix] Initializing Adafruit Matrix ESP32-S3...");

    // Create the matrix object with proper parameters
    matrix = new Adafruit_Protomatter(
        MATRIX_WIDTH, 4, 1, rgbPins, NUM_ADDR_PINS, addrPins,
        clockPin, latchPin, oePin, true
    );

    // Initialize the matrix object
    ProtomatterStatus status = matrix->begin();
    Serial.printf("[Manager_Matrix] Protomatter begin() status: %d\n", status);

    if (status != PROTOMATTER_OK) {
        Serial.println("[ERROR] Matrix initialization failed!");
        return;
    }

    matrix->fillScreen(0);       // Clear the display
    matrix->show();              // Update the display
    initialized = true;         // Set the initialization flag
    Serial.println("[Manager_Matrix] Initialization complete.");
    
    // Display ready screen
    showReadyScreen();
}

// Method to display the ready screen with firmware version and IP address
void Manager_Matrix::showReadyScreen() {
    if (!initialized || !matrix) return;
    
    showingReadyScreen = true;  // Set flag that we're showing ready screen
    clearDisplay();
    
    // Get the full firmware version string
    const char* fullVersion = getFirmwareVersion();
    
    // Display the version on the first line - avoiding String class
    matrix->setTextColor(matrix->color565(255, 255, 255));  // White text
    matrix->setCursor(0, 0);
    
    // Display version with JR prefix instead of JunctionRelay to save space
    if (strncmp(fullVersion, "JunctionRelay", 13) == 0) {
        matrix->print("JR");  // No trailing space
        
        // Skip the JunctionRelay prefix and check if we need to add a space
        const char* remainder = fullVersion + 13;
        
        // If the remainder doesn't start with a space, add one
        if (*remainder != ' ') {
            matrix->print(" ");
        }
        
        // Print the remainder of the version
        matrix->print(remainder);
    } else {
        matrix->print(fullVersion);
    }
    
    // Display status on subsequent lines
    matrix->setCursor(0, 8);
    matrix->print("Matrix");
    
    matrix->setCursor(0, 16);
    matrix->print("64x32 ");
    
    // Position for RGB text
    int rgbX = matrix->getCursorX();
    int rgbY = matrix->getCursorY();
    
    // Red R
    matrix->setTextColor(matrix->color565(255, 0, 0));
    matrix->setCursor(rgbX, rgbY);
    matrix->print("R");
    
    // Green G
    matrix->setTextColor(matrix->color565(0, 255, 0));
    matrix->setCursor(rgbX + 6, rgbY);
    matrix->print("G");
    
    // Blue B
    matrix->setTextColor(matrix->color565(0, 0, 255));
    matrix->setCursor(rgbX + 12, rgbY);
    matrix->print("B");
    
    // Line 4: IP address with scrolling
    matrix->setTextColor(matrix->color565(255, 255, 255));  // White text
    
    if (connMgr) {
        ConnectionStatus status = connMgr->getConnectionStatus();
        
        if (status.wifiConnected) {
            String ip = status.ipAddress;
            
            // Calculate if scrolling is needed (assume 6 pixel width per character)
            int textWidth = ip.length() * 6;
            int maxWidth = MATRIX_WIDTH;
            
            if (textWidth <= maxWidth) {
                // Text fits, display normally
                matrix->setCursor(0, 24);
                matrix->print(ip.c_str());
                scrollOffset = 0;
                isPaused = false;
            } else {
                // Text needs scrolling
                unsigned long currentTime = millis();
                
                if (isPaused) {
                    // Check if pause time is over
                    if (currentTime - pauseStartTime >= 3000) { // 3 second pause
                        isPaused = false;
                        lastScrollTime = currentTime;
                    }
                    // Display at current offset during pause
                    matrix->setCursor(-scrollOffset, 24);
                    matrix->print(ip.c_str());
                } else {
                    // Scrolling mode
                    if (currentTime - lastScrollTime >= 100) { // Scroll every 100ms
                        scrollOffset += 2; // Move 2 pixels at a time
                        lastScrollTime = currentTime;
                        
                        // Check if we've scrolled past the end
                        if (scrollOffset >= textWidth) {
                            scrollOffset = 0;
                            isPaused = true;
                            pauseStartTime = currentTime;
                        }
                    }
                    
                    matrix->setCursor(-scrollOffset, 24);
                    matrix->print(ip.c_str());
                }
            }
        }
    }
    
    matrix->show();
}

// Static timer callback function
void Manager_Matrix::refreshTimerCallback(void* parameter) {
    Manager_Matrix* instance = static_cast<Manager_Matrix*>(parameter);
    
    while (true) {
        // Update every 200ms for smooth scrolling
        vTaskDelay(pdMS_TO_TICKS(200));
        
        if (instance && instance->initialized && instance->connMgr) {
            instance->refreshReadyScreen();
        }
    }
}

// Method to refresh the ready screen with current connection status
void Manager_Matrix::refreshReadyScreen() {
    if (!initialized || !matrix || !connMgr) return;
    
    // Only refresh if we're actually showing the ready screen
    if (showingReadyScreen) {
        showReadyScreen();
    }
}

// clearDisplay() method to clear the matrix display
void Manager_Matrix::clearDisplay() {
    if (!initialized || !matrix) return;
    
    matrix->fillScreen(0);  // Fill the screen with black
    matrix->show();         // Update the display
}

// Calculate how many characters will fit at the current position
int Manager_Matrix::calculateFitChars(const char* text, int x) {
    if (!matrix) return 0;
    
    // Assume each character is 6 pixels wide (standard font width)
    const int charWidth = 6;
    
    // Calculate available width
    int availableWidth = MATRIX_WIDTH - x;
    
    // Calculate how many characters will fit
    int maxChars = availableWidth / charWidth;
    
    // Get text length
    int textLen = strlen(text);
    
    // Return the smaller of text length or max chars that fit
    return (textLen <= maxChars) ? textLen : maxChars;
}

// displayText() method to show text on the matrix at specific (x, y) position
void Manager_Matrix::displayText(const char* text, int x, int y) {
    if (!initialized || !matrix) return;
    
    matrix->fillScreen(0);  // Clear the screen first
    matrix->setTextColor(0xFFFFFF);  // White text
    matrix->setCursor(x, y);
    
    // Calculate how many characters will fit without wrapping
    int fitChars = calculateFitChars(text, x);
    
    // Static buffer for truncated text
    static char truncBuffer[64];
    
    if (fitChars >= strlen(text)) {
        // Text fits completely - print it as is
        matrix->print(text);
    } else if (fitChars > 3) {
        // Text needs truncation with ellipsis
        strncpy(truncBuffer, text, fitChars - 3);
        truncBuffer[fitChars - 3] = '.';
        truncBuffer[fitChars - 2] = '.';
        truncBuffer[fitChars - 1] = '.';
        truncBuffer[fitChars] = '\0';
        matrix->print(truncBuffer);
    } else {
        // Not enough space even for ellipsis - print what fits
        strncpy(truncBuffer, text, fitChars);
        truncBuffer[fitChars] = '\0';
        matrix->print(truncBuffer);
    }
    
    matrix->show();
}

// displayMultiText() method without immediate show() - for batch updates
void Manager_Matrix::displayMultiText(const char* text, int x, int y) {
    if (!initialized || !matrix) return;
    
    matrix->setTextColor(0xFFFFFF);  // White text
    matrix->setCursor(x, y);
    
    // Calculate how many characters will fit without wrapping
    int fitChars = calculateFitChars(text, x);
    
    // Static buffer for truncated text
    static char truncBuffer[64];
    
    if (fitChars >= strlen(text)) {
        // Text fits completely - print it as is
        matrix->print(text);
    } else if (fitChars > 3) {
        // Text needs truncation with ellipsis
        strncpy(truncBuffer, text, fitChars - 3);
        truncBuffer[fitChars - 3] = '.';
        truncBuffer[fitChars - 2] = '.';
        truncBuffer[fitChars - 1] = '.';
        truncBuffer[fitChars] = '\0';
        matrix->print(truncBuffer);
    } else {
        // Not enough space even for ellipsis - print what fits
        strncpy(truncBuffer, text, fitChars);
        truncBuffer[fitChars] = '\0';
        matrix->print(truncBuffer);
    }
}

void Manager_Matrix::applyConfig(const JsonDocument& configDoc) {
    if (!initialized || !matrix) return;
    
    if (configDoc.containsKey("text") && configDoc.containsKey("x") && configDoc.containsKey("y")) {
        const char* text = configDoc["text"];
        int x = configDoc["x"];
        int y = configDoc["y"];
        displayText(text, x, y);
    }
    Serial.println("[Manager_Matrix] Config applied.");
}

// Static buffer for sensor text to avoid repeated allocations
static char g_textBuffer[64]; 

void Manager_Matrix::updateSensorData(const JsonDocument& sensorDoc) {
    if (!initialized || !matrix) return;
    
    showingReadyScreen = false;  // We're now showing sensor data, not ready screen
    
    // Clear the screen at the beginning
    matrix->fillScreen(0);
    
    // Check if we have sensors data
    if (!sensorDoc.containsKey("sensors")) {
        matrix->show();  // Show the cleared display
        return;
    }
    
    // Process each sensor
    JsonObjectConst sensors = sensorDoc["sensors"];
    
    // Counter for debugging
    int sensorCount = 0;

    for (JsonPairConst kv : sensors) {
        // Get the sensor data
        JsonObjectConst sensorData = kv.value();
        
        // Skip if missing required fields
        if (!sensorData.containsKey("Position") || !sensorData.containsKey("Data")) continue;
        
        // Get position
        int x = 0, y = 0;
        JsonObjectConst position = sensorData["Position"];
        if (position.containsKey("x")) x = position["x"].as<int>();
        if (position.containsKey("y")) y = position["y"].as<int>();
        
        // Get data
        JsonArrayConst dataArray = sensorData["Data"];
        if (dataArray.size() == 0) continue;
        
        // Get first data item's text
        JsonObjectConst dataItem = dataArray[0];
        if (!dataItem.containsKey("text")) continue;
        
        const char* text = dataItem["text"];
        if (!text || strlen(text) == 0) continue;
        
        // Calculate how many characters will fit without wrapping
        int fitChars = calculateFitChars(text, x);
        
        // Create truncated text if needed
        if (fitChars >= strlen(text)) {
            // Text fits completely - copy as is
            strncpy(g_textBuffer, text, sizeof(g_textBuffer) - 1);
            g_textBuffer[sizeof(g_textBuffer) - 1] = '\0';
        } else if (fitChars > 3) {
            // Text needs truncation with ellipsis
            strncpy(g_textBuffer, text, fitChars - 3);
            g_textBuffer[fitChars - 3] = '.';
            g_textBuffer[fitChars - 2] = '.';
            g_textBuffer[fitChars - 1] = '.';
            g_textBuffer[fitChars] = '\0';
        } else {
            // Not enough space even for ellipsis - print what fits
            strncpy(g_textBuffer, text, fitChars);
            g_textBuffer[fitChars] = '\0';
        }
        
        // Display the text on the matrix
        matrix->setTextColor(0xFFFFFF);
        matrix->setCursor(x, y);
        matrix->print(g_textBuffer);
        
        // Increment counter
        sensorCount++;
        
        // Force periodic garbage collection by simply limiting how many sensors we process at once
        if (sensorCount >= 10) {
            Serial.println("[WARNING] Too many sensors - limiting to 10 to prevent memory issues");
            break;
        }
    }
    
    // Update the display once at the end
    matrix->show();
    
    // Report stats occasionally
    static uint32_t lastReportTime = 0;
    if (millis() - lastReportTime > 5000) {
        lastReportTime = millis();
        // Serial.printf("[INFO] Processed %d sensors, free heap: %d\n", 
        //             sensorCount, ESP.getFreeHeap());
    }
}

String Manager_Matrix::getScreenId() const {
    return "matrix";
}

bool Manager_Matrix::matchesScreenId(const String& screenId, const JsonDocument& doc) const {
    return (screenId == getScreenId());
}

const char* Manager_Matrix::getConfigKey() const {
    return "matrix";
}

void Manager_Matrix::update() {
    // No animation logic
}