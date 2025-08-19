#include "Manager_Matrix.h"
#include "Helper_Utils.h"
#include "Manager_Connections.h"

// Initialize static members
Manager_Matrix* Manager_Matrix::instance = nullptr;

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
    , matrixTaskHandle(nullptr)
    , taskRunning(false)
    , taskStarted(false)
    , currentMode(MODE_READY_SCREEN)
    , lastModeChange(0)
    , currentAnimationType(ANIMATION_NONE)
    , useDoubleBuffering(false)
    , backBuffer(nullptr)
{
    // Initialize clock data
    clockData = {false, {0}, 0, 0, 0, 0, true, 0, 0};
    
    // Initialize scroll state
    scrollState = {0, 0, 0, false, true, {0}, 0};
    
    // Initialize sensor scroll states
    initializeSensorScrollStates();
    
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
    stop();
    cleanupBuffers();
    
    if (matrixMutex != nullptr) {
        vSemaphoreDelete(matrixMutex);
    }
    
    if (matrix != nullptr) {
        delete matrix;
    }
}

// Initialize all sensor scroll states
void Manager_Matrix::initializeSensorScrollStates() {
    for (int i = 0; i < MAX_SCROLLING_SENSORS; i++) {
        resetSensorScrollState(i);
    }
}

// Reset a specific sensor scroll state
void Manager_Matrix::resetSensorScrollState(int sensorIndex) {
    if (sensorIndex < 0 || sensorIndex >= MAX_SCROLLING_SENSORS) {
        return;
    }
    
    SensorScrollState& state = sensorScrollStates[sensorIndex];
    state.offset = 0;
    state.lastUpdateTime = 0;
    state.pauseStartTime = 0;
    state.isPaused = false;
    state.needsUpdate = true;
    state.textWidth = 0;
    state.isActive = false;
    state.x = 0;
    state.y = 0;
    state.maxWidth = MATRIX_WIDTH;
    memset(state.lastDisplayedText, 0, sizeof(state.lastDisplayedText));
}

// Update sensor scroll state with new text
void Manager_Matrix::updateSensorScrollState(int sensorIndex, const char* text, int x, int y, int maxWidth) {
    if (sensorIndex < 0 || sensorIndex >= MAX_SCROLLING_SENSORS || !text) {
        return;
    }
    
    SensorScrollState& state = sensorScrollStates[sensorIndex];
    
    // Check if text changed
    bool textChanged = (strcmp(text, state.lastDisplayedText) != 0);
    
    if (textChanged) {
        // Text changed - reset scroll state
        safeTextCopy(state.lastDisplayedText, text, sizeof(state.lastDisplayedText));
        state.offset = 0;
        state.isPaused = false;
        state.needsUpdate = true;
        state.textWidth = strlen(text) * 6; // 6 pixels per character
    }
    
    // Update position and constraints
    state.x = x;
    state.y = y;
    state.maxWidth = maxWidth;
    state.isActive = true;
}

// Check if sensor scroll should update based on timing
bool Manager_Matrix::shouldUpdateSensorScroll(int sensorIndex) {
    if (sensorIndex < 0 || sensorIndex >= MAX_SCROLLING_SENSORS) {
        return false;
    }
    
    SensorScrollState& state = sensorScrollStates[sensorIndex];
    if (!state.isActive) {
        return false;
    }
    
    // If text fits, no scrolling needed
    if (state.textWidth <= state.maxWidth) {
        return state.needsUpdate;
    }
    
    unsigned long currentTime = millis();
    bool shouldUpdate = false;
    
    if (state.isPaused) {
        // Check if pause time is over (2 seconds)
        if (currentTime - state.pauseStartTime >= 2000) {
            state.isPaused = false;
            state.lastUpdateTime = currentTime;
            shouldUpdate = true;
        }
    } else {
        // Scrolling mode - update every 150ms for smooth movement
        if (currentTime - state.lastUpdateTime >= 150) {
            state.offset += 2; // Move 2 pixels at a time
            state.lastUpdateTime = currentTime;
            shouldUpdate = true;
            
            // Check if we've scrolled past the end
            if (state.offset >= state.textWidth + 10) { // +10 for some spacing
                state.offset = 0;
                state.isPaused = true;
                state.pauseStartTime = currentTime;
            }
        }
    }
    
    return shouldUpdate || state.needsUpdate;
}

