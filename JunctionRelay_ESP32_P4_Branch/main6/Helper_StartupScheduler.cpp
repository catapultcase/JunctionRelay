#include "Helper_StartupScheduler.h"
#include "Manager_NeoPixels.h"
#include "Manager_QuadDisplay.h"
#include "Manager_Charlieplex.h"
#include "Manager_Matrix.h"
#include "Manager_MQTT.h"
#include "Manager_I2C.h"
#include "Manager_Connections.h"
#include "Manager_ScreenRouter.h"
#include "Display_Manager_Native.h"
#include "Display_Manager_Blit.h"
#include "Helper_Preferences.h"
#include "Device.h"

// Static instance
Helper_StartupScheduler* Helper_StartupScheduler::instance = nullptr;

Helper_StartupScheduler::Helper_StartupScheduler()
    : neoPixelManager(nullptr),
      quadDisplayManager(nullptr),
      charliplexManager(nullptr),
      matrixManager(nullptr),
      mqttManager(nullptr),
      i2cManager(nullptr),
      displayManager(nullptr),
      blitManager(nullptr), 
      connectionManager(nullptr),
      screenRouter(nullptr),
      devicePtr(nullptr),
      preferences(nullptr),
      initialized(false)
{
    // Serial.println("[STARTUP_SCHEDULER] Constructor called");
}

Helper_StartupScheduler* Helper_StartupScheduler::getInstance() {
    if (instance == nullptr) {
        instance = new Helper_StartupScheduler();
    }
    return instance;
}

void Helper_StartupScheduler::cleanup() {
    if (instance != nullptr) {
        Serial.println("[STARTUP_SCHEDULER] Cleaning up singleton");
        delete instance;
        instance = nullptr;
    }
}

void Helper_StartupScheduler::initializeFromInventory(const HardwareInventory& inventory, ScreenRouter* router, DeviceConfig* device) {
    if (initialized) {
        Serial.println("[STARTUP_SCHEDULER] Already initialized, skipping");
        return;
    }
    
    Serial.println("[STARTUP_SCHEDULER] ==========================================");
    Serial.println("[STARTUP_SCHEDULER] Starting centralized manager initialization");
    Serial.println("[STARTUP_SCHEDULER] ==========================================");
    
    screenRouter = router;
    devicePtr = device;
    detectedHardware = inventory;
    
    // Log what we detected
    logInventory(inventory);
    
    // Phase 1: Create manager instances based on detected hardware
    Serial.println("[STARTUP_SCHEDULER] Phase 1: Creating managers...");
    createManagers(inventory);
    addDelay(100);
    
    // Phase 2: Register all managers with ScreenRouter
    Serial.println("[STARTUP_SCHEDULER] Phase 2: Registering screen destinations...");
    registerScreenDestinations();
    addDelay(100);
    
    // Phase 3: Start background tasks and hardware initialization
    Serial.println("[STARTUP_SCHEDULER] Phase 3: Starting manager tasks...");
    startManagerTasks();
    addDelay(100);
    
    initialized = true;
    
    Serial.println("[STARTUP_SCHEDULER] ==========================================");
    Serial.println("[STARTUP_SCHEDULER] Manager initialization complete!");
    Serial.println("[STARTUP_SCHEDULER] ==========================================");
}

void Helper_StartupScheduler::setManager_Connections(Manager_Connections* connMgr) {
    connectionManager = connMgr;
    
    // Set connection manager for existing managers
    if (matrixManager) {
        matrixManager->setManager_Connections(connMgr);
        Serial.println("[STARTUP_SCHEDULER] ✅ Connection manager set for Matrix");
    }
    
    if (displayManager) {
        displayManager->setConnectionManager(connMgr);
        Serial.println("[STARTUP_SCHEDULER] ✅ Connection manager set for Display");
    }
}

