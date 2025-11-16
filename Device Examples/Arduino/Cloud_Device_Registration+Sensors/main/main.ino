#include <WiFi.h>
#include "JunctionRelay.h"

// UPDATE THESE
const char* WIFI_SSID = "";
const char* WIFI_PASSWORD = "";

// OPTIONAL: Paste registration token from cloud dashboard
const char* REGISTRATION_TOKEN = "";

JunctionRelay junctionrelay;

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
    
  // Initialize JunctionRelay (automatically handles token refresh)
  junctionrelay.begin();
  
  // Auto-setup if token provided
  if (strlen(REGISTRATION_TOKEN) > 0) {
    Serial.println("🔧 Using provided registration token");
    junctionrelay.setToken(REGISTRATION_TOKEN);
  }
  
  Serial.println("📊 Device ready");
}

void loop() {
  // The junctionrelay.handle() automatically manages token refresh
  junctionrelay.handle();
  
  // Add demo sensor readings every 30 seconds
  static unsigned long lastSensor = 0;
  if (millis() - lastSensor > 30000) {
    junctionrelay.addSensor("temperature", String(random(200, 300) / 10.0, 1));
    junctionrelay.addSensor("humidity", String(random(40, 80)));
    junctionrelay.addSensor("status", "online");
    lastSensor = millis();
  }
  
  delay(100);
}