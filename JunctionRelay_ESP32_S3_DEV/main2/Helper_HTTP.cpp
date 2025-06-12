#include "Helper_HTTP.h"
#include "ConnectionManager.h"

Helper_HTTP::Helper_HTTP(ConnectionManager* manager)
    : connectionManager(manager)
{
}

Helper_HTTP::~Helper_HTTP() {
    // No dynamic allocations to clean up
}

void Helper_HTTP::sendData(const JsonDocument& data, const String& serverIP, uint16_t port) {
    if (!isNetworkAvailable() || serverIP.isEmpty()) {
        Serial.println("[HTTP] Cannot send - no network or server");
        return;
    }
    
    String jsonStr;
    serializeJson(data, jsonStr);
    
    HTTPResponse response = sendRequest(serverIP, port, "/api/data", "POST", jsonStr, "application/json");
    
    if (response.success) {
        Serial.printf("[HTTP] 📤 Data sent successfully (%d bytes)\n", jsonStr.length());
    } else {
        Serial.printf("[HTTP] ❌ Failed to send data (status: %d)\n", response.statusCode);
    }
}

void Helper_HTTP::sendDataWithPrefix(const JsonDocument& data, const String& serverIP, uint16_t port) {
    if (!isNetworkAvailable() || serverIP.isEmpty()) {
        Serial.println("[HTTP] Cannot send - no network or server");
        return;
    }
    
    WiFiClient httpClient;
    if (httpClient.connect(serverIP.c_str(), port)) {
        String jsonStr;
        serializeJson(data, jsonStr);
        
        // Add length prefix (existing ConnectionManager protocol)
        String lengthPrefix = String(jsonStr.length());
        lengthPrefix = String("00000000").substring(lengthPrefix.length()) + lengthPrefix;
        String fullPayload = lengthPrefix + jsonStr;
        
        httpClient.print("POST /api/data HTTP/1.1\r\n");
        httpClient.print("Host: " + serverIP + "\r\n");
        httpClient.print("Content-Type: application/octet-stream\r\n");
        httpClient.print("Content-Length: " + String(fullPayload.length()) + "\r\n");
        httpClient.print("Connection: close\r\n\r\n");
        httpClient.print(fullPayload);
        
        httpClient.stop();
        Serial.printf("[HTTP] 📤 Sent with prefix (%d bytes)\n", jsonStr.length());
    } else {
        Serial.println("[HTTP] ❌ Connection failed");
    }
}

bool Helper_HTTP::testServerConnection(const String& serverIP, uint16_t port) {
    HTTPResponse response = sendRequest(serverIP, port, "/api/health/heartbeat", "GET");
    return response.success && (response.statusCode == 200);
}

String Helper_HTTP::makeRequest(const String& serverIP, uint16_t port, const String& path, 
                               const String& method, const String& body) {
    HTTPResponse response = sendRequest(serverIP, port, path, method, body);
    return response.body;
}

String Helper_HTTP::detectBackendServer() {
    String baseIP = getBaseIP();
    
    if (baseIP.isEmpty()) {
        Serial.println("[HTTP] Cannot detect backend - no network IP");
        return "";
    }
    
    Serial.printf("[HTTP] Scanning for backend server on %s*\n", baseIP.c_str());
    
    // Common backend IPs to try
    String candidateIPs[] = {
        baseIP + "1",     // Router
        baseIP + "100",   // Common server IP
        baseIP + "10",    // Common server IP  
        baseIP + "2",     // Second device
        baseIP + "50"     // Common server IP
    };
    
    for (const String& ip : candidateIPs) {
        if (testServerConnection(ip)) {
            Serial.printf("[HTTP] ✅ Backend detected at %s\n", ip.c_str());
            return ip;
        }
    }
    
    Serial.println("[HTTP] ⚠️ No backend server detected");
    return "";
}

bool Helper_HTTP::pingServer(const String& serverIP, uint16_t port) {
    WiFiClient client;
    bool connected = client.connect(serverIP.c_str(), port);
    if (connected) {
        client.stop();
    }
    return connected;
}

Helper_HTTP::HTTPResponse Helper_HTTP::sendRequest(const String& serverIP, uint16_t port, const String& path,
                                                  const String& method, const String& body,
                                                  const String& contentType) {
    HTTPResponse response = {0, "", false};
    
    if (!isNetworkAvailable()) {
        Serial.println("[HTTP] No network available");
        return response;
    }
    
    WiFiClient client = createClient();
    
    if (!client.connect(serverIP.c_str(), port)) {
        Serial.printf("[HTTP] Connection failed to %s:%d\n", serverIP.c_str(), port);
        return response;
    }
    
    // Build and send request
    String headers = buildHeaders(serverIP, method, path, contentType, body.length());
    client.print(headers);
    
    if (body.length() > 0) {
        client.print(body);
    }
    
    // Parse response
    response = parseResponse(client);
    client.stop();
    
    return response;
}

String Helper_HTTP::getBaseIP() {
    String baseIP = "";
    
    if (WiFi.status() == WL_CONNECTED) {
        IPAddress localIP = WiFi.localIP();
        baseIP = String(localIP[0]) + "." + String(localIP[1]) + "." + String(localIP[2]) + ".";
    } else if (connectionManager && connectionManager->getDevice() && 
               connectionManager->getDevice()->supportsEthernet() && 
               connectionManager->getDevice()->isEthernetConnected()) {
        IPAddress ethIP = connectionManager->getDevice()->getEthernetIP();
        baseIP = String(ethIP[0]) + "." + String(ethIP[1]) + "." + String(ethIP[2]) + ".";
    }
    
    return baseIP;
}

bool Helper_HTTP::isNetworkAvailable() {
    if (connectionManager) {
        return connectionManager->isNetworkAvailable();
    }
    return WiFi.status() == WL_CONNECTED;
}

WiFiClient Helper_HTTP::createClient() {
    return WiFiClient();
}

String Helper_HTTP::buildHeaders(const String& host, const String& method, const String& path,
                                const String& contentType, size_t contentLength) {
    String headers = method + " " + path + " HTTP/1.1\r\n";
    headers += "Host: " + host + "\r\n";
    
    if (contentLength > 0) {
        headers += "Content-Type: " + contentType + "\r\n";
        headers += "Content-Length: " + String(contentLength) + "\r\n";
    }
    
    headers += "Connection: close\r\n\r\n";
    return headers;
}

Helper_HTTP::HTTPResponse Helper_HTTP::parseResponse(WiFiClient& client) {
    HTTPResponse response = {0, "", false};
    
    // Wait for response with timeout
    unsigned long timeout = millis() + 5000; // 5 second timeout
    while (client.available() == 0 && millis() < timeout) {
        delay(10);
    }
    
    if (client.available() == 0) {
        Serial.println("[HTTP] Response timeout");
        return response;
    }
    
    // Read status line
    String statusLine = client.readStringUntil('\n');
    statusLine.trim();
    
    // Extract status code
    int firstSpace = statusLine.indexOf(' ');
    int secondSpace = statusLine.indexOf(' ', firstSpace + 1);
    if (firstSpace > 0 && secondSpace > firstSpace) {
        String statusStr = statusLine.substring(firstSpace + 1, secondSpace);
        response.statusCode = statusStr.toInt();
    }
    
    // Skip headers
    while (client.available()) {
        String line = client.readStringUntil('\n');
        line.trim();
        if (line.length() == 0) {
            break; // End of headers
        }
    }
    
    // Read body
    while (client.available()) {
        response.body += client.readString();
    }
    
    response.success = (response.statusCode >= 200 && response.statusCode < 300);
    
    return response;
}