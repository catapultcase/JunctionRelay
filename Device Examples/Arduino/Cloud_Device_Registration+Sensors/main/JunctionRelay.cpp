#include "JunctionRelay.h"

JunctionRelay::JunctionRelay()
    : _lastReport(0), _lastTokenRefresh(0), _registered(false)
{
    mbedtls_entropy_init(&_entropy);
    mbedtls_ctr_drbg_init(&_ctr_drbg);
    mbedtls_ctr_drbg_seed(&_ctr_drbg, mbedtls_entropy_func, &_entropy, nullptr, 0);
}

void JunctionRelay::begin() {
    _prefs.begin("relay", false);
    _jwt = _prefs.getString("jwt", "");
    _registered = !_jwt.isEmpty();

    initializeTime();
    loadStoredTokens();

    if (_registered) {
        Serial.println("✅ Device registered");
        size_t got = _prefs.getBytes("publicKeyRaw", _publicKey, sizeof(_publicKey));
        if (got == sizeof(_publicKey)) {
            Serial.println("✅ Loaded raw publicKey from prefs");
        } else {
            String stored = _prefs.getString("publicKey", "");
            if (!stored.isEmpty()) {
                setPublicKey(stored);
            }
        }
    } else {
        Serial.println("⏳ Need registration token");
    }
}

void JunctionRelay::initializeTime() {
    Serial.println("🕒 Initializing NTP time synchronization...");
    
    configTime(0, 0, "pool.ntp.org", "time.nist.gov", "time.google.com");
    
    int retries = 0;
    while (retries < 10) {
        time_t now = time(nullptr);
        if (now > 1000000000) {
            struct tm* timeinfo = gmtime(&now);
            Serial.printf("✅ Time synchronized: %04d-%02d-%02d %02d:%02d:%02d UTC\n",
                         timeinfo->tm_year + 1900, timeinfo->tm_mon + 1, timeinfo->tm_mday,
                         timeinfo->tm_hour, timeinfo->tm_min, timeinfo->tm_sec);
            return;
        }
        Serial.print(".");
        delay(1000);
        retries++;
    }
    
    Serial.println("⚠️ Failed to synchronize time via NTP - token expiry checks may be inaccurate");
}

void JunctionRelay::handle() {
    if (WiFi.status() != WL_CONNECTED || !_registered) {
        if (!_registered) waitForToken();
        return;
    }
    
    checkAndRotateRefreshToken();
    checkAndRefreshToken();
    
    if (millis() - _lastReport > 60000) {
        sendHealth();
        _lastReport = millis();
    }
}

void JunctionRelay::setToken(const String& token) {
    if (!_registered && token.length() > 0) {
        _regToken = token;
        parseRegistrationToken();
    }
}

void JunctionRelay::setDeviceJwt(const String& jwt) {
    _jwt = jwt;
    _prefs.putString("jwt", _jwt);
    Serial.println("🔑 Updated JWT token");
}

void JunctionRelay::loadStoredTokens() {
    _refreshToken = _prefs.getString("refreshToken", "");
    _deviceId = _prefs.getString("deviceId", "");
    
    String jwtExpiryStr = _prefs.getString("jwtExpiry", "");
    String refreshExpiryStr = _prefs.getString("refreshExpiry", "");
    _lastTokenRefresh = _prefs.getULong64("lastRefresh", 0);
    
    _jwtExpiresAt = parseISO8601(jwtExpiryStr);
    _refreshTokenExpiresAt = parseISO8601(refreshExpiryStr);
    _jwtExpiryString = jwtExpiryStr;
    _refreshTokenExpiryString = refreshExpiryStr;
    
    if (_refreshToken.length() > 0 && _deviceId.length() > 0) {
        Serial.println("📱 Found stored refresh token");
        Serial.println("🆔 Device ID: " + _deviceId);
        
        time_t currentTime = getCurrentTimestamp();
        
        if (_refreshTokenExpiresAt > 0) {
            if (_refreshTokenExpiresAt > currentTime) {
                long timeUntilExpiry = _refreshTokenExpiresAt - currentTime;
                Serial.printf("🕒 Refresh token expires in %ld seconds\n", timeUntilExpiry);
            } else {
                Serial.println("⚠️ Refresh token has expired");
            }
        } else {
            Serial.println("⚠️ No valid refresh token expiry time found");
        }
        
        if (_jwtExpiresAt > 0) {
            if (_jwtExpiresAt > currentTime) {
                long timeUntilExpiry = _jwtExpiresAt - currentTime;
                Serial.printf("🕒 JWT expires in %ld seconds\n", timeUntilExpiry);
            } else {
                Serial.println("⚠️ JWT has expired");
            }
        }
    } else {
        Serial.println("ℹ️ No stored tokens found - will need fresh registration");
    }
}

