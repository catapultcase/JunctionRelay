# JunctionRelay ESP32 Template

Minimal template to connect ESP32 to JunctionRelay cloud with just 3 files.

## Files
- `main.ino` - Your project (customize this)
- `JunctionRelay.h` - Header 
- `JunctionRelay.cpp` - Implementation

## Setup

1. **Install ArduinoJson library** via Library Manager

2. **Update main.ino:**
```cpp
const char* WIFI_SSID = "your_wifi";
const char* WIFI_PASSWORD = "your_password"; 
const char* DEVICE_NAME = "My_Device";
const char* REGISTRATION_TOKEN = ""; // Optional: add token here
```

3. **Upload and register:**
   - If token is empty: Enter token in Serial Monitor when prompted
   - If token is set: Device registers automatically

## Registration Options

### Option A: Pre-configure in Code (Production)
```cpp
const char* REGISTRATION_TOKEN = "your_token_from_dashboard";
```
- Device registers automatically on boot
- No user interaction needed
- Perfect for deployed devices

### Option B: Serial Input (Development)
```cpp
const char* REGISTRATION_TOKEN = ""; // Leave empty
```
- Device prompts for token in Serial Monitor
- Paste token when prompted
- Good for testing and development

## Usage

```cpp
void loop() {
  relay.handle(); // Required - call every loop
  
  // Add sensor data (sent with next health report)
  relay.addSensor("temperature", "25.3");
  relay.addSensor("humidity", "60");
  
  // Your project code here
  delay(100);
}
```

## API

### Core Methods (Required)
- `relay.handle()` - Process cloud operations (must call in loop)

### Sensor Data Methods
- `relay.addSensor(key, value)` - Add custom sensor reading
- Sensors are automatically sent with health reports every 60 seconds
- Sensor data is cleared after each health report

### Status Methods
- `relay.isRegistered()` - Check if device is registered

### Configuration Methods
- `relay.setToken(token)` - Set registration token programmatically

## Features

- ✅ **Auto-registration** with token (code or serial input)
- ✅ **Health reports** every 60 seconds automatically
- ✅ **MAC-based device identification** (unique per ESP32)
- ✅ **Persistent token storage** (survives reboots)
- ✅ **Custom sensor data** (your readings sent to cloud)
- ✅ **System metrics** (uptime, free heap, WiFi signal)
- ✅ **Minimal footprint** (~150 lines total)

## Example Usage

```cpp
void loop() {
  relay.handle();
  
  // Read your sensors
  float temp = analogRead(A0) * 0.1;
  int light = analogRead(A1);
  
  // Send to cloud
  relay.addSensor("temperature", String(temp));
  relay.addSensor("lightLevel", String(light));
  
  // Your other project code
  controlLED();
  checkButtons();
  
  delay(100);
}
```

## Device Identification

Devices are automatically identified by their MAC address:
- **Format**: `A1:B2:C3:D4:E5:F6`
- **Unique** per ESP32 hardware
- **Persistent** across firmware updates
- **Cloud assigns** internal device ID (like "CLOUD_13")

## Data Flow

1. **Registration**: Device sends MAC + metadata → Cloud assigns device ID
2. **Health Reports**: Every 60 seconds, device sends:
   - Status: "online"
   - System data: uptime, free heap, WiFi signal
   - Your custom sensor data
3. **Dashboard**: View all data in JunctionRelay Cloud Dashboard

## Project Structure

```
YourProject/
├── main.ino          # Your project (customize WiFi, device name, sensors)
├── JunctionRelay.h   # Header file (don't modify)
├── JunctionRelay.cpp # Implementation (don't modify)
└── README.md         # This file
```

## Required Libraries

Make sure these are installed in Arduino IDE:
- **WiFi** (built-in with ESP32)
- **HTTPClient** (built-in with ESP32)
- **Preferences** (built-in with ESP32)
- **ArduinoJson** (install via Library Manager - version 6.x)

## Troubleshooting

### Device Won't Register
- Check WiFi credentials and connection
- Verify registration token from JunctionRelay dashboard
- Check Serial Monitor (115200 baud) for error messages
- Ensure token hasn't expired (15 minute expiry)

### Health Reports Not Appearing
- Confirm device shows as registered in dashboard
- Check WiFi connection is stable
- Verify device is sending (check Serial Monitor for "✅ Health sent")

### Compilation Errors
- Install ArduinoJson library via Library Manager
- Use ESP32 board package (not Arduino Uno/Nano)
- Check all 3 files are in same folder

### Memory Issues
- Template uses ~2KB RAM for JSON operations
- Custom sensor data limited to 512 bytes
- Data is cleared after each health report

## Example Projects

This template works great for:
- **Environmental monitoring** (temperature, humidity, air quality)
- **Home automation** (smart switches, sensors, controllers)
- **Security systems** (motion sensors, door/window monitoring)
- **Agricultural IoT** (soil moisture, greenhouse monitoring)
- **Industrial sensors** (equipment monitoring, predictive maintenance)

Simply modify the sensor readings in `loop()` and they'll automatically appear in your JunctionRelay dashboard!

## Next Steps

1. **Customize sensors**: Add your specific hardware readings
2. **Set device name**: Choose descriptive name for dashboard
3. **Deploy**: Use pre-configured tokens for production devices
4. **Monitor**: View real-time data in JunctionRelay Cloud Dashboard

The template handles all cloud connectivity - you focus on your sensors and project logic!