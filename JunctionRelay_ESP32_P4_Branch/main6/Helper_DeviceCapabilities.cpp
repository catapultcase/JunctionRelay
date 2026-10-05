#include "Helper_DeviceCapabilities.h"
#include "DeviceConfig.h"
#include "Device.h"
#include "Manager_I2C.h"

Helper_DeviceCapabilities::Helper_DeviceCapabilities() 
    : devicePtr(nullptr), inventory(nullptr),
      capabilitiesCached(false), screensCached(false), i2cDevicesCached(false) {
}

Helper_DeviceCapabilities::~Helper_DeviceCapabilities() {
}

void Helper_DeviceCapabilities::init(DeviceConfig* device, HardwareInventory* inv) {
    devicePtr = device;
    inventory = inv;
    clearCache();  // Reset cache when inventory changes
    // Serial.println("[Helper_DeviceCapabilities] Initialized with device and inventory");
}

String Helper_DeviceCapabilities::getDeviceCapabilitiesJSON() {
    if (!devicePtr) {
        Serial.println("[ERROR][Helper_DeviceCapabilities] Device not initialized");
        return "{}";
    }

    // Return cached result if available
    if (capabilitiesCached && !cachedCapabilitiesJSON.isEmpty()) {
        Serial.println("[Helper_DeviceCapabilities] Returning cached capabilities JSON");
        return cachedCapabilitiesJSON;
    }

    Serial.println("[Helper_DeviceCapabilities] Building capabilities JSON (first time)");
    StaticJsonDocument<2048> doc;
    
    // Build base device capabilities
    buildBaseCapabilities(doc);
    
    // Build screens array (combines all screen types)
    buildScreensArray(doc);
    
    // Build I2C devices array
    buildI2CDevicesArray(doc);
    
    String output;
    serializeJson(doc, output);
    
    // Cache the result
    cachedCapabilitiesJSON = output;
    capabilitiesCached = true;
    
    return output;
}

bool Helper_DeviceCapabilities::hasCapability(const String& capability) {
    if (!devicePtr) return false;
    
    if (capability == "onboard_screen") return devicePtr->hasOnboardScreen();
    if (capability == "onboard_led") return devicePtr->hasOnboardLED();
    if (capability == "onboard_rgb_led") return devicePtr->hasOnboardRGBLED();
    if (capability == "external_matrix") return devicePtr->hasExternalMatrix();
    if (capability == "external_neopixels") return devicePtr->hasExternalNeopixels();
    if (capability == "external_i2c_devices") return devicePtr->hasExternalI2CDevices();
    if (capability == "buttons") return devicePtr->hasButtons();
    if (capability == "battery") return devicePtr->hasBattery();
    if (capability == "ethernet") return devicePtr->supportsEthernet();
    if (capability == "wifi") return devicePtr->supportsWiFi();
    if (capability == "ble") return devicePtr->supportsBLE();
    if (capability == "usb") return devicePtr->supportsUSB();
    if (capability == "espnow") return devicePtr->supportsESPNow();
    if (capability == "http") return devicePtr->supportsHTTP();
    if (capability == "mqtt") return devicePtr->supportsMQTT();
    if (capability == "websockets") return devicePtr->supportsWebSockets();
    if (capability == "speaker") return devicePtr->hasSpeaker();
    if (capability == "microsd") return devicePtr->hasMicroSD();
    if (capability == "gateway") return devicePtr->isGateway();
    
    return false;
}

JsonArray Helper_DeviceCapabilities::getScreensList() {
    // Use cached screens if available
    if (screensCached && !cachedScreensJSON.isEmpty()) {
        StaticJsonDocument<2048> doc;
        deserializeJson(doc, cachedScreensJSON);
        return doc["Screens"].as<JsonArray>();
    }
    
    // Build and cache screens array
    StaticJsonDocument<2048> doc;
    buildScreensArray(doc);
    
    // Cache the screens JSON
    serializeJson(doc, cachedScreensJSON);
    screensCached = true;
    
    return doc["Screens"].as<JsonArray>();
}

int Helper_DeviceCapabilities::getScreenCount() {
    JsonArray screens = getScreensList();
    return screens.size();
}

bool Helper_DeviceCapabilities::hasScreen(const String& screenKey) {
    JsonArray screens = getScreensList();
    for (JsonVariant screen : screens) {
        if (screen["ScreenKey"] == screenKey) {
            return true;
        }
    }
    return false;
}

JsonArray Helper_DeviceCapabilities::getI2CDevicesList() {
    // Use cached I2C devices if available
    if (i2cDevicesCached && !cachedI2CDevicesJSON.isEmpty()) {
        StaticJsonDocument<2048> doc;
        deserializeJson(doc, cachedI2CDevicesJSON);
        return doc["I2cDevices"].as<JsonArray>();
    }
    
    // Build and cache I2C devices array
    StaticJsonDocument<2048> doc;
    buildI2CDevicesArray(doc);
    
    // Cache the I2C devices JSON
    serializeJson(doc, cachedI2CDevicesJSON);
    i2cDevicesCached = true;
    
    return doc["I2cDevices"].as<JsonArray>();
}

