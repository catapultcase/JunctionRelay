#include "ConnectionManager.h"
#include <ArduinoJson.h>
#include <lvgl.h>
#include <Preferences.h>
#include <esp_now.h>
#include <ESPmDNS.h> 
#include "DeviceConfig.h"
#include "Manager_Charlieplex.h"
#include "Manager_QuadDisplay.h"
#include "Manager_Matrix.h"
#include "Manager_MQTT.h"
#include "Manager_NeoPixels.h"
#include "utils.h"
#include "Adafruit_MAX1704X.h"
#include "Manager_ESPNOW.h"
#include <nvs_flash.h>

// ESP32-S3 analog pin compatibility (add right after includes)
#ifndef A0
#define A0 1
#endif
#ifndef A1  
#define A1 2
#endif
#ifndef A2
#define A2 3
#endif
#ifndef A3
#define A3 4
#endif
#ifndef A4
#define A4 5
#endif
#ifndef A5
#define A5 6
#endif
#ifndef A6
#define A6 7
#endif
#ifndef A7
#define A7 8
#endif

const char* ConnectionManager::defaultSSID = "JunctionRelay_Config";

// Global pointer for static handlers
static ConnectionManager* gConnMgr = nullptr;
static char tempPostBodyBuffer[2048];  // Fixed-size buffer
static size_t tempPostBodyLen = 0;     // Track actual length

// Initialize the static queues and task handles
QueueHandle_t ConnectionManager::sensorQueue = NULL;
TaskHandle_t ConnectionManager::sensorProcessingTaskHandle = NULL;
QueueHandle_t ConnectionManager::configQueue = NULL;
TaskHandle_t ConnectionManager::configProcessingTaskHandle = NULL;

ConnectionManager::ConnectionManager()
  : server(80),
    payloadLength(0),
    readingLength(true),
    bytesRead(0),
    connMode(""),
    screenRouter(nullptr),
    mqttManager(nullptr),
    hasReceivedConfig(false),
    lastConfigTimestamp(0),
    configCount(0),
    batteryInitialized(false),
    espnowManager(nullptr),
    webSocketHelper(nullptr),
    httpHelper(nullptr),
    networkHelper(nullptr),
    activePrimaryProtocol(PrimaryProtocol::WEBSOCKET_HTTP),
    backendServerIP(""),
    backendServerPort(7180)
{
    gConnMgr = this;
    memset(prefixBuffer, 0, sizeof(prefixBuffer));
    memset(staticPayloadBuffer, 0, sizeof(staticPayloadBuffer));
    
    // Initialize helper classes
    webSocketHelper = new Helper_WebSocket(this);
    httpHelper = new Helper_HTTP(this);
    networkHelper = new Helper_Network(this);
    
    // Set up network event callback
    networkHelper->setNetworkEventCallback([this](const String& networkType, bool connected) {
        this->handleNetworkEvent(networkType, connected);
    });
    
    // Create the sensor queue if it doesn't exist
    if (sensorQueue == NULL) {
        sensorQueue = xQueueCreate(SENSOR_QUEUE_SIZE, sizeof(JsonDocument*));
        if (sensorQueue == NULL) {
            Serial.println("[ERROR] Failed to create sensor queue");
        } else {
            Serial.printf("[DEBUG] Created sensor queue (size %d)\n", SENSOR_QUEUE_SIZE);
            
            // Create a dedicated task for processing sensor updates
            xTaskCreatePinnedToCore(
                [](void* param) {
                    Serial.printf("[SensorProcessingTask] Started on core %d\n", xPortGetCoreID());
                    
                    for (;;) {
                        JsonDocument* doc = NULL;
                        
                        // Wait for a sensor update
                        if (xQueueReceive(sensorQueue, &doc, portMAX_DELAY) == pdTRUE) {
                            if (doc != NULL) {
                                // Cast to StaticJsonDocument<8192> since that's what we're storing
                                StaticJsonDocument<8192>& staticDoc = *static_cast<StaticJsonDocument<8192>*>(doc);
                                
                                // Process the sensor data with the properly cast document
                                if (gConnMgr && gConnMgr->screenRouter) {
                                    gConnMgr->screenRouter->routeSensor(staticDoc);
                                }
                                
                                // Clean up
                                delete doc;
                            }
                        }
                    }
                },
                "SensorProcessing",
                8192,
                NULL,
                1,  // Priority
                &sensorProcessingTaskHandle,
                1   // Core 1
            );
        }
    }

    // Create the config queue if it doesn't exist
    if (configQueue == NULL) {
        configQueue = xQueueCreate(CONFIG_QUEUE_SIZE, sizeof(JsonDocument*));
        if (configQueue == NULL) {
            Serial.println("[ERROR] Failed to create config queue");
        } else {
            Serial.printf("[DEBUG] Created config queue (size %d)\n", CONFIG_QUEUE_SIZE);
            
            // Create a dedicated task for processing config updates
            xTaskCreatePinnedToCore(
                [](void* param) {
                    Serial.printf("[ConfigProcessingTask] Started on core %d\n", xPortGetCoreID());
                    
                    for (;;) {
                        JsonDocument* doc = NULL;
                        
                        // Wait for a config update
                        if (xQueueReceive(configQueue, &doc, portMAX_DELAY) == pdTRUE) {
                            if (doc != NULL) {
                                // Extract screenId
                                const char* screenId = (*doc)["screenId"];
                                
                                Serial.printf("[ConfigTask] 🔄 Starting config routing on core %d...\n", xPortGetCoreID());
                                
                                // Cast to StaticJsonDocument<8192> since that's what we're storing
                                StaticJsonDocument<8192>& staticDoc = *static_cast<StaticJsonDocument<8192>*>(doc);
                                
                                bool success = true;
                                
                                // Run layout logic (on core 1) with the properly cast document
                                try {
                                    if (gConnMgr) {
                                        gConnMgr->handleScreenId(screenId, staticDoc);
                                        if (gConnMgr->screenRouter) {
                                            gConnMgr->screenRouter->routeConfig(staticDoc);
                                        }
                                        
                                        // ✅ ADDED: Mark that we've successfully received and processed a config
                                        gConnMgr->hasReceivedConfig = true;
                                        gConnMgr->lastConfigTimestamp = millis();
                                        gConnMgr->configCount++;
                                        
                                        Serial.printf("[ConfigTask] ✅ Config applied. Total configs: %d\n", gConnMgr->configCount);
                                    }
                                } catch (...) {
                                    Serial.println("[ConfigTask] ❌ Exception during config routing.");
                                    success = false;
                                }
                                
                                if (!success && gConnMgr && gConnMgr->screenRouter) {
                                    Serial.println("[ConfigTask] ⚠️ Fallback to HOME layout.");
                                    DynamicJsonDocument fallback(128);
                                    gConnMgr->screenRouter->routeConfig(fallback);
                                }
                                
                                // Clean up
                                delete doc;
                                
                                Serial.println("[ConfigTask] ✅ Done.");
                            }
                        }
                    }
                },
                "ConfigProcessing",
                8192,
                NULL,
                1,  // Priority
                &configProcessingTaskHandle,
                1   // Core 1
            );
        }
    }
}

ConnectionManager::~ConnectionManager() {
    if (webSocketHelper) {
        delete webSocketHelper;
        webSocketHelper = nullptr;
    }
    if (httpHelper) {
        delete httpHelper;
        httpHelper = nullptr;
    }
    if (networkHelper) {
        delete networkHelper;
        networkHelper = nullptr;
    }
    if (espnowManager) {
        delete espnowManager;
        espnowManager = nullptr;
    }
    if (mqttManager) {
        delete mqttManager;
        mqttManager = nullptr;
    }
}