void JunctionRelay::saveTokens(const String& refreshToken, const String& deviceId) {
    _prefs.putString("refreshToken", refreshToken);
    _prefs.putString("deviceId", deviceId);
    _prefs.putString("jwtExpiry", _jwtExpiryString);
    _prefs.putString("refreshExpiry", _refreshTokenExpiryString);
    _prefs.putULong64("lastRefresh", _lastTokenRefresh);
    
    _refreshToken = refreshToken;
    _deviceId = deviceId;
    Serial.println("💾 Tokens saved to flash memory");
}

void JunctionRelay::clearStoredTokens() {
    _prefs.remove("refreshToken");
    _prefs.remove("deviceId");
    _prefs.remove("jwtExpiry");
    _prefs.remove("refreshExpiry");
    _prefs.remove("lastRefresh");
    
    _refreshToken = "";
    _deviceId = "";
    _jwtExpiresAt = 0;
    _refreshTokenExpiresAt = 0;
    _jwtExpiryString = "";
    _refreshTokenExpiryString = "";
    _lastTokenRefresh = 0;
    Serial.println("🗑️ Cleared stored tokens");
}

void JunctionRelay::updateTokenExpiry(const String& jwtExpiryStr, const String& refreshExpiryStr) {
    _jwtExpiryString = jwtExpiryStr;
    _refreshTokenExpiryString = refreshExpiryStr;
    _jwtExpiresAt = parseISO8601(jwtExpiryStr);
    _refreshTokenExpiresAt = parseISO8601(refreshExpiryStr);
}

time_t JunctionRelay::parseISO8601(const String& isoStr) {
    if (isoStr.length() == 0) return 0;
    
    int year, month, day, hour, minute, second;
    int matched = sscanf(isoStr.c_str(), "%d-%d-%dT%d:%d:%d", 
                        &year, &month, &day, &hour, &minute, &second);
    
    if (matched >= 6) {
        struct tm timeinfo = {0};
        timeinfo.tm_year = year - 1900;
        timeinfo.tm_mon = month - 1;
        timeinfo.tm_mday = day;
        timeinfo.tm_hour = hour;
        timeinfo.tm_min = minute;
        timeinfo.tm_sec = second;
        timeinfo.tm_isdst = 0;
        
        time_t timestamp = mktime(&timeinfo);
        struct tm* utc_tm = gmtime(&timestamp);
        timestamp = mktime(utc_tm);
        
        return timestamp;
    }
    
    Serial.println("❌ Failed to parse ISO8601 timestamp: " + isoStr);
    return 0;
}

time_t JunctionRelay::getCurrentTimestamp() {
    time_t now;
    time(&now);
    return now;
}

