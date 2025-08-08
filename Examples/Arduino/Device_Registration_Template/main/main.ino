#include <WiFi.h>
#include "JunctionRelay.h"

// UPDATE THESE
const char* WIFI_SSID = "Jon6";
const char* WIFI_PASSWORD = "fv4!F48P8&tR";
//const char* WIFI_SSID = "YOUR_WIFI_SSID";
//const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// OPTIONAL: Paste registration token from cloud dashboard
const char* REGISTRATION_TOKEN = "";

// OPTIONAL: Set custom cloud base URL (defaults to https://api.junctionrelay.com)
// const char* CLOUD_BASE_URL = "https://your-backend.com";

JunctionRelay relay;

void setup() {
  Serial.begin(115200);
  Serial.println("🚀 JunctionRelay ESP32 Starting...");
  
  // Connect to WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("📡 Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("✅ WiFi connected!");
  Serial.println("📍 IP: " + WiFi.localIP().toString());
  
  // OPTIONAL: Set custom cloud base URL
  // relay.setCloudBaseUrl(CLOUD_BASE_URL);
  
  // Initialize JunctionRelay (automatically handles token refresh)
  relay.begin();
  
  // Auto-setup if token provided
  if (strlen(REGISTRATION_TOKEN) > 0) {
    Serial.println("🔧 Using provided registration token");
    relay.setToken(REGISTRATION_TOKEN);
  }
  
  Serial.println("📊 Device ready");
}

void loop() {
  // The relay.handle() now automatically manages token refresh
  relay.handle();
  
  // Add sensor readings every 30 seconds
  static unsigned long lastSensor = 0;
  if (millis() - lastSensor > 30000) {
    relay.addSensor("temperature", String(random(200, 300) / 10.0, 1));
    relay.addSensor("humidity", String(random(40, 80)));
    relay.addSensor("status", "online");
    lastSensor = millis();
  }
  
  delay(100);
}