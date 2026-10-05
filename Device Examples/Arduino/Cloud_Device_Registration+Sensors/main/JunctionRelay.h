#ifndef JUNCTION_RELAY_H
#define JUNCTION_RELAY_H

#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <mbedtls/gcm.h>
#include <mbedtls/ecp.h>
#include <mbedtls/ecdh.h>
#include <mbedtls/entropy.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/base64.h>
#include <mbedtls/bignum.h>
#include <ArduinoJson.h>
#include <time.h>

class JunctionRelay {
public:
    JunctionRelay();
    
    void begin();
    void handle();
    void setToken(const String& token);
    void addSensor(const String& key, const String& value);
    bool isRegistered() { return _registered; }
    
    // Token refresh methods
    void setDeviceJwt(const String& jwt);
    void setCloudBaseUrl(const String& baseUrl) { _cloudBaseUrl = baseUrl; }

private:
    String _jwt, _regToken, _sensors;
    String _refreshToken, _deviceId;
    String _cloudBaseUrl = "https://api.junctionrelay.com";
    String _jwtExpiryString, _refreshTokenExpiryString;
    unsigned long _lastReport;
    unsigned long _lastTokenRefresh = 0;  // Track last refresh attempt
    time_t _jwtExpiresAt = 0;             // UTC timestamp
    time_t _refreshTokenExpiresAt = 0;    // UTC timestamp
    bool _registered;
    Preferences _prefs;
    uint8_t _publicKey[65];      // Uncompressed P-256 public key
    mbedtls_entropy_context _entropy;
    mbedtls_ctr_drbg_context _ctr_drbg;

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
    String encryptData(const String& data);
    bool setPublicKey(const String& base64Key);
    
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

    // Manual decompression helper
    bool decompressPublicKey(
      const uint8_t* comp, size_t compLen,
      uint8_t* uncmp, size_t& uncmpLen
    );
};

#endif // JUNCTION_RELAY_H