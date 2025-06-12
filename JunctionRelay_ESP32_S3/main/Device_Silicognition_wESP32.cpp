#include "Device_Silicognition_wESP32.h"
#include "Utils.h"

// Static instance pointer for event handler
Device_Silicognition_wESP32* Device_Silicognition_wESP32::instance = nullptr;

// Make sure we have all required managers included
#if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    #include "Manager_QuadDisplay.h"
    #include "Manager_Charlieplex.h"
#endif

#if DEVICE_HAS_EXTERNAL_NEOPIXELS
    #include "Manager_NeoPixels.h"
#endif

Device_Silicognition_wESP32::Device_Silicognition_wESP32(ConnectionManager* connMgr)
: connMgr(connMgr), ethernetConnected(false), ethernetInitialized(false)
{
    // Set static instance for event handler
    instance = this;

    #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    detectedQuadDisplay = false;
    detectedCharlieDisplay = false;
    i2cInitTaskHandle = NULL;
    quadDisplayTaskHandle = NULL;
    charlieDisplayTaskHandle = NULL;
    #endif

    // Initialize NeoPixel pin defaults
    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    externalNeoPixelPin1 = DEFAULT_EXTERNAL_PIN_1;
    externalNeoPixelPin2 = DEFAULT_EXTERNAL_PIN_2;
    #endif
}

#if DEVICE_HAS_EXTERNAL_NEOPIXELS
void Device_Silicognition_wESP32::loadNeoPixelPreferences() {
    Preferences prefs;
    prefs.begin("neopixelConfig", true); // Read-only mode
    
    externalNeoPixelPin1 = prefs.getInt("neoPin1", DEFAULT_EXTERNAL_PIN_1);
    externalNeoPixelPin2 = prefs.getInt("neoPin2", DEFAULT_EXTERNAL_PIN_2);
    
    prefs.end();
    
    Serial.printf("[DEBUG][DEVICE] Loaded NeoPixel preferences: Pin1=%d, Pin2=%d\n", 
                  externalNeoPixelPin1, externalNeoPixelPin2);
}

void Device_Silicognition_wESP32::saveNeoPixelPreferences() {
    Preferences prefs;
    prefs.begin("neopixelConfig", false); // Read-write mode
    
    prefs.putInt("neoPin1", externalNeoPixelPin1);
    prefs.putInt("neoPin2", externalNeoPixelPin2);
    
    prefs.end();
    
    Serial.printf("[DEBUG][DEVICE] Saved NeoPixel preferences: Pin1=%d, Pin2=%d\n", 
                  externalNeoPixelPin1, externalNeoPixelPin2);
}

int Device_Silicognition_wESP32::getNeoPixelPin(int index) {
    switch(index) {
        case 0:
            return externalNeoPixelPin1;
        case 1:
            return externalNeoPixelPin2;
        default:
            Serial.printf("[ERROR][DEVICE] Invalid NeoPixel pin index: %d\n", index);
            return externalNeoPixelPin1; // Default to pin 1
    }
}

void Device_Silicognition_wESP32::setNeoPixelPin(int pin, int index) {
    switch(index) {
        case 0:
            if (externalNeoPixelPin1 != pin) {
                externalNeoPixelPin1 = pin;
                Serial.printf("[DEBUG][DEVICE] NeoPixel Pin 1 updated to: %d\n", pin);
            }
            break;
        case 1:
            if (externalNeoPixelPin2 != pin) {
                externalNeoPixelPin2 = pin;
                Serial.printf("[DEBUG][DEVICE] NeoPixel Pin 2 updated to: %d\n", pin);
            }
            break;
        default:
            Serial.printf("[ERROR][DEVICE] Invalid NeoPixel pin index: %d\n", index);
            break;
    }
}
#else
// Stub implementations when NeoPixels are disabled
void Device_Silicognition_wESP32::loadNeoPixelPreferences() {
    // Do nothing - NeoPixels disabled
}

void Device_Silicognition_wESP32::saveNeoPixelPreferences() {
    // Do nothing - NeoPixels disabled
}