void ConnectionManager::init() {
    Serial.println("[ConnectionManager] Starting initialization...");
    
    Preferences p;
    p.begin("connConfig", false);
    connMode     = p.getString("connMode", "");
    ssid         = p.getString("ssid", "");
    pass         = p.getString("pass", "");
    mqttBroker   = p.getString("mqttBroker", "");
    mqttUserName = p.getString("mqttUsername", "");
    mqttPassword = p.getString("mqttPassword", "");
    
    // ✅ load backendPort directly as int with fallback to 7180
    backendServerPort = p.getInt("backendPort", 7180);
    if (backendServerPort <= 0 || backendServerPort > 65535) {
        Serial.printf("[WARNING] Invalid backendPort (%d), defaulting to 7180\n", backendServerPort);
        backendServerPort = 7180;
    }
    
    p.end();
    
    Serial.println("[ConnectionManager] Preferences loaded");
    Serial.printf("[ConnectionManager] Connection mode: %s, backendPort: %d\n",
                  connMode.c_str(), backendServerPort);

    // ✅ SAFETY CHECK: If WiFi mode but no credentials, start captive portal
    if ((connMode == "wifi" || connMode.isEmpty()) && ssid.isEmpty()) {
        Serial.println("[SAFETY] WiFi mode selected but no SSID configured - starting captive portal");
        startCaptivePortal();
        return; // Exit early - captive portal will handle everything
    }
    
    // ✅ SAFETY CHECK: Prevent rapid restart loops
    static unsigned long lastInitTime = 0;
    static int initCount = 0;
    unsigned long currentTime = millis();
    
    if (currentTime < 30000) { // Within first 30 seconds of boot
        initCount++;
        if (initCount > 2 && (currentTime - lastInitTime) < 10000) {
            Serial.printf("[SAFETY] Detected rapid restart loop (count: %d) - starting captive portal\n", initCount);
            startCaptivePortal();
            return;
        }
    } else {
        initCount = 0; // Reset counter after 30 seconds
    }
    lastInitTime = currentTime;

    initBattery();

    // ==========================================
    // PROTOCOL-BASED INITIALIZATION
    // ==========================================
    
    if (connMode == "espnow") {
        // 📡 ESP-NOW Only Mode
        Serial.println("[PROTOCOL] Setting up ESP-NOW only mode");
        activePrimaryProtocol = PrimaryProtocol::ESPNOW;
        
        espnowManager = new Manager_ESPNOW(this);
        if (espnowManager->begin()) {
            Serial.println("[PROTOCOL] ✅ ESP-NOW initialized successfully");
        } else {
            Serial.println("[PROTOCOL] ❌ ESP-NOW initialization failed");
            delete espnowManager;
            espnowManager = nullptr;
        }
        
        emitStatus();
        return;  // Exit early - ESP-NOW doesn't need network setup
    }
    
    else if (connMode == "gateway") {
        // 🌐 Gateway Mode (Ethernet + ESP-NOW)
        Serial.println("[PROTOCOL] Setting up Gateway mode (Ethernet + ESP-NOW)");
        activePrimaryProtocol = PrimaryProtocol::GATEWAY;
        
        // Initialize ESP-NOW for bridging
        espnowManager = new Manager_ESPNOW(this);
        if (espnowManager->begin()) {
            Serial.println("[PROTOCOL] ✅ ESP-NOW initialized for gateway forwarding");
        } else {
            Serial.println("[PROTOCOL] ❌ ESP-NOW initialization failed");
            delete espnowManager;
            espnowManager = nullptr;
        }
        
        // Setup backup WiFi if configured
        if (!ssid.isEmpty()) {
            Serial.println("[PROTOCOL] Setting up backup WiFi for gateway");
            networkHelper->setupWiFiBackup();
        }
    }
    
    else if (connMode == "ethernet") {
        // 🔌 Ethernet Only Mode  
        Serial.println("[PROTOCOL] Setting up Ethernet only mode");
        activePrimaryProtocol = PrimaryProtocol::WEBSOCKET_HTTP;
        
        // Setup backup WiFi if Ethernet fails and WiFi is configured
        if (!ssid.isEmpty()) {
            Serial.println("[PROTOCOL] Setting up backup WiFi for Ethernet mode");
            networkHelper->setupWiFiBackup();
        }
    }
    
    else if (connMode == "wifi" || connMode.isEmpty()) {
        // 📶 WiFi Mode (default)
        Serial.println("[PROTOCOL] Setting up WiFi mode");
        activePrimaryProtocol = PrimaryProtocol::WEBSOCKET_HTTP;
        
        if (!ssid.isEmpty()) {
            Serial.println("[PROTOCOL] WiFi credentials found, attempting connection");
            networkHelper->setupWiFiPrimary();
        } else {
            Serial.println("[PROTOCOL] No WiFi credentials, starting captive portal");
            startCaptivePortal();
            return; // Exit early - captive portal will handle everything
        }
    }
    
    else {
        Serial.printf("[PROTOCOL] ❌ Unknown connection mode: %s, starting captive portal\n", connMode.c_str());
        startCaptivePortal();
        return; // Exit early for unknown modes
    }

    // ==========================================
    // NETWORK-DEPENDENT SERVICES
    // ==========================================
    
    setupProtocolBasedServices();

    // Push initial status to UI
    emitStatus();
    Serial.println("[ConnectionManager] Initialization complete");
}

void ConnectionManager::setupProtocolBasedServices() {
    // Only setup network services for modes that use network connectivity
    if (activePrimaryProtocol == PrimaryProtocol::WEBSOCKET_HTTP || 
        activePrimaryProtocol == PrimaryProtocol::GATEWAY) {
        
        // Setup HTTP API endpoints
        setupHTTPEndpoints();
        
        // Start the HTTP server
        server.begin();
        Serial.println("[HTTP] Server started on port 80");
        
        // Setup WebSocket client (for backend communication)
        webSocketHelper->setupClient();
        
        // Setup MQTT if configured (independent of primary protocol)
        if (!mqttBroker.isEmpty()) {
            setupMQTTClient();
        }
        
        // Setup network monitoring tasks
        networkHelper->startMDNSTask();
        // networkHelper->startNetworkMonitoringTask();
    }
}

