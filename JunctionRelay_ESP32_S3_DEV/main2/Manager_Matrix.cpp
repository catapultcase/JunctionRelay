#include "Manager_Matrix.h"
#include "Utils.h"
#include "ConnectionManager.h"

// Initialize static members
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
Manager_Matrix::Manager_Matrix() 
    : initialized(false)
    , matrix(nullptr)
    , matrixMutex(nullptr)
    , connMgr(nullptr)
    , currentMode(MODE_READY_SCREEN)
    , lastModeChange(0)
    , useDoubleBuffering(false)
    , backBuffer(nullptr)
{
    // Initialize scroll state
    scrollState = {0, 0, 0, false, true, {0}, 0};
    
    // Initialize text buffers
    memset(textBuffer, 0, sizeof(textBuffer));
    memset(ipBuffer, 0, sizeof(ipBuffer));
    memset(versionBuffer, 0, sizeof(versionBuffer));
    
    // Create mutex for thread safety
    matrixMutex = xSemaphoreCreateMutex();
    if (matrixMutex == NULL) {
        Serial.println("[Manager_Matrix] CRITICAL: Failed to create mutex!");
    }
}

// Destructor
Manager_Matrix::~Manager_Matrix() {
    cleanupBuffers();
    
    if (matrixMutex != nullptr) {
        vSemaphoreDelete(matrixMutex);
    }
    
    if (matrix != nullptr) {
        delete matrix;
    }
}

// Thread-safe matrix access
bool Manager_Matrix::acquireMatrix(const char* caller) {
    if (matrixMutex == nullptr) {
        Serial.printf("[Manager_Matrix] ERROR: No mutex for %s\n", caller);
        return false;
    }
    
    if (xSemaphoreTake(matrixMutex, pdMS_TO_TICKS(MUTEX_TIMEOUT_MS)) != pdTRUE) {
        Serial.printf("[Manager_Matrix] WARNING: Mutex timeout for %s\n", caller);
        return false;
    }
    
    return true;
}

void Manager_Matrix::releaseMatrix() {
    if (matrixMutex != nullptr) {
        xSemaphoreGive(matrixMutex);
    }
}

// Safe text copying with bounds checking
void Manager_Matrix::safeTextCopy(char* dest, const char* src, size_t destSize) {
    if (!src || !dest || destSize == 0) {
        return;
    }
    
    size_t srcLen = strlen(src);
    size_t copyLen = (srcLen < destSize - 1) ? srcLen : destSize - 1;
    
    memcpy(dest, src, copyLen);
    dest[copyLen] = '\0';
}

// Validate coordinates
bool Manager_Matrix::validateCoordinates(int x, int y) {
    return (x >= 0 && x < MATRIX_WIDTH && y >= 0 && y < MATRIX_HEIGHT);
}

// Method to set the connection manager reference
void Manager_Matrix::setConnectionManager(ConnectionManager* cm) {
    connMgr = cm;
    
    // Start the refresh timer task with larger stack
    if (connMgr && refreshTaskHandle == NULL) {
        BaseType_t result = xTaskCreatePinnedToCore(
            refreshTimerCallback,
            "MatrixRefresh",
            6144,  // Increased from 2048 to 6KB
            this,
            1,     // Priority
            &refreshTaskHandle,
            1      // Core 1
        );
        
        if (result != pdPASS) {
            Serial.println("[Manager_Matrix] ERROR: Failed to create refresh task");
            refreshTaskHandle = NULL;
        } else {
            Serial.println("[Manager_Matrix] Refresh task created successfully");
        }
    }
}

// begin() method to initialize the matrix with the provided pins
void Manager_Matrix::begin(uint8_t* rgbPins, uint8_t* addrPins, uint8_t clockPin, uint8_t latchPin, uint8_t oePin) {
    if (initialized) {
        Serial.println("[Manager_Matrix] Matrix already initialized.");
        return;
    }

    Serial.println("[Manager_Matrix] Initializing Adafruit Matrix ESP32-S3...");

    if (!acquireMatrix("begin")) {
        Serial.println("[Manager_Matrix] CRITICAL: Cannot acquire mutex for initialization");
        return;
    }

    // Create the matrix object with proper parameters
    matrix = new Adafruit_Protomatter(
        MATRIX_WIDTH, 4, 1, rgbPins, NUM_ADDR_PINS, addrPins,
        clockPin, latchPin, oePin, true
    );

    if (!matrix) {
        Serial.println("[Manager_Matrix] CRITICAL: Failed to allocate matrix object");
        releaseMatrix();
        return;
    }

    // Initialize the matrix object
    ProtomatterStatus status = matrix->begin();
    Serial.printf("[Manager_Matrix] Protomatter begin() status: %d\n", status);

    if (status != PROTOMATTER_OK) {
        Serial.println("[Manager_Matrix] CRITICAL: Matrix initialization failed!");
        delete matrix;
        matrix = nullptr;
        releaseMatrix();
        return;
    }

    // Initialize buffers
    initializeBuffers();

    // Clear and initialize display
    matrix->fillScreen(0);
    matrix->show();
    
    initialized = true;
    currentMode = MODE_READY_SCREEN;
    lastModeChange = millis();
    
    releaseMatrix();
    
    Serial.println("[Manager_Matrix] Initialization complete.");
    
    // Display ready screen
    showReadyScreen();
}

