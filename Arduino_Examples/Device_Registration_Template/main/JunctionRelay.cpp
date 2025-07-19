#include "JunctionRelay.h"

JunctionRelay::JunctionRelay()
    : _lastReport(0), _registered(false)
{
    mbedtls_entropy_init(&_entropy);
    mbedtls_ctr_drbg_init(&_ctr_drbg);
    mbedtls_ctr_drbg_seed(&_ctr_drbg, mbedtls_entropy_func, &_entropy, nullptr, 0);
}

void JunctionRelay::begin() {
    _prefs.begin("relay", false);
    _jwt = _prefs.getString("jwt", "");
    _registered = !_jwt.isEmpty();

    if (_registered) {
        Serial.println("✅ Device registered");
        // Try to load raw uncompressed public key
        size_t got = _prefs.getBytes("publicKeyRaw", _publicKey, sizeof(_publicKey));
        if (got == sizeof(_publicKey)) {
            Serial.println("✅ Loaded raw publicKey from prefs");
            
            // DEBUG: Print the loaded key
            Serial.print("DEBUG: Loaded key from prefs (hex): ");
            for (int i = 0; i < 65; i++) {
                Serial.printf("%02X", _publicKey[i]);
            }
            Serial.println();
            
            // DEBUG: Validate the loaded key immediately
            mbedtls_ecp_group grp;
            mbedtls_ecp_point pt;
            mbedtls_ecp_group_init(&grp);
            mbedtls_ecp_point_init(&pt);
            
            int ret = mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1);
            if (ret == 0) {
                ret = mbedtls_ecp_point_read_binary(&grp, &pt, _publicKey, sizeof(_publicKey));
                if (ret == 0) {
                    ret = mbedtls_ecp_check_pubkey(&grp, &pt);
                    Serial.printf("DEBUG: Key validation at startup: %s (ret=%d)\n", 
                                  ret == 0 ? "VALID" : "INVALID", ret);
                } else {
                    Serial.printf("DEBUG: Failed to read binary at startup: -0x%04X\n", -ret);
                }
            } else {
                Serial.printf("DEBUG: Failed to load group at startup: -0x%04X\n", -ret);
            }
            
            mbedtls_ecp_point_free(&pt);
            mbedtls_ecp_group_free(&grp);
            
        } else {
            Serial.printf("DEBUG: Only got %u bytes from prefs, expected 65\n", (unsigned)got);
            // Fallback to Base64 path
            String stored = _prefs.getString("publicKey", "");
            if (!stored.isEmpty()) {
                setPublicKey(stored);
            }
        }
    } else {
        Serial.println("⏳ Need registration token");
    }
}

