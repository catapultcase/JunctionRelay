#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>

// Define the Cloud Backend API URLs for new registration flow
#define REGISTER_AND_EXCHANGE_URL "https://api.junctionrelay.com/cloud/devices/register-and-exchange"
#define HEALTH_REPORT_URL "https://api.junctionrelay.com/cloud/devices/health"
#define REFRESH_TOKEN_URL "https://api.junctionrelay.com/cloud/devices/refresh"

// Wi-Fi credentials
const char *ssid = "YOUR_WIFI_SSID";  
const char *password = "YOUR_WIFI_PASSWORD";

// Device configuration
String deviceId = "";      // Will be generated from MAC address
String deviceName = "ESP32_IoT_Device";
String deviceType = "ESP32";

// Registration and authentication
String registrationToken = "";
String deviceJwt = "";
String refreshToken = "";
unsigned long tokenExpiresAt = 0;
bool isRefreshing = false;

// Create an instance of Preferences for storing tokens
Preferences prefs;

void setup() {
  Serial.begin(115200);

  // Generate unique device ID from MAC address
  generateDeviceId();

  // Start the Preferences library to store tokens securely
  prefs.begin("device_config", false);

  // Check if we already have stored tokens
  deviceJwt = prefs.getString("deviceJwt", "");
  refreshToken = prefs.getString("refreshToken", "");

  if (deviceJwt.length() > 0 && refreshToken.length() > 0) {
    Serial.println("Found stored device tokens. Attempting to use existing registration...");
    connectToWiFi();
    // Skip registration and go straight to health reporting
    startHealthReporting();
  } else {
    Serial.println("No stored tokens found. Starting device registration process...");
    connectToWiFi();
    startRegistrationProcess();
  }
}

void loop() {
  // Check for serial commands
  handleSerialCommands();
  
  // Main loop is handled by startHealthReporting() or registration process
  delay(1000);
}

// Generate unique device ID from MAC address
void generateDeviceId() {
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  deviceId = "ESP32_" + mac;
  Serial.println("Device ID: " + deviceId);
}

// Function to connect to Wi-Fi
void connectToWiFi() {
  WiFi.begin(ssid, password);
  Serial.println("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi");
  Serial.println("IP address: " + WiFi.localIP().toString());
}

// Start the device registration process
void startRegistrationProcess() {
  Serial.println("\n=== DEVICE REGISTRATION PROCESS ===");
  Serial.println("This device needs to be registered with your JunctionRelay account.");
  Serial.println("\nSteps to register this device:");
  Serial.println("1. Open your JunctionRelay Cloud Dashboard");
  Serial.println("2. Generate a registration token");
  Serial.println("3. Enter the token below");
  Serial.println("\nWaiting for registration token...");
  
  waitForRegistrationToken();
}

// Wait for user to input the registration token
void waitForRegistrationToken() {
  Serial.println("\nEnter your registration token from the dashboard:");
  
  while (Serial.available() == 0) {
    delay(100);  // Wait for user input
  }
  
  registrationToken = Serial.readString();
  registrationToken.trim();  // Remove whitespace
  
  if (registrationToken.length() == 0) {
    Serial.println("Invalid token. Please try again.");
    waitForRegistrationToken();
    return;
  }
  
  Serial.println("Token received: " + registrationToken);
  Serial.println("Attempting device registration...");
  
  registerDeviceAndExchange();
}

// Register device and exchange token for device JWT
void registerDeviceAndExchange() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Cannot register device.");
    return;
  }

  HTTPClient http;
  http.begin(REGISTER_AND_EXCHANGE_URL);
  http.addHeader("Content-Type", "application/json");

  // Create JSON payload
  DynamicJsonDocument doc(1024);
  doc["registrationToken"] = registrationToken;
  doc["deviceId"] = deviceId;
  doc["deviceName"] = deviceName;
  doc["deviceType"] = deviceType;

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.println("Sending registration request...");
  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode == 200) {
    String response = http.getString();
    Serial.println("Registration successful!");
    
    // Parse JSON response
    DynamicJsonDocument responseDoc(2048);
    deserializeJson(responseDoc, response);
    
    if (responseDoc["success"]) {
      deviceJwt = responseDoc["deviceJwt"].as<String>();
      refreshToken = responseDoc["refreshToken"].as<String>();
      
      // Store tokens securely
      prefs.putString("deviceJwt", deviceJwt);
      prefs.putString("refreshToken", refreshToken);
      
      Serial.println("Device registered successfully!");
      Serial.println("Status: Awaiting user confirmation in dashboard");
      Serial.println("Device can now send health reports while pending approval");
      
      // Start health reporting
      startHealthReporting();
    } else {
      Serial.println("Registration failed: " + responseDoc["error"].as<String>());
      // Retry registration
      delay(5000);
      startRegistrationProcess();
    }
  } else {
    Serial.println("Registration failed. HTTP Response Code: " + String(httpResponseCode));
    String errorResponse = http.getString();
    Serial.println("Error: " + errorResponse);
    
    // Retry registration after delay
    delay(5000);
    startRegistrationProcess();
  }
  
  http.end();
}

