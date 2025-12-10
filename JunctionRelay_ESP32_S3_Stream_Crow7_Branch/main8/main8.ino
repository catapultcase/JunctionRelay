// ===================================================================
// MJPEG STREAMING POC FOR ESP32-S3 CROWPANEL7 (800x480)
// Using JPEGDEC library for hardware-accelerated decoding
// ===================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <JPEGDEC.h>
#include "Device.h"

// LovyanGFX type is available through Device.h
// (Device.h includes LovyanGFX.hpp internally)

// ===== HARDCODED CONFIG - CHANGE THESE =====
const char* WIFI_SSID = "Jon6";
const char* WIFI_PASS = "fv4!F48P8&tR";
const char* STREAM_URL = "http://10.168.1.92:7180/api/junctions/16/stream";

// ===== DISPLAY CONFIG =====
#define DISPLAY_WIDTH 800
#define DISPLAY_HEIGHT 480

// ===== GLOBALS =====
Device device(nullptr);
LovyanGFX* display = nullptr;

// ===== JPEG DECODER =====
JPEGDEC jpeg;
uint8_t* jpegBuffer = nullptr;
size_t jpegBufferSize = 0;

// ===== STATS =====
unsigned long frameCount = 0;
unsigned long lastStatTime = 0;
unsigned long totalBytes = 0;
unsigned long decodeTime = 0;

// JPEGDEC draw callback - called for each MCU block
int jpegDrawCallback(JPEGDRAW *pDraw) {
  // Cast to lgfx::rgb565_t* like blit mode does
  display->pushImage(pDraw->x, pDraw->y, pDraw->iWidth, pDraw->iHeight,
                     reinterpret_cast<lgfx::rgb565_t*>(pDraw->pPixels));
  return 1; // Continue
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println("\n\n===================================");
  Serial.println("MJPEG STREAMING POC - CROWPANEL7");
  Serial.println("Hardware-accelerated JPEG decode");
  Serial.println("===================================\n");

  // Initialize device hardware
  Serial.println("Initializing CrowPanel7 hardware...");
  device.begin();

  // Get display instance (cast from void* to LovyanGFX base class)
  // Note: Display is already initialized by device.begin()
  display = static_cast<LovyanGFX*>(device.getDisplay());
  if (!display) {
    Serial.println("ERROR: Failed to get display!");
    while(1) delay(1000);
  }

  // Clear screen
  display->fillScreen(TFT_BLACK);
  display->setTextColor(TFT_WHITE);
  display->setTextSize(2);
  display->setCursor(10, 10);
  display->println("Initializing MJPEG Streaming...");

  Serial.printf("Display: %dx%d\n", display->width(), display->height());

  // Allocate JPEG buffer in PSRAM
  jpegBufferSize = 500 * 1024; // 500KB for higher resolution images
  jpegBuffer = (uint8_t*)ps_malloc(jpegBufferSize);

  if (!jpegBuffer) {
    Serial.println("ERROR: Failed to allocate JPEG buffer!");
    display->fillScreen(TFT_RED);
    display->setCursor(10, 10);
    display->println("ERROR: JPEG buffer allocation failed!");
    while(1) delay(1000);
  }

  Serial.printf("Allocated %d KB for JPEG buffer\n", jpegBufferSize/1024);
  Serial.println("Display ready!");

  // Connect WiFi
  display->fillScreen(TFT_BLACK);
  display->setCursor(10, 10);
  display->printf("Connecting to WiFi: %s", WIFI_SSID);

  Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int dots = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    display->print(".");
    if (++dots > 40) {
      Serial.println("\nERROR: WiFi connection timeout!");
      display->fillScreen(TFT_RED);
      display->setCursor(10, 10);
      display->println("ERROR: WiFi timeout!");
      while(1) delay(1000);
    }
  }

  Serial.printf("\nWiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("Connecting to stream: %s\n\n", STREAM_URL);

  display->fillScreen(TFT_BLACK);
  display->setCursor(10, 10);
  display->printf("WiFi connected!\nIP: %s\n", WiFi.localIP().toString().c_str());
  display->printf("Connecting to stream...");

  delay(2000);
  display->fillScreen(TFT_BLACK);

  lastStatTime = millis();
}

void loop() {
  HTTPClient http;
  WiFiClient* stream = nullptr;

  // Connect to MJPEG stream
  http.begin(STREAM_URL);
  int httpCode = http.GET();

  if (httpCode != HTTP_CODE_OK) {
    Serial.printf("HTTP GET failed: %d\n", httpCode);
    display->fillScreen(TFT_RED);
    display->setCursor(10, 10);
    display->printf("HTTP Error: %d", httpCode);
    delay(5000);
    return;
  }

  Serial.println("Connected to stream! Receiving frames...\n");
  stream = http.getStreamPtr();

  // MJPEG parsing variables
  size_t jpegSize = 0;
  bool inJpeg = false;
  uint8_t lastByte = 0;

  // Reset stats timing
  lastStatTime = millis();
  decodeTime = 0;

  // Stream reading loop
  while (http.connected()) {
    if (!stream->available()) {
      delay(1);
      continue;
    }

    // Read byte by byte looking for JPEG markers
    int c = stream->read();
    if (c == -1) continue;

    // Look for JPEG start (0xFF 0xD8)
    if (!inJpeg && lastByte == 0xFF && c == 0xD8) {
      // JPEG start!
      inJpeg = true;
      jpegSize = 0;
      jpegBuffer[jpegSize++] = 0xFF;
      jpegBuffer[jpegSize++] = 0xD8;
    }
    // If we're in a JPEG, accumulate data
    else if (inJpeg) {
      jpegBuffer[jpegSize++] = c;

      // Look for JPEG end (0xFF 0xD9)
      if (lastByte == 0xFF && c == 0xD9) {
        // Complete JPEG received! Decode and display
        unsigned long decStart = millis();

        if (jpeg.openRAM(jpegBuffer, jpegSize, jpegDrawCallback)) {
          if (jpeg.decode(0, 0, 0)) {
            // Frame decoded and displayed via callback
            decodeTime += millis() - decStart;
          }
          jpeg.close();
        }

        frameCount++;
        totalBytes += jpegSize;

        // Print stats every 10 frames for more frequent updates
        if (frameCount % 10 == 0) {
          unsigned long now = millis();
          float elapsed = (now - lastStatTime) / 1000.0;
          float fps = 10.0 / elapsed;
          float avgSize = jpegSize / 1024.0;
          float avgDecode = decodeTime / 10.0;

          Serial.printf("[FRAME %lu] %.1f FPS | %.1f KB | Decode: %.1f ms\n",
                        frameCount, fps, avgSize, avgDecode);

          lastStatTime = now;
          decodeTime = 0;
        }

        inJpeg = false;
        jpegSize = 0;
      }

      // Safety check
      if (jpegSize >= jpegBufferSize - 10) {
        Serial.println("WARNING: JPEG too large!");
        display->fillScreen(TFT_ORANGE);
        display->setCursor(10, 10);
        display->println("WARNING: Frame too large!");
        delay(100);
        inJpeg = false;
        jpegSize = 0;
      }
    }

    lastByte = c;
  }

  Serial.println("\nStream disconnected! Reconnecting...");
  display->fillScreen(TFT_BLUE);
  display->setCursor(10, 10);
  display->println("Stream disconnected!");
  display->println("Reconnecting...");

  http.end();
  delay(1000);
}