int Device_Silicognition_wESP32::getNeoPixelPin(int index) {
    return -1; // Invalid pin - NeoPixels disabled
}

void Device_Silicognition_wESP32::setNeoPixelPin(int pin, int index) {
    // Do nothing - NeoPixels disabled
}
#endif

// Static Ethernet event handler
void Device_Silicognition_wESP32::WiFiEvent(WiFiEvent_t event) {
    if (!instance) return;
    
    switch (event) {
        case ARDUINO_EVENT_ETH_START:
            Serial.println("[DEBUG][ETH] Ethernet Started");
            ETH.setHostname("wesp32-gateway");
            break;
            
        case ARDUINO_EVENT_ETH_CONNECTED:
            Serial.println("[DEBUG][ETH] Ethernet Connected");
            break;
            
        case ARDUINO_EVENT_ETH_GOT_IP:
            Serial.printf("[DEBUG][ETH] Ethernet Got IP: %s\n", ETH.localIP().toString().c_str());
            Serial.printf("[DEBUG][ETH] Ethernet MAC: %s\n", ETH.macAddress().c_str());
            Serial.printf("[DEBUG][ETH] Link Speed: %d Mbps\n", ETH.linkSpeed());
            Serial.printf("[DEBUG][ETH] Full Duplex: %s\n", ETH.fullDuplex() ? "Yes" : "No");
            instance->ethernetConnected = true;
            break;
            
        case ARDUINO_EVENT_ETH_DISCONNECTED:
            Serial.println("[DEBUG][ETH] Ethernet Disconnected");
            instance->ethernetConnected = false;
            break;
            
        case ARDUINO_EVENT_ETH_STOP:
            Serial.println("[DEBUG][ETH] Ethernet Stopped");
            instance->ethernetConnected = false;
            break;
            
        default:
            break;
    }
}

bool Device_Silicognition_wESP32::initializeEthernet() {
    if (ethernetInitialized) {
        return ethernetConnected;
    }
    
    Serial.println("[DEBUG][ETH] Initializing Ethernet...");
    
    // Register event handler
    WiFi.onEvent(WiFiEvent);
    
    // Give hardware time to settle
    delay(100);
    
    // Initialize Ethernet with RTL8201 PHY (wESP32 rev 7+)
    // For Arduino-ESP32 2.x: ETH.begin(phy_addr, power_pin, mdc_pin, mdio_pin, phy_type, clock_mode)
    bool success = ETH.begin(ETH_PHY_ADDR, ETH_PHY_POWER, ETH_PHY_MDC, ETH_PHY_MDIO, ETH_PHY_TYPE, ETH_CLK_MODE);
    
    if (success) {
        Serial.println("[DEBUG][ETH] Ethernet initialization successful");
        ethernetInitialized = true;
        
        // Wait a bit for connection
        unsigned long startTime = millis();
        while (!ethernetConnected && (millis() - startTime < 10000)) {
            delay(100);
        }
        
        if (ethernetConnected) {
            printEthernetStatus();
        } else {
            Serial.println("[WARNING][ETH] Ethernet initialized but no connection established");
        }
    } else {
        Serial.println("[ERROR][ETH] Failed to initialize Ethernet");
    }
    
    return success;
}

bool Device_Silicognition_wESP32::isEthernetConnected() {
    return ethernetConnected && ETH.linkUp();
}

IPAddress Device_Silicognition_wESP32::getEthernetIP() {
    return ETH.localIP();
}

String Device_Silicognition_wESP32::getEthernetMAC() {
    return ETH.macAddress();
}

