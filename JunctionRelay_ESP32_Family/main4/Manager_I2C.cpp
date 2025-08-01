#include "Manager_I2C.h"
#include <ArduinoJson.h>
#include "Manager_Connections.h"
#include "Manager_QuadDisplay.h"
#include "Manager_Charlieplex.h"

// Initialize static instance
Manager_I2C* Manager_I2C::instance = nullptr;

Manager_I2C* Manager_I2C::getInstance(Manager_Connections* connMgr, TwoWire* wireInterface, int sdaPin, int sclPin) {
    if (instance == nullptr) {
        if (connMgr == nullptr || wireInterface == nullptr) {
            Serial.println("[ERROR][Manager_I2C] Manager_Connections and Wire interface required for first initialization");
            return nullptr;
        }
        instance = new Manager_I2C(connMgr, wireInterface, sdaPin, sclPin);
    }
    return instance;
}

Manager_I2C::Manager_I2C(Manager_Connections* connMgr, TwoWire* wireInterface, int sdaPin, int sclPin) 
    : connMgr(connMgr), wire(wireInterface), encoder_position(0), initialized(false), taskHandle(NULL), ss(wireInterface), scanResultsAvailable(false) {
    
    // Store I2C pin configuration
    this->sdaPin = sdaPin;
    this->sclPin = sclPin;
    
    Serial.printf("[I2C] Created with Wire interface at %p", wireInterface);
    if (sdaPin != -1 && sclPin != -1) {
        Serial.printf(", SDA=%d, SCL=%d\n", sdaPin, sclPin);
    } else {
        Serial.println(", using default pins");
    }
}

String Manager_I2C::scanAndConfigureDevices(const String& devicePrefix, I2CScanStrategy strategy) {
    Serial.printf("[I2C] Starting I2C scan with strategy: %s\n", 
                  strategy == STRATEGY_ESP32_ORIGINAL ? "ESP32_ORIGINAL" : "ESP32_S3_UNIFIED");
    
    // Store device prefix for later use
    this->devicePrefix = devicePrefix;
    
    // Clear and initialize internal storage
    scanResults.clear();
    scanResults.createNestedArray("Screens");
    scanResults.createNestedArray("I2cDevices");
    
    // Get references to our internal arrays
    JsonArray screens = scanResults["Screens"].as<JsonArray>();
    JsonArray i2cDevices = scanResults["I2cDevices"].as<JsonArray>();
    
    // Try primary strategy first
    int devicesFound = performScanWithStrategy(strategy, screens, i2cDevices, devicePrefix);
    
    // If primary strategy failed, try alternate strategy
    if (devicesFound == 0) {
        Serial.println("[I2C] Primary strategy found no devices, trying alternate strategy...");
        I2CScanStrategy altStrategy = (strategy == STRATEGY_ESP32_ORIGINAL) ? 
                                      STRATEGY_ESP32_S3_UNIFIED : STRATEGY_ESP32_ORIGINAL;
        
        // Clear arrays before trying alternate
        screens.clear();
        i2cDevices.clear();
        
        devicesFound = performScanWithStrategy(altStrategy, screens, i2cDevices, devicePrefix);
        
        if (devicesFound > 0) {
            Serial.printf("[I2C] Alternate strategy succeeded, found %d devices\n", devicesFound);
        }
    }
    
    // Build result string
    String result = "[";
    for (int i = 0; i < devicesFound; i++) {
        if (i > 0) result += ", ";
        // This is a simplified result - we'd need to track addresses properly
    }
    result += "]";
    
    // Store metadata in scan results
    scanResults["DevicePrefix"] = devicePrefix;
    scanResults["ScanTimestamp"] = millis();
    scanResults["DeviceCount"] = devicesFound;
    scanResults["StrategyUsed"] = (strategy == STRATEGY_ESP32_ORIGINAL) ? "ESP32_ORIGINAL" : "ESP32_S3_UNIFIED";
    
    // Mark scan results as available
    scanResultsAvailable = true;
    
    Serial.printf("[I2C] Scan complete - Found %d devices\n", devicesFound);
    
    return result;
}