void Manager_Matrix::initializeBuffers() {
    // Pre-populate version buffer
    const char* fullVersion = getFirmwareVersion();
    if (strncmp(fullVersion, "JunctionRelay", 13) == 0) {
        snprintf(versionBuffer, sizeof(versionBuffer), "JR%s", fullVersion + 13);
    } else {
        safeTextCopy(versionBuffer, fullVersion, sizeof(versionBuffer));
    }
    
    // Initialize IP buffer
    strcpy(ipBuffer, "No Network");
}

void Manager_Matrix::cleanupBuffers() {
    if (backBuffer) {
        delete[] backBuffer;
        backBuffer = nullptr;
    }
}

// Set display mode with change tracking
void Manager_Matrix::setDisplayMode(DisplayMode mode) {
    if (currentMode != mode) {
        currentMode = mode;
        lastModeChange = millis();
        
        // Reset scroll state when changing modes
        if (mode == MODE_READY_SCREEN) {
            scrollState.offset = 0;
            scrollState.isPaused = false;
            scrollState.needsUpdate = true;
            memset(scrollState.lastDisplayedIP, 0, sizeof(scrollState.lastDisplayedIP));
        }
    }
}

// Enhanced ready screen with anti-flicker
void Manager_Matrix::showReadyScreen() {
    if (!initialized || !matrix) {
        return;
    }
    
    if (!acquireMatrix("showReadyScreen")) {
        return;
    }
    
    setDisplayMode(MODE_READY_SCREEN);
    
    // Only update if content actually changed or forced update needed
    bool forceUpdate = scrollState.needsUpdate;
    bool ipChanged = false;
    
    // Get current IP and check if it changed
    char currentIP[20] = "No Network";
    if (connMgr) {
        ConnectionStatus status = connMgr->getConnectionStatus();
        if (status.wifiConnected && !status.ipAddress.isEmpty()) {
            safeTextCopy(currentIP, status.ipAddress.c_str(), sizeof(currentIP));
        }
    }
    
    // Check if IP changed
    if (strcmp(currentIP, scrollState.lastDisplayedIP) != 0) {
        safeTextCopy(scrollState.lastDisplayedIP, currentIP, sizeof(scrollState.lastDisplayedIP));
        safeTextCopy(ipBuffer, currentIP, sizeof(ipBuffer));
        scrollState.offset = 0;
        scrollState.isPaused = false;
        scrollState.needsUpdate = true;
        ipChanged = true;
    }
    
    // Only redraw if something changed
    if (forceUpdate || ipChanged) {
        matrix->fillScreen(0);  // Clear screen
        
        // Line 1: Version (white text)
        matrix->setTextColor(matrix->color565(255, 255, 255));
        matrix->setCursor(0, 0);
        matrix->print(versionBuffer);
        
        // Line 2: "Matrix" (white text)
        matrix->setCursor(0, 8);
        matrix->print("Matrix");
        
        // Line 3: "64x32" + RGB (with colors)
        matrix->setCursor(0, 16);
        matrix->setTextColor(matrix->color565(255, 255, 255));
        matrix->print("64x32 ");
        
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
        
        scrollState.needsUpdate = false;
    }
    
    // Line 4: IP address with smart scrolling (only update if needed)
    renderScrollingText(ipBuffer, 0, 24, MATRIX_WIDTH);
    
    matrix->show();
    releaseMatrix();
}