void Helper_StartupScheduler::logInventory(const HardwareInventory& inventory) {
    Serial.println("[STARTUP_SCHEDULER] Hardware inventory:");
    Serial.printf("[STARTUP_SCHEDULER]   Onboard Screen: %s\n", 
                  inventory.hasOnboardScreen ? "Yes" : "No");
    Serial.printf("[STARTUP_SCHEDULER]   NeoPixel strips: %d\n", inventory.neopixelPins.size());
    for (size_t i = 0; i < inventory.neopixelPins.size(); i++) {
        Serial.printf("[STARTUP_SCHEDULER]     Strip %d: Pin %d, %d pixels\n", 
                      i, inventory.neopixelPins[i].pin, inventory.neopixelPins[i].pixelCount);
    }
    
    Serial.printf("[STARTUP_SCHEDULER]   I2C devices: %d\n", inventory.i2cDevices.size());
    for (size_t i = 0; i < inventory.i2cDevices.size(); i++) {
        Serial.printf("[STARTUP_SCHEDULER]     Device %d: 0x%02X (%s)\n", 
                      i, inventory.i2cDevices[i].address, inventory.i2cDevices[i].deviceType.c_str());
    }
    
    Serial.printf("[STARTUP_SCHEDULER]   External Matrix: %s\n", 
                  inventory.hasExternalMatrix ? "Yes" : "No");
    Serial.printf("[STARTUP_SCHEDULER]   External NeoPixels: %s\n", 
                  inventory.hasExternalNeopixels ? "Yes" : "No");
    Serial.printf("[STARTUP_SCHEDULER]   External I2C: %s\n", 
                  inventory.hasExternalI2CDevices ? "Yes" : "No");
}

void Helper_StartupScheduler::createManagers(const HardwareInventory& inventory) {
    // Create Display manager if device has onboard screen
    if (inventory.hasOnboardScreen) {
        Serial.println("[STARTUP_SCHEDULER]   Creating Display manager...");
        setupDisplayManager();

        Serial.println("[STARTUP_SCHEDULER]   Creating Blit manager...");
        setupBlitManager();
    }
    
    // Create Matrix manager if we have matrix hardware
    if (inventory.hasExternalMatrix) {
        Serial.println("[STARTUP_SCHEDULER]   Creating Matrix manager...");
        setupMatrixManager();
    }
    
    // Create NeoPixel manager if we have NeoPixel hardware
    if (inventory.hasExternalNeopixels && !inventory.neopixelPins.empty()) {
        Serial.println("[STARTUP_SCHEDULER]   Creating NeoPixel manager...");
        setupNeoPixelManager(inventory.neopixelPins);
    }
    
    // Separate I2C devices by type
    std::vector<I2CDeviceInfo> quadDevices;
    std::vector<I2CDeviceInfo> charliplexDevices;
    
    for (const auto& device : inventory.i2cDevices) {
        if (device.deviceType == "quad") {
            quadDevices.push_back(device);
        } else if (device.deviceType == "charlieplex") {
            charliplexDevices.push_back(device);
        }
    }
    
    // Create QuadDisplay manager if we have compatible I2C devices
    if (inventory.hasExternalI2CDevices && !quadDevices.empty()) {
        Serial.println("[STARTUP_SCHEDULER]   Creating QuadDisplay manager...");
        setupQuadDisplayManager(quadDevices);
    }
    
    // Create Charlieplex manager if we have compatible I2C devices
    if (inventory.hasExternalI2CDevices && !charliplexDevices.empty()) {
        Serial.println("[STARTUP_SCHEDULER]   Creating Charlieplex manager...");
        setupCharliplexManager(charliplexDevices);
    }
    
    // Create MQTT manager if configured in preferences
    if (preferences) {
        Serial.println("[STARTUP_SCHEDULER]   Creating MQTT manager...");
        setupMQTTManager();
    }
    
    // Check for Seesaw devices in I2C inventory and setup I2C manager
    bool hasSeesawDevice = false;
    for (const auto& device : inventory.i2cDevices) {
        if (device.address == 0x36) {  // Seesaw encoder address
            hasSeesawDevice = true;
            break;
        }
    }
    
    if (hasSeesawDevice) {
        Serial.println("[STARTUP_SCHEDULER]   Creating I2C manager for Seesaw device...");
        setupI2CManager();
    }
    
    Serial.printf("[STARTUP_SCHEDULER]   Created %d managers\n", 
                  (displayManager ? 1 : 0) + (matrixManager ? 1 : 0) + (neoPixelManager ? 1 : 0) + 
                  (quadDisplayManager ? 1 : 0) + (charliplexManager ? 1 : 0) + (mqttManager ? 1 : 0) + (i2cManager ? 1 : 0));
}

void Helper_StartupScheduler::setupDisplayManager() {
    if (!devicePtr) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: Device pointer not set for Display manager");
        return;
    }
    
    // Only initialize device hardware if it has an onboard screen
    if (devicePtr->hasOnboardScreen()) {
        Serial.println("[STARTUP_SCHEDULER] Initializing device hardware (has onboard screen)...");
        if (!devicePtr->begin()) {
            Serial.println("[STARTUP_SCHEDULER] CRITICAL: Device hardware initialization failed!");
            return;
        }
        Serial.println("[STARTUP_SCHEDULER] Device hardware initialized successfully");
    } else {
        Serial.println("[STARTUP_SCHEDULER] Skipping device hardware init (no onboard screen)");
    }
    
    displayManager = new Display_Manager_Native(devicePtr);
    
    if (!displayManager) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: Failed to create Display manager instance");
        return;
    }
    
    // Set connection manager if available
    if (connectionManager) {
        displayManager->setConnectionManager(connectionManager);
    }
    
    Serial.println("[STARTUP_SCHEDULER]     Display manager configured");
}

