#ifndef JUNCTION_RELAY_H
#define JUNCTION_RELAY_H

#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <time.h>

class JunctionRelay {
public:
    JunctionRelay();
    
    void begin();
    void handle();
    void setToken(const String& token);
    bool isRegistered() { return _registered; }
    
    // Token refresh methods
    void setDeviceJwt(const String& jwt);
    void setCloudBaseUrl(const String& baseUrl) { _cloudBaseUrl = baseUrl; }

private:
    String _jwt, _regToken;
    String _refreshToken, _deviceId;
    String _cloudBaseUrl = "https://api.junctionrelay.com";
    String _jwtExpiryString, _refreshTokenExpiryString;
    unsigned long _lastReport;
    unsigned long _lastTokenRefresh = 0;  // Track last refresh attempt
    time_t _jwtExpiresAt = 0;             // UTC timestamp
    time_t _refreshTokenExpiresAt = 0;    // UTC timestamp
    bool _registered;
    Preferences _prefs;

    // Constants
    static const unsigned long JWT_REFRESH_BUFFER = 300000; // 5 minutes buffer
    static const unsigned long TOKEN_REFRESH_INTERVAL = 3600000; // 1 hour
    static const unsigned long REFRESH_TOKEN_ROTATION_THRESHOLD = 86400000; // 24 hours

    // TESTING OVERRIDES - Comment out these lines to use production values
    #define TESTING_MODE
    #ifdef TESTING_MODE
        static const unsigned long TEST_JWT_REFRESH_INTERVAL = 300000; // 5 minutes for testing
        static const unsigned long TEST_REFRESH_TOKEN_ROTATION_THRESHOLD = 60000; // 1 minute before expiry (17 min trigger)
        static const unsigned long TEST_JWT_LIFETIME = 6 * 60 * 1000UL; // 6 minutes
        static const unsigned long TEST_REFRESH_LIFETIME = 18 * 60 * 1000UL; // 18 minutes
    #endif

    void registerDevice();
    void sendHealth();
    void waitForToken();
    void parseRegistrationToken();
    
    // Token refresh methods
    void checkAndRefreshToken();
    bool refreshDeviceToken();
    void handleTokenRefreshFailure();
    void saveTokens(const String& refreshToken, const String& deviceId);
    void loadStoredTokens();
    void clearStoredTokens();

    // Refresh token rotation methods
    void checkAndRotateRefreshToken();
    bool rotateRefreshToken();

    // Time synchronization and helper methods
    void initializeTime();
    void updateTokenExpiry(const String& jwtExpiryStr, const String& refreshExpiryStr);
    time_t parseISO8601(const String& isoStr);
    time_t getCurrentTimestamp();
};

#endif // JUNCTION_RELAY_H