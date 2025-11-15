# JunctionRelay Python Client for Raspberry Pi

A Python implementation of the JunctionRelay device client, designed to run on Raspberry Pi and other Linux systems. This client provides secure, encrypted communication with the JunctionRelay cloud platform for IoT device management and monitoring.

## Features

- 🔐 **Secure Communication**: End-to-end encryption using ECDH key exchange and AES-GCM
- 🔄 **Automatic Token Management**: JWT tokens and refresh tokens are automatically managed
- 🔁 **Token Rotation**: Refresh tokens are automatically rotated to maintain long-term connectivity
- 📊 **System Monitoring**: Collects and reports system statistics (CPU, memory, temperature)
- 💾 **Persistent Configuration**: Device settings and tokens are stored locally with proper expiry handling
- 🚀 **Background Service**: Can run as a systemd service for continuous operation
- 📡 **Health Reporting**: Regular encrypted health reports to the cloud platform
- 🔧 **Easy Registration**: Simple token-based device registration process
- 🧪 **Test Mode**: Accelerated token refresh cycles for development and testing

## Token Management System

This client implements the same advanced token management system as the ESP32 version:

### **Two-Tier Token Architecture**
- **JWT Token**: 8 hours lifetime (6 minutes in test mode) - used for API authentication
- **Refresh Token**: 7 days lifetime (18 minutes in test mode) - used to obtain new JWT tokens

### **Automatic Operations**
- **JWT Refresh**: Every 1 hour or when token expires in <5 minutes
- **Refresh Token Rotation**: When refresh token expires in <24 hours (1 minute in test mode)
- **Failure Recovery**: Invalid tokens trigger automatic re-registration
- **Cross-Reboot Persistence**: Tokens maintain validity after system restarts

### **Test Mode vs Production**
- **Test Mode** (`TESTING_MODE = True`): 6min JWT, 18min refresh tokens for rapid testing
- **Production Mode** (`TESTING_MODE = False`): 8hr JWT, 7day refresh tokens for real deployments

## Requirements

- Raspberry Pi (or any Linux system with Python 3.7+)
- Internet connection
- JunctionRelay account and registration token

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/catapultcase/JunctionRelay_Python_Health_Sensors.git
cd JunctionRelay_Python_Health_Sensors
```

### 2. Run Setup Script

```bash
chmod +x setup_raspberry_pi.sh
./setup_raspberry_pi.sh
```

This will:
- Install required system dependencies
- Create a Python virtual environment
- Install Python packages

### 3. Configure Test/Production Mode

Edit `junctionrelay_python.py` to set the desired mode:

```python
# For testing (accelerated token cycles)
self.TESTING_MODE = True

# For production (standard token cycles)
self.TESTING_MODE = False
```

### 4. Run the Client

```bash
source junction_relay_env/bin/activate
python3 junctionrelay_python.py
```

### 5. Register Your Device

When first running, you'll be prompted to paste your registration token:

```
📋 Paste registration token (JSON) and press Enter:
```

Paste the JSON token you received from your JunctionRelay dashboard and press Enter.

## Installation as a System Service

To run JunctionRelay automatically on boot:

### 1. Copy Service File

```bash
sudo cp junctionrelay.service /etc/systemd/system/
```

### 2. Update Service File Paths

Edit `/etc/systemd/system/junctionrelay.service` and adjust paths if needed:

```ini
WorkingDirectory=/home/pi/JunctionRelay_Python_Health_Sensors
ExecStart=/home/pi/JunctionRelay_Python_Health_Sensors/junction_relay_env/bin/python /home/pi/JunctionRelay_Python_Health_Sensors/junctionrelay_python.py
```

### 3. Enable and Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable junctionrelay
sudo systemctl start junctionrelay
```

### 4. Check Service Status

```bash
sudo systemctl status junctionrelay
```

### 5. View Logs

```bash
sudo journalctl -u junctionrelay -f
```

## Configuration

Configuration is automatically saved to `junction_relay_config.json` in the same directory as the script. This includes:

- Device JWT token with expiry timestamp
- Refresh token with expiry timestamp  
- Device ID (MAC address)
- Server public key for encryption
- Token refresh timestamps

The configuration file uses ISO 8601 timestamps for cross-platform compatibility and proper timezone handling.

## Token Lifecycle Example

### Test Mode (20-minute cycle)
```
00:00 - Device Registration
      ├── Initial JWT + refresh token received
      └── Begin health reporting

05:00 - JWT Refresh #1  
      ├── Request new JWT using refresh token
      └── Continue operations seamlessly

10:00 - JWT Refresh #2
      ├── Another automatic JWT renewal  
      └── No interruption to device functionality

15:00 - JWT Refresh #3
      ├── Final JWT refresh before rotation
      └── Operations continue normally

17:00 - Refresh Token Rotation
      ├── Refresh token near expiry (1min warning)
      ├── Request new JWT + refresh token pair
      ├── Reset 18-minute rotation cycle  
      └── Continue uninterrupted operation
```

### Production Mode (7-day cycle)
- JWT refreshes every hour for 7 days
- Refresh token rotation happens weekly
- Zero maintenance required

## Custom Sensor Data

You can add custom sensor readings using the `add_sensor()` method:

```python
relay = JunctionRelay()
relay.add_sensor("temperature", "23.5")
relay.add_sensor("humidity", "65")
relay.add_sensor("custom_sensor", "some_value")
```

## System Statistics

The client automatically reports these system statistics:

- **Uptime**: System uptime in seconds
- **Memory Usage**: Available and total memory
- **CPU Usage**: Current CPU usage percentage  
- **CPU Temperature**: CPU temperature (Raspberry Pi specific)

## Security

- All sensor data and system statistics are encrypted using ECDH + AES-GCM
- JWT tokens are automatically refreshed every hour
- Refresh tokens are rotated weekly to prevent long-term exposure
- Failed token operations trigger automatic re-registration
- Secure random number generation for cryptographic operations
- Server public key verification during registration

## Troubleshooting

### Token Management Issues
- Check logs for token refresh/rotation messages
- Ensure system time is accurate (tokens use UTC timestamps)
- In test mode, expect frequent token operations (every few minutes)

### Network Connectivity
- Verify internet connection and DNS resolution
- Check firewall settings for outbound HTTPS (port 443)
- Review logs for HTTP error codes and responses

### Service Mode
- Use `sudo journalctl -u junctionrelay -f` to view real-time logs
- Check service status with `sudo systemctl status junctionrelay`
- Restart service with `sudo systemctl restart junctionrelay`

This Python implementation provides the same robust, enterprise-grade token management as the ESP32 version, ensuring your Raspberry Pi devices maintain secure, reliable connectivity to JunctionRelay Cloud for extended periods without manual intervention.