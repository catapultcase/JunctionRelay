#ifndef HELPER_HTTP_H
#define HELPER_HTTP_H

#include <WiFi.h>
#include <ArduinoJson.h>
#include <functional>

class ConnectionManager; // Forward declaration

class Helper_HTTP {
public:
    Helper_HTTP(ConnectionManager* manager);
    ~Helper_HTTP();

    // Data transmission
    void sendData(const JsonDocument& data, const String& serverIP, uint16_t port = 80);
    void sendDataWithPrefix(const JsonDocument& data, const String& serverIP, uint16_t port = 80);
    
    // HTTP client operations
    bool testServerConnection(const String& serverIP, uint16_t port = 80);
    String makeRequest(const String& serverIP, uint16_t port, const String& path, 
                      const String& method = "GET", const String& body = "");
    
    // Server detection
    String detectBackendServer();
    bool pingServer(const String& serverIP, uint16_t port = 80);
    
    // Response handling
    struct HTTPResponse {
        int statusCode;
        String body;
        bool success;
    };
    
    HTTPResponse sendRequest(const String& serverIP, uint16_t port, const String& path,
                           const String& method = "GET", const String& body = "",
                           const String& contentType = "application/json");

private:
    ConnectionManager* connectionManager;
    
    // Helper methods
    String getBaseIP();
    bool isNetworkAvailable();
    WiFiClient createClient();
    
    // Request building
    String buildHeaders(const String& host, const String& method, const String& path,
                       const String& contentType, size_t contentLength);
    
    // Response parsing
    HTTPResponse parseResponse(WiFiClient& client);
};

#endif // HELPER_HTTP_H