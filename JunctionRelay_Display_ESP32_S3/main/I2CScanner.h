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
    // Basic scan method
    static String scanI2CDevices(TwoWire& wireInterface) {
        String result = "";
        Serial.println("[DEBUG][I2CScanner] Starting I2C scan...");
        
        for (uint8_t addr = 1; addr < 127; addr++) {
            wireInterface.beginTransmission(addr);
            uint8_t error = wireInterface.endTransmission();
            
            if (error == 0) {
                result += String("Device found at address 0x") + (addr < 16 ? "0" : "") + String(addr, HEX) + " ";
                Serial.printf("[DEBUG][I2CScanner] Device found at address 0x%02X\n", addr);
            }
            delay(10);
        }
        
        if (result.length() == 0) {
            result = "No I2C devices found.";
            Serial.println("[DEBUG][I2CScanner] No I2C devices found.");
        }
        
        return result;
    }
    
    // Enhanced scan with device recognition and JSON population
    static String scanAndConfigureDevices(TwoWire& wireInterface, StaticJsonDocument<2048>& doc, const String& devicePrefix) {
        Serial.println("[DEBUG][I2CScanner] Starting enhanced I2C scan with device recognition...");
        
        // Initialize Wire interface explicitly like the old working code
        if (&wireInterface == &Wire1) {
            // QtPy STEMMA QT pins
            Serial.println("[DEBUG][I2CScanner] Initializing Wire1 for QtPy (SDA=41, SCL=40)");
            wireInterface.begin(41, 40);
            wireInterface.setClock(400000);
        } else {
            // Feather default I2C pins
            Serial.println("[DEBUG][I2CScanner] Initializing Wire for Feather (default pins)");
            wireInterface.begin();
            wireInterface.setClock(400000);
        }
        
        delay(100);  // Give I2C time to stabilize like old code
        
        String result = "[";
        int nDevices = 0;
        bool foundSeesaw = false;
        bool foundQuadDisplay = false;
        
        JsonArray screens = doc["Screens"].as<JsonArray>();
        JsonArray i2cDevices = doc.createNestedArray("I2cDevices");
        
        for (uint8_t address = 1; address < 127; address++) {
            wireInterface.beginTransmission(address);
            uint8_t error = wireInterface.endTransmission();

            if (error == 0) {
                if (nDevices > 0) result += ", ";
                result += "0x" + String(address, HEX);
                nDevices++;

                Serial.printf("[DEBUG][I2CScanner] Processing device at address 0x%02X\n", address);

                // Identify and configure known devices
                I2CDeviceInfo deviceInfo = identifyDevice(address);
                
                if (deviceInfo.deviceType != "Unknown") {
                    if (deviceInfo.deviceType == "Seesaw_Encoder") {
                        configureSeesawDevice(i2cDevices, devicePrefix);
                        foundSeesaw = true;
                    }
                    else if (deviceInfo.deviceType == "QuadDisplay") {
                        configureQuadDisplayDevice(screens, address);
                        foundQuadDisplay = true;
                    }
                }
            }
        }

        result += "]";
        Serial.printf("[DEBUG][I2CScanner] I2C scan complete. Found %d devices: %s\n", nDevices, result.c_str());
        
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
        
        switch (address) {
            case 0x36:
                info.deviceType = "Seesaw_Encoder";
                info.displayName = "Seesaw Encoder with Button";
                info.requiresManager = true;
                info.isDisplay = false;
                break;
            case 0x70:
                info.deviceType = "QuadDisplay";
                info.displayName = "Adafruit Quad Alphanumeric Display";
                info.requiresManager = false;
                info.isDisplay = true;
                break;
            default:
                info.deviceType = "Unknown";
                info.displayName = "Unknown I2C Device";
                break;
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
        Serial.println("[DEBUG][I2CScanner] Configuring Quad Display device");
        
        JsonObject screen = screens.createNestedObject();
        screen["ScreenKey"] = "0x" + String(address, HEX);
        screen["DisplayName"] = "Quad Display";
        screen["ScreenType"] = "Alpha Quad LCD";
        screen["SupportsConfigPayloads"] = true;
        screen["SupportsSensorPayloads"] = true;
    }
};

#endif // I2C_SCANNER_H