void JunctionRelay::checkAndRotateRefreshToken() {
    if (_refreshToken.length() == 0 || _deviceId.length() == 0 || _refreshTokenExpiresAt == 0) {
        return;
    }
    
    time_t currentTime = getCurrentTimestamp();
    
    #ifdef TESTING_MODE
        long rotationThreshold = TEST_REFRESH_TOKEN_ROTATION_THRESHOLD / 1000;
    #else
        long rotationThreshold = REFRESH_TOKEN_ROTATION_THRESHOLD / 1000;
    #endif
    
    bool nearExpiry = (_refreshTokenExpiresAt > currentTime && 
                      (_refreshTokenExpiresAt - currentTime) <= rotationThreshold);
    
    if (nearExpiry) {
        Serial.println("🔄 Refresh token rotation triggered - expires within threshold");
        
        if (rotateRefreshToken()) {
            Serial.println("✅ Refresh token rotation successful");
        } else {
            Serial.println("❌ Refresh token rotation failed - triggering re-registration");
            handleTokenRefreshFailure();
        }
    }
}

bool JunctionRelay::rotateRefreshToken() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("❌ WiFi not connected - cannot rotate refresh token");
        return false;
    }
    
    HTTPClient http;
    String url = _cloudBaseUrl + "/cloud/devices/refresh-rotate";
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    StaticJsonDocument<512> doc;
    doc["RefreshToken"] = _refreshToken;
    doc["DeviceId"] = _deviceId;
    
    String payload;
    serializeJson(doc, payload);
    
    Serial.println("📤 Sending refresh token rotation request");
    
    int httpResponseCode = http.POST(payload);
    
    if (httpResponseCode == 200) {
        String response = http.getString();
        Serial.println("✅ Refresh token rotation successful");
        
        StaticJsonDocument<1024> responseDoc;
        DeserializationError error = deserializeJson(responseDoc, response);
        
        if (!error && responseDoc["success"] == true) {
            String newJwt = responseDoc["token"].as<String>();
            String newRefreshToken = responseDoc["refreshToken"].as<String>();
            String jwtExpiryStr = responseDoc["expiresAt"].as<String>();
            String refreshExpiryStr = responseDoc["refreshTokenExpiresAt"].as<String>();
            
            #ifdef TESTING_MODE
                time_t currentTime = getCurrentTimestamp();
                time_t testJwtExpiry = currentTime + (TEST_JWT_LIFETIME / 1000);
                time_t testRefreshExpiry = currentTime + (TEST_REFRESH_LIFETIME / 1000);
                
                struct tm jwt_tm_copy = *gmtime(&testJwtExpiry);
                struct tm refresh_tm_copy = *gmtime(&testRefreshExpiry);
                
                char jwtBuffer[32], refreshBuffer[32];
                strftime(jwtBuffer, sizeof(jwtBuffer), "%Y-%m-%dT%H:%M:%SZ", &jwt_tm_copy);
                strftime(refreshBuffer, sizeof(refreshBuffer), "%Y-%m-%dT%H:%M:%SZ", &refresh_tm_copy);
                
                jwtExpiryStr = String(jwtBuffer);
                refreshExpiryStr = String(refreshBuffer);
                
                Serial.println("Using test token lifetimes (6min JWT, 18min refresh)");
            #endif
            
            setDeviceJwt(newJwt);
            _refreshToken = newRefreshToken;
            updateTokenExpiry(jwtExpiryStr, refreshExpiryStr);
            
            saveTokens(_refreshToken, _deviceId);
            
            return true;
        } else {
            Serial.println("❌ Failed to parse rotation response or success=false");
            return false;
        }
    } else {
        Serial.println("❌ Refresh token rotation failed with code: " + String(httpResponseCode));
        return false;
    }
    
    http.end();
}

