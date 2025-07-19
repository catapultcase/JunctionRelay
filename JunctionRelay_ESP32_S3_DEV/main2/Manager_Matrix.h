#ifndef MANAGER_MATRIX_H
#define MANAGER_MATRIX_H

#include <Adafruit_Protomatter.h>
#include "ScreenDestination.h"
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

// Forward declaration to avoid circular includes
class ConnectionManager;

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

class Manager_Matrix : public ScreenDestination {
public:
    // Static method to get the singleton instance
    static Manager_Matrix* getInstance();
    
    // Matrix initialization and control methods
    void begin(uint8_t* rgbPins, uint8_t* addrPins, uint8_t clockPin, uint8_t latchPin, uint8_t oePin);
    void clearDisplay();
    void displayText(const char* text, int x, int y);
    void displayMultiText(const char* text, int x, int y);
    void showReadyScreen();
    
    // Method to set connection manager reference
    void setConnectionManager(ConnectionManager* cm);
    
    // Method to refresh the ready screen (for IP updates)
    void refreshReadyScreen();

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
    
    // Connection manager reference for status display
    ConnectionManager* connMgr;
    
    // Timer for periodic IP address updates
    static void refreshTimerCallback(void* parameter);
    static TaskHandle_t refreshTaskHandle;
    
    // Display state management
    enum DisplayMode {
        MODE_READY_SCREEN,
        MODE_SENSOR_DATA,
        MODE_CONFIG_DATA
    };
    
    DisplayMode currentMode;
    unsigned long lastModeChange;
    
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