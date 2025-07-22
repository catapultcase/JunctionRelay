#include "Helper_StartupScheduler.h"
#include "Manager_NeoPixels.h"
#include "Manager_QuadDisplay.h"
#include "Manager_Charlieplex.h"
#include "Manager_Matrix.h"  // Add Matrix manager
#include "Manager_Connections.h"  // Add Manager_Connections include
#include "ScreenRouter.h"
#include "Device.h"  // For full HardwareInventory structure definitions

// Static instance
Helper_StartupScheduler* Helper_StartupScheduler::instance = nullptr;

Helper_StartupScheduler::Helper_StartupScheduler()
    : neoPixelManager(nullptr),
      quadDisplayManager(nullptr),
      charliplexManager(nullptr),
      matrixManager(nullptr),  // Initialize Matrix manager
      screenRouter(nullptr),
      devicePtr(nullptr),  // Initialize device pointer
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
    devicePtr = device;  // Store device pointer for matrix access
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

// NEW: Method to set connection manager after it's created
void Helper_StartupScheduler::setConnectionManager(Manager_Connections* connMgr) {
    if (matrixManager) {
        matrixManager->setConnectionManager(connMgr);
        Serial.println("[STARTUP_SCHEDULER] ✅ Connection manager set for Matrix");
    }
}

void Helper_StartupScheduler::logInventory(const HardwareInventory& inventory) {
    Serial.println("[STARTUP_SCHEDULER] Hardware inventory:");
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
    
    Serial.printf("[STARTUP_SCHEDULER]   Created %d managers\n", 
                  (matrixManager ? 1 : 0) + (neoPixelManager ? 1 : 0) + (quadDisplayManager ? 1 : 0) + (charliplexManager ? 1 : 0));
}

void Helper_StartupScheduler::setupMatrixManager() {
    matrixManager = Manager_Matrix::getInstance();
    
    if (!matrixManager) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: Failed to get Matrix manager instance");
        return;
    }
    
    Serial.println("[STARTUP_SCHEDULER]     Matrix manager configured");
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
    quadDisplayManager = Manager_QuadDisplay::getInstance();
    
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
    charliplexManager = Manager_Charlieplex::getInstance();
    
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

void Helper_StartupScheduler::registerScreenDestinations() {
    if (!screenRouter) {
        Serial.println("[STARTUP_SCHEDULER] ERROR: ScreenRouter not set");
        return;
    }
    
    int registered = 0;
    
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
    
    Serial.printf("[STARTUP_SCHEDULER]   Registered %d screen destinations\n", registered);
}

void Helper_StartupScheduler::startManagerTasks() {
    // Start Matrix manager first (if present)
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

void Helper_StartupScheduler::addDelay(int ms) {
    delay(ms);
}