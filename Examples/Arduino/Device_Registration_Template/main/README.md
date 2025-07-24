# JunctionRelay ESP32 Template - P-256 ECDH Encryption

Minimal 3-file template for sending encrypted sensor data to JunctionRelay Cloud using P-256 ECDH asymmetric encryption.

## Files

* `main.ino` - Your project (customize this)
* `JunctionRelay.h` - Header
* `JunctionRelay.cpp` - Implementation

## Quick Setup

1. **Install Libraries** via Arduino Library Manager:
   - **ArduinoJson** (v6.x)

2. **Get Registration Token from Cloud Dashboard:**
   - Add device → Enter device name
   - **If you have a stored private key:** Token generates instantly
   - **If first-time user:** Enter your 64-character hex master key → Generate token
   - Copy the complete JSON token

3. **Update `main.ino`:**
   ```cpp
   const char* REGISTRATION_TOKEN = 
     "{\"deviceName\":\"Living Room Sensor\","
     "\"publicKey\":\"AgsPx8agMIJDCbu+2z3GClvqm7UBClPV/0sdJpx6ev6U\","
     "\"token\":\"abc123...\"}";
   ```

4. **Upload & Register** - Device auto-registers with your dashboard

## ESP32 Dependencies

- **ArduinoJson** (v6.x) - JSON parsing for registration tokens
- **mbedTLS** - P-256 ECDH and AES-GCM operations (built into ESP-IDF)

---

## Token Format

Dashboard provides 3 fields:
```json
{
  "deviceName": "Living Room Sensor",
  "publicKey": "AgsPx8agMIJDCbu+2z3GClvqm7UBClPV/0sdJpx6ev6U", 
  "token": "abc123..."
}
```

**Key Details:**
- **`publicKey`**: Base64-encoded 33-byte compressed P-256 public key
- **Derived from**: Dashboard's stored private key or entered master key
- **Format**: Automatically decompressed to 65-byte uncompressed format by ESP32

---

## How It Works

### Registration Process:
1. **Dashboard Key Management:**
   - **Stored Private Key**: Instant public key derivation for new devices
   - **Master Key Entry**: User enters 64-hex master key → derives private key → generates public key
   - **Zero-Knowledge**: Master keys never sent to servers

2. **ESP32 Setup:**
   - Receives compressed public key in registration token
   - Decompresses to uncompressed format (65 bytes)
   - Stores uncompressed key for ECDH operations

### ECDH Encryption Process:
1. **Device generates ephemeral key pair** for each message
2. **ECDH shared secret** = `ecdh(ephemeral_private, dashboard_public)`
3. **AES-GCM encryption** using shared secret as key (X coordinate, skip first byte)
4. **Sends format**: `ephemeral_compressed(33) + iv(12) + ciphertext_with_tag`

### Dashboard Decryption:
1. **Auto-decrypt**: If private key stored locally
2. **Manual decrypt**: User enters master key → derives private key → decrypts
3. **ECDH process**: `ecdh(stored_private, ephemeral_public)` → same shared secret

### Security Benefits:
- 🔐 **True asymmetric encryption** - devices cannot decrypt data
- 🛡️ **Perfect forward secrecy** - each message uses unique ephemeral keys
- 🚀 **ESP32 optimized** - P-256 hardware acceleration available
- 🔑 **Deterministic keys** - same master key produces same key pairs
- 🎯 **Zero-knowledge cloud** - backend never sees any keys

---

## API Reference

### Core Methods
- `relay.handle()` - Call every loop (required)
- `relay.addSensor(key, value)` - Add sensor reading
- `relay.setToken(jsonToken)` - Set registration token
- `relay.isRegistered()` - Check registration status

### Example Usage
```cpp
void loop() {
  relay.handle(); // Required
  
  // Add sensors every 30 seconds
  static unsigned long last = 0;
  if (millis() - last > 30000) {
    relay.addSensor("temp", String(23.5));
    relay.addSensor("humidity", "65");
    relay.addSensor("status", "online");
    last = millis();
  }
  
  delay(100);
}
```

---

## Key Management Flow

### Dashboard (Zero-Knowledge)
```
Master Key (MEK) → HKDF → Private Key (stored locally)
Private Key → p256.getPublicKey() → Compressed Public Key (sent to device)
```