// Render scrolling text for a specific sensor
void Manager_Matrix::renderSensorScrollingText(int sensorIndex) {
    if (sensorIndex < 0 || sensorIndex >= MAX_SCROLLING_SENSORS) {
        return;
    }
    
    SensorScrollState& state = sensorScrollStates[sensorIndex];
    if (!state.isActive || !validateCoordinates(state.x, state.y)) {
        return;
    }
    
    const char* text = state.lastDisplayedText;
    if (!text || strlen(text) == 0) {
        return;
    }
    
    matrix->setTextColor(matrix->color565(255, 255, 255));
    
    if (state.textWidth <= state.maxWidth) {
        // Text fits - display normally (like IP address code)
        matrix->setCursor(state.x, state.y);
        matrix->print(text);
        state.offset = 0;
        state.isPaused = false;
        return;
    }
    
    // Text needs scrolling - always clear and display (like IP address code)
    matrix->fillRect(state.x, state.y, state.maxWidth, 8, 0);
    matrix->setCursor(state.x - state.offset, state.y);
    matrix->print(text);
}

// Static task function (following QuadDisplay pattern)
void Manager_Matrix::matrixTaskFunction(void* parameter) {
    Manager_Matrix* manager = static_cast<Manager_Matrix*>(parameter);
    
    Serial.printf("[MATRIX] Update task started on core %d\n", xPortGetCoreID());
    
    while (manager->taskRunning) {
        manager->internalUpdate();
        vTaskDelay(pdMS_TO_TICKS(200)); // 5Hz update rate for matrix updates
    }
    
    Serial.println("[MATRIX] Update task stopping");
    vTaskDelete(nullptr);
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
void Manager_Matrix::setManager_Connections(Manager_Connections* cm) {
    connMgr = cm;
    Serial.println("[Manager_Matrix] ✅ Connection manager reference set");
}

// begin() method to initialize the matrix with the provided pins (but don't start task)
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

    // DISABLE TEXT WRAPPING - prevents text from spilling to next lines
    matrix->setTextWrap(false);

    // Initialize buffers
    initializeBuffers();

    // Clear and initialize display
    matrix->fillScreen(0);
    matrix->show();
    
    initialized = true;
    currentMode = MODE_READY_SCREEN;
    lastModeChange = millis();
    
    releaseMatrix();
    
    Serial.println("[Manager_Matrix] ✅ Matrix initialization complete. Call startUpdateTask() when ready.");
}

// Start the update task when it's safe
void Manager_Matrix::startUpdateTask() {
    if (taskStarted) {
        Serial.println("[MATRIX] Task already started, ignoring request.");
        return;
    }
    
    // Start the update task on Core 1
    taskRunning = true;
    xTaskCreatePinnedToCore(
        matrixTaskFunction,       // Task function
        "Matrix",                 // Task name
        6144,                     // Stack size (larger for matrix operations)
        this,                     // Parameter (this instance)
        1,                        // Priority
        &matrixTaskHandle,        // Task handle
        1                         // Core 1
    );
    
    taskStarted = true;
    Serial.println("[MATRIX] ✅ Update task created on Core 1");
}

// Stop method
void Manager_Matrix::stop() {
    if (taskRunning) {
        taskRunning = false;
        
        // Wait for task to finish
        if (matrixTaskHandle) {
            vTaskDelay(pdMS_TO_TICKS(250)); // Longer delay for matrix cleanup
            matrixTaskHandle = nullptr;
        }
        
        // Clear display
        clearDisplay();
        
        Serial.println("[MATRIX] Update task stopped");
    }
}