void Helper_StartupScheduler::setupBlitManager() {
    if (!devicePtr) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: Device pointer not set for Blit manager");
        return;
    }
    
    if (!devicePtr->hasOnboardScreen()) {
        Serial.println("[STARTUP_SCHEDULER] Skipping Blit manager (no onboard screen)");
        return;
    }
    
    blitManager = new Display_Manager_Blit(devicePtr);
    
    if (!blitManager) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: Failed to create Blit manager instance");
        return;
    }
    
    Serial.println("[STARTUP_SCHEDULER]     Blit manager configured");
}

void Helper_StartupScheduler::setupMatrixManager() {
    matrixManager = Manager_Matrix::getInstance();
    
    if (!matrixManager) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: Failed to get Matrix manager instance");
        return;
    }
    
    Serial.println("[STARTUP_SCHEDULER]     Matrix manager configured");
}

void Helper_StartupScheduler::setupMQTTManager() {
    if (!preferences) {
        Serial.println("[STARTUP_SCHEDULER] WARNING: No preferences available for MQTT configuration");
        return;
    }
    
    // Create MQTT manager from preferences
    mqttManager = Manager_MQTT::createFromPreferences(preferences);
    
    if (mqttManager) {
        Serial.println("[STARTUP_SCHEDULER]     MQTT manager configured from preferences");
    } else {
        Serial.println("[STARTUP_SCHEDULER]     MQTT manager not created (disabled or not configured)");
    }
}

void Helper_StartupScheduler::setupNeoPixelManager(const std::vector<NeoPixelInfo>& neoPixels) {
    neoPixelManager = Manager_NeoPixels::getInstance();
    
    if (!neoPixelManager) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: Failed to get NeoPixel manager instance");
        return;
    }
    
    // Add all detected strips
    for (size_t i = 0; i < neoPixels.size(); i++) {
        Serial.printf("[STARTUP_SCHEDULER]     Adding NeoPixel strip %d: Pin %d, %d pixels\n",
                      i, neoPixels[i].pin, neoPixels[i].pixelCount);
        neoPixelManager->addStrip(i, neoPixels[i].pin, neoPixels[i].pixelCount);
    }
    
    // Initialize the strips (but don't start tasks yet)
    neoPixelManager->begin();
    
    // Configure default effects
    neoPixelManager->setEffectActive(true);
    neoPixelManager->setEffectColor(0xFF0000); // Red default
    neoPixelManager->setFlipDirection(true);
    
    Serial.println("[STARTUP_SCHEDULER]     NeoPixel manager configured");
}

void Helper_StartupScheduler::setupQuadDisplayManager(const std::vector<I2CDeviceInfo>& i2cDevices) {
    // Get the correct I2C interface from the device
    TwoWire* wireInterface = nullptr;
    if (devicePtr) {
        wireInterface = devicePtr->getI2CInterface();
        Serial.printf("[STARTUP_SCHEDULER]     Using I2C interface: %s\n", 
                     (wireInterface == &Wire1) ? "Wire1" : "Wire");
    }
    
    // Pass the correct wire interface to the singleton
    quadDisplayManager = Manager_QuadDisplay::getInstance(wireInterface);
    
    if (!quadDisplayManager) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: Failed to get QuadDisplay manager instance");
        return;
    }
    
    // Add all quad displays
    for (const auto& device : i2cDevices) {
        if (device.deviceType == "quad") {
            Serial.printf("[STARTUP_SCHEDULER]     Adding QuadDisplay at 0x%02X\n", device.address);
            quadDisplayManager->addDisplay(device.address);
        }
    }
    
    Serial.println("[STARTUP_SCHEDULER]     QuadDisplay manager configured");
}

