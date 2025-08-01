#include "Helper_DebugScreen.h"
#include "utils.h"

Helper_DebugScreen::Helper_DebugScreen() {}

void Helper_DebugScreen::begin() {
    Wire.begin();

    // Try to detect screens
    if (narrowOLED.begin()) {
        oledType = OLEDType::Narrow;
        Serial.println("[DebugScreen] ✅ Narrow OLED detected (4 rows max)");
    } else if (tallOLED.begin()) {
        oledType = OLEDType::Tall;
        Serial.println("[DebugScreen] ✅ Tall OLED detected (8 rows available)");
    } else {
        oledType = OLEDType::None;
        Serial.println("[DebugScreen] ❌ No OLED detected - debug screen disabled (zero overhead)");
        return;  // Complete early exit - no resources allocated
    }

    // Only proceed if screen was detected
    // Create mutex for thread-safe display access
    displayMutex = xSemaphoreCreateMutex();
    if (displayMutex == nullptr) {
        Serial.println("[DebugScreen] ❌ Failed to create display mutex");
        oledType = OLEDType::None;  // Disable if mutex fails
        return;
    }

    // Initialize display
    if (xSemaphoreTake(displayMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        clearScreen();
        printLine(0, "JunctionRelay Debug");
        printLine(1, "Initializing...");
        if (oledType == OLEDType::Tall) {
            tallOLED.display();
        } else {
            narrowOLED.display();
        }
        xSemaphoreGive(displayMutex);
    }
    
    // Create the screen cycling task if enabled
    if (ENABLE_SCREEN_CYCLING) {
        createScreenCyclingTask();
    }
    
    lastScreenSwitch = millis();
    Serial.println("[DebugScreen] ✅ Debug screen fully initialized");
}

void Helper_DebugScreen::loop() {
    // No longer needed - task handles cycling
    // Keep this method for compatibility but it's now a no-op
}

void Helper_DebugScreen::createScreenCyclingTask() {
    if (screenCyclingTask != nullptr) {
        Serial.println("[DebugScreen] Task already exists");
        return;
    }
    
    BaseType_t result = xTaskCreate(
        screenCyclingTaskFunction,    // Task function
        "ScreenCycling",              // Task name
        2048,                         // Stack size (bytes)
        this,                         // Parameter passed to task
        1,                            // Priority (1 = low priority)
        &screenCyclingTask            // Task handle
    );
    
    if (result == pdPASS) {
        Serial.println("[DebugScreen] ✅ Screen cycling task created");
    } else {
        Serial.println("[DebugScreen] ❌ Failed to create screen cycling task");
        screenCyclingTask = nullptr;
    }
}

void Helper_DebugScreen::deleteScreenCyclingTask() {
    if (screenCyclingTask != nullptr) {
        vTaskDelete(screenCyclingTask);
        screenCyclingTask = nullptr;
        Serial.println("[DebugScreen] Screen cycling task deleted");
    }
    
    if (displayMutex != nullptr) {
        vSemaphoreDelete(displayMutex);
        displayMutex = nullptr;
    }
}

bool Helper_DebugScreen::safeToUpdateDisplay() {
    return (displayMutex != nullptr && 
            xSemaphoreTake(displayMutex, pdMS_TO_TICKS(5)) == pdTRUE);  // Keep short for task usage
}

void Helper_DebugScreen::screenCyclingTaskFunction(void* parameter) {
    Helper_DebugScreen* instance = static_cast<Helper_DebugScreen*>(parameter);
    
    while (true) {
        if (instance->oledType != OLEDType::None) {
            // Check if payload handler wants to update
            if (instance->payloadUpdatePending) {
                // Give payload handler a chance by yielding briefly
                vTaskDelay(pdMS_TO_TICKS(10));
                continue;  // Skip this cycle, let payload handler update
            }
            
            // Use mutex to safely access display
            if (xSemaphoreTake(instance->displayMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
                // Double-check no urgent payload update needed
                if (!instance->payloadUpdatePending) {
                    instance->switchToNextScreen();
                    instance->updateDisplay();
                    instance->lastScreenSwitch = millis();
                    
                    Serial.printf("[DebugScreen] Task: Switched to screen %d\n", 
                                 static_cast<int>(instance->currentScreen));
                }
                xSemaphoreGive(instance->displayMutex);
            }
        }
        
        // Wait for the cycle interval
        vTaskDelay(pdMS_TO_TICKS(SCREEN_CYCLE_INTERVAL_MS));
    }
}

void Helper_DebugScreen::handleParsedPayload(const JsonDocument& doc, size_t rawSize, uint8_t typeField, uint8_t routeField) {
    if (oledType == OLEDType::None) return;  // CRITICAL FIX: Early exit if no screen detected
    
    totalPayloads++;
    totalBytes += rawSize;
    
    // Store last payload details (for individual payload display)
    lastTypeField = typeField;
    lastPayloadSize = rawSize;
    lastRouteField = routeField;
    
    unsigned long now = millis();
    if (totalPayloads > 1) {
        payloadInterval = now - lastPayloadTime;
        if (payloadInterval > peakInterval) peakInterval = payloadInterval;
        if (payloadInterval < minInterval && payloadInterval > 0) minInterval = payloadInterval;
    }
    lastPayloadTime = now;

    // Analyze payload for enhanced statistics
    analyzePayloadForRouting(doc);
    
    // Signal that we want to update and try to do it immediately
    payloadUpdatePending = true;
    
    // Try to update display immediately with longer timeout for real-time stats
    if (displayMutex && xSemaphoreTake(displayMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        // Always update if we get the mutex - live stats are important
        updateDisplay();
        payloadUpdatePending = false;  // Clear the pending flag
        xSemaphoreGive(displayMutex);
    }
    // If we can't get mutex, the task will see payloadUpdatePending and update next cycle
}

void Helper_DebugScreen::analyzePayloadForRouting(const JsonDocument& doc) {
    // Track routing decisions
    if (doc.containsKey("destination")) {
        String destination = doc["destination"].as<String>();
        String localMac = getFormattedMacAddress();
        
        if (destination.equalsIgnoreCase(localMac)) {
            localDestinations++;
        } else if (destination.length() == 17) { // Valid MAC format
            remoteDestinations++;
            lastRemoteDestination = destination;
        } else {
            invalidDestinations++;
        }
    }
    
    // Track message types
    const char* type = doc["type"];
    if (type) {
        if (strcmp(type, "sensor") == 0) {
            sensorMessages++;
        } else if (strcmp(type, "config") == 0) {
            configMessages++;
        } else if (strcmp(type, "peer_management") == 0 || 
                   strcmp(type, "MQTT_Subscription_Request") == 0 ||
                   strcmp(type, "espnow_message") == 0) {
            protocolMessages++;
        } else if (strcmp(type, "device_info") == 0 ||
                   strcmp(type, "stats") == 0 ||
                   strcmp(type, "system_command") == 0) {
            systemMessages++;
        }
    }
}

void Helper_DebugScreen::switchToNextScreen() {
    int screenIndex = static_cast<int>(currentScreen);
    screenIndex = (screenIndex + 1) % TOTAL_SCREENS;
    currentScreen = static_cast<ScreenMode>(screenIndex);
    
    Serial.printf("[DebugScreen] Switched to screen mode %d\n", screenIndex);
}

String Helper_DebugScreen::getTypeString(uint8_t typeField) {
    switch (typeField) {
        case 1: return "JSON";
        case 2: return "JSON+PFX";
        case 3: return "GZIP";
        case 4: return "GZIP+PFX";
        default: return "UNKNOWN";
    }
}

void Helper_DebugScreen::updateDisplay() {
    if (oledType == OLEDType::None) return;
    
    // This method should only be called when mutex is already held
    clearScreen();
    
    switch (currentScreen) {
        case ScreenMode::PayloadStats:
            displayPayloadStats();
            break;
        case ScreenMode::RoutingStats:
            displayRoutingStats();
            break;
        case ScreenMode::ProtocolStats:
            displayProtocolStats();
            break;
        case ScreenMode::SystemStatus:
            displaySystemStatus();
            break;
        case ScreenMode::NetworkTopology:
            displayNetworkTopology();
            break;
        case ScreenMode::ErrorStats:
            displayErrorStats();
            break;
    }
    
    if (oledType == OLEDType::Tall) {
        tallOLED.display();
    } else {
        narrowOLED.display();
    }
}

void Helper_DebugScreen::displayPayloadStats() {
    printLine(0, "=== LAST PAYLOAD ===");
    printLine(1, "Total: " + String(totalPayloads));
    
    // Show the actual last payload type
    String typeStr = "Type: ";
    if (totalPayloads > 0) {
        typeStr += getTypeString(lastTypeField);
    } else {
        typeStr += "NONE";
    }
    printLine(2, typeStr);
    
    // Show last payload size specifically
    String sizeStr = "Size: ";
    if (totalPayloads > 0) {
        sizeStr += String(lastPayloadSize) + "b";
    } else {
        sizeStr += "0b";
    }
    printLine(3, sizeStr);
    
    if (getMaxRows() >= 8) {
        // Show interval between this and previous payload
        printLine(4, "Interval: " + (payloadInterval > 0 ? 
                     (payloadInterval < 1000 ? String(payloadInterval) + "ms" : 
                      String(payloadInterval / 1000.0, 1) + "s") : "---"));
        
        // Show route field for last payload
        String routeStr = "Route: ";
        if (totalPayloads > 0) {
            routeStr += String(lastRouteField);
        } else {
            routeStr += "---";
        }
        printLine(5, routeStr);
        
        // Show time since last payload
        String ageStr = "Age: ";
        if (totalPayloads > 0) {
            unsigned long age = millis() - lastPayloadTime;
            if (age < 1000) {
                ageStr += String(age) + "ms";
            } else {
                ageStr += String(age / 1000.0, 1) + "s";
            }
        } else {
            ageStr += "---";
        }
        printLine(6, ageStr);
        
        // Show total cumulative data
        printLine(7, "Total: " + String(totalBytes) + "b");
    }
}

void Helper_DebugScreen::displayRoutingStats() {
    printLine(0, "=== ROUTING STATS ===");
    printLine(1, "Local: " + String(localDestinations));
    printLine(2, "Remote: " + String(remoteDestinations));
    printLine(3, "Invalid: " + String(invalidDestinations));
    
    if (getMaxRows() >= 8) {
        printLine(4, "Last Remote:");
        if (lastRemoteDestination.length() > 0) {
            // Split MAC address for display
            String shortMac = lastRemoteDestination.substring(12); // Last 2 bytes
            printLine(5, "..." + shortMac);
        } else {
            printLine(5, "None");
        }
        
        unsigned long totalRouted = localDestinations + remoteDestinations;
        float localPercent = totalRouted > 0 ? (localDestinations * 100.0 / totalRouted) : 0;
        printLine(6, "Local%: " + String(localPercent, 1) + "%");
        printLine(7, "My MAC: " + getFormattedMacAddress().substring(12));
    }
}

void Helper_DebugScreen::displayProtocolStats() {
    printLine(0, "=== PROTOCOL MIX ===");
    printLine(1, "Sensor: " + String(sensorMessages));
    printLine(2, "Config: " + String(configMessages));
    printLine(3, "Protocol: " + String(protocolMessages));
    
    if (getMaxRows() >= 8) {
        printLine(4, "System: " + String(systemMessages));
        
        unsigned long totalTyped = sensorMessages + configMessages + protocolMessages + systemMessages;
        if (totalTyped > 0) {
            float sensorPercent = sensorMessages * 100.0 / totalTyped;
            float configPercent = configMessages * 100.0 / totalTyped;
            printLine(5, "Sensor%: " + String(sensorPercent, 1) + "%");
            printLine(6, "Config%: " + String(configPercent, 1) + "%");
            printLine(7, "Total: " + String(totalTyped));
        } else {
            printLine(5, "No typed msgs");
            printLine(6, "");
            printLine(7, "");
        }
    }
}

void Helper_DebugScreen::displaySystemStatus() {
    printLine(0, "=== SYSTEM STATUS ===");
    printLine(1, "Heap: " + String(ESP.getFreeHeap() / 1024) + "KB");
    printLine(2, "CPU: " + String(getCpuFrequencyMhz()) + "MHz");
    printLine(3, "Uptime: " + String(millis() / 60000) + "m");
    
    if (getMaxRows() >= 8) {
        printLine(4, "MinHeap: " + String(ESP.getMinFreeHeap() / 1024) + "KB");
        printLine(5, "Tasks: " + String(uxTaskGetNumberOfTasks()));
        
        // Show screen cycling task status
        String taskStatus = (screenCyclingTask != nullptr) ? "ACTIVE" : "INACTIVE";
        printLine(6, "Cycling: " + taskStatus);
        
        // Show data rate
        if (totalPayloads > 0 && millis() > 0) {
            float msgPerSec = totalPayloads * 1000.0 / millis();
            printLine(7, "Rate: " + String(msgPerSec, 2) + " msg/s");
        } else {
            printLine(7, "Rate: 0 msg/s");
        }
    }
}

void Helper_DebugScreen::displayNetworkTopology() {
    printLine(0, "=== NETWORK TOPO ===");
    
    // Determine device role based on routing patterns
    String role = "UNKNOWN";
    if (remoteDestinations > localDestinations * 2) {
        role = "GATEWAY";
    } else if (localDestinations > remoteDestinations * 2) {
        role = "ENDPOINT";
    } else if (localDestinations > 0 && remoteDestinations > 0) {
        role = "HYBRID";
    } else {
        role = "PASSIVE";
    }
    
    printLine(1, "Role: " + role);
    
    String activity = totalPayloads > 10 ? "HIGH" : totalPayloads > 2 ? "MED" : "LOW";
    printLine(2, "Activity: " + activity);
    
    String mode = remoteDestinations > 0 ? "FORWARDING" : "LOCAL";
    printLine(3, "Mode: " + mode);
    
    if (getMaxRows() >= 8) {
        unsigned long totalTraffic = localDestinations + remoteDestinations;
        printLine(4, "Traffic: " + String(totalTraffic));
        
        if (totalTraffic > 0) {
            String flowPattern = "Flow: ";
            if (remoteDestinations > localDestinations) {
                flowPattern += "OUT>";
            } else if (localDestinations > remoteDestinations) {
                flowPattern += "<IN";
            } else {
                flowPattern += "<>BOTH";
            }
            printLine(5, flowPattern);
        } else {
            printLine(5, "Flow: NONE");
        }
        
        printLine(6, "Peers: " + String(remoteDestinations > 0 ? "ACTIVE" : "NONE"));
        
        String status = (millis() - lastPayloadTime < 5000) ? "LIVE" : "IDLE";
        printLine(7, "Status: " + status);
    }
}

void Helper_DebugScreen::displayErrorStats() {
    printLine(0, "=== ERROR TRACKING ===");
    printLine(1, "JSON Err: " + String(jsonErrors));
    printLine(2, "Route Err: " + String(routingErrors));
    printLine(3, "Q Overflow: " + String(queueOverflows));
    
    if (getMaxRows() >= 8) {
        unsigned long totalErrors = jsonErrors + routingErrors + queueOverflows;
        float errorRate = totalPayloads > 0 ? (totalErrors * 100.0 / totalPayloads) : 0;
        
        printLine(4, "Total Err: " + String(totalErrors));
        printLine(5, "Error Rate: " + String(errorRate, 2) + "%");
        
        String health = errorRate < 1.0 ? "GOOD" : errorRate < 5.0 ? "WARN" : "BAD";
        printLine(6, "Health: " + health);
        
        printLine(7, "Reliability: " + String(100.0 - errorRate, 1) + "%");
    }
}

void Helper_DebugScreen::clearScreen() {
    if (oledType == OLEDType::Tall) {
        tallOLED.erase();
        tallOLED.setCursor(0, 0);
        tallOLED.setFont(0);
    } else if (oledType == OLEDType::Narrow) {
        narrowOLED.erase();
        narrowOLED.setCursor(0, 0);
        narrowOLED.setFont(0);
    }
}

void Helper_DebugScreen::printLine(int row, const String& text) {
    if (oledType == OLEDType::None) return;
    
    int maxRows = getMaxRows();
    if (row >= maxRows) return;
    
    int yPos = row * 8; // 8 pixels per row
    
    if (oledType == OLEDType::Tall) {
        tallOLED.setCursor(0, yPos);
        tallOLED.print(text);
    } else {
        narrowOLED.setCursor(0, yPos);
        narrowOLED.print(text);
    }
}

int Helper_DebugScreen::getMaxRows() {
    if (oledType == OLEDType::Tall) {
        return 8; // Tall screen can show 8 rows
    } else if (oledType == OLEDType::Narrow) {
        return 4; // Narrow screen limited to 4 rows
    }
    return 0;
}

// ==========================================
// STREAMPROCESSOR INTEGRATION METHODS
// ==========================================

void Helper_DebugScreen::trackJsonError() {
    if (oledType == OLEDType::None) return;  // No overhead if no screen
    jsonErrors++;
    Serial.println("[DebugScreen] JSON error tracked");
}

void Helper_DebugScreen::trackLocalDestination() {
    if (oledType == OLEDType::None) return;  // No overhead if no screen
    localDestinations++;
}

void Helper_DebugScreen::trackRemoteDestination(const String& mac) {
    if (oledType == OLEDType::None) return;  // No overhead if no screen
    remoteDestinations++;
    lastRemoteDestination = mac;
}

void Helper_DebugScreen::trackQueueOverflow(const String& queueType) {
    if (oledType == OLEDType::None) return;  // No overhead if no screen
    queueOverflows++;
    Serial.printf("[DebugScreen] Queue overflow tracked: %s\n", queueType.c_str());
}

void Helper_DebugScreen::trackRoutingError() {
    if (oledType == OLEDType::None) return;  // No overhead if no screen
    routingErrors++;
    Serial.println("[DebugScreen] Routing error tracked");
}