int Helper_DeviceCapabilities::getI2CDeviceCount() {
    if (!inventory) return 0;
    return inventory->i2cDevices.size();
}

int Helper_DeviceCapabilities::getNeoPixelStripCount() {
    if (!inventory) return 0;
    return inventory->neopixelPins.size();
}

bool Helper_DeviceCapabilities::hasNeoPixelStrips() {
    return getNeoPixelStripCount() > 0;
}

void Helper_DeviceCapabilities::buildBaseCapabilities(JsonDocument& doc) {
    doc["HasOnboardScreen"] = devicePtr->hasOnboardScreen();
    doc["HasOnboardLED"] = devicePtr->hasOnboardLED();
    doc["HasOnboardRGBLED"] = devicePtr->hasOnboardRGBLED();
    doc["HasExternalMatrix"] = devicePtr->hasExternalMatrix();
    doc["HasExternalNeopixels"] = devicePtr->hasExternalNeopixels();
    doc["HasExternalI2CDevices"] = devicePtr->hasExternalI2CDevices();
    doc["HasButtons"] = devicePtr->hasButtons();
    doc["HasBattery"] = devicePtr->hasBattery();
    doc["SupportsWiFi"] = devicePtr->supportsWiFi();
    doc["SupportsEthernet"] = devicePtr->supportsEthernet();
    doc["SupportsBLE"] = devicePtr->supportsBLE();
    doc["SupportsUSB"] = devicePtr->supportsUSB();
    doc["SupportsESPNow"] = devicePtr->supportsESPNow();
    doc["SupportsHTTP"] = devicePtr->supportsHTTP();
    doc["SupportsMQTT"] = devicePtr->supportsMQTT();
    doc["SupportsWebSockets"] = devicePtr->supportsWebSockets();
    doc["HasSpeaker"] = devicePtr->hasSpeaker();
    doc["HasMicroSD"] = devicePtr->hasMicroSD();
    doc["IsGateway"] = devicePtr->isGateway();
}

void Helper_DeviceCapabilities::buildScreensArray(JsonDocument& doc) {
    JsonArray screens = doc.createNestedArray("Screens");
    
    // Add onboard screens
    addOnboardScreens(screens);
    
    // Add I2C screens (from inventory)
    addI2CScreens(screens);
    
    // Add NeoPixel screens
    addNeoPixelScreens(screens);
    
    // Add matrix screens
    addMatrixScreens(screens);
    
    Serial.printf("[Helper_DeviceCapabilities] Built screens array with %d screens\n", screens.size());
}

void Helper_DeviceCapabilities::buildI2CDevicesArray(JsonDocument& doc) {
    JsonArray i2cDevices = doc.createNestedArray("I2cDevices");
    
    // Try to get I2C devices from Manager_I2C scan results first (includes endpoints)
    Manager_I2C* i2cManager = Manager_I2C::getInstance();
    if (i2cManager && i2cManager->hasScanResults()) {
        JsonArrayConst storedDevices = i2cManager->getStoredI2CDevices();
        
        // Copy the full device information (including endpoints) from Manager_I2C
        for (JsonVariantConst device : storedDevices) {
            JsonObject newDevice = i2cDevices.createNestedObject();
            
            // Copy all fields from the Manager_I2C scan results
            newDevice["I2CAddress"] = device["I2CAddress"];
            newDevice["DeviceType"] = device["DeviceType"];
            newDevice["CommunicationProtocol"] = device["CommunicationProtocol"];
            newDevice["IsEnabled"] = device["IsEnabled"];
            
            // Copy endpoints array if it exists
            if (device.containsKey("Endpoints")) {
                JsonArray endpoints = newDevice.createNestedArray("Endpoints");
                JsonArrayConst sourceEndpoints = device["Endpoints"];
                for (JsonVariantConst endpoint : sourceEndpoints) {
                    JsonObject newEndpoint = endpoints.createNestedObject();
                    newEndpoint["EndpointType"] = endpoint["EndpointType"];
                    newEndpoint["Address"] = endpoint["Address"];
                    newEndpoint["QoS"] = endpoint["QoS"];
                    newEndpoint["Notes"] = endpoint["Notes"];
                }
            }
            
            // Copy any additional fields (like EncoderNumber)
            if (device.containsKey("EncoderNumber")) {
                newDevice["EncoderNumber"] = device["EncoderNumber"];
            }
        }
        
        Serial.printf("[Helper_DeviceCapabilities] Added %d I2C devices from Manager_I2C scan results\n", storedDevices.size());
    }
    // Fallback to inventory (basic info only, no endpoints)
    else if (inventory && !inventory->i2cDevices.empty()) {
        for (const auto& device : inventory->i2cDevices) {
            JsonObject newDevice = i2cDevices.createNestedObject();
            newDevice["address"] = "0x" + String(device.address, HEX);  // Format as hex string
            newDevice["type"] = device.deviceType;
            // Note: No endpoints available from inventory
        }
        
        Serial.printf("[Helper_DeviceCapabilities] Added %d I2C devices from inventory (no endpoints)\n", inventory->i2cDevices.size());
    } else {
        Serial.println("[Helper_DeviceCapabilities] No I2C devices available from either Manager_I2C or inventory");
    }
}