### ESP32 (Encryption Only)
```
Compressed Public Key → decompress → Uncompressed Public Key (65 bytes)
Ephemeral Keys + Dashboard Public Key → ECDH → Shared Secret → AES-GCM
```

### Security Model
- **Users control**: Master key (64 hex chars)
- **Dashboard stores**: Private key (optional, for convenience)
- **Devices receive**: Compressed public key (33 bytes)
- **Cloud backend**: No keys, only encrypted data

---

## Troubleshooting

### Registration Issues
- **"Missing required fields"**: Token must have `publicKey`, `deviceName`, `token`
- **"Invalid base64 public key"**: Get fresh token from dashboard
- **"Decompression failed"**: Ensure public key is valid compressed P-256 format
- **"Invalid P-256 public key format"**: Token must be from updated dashboard

### Encryption Issues
- **"Encryption failed"**: Check memory and verify public key decompression
- **"ECDH failed"**: Ensure uncompressed public key is valid
- **No data in dashboard**: Verify payload format matches Web Crypto API expectations

### Key Format Issues
- **"Wrong key length"**: Compressed keys are 33 bytes, uncompressed are 65 bytes
- **"Key validation failed"**: ESP32 validates decompressed key before use
- **"Memory allocation failed"**: Ensure sufficient heap for ECDH operations

### Migration from Symmetric Version
- **Old tokens won't work** - generate new token from updated dashboard
- **`encryptKey` removed** - now uses `publicKey` with ECDH
- **No backwards compatibility** - completely new encryption method

---

## ESP32 Memory Requirements

- **Public key storage**: 65 bytes (uncompressed P-256)
- **Ephemeral key generation**: ~2KB during encryption (freed immediately)
- **ECDH computation**: ~4KB temporary allocation
- **Total heap needed**: ~8KB available during encryption operations

---

## Security Architecture

### ESP32 Capabilities
- ✅ **Can encrypt data** using dashboard's public key
- ❌ **Cannot decrypt data** (no private key)
- ✅ **Perfect forward secrecy** with ephemeral keys
- ✅ **Hardware acceleration** for P-256 operations

### Dashboard Capabilities  
- ✅ **Can decrypt data** using stored private key
- ✅ **Auto-decrypt** when private key available
- ✅ **Manual decrypt** by deriving from master key
- ❌ **Cannot access master keys** (processed locally only)

### Cloud Backend
- ❌ **Cannot decrypt data** (zero-knowledge architecture)
- ✅ **Stores encrypted blobs** only
- ✅ **Device coordination** and management
- ❌ **No access to any keys**

---

## Serial Monitor Output

### Successful Registration
```
🚀 JunctionRelay ESP32 Starting...
✅ WiFi connected!
📍 IP: 192.168.1.100
⏳ Need registration token
📋 Paste registration token (JSON) and press Enter:
🔑 Registration token validated
Device: Living Room Sensor
Cleaned base64 public key length: 44
Decoded public key length: 33, first byte=0x02
 Decompressing compressed public key…
DEBUG: Point decompression and validation successful
✅ P-256 public key set and stored (raw)
📡 Registering device...
✅ Device registered!
📊 Device ready
```

### Successful Health Report
```
DEBUG: Raw health data: {"uptime":60,"freeHeap":270260,"wifiRSSI":-42,"temperature":"23.5","humidity":"65","status":"online"}
DEBUG: Encrypted data length: 216
✅ Health sent
```

---

## Need Help?

### Common Issues
1. **Token format errors**: Ensure JSON is valid with all 3 required fields
2. **Key decompression fails**: Generate fresh token from updated dashboard
3. **Memory issues**: Ensure ESP32 has sufficient heap (~8KB free)
4. **WiFi connectivity**: Check network and internet access

### Debug Steps
1. Check Serial Monitor for detailed status messages
2. Verify WiFi and internet connectivity  
3. Generate fresh registration token if issues persist
4. Ensure ArduinoJson library is properly installed
5. Confirm dashboard shows device in pending list after registration

### Support
- Contact support with complete Serial Monitor logs
- Include registration token format (without sensitive values)
- Specify ESP32 model and available heap memory