void ConnectionManager::setupHTTPEndpoints() {
    // Main data endpoint
    server.on("/api/data", HTTP_POST,
        [](AsyncWebServerRequest* req){ 
            AsyncWebServerResponse *response = req->beginResponse(200, "text/plain", "OK");
            response->addHeader("Connection", "keep-alive");
            response->addHeader("Keep-Alive", "timeout=60, max=1000");
            req->send(response);
        },
        nullptr,
        [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t) {
            if (gConnMgr) gConnMgr->handleIncomingDataChunkPrefix(data, len);
        }
    );

    server.on("/api/device/capabilities", HTTP_GET,
        [](AsyncWebServerRequest* req){
            req->send(200, "application/json", gConnMgr->getDeviceCapabilities());
        }
    );

    server.on("/api/device/info", HTTP_GET,
        [](AsyncWebServerRequest* req){
            req->send(200, "application/json", gConnMgr->getDeviceInfo());
        }
    );

    server.on("/api/device/preferences", HTTP_GET,
        [](AsyncWebServerRequest* req){
            req->send(200, "application/json", gConnMgr->getCurrentPreferences());
        }
    );

    server.on("/api/device/wipe-preferences", HTTP_POST,
        [](AsyncWebServerRequest* req){
            Serial.println("[WIPE] Complete preferences wipe requested");
            
            if (!gConnMgr) {
                req->send(500, "application/json", "{\"error\":\"ConnectionManager not available\"}");
                return;
            }
            
            bool success = true;
            String message = "All preferences wiped successfully";
            
            try {
                // Wipe ALL NVS preferences at once
                nvs_flash_erase();
                nvs_flash_init();
                
                Serial.println("[WIPE] ✅ All NVS preferences erased");
                
                // Reset configuration state
                gConnMgr->resetConfigState();
                Serial.println("[WIPE] ✅ Configuration state reset");
                
            } catch (...) {
                success = false;
                message = "Wipe failed due to error";
                Serial.println("[WIPE] ❌ Exception during wipe");
            }
            
            // Build response
            StaticJsonDocument<256> doc;
            doc["success"] = success;
            doc["message"] = message;
            doc["timestamp"] = millis();
            doc["restartIn"] = 3;
            
            String response;
            serializeJson(doc, response);
            req->send(success ? 200 : 500, "application/json", response);
            
            if (success) {
                Serial.println("[WIPE] Device will restart in 3 seconds...");
                delay(3000);
                ESP.restart();
            }
        }
    );

    server.on("/api/device/set-preferences", HTTP_POST,
        [](AsyncWebServerRequest* req){
            if (gConnMgr) gConnMgr->handleSetPreferences(req);
        },
        NULL,
        [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total){
            Serial.printf("[DEBUG] Body handler called: len=%d, index=%d, total=%d\n", len, index, total);
            
            if (index == 0) {
                tempPostBodyLen = 0;
                memset(tempPostBodyBuffer, 0, sizeof(tempPostBodyBuffer));
            }
            
            if (tempPostBodyLen + len >= sizeof(tempPostBodyBuffer)) {
                Serial.printf("[ERROR] POST body too large! Max size: %d\n", sizeof(tempPostBodyBuffer));
                return;
            }
            
            memcpy(tempPostBodyBuffer + tempPostBodyLen, data, len);
            tempPostBodyLen += len;
            tempPostBodyBuffer[tempPostBodyLen] = '\0';
            
            Serial.printf("[DEBUG] Total body length so far: %d\n", tempPostBodyLen);
        }
    );

    server.on("/api/firmware/hash", HTTP_GET,
        [](AsyncWebServerRequest* req){
            Serial.println("[ENDPOINT] Firmware hash requested");
            String response = getFirmwareInfoJson();
            req->send(200, "application/json", response);
        }
    );

    server.on("/api/health/heartbeat", HTTP_GET,
        [](AsyncWebServerRequest* req){
            String mac = getFormattedMacAddress();
            String response = "{";
            response += "\"status\":\"OK\",";
            response += "\"mac\":\"" + mac + "\",";
            response += "\"firmware\":\"" + String(getFirmwareVersion()) + "\",";
            response += "\"uptime\":" + String(millis()) + ",";
            response += "\"free_heap\":" + String(ESP.getFreeHeap());
            response += "}";
            
            req->send(200, "application/json", response);
        }
    );

    server.on("/api/connection/status", HTTP_GET, [](AsyncWebServerRequest *req){
        ConnectionStatus s = gConnMgr->getConnectionStatus();
        DynamicJsonDocument doc(512);
        doc["espNow"] = s.espNowActive;
        doc["wifiUp"] = s.wifiConnected;
        doc["mqttUp"] = s.mqttConnected;
        doc["ethernetUp"] = s.ethernetConnected;
        doc["webSocketUp"] = s.webSocketConnected;
        doc["ip"] = s.ipAddress;
        doc["mac"] = s.macAddress;
        doc["activeNetworkType"] = s.activeNetworkType;
        doc["backendServerIP"] = s.backendServerIP;
        
        if (s.ethernetConnected) {
            doc["ethernetIP"] = s.ethernetIP;
            doc["ethernetMAC"] = s.ethernetMAC;
        }
        
        String out;
        serializeJson(doc, out);
        req->send(200, "application/json", out);
    });

    server.on("/api/system/statslite", HTTP_GET,
        [](AsyncWebServerRequest* req){
            if (gConnMgr) {
                gConnMgr->getSystemStatsLightweightAsync(req);
            } else {
                req->send(500, "application/json", "{\"error\":\"ConnectionManager not available\"}");
            }
        }
    );

    server.on("/api/system/stats", HTTP_GET,
        [](AsyncWebServerRequest* req){
            if (gConnMgr) {
                gConnMgr->getSystemStatsAsync(req);
            } else {
                req->send(500, "application/json", "{\"error\":\"ConnectionManager not available\"}");
            }
        }
    );

    server.on("/api/gateway/status", HTTP_GET, [](AsyncWebServerRequest *req){
        if (!gConnMgr) {
            req->send(500, "application/json", "{\"error\":\"Not available\"}");
            return;
        }
        
        StaticJsonDocument<256> doc;
        doc["hasEthernet"] = gConnMgr->devicePtr && gConnMgr->devicePtr->supportsEthernet() && gConnMgr->devicePtr->isEthernetConnected();
        doc["hasESPNow"] = gConnMgr->espnowManager && gConnMgr->espnowManager->isInitialized();
        doc["canForward"] = doc["hasEthernet"] && doc["hasESPNow"];
        doc["peerCount"] = gConnMgr->espnowManager ? gConnMgr->espnowManager->getPeerCount() : 0;
        
        String output;
        serializeJson(doc, output);
        req->send(200, "application/json", output);
    });

    server.on("/api/device/battery", HTTP_GET,
        [](AsyncWebServerRequest* req){
            if (gConnMgr && gConnMgr->isBatteryAvailable()) {
                StaticJsonDocument<256> doc;
                
                float voltage = gConnMgr->maxlipo.cellVoltage();
                float percent = gConnMgr->maxlipo.cellPercent();
                
                doc["available"] = true;
                doc["voltage"] = round(voltage * 1000) / 1000.0;
                doc["percent"] = round(percent * 10) / 10.0;
                doc["isCharging"] = (voltage > 4.0);
                doc["lowBattery"] = (percent < 20.0);
                doc["criticalBattery"] = (percent < 10.0);
                doc["timestamp"] = millis();
                
                if (percent > 80) {
                    doc["status"] = "excellent";
                } else if (percent > 60) {
                    doc["status"] = "good";
                } else if (percent > 40) {
                    doc["status"] = "fair";
                } else if (percent > 20) {
                    doc["status"] = "low";
                } else {
                    doc["status"] = "critical";
                }
                
                String output;
                serializeJson(doc, output);
                req->send(200, "application/json", output);
            } else {
                req->send(404, "application/json", "{\"available\":false,\"message\":\"Battery monitoring not available\"}");
            }
        }
    );

    server.on("/api/system/reset-config", HTTP_POST,
        [](AsyncWebServerRequest* req){
            Serial.println("[CONFIG] Configuration reset requested");
            if (gConnMgr) {
                gConnMgr->resetConfigState();
                req->send(200, "application/json", "{\"success\":true,\"message\":\"Configuration state reset\"}");
            } else {
                req->send(500, "application/json", "{\"error\":\"ConnectionManager not available\"}");
            }
        }
    );

    // ESP-NOW API endpoints (only if not in ESP-NOW only mode)
    if (connMode != "espnow") {
        server.on("/api/espnow/status", HTTP_GET,
            [](AsyncWebServerRequest* req){
                if (gConnMgr && gConnMgr->espnowManager) {
                    String status = gConnMgr->espnowManager->getStatusJSON();
                    req->send(200, "application/json", status);
                } else {
                    req->send(404, "application/json", "{\"error\":\"ESP-NOW not initialized\"}");
                }
            }
        );

        server.on("/api/espnow/stats", HTTP_GET,
            [](AsyncWebServerRequest* req){
                if (gConnMgr && gConnMgr->espnowManager) {
                    String stats = gConnMgr->espnowManager->getStatisticsJSON();
                    req->send(200, "application/json", stats);
                } else {
                    req->send(404, "application/json", "{\"error\":\"ESP-NOW not initialized\"}");
                }
            }
        );

        // ESP-NOW peer management endpoints
        server.on("/api/espnow/peers", HTTP_POST,
            [](AsyncWebServerRequest* req){
                req->send(200, "text/plain", "OK");
            },
            nullptr,
            [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t) {
                if (gConnMgr && gConnMgr->espnowManager) {
                    // Parse the JSON to get MAC and name
                    StaticJsonDocument<256> doc;
                    DeserializationError error = deserializeJson(doc, (const char*)data, len);
                    
                    if (!error && doc.containsKey("mac")) {
                        String mac = doc["mac"].as<String>();
                        String name = doc.containsKey("name") ? doc["name"].as<String>() : "Unknown";
                        
                        Serial.printf("[ESPNOW] Adding peer: %s (%s)\n", mac.c_str(), name.c_str());
                        
                        bool success = gConnMgr->espnowManager->addPeer(mac);
                        
                        if (success) {
                            Serial.printf("[ESPNOW] ✅ Added peer %s (%s)\n", mac.c_str(), name.c_str());
                        } else {
                            Serial.printf("[ESPNOW] ❌ Failed to add peer %s\n", mac.c_str());
                        }
                    } else {
                        Serial.println("[ESPNOW] ❌ Invalid peer data received");
                    }
                }
            }
        );

        // Get all peers
        server.on("/api/espnow/peers", HTTP_GET,
            [](AsyncWebServerRequest* req){
                if (gConnMgr && gConnMgr->espnowManager) {
                    String peers = gConnMgr->espnowManager->getPeersJSON();
                    req->send(200, "application/json", peers);
                } else {
                    req->send(404, "application/json", "{\"error\":\"ESP-NOW not initialized\"}");
                }
            }
        );

        // Remove a peer
        server.on("/api/espnow/peers", HTTP_DELETE,
            [](AsyncWebServerRequest* req){
                req->send(200, "text/plain", "OK");
            },
            nullptr,
            [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t) {
                if (gConnMgr && gConnMgr->espnowManager) {
                    StaticJsonDocument<256> doc;
                    DeserializationError error = deserializeJson(doc, (const char*)data, len);
                    
                    if (!error && doc.containsKey("mac")) {
                        String mac = doc["mac"].as<String>();
                        
                        Serial.printf("[ESPNOW] Removing peer: %s\n", mac.c_str());
                        
                        bool success = gConnMgr->espnowManager->removePeer(mac);
                        
                        if (success) {
                            Serial.printf("[ESPNOW] ✅ Removed peer %s\n", mac.c_str());
                        } else {
                            Serial.printf("[ESPNOW] ❌ Failed to remove peer %s\n", mac.c_str());
                        }
                    } else {
                        Serial.println("[ESPNOW] ❌ Invalid peer data for removal");
                    }
                }
            }
        );
    }

    server.on("/api/ota/firmware", HTTP_POST,
        [](AsyncWebServerRequest* req) {
            bool ok = !Update.hasError();
            req->send(ok ? 200 : 500, "text/plain",
                    ok ? "Update OK" : String("FAIL: ") + Update.errorString());
            if (ok) {
                delay(2000);
                ESP.restart();
            }
        },
        [](AsyncWebServerRequest* req, const String&, size_t idx,
        uint8_t* data, size_t len, bool final)
        {
            if (idx == 0) {
                Update.begin(UPDATE_SIZE_UNKNOWN);
            }
            Update.write(data, len);
            if (final) {
                Update.end(true);
            }
        }
    );
}

void ConnectionManager::setupMQTTClient() {
    // Extract host and port
    String host;
    uint16_t port = 1883;
    
    Serial.printf("[MQTT] Raw broker string: '%s'\n", mqttBroker.c_str());
    
    int colonPos = mqttBroker.indexOf(':');
    if (colonPos >= 0) {
        host = mqttBroker.substring(0, colonPos);
        String portStr = mqttBroker.substring(colonPos + 1);
        portStr.trim();
        
        if (portStr.length() > 0) {
            int parsedPort = portStr.toInt();
            if (parsedPort > 0 && parsedPort <= 65535) {
                port = parsedPort;
            } else {
                Serial.printf("[MQTT] Invalid port '%s', using default 1883\n", portStr.c_str());
            }
        }
    } else {
        host = mqttBroker;
    }
    
    host.trim();
    
    Serial.printf("[MQTT] Extracted host: '%s', port: %d\n", host.c_str(), port);
    
    if (!host.isEmpty()) {
        mqttManager = new Manager_MQTT(host.c_str(), port, this);
        
        xTaskCreatePinnedToCore(
            [](void* arg){
                auto *cm = static_cast<ConnectionManager*>(arg);
                unsigned long lastStatusCheck = 0;
                const unsigned long STATUS_CHECK_INTERVAL = 500;
                
                for (;;) {
                    unsigned long now = millis();
                    bool shouldUpdateStatus = false;
                    bool networkAvailable = false;
                    String networkType = "";
                    
                    // Check for network connectivity - WiFi OR Ethernet
                    if (WiFi.status() == WL_CONNECTED) {
                        networkAvailable = true;
                        networkType = "WiFi";
                    } else if (cm->devicePtr && cm->devicePtr->supportsEthernet() && cm->devicePtr->isEthernetConnected()) {
                        networkAvailable = true;
                        networkType = "Ethernet";
                    }
                    
                    if (networkAvailable) {
                        if (!cm->mqttManager->connected()) {
                            Serial.printf("[MQTTTask] Reconnecting via %s…\n", networkType.c_str());
                            cm->mqttManager->begin();
                            shouldUpdateStatus = true;
                        }
                    } else {
                        if (cm->mqttManager->connected()) {
                            Serial.println("[MQTTTask] Network disconnected, MQTT will disconnect");
                            shouldUpdateStatus = true;
                        }
                        Serial.println("[MQTTTask] Waiting for network (WiFi or Ethernet)...");
                    }
                    
                    if (shouldUpdateStatus || (now - lastStatusCheck >= STATUS_CHECK_INTERVAL)) {
                        cm->emitStatus();
                        lastStatusCheck = now;
                    }
                    
                    vTaskDelay(1000 / portTICK_PERIOD_MS);
                }
            },
            "MQTTTask",
            8192,
            this,
            1,
            nullptr,
            1
        );
    } else {
        Serial.println("[MQTT] Empty host after parsing, cannot create MQTT manager");
    }
}