void JunctionRelay::checkAndRefreshToken() {
    if (_refreshToken.length() == 0 || _deviceId.length() == 0) {
        return;
    }
    
    unsigned long currentMillis = millis();
    time_t currentTime = getCurrentTimestamp();

    #ifdef TESTING_MODE
        unsigned long refreshInterval = TEST_JWT_REFRESH_INTERVAL;
    #else
        unsigned long refreshInterval = TOKEN_REFRESH_INTERVAL;
    #endif
    
    if (currentMillis - _lastTokenRefresh < refreshInterval) {
        return;
    }
    
    long jwtBuffer = JWT_REFRESH_BUFFER / 1000;
    bool nearExpiry = (_jwtExpiresAt > 0 && currentTime + jwtBuffer >= _jwtExpiresAt);
    bool intervalReached = (currentMillis - _lastTokenRefresh >= refreshInterval);
    
    if (intervalReached || nearExpiry) {
        Serial.println("🔄 JWT token refresh triggered");
        if (intervalReached) {
            #ifdef TESTING_MODE
                Serial.println("  📅 Reason: 5-minute test interval reached");
            #else
                Serial.println("  📅 Reason: 1-hour interval reached");
            #endif
        }
        if (nearExpiry) {
            Serial.println("  ⏰ Reason: Token near expiry");
        }
        
        _lastTokenRefresh = currentMillis;
        if (!refreshDeviceToken()) {
            Serial.println("⚠️ JWT refresh failed, attempting refresh token rotation as fallback...");
            if (rotateRefreshToken()) {
                Serial.println("✅ Fallback refresh token rotation successful");
                _prefs.putULong64("lastRefresh", _lastTokenRefresh);
            } else {
                Serial.println("❌ Both JWT refresh and refresh token rotation failed");
                handleTokenRefreshFailure();
            }
        } else {
            _prefs.putULong64("lastRefresh", _lastTokenRefresh);
        }
    }
}

bool JunctionRelay::refreshDeviceToken() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("❌ WiFi not connected - cannot refresh token");
        return false;
    }
    
    HTTPClient http;
    String url = _cloudBaseUrl + "/cloud/devices/refresh";
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    StaticJsonDocument<512> doc;
    doc["RefreshToken"] = _refreshToken;
    doc["DeviceId"] = _deviceId;
    
    String payload;
    serializeJson(doc, payload);
    
    Serial.println("📤 Sending token refresh request");
    
    int httpResponseCode = http.POST(payload);
    
    if (httpResponseCode == 200) {
        String response = http.getString();
        Serial.println("✅ Token refresh successful");
        
        StaticJsonDocument<1024> responseDoc;
        DeserializationError error = deserializeJson(responseDoc, response);
        
        if (!error && responseDoc["success"] == true) {
            String newJwt = responseDoc["token"].as<String>();
            String jwtExpiryStr = responseDoc["expiresAt"].as<String>();
            
            #ifdef TESTING_MODE
                time_t currentTime = getCurrentTimestamp();
                time_t testJwtExpiry = currentTime + (TEST_JWT_LIFETIME / 1000);
                
                struct tm jwt_tm_copy = *gmtime(&testJwtExpiry);
                char jwtBuffer[32];
                strftime(jwtBuffer, sizeof(jwtBuffer), "%Y-%m-%dT%H:%M:%SZ", &jwt_tm_copy);
                jwtExpiryStr = String(jwtBuffer);
                
                Serial.println("Using test JWT lifetime (6 minutes)");
            #endif
            
            setDeviceJwt(newJwt);
            _jwtExpiryString = jwtExpiryStr;
            _jwtExpiresAt = parseISO8601(jwtExpiryStr);
            
            saveTokens(_refreshToken, _deviceId);
            
            return true;
        } else {
            Serial.println("❌ Failed to parse token refresh response or success=false");
            return false;
        }
    } else if (httpResponseCode == 401 || httpResponseCode == 403) {
        Serial.println("❌ Token refresh failed with authentication error - refresh token likely expired");
        return false;
    } else {
        Serial.println("❌ Token refresh failed with code: " + String(httpResponseCode));
        return false;
    }
    
    http.end();
}

void JunctionRelay::handleTokenRefreshFailure() {
    Serial.println("⚠️ Token refresh failed - clearing stored tokens");
    
    clearStoredTokens();
    
    _registered = false;
    _prefs.remove("jwt");
    _jwt = "";
    
    Serial.println("🔄 Device will need to re-register");
}