int Manager_I2C::performScanWithStrategy(I2CScanStrategy strategy, JsonArray& screens, JsonArray& i2cDevices, const String& devicePrefix) {
    if (strategy == STRATEGY_ESP32_ORIGINAL) {
        return scanWithOriginalMethod(screens, i2cDevices, devicePrefix);
    } else {
        return scanWithUnifiedMethod(screens, i2cDevices, devicePrefix);
    }
}

int Manager_I2C::scanWithOriginalMethod(JsonArray& screens, JsonArray& i2cDevices, const String& devicePrefix) {
    Serial.println("[I2C] Using ESP32 Original scanning method");
    
    // Original method - explicit reset and setup
    wire->end();
    delay(50);
    
    if (sdaPin == -1 || sclPin == -1) {
        wire->begin();
    } else {
        wire->begin(sdaPin, sclPin);
    }
    
    wire->setClock(100000);
    delay(100);
    
    // Original scanning logic
    byte error, address;
    int nDevices = 0;
    bool foundSeesaw = false;
    bool foundQuadDisplay = false;
    bool foundCharlieplex = false;
    
    Serial.println("[I2C] Scanning from 0x01 to 0x7E...");
    for(address = 1; address < 127; address++) {
        wire->beginTransmission(address);
        error = wire->endTransmission();

        if (error == 0) {
            Serial.print("I2C device found at address 0x");
            if (address < 16) Serial.print("0");
            Serial.print(address, HEX);
            Serial.println("  !");
            nDevices++;
            
            // Identify and configure devices
            if (address == 0x36) {
                foundSeesaw = true;
                configureSeesawDevice(i2cDevices, devicePrefix);
            }
            else if (address >= 0x70 && address <= 0x73) {
                foundQuadDisplay = true;
                configureQuadDisplayDevice(screens, address);
            }
            else if (address >= 0x74 && address <= 0x77) {
                foundCharlieplex = true;
                configureCharlieDisplayDevice(screens, address);
            }
        }
        else if (error == 4) {
            Serial.print("Unknown error at address 0x");
            if (address < 16) Serial.print("0");
            Serial.println(address, HEX);
        }
    }
    
    // Initialize managers based on what was found
    initializeManagers(foundSeesaw, foundQuadDisplay, foundCharlieplex, devicePrefix);
    
    return nDevices;
}

int Manager_I2C::scanWithUnifiedMethod(JsonArray& screens, JsonArray& i2cDevices, const String& devicePrefix) {
    Serial.println("[I2C] Using ESP32-S3 Unified scanning method");
    
    // Unified method - simple initialization, no reset
    if (sdaPin == -1 || sclPin == -1) {
        Serial.println("[I2C] Using board default pins");
        wire->begin();
    } else {
        Serial.printf("[I2C] Using custom pins SDA=%d, SCL=%d\n", sdaPin, sclPin);
        wire->begin(sdaPin, sclPin);
    }
    
    wire->setClock(100000);
    delay(100);
    
    // Unified scanning logic - ignore error 2
    byte error, address;
    int nDevices = 0;
    bool foundSeesaw = false;
    bool foundQuadDisplay = false;
    bool foundCharlieplex = false;
    
    Serial.println("[I2C] Scanning from 0x01 to 0x7E...");
    for(address = 0x01; address < 0x7f; address++) {
        wire->beginTransmission(address);
        error = wire->endTransmission();
        
        if (error == 0) {
            Serial.print("I2C device found at address 0x");
            if (address < 16) Serial.print("0");
            Serial.print(address, HEX);
            Serial.println("  !");
            nDevices++;
            
            // Identify and configure devices
            if (address == 0x36) {
                foundSeesaw = true;
                configureSeesawDevice(i2cDevices, devicePrefix);
            }
            else if (address >= 0x70 && address <= 0x73) {
                foundQuadDisplay = true;
                configureQuadDisplayDevice(screens, address);
            }
            else if (address >= 0x74 && address <= 0x77) {
                foundCharlieplex = true;
                configureCharlieDisplayDevice(screens, address);
            }
        } 
        else if (error != 2) {  // Ignore NACK (error 2)
            Serial.print("Error ");
            Serial.print(error);
            Serial.print(" at address 0x");
            if (address < 16) Serial.print("0");
            Serial.println(address, HEX);
        }
    }
    
    // Initialize managers based on what was found
    initializeManagers(foundSeesaw, foundQuadDisplay, foundCharlieplex, devicePrefix);
    
    return nDevices;
}