// Function to refresh device JWT using refresh token
bool refreshDeviceToken() {
  if (refreshToken.length() == 0) {
    Serial.println("❌ No refresh token available");
    return false;
  }

  if (isRefreshing) {
    Serial.println("⏳ Token refresh already in progress");
    return false;
  }

  isRefreshing = true;
  Serial.println("🔄 Refreshing device JWT...");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected. Cannot refresh token.");
    isRefreshing = false;
    return false;
  }

  HTTPClient http;
  http.begin(REFRESH_TOKEN_URL);
  http.addHeader("Content-Type", "application/json");

  // Create JSON payload with refresh token AND device ID
  DynamicJsonDocument doc(1024);
  doc["refreshToken"] = refreshToken;
  doc["deviceId"] = deviceId;  // Add deviceId for proper JWT generation

  String requestBody;
  serializeJson(doc, requestBody);

  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode == 200) {
    String response = http.getString();
    
    // Parse JSON response
    DynamicJsonDocument responseDoc(1024);
    deserializeJson(responseDoc, response);
    
    if (responseDoc.containsKey("token")) {
      deviceJwt = responseDoc["token"].as<String>();
      
      // Store new JWT
      prefs.putString("deviceJwt", deviceJwt);
      
      Serial.println("✅ Device JWT refreshed successfully");
      isRefreshing = false;
      return true;
    } else {
      Serial.println("❌ Token refresh failed: Invalid response format");
    }
  } else if (httpResponseCode == 401) {
    Serial.println("❌ Token refresh failed: Refresh token expired or invalid");
    Serial.println("📝 Device needs re-registration");
    
    // Clear stored tokens
    clearStoredCredentials();
  } else {
    Serial.println("❌ Token refresh failed. HTTP Code: " + String(httpResponseCode));
    String errorResponse = http.getString();
    Serial.println("Error: " + errorResponse);
  }

  http.end();
  isRefreshing = false;
  return false;
}

// Function to start periodic health reporting
void startHealthReporting() {
  Serial.println("\n=== STARTING HEALTH REPORTING ===");
  Serial.println("Device will send health reports every 60 seconds");
  Serial.println("Type 'help' for available commands");
  
  unsigned long lastReportTime = millis();

  while (true) {
    unsigned long currentTime = millis();
    
    // Check for serial commands
    handleSerialCommands();
    
    if (currentTime - lastReportTime >= 60000) {  // Every minute
      sendHealthReport();
      lastReportTime = currentTime;
    }

    // Handle other device operations here
    delay(100);  // Reduced delay for more responsive serial commands
  }
}

// Function to send a health report to the backend
void sendHealthReport() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected, skipping health report.");
    return;
  }

  if (deviceJwt.length() == 0) {
    Serial.println("No device JWT available, skipping health report.");
    return;
  }

  HTTPClient http;
  http.begin(HEALTH_REPORT_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceJwt);

  // Create health report payload - let server set timestamp
  DynamicJsonDocument doc(1024);
  doc["status"] = "online";
  doc["batteryLevel"] = "N/A";
  doc["sensorData"] = getSensorData();

  String healthData;
  serializeJson(doc, healthData);

  Serial.println("Sending health data: " + healthData);

  int httpResponseCode = http.POST(healthData);

  if (httpResponseCode == 200) {
    Serial.println("✅ Health report sent successfully");
  } else if (httpResponseCode == 401) {
    Serial.println("❌ Health report failed: Unauthorized (JWT expired)");
    Serial.println("🔄 Attempting to refresh device JWT...");
    
    // Attempt to refresh token
    if (refreshDeviceToken()) {
      Serial.println("✅ JWT refreshed, retrying health report...");
      
      // Retry health report with new JWT
      http.end();
      delay(1000); // Brief delay before retry
      
      HTTPClient retryHttp;
      retryHttp.begin(HEALTH_REPORT_URL);
      retryHttp.addHeader("Content-Type", "application/json");
      retryHttp.addHeader("Authorization", "Bearer " + deviceJwt);
      
      int retryResponseCode = retryHttp.POST(healthData);
      
      if (retryResponseCode == 200) {
        Serial.println("✅ Health report sent successfully after token refresh");
      } else {
        Serial.println("❌ Health report still failed after refresh. Code: " + String(retryResponseCode));
      }
      
      retryHttp.end();
      return;
    } else {
      Serial.println("❌ Token refresh failed. Device needs re-registration.");
      Serial.println("📝 Restarting registration process...");
      
      // Clear current tokens and restart registration
      clearStoredCredentials();
      delay(2000);
      startRegistrationProcess();
      return;
    }
  } else {
    Serial.println("❌ Health report failed. HTTP Code: " + String(httpResponseCode));
    String errorResponse = http.getString();
    Serial.println("Error: " + errorResponse);
  }

  http.end();
}