// Smart scrolling text renderer with anti-flicker
void Manager_Matrix::renderScrollingText(const char* text, int x, int y, int maxWidth) {
    if (!text || !validateCoordinates(x, y)) {
        return;
    }
    
    matrix->setTextColor(matrix->color565(255, 255, 255));
    
    // Calculate text width (6 pixels per character)
    int textWidth = strlen(text) * 6;
    
    if (textWidth <= maxWidth) {
        // Text fits - display normally
        matrix->setCursor(x, y);
        matrix->print(text);
        scrollState.offset = 0;
        scrollState.isPaused = false;
        return;
    }
    
    // Text needs scrolling - update timing
    unsigned long currentTime = millis();
    bool shouldUpdate = false;
    
    if (scrollState.isPaused) {
        // Check if pause time is over (2 seconds)
        if (currentTime - scrollState.pauseStartTime >= 2000) {
            scrollState.isPaused = false;
            scrollState.lastUpdateTime = currentTime;
            shouldUpdate = true;
        }
    } else {
        // Scrolling mode - update every 150ms for smooth movement
        if (currentTime - scrollState.lastUpdateTime >= 150) {
            scrollState.offset += 2; // Move 2 pixels at a time
            scrollState.lastUpdateTime = currentTime;
            shouldUpdate = true;
            
            // Check if we've scrolled past the end
            if (scrollState.offset >= textWidth + 10) { // +10 for some spacing
                scrollState.offset = 0;
                scrollState.isPaused = true;
                scrollState.pauseStartTime = currentTime;
            }
        }
    }
    
    // Only update display if timing requires it
    if (shouldUpdate || scrollState.needsUpdate) {
        // Clear only the IP line to reduce flicker
        matrix->fillRect(x, y, maxWidth, 8, 0);
        
        // Display scrolling text
        matrix->setCursor(x - scrollState.offset, y);
        matrix->print(text);
    }
}

// Static timer callback function with better error handling
void Manager_Matrix::refreshTimerCallback(void* parameter) {
    Manager_Matrix* instance = static_cast<Manager_Matrix*>(parameter);
    
    if (!instance) {
        Serial.println("[Manager_Matrix] ERROR: Null instance in refresh callback");
        vTaskDelete(NULL);
        return;
    }
    
    Serial.printf("[Manager_Matrix] Refresh task started on core %d\n", xPortGetCoreID());
    
    TickType_t lastWakeTime = xTaskGetTickCount();
    const TickType_t frequency = pdMS_TO_TICKS(200); // 200ms refresh rate
    
    while (true) {
        // Monitor stack usage periodically
        static uint32_t lastStackCheck = 0;
        uint32_t now = millis();
        if (now - lastStackCheck > 10000) { // Every 10 seconds
            instance->checkStackUsage();
            lastStackCheck = now;
        }
        
        // Only update if we're in ready screen mode and initialized
        if (instance->initialized && instance->connMgr && 
            instance->currentMode == MODE_READY_SCREEN) {
            instance->refreshReadyScreen();
        }
        
        // Use vTaskDelayUntil for consistent timing
        vTaskDelayUntil(&lastWakeTime, frequency);
    }
}

// Method to refresh the ready screen with change detection
void Manager_Matrix::refreshReadyScreen() {
    if (!initialized || !matrix || !connMgr) {
        return;
    }
    
    // Only refresh if we're actually showing the ready screen
    if (currentMode == MODE_READY_SCREEN) {
        showReadyScreen();
    }
}

// Enhanced clearDisplay with bounds checking
void Manager_Matrix::clearDisplay() {
    if (!initialized || !matrix) {
        return;
    }
    
    if (!acquireMatrix("clearDisplay")) {
        return;
    }
    
    matrix->fillScreen(0);
    matrix->show();
    
    releaseMatrix();
}

// Calculate how many characters will fit at the current position
int Manager_Matrix::calculateFitChars(const char* text, int x) {
    if (!matrix || !text) {
        return 0;
    }
    
    const int charWidth = 6; // Standard font width
    int availableWidth = MATRIX_WIDTH - x;
    int maxChars = availableWidth / charWidth;
    int textLen = strlen(text);
    
    return (textLen <= maxChars) ? textLen : maxChars;
}

// Enhanced displayText with validation and thread safety
void Manager_Matrix::displayText(const char* text, int x, int y) {
    if (!initialized || !matrix || !text) {
        return;
    }
    
    if (!validateCoordinates(x, y)) {
        Serial.printf("[Manager_Matrix] ERROR: Invalid coordinates (%d, %d)\n", x, y);
        return;
    }
    
    if (!acquireMatrix("displayText")) {
        return;
    }
    
    matrix->fillScreen(0);
    matrix->setTextColor(0xFFFFFF);
    matrix->setCursor(x, y);
    
    // Calculate fit and use safe buffer
    int fitChars = calculateFitChars(text, x);
    
    if (fitChars >= strlen(text)) {
        matrix->print(text);
    } else if (fitChars > 3) {
        safeTextCopy(textBuffer, text, fitChars - 2);
        strcat(textBuffer, "..");
        matrix->print(textBuffer);
    } else if (fitChars > 0) {
        safeTextCopy(textBuffer, text, fitChars + 1);
        matrix->print(textBuffer);
    }
    
    matrix->show();
    releaseMatrix();
}