void Device_Silicognition_wESP32::printEthernetStatus() {
    Serial.println("[DEBUG][ETH] === Ethernet Status ===");
    Serial.printf("[DEBUG][ETH] Connected: %s\n", isEthernetConnected() ? "Yes" : "No");
    Serial.printf("[DEBUG][ETH] IP Address: %s\n", ETH.localIP().toString().c_str());
    Serial.printf("[DEBUG][ETH] Subnet Mask: %s\n", ETH.subnetMask().toString().c_str());
    Serial.printf("[DEBUG][ETH] Gateway: %s\n", ETH.gatewayIP().toString().c_str());
    Serial.printf("[DEBUG][ETH] DNS: %s\n", ETH.dnsIP().toString().c_str());
    Serial.printf("[DEBUG][ETH] MAC Address: %s\n", ETH.macAddress().c_str());
    Serial.printf("[DEBUG][ETH] Link Speed: %d Mbps\n", ETH.linkSpeed());
    Serial.printf("[DEBUG][ETH] Full Duplex: %s\n", ETH.fullDuplex() ? "Yes" : "No");
    Serial.println("[DEBUG][ETH] ========================");
}

#if DEVICE_HAS_BUTTONS
bool Device_Silicognition_wESP32::isBootButtonPressed() {
    return digitalRead(PIN_BOOT_BUTTON) == LOW;
}
#else
bool Device_Silicognition_wESP32::isBootButtonPressed() {
    return false; // No button - always return false
}
#endif

bool Device_Silicognition_wESP32::begin() {
    Serial.println("[DEBUG][DEVICE] Initializing Silicognition wESP32...");

    // Initialize onboard LED
    #if DEVICE_HAS_ONBOARD_LED
    pinMode(PIN_ONBOARD_LED, OUTPUT);
    digitalWrite(PIN_ONBOARD_LED, LOW);
    Serial.println("[DEBUG][DEVICE] Onboard LED initialized");
    #endif

    // Initialize boot button
    #if DEVICE_HAS_BUTTONS
    pinMode(PIN_BOOT_BUTTON, INPUT_PULLUP);
    Serial.println("[DEBUG][DEVICE] Boot button initialized");
    #endif

    #if DEVICE_HAS_EXTERNAL_NEOPIXELS
    // Load NeoPixel pin configuration from preferences
    loadNeoPixelPreferences();
    
    Serial.println("[DEBUG][DEVICE] Initializing external NeoPixels manager...");
    Serial.printf("[DEBUG][DEVICE] Creating NeoPixel manager with pin %d, count %d\n", 
                  externalNeoPixelPin1, EXTERNAL_NUMPIXELS);
    
    Manager_NeoPixels* neoManager = Manager_NeoPixels::getInstance(externalNeoPixelPin1, EXTERNAL_NUMPIXELS);
    neoManager->begin(externalNeoPixelPin1, EXTERNAL_NUMPIXELS);
    
    Serial.println("[DEBUG][DEVICE] External NeoPixels manager initialized.");
    
    neoManager->setCM5EffectActive(true);
    neoManager->setCM5Color(0x00FF00); // Green for wESP32
    Serial.println("[DEBUG][DEVICE] NeoPixel test pattern activated.");
    #endif

    // Initialize Ethernet
    #if DEVICE_SUPPORTS_ETHERNET
    Serial.println("[DEBUG][DEVICE] Initializing Ethernet connectivity...");
    initializeEthernet();
    #endif

    // Initialize I2C and scan for devices
    #if DEVICE_HAS_EXTERNAL_I2C_DEVICES
    Serial.println("[DEBUG][DEVICE] Initializing I2C interface...");
    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setClock(400000);
    
    StaticJsonDocument<2048> doc;
    String scanResult = performI2CScan(doc);
    Serial.print("[DEBUG] I2C scan result at boot: ");
    Serial.println(scanResult);
    #endif

    // Flash LED to indicate successful initialization
    #if DEVICE_HAS_ONBOARD_LED
    for (int i = 0; i < 3; i++) {
        digitalWrite(PIN_ONBOARD_LED, HIGH);
        delay(200);
        digitalWrite(PIN_ONBOARD_LED, LOW);
        delay(200);
    }
    #endif

    Serial.println("[DEBUG][DEVICE] Silicognition wESP32 initialization complete.");
    return true;
}

