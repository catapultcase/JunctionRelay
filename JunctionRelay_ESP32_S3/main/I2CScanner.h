#ifndef I2C_SCANNER_H
#define I2C_SCANNER_H

#include <Wire.h>
#include <ArduinoJson.h>

struct I2CDeviceInfo {
    uint8_t address;
    String deviceType;
    String displayName;
    bool requiresManager;
    bool isDisplay;
};

class I2CScanner {
public:

    
    // Enhanced scan with device recognition and JSON population
    static String scanAndConfigureDevices(TwoWire& wireInterface, StaticJsonDocument<2048>& doc, const String& devicePrefix) {
        Serial.println("[DEBUG][I2CScanner] Starting I2C scan with device recognition...");
        Serial.flush();
        
        // Use the Wire interface as already configured by the device - but ensure it's initialized
        String interfaceName = (&wireInterface == &Wire1) ? "Wire1" : "Wire";
        Serial.printf("[DEBUG][I2CScanner] Using %s interface for device prefix: %s\n", 
                      interfaceName.c_str(), devicePrefix.c_str());
        
        // Ensure I2C is properly initialized (defensive programming)
        if (&wireInterface == &Wire1) {
            Serial.println("[DEBUG][I2CScanner] Ensuring Wire1 is initialized (SDA=41, SCL=40)");
            wireInterface.begin(41, 40);
            wireInterface.setClock(400000);
        } else {
            Serial.println("[DEBUG][I2CScanner] Ensuring Wire is initialized (default pins)");
            wireInterface.begin();
            wireInterface.setClock(400000);
        }
        
        Serial.flush();
        delay(100);  // Give I2C time to stabilize after (re)initialization
        
        String result = "[";
        int nDevices = 0;
        bool foundSeesaw = false;
        bool foundQuadDisplay = false;
        
        // Ensure JSON arrays exist
        if (!doc.containsKey("Screens")) {
            doc.createNestedArray("Screens");
        }
        JsonArray screens = doc["Screens"].as<JsonArray>();
        JsonArray i2cDevices = doc.createNestedArray("I2cDevices");
        
        Serial.println("[DEBUG][I2CScanner] Starting address scan...");
        Serial.flush();
        
        for (int address = 1; address < 127; address++) {
            wireInterface.beginTransmission((uint8_t)address);
            uint8_t error = wireInterface.endTransmission();

            if (error == 0) {
                if (nDevices > 0) result += ", ";
                result += "0x" + String(address, HEX);
                nDevices++;

                Serial.printf("[DEBUG][I2CScanner] *** DEVICE FOUND *** at address 0x%02X\n", address);
                Serial.flush();

                // Identify and configure known devices
                I2CDeviceInfo deviceInfo = identifyDevice((uint8_t)address);
                
                Serial.printf("[DEBUG][I2CScanner] Device identified as: %s\n", deviceInfo.deviceType.c_str());
                Serial.flush();
                
                if (deviceInfo.deviceType != "Unknown") {
                    if (deviceInfo.deviceType == "Seesaw_Encoder") {
                        configureSeesawDevice(i2cDevices, devicePrefix);
                        foundSeesaw = true;
                        Serial.println("[DEBUG][I2CScanner] Configured Seesaw device");
                    }
                    else if (deviceInfo.deviceType == "QuadDisplay") {
                        configureQuadDisplayDevice(screens, (uint8_t)address);
                        foundQuadDisplay = true;
                        Serial.printf("[DEBUG][I2CScanner] Configured Quad display at 0x%02X\n", address);
                    }
                    Serial.flush();
                } else {
                    // Log unknown devices for debugging
                    Serial.printf("[DEBUG][I2CScanner] Unknown device at 0x%02X\n", address);
                    Serial.flush();
                }
            }
            
            // Minimal delay like the working scanner
            delay(10);
        }
        
        // Specifically check for Quad display addresses with detailed logging
        Serial.println("[DEBUG][I2CScanner] Checking specifically for Quad displays (0x70-0x77):");
        Serial.flush();
        for (int addr = 0x70; addr <= 0x77; addr++) {
            wireInterface.beginTransmission((uint8_t)addr);
            uint8_t error = wireInterface.endTransmission();
            if (error == 0) {
                Serial.printf("[DEBUG][I2CScanner] ✓ Found device at Quad display address 0x%02X\n", addr);
            } else {
                Serial.printf("[DEBUG][I2CScanner] ✗ No device at 0x%02X (error: %d)\n", addr, error);
            }
            Serial.flush();
            delay(10);
        }

        result += "]";
        Serial.printf("[DEBUG][I2CScanner] === SCAN COMPLETE === Found %d devices: %s\n", nDevices, result.c_str());
        Serial.flush();
        
        // Return flags for what was found
        doc["FoundSeesaw"] = foundSeesaw;
        doc["FoundQuadDisplay"] = foundQuadDisplay;
        
        return result;
    }

private:
    static I2CDeviceInfo identifyDevice(uint8_t address) {
        I2CDeviceInfo info;
        info.address = address;
        info.requiresManager = false;
        info.isDisplay = false;
        
        if (address == 0x36) {
            info.deviceType = "Seesaw_Encoder";
            info.displayName = "Seesaw Encoder with Button";
            info.requiresManager = true;
            info.isDisplay = false;
        }
        // All possible HT16K33 addresses for Quad displays (0x70-0x77)
        else if (address >= 0x70 && address <= 0x77) {
            info.deviceType = "QuadDisplay";
            info.displayName = "Adafruit Quad Alphanumeric Display";
            info.requiresManager = false;
            info.isDisplay = true;
        }
        else {
            info.deviceType = "Unknown";
            info.displayName = "Unknown I2C Device";
        }
        
        return info;
    }
    
    static void configureSeesawDevice(JsonArray& i2cDevices, const String& devicePrefix) {
        Serial.println("[DEBUG][I2CScanner] Configuring Seesaw encoder device");
        
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
    
    static void configureQuadDisplayDevice(JsonArray& screens, uint8_t address) {
        Serial.printf("[DEBUG][I2CScanner] Configuring Quad Display device at 0x%02X\n", address);
        
        JsonObject screen = screens.createNestedObject();
        screen["ScreenKey"] = "0x" + String(address, HEX);
        screen["DisplayName"] = "Quad Display (0x" + String(address, HEX) + ")";
        screen["ScreenType"] = "Alpha Quad LCD";
        screen["I2CAddress"] = "0x" + String(address, HEX);
        screen["SupportsConfigPayloads"] = true;
        screen["SupportsSensorPayloads"] = true;
    }
};

#endif // I2C_SCANNER_H