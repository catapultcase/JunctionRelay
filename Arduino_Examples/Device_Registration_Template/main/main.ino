#include <WiFi.h>
#include "JunctionRelay.h"

// UPDATE THESE
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// OPTIONAL: Paste registration token from cloud dashboard
const char* REGISTRATION_TOKEN = "";
// Example: {"deviceName":"Living Room Sensor","publicKey":"base64-encoded-p256-key","token":"abc123..."}

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
  
  // Initialize JunctionRelay
  relay.begin();
  
  // Auto-setup if token provided
  if (strlen(REGISTRATION_TOKEN) > 0) {
    Serial.println("🔧 Using provided registration token");
    relay.setToken(REGISTRATION_TOKEN);
  }
  
  Serial.println("📊 Device ready");
}

void loop() {
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