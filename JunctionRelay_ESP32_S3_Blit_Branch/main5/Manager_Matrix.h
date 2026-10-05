#ifndef MANAGER_MATRIX_H
#define MANAGER_MATRIX_H

#include <Adafruit_Protomatter.h>
#include "Interface_ScreenDestination.h"
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

class Manager_Connections;

// Matrix dimensions
#define MATRIX_WIDTH 64
#define MATRIX_HEIGHT 32

// Number of address pins based on height
#if MATRIX_HEIGHT == 16
#define NUM_ADDR_PINS 3
#elif MATRIX_HEIGHT == 32
#define NUM_ADDR_PINS 4
#elif MATRIX_HEIGHT == 64
#define NUM_ADDR_PINS 5
#else
#define NUM_ADDR_PINS 4  // Default for 32-height matrix
#endif

// Maximum number of sensor rows that can have scrolling animation
#define MAX_SCROLLING_SENSORS 8

class Manager_Matrix : public ScreenDestination {
public:
    // Static method to get the singleton instance
    static Manager_Matrix* getInstance();
    
    // Matrix initialization and control methods
    void begin(uint8_t* rgbPins, uint8_t* addrPins, uint8_t clockPin, uint8_t latchPin, uint8_t oePin);
    void startUpdateTask(); // Start the background task (called by StartupScheduler)
    void stop(); // Stop the update task
    void clearDisplay();
    void displayText(const char* text, int x, int y);
    void displayMultiText(const char* text, int x, int y);
    void showReadyScreen();
    
    // Method to set connection manager reference - FIXED to use Manager_Connections
    void setManager_Connections(Manager_Connections* cm);
    
    // Method to refresh the ready screen (for IP updates)
    void refreshReadyScreen();

    // Get matrix pointer for blit rendering (used by Display_Manager_Blit_Matrix)
    Adafruit_Protomatter* getMatrix() { return matrix; }

    // ScreenDestination interface methods
    String getScreenId() const override;
    void applyConfig(const JsonDocument& configDoc) override;
    void updateSensorData(const JsonDocument& sensorDoc) override;
    bool matchesScreenId(const String& screenId, const JsonDocument& doc) const override;
    const char* getConfigKey() const override;
    void update() override;

private:
    // Private constructor for singleton pattern
    Manager_Matrix();
    
    // Destructor to clean up resources
    ~Manager_Matrix();
    
    // Static instance pointer
    static Manager_Matrix* instance;
    
    // The matrix instance
    Adafruit_Protomatter* matrix;
    
    // Thread safety
    SemaphoreHandle_t matrixMutex;
    static constexpr TickType_t MUTEX_TIMEOUT_MS = 100;
    
    // Flag to check if the matrix is initialized
    bool initialized;
    
    // Connection manager reference for status display - FIXED to use Manager_Connections
    Manager_Connections* connMgr;
    
    // Task management (following QuadDisplay pattern)
    TaskHandle_t matrixTaskHandle;
    bool taskRunning;
    bool taskStarted;
    static void matrixTaskFunction(void* parameter);
    void internalUpdate(); // The actual update logic, called by task
    
    // Display state management
    enum DisplayMode {
        MODE_READY_SCREEN,
        MODE_SENSOR_DATA,
        MODE_CONFIG_DATA
    };
    
    DisplayMode currentMode;
    unsigned long lastModeChange;
    
    // Animation configuration
    enum AnimationType {
        ANIMATION_NONE,     // Default truncation behavior
        ANIMATION_SLIDE     // Scrolling text animation
    };
    
    AnimationType currentAnimationType;
    
    // Individual sensor scroll states for sliding animation
    struct SensorScrollState {
        int offset;
        unsigned long lastUpdateTime;
        unsigned long pauseStartTime;
        bool isPaused;
        bool needsUpdate;
        char lastDisplayedText[64];  // Cache last text to detect changes
        int textWidth;               // Cached text width
        bool isActive;               // Whether this sensor slot is currently in use
        int x, y;                   // Position for this sensor
        int maxWidth;               // Maximum width available for this sensor
    };
    
    SensorScrollState sensorScrollStates[MAX_SCROLLING_SENSORS];
    
    // Clock functionality with internal timekeeping
    struct ClockData {
        bool isActive;
        char displayTime[8];      // "HH:MM" for display
        int hours, minutes;       // Internal time tracking
        unsigned long lastSecondUpdate;  // For second increments
        unsigned long lastColonUpdate;   // For colon flashing
        bool colonVisible;        // Current state of colon visibility
        int x, y;                // Position for clock display
    } clockData;
    
    // Scrolling IP display variables (with anti-flicker)
    struct ScrollState {
        int offset;
        unsigned long lastUpdateTime;
        unsigned long pauseStartTime;
        bool isPaused;
        bool needsUpdate;
        char lastDisplayedIP[20];  // Cache last IP to detect changes
        int textWidth;             // Cached text width
    } scrollState;
    
    // Static text buffers to avoid dynamic allocation
    static constexpr size_t MAX_TEXT_LENGTH = 63;
    char textBuffer[MAX_TEXT_LENGTH + 1];
    char ipBuffer[20];
    char versionBuffer[32];
    
    // Double buffering for flicker reduction
    bool useDoubleBuffering;
    uint16_t* backBuffer;
    
    // Helper methods
    void safeTextCopy(char* dest, const char* src, size_t destSize);
    int calculateFitChars(const char* text, int x);
    bool validateCoordinates(int x, int y);
    void updateScrollState(const char* text, int maxWidth);
    void renderScrollingText(const char* text, int x, int y, int maxWidth);
    void setDisplayMode(DisplayMode mode);
    
    // New sensor scrolling methods
    void initializeSensorScrollStates();
    void resetSensorScrollState(int sensorIndex);
    void updateSensorScrollState(int sensorIndex, const char* text, int x, int y, int maxWidth);
    void renderSensorScrollingText(int sensorIndex);
    bool shouldUpdateSensorScroll(int sensorIndex);
    
    // Clock helper methods
    bool isTimeFormat(const char* text);
    void extractTimeFromText(const char* text, char* timeBuffer, size_t bufferSize);
    void setInternalClock(int hours, int minutes);
    void updateInternalClock();
    void displayClock(int x, int y);
    void updateClockColon();
    
    // Thread-safe matrix operations
    bool acquireMatrix(const char* caller = "unknown");
    void releaseMatrix();
    
    // Memory management
    void initializeBuffers();
    void cleanupBuffers();
    
    // Anti-flicker optimizations
    void smartRefresh();
    bool contentChanged();
    
    // Debug and monitoring
    void logMemoryUsage();
    void checkStackUsage();
};

#endif // MANAGER_MATRIX_H