#ifndef MANAGER_I2C_H
#define MANAGER_I2C_H

#include <Wire.h>
#include <ArduinoJson.h>
#include "Adafruit_seesaw.h"
#include "Manager_Connections.h"
#include "Manager_QuadDisplay.h"
#include "Manager_Charlieplex.h"

class Manager_Connections;
class Manager_MQTT;

// Constants for multiple encoder support
#define MAX_ENCODERS 8

// I2C Scanning strategies
enum I2CScanStrategy {
    STRATEGY_ESP32_ORIGINAL,    // Original working method for ESP32
    STRATEGY_ESP32_S3_UNIFIED   // Unified method for ESP32-S3
};

class Manager_I2C {
public:
    // Singleton pattern with Wire interface and optional pin specification
    static Manager_I2C* getInstance(Manager_Connections* connMgr = nullptr, TwoWire* wireInterface = nullptr, int sdaPin = -1, int sclPin = -1);
    
    // Public methods
    void begin();
    void runLoop();
    
    // MQTT integration
    void setMQTTManager(Manager_MQTT* mqtt) { mqttManager = mqtt; }
    
    // UPDATED: I2C scanning method with strategy selection
    String scanAndConfigureDevices(const String& devicePrefix, I2CScanStrategy strategy = STRATEGY_ESP32_ORIGINAL);
    
    // NEW: Methods to access stored scan results
    const JsonDocument& getScanResults() const;
    bool hasScanResults() const;
    JsonArrayConst getStoredScreens() const;
    JsonArrayConst getStoredI2CDevices() const;
    String getDevicePrefix() const;
    
    // Get the current Wire interface being used
    TwoWire* getWireInterface() { return wire; }
    
    // Get the I2C pin configuration
    int getSDAPin() { return sdaPin; }
    int getSCLPin() { return sclPin; }
    
private:
    // Private constructor to enforce singleton pattern
    Manager_I2C(Manager_Connections* connMgr, TwoWire* wireInterface, int sdaPin = -1, int sclPin = -1);
    
    // Private helper methods for device identification
    void configureSeesawDevice(JsonArray& i2cDevices, const String& devicePrefix);
    void configureQuadDisplayDevice(JsonArray& screens, uint8_t address);
    void configureCharlieDisplayDevice(JsonArray& screens, uint8_t address);
    void initializeManagers(bool foundSeesaw, bool foundQuadDisplay, bool foundCharlieplex, const String& devicePrefix);
    
    // NEW: Multiple encoder support methods
    void configureRotaryEncoderDevice(JsonArray& i2cDevices, uint8_t address, const String& devicePrefix);
    bool isRotaryEncoderAddress(uint8_t address);
    int getEncoderNumber(uint8_t address);
    
    // NEW: Dual scanning strategy methods
    int performScanWithStrategy(I2CScanStrategy strategy, JsonArray& screens, JsonArray& i2cDevices, const String& devicePrefix);
    int scanWithOriginalMethod(JsonArray& screens, JsonArray& i2cDevices, const String& devicePrefix);
    int scanWithUnifiedMethod(JsonArray& screens, JsonArray& i2cDevices, const String& devicePrefix);
    
    // Helper method for MQTT topic generation
    String getDevicePrefixForMQTT() const;
    
    // Instance variables
    Adafruit_seesaw ss;  // Keep for backward compatibility (legacy single encoder)
    int32_t encoder_position;  // Keep for backward compatibility
    Manager_Connections* connMgr;
    Manager_MQTT* mqttManager;
    TwoWire* wire;  // Pointer to the Wire interface to use
    int sdaPin, sclPin;  // I2C pin configuration (-1 = use defaults)
    bool initialized;
    
    // NEW: Multiple encoder support variables
    uint8_t encoderAddresses[MAX_ENCODERS];    // I2C addresses of found encoders
    int32_t encoderPositions[MAX_ENCODERS];    // Current position of each encoder
    Adafruit_seesaw* seesawInstances[MAX_ENCODERS];  // Seesaw instances for each encoder
    bool buttonStates[MAX_ENCODERS];           // Current button state of each encoder (true = pressed)
    int encoderCount;  // Number of encoders found and initialized
    
    // Internal storage for scan results
    StaticJsonDocument<2048> scanResults;
    bool scanResultsAvailable;
    String devicePrefix;
    
    // Static singleton instance
    static Manager_I2C* instance;
    
    // Task handle
    TaskHandle_t taskHandle;
};

#endif // MANAGER_I2C_H