void Helper_StartupScheduler::setupCharliplexManager(const std::vector<I2CDeviceInfo>& i2cDevices) {
    // Get the correct I2C interface from the device
    TwoWire* wireInterface = nullptr;
    if (devicePtr) {
        wireInterface = devicePtr->getI2CInterface();
        Serial.printf("[STARTUP_SCHEDULER]     Using I2C interface: %s\n", 
                     (wireInterface == &Wire1) ? "Wire1" : "Wire");
    }
    
    // Pass the correct wire interface to the singleton
    charliplexManager = Manager_Charlieplex::getInstance(wireInterface);
    
    if (!charliplexManager) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: Failed to get Charlieplex manager instance");
        return;
    }
    
    // Add all charlieplex displays
    for (const auto& device : i2cDevices) {
        if (device.deviceType == "charlieplex") {
            Serial.printf("[STARTUP_SCHEDULER]     Adding Charlieplex display at 0x%02X\n", device.address);
            charliplexManager->addDisplay(device.address);
        }
    }
    
    Serial.println("[STARTUP_SCHEDULER]     Charlieplex manager configured");
}

void Helper_StartupScheduler::setupI2CManager() {
    // Get the Manager_I2C instance that was already created during hardware detection
    i2cManager = Manager_I2C::getInstance();
    
    if (!i2cManager) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: Failed to get I2C manager instance");
        return;
    }
    
    // Inject MQTT manager dependency if available
    if (mqttManager) {
        i2cManager->setMQTTManager(mqttManager);
        Serial.println("[STARTUP_SCHEDULER]     I2C manager configured with MQTT integration");
    } else {
        Serial.println("[STARTUP_SCHEDULER]     I2C manager configured without MQTT (will work locally only)");
    }
}

void Helper_StartupScheduler::registerScreenDestinations() {
    if (!screenRouter) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: ScreenRouter not set");
        return;
    }
    
    int registered = 0;
    
    // Register Display manager (onboard screen)
    if (displayManager) {
        screenRouter->registerScreen(displayManager);
        Serial.println("[STARTUP_SCHEDULER]   ✅ Registered Display manager with ScreenRouter");
        registered++;
    }

    // Register Blit manager (onboard screen for blit frames)
    if (blitManager) {
        screenRouter->registerScreen(blitManager);
        Serial.println("[STARTUP_SCHEDULER]   ✅ Registered Blit manager with ScreenRouter");
        registered++;
    }

    // Register Matrix manager
    if (matrixManager) {
        screenRouter->registerScreen(matrixManager);
        Serial.println("[STARTUP_SCHEDULER]   ✅ Registered Matrix manager with ScreenRouter");
        registered++;
    }
    
    // Register NeoPixel manager
    if (neoPixelManager) {
        screenRouter->registerScreen(neoPixelManager);
        Serial.println("[STARTUP_SCHEDULER]   ✅ Registered NeoPixel manager with ScreenRouter");
        registered++;
    }
    
    // Register QuadDisplay manager
    if (quadDisplayManager) {
        screenRouter->registerScreen(quadDisplayManager);
        Serial.println("[STARTUP_SCHEDULER]   ✅ Registered QuadDisplay manager with ScreenRouter");
        registered++;
    }
    
    // Register Charlieplex manager
    if (charliplexManager) {
        screenRouter->registerScreen(charliplexManager);
        Serial.println("[STARTUP_SCHEDULER]   ✅ Registered Charlieplex manager with ScreenRouter");
        registered++;
    }
    
    // Note: MQTT manager is NOT registered with ScreenRouter as it's a transport layer, not a display
    
    Serial.printf("[STARTUP_SCHEDULER]   Registered %d screen destinations\n", registered);
}

void Helper_StartupScheduler::startManagerTasks() {
    // Start Display manager first (if present)
    if (displayManager) {
        Serial.println("[STARTUP_SCHEDULER]   Starting Display tasks...");
        startDisplayTasks();
        addDelay(200);
    }

    // Start Blit manager (if present)
    if (blitManager) {
        Serial.println("[STARTUP_SCHEDULER]   Starting Blit tasks...");
        startBlitTasks();
        addDelay(100);
    }
    
    // Start Matrix manager next (if present)
    if (matrixManager) {
        Serial.println("[STARTUP_SCHEDULER]   Starting Matrix tasks...");
        startMatrixTasks();
        addDelay(200);
    }
    
    // Start I2C managers next (safer)
    if (quadDisplayManager) {
        Serial.println("[STARTUP_SCHEDULER]   Starting QuadDisplay tasks...");
        startQuadDisplayTasks();
        addDelay(200); // Longer delay after I2C operations
    }
    
    if (charliplexManager) {
        Serial.println("[STARTUP_SCHEDULER]   Starting Charlieplex tasks...");
        startCharliplexTasks();
        addDelay(200); // Longer delay after I2C operations
    }
    
    // Start GPIO managers last
    if (neoPixelManager) {
        Serial.println("[STARTUP_SCHEDULER]   Starting NeoPixel tasks...");
        startNeoPixelTasks();
        addDelay(100);
    }
    
    // Start MQTT manager (network-dependent, so start last)
    if (mqttManager) {
        Serial.println("[STARTUP_SCHEDULER]   Starting MQTT tasks...");
        startMQTTTasks();
        addDelay(100);
    }
    
    // Start I2C manager (for Seesaw devices)
    if (i2cManager) {
        Serial.println("[STARTUP_SCHEDULER]   Starting I2C tasks...");
        startI2CTasks();
        addDelay(100);
    }
}