void Manager_I2C::initializeManagers(bool foundSeesaw, bool foundQuadDisplay, bool foundCharlieplex, const String& devicePrefix) {
    // Only handle Seesaw - display managers are handled by StartupScheduler
    if (foundSeesaw) {
        Serial.println("[I2C] Seesaw found - will initialize when begin() is called");
    }
    
    if (foundQuadDisplay) {
        Serial.println("[I2C] QuadDisplay devices found - will be handled by StartupScheduler");
    }
    
    if (foundCharlieplex) {
        Serial.println("[I2C] Charlieplex devices found - will be handled by StartupScheduler");
    }
}

void Manager_I2C::configureSeesawDevice(JsonArray& i2cDevices, const String& devicePrefix) {
    Serial.println("[I2C] Configuring Seesaw encoder device");
    
    JsonObject i2cDevice = i2cDevices.createNestedObject();
    i2cDevice["I2CAddress"] = "0x36";
    i2cDevice["DeviceType"] = "Encoder with Button";
    i2cDevice["CommunicationProtocol"] = "MQTT";
    i2cDevice["IsEnabled"] = true;

    JsonArray endpoints = i2cDevice.createNestedArray("Endpoints");

    JsonObject endpoint1 = endpoints.createNestedObject();
    endpoint1["EndpointType"] = "Button";
    endpoint1["Address"] = "JunctionRelay/" + devicePrefix + "/button";
    endpoint1["QoS"] = 1;
    endpoint1["Notes"] = "Button press detection endpoint";

    JsonObject endpoint2 = endpoints.createNestedObject();
    endpoint2["EndpointType"] = "Encoder";
    endpoint2["Address"] = "JunctionRelay/" + devicePrefix + "/encoder";
    endpoint2["QoS"] = 1;
    endpoint2["Notes"] = "Encoder movement endpoint";
}

void Manager_I2C::configureQuadDisplayDevice(JsonArray& screens, uint8_t address) {
    Serial.printf("[I2C] Configuring Quad Display device at 0x%02X\n", address);
    
    JsonObject screen = screens.createNestedObject();
    screen["ScreenKey"] = "0x" + String(address, HEX);
    screen["DisplayName"] = "Quad Display (0x" + String(address, HEX) + ")";
    screen["ScreenType"] = "Alpha Quad LCD";
    screen["DeviceType"] = "quad";
    screen["I2CAddress"] = "0x" + String(address, HEX);
    screen["SupportsConfigPayloads"] = true;
    screen["SupportsSensorPayloads"] = true;
}

void Manager_I2C::configureCharlieDisplayDevice(JsonArray& screens, uint8_t address) {
    Serial.printf("[I2C] Configuring Charlieplex Display device at 0x%02X\n", address);
    
    JsonObject screen = screens.createNestedObject();
    screen["ScreenKey"] = "0x" + String(address, HEX);
    screen["DisplayName"] = "Charlieplex Display (0x" + String(address, HEX) + ")";
    screen["ScreenType"] = "Charlieplex";
    screen["DeviceType"] = "charlieplex";
    screen["I2CAddress"] = "0x" + String(address, HEX);
    screen["SupportsConfigPayloads"] = true;
    screen["SupportsSensorPayloads"] = true;
}

// Methods to access stored scan results
const JsonDocument& Manager_I2C::getScanResults() const {
    return scanResults;
}