void ConnectionManager::handleSerialData() {
    // Handle USB Serial (Serial Monitor) - use prefix parser
    if (Serial.available() > 0) {
        size_t len = Serial.available();
        uint8_t* buffer = new uint8_t[len];
        Serial.readBytes(buffer, len);
        if (gConnMgr) {
            gConnMgr->handleIncomingDataChunkPrefix(buffer, len);
        }
        delete[] buffer;
    }
    
    // Handle UART Serial (TX/RX pins) - use prefix parser
    if (Serial1.available() > 0) {
        size_t len = Serial1.available();
        uint8_t* buffer = new uint8_t[len];
        Serial1.readBytes(buffer, len);
        if (gConnMgr) {
            Serial.println("[DEBUG] Received data via UART TX/RX pins");
            gConnMgr->handleIncomingDataChunkPrefix(buffer, len);
        }
        delete[] buffer;
    }
}

void ConnectionManager::handleIncomingDataChunkPrefix(uint8_t *data, size_t len) {
    if (data == nullptr || len == 0) {
        return;
    }

    // NEW: Check if the payload starts with JSON (no prefix)
    if (readingLength && bytesRead == 0 && len > 0) {
        // Check if first character is '{' - indicates JSON without prefix
        if (data[0] == '{') {
            // Serial.println("[DEBUG] No prefix detected, processing JSON directly");
            handleIncomingDataChunk(data, len);
            return;
        }
    }

    // EXISTING: Stage 1: Extract the 8-byte prefix (contains length of the payload)
    if (readingLength) {
        size_t prefixCopyLen = min(len, (size_t)(8 - bytesRead));
        memcpy(prefixBuffer + bytesRead, data, prefixCopyLen);
        bytesRead += prefixCopyLen;
        
        if (bytesRead >= 8) {
            prefixBuffer[8] = '\0';
            
            // Check if the prefix contains only digits
            bool isValidPrefix = true;
            for (int i = 0; i < 8; i++) {
                if (!isdigit(prefixBuffer[i])) {
                    isValidPrefix = false;
                    break;
                }
            }
            
            if (!isValidPrefix) {
                Serial.println("[ERROR] Invalid prefix format - expected 8 digits");
                readingLength = true;
                bytesRead = 0;
                return;
            }
            
            payloadLength = atoi(prefixBuffer);
            
            if (payloadLength <= 0 || payloadLength > MAX_PAYLOAD_SIZE) {
                Serial.printf("[ERROR] Invalid payload length: %d\n", payloadLength);
                readingLength = true;
                bytesRead = 0;
                return;
            }
            
            // Serial.printf("[DEBUG] Stripped 8-digit prefix '%s', expecting %d bytes\n", prefixBuffer, payloadLength);
            
            readingLength = false;
            bytesRead = 0;
            
            if (prefixCopyLen < len) {
                size_t remainingLen = len - prefixCopyLen;
                memcpy(staticPayloadBuffer, data + prefixCopyLen, remainingLen);
                bytesRead += remainingLen;
            }
        }
    } 
    // EXISTING: Stage 2: Accumulate payload data
    else {
        size_t remainingBytes = payloadLength - bytesRead;
        size_t copyLen = (len < remainingBytes) ? len : remainingBytes;
        
        memcpy(staticPayloadBuffer + bytesRead, data, copyLen);
        bytesRead += copyLen;
    }

    // EXISTING: Stage 3: When complete payload is received, process it
    if (!readingLength && bytesRead >= payloadLength) {
        handleIncomingDataChunk(staticPayloadBuffer, payloadLength);
        
        // Reset for next message
        readingLength = true;
        bytesRead = 0;
        payloadLength = 0;
    }
}

void ConnectionManager::handleIncomingDataChunk(uint8_t *data, size_t len) {
    if (data == nullptr || len == 0) return;

    StaticJsonDocument<8192> doc;
    DeserializationError error = deserializeJson(doc, (const char*)data, len);

    if (error) {
        Serial.printf("[ERROR] deserializeJson() failed: %s\n", error.c_str());
        return;
    }

    // ✅ GATEWAY: Check for forwarding destination
    if (doc.containsKey("destination")) {
        String destinationMac = doc["destination"].as<String>();
        
        if (!destinationMac.isEmpty()) {
            if (espnowManager && espnowManager->isInitialized()) {
                doc.remove("destination");
                
                String forwardPayload;
                serializeJson(doc, forwardPayload);
                
                bool success = espnowManager->sendMessage(destinationMac, forwardPayload);
                
                if (success) {
                    // Serial.printf("[GATEWAY] ✅ Forwarded %s (%d bytes)\n", 
                    //             doc["type"].as<const char*>(), forwardPayload.length());
                } else {
                    Serial.printf("[GATEWAY] ❌ Forward failed\n");
                }
                
                return; // Don't process locally after forwarding
            } else {
                Serial.println("[GATEWAY] ❌ ESP-NOW not available");
            }
        }
    }

    // ✅ EXISTING: Local processing (unchanged)
    const char* type = doc["type"];
    if (!type) return;

    if (strcmp(type, "sensor") == 0 && screenRouter) {
        auto* docCopy = new StaticJsonDocument<8192>(doc);
        offloadSensor(docCopy);
    }
    else if (strcmp(type, "config") == 0 && screenRouter) {
        auto* docCopy = new StaticJsonDocument<8192>(doc);
        offloadConfig(docCopy);
    }
    else if (strcmp(type, "MQTT_Subscription_Request") == 0) {
        if (doc.containsKey("subscriptions") && doc["subscriptions"].is<JsonArray>()) {
            JsonArray subs = doc["subscriptions"];
            int subCount = 0;
            for (JsonVariant t : subs) {
                if (t.is<const char*>()) {
                    const char* topic = t.as<const char*>(); 
                    if (mqttManager) {
                        mqttManager->subscribe(topic);
                        subCount++;
                    }
                }
            }
            Serial.printf("[MQTT] 📡 Subscribed to %d MQTT topic(s)\n", subCount);
        }
    }
    else if (strcmp(type, "wipe_preferences") == 0) {
        Serial.println("[WIPE] Complete preferences wipe requested via data channel");
        
        // Create response document
        StaticJsonDocument<256> response;
        response["type"] = "wipe_preferences_response";
        response["timestamp"] = millis();
        
        bool success = true;
        String message = "All preferences wiped successfully";
        
        try {
            // Wipe ALL NVS preferences at once
            nvs_flash_erase();
            nvs_flash_init();
            
            Serial.println("[WIPE] ✅ All NVS preferences erased");
            
            // Reset configuration state
            resetConfigState();
            Serial.println("[WIPE] ✅ Configuration state reset");
            
        } catch (...) {
            success = false;
            message = "Wipe failed due to error";
            Serial.println("[WIPE] ❌ Exception during wipe");
        }
        
        // Build response
        response["success"] = success;
        response["message"] = message;
        response["restartIn"] = 3;
        
        // Send response back through the same channel
        sendGenericData(response);
        
        if (success) {
            Serial.println("[WIPE] Device will restart in 3 seconds...");
            delay(3000);
            ESP.restart();
        }
    }
}

void ConnectionManager::offloadConfig(JsonDocument* doc) {
    // Ensure we're using StaticJsonDocument in the queue by creating a new copy
    auto* staticDoc = new StaticJsonDocument<8192>();
    staticDoc->set(*doc);  // Copy content from the original document
    delete doc;  // Clean up the original document
    
    if (configQueue == NULL) {
        Serial.println("[ERROR] Config queue not initialized, dropping update");
        delete staticDoc;  // Don't forget to clean up if we can't queue it
        return;
    }
    
    // Queue the static document instead
    if (xQueueSend(configQueue, &staticDoc, 0) != pdTRUE) {
        Serial.println("[WARNING] Config queue full, dropping update");
        delete staticDoc;  // Clean up if we can't add to queue
    } else {
        Serial.println("[DEBUG] Config update queued for processing");
    }
}

void ConnectionManager::offloadSensor(JsonDocument* doc) {
    // Ensure we're using StaticJsonDocument in the queue by creating a new copy
    auto* staticDoc = new StaticJsonDocument<8192>();
    staticDoc->set(*doc);  // Copy content from the original document
    delete doc;  // Clean up the original document
    
    if (sensorQueue == NULL) {
        Serial.println("[ERROR] Sensor queue not initialized, dropping update");
        delete staticDoc;  // Don't forget to clean up if we can't queue it
        return;
    }
    
    // Queue the static document instead
    if (xQueueSend(sensorQueue, &staticDoc, 0) != pdTRUE) {
        Serial.println("[WARNING] Sensor queue full, dropping update");
        delete staticDoc;  // Clean up if we can't add to queue
    } else {
        // Serial.println("[DEBUG] Sensor update queued for processing");
    }
}