void Helper_StartupScheduler::startDisplayTasks() {
    if (!displayManager) return;
    
    // Initialize LVGL and hardware
    if (displayManager->init()) {
        Serial.println("[STARTUP_SCHEDULER]     ✅ Display manager initialized");
        
        // Create home screen
        displayManager->createHomeScreen();
        Serial.println("[STARTUP_SCHEDULER]     ✅ Home screen created");
    } else {
        Serial.println("[STARTUP_SCHEDULER]     ❌ Display manager initialization failed");
    }
}

void Helper_StartupScheduler::startBlitTasks() {
    if (!blitManager) return;
    
    // Initialize the blit manager
    if (blitManager->init()) {
        Serial.println("[STARTUP_SCHEDULER]     ✅ Blit manager initialized and ready for frames");
    } else {
        Serial.println("[STARTUP_SCHEDULER]     ❌ Blit manager initialization failed");
    }
}

void Helper_StartupScheduler::startMatrixTasks() {
#if DEVICE_HAS_EXTERNAL_MATRIX
    Serial.println("[STARTUP_SCHEDULER] startMatrixTasks() called");

    if (!matrixManager) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: matrixManager is null!");
        return;
    }
    Serial.println("[STARTUP_SCHEDULER] matrixManager is valid");

    if (!devicePtr) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: devicePtr is null!");
        return;
    }
    Serial.println("[STARTUP_SCHEDULER] devicePtr is valid");

    if (!devicePtr->hasExternalMatrix()) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: Device does not have matrix capability");
        return;
    }
    Serial.println("[STARTUP_SCHEDULER] Device has matrix capability confirmed");

    extern uint8_t rgbPins[];
    extern uint8_t addrPins[];
    extern uint8_t clockPin;
    extern uint8_t latchPin;
    extern uint8_t oePin;

    Serial.println("[STARTUP_SCHEDULER] About to call matrixManager->begin()");
    matrixManager->begin(rgbPins, addrPins, clockPin, latchPin, oePin);
    Serial.println("[STARTUP_SCHEDULER] matrixManager->begin() completed");

    matrixManager->showReadyScreen();
    matrixManager->startUpdateTask();
    Serial.println("[STARTUP_SCHEDULER]     ✅ Matrix tasks started");
#else
    Serial.println("[STARTUP_SCHEDULER] Matrix support disabled at compile time.");
#endif
}

void Helper_StartupScheduler::startQuadDisplayTasks() {
    if (!quadDisplayManager) return;
    
    // Initialize displays (I2C communication happens here)
    quadDisplayManager->begin();
    
    // Show ready screen
    quadDisplayManager->showReadyScreen();
    
    // Start the background update task
    quadDisplayManager->startUpdateTask();
    
    Serial.println("[STARTUP_SCHEDULER]     ✅ QuadDisplay tasks started");
}

void Helper_StartupScheduler::startCharliplexTasks() {
    if (!charliplexManager) return;
    
    // Initialize displays (I2C communication happens here)
    charliplexManager->begin();
    
    // Show ready screen
    charliplexManager->showReadyScreen();
    
    // Start the background update task
    charliplexManager->startUpdateTask();
    
    Serial.println("[STARTUP_SCHEDULER]     ✅ Charlieplex tasks started");
}

void Helper_StartupScheduler::startNeoPixelTasks() {
    if (!neoPixelManager) return;
        
    Serial.println("[STARTUP_SCHEDULER]     ✅ NeoPixel Manager has no tasks");
}

void Helper_StartupScheduler::startMQTTTasks() {
    if (!mqttManager) return;
    
    // Start MQTT connection
    mqttManager->begin();
    
    Serial.println("[STARTUP_SCHEDULER]     ✅ MQTT tasks started");
}

void Helper_StartupScheduler::startI2CTasks() {
    if (!i2cManager) return;
    
    // Initialize the I2C manager (this will call begin() which starts the Seesaw encoder)
    i2cManager->begin();
    
    Serial.println("[STARTUP_SCHEDULER]     ✅ I2C tasks started");
}

void Helper_StartupScheduler::addDelay(int ms) {
    delay(ms);
}