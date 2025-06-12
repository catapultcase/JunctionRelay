#include "Helper_WebSocket.h"
#include "ConnectionManager.h"
#include "Utils.h"

Helper_WebSocket::Helper_WebSocket(ConnectionManager* manager)
    : connectionManager(manager),
      webSocketClient(nullptr),
      webSocketEnabled(false),
      webSocketConnected(false),
      backendServerIP(""),
      backendServerPort(7180)
{
}

Helper_WebSocket::~Helper_WebSocket() {
    if (webSocketClient) {
        webSocketClient->disconnect();
        delete webSocketClient;
        webSocketClient = nullptr;
    }
}

void Helper_WebSocket::setupClient() {
    if (!webSocketClient) {
        webSocketClient = new WebSocketsClient();
        
        // Set event handler using lambda to bridge to our instance method
        webSocketClient->onEvent([this](WStype_t type, uint8_t* payload, size_t length) {
            this->handleWebSocketEvent(type, payload, length);
        });
        
        Serial.println("[WebSocket] Client initialized");
    }
}

void Helper_WebSocket::handleConnection() {
    if (!webSocketClient || !connectionManager->isNetworkAvailable()) {
        Serial.println("[WebSocket] Cannot connect - no client or network");
        return;
    }
    
    // Detect backend server if not configured
    if (backendServerIP.isEmpty()) {
        detectBackendServer();
    }
    
    if (!backendServerIP.isEmpty()) {
        Serial.printf("[WebSocket] Attempting connection to %s:%d\n", 
                     backendServerIP.c_str(), backendServerPort);
        
        String url = buildConnectionURL();
        webSocketClient->begin(backendServerIP, backendServerPort, url);
        webSocketClient->setReconnectInterval(5000);
        
        Serial.println("[WebSocket] Connection initiated");
    } else {
        Serial.println("[WebSocket] No backend server detected, using HTTP only");
    }
}

void Helper_WebSocket::disconnect() {
    if (webSocketClient) {
        webSocketClient->disconnect();
        webSocketConnected = false;
        Serial.println("[WebSocket] Disconnected");
    }
}

void Helper_WebSocket::detectBackendServer() {
    String baseIP = "";
    
    // Get base IP from current network connection
    if (WiFi.status() == WL_CONNECTED) {
        IPAddress localIP = WiFi.localIP();
        baseIP = String(localIP[0]) + "." + String(localIP[1]) + "." + String(localIP[2]) + ".";
    } else if (connectionManager->getDevice() && 
               connectionManager->getDevice()->supportsEthernet() && 
               connectionManager->getDevice()->isEthernetConnected()) {
        IPAddress ethIP = connectionManager->getDevice()->getEthernetIP();
        baseIP = String(ethIP[0]) + "." + String(ethIP[1]) + "." + String(ethIP[2]) + ".";
    }
    
    if (baseIP.isEmpty()) {
        Serial.println("[WebSocket] Cannot detect backend - no network IP");
        return;
    }
    
    Serial.printf("[WebSocket] Scanning for backend server on %s*\n", baseIP.c_str());
    
    // Common backend IPs to try
    String candidateIPs[] = {
        baseIP + "1",     // Router
        baseIP + "100",   // Common server IP
        baseIP + "10",    // Common server IP  
        baseIP + "2",     // Second device
        baseIP + "50"     // Common server IP
    };
    
    for (const String& ip : candidateIPs) {
        if (testConnection(ip, backendServerPort)) {
            backendServerIP = ip;
            Serial.printf("[WebSocket] ✅ Backend detected at %s\n", ip.c_str());
            return;
        }
    }
    
    Serial.println("[WebSocket] ⚠️ No backend server detected, will use HTTP only");
}

bool Helper_WebSocket::testConnection(const String& serverIP, uint16_t port) {
    // Simple HTTP GET test to see if server responds
    WiFiClient testClient;
    if (testClient.connect(serverIP.c_str(), port)) {
        testClient.print("GET /api/health/heartbeat HTTP/1.1\r\n");
        testClient.print("Host: " + serverIP + "\r\n");
        testClient.print("Connection: close\r\n\r\n");
        
        unsigned long timeout = millis() + 2000; // 2 second timeout
        while (testClient.available() == 0 && millis() < timeout) {
            delay(10);
        }
        
        if (testClient.available()) {
            String response = testClient.readString();
            testClient.stop();
            return response.indexOf("200 OK") > 0 || response.indexOf("\"status\":\"OK\"") > 0;
        }
        testClient.stop();
    }
    return false;
}

void Helper_WebSocket::sendData(const JsonDocument& data) {
    if (webSocketClient && webSocketConnected) {
        String jsonStr;
        serializeJson(data, jsonStr);
        // jsonStr is already a mutable String, so this should work fine
        webSocketClient->sendTXT(jsonStr);
        Serial.printf("[WebSocket] 📤 Sent (%d bytes)\n", jsonStr.length());
    } else {
        Serial.println("[WebSocket] Cannot send - not connected");
    }
}

void Helper_WebSocket::sendText(const String& message) {
    if (webSocketClient && webSocketConnected) {
        // Create a mutable copy since WebSocketsClient::sendTXT requires non-const String&
        String mutableMessage = message;
        webSocketClient->sendTXT(mutableMessage);
        Serial.printf("[WebSocket] 📤 Sent text (%d chars)\n", message.length());
    } else {
        Serial.println("[WebSocket] Cannot send text - not connected");
    }
}

void Helper_WebSocket::handleWebSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.println("[WebSocket] 🔌 Disconnected");
            webSocketConnected = false;
            if (connectionManager) {
                connectionManager->emitStatus();
            }
            break;
            
        case WStype_CONNECTED:
            Serial.printf("[WebSocket] ✅ Connected to: %s\n", payload);
            webSocketConnected = true;
            webSocketEnabled = true;
            if (connectionManager) {
                connectionManager->emitStatus();
            }
            break;
            
        case WStype_TEXT:
            Serial.printf("[WebSocket] 📥 Received: %s\n", payload);
            // Forward to ConnectionManager for processing
            if (connectionManager) {
                connectionManager->handleIncomingDataChunk(payload, length);
            }
            break;
            
        case WStype_ERROR:
            Serial.printf("[WebSocket] ❌ Error: %s\n", payload);
            webSocketConnected = false;
            break;
            
        default:
            break;
    }
    
    // Call custom event callback if set
    if (eventCallback) {
        eventCallback(type, payload, length);
    }
}

String Helper_WebSocket::buildConnectionURL() {
    String mac = getDeviceMAC();
    String deviceName = getDeviceName();
    return "/api/device-websocket/connect?mac=" + mac + "&name=" + deviceName;
}

String Helper_WebSocket::getDeviceMAC() {
    return getFormattedMacAddress(); // From Utils.h
}

String Helper_WebSocket::getDeviceName() {
    if (connectionManager && connectionManager->getDevice()) {
        return connectionManager->getDevice()->getDeviceModel();
    }
    return "ESP32_Device";
}