void ConnectionManager::handleScreenId(const char* screenId, const StaticJsonDocument<8192>& doc) {
    if (!screenId) return;
    
    // Static flags to ensure each manager type is registered only ONCE
    static bool quadManagerRegistered = false;
    static bool charlieManagerRegistered = false;
    static bool neopixelManagerRegistered = false;
    static bool matrixManagerRegistered = false;
    
    // Get the Wire interface once
    TwoWire* wireInterface = devicePtr->getI2CInterface();
    
    // Debug: Log the current screenId being processed
    Serial.printf("[ConnectionManager] Processing screenId: '%s'\n", screenId);

    // Handle Quad display initialization
    if (doc.containsKey("quad")) {
        Serial.println("[ConnectionManager] Handling Quad display...");
        
        // Register the QuadDisplay manager singleton ONCE
        if (!quadManagerRegistered) {
            Manager_QuadDisplay* quadManager = Manager_QuadDisplay::getInstance(wireInterface);
            screenRouter->registerScreen(quadManager);
            quadManagerRegistered = true;
            Serial.printf("[ConnectionManager] 🔧 Registered QuadDisplay manager singleton with ScreenRouter using %s\n", 
                         (wireInterface == &Wire1) ? "Wire1" : "Wire");
        }
        
        // ALWAYS add the specific display to the singleton manager
        uint8_t i2cAddress = strtol(screenId, nullptr, 0);
        Manager_QuadDisplay::getInstance(wireInterface)->addDisplay(i2cAddress);
        Serial.printf("[ConnectionManager] ✅ Added Quad display at %s (I2C 0x%02X) to singleton manager\n", 
                     screenId, i2cAddress);
    }

    // Handle Charlie display initialization
    else if (doc.containsKey("charlie")) {
        Serial.println("[ConnectionManager] Handling Charlie display...");
        
        // Register the Charlieplex manager singleton ONCE
        if (!charlieManagerRegistered) {
            Manager_Charlieplex* charlieManager = Manager_Charlieplex::getInstance(wireInterface);
            screenRouter->registerScreen(charlieManager);
            charlieManagerRegistered = true;
            Serial.printf("[ConnectionManager] 🔧 Registered Charlieplex manager singleton with ScreenRouter using %s\n", 
                         (wireInterface == &Wire1) ? "Wire1" : "Wire");
        }
        
        // ALWAYS add the specific display to the singleton manager
        uint8_t i2cAddress = strtol(screenId, nullptr, 0);
        Manager_Charlieplex::getInstance(wireInterface)->addDisplay(i2cAddress);
        Serial.printf("[ConnectionManager] ✅ Added Charlie display at %s (I2C 0x%02X) to singleton manager\n", 
                     screenId, i2cAddress);
    }

    // Handle NeoPixel display
    else if (doc.containsKey("neopixel")) {
        Serial.println("[ConnectionManager] Handling NeoPixel display...");

        if (devicePtr->hasExternalNeopixels()) {
            // Register the NeoPixel manager singleton ONCE
            if (!neopixelManagerRegistered) {
                Manager_NeoPixels* neopixelManager = Manager_NeoPixels::getInstance();
                screenRouter->registerScreen(neopixelManager);
                neopixelManagerRegistered = true;
                Serial.printf("[ConnectionManager] 🔧 Registered NeoPixel manager singleton with ScreenRouter\n");
            }
            
            Serial.printf("[ConnectionManager] ✅ NeoPixel display for screenId '%s' handled by singleton manager\n", screenId);
        } else {
            Serial.printf("[ERROR] NeoPixel display not supported for screenId '%s'. Skipping.\n", screenId);
        }
    }
    
    // Handle MATRIX display
    else if (doc.containsKey("matrix")) {
        Serial.println("[ConnectionManager] Handling Matrix display...");

        if (devicePtr->hasExternalMatrix()) {
            // Register the Matrix manager singleton ONCE
            if (!matrixManagerRegistered) {
                Manager_Matrix* matrixManager = Manager_Matrix::getInstance();
                screenRouter->registerScreen(matrixManager);
                matrixManagerRegistered = true;
                Serial.printf("[ConnectionManager] 🔧 Registered Matrix manager singleton with ScreenRouter\n");
            }
            
            Serial.printf("[ConnectionManager] ✅ Matrix display for screenId '%s' handled by singleton manager\n", screenId);
        } else {
            Serial.printf("[ERROR] Matrix display not supported for screenId '%s'. Skipping.\n", screenId);
        }
    }
}

// ==========================================
// UNIFIED DATA SENDING METHODS
// ==========================================

void ConnectionManager::sendGenericData(const JsonDocument& data) {
    switch (activePrimaryProtocol) {
        case PrimaryProtocol::ESPNOW:
            if (espnowManager && espnowManager->isInitialized()) {
                String jsonStr;
                serializeJson(data, jsonStr);
                espnowManager->broadcastMessage(jsonStr);
                Serial.println("[DATA] Sent via ESP-NOW");
            }
            break;
            
        case PrimaryProtocol::WEBSOCKET_HTTP:
        case PrimaryProtocol::GATEWAY:
            if (webSocketHelper && webSocketHelper->isConnected()) {
                webSocketHelper->sendData(data);
            } else if (httpHelper && isNetworkAvailable() && !backendServerIP.isEmpty()) {
                httpHelper->sendDataWithPrefix(data, backendServerIP, backendServerPort);
            } else {
                Serial.println("[DATA] ⚠️ No network available, data queued");
                // TODO: Implement data queuing for retry
            }
            break;
    }
    
    // Also send via MQTT if configured (independent channel)
    if (mqttManager && mqttManager->connected()) {
        String jsonStr;
        serializeJson(data, jsonStr);
        mqttManager->publish("junctionrelay/data", jsonStr.c_str());
        Serial.println("[DATA] Also sent via MQTT");
    }
}

void ConnectionManager::sendConfigData(const JsonDocument& data) {
    Serial.println("[DATA] Sending config data");
    sendGenericData(data);
}

void ConnectionManager::sendSensorData(const JsonDocument& data) {
    Serial.println("[DATA] Sending sensor data");
    sendGenericData(data);
}

// ==========================================
// DEVICE INFO AND CAPABILITIES
// ==========================================

String ConnectionManager::getDeviceInfo() {
    StaticJsonDocument<512> doc;

    doc["deviceModel"] = devicePtr->getDeviceModel();
    doc["deviceManufacturer"] = devicePtr->getDeviceManufacturer();
    doc["firmwareVersion"] = devicePtr->getFirmwareVersion();
    doc["customFirmware"] = devicePtr->getCustomFirmware();
    doc["mcu"] = devicePtr->getMCU();
    doc["wirelessConnectivity"] = devicePtr->getWirelessConnectivity();
    doc["flash"] = devicePtr->getFlash();
    doc["psram"] = devicePtr->getPSRAM();
    doc["uniqueIdentifier"] = devicePtr->getUniqueIdentifier();

    String output;
    serializeJson(doc, output);
    return output;
}

String ConnectionManager::getDeviceCapabilities() {
    StaticJsonDocument<2048> doc;

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

    JsonArray screens = doc.createNestedArray("Screens");

    if (devicePtr->hasOnboardScreen()) {
        JsonObject onboardScreen = screens.createNestedObject();
        onboardScreen["ScreenKey"] = "onboard";
        onboardScreen["DisplayName"] = "Onboard Display";
        onboardScreen["ScreenType"] = "TFT";
        onboardScreen["SupportsConfigPayloads"] = true;
        onboardScreen["SupportsSensorPayloads"] = true;
    }

    if (devicePtr->hasExternalMatrix()) {
        JsonObject matrixScreen = screens.createNestedObject();
        matrixScreen["ScreenKey"] = "matrix";
        matrixScreen["DisplayName"] = "External Matrix";
        matrixScreen["ScreenType"] = "matrix";
        matrixScreen["SupportsConfigPayloads"] = true;
        matrixScreen["SupportsSensorPayloads"] = true;
    }

    if (devicePtr->hasExternalNeopixels()) {
        JsonObject neopixelScreen = screens.createNestedObject();
        neopixelScreen["ScreenKey"] = "neopixel";
        neopixelScreen["DisplayName"] = "External NeoPixel";
        neopixelScreen["ScreenType"] = "NeoPixel";
        neopixelScreen["SupportsConfigPayloads"] = true;
        neopixelScreen["SupportsSensorPayloads"] = true;
    }

    if (devicePtr->hasExternalI2CDevices()) {
        String i2cScanResult = devicePtr->performI2CScan(doc);
        Serial.print("[DEBUG] I2C scan result: ");
        Serial.println(i2cScanResult);
    }

    String output;
    serializeJson(doc, output);
    return output;
}

// ==========================================
// SYSTEM STATISTICS
// ==========================================

void ConnectionManager::getSystemStatsLightweightAsync(AsyncWebServerRequest* request) {
    struct StatsTaskData {
        AsyncWebServerRequest* request;
        ConnectionManager* manager;
    };
    
    StatsTaskData* taskData = new StatsTaskData{request, this};
    
    xTaskCreate(
        [](void* param) {
            StatsTaskData* data = static_cast<StatsTaskData*>(param);
            String stats = data->manager->getSystemStatsLightweight();
            data->request->send(200, "application/json", stats);
            delete data;
            vTaskDelete(NULL);
        },
        "StatsLiteTask",
        4096,
        taskData,
        1,
        NULL
    );
}