bool JunctionRelay::setPublicKey(const String& base64Key) {
    String cleaned = base64Key;
    cleaned.trim();
    cleaned.replace("\n", "");
    cleaned.replace("\r", "");
    cleaned.replace(" ", "");

    size_t outLen = 0;
    uint8_t decoded[128];
    int ret = mbedtls_base64_decode(decoded, sizeof(decoded), &outLen,
                                    (const unsigned char*)cleaned.c_str(),
                                    cleaned.length());
    if (ret != 0) {
        Serial.printf("❌ Base64 decode failed: %d\n", ret);
        return false;
    }

    if (outLen == 65 && decoded[0] == 0x04) {
        memcpy(_publicKey, decoded, 65);
    } else if (outLen == 33 && (decoded[0] == 0x02 || decoded[0] == 0x03)) {
        uint8_t uncmp[65];
        size_t uncmpLen = 0;
        Serial.println("Decompressing compressed public key...");
        if (!decompressPublicKey(decoded, outLen, uncmp, uncmpLen)) {
            Serial.println("❌ Failed to decompress compressed public key");
            return false;
        }
        if (uncmpLen != 65) {
            Serial.printf("❌ Unexpected uncompressed length: %u\n", (unsigned)uncmpLen);
            return false;
        }
        memcpy(_publicKey, uncmp, 65);
    } else {
        Serial.println("❌ Invalid P-256 public key format");
        return false;
    }

    _prefs.putString("publicKey", cleaned);
    _prefs.putBytes("publicKeyRaw", _publicKey, sizeof(_publicKey));
    Serial.println("✅ P-256 public key set and stored (raw)");
    
    return true;
}

bool JunctionRelay::decompressPublicKey(
    const uint8_t* comp, size_t compLen,
    uint8_t* uncmp, size_t& uncmpLen
) {
    if (compLen != 33) return false;

    mbedtls_ecp_group grp;
    mbedtls_ecp_point pt;
    mbedtls_mpi X, Y2, Y, exp;
    int ret;
    bool success = false;

    mbedtls_ecp_group_init(&grp);
    mbedtls_ecp_point_init(&pt);
    mbedtls_mpi_init(&X);
    mbedtls_mpi_init(&Y2);
    mbedtls_mpi_init(&Y);
    mbedtls_mpi_init(&exp);

    do {
        if ((ret = mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1)) != 0) break;
        if ((ret = mbedtls_mpi_read_binary(&X, comp + 1, 32)) != 0) break;
        if ((ret = mbedtls_mpi_mul_mpi(&Y2, &X, &X)) != 0) break;
        if ((ret = mbedtls_mpi_mod_mpi(&Y2, &Y2, &grp.P)) != 0) break;
        if ((ret = mbedtls_mpi_mul_mpi(&Y2, &Y2, &X)) != 0) break;
        if ((ret = mbedtls_mpi_mod_mpi(&Y2, &Y2, &grp.P)) != 0) break;
    
        {
            mbedtls_mpi temp_3x;
            mbedtls_mpi_init(&temp_3x);
            
            if ((ret = mbedtls_mpi_mul_int(&temp_3x, &X, 3)) != 0) {
                mbedtls_mpi_free(&temp_3x);
                break;
            }
            if ((ret = mbedtls_mpi_mod_mpi(&temp_3x, &temp_3x, &grp.P)) != 0) {
                mbedtls_mpi_free(&temp_3x);
                break;
            }
            
            if ((ret = mbedtls_mpi_sub_mpi(&Y2, &Y2, &temp_3x)) != 0) {
                mbedtls_mpi_free(&temp_3x);
                break;
            }
            if ((ret = mbedtls_mpi_mod_mpi(&Y2, &Y2, &grp.P)) != 0) {
                mbedtls_mpi_free(&temp_3x);
                break;
            }
            
            mbedtls_mpi_free(&temp_3x);
        }

        if ((ret = mbedtls_mpi_add_mpi(&Y2, &Y2, &grp.B)) != 0) break;
        if ((ret = mbedtls_mpi_mod_mpi(&Y2, &Y2, &grp.P)) != 0) break;
        
        if ((ret = mbedtls_mpi_add_int(&exp, &grp.P, 1)) != 0) break;
        if ((ret = mbedtls_mpi_shift_r(&exp, 2)) != 0) break;
        if ((ret = mbedtls_mpi_exp_mod(&Y, &Y2, &exp, &grp.P, nullptr)) != 0) break;
        
        bool yOdd = mbedtls_mpi_get_bit(&Y, 0);
        bool wantOdd = (comp[0] == 0x03);
        
        if (yOdd != wantOdd) {
            if ((ret = mbedtls_mpi_sub_mpi(&Y, &grp.P, &Y)) != 0) break;
        }
        
        if ((ret = mbedtls_mpi_lset(&pt.Z, 1)) != 0) break;
        if ((ret = mbedtls_mpi_copy(&pt.X, &X)) != 0) break;
        if ((ret = mbedtls_mpi_copy(&pt.Y, &Y)) != 0) break;
        
        uncmpLen = 65;
        if ((ret = mbedtls_ecp_point_write_binary(&grp, &pt,
              MBEDTLS_ECP_PF_UNCOMPRESSED,
              &uncmpLen, uncmp, 65)) != 0) break;
        
        if ((ret = mbedtls_ecp_check_pubkey(&grp, &pt)) != 0) break;
        
        success = true;
        
    } while (0);

    mbedtls_ecp_point_free(&pt);
    mbedtls_ecp_group_free(&grp);
    mbedtls_mpi_free(&X);
    mbedtls_mpi_free(&Y2);
    mbedtls_mpi_free(&Y);
    mbedtls_mpi_free(&exp);
    
    return success;
}