// Enhanced displayMultiText without immediate show
void Manager_Matrix::displayMultiText(const char* text, int x, int y) {
    if (!initialized || !matrix || !text) {
        return;
    }
    
    if (!validateCoordinates(x, y)) {
        return;
    }
    
    matrix->setTextColor(0xFFFFFF);
    matrix->setCursor(x, y);
    
    int fitChars = calculateFitChars(text, x);
    
    if (fitChars >= strlen(text)) {
        matrix->print(text);
    } else if (fitChars > 3) {
        safeTextCopy(textBuffer, text, fitChars - 2);
        strcat(textBuffer, "..");
        matrix->print(textBuffer);
    } else if (fitChars > 0) {
        safeTextCopy(textBuffer, text, fitChars + 1);
        matrix->print(textBuffer);
    }
}

// Enhanced sensor data handling with memory safety
void Manager_Matrix::updateSensorData(const JsonDocument& sensorDoc) {
    if (!initialized || !matrix) {
        return;
    }
    
    if (!acquireMatrix("updateSensorData")) {
        return;
    }
    
    setDisplayMode(MODE_SENSOR_DATA);
    matrix->fillScreen(0);
    
    if (!sensorDoc.containsKey("sensors")) {
        matrix->show();
        releaseMatrix();
        return;
    }
    
    JsonObjectConst sensors = sensorDoc["sensors"];
    int sensorCount = 0;
    const int maxSensors = 8; // Reduced to prevent memory issues
    
    for (JsonPairConst kv : sensors) {
        if (sensorCount >= maxSensors) {
            Serial.printf("[Manager_Matrix] Limiting to %d sensors to prevent memory issues\n", maxSensors);
            break;
        }
        
        JsonObjectConst sensorData = kv.value();
        if (!sensorData.containsKey("Position") || !sensorData.containsKey("Data")) {
            continue;
        }
        
        // Get position with validation
        int x = 0, y = 0;
        JsonObjectConst position = sensorData["Position"];
        if (position.containsKey("x")) x = position["x"].as<int>();
        if (position.containsKey("y")) y = position["y"].as<int>();
        
        if (!validateCoordinates(x, y)) {
            Serial.printf("[Manager_Matrix] Skipping invalid coordinates (%d, %d)\n", x, y);
            continue;
        }
        
        JsonArrayConst dataArray = sensorData["Data"];
        if (dataArray.size() == 0) continue;
        
        JsonObjectConst dataItem = dataArray[0];
        if (!dataItem.containsKey("text")) continue;
        
        const char* text = dataItem["text"];
        if (!text || strlen(text) == 0) continue;
        
        // Use safe text copying
        safeTextCopy(textBuffer, text, sizeof(textBuffer));
        
        // Display the text
        matrix->setTextColor(0xFFFFFF);
        matrix->setCursor(x, y);
        matrix->print(textBuffer);
        
        sensorCount++;
    }
    
    matrix->show();
    releaseMatrix();
    
    // Periodic memory logging
    static uint32_t lastMemLog = 0;
    if (millis() - lastMemLog > 15000) { // Every 15 seconds
        logMemoryUsage();
        lastMemLog = millis();
    }
}

// Config application with validation
void Manager_Matrix::applyConfig(const JsonDocument& configDoc) {
    if (!initialized || !matrix) {
        return;
    }
    
    if (!acquireMatrix("applyConfig")) {
        return;
    }
    
    setDisplayMode(MODE_CONFIG_DATA);
    
    if (configDoc.containsKey("text") && configDoc.containsKey("x") && configDoc.containsKey("y")) {
        const char* text = configDoc["text"];
        int x = configDoc["x"];
        int y = configDoc["y"];
        
        if (validateCoordinates(x, y) && text) {
            displayText(text, x, y);
        }
    }
    
    releaseMatrix();
    Serial.println("[Manager_Matrix] Config applied safely.");
}

// Memory usage logging
void Manager_Matrix::logMemoryUsage() {
    size_t freeHeap = ESP.getFreeHeap();
    size_t minFreeHeap = ESP.getMinFreeHeap();
    
    if (freeHeap < 20000) {
        Serial.printf("[Manager_Matrix] WARNING: Low memory - Free: %d, Min: %d\n", 
                     freeHeap, minFreeHeap);
    }
}

// Stack usage monitoring
void Manager_Matrix::checkStackUsage() {
    if (refreshTaskHandle != NULL) {
        UBaseType_t stackHighWaterMark = uxTaskGetStackHighWaterMark(refreshTaskHandle);
        if (stackHighWaterMark < 1000) {
            Serial.printf("[Manager_Matrix] WARNING: Refresh task stack low: %d bytes remaining\n", 
                         stackHighWaterMark * sizeof(StackType_t));
        }
    }
}

// ScreenDestination interface implementations
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
    // No animation logic needed - timer handles updates
    checkStackUsage();
}