void ConnectionManager::getSystemStatsAsync(AsyncWebServerRequest* request) {
    struct StatsTaskData {
        AsyncWebServerRequest* request;
        ConnectionManager* manager;
    };
    
    StatsTaskData* taskData = new StatsTaskData{request, this};
    
    xTaskCreate(
        [](void* param) {
            StatsTaskData* data = static_cast<StatsTaskData*>(param);
            String stats = data->manager->getSystemStats();
            data->request->send(200, "application/json", stats);
            delete data;
            vTaskDelete(NULL);
        },
        "StatsTask",
        4096,
        taskData,
        1,
        NULL
    );
}

String ConnectionManager::getSystemStatsLightweight() {
    StaticJsonDocument<512> doc;
    
    JsonObject memory = doc.createNestedObject("memory");
    memory["freeHeap"] = ESP.getFreeHeap();
    memory["heapSize"] = ESP.getHeapSize();
    
    JsonObject queues = doc.createNestedObject("queues");
    if (sensorQueue != NULL) {
        queues["sensor"]["depth"] = uxQueueMessagesWaiting(sensorQueue);
        queues["sensor"]["maxSize"] = SENSOR_QUEUE_SIZE;
    }
    if (configQueue != NULL) {
        queues["config"]["depth"] = uxQueueMessagesWaiting(configQueue);
        queues["config"]["maxSize"] = CONFIG_QUEUE_SIZE;
    }
    
    JsonObject system = doc.createNestedObject("system");
    system["uptime"] = millis();
    system["cpuFreqMHz"] = getCpuFrequencyMhz();
    
    JsonObject config = doc.createNestedObject("configuration");
    config["hasReceivedConfig"] = hasReceivedConfig;
    config["configCount"] = configCount;
    
    doc["connectionMode"] = connMode;
    doc["timestamp"] = millis();
    
    String output;
    serializeJson(doc, output);
    return output;
}

String ConnectionManager::getSystemStats() {
    StaticJsonDocument<1024> doc;
    
    // Queue statistics
    JsonObject queues = doc.createNestedObject("queues");
    
    if (sensorQueue != NULL) {
        queues["sensor"]["depth"] = uxQueueMessagesWaiting(sensorQueue);
        queues["sensor"]["maxSize"] = SENSOR_QUEUE_SIZE;
        queues["sensor"]["spacesAvailable"] = uxQueueSpacesAvailable(sensorQueue);
    } else {
        queues["sensor"]["depth"] = -1;
        queues["sensor"]["maxSize"] = SENSOR_QUEUE_SIZE;
        queues["sensor"]["spacesAvailable"] = -1;
        queues["sensor"]["status"] = "not_initialized";
    }
    
    if (configQueue != NULL) {
        queues["config"]["depth"] = uxQueueMessagesWaiting(configQueue);
        queues["config"]["maxSize"] = CONFIG_QUEUE_SIZE;
        queues["config"]["spacesAvailable"] = uxQueueSpacesAvailable(configQueue);
    } else {
        queues["config"]["depth"] = -1;
        queues["config"]["maxSize"] = CONFIG_QUEUE_SIZE;
        queues["config"]["spacesAvailable"] = -1;
        queues["config"]["status"] = "not_initialized";
    }
    
    // Memory statistics
    JsonObject memory = doc.createNestedObject("memory");
    memory["freeHeap"] = ESP.getFreeHeap();
    memory["minFreeHeap"] = ESP.getMinFreeHeap();
    memory["heapSize"] = ESP.getHeapSize();
    memory["maxAllocHeap"] = ESP.getMaxAllocHeap();
    
    #ifdef BOARD_HAS_PSRAM
    if (psramFound()) {
        memory["psramSize"] = ESP.getPsramSize();
        memory["freePsram"] = ESP.getFreePsram();
        memory["minFreePsram"] = ESP.getMinFreePsram();
        memory["maxAllocPsram"] = ESP.getMaxAllocPsram();
    }
    #endif
    
    // Task statistics
    JsonObject tasks = doc.createNestedObject("tasks");
    
    if (sensorProcessingTaskHandle != NULL) {
        tasks["sensorProcessing"]["state"] = eTaskGetState(sensorProcessingTaskHandle);
        tasks["sensorProcessing"]["priority"] = uxTaskPriorityGet(sensorProcessingTaskHandle);
        tasks["sensorProcessing"]["stackHighWaterMark"] = uxTaskGetStackHighWaterMark(sensorProcessingTaskHandle);
    } else {
        tasks["sensorProcessing"]["status"] = "not_running";
    }
    
    if (configProcessingTaskHandle != NULL) {
        tasks["configProcessing"]["state"] = eTaskGetState(configProcessingTaskHandle);
        tasks["configProcessing"]["priority"] = uxTaskPriorityGet(configProcessingTaskHandle);
        tasks["configProcessing"]["stackHighWaterMark"] = uxTaskGetStackHighWaterMark(configProcessingTaskHandle);
    } else {
        tasks["configProcessing"]["status"] = "not_running";
    }
    
    // System uptime and performance
    JsonObject system = doc.createNestedObject("system");
    system["uptime"] = millis();
    system["cpuFreqMHz"] = getCpuFrequencyMhz();
    system["flashSize"] = ESP.getFlashChipSize();
    system["sketchSize"] = ESP.getSketchSize();
    system["freeSketchSpace"] = ESP.getFreeSketchSpace();
    
    // WiFi statistics (if connected)
    if (WiFi.status() == WL_CONNECTED) {
        JsonObject wifi = doc.createNestedObject("wifi");
        wifi["rssi"] = WiFi.RSSI();
        wifi["channel"] = WiFi.channel();
        wifi["txPower"] = WiFi.getTxPower();
        wifi["autoReconnect"] = WiFi.getAutoReconnect();
    }
    
    // MQTT statistics (if available)
    if (mqttManager != nullptr) {
        JsonObject mqtt = doc.createNestedObject("mqtt");
        mqtt["connected"] = mqttManager->connected();
        
        if (mqttManager->connected()) {
            if (WiFi.status() == WL_CONNECTED) {
                mqtt["connectionType"] = "WiFi";
                mqtt["localIP"] = WiFi.localIP().toString();
            } else if (devicePtr && devicePtr->supportsEthernet() && devicePtr->isEthernetConnected()) {
                mqtt["connectionType"] = "Ethernet";
                mqtt["localIP"] = devicePtr->getEthernetIP().toString();
            }
        }
    }
    
    // Battery statistics (if available)
    if (devicePtr && devicePtr->hasBattery() && batteryInitialized) {
        JsonObject battery = doc.createNestedObject("battery");
        float voltage = maxlipo.cellVoltage();
        float percent = maxlipo.cellPercent();
        
        battery["voltage"] = round(voltage * 1000) / 1000.0;
        battery["percent"] = round(percent * 10) / 10.0;
        battery["isCharging"] = (voltage > 4.0);
        battery["lowBattery"] = (percent < 20.0);
        battery["criticalBattery"] = (percent < 10.0);
    }
    
    // Configuration state tracking
    JsonObject config = doc.createNestedObject("configuration");
    config["hasReceivedConfig"] = hasReceivedConfig;
    config["lastConfigTimestamp"] = lastConfigTimestamp;
    config["configCount"] = configCount;
    config["readyForSensorData"] = hasReceivedConfig;
    
    // Connection mode and status
    doc["connectionMode"] = connMode;
    doc["timestamp"] = millis();
    
    String output;
    serializeJson(doc, output);
    return output;
}

// ==========================================
// BATTERY MANAGEMENT
// ==========================================

void ConnectionManager::initBattery() {
    if (devicePtr && devicePtr->hasBattery()) {
        Serial.println("[BATTERY] Initializing MAX17048 fuel gauge...");
        
        if (maxlipo.begin()) {
            batteryInitialized = true;
            Serial.println("[BATTERY] ✅ MAX17048 fuel gauge initialized successfully");
            
            float voltage = maxlipo.cellVoltage();
            float percent = maxlipo.cellPercent();
            Serial.printf("[BATTERY] Initial status: %.3fV (%.1f%%)\n", voltage, percent);
            
            if (percent < 20.0) {
                Serial.printf("[BATTERY] ⚠️ Low battery warning: %.1f%%\n", percent);
            }
            if (percent < 10.0) {
                Serial.printf("[BATTERY] 🔴 Critical battery warning: %.1f%%\n", percent);
            }
        } else {
            batteryInitialized = false;
            Serial.println("[BATTERY] ❌ Failed to initialize MAX17048 fuel gauge");
            Serial.println("[BATTERY] Check battery connection and I2C wiring");
        }
    } else {
        batteryInitialized = false;
        Serial.println("[BATTERY] Device reports no battery support, skipping battery initialization");
    }
}

void ConnectionManager::resetConfigState() { 
    hasReceivedConfig = false; 
    lastConfigTimestamp = 0; 
    configCount = 0;
    Serial.println("[CONFIG] Configuration state reset - device needs new config before sensor data");
}

// ==========================================
// PREFERENCES MANAGEMENT
// ==========================================