void JunctionRelay::addSensor(const String& key, const String& value)
{
    _sensors += ",\"" + key + "\":\"" + value + "\"";
}

void JunctionRelay::waitForToken()
{
    static bool prompted = false;
    if (!prompted) {
        while (Serial.available()) Serial.read();
        Serial.println("📋 Paste registration token (JSON) and press Enter:");
        prompted = true;
    }
    if (Serial.available()) {
        String input = Serial.readStringUntil('\n');
        input.trim();
        if (input.startsWith("{") && input.endsWith("}")) {
            _regToken = input;
            parseRegistrationToken();
            prompted = false;
        } else {
            Serial.println("❌ Invalid JSON format");
            prompted = false;
        }
    }
}

void JunctionRelay::parseRegistrationToken()
{
    StaticJsonDocument<1024> doc;
    if (deserializeJson(doc, _regToken) != DeserializationError::Ok) return;
    if (!doc.containsKey("publicKey") || !doc.containsKey("deviceName") || !doc.containsKey("token")) return;

    String publicKey = doc["publicKey"];
    String deviceName = doc["deviceName"];
    String token      = doc["token"];

    Serial.println("🔑 Registration token validated");
    Serial.println("Device: " + deviceName);

    if (setPublicKey(publicKey)) {
        registerDevice();
    }
}