void Helper_DeviceCapabilities::addOnboardScreens(JsonArray& screens) {
    if (devicePtr->hasOnboardScreen()) {
        JsonObject onboardScreen = screens.createNestedObject();
        onboardScreen["ScreenKey"] = "onboard";
        onboardScreen["DisplayName"] = "Onboard Display";
        onboardScreen["ScreenType"] = "TFT";
        onboardScreen["SupportsConfigPayloads"] = true;
        onboardScreen["SupportsSensorPayloads"] = true;
        
        Serial.println("[Helper_DeviceCapabilities] Added onboard screen");
    }
}

void Helper_DeviceCapabilities::addI2CScreens(JsonArray& screens) {
    // Use inventory instead of manager
    if (inventory && !inventory->i2cDevices.empty()) {
        for (const auto& device : inventory->i2cDevices) {
            // Only add screen-capable I2C devices
            if (device.deviceType == "quad" || device.deviceType == "charlieplex") {
                JsonObject i2cScreen = screens.createNestedObject();
                i2cScreen["ScreenKey"] = "0x" + String(device.address, HEX);
                i2cScreen["DisplayName"] = device.deviceType + " Display (0x" + String(device.address, HEX) + ")";
                i2cScreen["ScreenType"] = "I2C";
                i2cScreen["SupportsConfigPayloads"] = true;
                i2cScreen["SupportsSensorPayloads"] = true;
                i2cScreen["I2CAddress"] = device.address;
                i2cScreen["DeviceType"] = device.deviceType;
            }
        }
        
        Serial.printf("[Helper_DeviceCapabilities] Added I2C screens from inventory\n");
    } else {
        Serial.println("[Helper_DeviceCapabilities] No I2C devices in inventory for screens");
    }
}

void Helper_DeviceCapabilities::addNeoPixelScreens(JsonArray& screens) {
    if (!devicePtr->hasExternalNeopixels()) {
        return;
    }
    
    // Use inventory instead of manager
    if (!inventory || inventory->neopixelPins.empty()) {
        Serial.println("[Helper_DeviceCapabilities] No NeoPixel pins in inventory");
        return;
    }
    
    int stripCount = inventory->neopixelPins.size();
    
    // Always report as individual screens: "neopixel_0", "neopixel_1", etc.
    for (int i = 0; i < stripCount; i++) {
        JsonObject neopixelScreen = screens.createNestedObject();
        neopixelScreen["ScreenKey"] = "neopixel_" + String(i);
        neopixelScreen["DisplayName"] = "NeoPixel Strip " + String(i);
        neopixelScreen["ScreenType"] = "NeoPixel";
        neopixelScreen["SupportsConfigPayloads"] = true;
        neopixelScreen["SupportsSensorPayloads"] = true;
        neopixelScreen["StripIndex"] = i;
        neopixelScreen["PixelCount"] = inventory->neopixelPins[i].pixelCount;
        neopixelScreen["Pin"] = inventory->neopixelPins[i].pin;
    }
    
    Serial.printf("[Helper_DeviceCapabilities] Added %d NeoPixel screens\n", stripCount);
}

void Helper_DeviceCapabilities::addMatrixScreens(JsonArray& screens) {
    if (devicePtr->hasExternalMatrix()) {
        JsonObject matrixScreen = screens.createNestedObject();
        matrixScreen["ScreenKey"] = "matrix";
        matrixScreen["DisplayName"] = "External Matrix";
        matrixScreen["ScreenType"] = "matrix";
        matrixScreen["SupportsConfigPayloads"] = true;
        matrixScreen["SupportsSensorPayloads"] = true;
        
        Serial.println("[Helper_DeviceCapabilities] Added matrix screen");
    }
}

void Helper_DeviceCapabilities::clearCache() {
    cachedCapabilitiesJSON = "";
    cachedScreensJSON = "";
    cachedI2CDevicesJSON = "";
    capabilitiesCached = false;
    screensCached = false;
    i2cDevicesCached = false;
    // Serial.println("[Helper_DeviceCapabilities] Cache cleared");
}