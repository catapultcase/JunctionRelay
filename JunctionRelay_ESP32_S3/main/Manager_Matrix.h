#ifndef MANAGER_MATRIX_H
#define MANAGER_MATRIX_H

#include <Adafruit_Protomatter.h>
#include "ScreenDestination.h"
#include <ArduinoJson.h>

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
    
    // Static instance pointer
    static Manager_Matrix* instance;
    
    // The matrix instance
    Adafruit_Protomatter* matrix;
    
    // Flag to check if the matrix is initialized
    bool initialized;
    
    // Connection manager reference for status display
    ConnectionManager* connMgr;
    
    // Timer for periodic IP address updates
    static void refreshTimerCallback(void* parameter);
    static TaskHandle_t refreshTaskHandle;
    
    // Scrolling IP display variables
    int scrollOffset;
    unsigned long lastScrollTime;
    unsigned long pauseStartTime;
    bool isPaused;
    bool showingReadyScreen;  // Track if we're showing ready screen vs sensor data
    
    // Helper method to calculate how many characters will fit without wrapping
    int calculateFitChars(const char* text, int x);
};

#endif // MANAGER_MATRIX_H