void JunctionRelay::registerDevice()
{
    HTTPClient http;
    http.begin(_cloudBaseUrl + "/cloud/devices/register");
    http.addHeader("Content-Type", "application/json");

    uint64_t mac = ESP.getEfuseMac();
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             (uint8_t)(mac >>  0), (uint8_t)(mac >>  8), (uint8_t)(mac >> 16),
             (uint8_t)(mac >>  24), (uint8_t)(mac >>  32), (uint8_t)(mac >>  40));

    StaticJsonDocument<1024> doc;
    deserializeJson(doc, _regToken);
    String actualToken = doc["token"];
    String deviceName  = doc["deviceName"];  

    String payload = String("{\"registrationToken\":\"") + actualToken +
                     "\",\"actualDeviceId\":\"" + macStr +
                     "\",\"deviceName\":\"" + deviceName + "\"}";

    Serial.println("📡 Registering device...");
    int code = http.POST(payload);
    if (code == 200) {
        String resp = http.getString();
        StaticJsonDocument<1024> rdoc;
        if (deserializeJson(rdoc, resp) == DeserializationError::Ok
         && rdoc.containsKey("deviceJwt")) {
            _jwt = rdoc["deviceJwt"].as<String>();
            _prefs.putString("jwt", _jwt);
            _registered = true;
            
            if (rdoc.containsKey("refreshToken")) {
                String refreshToken = rdoc["refreshToken"].as<String>();
                String deviceId = macStr;
                String jwtExpiryStr = rdoc["expiresAt"].as<String>();
                String refreshExpiryStr = rdoc["refreshTokenExpiresAt"].as<String>();
                
                #ifdef TESTING_MODE
                    time_t currentTime = getCurrentTimestamp();
                    time_t testJwtExpiry = currentTime + (TEST_JWT_LIFETIME / 1000);
                    time_t testRefreshExpiry = currentTime + (TEST_REFRESH_LIFETIME / 1000);
                    
                    struct tm jwt_tm_copy = *gmtime(&testJwtExpiry);
                    struct tm refresh_tm_copy = *gmtime(&testRefreshExpiry);
                    
                    char jwtBuffer[32], refreshBuffer[32];
                    strftime(jwtBuffer, sizeof(jwtBuffer), "%Y-%m-%dT%H:%M:%SZ", &jwt_tm_copy);
                    strftime(refreshBuffer, sizeof(refreshBuffer), "%Y-%m-%dT%H:%M:%SZ", &refresh_tm_copy);
                    
                    jwtExpiryStr = String(jwtBuffer);
                    refreshExpiryStr = String(refreshBuffer);
                    
                    Serial.println("Using test token lifetimes (6min JWT, 18min refresh)");
                #endif
                
                updateTokenExpiry(jwtExpiryStr, refreshExpiryStr);
                _lastTokenRefresh = millis();
                
                saveTokens(refreshToken, deviceId);
                Serial.println("✅ Device registered with refresh token!");
            } else {
                Serial.println("✅ Device registered!");
            }
        }
    } else {
        Serial.println("❌ Registration failed: " + String(code));
        String response = http.getString();
        Serial.println("Response: " + response);
    }
    http.end();
}