// Internal update method (called by task)
void Manager_Matrix::internalUpdate() {
    // Update internal clock and colon flashing for active clocks
    if (clockData.isActive && currentMode == MODE_SENSOR_DATA) {
        updateInternalClock();
        updateClockColon();
    }
    
    // Update sensor scrolling animations ONLY if we're in sensor mode and using slide animation
    if (currentMode == MODE_SENSOR_DATA && currentAnimationType == ANIMATION_SLIDE) {
        bool anyUpdated = false;
        
        if (!acquireMatrix("internalUpdate-sensors")) {
            return;
        }
        
        for (int i = 0; i < MAX_SCROLLING_SENSORS; i++) {
            if (sensorScrollStates[i].isActive && shouldUpdateSensorScroll(i)) {
                renderSensorScrollingText(i);
                anyUpdated = true;
            }
        }
        
        if (anyUpdated) {
            matrix->show();
        }
        
        releaseMatrix();
    }
    
    // Only update if we're in ready screen mode and initialized
    if (initialized && connMgr && currentMode == MODE_READY_SCREEN) {
        refreshReadyScreen();
    }
    
    // Monitor stack usage periodically
    static uint32_t lastStackCheck = 0;
    uint32_t now = millis();
    if (now - lastStackCheck > 10000) { // Every 10 seconds
        checkStackUsage();
        lastStackCheck = now;
    }
}

// Set internal clock from parsed time (HH:MM format)
void Manager_Matrix::setInternalClock(int hours, int minutes) {
    clockData.hours = hours;
    clockData.minutes = minutes;
    clockData.lastSecondUpdate = millis();
    
    // Update display string
    snprintf(clockData.displayTime, sizeof(clockData.displayTime), 
             "%02d:%02d", clockData.hours, clockData.minutes);
    
    Serial.printf("[Manager_Matrix] Internal clock set to %02d:%02d\n", hours, minutes);
}

// Update internal clock every minute
void Manager_Matrix::updateInternalClock() {
    unsigned long now = millis();
    
    // Increment time every 60 seconds (60000 milliseconds)
    if (now - clockData.lastSecondUpdate >= 60000) {
        clockData.minutes++;
        if (clockData.minutes >= 60) {
            clockData.minutes = 0;
            clockData.hours++;
            if (clockData.hours >= 24) {
                clockData.hours = 0;
            }
        }
        
        // Update display string
        snprintf(clockData.displayTime, sizeof(clockData.displayTime), 
                "%02d:%02d", clockData.hours, clockData.minutes);
        
        clockData.lastSecondUpdate = now;
        
        // Force redraw of clock area with new time
        if (!acquireMatrix("updateInternalClock")) {
            return;
        }
        
        displayClock(clockData.x, clockData.y);
        matrix->show();
        releaseMatrix();
    }
}

// Check if text contains time format (YYYY-MM-DD HH:MM:SS pattern anywhere in the string)
bool Manager_Matrix::isTimeFormat(const char* text) {
    if (!text || strlen(text) < 19) {
        return false;
    }
    
    // Search for pattern: YYYY-MM-DD HH:MM:SS anywhere in the string
    const char* pos = text;
    while (*pos && strlen(pos) >= 19) {
        // Check if current position has the datetime pattern
        if (pos[4] == '-' && pos[7] == '-' && pos[10] == ' ' && 
            pos[13] == ':' && pos[16] == ':' &&
            isdigit(pos[0]) && isdigit(pos[1]) && isdigit(pos[2]) && isdigit(pos[3]) &&
            isdigit(pos[5]) && isdigit(pos[6]) && isdigit(pos[8]) && isdigit(pos[9]) &&
            isdigit(pos[11]) && isdigit(pos[12]) && isdigit(pos[14]) && isdigit(pos[15])) {
            return true;
        }
        pos++;
    }
    return false;
}

// Extract HH:MM from datetime text (searches for pattern in the string)
void Manager_Matrix::extractTimeFromText(const char* text, char* timeBuffer, size_t bufferSize) {
    if (!text || !timeBuffer || bufferSize < 6) {
        return;
    }
    
    // Find the datetime pattern in the string
    const char* pos = text;
    while (*pos && strlen(pos) >= 19) {
        // Check if current position has the datetime pattern
        if (pos[4] == '-' && pos[7] == '-' && pos[10] == ' ' && 
            pos[13] == ':' && pos[16] == ':' &&
            isdigit(pos[0]) && isdigit(pos[1]) && isdigit(pos[2]) && isdigit(pos[3]) &&
            isdigit(pos[5]) && isdigit(pos[6]) && isdigit(pos[8]) && isdigit(pos[9]) &&
            isdigit(pos[11]) && isdigit(pos[12]) && isdigit(pos[14]) && isdigit(pos[15])) {
            
            // Found the pattern! Extract HH:MM from position 11-15
            strncpy(timeBuffer, &pos[11], 5);  // Copy "HH:MM"
            timeBuffer[5] = '\0';
            return;
        }
        pos++;
    }
    
    // If no pattern found, clear the buffer
    timeBuffer[0] = '\0';
}

