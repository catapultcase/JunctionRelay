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

private:
    String _jwt, _regToken, _sensors;
    unsigned long _lastReport;
    bool _registered;
    Preferences _prefs;
    uint8_t _publicKey[65];      // Uncompressed P-256 public key
    mbedtls_entropy_context _entropy;
    mbedtls_ctr_drbg_context _ctr_drbg;

    void registerDevice();
    void sendHealth();
    void waitForToken();
    void parseRegistrationToken();
    String encryptData(const String& data);
    bool setPublicKey(const String& base64Key);

    // Manual decompression helper
    bool decompressPublicKey(
      const uint8_t* comp, size_t compLen,
      uint8_t* uncmp, size_t& uncmpLen
    );
};

#endif // JUNCTION_RELAY_H