void JunctionRelay::handle() {
    if (WiFi.status() != WL_CONNECTED || !_registered) {
        if (!_registered) waitForToken();
        return;
    }
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

bool JunctionRelay::setPublicKey(const String& base64Key) {
    // clean up the input
    String cleaned = base64Key;
    cleaned.trim();
    cleaned.replace("\n", "");
    cleaned.replace("\r", "");
    cleaned.replace(" ", "");

    Serial.print("Cleaned base64 public key length: ");
    Serial.println(cleaned.length());
    Serial.print("Cleaned base64 public key: ");
    Serial.println(cleaned);

    size_t outLen = 0;
    uint8_t decoded[128];
    int ret = mbedtls_base64_decode(decoded, sizeof(decoded), &outLen,
                                    (const unsigned char*)cleaned.c_str(),
                                    cleaned.length());
    if (ret != 0) {
        Serial.printf("❌ Base64 decode failed: %d\n", ret);
        return false;
    }

    Serial.printf("Decoded public key length: %u, first byte=0x%02X\n",
                  (unsigned)outLen, decoded[0]);

    // Already uncompressed?
    if (outLen == 65 && decoded[0] == 0x04) {
        memcpy(_publicKey, decoded, 65);
    } else if (outLen == 33 && (decoded[0] == 0x02 || decoded[0] == 0x03)) {
        uint8_t uncmp[65];
        size_t uncmpLen = 0;
        Serial.println(" Decompressing compressed public key…");
        if (!decompressPublicKey(decoded, outLen, uncmp, uncmpLen)) {
            Serial.println("❌ Failed to decompress compressed public key");
            return false;
        }
        if (uncmpLen != 65) {
            Serial.printf("❌ Unexpected uncompressed length: %u\n", (unsigned)uncmpLen);
            return false;
        }
        memcpy(_publicKey, uncmp, 65);
        
        // DEBUG: Print the uncompressed key after decompression
        Serial.print("DEBUG: Uncompressed key (hex): ");
        for (int i = 0; i < 65; i++) {
            Serial.printf("%02X", _publicKey[i]);
        }
        Serial.println();
        
    } else {
        Serial.println("❌ Invalid P-256 public key format");
        return false;
    }

    // Persist both forms
    _prefs.putString("publicKey", cleaned);
    _prefs.putBytes("publicKeyRaw", _publicKey, sizeof(_publicKey));
    Serial.println("✅ P-256 public key set and stored (raw)");
    
    // DEBUG: Verify what we stored
    uint8_t verify[65];
    size_t got = _prefs.getBytes("publicKeyRaw", verify, sizeof(verify));
    Serial.printf("DEBUG: Stored %u bytes to prefs\n", (unsigned)got);
    if (got == 65) {
        Serial.print("DEBUG: Retrieved key from prefs (hex): ");
        for (int i = 0; i < 65; i++) {
            Serial.printf("%02X", verify[i]);
        }
        Serial.println();
        
        // Verify they match
        bool match = (memcmp(_publicKey, verify, 65) == 0);
        Serial.printf("DEBUG: Keys match: %s\n", match ? "YES" : "NO");
    }
    
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
        // Load the secp256r1 curve
        if ((ret = mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1)) != 0) {
            Serial.printf("DEBUG: Failed to load curve: -0x%04X\n", -ret);
            break;
        }
        
        // Read X coordinate from compressed key (skip first byte which is 0x02 or 0x03)
        if ((ret = mbedtls_mpi_read_binary(&X, comp + 1, 32)) != 0) {
            Serial.printf("DEBUG: Failed to read X: -0x%04X\n", -ret);
            break;
        }
        
        // Calculate Y² = X³ + aX + b (secp256r1: a = -3, b = specific value)
        // Y² = X³ - 3X + b
        
        // First: Y2 = X²
        if ((ret = mbedtls_mpi_mul_mpi(&Y2, &X, &X)) != 0) {
            Serial.printf("DEBUG: Failed X²: -0x%04X\n", -ret);
            break;
        }
        if ((ret = mbedtls_mpi_mod_mpi(&Y2, &Y2, &grp.P)) != 0) {
            Serial.printf("DEBUG: Failed X² mod: -0x%04X\n", -ret);
            break;
        }
        
        // Then: Y2 = X³ = X² * X
        if ((ret = mbedtls_mpi_mul_mpi(&Y2, &Y2, &X)) != 0) {
            Serial.printf("DEBUG: Failed X³: -0x%04X\n", -ret);
            break;
        }
        if ((ret = mbedtls_mpi_mod_mpi(&Y2, &Y2, &grp.P)) != 0) {
            Serial.printf("DEBUG: Failed X³ mod: -0x%04X\n", -ret);
            break;
        }
        
        // For secp256r1, a = -3, so we subtract 3X
        {
            mbedtls_mpi temp_3x;
            mbedtls_mpi_init(&temp_3x);
            
            // temp_3x = 3 * X
            if ((ret = mbedtls_mpi_mul_int(&temp_3x, &X, 3)) != 0) {
                mbedtls_mpi_free(&temp_3x);
                Serial.printf("DEBUG: Failed 3X: -0x%04X\n", -ret);
                break;
            }
            if ((ret = mbedtls_mpi_mod_mpi(&temp_3x, &temp_3x, &grp.P)) != 0) {
                mbedtls_mpi_free(&temp_3x);
                Serial.printf("DEBUG: Failed 3X mod: -0x%04X\n", -ret);
                break;
            }
            
            // Y2 = X³ - 3X
            if ((ret = mbedtls_mpi_sub_mpi(&Y2, &Y2, &temp_3x)) != 0) {
                mbedtls_mpi_free(&temp_3x);
                Serial.printf("DEBUG: Failed X³-3X: -0x%04X\n", -ret);
                break;
            }
            if ((ret = mbedtls_mpi_mod_mpi(&Y2, &Y2, &grp.P)) != 0) {
                mbedtls_mpi_free(&temp_3x);
                Serial.printf("DEBUG: Failed (X³-3X) mod: -0x%04X\n", -ret);
                break;
            }
            
            mbedtls_mpi_free(&temp_3x);
        }
        
        // Add b (curve parameter)
        if ((ret = mbedtls_mpi_add_mpi(&Y2, &Y2, &grp.B)) != 0) {
            Serial.printf("DEBUG: Failed +B: -0x%04X\n", -ret);
            break;
        }
        if ((ret = mbedtls_mpi_mod_mpi(&Y2, &Y2, &grp.P)) != 0) {
            Serial.printf("DEBUG: Failed +B mod: -0x%04X\n", -ret);
            break;
        }
        
        // Calculate Y = sqrt(Y²) mod p
        // For prime p ≡ 3 (mod 4), sqrt(x) = x^((p+1)/4) mod p
        if ((ret = mbedtls_mpi_add_int(&exp, &grp.P, 1)) != 0) {
            Serial.printf("DEBUG: Failed p+1: -0x%04X\n", -ret);
            break;
        }
        if ((ret = mbedtls_mpi_shift_r(&exp, 2)) != 0) {  // Divide by 4
            Serial.printf("DEBUG: Failed (p+1)/4: -0x%04X\n", -ret);
            break;
        }
        if ((ret = mbedtls_mpi_exp_mod(&Y, &Y2, &exp, &grp.P, nullptr)) != 0) {
            Serial.printf("DEBUG: Failed sqrt: -0x%04X\n", -ret);
            break;
        }
        
        // Check if we got the right parity and adjust if needed
        bool yOdd = mbedtls_mpi_get_bit(&Y, 0);
        bool wantOdd = (comp[0] == 0x03);
        
        Serial.printf("DEBUG: Y parity: %s, want: %s\n", 
                     yOdd ? "odd" : "even", 
                     wantOdd ? "odd" : "even");
        
        if (yOdd != wantOdd) {
            // Take the other square root: p - Y
            if ((ret = mbedtls_mpi_sub_mpi(&Y, &grp.P, &Y)) != 0) {
                Serial.printf("DEBUG: Failed p-Y: -0x%04X\n", -ret);
                break;
            }
        }
        
        // Set up the point
        if ((ret = mbedtls_mpi_lset(&pt.Z, 1)) != 0) {
            Serial.printf("DEBUG: Failed set Z: -0x%04X\n", -ret);
            break;
        }
        if ((ret = mbedtls_mpi_copy(&pt.X, &X)) != 0) {
            Serial.printf("DEBUG: Failed copy X: -0x%04X\n", -ret);
            break;
        }
        if ((ret = mbedtls_mpi_copy(&pt.Y, &Y)) != 0) {
            Serial.printf("DEBUG: Failed copy Y: -0x%04X\n", -ret);
            break;
        }
        
        // Convert to uncompressed format
        uncmpLen = 65;
        if ((ret = mbedtls_ecp_point_write_binary(&grp, &pt,
              MBEDTLS_ECP_PF_UNCOMPRESSED,
              &uncmpLen, uncmp, 65)) != 0) {
            Serial.printf("DEBUG: Failed write binary: -0x%04X\n", -ret);
            break;
        }
        
        // Verify the decompressed point is valid
        if ((ret = mbedtls_ecp_check_pubkey(&grp, &pt)) != 0) {
            Serial.printf("DEBUG: Decompressed point validation failed: -0x%04X\n", -ret);
            break;
        }
        
        Serial.println("DEBUG: Point decompression and validation successful");
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
    http.begin("https://api.junctionrelay.com/cloud/devices/register");
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
            Serial.println("✅ Device registered!");
        }
    } else {
        Serial.println("❌ Registration failed: " + String(code));
    }
    http.end();
}