// Update colon visibility state for clock display
void Manager_Matrix::updateClockColon() {
    unsigned long currentTime = millis();
    
    // Flash colon every 500ms
    if (currentTime - clockData.lastColonUpdate >= 500) {
        clockData.colonVisible = !clockData.colonVisible;
        clockData.lastColonUpdate = currentTime;
        
        // Redraw just the clock area to update colon
        if (clockData.isActive && strlen(clockData.displayTime) > 0) {
            if (!acquireMatrix("updateClockColon")) {
                return;
            }
            
            displayClock(clockData.x, clockData.y);
            matrix->show();
            releaseMatrix();
        }
    }
}

// Display clock with flashing colon
void Manager_Matrix::displayClock(int x, int y) {
    if (!matrix || !validateCoordinates(x, y)) {
        return;
    }
    
    matrix->setTextColor(matrix->color565(255, 255, 255));
    
    // Clear the clock area (30 pixels should be enough for "HH:MM")
    matrix->fillRect(x, y, 30, 8, 0);
    
    // Find colon position in the display time
    char* colonPos = strchr(clockData.displayTime, ':');
    if (colonPos != nullptr) {
        // Calculate position before colon
        int colonIndex = colonPos - clockData.displayTime;
        
        // Display text before colon (HH)
        if (colonIndex > 0) {
            char beforeColon[8];
            strncpy(beforeColon, clockData.displayTime, colonIndex);
            beforeColon[colonIndex] = '\0';
            
            matrix->setCursor(x, y);
            matrix->print(beforeColon);
        }
        
        // Display colon (visible or invisible)
        int colonX = x + (colonIndex * 6); // 6 pixels per character
        matrix->setCursor(colonX, y);
        if (clockData.colonVisible) {
            matrix->print(":");
        } else {
            matrix->print(" "); // Space to maintain alignment
        }
        
        // Display text after colon (MM)
        if (strlen(colonPos + 1) > 0) {
            int afterColonX = colonX + 6; // 6 pixels for colon/space
            matrix->setCursor(afterColonX, y);
            matrix->print(colonPos + 1);
        }
    } else {
        // No colon found, display text normally
        matrix->setCursor(x, y);
        matrix->print(clockData.displayTime);
    }
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
        DisplayMode oldMode = currentMode;
        currentMode = mode;
        lastModeChange = millis();
        
        // Reset scroll state when changing modes
        if (mode == MODE_READY_SCREEN) {
            scrollState.offset = 0;
            scrollState.isPaused = false;
            scrollState.needsUpdate = true;
            memset(scrollState.lastDisplayedIP, 0, sizeof(scrollState.lastDisplayedIP));
        } else {
            // When leaving ready screen mode, reset IP scroll state to stop updates
            scrollState.needsUpdate = false;
            scrollState.isPaused = true;
        }
        
        // Reset sensor scroll states when changing modes
        if (mode != MODE_SENSOR_DATA) {
            for (int i = 0; i < MAX_SCROLLING_SENSORS; i++) {
                sensorScrollStates[i].isActive = false;
                resetSensorScrollState(i);
            }
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

// Enhanced sensor data handling with memory safety, automatic clock detection, and scrolling animation
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
    int scrollingSensorCount = 0;  // Separate counter for scrolling sensors
    const int maxSensors = 8; // Reduced to prevent memory issues
    
    // Reset clock state and sensor scroll states for this update
    clockData.isActive = false;
    for (int i = 0; i < MAX_SCROLLING_SENSORS; i++) {
        sensorScrollStates[i].isActive = false;
    }
    
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
        
        // Check if this text contains time data
        if (isTimeFormat(text)) {
            // This is time data - extract HH:MM and set internal clock
            char timeBuffer[8];
            extractTimeFromText(text, timeBuffer, sizeof(timeBuffer));
            
            // Parse hours and minutes from HH:MM format
            if (strlen(timeBuffer) >= 5 && timeBuffer[2] == ':') {
                int hours = (timeBuffer[0] - '0') * 10 + (timeBuffer[1] - '0');
                int minutes = (timeBuffer[3] - '0') * 10 + (timeBuffer[4] - '0');
                
                // Set internal clock and position
                setInternalClock(hours, minutes);
                clockData.x = x;
                clockData.y = y;
                clockData.isActive = true;
                clockData.lastColonUpdate = millis();
                
                // Display the clock with current colon state
                displayClock(x, y);
            }
        } else {
            // Regular sensor data - handle based on animation type
            if (currentAnimationType == ANIMATION_SLIDE) {
                // Use scrolling animation for this sensor - render immediately like IP address
                updateSensorScrollState(scrollingSensorCount, text, x, y, MATRIX_WIDTH - x);
                renderSensorScrollingText(scrollingSensorCount);
                scrollingSensorCount++;  // Only increment for scrolling sensors
            } else {
                // Use traditional truncation behavior
                safeTextCopy(textBuffer, text, sizeof(textBuffer));
                
                // Display the text normally with truncation
                matrix->setTextColor(0xFFFFFF);
                matrix->setCursor(x, y);
                
                // Calculate fit and truncate if necessary
                int fitChars = calculateFitChars(textBuffer, x);
                if (fitChars >= strlen(textBuffer)) {
                    matrix->print(textBuffer);
                } else if (fitChars > 3) {
                    char truncatedBuffer[MAX_TEXT_LENGTH + 1];
                    safeTextCopy(truncatedBuffer, textBuffer, fitChars - 2);
                    strcat(truncatedBuffer, "..");
                    matrix->print(truncatedBuffer);
                } else if (fitChars > 0) {
                    char truncatedBuffer[MAX_TEXT_LENGTH + 1];
                    safeTextCopy(truncatedBuffer, textBuffer, fitChars + 1);
                    matrix->print(truncatedBuffer);
                }
                
            }
        }
        
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

// Config application with validation and animation type parsing
void Manager_Matrix::applyConfig(const JsonDocument& configDoc) {
    if (!initialized || !matrix) {
        return;
    }
    
    if (!acquireMatrix("applyConfig")) {
        return;
    }
    
    setDisplayMode(MODE_CONFIG_DATA);
    
    // Parse animation type from config - configDoc IS the matrix config section
    if (configDoc.containsKey("animation_type")) {
        String animationType = configDoc["animation_type"].as<String>();
        animationType.toLowerCase();
        
        if (animationType == "slide") {
            currentAnimationType = ANIMATION_SLIDE;
            Serial.println("[Manager_Matrix] Animation type set to SLIDE");
        } else {
            currentAnimationType = ANIMATION_NONE;
            Serial.println("[Manager_Matrix] Animation type set to NONE (default truncation)");
        }
    } else {
        // Default to no animation if not specified
        currentAnimationType = ANIMATION_NONE;
        Serial.println("[Manager_Matrix] No animation_type field found, using default truncation");
    }
    
    // Handle direct text display config (legacy support)
    if (configDoc.containsKey("text") && configDoc.containsKey("x") && configDoc.containsKey("y")) {
        const char* text = configDoc["text"];
        int x = configDoc["x"];
        int y = configDoc["y"];
        
        if (validateCoordinates(x, y) && text) {
            displayText(text, x, y);
        }
    }
    
    releaseMatrix();
    Serial.printf("[Manager_Matrix] Config applied safely. Animation type: %s\n", 
                  (currentAnimationType == ANIMATION_SLIDE) ? "slide" : "none");
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
    if (matrixTaskHandle != NULL) {
        UBaseType_t stackHighWaterMark = uxTaskGetStackHighWaterMark(matrixTaskHandle);
        if (stackHighWaterMark < 1000) {
            Serial.printf("[Manager_Matrix] WARNING: Matrix task stack low: %d bytes remaining\n", 
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
    // No animation logic needed - task handles updates
    checkStackUsage();
}

// Helper methods for scroll management
void Manager_Matrix::updateScrollState(const char* text, int maxWidth) {
    // This method is used for the IP scrolling on ready screen
    // Implementation remains the same as before
}

void Manager_Matrix::smartRefresh() {
    // Anti-flicker optimization placeholder
}

bool Manager_Matrix::contentChanged() {
    // Content change detection placeholder
    return true;
}