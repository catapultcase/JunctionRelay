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
    unsigned long _lastReport;
    unsigned long _lastTokenRefresh = 0;  // Track last refresh attempt
    unsigned long _jwtExpiresAt = 0;
    bool _registered;
    Preferences _prefs;
    uint8_t _publicKey[65];      // Uncompressed P-256 public key
    mbedtls_entropy_context _entropy;
    mbedtls_ctr_drbg_context _ctr_drbg;

    // Constants
    static const unsigned long JWT_REFRESH_BUFFER = 300000; // 5 minutes in ms
    static const unsigned long TOKEN_REFRESH_INTERVAL = 25200000; // 7 hours in ms (7 * 60 * 60 * 1000)

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
    unsigned long parseISODateTime(const String& isoString);
    void saveTokens(const String& refreshToken, const String& deviceId);
    void loadStoredTokens();
    void clearStoredTokens();

    // Manual decompression helper
    bool decompressPublicKey(
      const uint8_t* comp, size_t compLen,
      uint8_t* uncmp, size_t& uncmpLen
    );
};

#endif // JUNCTION_RELAY_H