String JunctionRelay::encryptData(const String& data)
{
    int ret = 0;
    String result = "";

    mbedtls_ecdh_context  ecdh;
    mbedtls_gcm_context   gcm;
    mbedtls_mpi           shared;
    mbedtls_ecp_point     dash;
    mbedtls_ecdh_init(&ecdh);
    mbedtls_gcm_init(&gcm);
    mbedtls_mpi_init(&shared);
    mbedtls_ecp_point_init(&dash);

    size_t pt_len = data.length();
    uint8_t aes_key[32];
    uint8_t iv[12];
    uint8_t tag[16];
    uint8_t eph[33];
    size_t eph_len = 0;
    size_t total, b64Len, oLen;

    uint8_t *ct = nullptr, *buf = nullptr, *b64 = nullptr;

    if ((ret = mbedtls_ecdh_setup(&ecdh, MBEDTLS_ECP_DP_SECP256R1)) != 0) {
        Serial.printf("❌ ecdh_setup failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    if ((ret = mbedtls_ecdh_gen_public(&ecdh.grp, &ecdh.d, &ecdh.Q,
                                       mbedtls_ctr_drbg_random, &_ctr_drbg)) != 0) {
        Serial.printf("❌ ecdh_gen_public failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    if ((ret = mbedtls_ecp_point_read_binary(&ecdh.grp, &dash,
                                             _publicKey, sizeof(_publicKey))) != 0) {
        Serial.printf("❌ read_binary(peer) failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    if ((ret = mbedtls_ecp_check_pubkey(&ecdh.grp, &dash)) != 0) {
        Serial.printf("❌ check_pubkey failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    if ((ret = mbedtls_ecdh_compute_shared(&ecdh.grp, &shared, &dash, &ecdh.d,
                                           mbedtls_ctr_drbg_random, &_ctr_drbg)) != 0) {
        Serial.printf("❌ compute_shared failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    if ((ret = mbedtls_mpi_write_binary(&shared, aes_key, sizeof(aes_key))) != 0) {
        Serial.printf("❌ mpi_write_binary failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    if ((ret = mbedtls_ctr_drbg_random(&_ctr_drbg, iv, sizeof(iv))) != 0) {
        Serial.printf("❌ ctr_drbg_random failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    
    ct = (uint8_t*)malloc(pt_len + 16);
    if (!ct) {
        Serial.println("❌ malloc(ct) failed");
        ret = -1;
        goto cleanup;
    }
    
    if ((ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, aes_key, 256)) != 0) {
        Serial.printf("❌ gcm_setkey failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    if ((ret = mbedtls_gcm_crypt_and_tag(&gcm, MBEDTLS_GCM_ENCRYPT,
                                         pt_len, iv, sizeof(iv),
                                         nullptr, 0,
                                         (const uint8_t*)data.c_str(), ct,
                                         sizeof(tag), tag)) != 0) {
        Serial.printf("❌ gcm_crypt_and_tag failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    
    memcpy(ct + pt_len, tag, 16);
    
    if ((ret = mbedtls_ecp_point_write_binary(&ecdh.grp, &ecdh.Q,
                                              MBEDTLS_ECP_PF_COMPRESSED,
                                              &eph_len, eph, sizeof(eph))) != 0) {
        Serial.printf("❌ write_binary(eph) failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    
    total = eph_len + sizeof(iv) + pt_len + 16;
    buf   = (uint8_t*)malloc(total);
    if (!buf) {
        Serial.println("❌ malloc(buf) failed");
        ret = -1;
        goto cleanup;
    }
    memcpy(buf, eph, eph_len);
    memcpy(buf + eph_len, iv, sizeof(iv));
    memcpy(buf + eph_len + sizeof(iv), ct, pt_len + 16);
    
    b64Len = 4 * ((total + 2) / 3) + 1;
    b64    = (uint8_t*)malloc(b64Len);
    if (!b64) {
        Serial.println("❌ malloc(b64) failed");
        ret = -1;
        goto cleanup;
    }
    if ((ret = mbedtls_base64_encode(b64, b64Len, &oLen, buf, total)) != 0) {
        Serial.printf("❌ base64_encode failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    
    result = String((char*)b64);

cleanup:
    if (ret != 0 && result.length() == 0) {
        Serial.printf("❌ encryptData ultimately failed with: -0x%04X\n", -ret);
    }
    free(ct);
    free(buf);
    free(b64);
    mbedtls_gcm_free(&gcm);
    mbedtls_ecdh_free(&ecdh);
    mbedtls_ecp_point_free(&dash);
    mbedtls_mpi_free(&shared);
    return result;
}

void JunctionRelay::sendHealth()
{
    String data = String("{\"uptime\":") + (millis()/1000) +
                  ",\"freeHeap\":" + ESP.getFreeHeap() +
                  ",\"wifiRSSI\":" + WiFi.RSSI() +
                  _sensors + "}";

    String enc = encryptData(data);
    if (!enc.length()) {
        Serial.println("❌ Encryption failed");
        return;
    }

    HTTPClient http;
    http.begin(_cloudBaseUrl + "/cloud/devices/health");
    http.addHeader("Authorization", "Bearer " + _jwt);
    http.addHeader("Content-Type", "application/json");

    String payload = String("{\"Status\":\"online\",\"SensorData\":\"") + enc + "\"}";
    
    int code = http.POST(payload);
    
    if (code == 200) {
        Serial.println("✅ Health sent");
    } else {
        Serial.println("❌ Health failed: " + String(code));
    }
    
    http.end();
    _sensors = "";
}