// Get sensor data (customize based on your sensors)
String getSensorData() {
  // Example sensor readings - customize for your specific sensors
  DynamicJsonDocument sensors(512);
  sensors["temperature"] = "22.5C";  // Replace with actual temperature sensor
  sensors["humidity"] = "45%";       // Replace with actual humidity sensor
  sensors["uptime"] = millis() / 1000;
  sensors["freeHeap"] = ESP.getFreeHeap();
  sensors["wifiRSSI"] = WiFi.RSSI();
  
  String sensorString;
  serializeJson(sensors, sensorString);
  return sensorString;
}

// Function to clear stored credentials (for testing)
void clearStoredCredentials() {
  prefs.clear();
  deviceJwt = "";
  refreshToken = "";
  Serial.println("Stored credentials cleared.");
}

// Handle serial commands for debugging/testing
void handleSerialCommands() {
  if (Serial.available()) {
    String command = Serial.readString();
    command.trim();
    command.toLowerCase();
    
    if (command == "expire" || command == "e") {
      forceTokenExpiry();
    }
    else if (command == "clear" || command == "c") {
      clearStoredCredentials();
      Serial.println("📝 Restart device to re-register");
    }
    else if (command == "status" || command == "s") {
      showDeviceStatus();
    }
    else if (command == "health" || command == "h") {
      Serial.println("🔄 Forcing health report...");
      sendHealthReport();
    }
    else if (command == "refresh" || command == "r") {
      Serial.println("🔄 Testing token refresh...");
      if (refreshDeviceToken()) {
        Serial.println("✅ Refresh successful");
      } else {
        Serial.println("❌ Refresh failed");
      }
    }
    else if (command == "help" || command == "?") {
      showHelp();
    }
    else if (command.length() > 0) {
      Serial.println("❓ Unknown command. Type 'help' for available commands.");
    }
  }
}

// Force token expiry for testing refresh functionality
void forceTokenExpiry() {
  Serial.println("🔄 Forcing JWT expiry for testing...");
  deviceJwt = "expired_token_for_testing";
  prefs.putString("deviceJwt", deviceJwt);
  Serial.println("✅ Device JWT set to invalid token");
  Serial.println("📡 Next health report will trigger refresh flow");
}

// Show current device status
void showDeviceStatus() {
  Serial.println("\n=== DEVICE STATUS ===");
  Serial.println("Device ID: " + deviceId);
  Serial.println("Device Name: " + deviceName);
  Serial.println("WiFi Status: " + String(WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected"));
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("IP Address: " + WiFi.localIP().toString());
    Serial.println("WiFi RSSI: " + String(WiFi.RSSI()) + " dBm");
  }
  Serial.println("Has Device JWT: " + String(deviceJwt.length() > 0 ? "Yes" : "No"));
  Serial.println("Has Refresh Token: " + String(refreshToken.length() > 0 ? "Yes" : "No"));
  Serial.println("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  Serial.println("Uptime: " + String(millis() / 1000) + " seconds");
  Serial.println("====================\n");
}

// Show available serial commands
void showHelp() {
  Serial.println("\n=== AVAILABLE COMMANDS ===");
  Serial.println("expire (e)  - Force JWT expiry to test refresh");
  Serial.println("health (h)  - Send health report immediately");
  Serial.println("refresh (r) - Test token refresh manually");
  Serial.println("status (s)  - Show device status information");
  Serial.println("clear (c)   - Clear all stored credentials");
  Serial.println("help (?)    - Show this help message");
  Serial.println("===========================\n");
}