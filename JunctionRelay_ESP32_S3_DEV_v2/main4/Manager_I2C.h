#ifndef MANAGER_I2C_H
#define MANAGER_I2C_H

#include <Wire.h>
#include "Adafruit_seesaw.h"

class ConnectionManager;

class Manager_I2C {
public:
    // Singleton pattern with Wire interface specification
    static Manager_I2C* getInstance(ConnectionManager* connMgr = nullptr, TwoWire* wireInterface = nullptr);
    
    // Public methods
    void begin();
    void runLoop();
    
    // Get the current Wire interface being used
    TwoWire* getWireInterface() { return wire; }
    
private:
    // Private constructor to enforce singleton pattern
    Manager_I2C(ConnectionManager* connMgr, TwoWire* wireInterface);
    
    // Instance variables
    Adafruit_seesaw ss;
    int32_t encoder_position;
    ConnectionManager* connMgr;
    TwoWire* wire;  // Pointer to the Wire interface to use
    bool initialized;
    
    // Static singleton instance
    static Manager_I2C* instance;
    
    // Task handle
    TaskHandle_t taskHandle;
};

#endif // MANAGER_I2C_H