String JunctionRelay::encryptData(const String& data)
{
    int ret = 0;
    String result = "";

    // — Init contexts —
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

    // 1) ECDH setup
    if ((ret = mbedtls_ecdh_setup(&ecdh, MBEDTLS_ECP_DP_SECP256R1)) != 0) {
        Serial.printf("❌ ecdh_setup failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    // 2) Generate ephemeral
    if ((ret = mbedtls_ecdh_gen_public(&ecdh.grp, &ecdh.d, &ecdh.Q,
                                       mbedtls_ctr_drbg_random, &_ctr_drbg)) != 0) {
        Serial.printf("❌ ecdh_gen_public failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    // 3) Load stored raw public key (_publicKey must already be 0x04||X||Y)
    if ((ret = mbedtls_ecp_point_read_binary(&ecdh.grp, &dash,
                                             _publicKey, sizeof(_publicKey))) != 0) {
        Serial.printf("❌ read_binary(peer) failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    // 4) Validate peer key
    if ((ret = mbedtls_ecp_check_pubkey(&ecdh.grp, &dash)) != 0) {
        Serial.printf("❌ check_pubkey failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    // 5) Compute shared secret
    if ((ret = mbedtls_ecdh_compute_shared(&ecdh.grp, &shared, &dash, &ecdh.d,
                                           mbedtls_ctr_drbg_random, &_ctr_drbg)) != 0) {
        Serial.printf("❌ compute_shared failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    // 6) Derive AES key (use X coordinate of shared point, skip first byte)
    if ((ret = mbedtls_mpi_write_binary(&shared, aes_key, sizeof(aes_key))) != 0) {
        Serial.printf("❌ mpi_write_binary failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    // 7) Random IV
    if ((ret = mbedtls_ctr_drbg_random(&_ctr_drbg, iv, sizeof(iv))) != 0) {
        Serial.printf("❌ ctr_drbg_random failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    // 8) Allocate CT buffer (IMPORTANT: Make room for tag at the end)
    ct = (uint8_t*)malloc(pt_len + 16); // +16 for tag
    if (!ct) {
        Serial.println("❌ malloc(ct) failed");
        ret = -1;
        goto cleanup;
    }
    // 9) GCM encrypt + tag (ciphertext + tag will be in ct buffer)
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
    
    // IMPORTANT: Append tag to ciphertext to match Web Crypto API format
    memcpy(ct + pt_len, tag, 16);
    
    // 10) Export our ephemeral pubkey
    if ((ret = mbedtls_ecp_point_write_binary(&ecdh.grp, &ecdh.Q,
                                              MBEDTLS_ECP_PF_COMPRESSED,
                                              &eph_len, eph, sizeof(eph))) != 0) {
        Serial.printf("❌ write_binary(eph) failed: -0x%04X\n", -ret);
        goto cleanup;
    }
    // 11) Pack EPH‖IV‖(CIPHERTEXT+TAG) to match decryption page format
    total = eph_len + sizeof(iv) + pt_len + 16; // +16 for tag
    buf   = (uint8_t*)malloc(total);
    if (!buf) {
        Serial.println("❌ malloc(buf) failed");
        ret = -1;
        goto cleanup;
    }
    memcpy(buf, eph, eph_len);
    memcpy(buf + eph_len, iv, sizeof(iv));
    memcpy(buf + eph_len + sizeof(iv), ct, pt_len + 16); // Include tag with ciphertext
    
    // 12) Base64 encode
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
    // Success!
    result = String((char*)b64);

cleanup:
    // If we bailed, print final code
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

    Serial.println("DEBUG: Raw health data: " + data);

    String enc = encryptData(data);
    if (!enc.length()) {
        Serial.println("❌ Encryption failed");
        return;
    }

    Serial.println("DEBUG: Encrypted data length: " + String(enc.length()));

    HTTPClient http;
    http.begin("https://api.junctionrelay.com/cloud/devices/health");
    http.addHeader("Authorization", "Bearer " + _jwt);
    http.addHeader("Content-Type", "application/json");

    // Match the exact format expected by the server
    // Based on DeviceHealthRequest class: Status, SensorData, BatteryLevel (optional), Timestamp (optional)
    String payload = String("{\"Status\":\"online\",\"SensorData\":\"") + enc + "\"}";
    
    Serial.println("DEBUG: HTTP payload length: " + String(payload.length()));
    Serial.println("DEBUG: HTTP payload: " + payload);

    int code = http.POST(payload);
    
    if (code == 200) {
        Serial.println("✅ Health sent");
    } else {
        Serial.println("❌ Health failed: " + String(code));
        
        // Get the error response body for more details
        String response = http.getString();
        Serial.println("DEBUG: Error response: " + response);
    }
    
    http.end();
    _sensors = "";
}