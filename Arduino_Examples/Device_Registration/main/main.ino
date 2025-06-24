#include <WiFi.h>
#include "JunctionRelay.h"

// UPDATE THESE
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* DEVICE_NAME = "ESP32_Template";
const char* REGISTRATION_TOKEN = ""; // Leave empty for Serial input

JunctionRelay relay(DEVICE_NAME);

void setup() {
  Serial.begin(115200);
  
  // Connect WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  
  // Initialize JunctionRelay
  relay.begin();
  if (strlen(REGISTRATION_TOKEN) > 0) {
    relay.setToken(REGISTRATION_TOKEN);
  }
  
  // Your setup code here
}

void loop() {
  relay.handle();
  
  // Your code here
  // relay.addSensor("temp", "25.3");
  
  delay(100);
}