const char* Device_Silicognition_wESP32::getName() {
    return "Silicognition wESP32";
}

void Device_Silicognition_wESP32::setRotation(uint8_t r) {
    Serial.print("[DEBUG][DEVICE] Rotation set to: ");
    Serial.println(r);
}

uint8_t Device_Silicognition_wESP32::getRotation() {
    return 0;
}

int Device_Silicognition_wESP32::width() {
    return 0;  
}

int Device_Silicognition_wESP32::height() {
    return 0;  
}

// Implement I2C interface method
TwoWire* Device_Silicognition_wESP32::getI2CInterface() {
    return &Wire;  // wESP32 uses standard Wire interface
}

String Device_Silicognition_wESP32::performI2CScan(StaticJsonDocument<2048>& doc) {
    Serial.println("[DEBUG][I2C] Starting I2C scan...");
    
    // Ensure Wire is properly initialized first
    Serial.println("[DEBUG][I2C] Initializing Wire interface...");
    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setClock(400000);
    delay(100);  // Stabilization delay
    
    // Run enhanced scanner with device recognition
    Serial.println("[DEBUG][I2C] Running I2C scan with device recognition...");
    String scanResult = I2CScanner::scanAndConfigureDevices(Wire, doc, "wesp32");
    Serial.printf("[DEBUG][I2C] Scan result: %s\n", scanResult.c_str());
    
    // Check what was found and initialize accordingly
    bool foundSeesaw = doc["FoundSeesaw"] | false;
    
    // Check for Quad Displays at 0x70, 0x71, 0x72
    bool foundQuadDisplay = false;
    uint8_t quadAddresses[] = {0x70, 0x71, 0x72};
    int quadCount = 0;
    
    Serial.println("[DEBUG][I2C] Checking for Quad displays at addresses 0x70, 0x71, 0x72...");
    for (uint8_t addr : quadAddresses) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.printf("[DEBUG][I2C] Found potential Quad display at 0x%02X\n", addr);
            foundQuadDisplay = true;
            quadCount++;
        }
    }
    
    // Check for Charlieplex displays at 0x74, 0x75, 0x76
    bool foundCharlieplex = false;
    uint8_t charlieAddresses[] = {0x74, 0x75, 0x76};
    int charlieCount = 0;
    
    Serial.println("[DEBUG][I2C] Checking for Charlieplex displays at addresses 0x74, 0x75, 0x76...");
    for (uint8_t addr : charlieAddresses) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.printf("[DEBUG][I2C] Found potential Charlieplex display at 0x%02X\n", addr);
            foundCharlieplex = true;
            charlieCount++;
        }
    }
    
    Serial.printf("[DEBUG][I2C] Scan results: Seesaw=%s, QuadDisplay=%s (%d at 0x70-0x72), Charlieplex=%s (%d at 0x74-0x76)\n", 
                  foundSeesaw ? "YES" : "NO", 
                  foundQuadDisplay ? "YES" : "NO", quadCount,
                  foundCharlieplex ? "YES" : "NO", charlieCount);
    
    // Initialize Quad Displays using singleton manager (ONLY for 0x70, 0x71, 0x72)
    if (foundQuadDisplay) {
        Serial.println("[DEBUG][I2C] Setting up Quad Display manager...");
        
        // Get the singleton manager instance
        Manager_QuadDisplay* quadManager = Manager_QuadDisplay::getInstance(&Wire);
        
        // Add ONLY the detected quad displays (0x70, 0x71, 0x72)
        for (uint8_t addr : quadAddresses) {
            Wire.beginTransmission(addr);
            if (Wire.endTransmission() == 0) {
                Serial.printf("[DEBUG][I2C] Adding Quad Display at address 0x%02X to manager\n", addr);
                quadManager->addDisplay(addr);
            }
        }
        
        // Create single task for the quad display manager
        xTaskCreatePinnedToCore(
            [](void* param) {
                Manager_QuadDisplay* manager = static_cast<Manager_QuadDisplay*>(param);
                Serial.println("[QuadDisplayTask] Starting singleton manager task");
                
                // Initialize all displays
                manager->begin();
                
                // Keep task alive and handle scrolling updates
                while (true) {
                    manager->update();  // For scrolling text only
                    vTaskDelay(pdMS_TO_TICKS(50));  // Check scrolling every 50ms
                }
            },
            "QuadDisplayTask",
            4096,
            quadManager,
            1,
            &quadDisplayTaskHandle,
            1
        );
        
        if (quadDisplayTaskHandle == NULL) {
            Serial.println("[ERROR] Failed to create QuadDisplay manager task");
        } else {
            Serial.printf("[DEBUG][I2C] Created QuadDisplay manager task for %d displays\n", 
                         quadManager->getDisplayAddresses().size());
        }
        
        detectedQuadDisplay = true;
    }
    
    // Initialize Charlieplex displays using singleton manager (ONLY for 0x74, 0x75, 0x76)
    if (foundCharlieplex) {
        Serial.println("[DEBUG][I2C] Setting up Charlieplex Display manager...");
        
        // Get the singleton manager instance
        Manager_Charlieplex* charlieManager = Manager_Charlieplex::getInstance(&Wire);
        
        // Add ONLY the detected Charlieplex displays (0x74, 0x75, 0x76)
        for (uint8_t addr : charlieAddresses) {
            Wire.beginTransmission(addr);
            if (Wire.endTransmission() == 0) {
                Serial.printf("[DEBUG][I2C] Adding Charlieplex Display at address 0x%02X to manager\n", addr);
                charlieManager->addDisplay(addr);
            }
        }
        
        // Create single task for the Charlieplex display manager
        xTaskCreatePinnedToCore(
            [](void* param) {
                Manager_Charlieplex* manager = static_cast<Manager_Charlieplex*>(param);
                Serial.println("[CharlieDisplayTask] Starting singleton manager task");
                
                // Initialize all displays
                manager->begin();
                
                // Keep task alive and handle scrolling updates
                while (true) {
                    manager->update();  // For scrolling text only
                    vTaskDelay(pdMS_TO_TICKS(50));  // Check scrolling every 50ms
                }
            },
            "CharlieDisplayTask",
            4096,
            charlieManager,
            1,
            &charlieDisplayTaskHandle,
            1
        );
        
        if (charlieDisplayTaskHandle == NULL) {
            Serial.println("[ERROR] Failed to create Charlieplex manager task");
        } else {
            Serial.printf("[DEBUG][I2C] Created Charlieplex manager task for %d displays\n", 
                         charlieManager->getDisplayAddresses().size());
        }
        
        detectedCharlieDisplay = true;
    }
    
    // Seesaw initialization (unchanged)
    if (foundSeesaw) {
        Serial.println("[DEBUG][I2C] Seesaw found, initializing shared I2C manager...");
        
        xTaskCreatePinnedToCore(
            [](void* param) {
                ConnectionManager* cm = static_cast<ConnectionManager*>(param);
                Serial.printf("[I2CInitTask] Running on core %d\n", xPortGetCoreID());
                
                Manager_I2C* i2cManager = Manager_I2C::getInstance(cm, &Wire);
                if (i2cManager) {
                    i2cManager->begin();
                    Serial.println("[I2CInitTask] Shared I2C Manager initialization complete");
                } else {
                    Serial.println("[ERROR][I2CInitTask] Failed to get I2C Manager instance");
                }
                
                vTaskDelete(NULL);
            },
            "I2CInitTask",
            4096,
            connMgr,
            1,
            &i2cInitTaskHandle,
            1
        );
        
        if (i2cInitTaskHandle == NULL) {
            Serial.println("[ERROR] Failed to create I2C Init task on core 1");
        } else {
            Serial.println("[DEBUG][I2C] Shared I2C Manager initialization queued on Core 1");
        }
    }
    
    // Clean up temporary flags
    doc.remove("FoundSeesaw");
    doc.remove("FoundQuadDisplay");
    
    return scanResult;
}