String ConnectionManager::getCurrentPreferences() {
    Preferences p;
    p.begin("connConfig", false);

    DynamicJsonDocument doc(1024);
    doc["backendPort"]   = p.getInt("backendPort", 7180);
    doc["connMode"]      = p.getString("connMode", "");
    doc["wifiSSID"]      = p.getString("ssid", "");
    doc["wifiPassword"]  = p.getString("pass", "");
    doc["mqttBroker"]    = p.getString("mqttBroker", "");
    doc["mqttUsername"]  = p.getString("mqttUsername", "");
    doc["mqttPassword"]  = p.getString("mqttPassword", "");
    doc["rotation"]      = p.getInt("rotation", 0);
    doc["swapBlueGreen"] = p.getBool("swapBlueGreen", false);

    p.end();

    // Load NeoPixel preferences from separate namespace
    if (devicePtr && devicePtr->hasExternalNeopixels()) {
        p.begin("neopixelConfig", true);
        doc["externalNeoPixelsData1"] = p.getInt("neoPin1", 35);
        doc["externalNeoPixelsData2"] = p.getInt("neoPin2", 0);
        p.end();
    }

    String out;
    serializeJson(doc, out);
    return out;
}


void ConnectionManager::handleSetPreferences(AsyncWebServerRequest *request) {
    Serial.println("[DEBUG] handleSetPreferences called");

    if (tempPostBodyLen == 0) {
        Serial.println("[DEBUG] No body data found - JSON body required");
        request->send(400, "application/json", "{\"success\":false,\"message\":\"JSON body required\"}");
        return;
    }

    Serial.printf("[DEBUG] Received body length: %d\n", tempPostBodyLen);
    Serial.printf("[DEBUG] Received body: %s\n", tempPostBodyBuffer);

    DynamicJsonDocument doc(2048);

    Serial.println("[DEBUG] About to parse JSON...");
    DeserializationError error = deserializeJson(doc, tempPostBodyBuffer, tempPostBodyLen);
    if (error) {
        Serial.printf("[DEBUG] JSON parsing failed: %s\n", error.c_str());
        request->send(400, "application/json", "{\"success\":false,\"message\":\"Invalid JSON\"}");
        return;
    }

    Serial.println("[DEBUG] JSON parsed successfully");

    tempPostBodyLen = 0;
    memset(tempPostBodyBuffer, 0, sizeof(tempPostBodyBuffer));

    Serial.println("[DEBUG] Parsed JSON contents:");
    serializeJsonPretty(doc, Serial);
    Serial.println();

    String wifiSSID     = this->ssid;
    String wifiPassword = this->pass;
    String mqttBroker   = this->mqttBroker;
    String mqttUsername = this->mqttUserName;
    String mqttPassword = this->mqttPassword;
    String connMode     = this->connMode;
    int    rotation     = 0;
    bool   swapBlueGreen = false;
    int    neoPin1      = 35;
    int    neoPin2      = 0;
    bool   shouldRestart = false;
    int    backendPort  = this->backendServerPort;

    Preferences p;
    p.begin("connConfig", false);
    rotation = p.getInt("rotation", 0);
    swapBlueGreen = p.getBool("swapBlueGreen", false);
    backendPort = p.getString("backendPort", String(backendPort)).toInt();
    if (this->ssid.isEmpty())         wifiSSID       = p.getString("ssid", "");
    if (this->pass.isEmpty())         wifiPassword   = p.getString("pass", "");
    if (this->mqttBroker.isEmpty())   mqttBroker     = p.getString("mqttBroker", "");
    if (this->mqttUserName.isEmpty()) mqttUsername   = p.getString("mqttUsername", "");
    if (this->mqttPassword.isEmpty()) mqttPassword   = p.getString("mqttPassword", "");
    if (this->connMode.isEmpty())     connMode       = p.getString("connMode", "");
    p.end();

    if (devicePtr && devicePtr->hasExternalNeopixels()) {
        p.begin("neopixelConfig", true);
        neoPin1 = p.getInt("neoPin1", 35);
        neoPin2 = p.getInt("neoPin2", 0);
        p.end();
        Serial.println("[DEBUG] Loaded NeoPixel preferences");
    }

    if (doc.containsKey("backendPort")) {
        int newPort = doc["backendPort"].as<int>();
        Serial.printf("[DEBUG] Processing backendPort: %d\n", newPort);
        if (newPort > 0 && newPort <= 65535 && newPort != backendPort) {
            backendPort = newPort;
        }
    }

    if (doc.containsKey("wifiSSID")) {
        String newSSID = doc["wifiSSID"].as<String>();
        Serial.printf("[DEBUG] Processing wifiSSID: %s\n", newSSID.c_str());
        if (newSSID != wifiSSID) {
            wifiSSID = newSSID;
            shouldRestart = true;
        }
    }
    if (doc.containsKey("wifiPassword")) {
        String newPass = doc["wifiPassword"].as<String>();
        Serial.printf("[DEBUG] Processing wifiPassword (length: %d)\n", newPass.length());
        if (newPass != wifiPassword) {
            wifiPassword = newPass;
            shouldRestart = true;
        }
    }
    if (doc.containsKey("mqttBroker")) {
        String newBroker = doc["mqttBroker"].as<String>();
        Serial.printf("[DEBUG] Processing mqttBroker: %s\n", newBroker.c_str());
        if (newBroker != mqttBroker) {
            mqttBroker = newBroker;
        }
    }
    if (doc.containsKey("mqttUsername")) {
        String newUsername = doc["mqttUsername"].as<String>();
        Serial.printf("[DEBUG] Processing mqttUsername: %s\n", newUsername.c_str());
        if (newUsername != mqttUsername) {
            mqttUsername = newUsername;
        }
    }
    if (doc.containsKey("mqttPassword")) {
        String newPassword = doc["mqttPassword"].as<String>();
        Serial.printf("[DEBUG] Processing mqttPassword (length: %d)\n", newPassword.length());
        if (newPassword != mqttPassword) {
            mqttPassword = newPassword;
        }
    }
    if (doc.containsKey("connMode")) {
        String newConnMode = doc["connMode"].as<String>();
        Serial.printf("[DEBUG] Processing connMode: %s\n", newConnMode.c_str());
        if (newConnMode != connMode) {
            connMode = newConnMode;
            shouldRestart = true;
        }
    }
    if (doc.containsKey("rotation")) {
        int newRotation = doc["rotation"].as<int>();
        Serial.printf("[DEBUG] Processing rotation: %d\n", newRotation);
        if (newRotation >= 0 && newRotation <= 3) {
            if (newRotation != rotation) {
                rotation = newRotation;
            }
        }
    }
    if (doc.containsKey("swapBlueGreen")) {
        bool newSwapBlueGreen = doc["swapBlueGreen"].as<bool>();
        Serial.printf("[DEBUG] Processing swapBlueGreen: %s\n", newSwapBlueGreen ? "true" : "false");
        if (newSwapBlueGreen != swapBlueGreen) {
            swapBlueGreen = newSwapBlueGreen;
        }
    }

    bool neoPixelPinsChanged = false;
    if (devicePtr && devicePtr->hasExternalNeopixels()) {
        if (doc.containsKey("externalNeoPixelsData1")) {
            int newPin1 = parsePinValue(doc["externalNeoPixelsData1"]);
            Serial.printf("[DEBUG] Processing externalNeoPixelsData1: %d\n", newPin1);
            if (newPin1 >= 0 && newPin1 <= 40 && newPin1 != neoPin1) {
                neoPin1 = newPin1;
                neoPixelPinsChanged = true;
            }
        }
        if (doc.containsKey("externalNeoPixelsData2")) {
            int newPin2 = parsePinValue(doc["externalNeoPixelsData2"]);
            Serial.printf("[DEBUG] Processing externalNeoPixelsData2: %d\n", newPin2);
            if (newPin2 >= 0 && newPin2 <= 40 && newPin2 != neoPin2) {
                neoPin2 = newPin2;
                neoPixelPinsChanged = true;
            }
        }
    }

    if (doc.containsKey("restart")) {
        shouldRestart = doc["restart"].as<bool>();
        Serial.printf("[DEBUG] Processing restart flag: %s\n", shouldRestart ? "true" : "false");
    }

    Serial.printf("[DEBUG] Preferences Submitted: backendPort=%d, connMode=%s, ssid=%s, broker=%s, user=%s, rotation=%d, swap=%s\n",
        backendPort, connMode.c_str(), wifiSSID.c_str(), mqttBroker.c_str(), mqttUsername.c_str(),
        rotation, swapBlueGreen ? "true" : "false");

    p.begin("connConfig", false);
    p.putString("backendPort", String(backendPort));  // <-- FIRST
    p.putString("connMode", connMode);
    p.putString("ssid", wifiSSID);
    p.putString("pass", wifiPassword);
    p.putString("mqttBroker", mqttBroker);
    p.putString("mqttUsername", mqttUsername);
    p.putString("mqttPassword", mqttPassword);
    p.putInt("rotation", rotation);
    p.putBool("swapBlueGreen", swapBlueGreen);
    p.end();

    if (devicePtr && devicePtr->hasExternalNeopixels() && neoPixelPinsChanged) {
        p.begin("neopixelConfig", false);
        p.putInt("neoPin1", neoPin1);
        p.putInt("neoPin2", neoPin2);
        p.end();

        devicePtr->setNeoPixelPin(neoPin1, 0);
        devicePtr->setNeoPixelPin(neoPin2, 1);
        shouldRestart = true;
    }

    this->backendServerPort = backendPort;
    this->connMode     = connMode;
    this->ssid         = wifiSSID;
    this->pass         = wifiPassword;
    this->mqttBroker   = mqttBroker;
    this->mqttUserName = mqttUsername;
    this->mqttPassword = mqttPassword;

    StaticJsonDocument<512> resp;
    resp["success"] = true;
    resp["message"] = "Preferences saved successfully";
    JsonObject s = resp.createNestedObject("settings");
    s["backendPort"] = backendPort;
    s["connMode"] = connMode;
    s["wifiSSID"] = wifiSSID;
    s["mqttBroker"] = mqttBroker;
    s["mqttUsername"] = mqttUsername;
    s["rotation"] = rotation;
    s["swapBlueGreen"] = swapBlueGreen;
    if (devicePtr && devicePtr->hasExternalNeopixels()) {
        s["externalNeoPixelsData1"] = neoPin1;
        s["externalNeoPixelsData2"] = neoPin2;
    }

    if (shouldRestart) {
        resp["restart"] = true;
        resp["message"] = "Preferences saved. Device will restart.";
    }

    String out;
    serializeJson(resp, out);
    Serial.printf("[DEBUG] Sending response: %s\n", out.c_str());
    request->send(200, "application/json", out);

    if (shouldRestart) {
        Serial.println("[DEBUG] Device will restart in 1 second...");
        delay(1000);
        ESP.restart();
    }

    Serial.println("[DEBUG] handleSetPreferences completed successfully");
}