bool Manager_I2C::hasScanResults() const {
    return scanResultsAvailable;
}

JsonArrayConst Manager_I2C::getStoredScreens() const {
    if (!scanResultsAvailable) {
        // Return empty array if no scan results
        static StaticJsonDocument<32> emptyDoc;
        emptyDoc.to<JsonArray>(); // Ensure it's an array
        return emptyDoc["screens"].as<JsonArrayConst>();
    }
    return scanResults["Screens"].as<JsonArrayConst>();
}

JsonArrayConst Manager_I2C::getStoredI2CDevices() const {
    if (!scanResultsAvailable) {
        // Return empty array if no scan results
        static StaticJsonDocument<32> emptyDoc;
        emptyDoc.to<JsonArray>(); // Ensure it's an array
        return emptyDoc["devices"].as<JsonArrayConst>();
    }
    return scanResults["I2cDevices"].as<JsonArrayConst>();
}

String Manager_I2C::getDevicePrefix() const {
    return devicePrefix;
}

void Manager_I2C::begin() {
    if (initialized) {
        Serial.println("[I2C] Already initialized, skipping");
        return;
    }
    
    Serial.println("[I2C] Initializing I2C and Seesaw encoder...");
    
    // DO NOT CALL Wire.begin() here - the device has already configured I2C correctly
    // The Manager_I2C should use the I2C bus as already configured by the device
    Serial.printf("[I2C] Using I2C bus as configured by device (SDA=%d, SCL=%d)\n", sdaPin, sclPin);
    
    delay(100); // Stabilization delay
    
    // Initialize the seesaw with the I2C address
    if (!ss.begin(0x36)) {
        Serial.println("[ERROR][Manager_I2C] Couldn't find seesaw on I2C address 0x36");
        return;
    }
    
    uint32_t version = ((ss.getVersion() >> 16) & 0xFFFF);
    if (version != 4991) {
        Serial.println("[ERROR][Manager_I2C] Wrong firmware loaded?");
        return;
    }
    
    Serial.println("[I2C] Found Product 4991 (Encoder)");
    
    // Get starting position
    encoder_position = ss.getEncoderPosition();
    
    // Turn on the encoder
    ss.pinMode(24, INPUT_PULLUP);
    ss.setGPIOInterrupts((uint32_t)1 << 24, 1);
    ss.enableEncoderInterrupt();
    
    initialized = true;
    
    // Create task for processing I2C events
    xTaskCreatePinnedToCore(
        [](void* param) {
            Manager_I2C* manager = static_cast<Manager_I2C*>(param);
            Serial.printf("[Manager_I2C Task] Started on core %d\n", xPortGetCoreID());
            
            while (true) {
                manager->runLoop();
                vTaskDelay(pdMS_TO_TICKS(50)); // Check every 50ms
            }
        },
        "Manager_I2C_Task",
        4096,
        this,
        1,
        &taskHandle,
        1 // Run on Core 1
    );
    
    Serial.println("[I2C] Seesaw encoder initialized successfully");
}

void Manager_I2C::runLoop() {
    if (!initialized) return;
    
    // Read encoder position
    int32_t new_position = ss.getEncoderPosition();
    if (encoder_position != new_position) {
        Serial.printf("[I2C] Encoder position: %d\n", new_position);
        
        // TODO: Send encoder update via MQTT when Manager_Connections supports MQTT
        Serial.printf("[I2C] Encoder delta: %d (device: %s)\n", 
                     new_position - encoder_position, devicePrefix.c_str());
        
        encoder_position = new_position;
    }
    
    // Read button state
    if (!ss.digitalRead(24)) {
        Serial.println("[I2C] Button pressed!");
        
        // TODO: Send button press via MQTT when Manager_Connections supports MQTT
        Serial.printf("[I2C] Button pressed on device: %s\n", devicePrefix.c_str());
        
        // Simple debounce
        vTaskDelay(pdMS_TO_TICKS(200));
    }
}