int ConnectionManager::parsePinValue(JsonVariant pinValue) {
    if (pinValue.is<int>()) {
        // Direct numeric value (e.g., 35)
        return pinValue.as<int>();
    } else if (pinValue.is<const char*>()) {
        // String value - could be "A1", "35", etc.
        String pinStr = String(pinValue.as<const char*>());
        pinStr.toUpperCase();  // Convert to uppercase for consistency
        
        // Check if it's an analog pin constant
        if (pinStr == "A0") return A0;
        if (pinStr == "A1") return A1;
        if (pinStr == "A2") return A2;
        if (pinStr == "A3") return A3;
        if (pinStr == "A4") return A4;
        if (pinStr == "A5") return A5;
        if (pinStr == "A6") return A6;
        if (pinStr == "A7") return A7;
        
        // Otherwise treat as numeric string
        return pinStr.toInt();
    }
    
    Serial.println("[WARNING] Invalid pin value, using 0");
    return 0;
}

// ==========================================
// LEGACY WIFI METHODS (kept for compatibility)
// ==========================================

void ConnectionManager::connectToWiFi() {
    if (ssid == "") {
        Serial.println("[ERROR] No WiFi credentials stored.");
        return;
    }

    if (networkHelper) {
        networkHelper->connectWiFi(ssid, pass);
    } else {
        // Fallback to direct WiFi connection
        WiFi.begin(ssid.c_str(), pass.c_str());
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20) {
            delay(500);
            Serial.print(".");
            attempts++;
        }

        if (WiFi.status() == WL_CONNECTED) {
            Serial.println();
            Serial.print("[DEBUG] Connected to WiFi. IP address: ");
            Serial.println(WiFi.localIP());

            String macStr = getFormattedMacAddress();
            String updatedStatus = "Connected to WiFi\nIP: " + WiFi.localIP().toString() + "\nMAC: " + macStr;
            
            String host = "JunctionRelay_Device_" + macStr;
            if (MDNS.begin(host.c_str())) {
                MDNS.addService("junctionrelay", "tcp", 80);
                Serial.printf("[DEBUG] Started mDNS with hostname: %s\n", host.c_str());
            } else {
                Serial.println("[DEBUG] Failed to start mDNS");
            }
            
            emitStatus();
        } else {
            Serial.println();
            Serial.println("[ERROR] Failed to connect to WiFi.");
            startCaptivePortal();
        }
    }
}

void ConnectionManager::setupMDNS() {
    if (WiFi.status() == WL_CONNECTED) {
        String mac = getFormattedMacAddress();
        String host = "JunctionRelay_Device_" + mac;
        
        if (MDNS.begin(host.c_str())) {
            MDNS.addService("junctionrelay", "tcp", 80);
            Serial.printf("[mDNS] Started with hostname: %s\n", host.c_str());
        } else {
            Serial.println("[mDNS] Failed to start mDNS responder");
        }
    } else {
        Serial.println("[mDNS] WiFi not connected, cannot start mDNS");
    }
}

void ConnectionManager::startCaptivePortal() {
    Serial.println("Starting captive portal...");
    captivePortalManager.begin("JunctionRelay_Config_");
}

// ==========================================
// MQTT METHODS
// ==========================================

bool ConnectionManager::isMqttConnected() {
    if (mqttManager != nullptr) {
        return mqttManager->connected();
    } else {
        Serial.println("[ERROR] MQTT Manager is not initialized!");
        return false;
    }
}

void ConnectionManager::mqttLoop() {
    // ESP-MQTT is event-driven, no loop needed
    // This method kept for compatibility
}

void ConnectionManager::reconnectMQTT() {
    if (mqttManager != nullptr) {
        mqttManager->begin();
    }
}

// ==========================================
// PROTOCOL STATE METHODS
// ==========================================

bool ConnectionManager::isWebSocketConnected() const {
    return webSocketHelper ? webSocketHelper->isConnected() : false;
}

String ConnectionManager::getActiveNetworkType() const {
    return networkHelper ? networkHelper->getActiveNetworkType() : "None";
}

bool ConnectionManager::isNetworkAvailable() const {
    switch (activePrimaryProtocol) {
        case PrimaryProtocol::ESPNOW:
            return (espnowManager && espnowManager->isInitialized());
            
        case PrimaryProtocol::WEBSOCKET_HTTP:
            return networkHelper ? networkHelper->isAnyNetworkAvailable() : false;
                   
        case PrimaryProtocol::GATEWAY:
            return (networkHelper && networkHelper->isAnyNetworkAvailable()) ||
                   (espnowManager && espnowManager->isInitialized());
    }
    return false;
}

// ==========================================
// CONNECTION STATUS
// ==========================================

ConnectionStatus ConnectionManager::getConnectionStatus() const {
    ConnectionStatus s{};
    
    // ESP-NOW status
    s.espNowActive = (espnowManager && espnowManager->isInitialized());
    
    // Network status
    if (networkHelper) {
        s.wifiConnected = networkHelper->isWiFiConnected();
        s.ethernetConnected = networkHelper->isEthernetConnected();
        s.activeNetworkType = networkHelper->getActiveNetworkType();
        s.ipAddress = networkHelper->getActiveIP();
        s.macAddress = networkHelper->getActiveMAC();
        
        // Ethernet-specific details
        if (s.ethernetConnected && devicePtr && devicePtr->supportsEthernet()) {
            s.ethernetIP = devicePtr->getEthernetIP().toString();
            s.ethernetMAC = devicePtr->getEthernetMAC();
        }
    } else {
        // Fallback to direct checks
        s.wifiConnected = (WiFi.status() == WL_CONNECTED);
        s.ethernetConnected = (devicePtr && devicePtr->supportsEthernet() && devicePtr->isEthernetConnected());
        s.ipAddress = s.wifiConnected ? WiFi.localIP().toString() : "";
        s.macAddress = getFormattedMacAddress();
        s.activeNetworkType = s.wifiConnected ? "WiFi" : (s.ethernetConnected ? "Ethernet" : "None");
    }
    
    // WebSocket status
    s.webSocketConnected = isWebSocketConnected();
    s.backendServerIP = backendServerIP;
    
    // MQTT status (independent)
    s.mqttConnected = (mqttManager && mqttManager->connected());
    
    return s;
}

void ConnectionManager::emitStatus() {
    if (statusUpdateCallback) {
        statusUpdateCallback(getConnectionStatus());
    }
}

void ConnectionManager::setStatusUpdateCallback(StatusCb cb) {
    statusUpdateCallback = cb;
}

// ==========================================
// NETWORK EVENT HANDLER
// ==========================================

void ConnectionManager::handleNetworkEvent(const String& networkType, bool connected) {
    Serial.printf("[Network] Event: %s %s\n", networkType.c_str(), connected ? "connected" : "disconnected");
    
    if (connected && webSocketHelper) {
        // Detect backend server if not already set
        // Comment this:
        // if (backendServerIP.isEmpty() && httpHelper) {
        //     backendServerIP = httpHelper->detectBackendServer();
        //     if (!backendServerIP.isEmpty()) {
        //         Serial.printf("[Network] Backend server detected: %s\n", backendServerIP.c_str());
        //     }
        // }

        // Keep this part to allow manual override:
        webSocketHelper->handleConnection();
    }
    
    // Update status
    emitStatus();
}

// ==========================================
// HELPER ACCESS METHODS
// ==========================================

void ConnectionManager::handleConnection() {
    // This method can be used for any connection-related maintenance
    // Most connection handling is now done automatically by helper classes
    
    // Update backend server IP if network is available and not set
    // if (isNetworkAvailable() && backendServerIP.isEmpty() && httpHelper) {
    //     String detectedIP = httpHelper->detectBackendServer();
    //     if (!detectedIP.isEmpty()) {
    //         backendServerIP = detectedIP;
    //         webSocketHelper->setServerIP(backendServerIP);
    //         Serial.printf("[ConnectionManager] Backend server detected: %s\n", backendServerIP.c_str());
    //     }
    // }
    
    // Try WebSocket connection if network is available but WebSocket is not connected
    if (isNetworkAvailable() && !isWebSocketConnected() && webSocketHelper) {
        webSocketHelper->handleConnection();
    }
}