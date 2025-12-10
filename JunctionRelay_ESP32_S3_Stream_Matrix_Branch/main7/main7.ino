// ===================================================================
// MJPEG STREAMING POC FOR ESP32-S3 MATRIX (64x32)
// Using JPEGDEC library for hardware-accelerated decoding
// ===================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <JPEGDEC.h>
#include <Adafruit_Protomatter.h>

// ===== HARDCODED CONFIG - CHANGE THESE =====
const char* WIFI_SSID = "Jon6";
const char* WIFI_PASS = "fv4!F48P8&tR";
const char* STREAM_URL = "http://10.168.1.92:60024/stream";

// ===== MATRIX CONFIG =====
#define MATRIX_WIDTH 64
#define MATRIX_HEIGHT 32
#define SWAP_BLUE_GREEN true  // Set to true for panels that need B/G swap

// Use existing pin definitions from Device.cpp
extern uint8_t rgbPins[];
extern uint8_t addrPins[];
extern uint8_t clockPin;
extern uint8_t latchPin;
extern uint8_t oePin;

Adafruit_Protomatter matrix(
  MATRIX_WIDTH, 4, 1, rgbPins, 4, addrPins, clockPin, latchPin, oePin, false
);

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
#if SWAP_BLUE_GREEN
  // Swap blue and green channels for panels that need it
  uint16_t* pixels = pDraw->pPixels;
  int totalPixels = pDraw->iWidth * pDraw->iHeight;

  for (int i = 0; i < totalPixels; i++) {
    uint16_t pixel = pixels[i];

    // Extract RGB565 components
    uint16_t r = (pixel >> 11) & 0x1F;  // 5 bits red
    uint16_t g = (pixel >> 5) & 0x3F;   // 6 bits green
    uint16_t b = pixel & 0x1F;          // 5 bits blue

    // Swap blue and green (scale to fit bit widths)
    uint16_t new_g = (b << 1) | (b >> 4);  // 5-bit blue → 6-bit green position
    uint16_t new_b = g >> 1;                // 6-bit green → 5-bit blue position

    // Repack as RGB565
    pixels[i] = (r << 11) | (new_g << 5) | new_b;
  }
#endif

  // Draw RGB565 data to matrix
  matrix.drawRGBBitmap(pDraw->x, pDraw->y, pDraw->pPixels, pDraw->iWidth, pDraw->iHeight);
  return 1; // Continue
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println("\n\n===================================");
  Serial.println("MJPEG STREAMING POC - ESP32-S3");
  Serial.println("Hardware-accelerated JPEG decode");
  Serial.println("===================================\n");

  // Allocate JPEG buffer in PSRAM
  jpegBufferSize = 150 * 1024;
  jpegBuffer = (uint8_t*)ps_malloc(jpegBufferSize);
  if (!jpegBuffer) {
    Serial.println("ERROR: Failed to allocate JPEG buffer!");
    while(1) delay(1000);
  }
  Serial.printf("Allocated %d KB for JPEG\n", jpegBufferSize/1024);

  // Initialize matrix
  Serial.println("Initializing matrix...");
  ProtomatterStatus status = matrix.begin();
  if (status != PROTOMATTER_OK) {
    Serial.printf("ERROR: Matrix init failed: %d\n", status);
    while(1) delay(1000);
  }
  matrix.fillScreen(0);
  matrix.show();
  Serial.println("Matrix ready!");

  // Connect WiFi
  Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int dots = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (++dots > 40) {
      Serial.println("\nERROR: WiFi connection timeout!");
      while(1) delay(1000);
    }
  }

  Serial.printf("\nWiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("Connecting to stream: %s\n\n", STREAM_URL);

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
    delay(5000);
    return;
  }

  Serial.println("Connected to stream! Receiving frames...\n");
  stream = http.getStreamPtr();

  // MJPEG parsing variables
  size_t jpegSize = 0;
  bool inJpeg = false;
  uint8_t lastByte = 0;

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
            matrix.show();
            decodeTime += millis() - decStart;
          }
          jpeg.close();
        }

        frameCount++;
        totalBytes += jpegSize;

        // Print stats every 30 frames
        if (frameCount % 30 == 0) {
          unsigned long now = millis();
          float elapsed = (now - lastStatTime) / 1000.0;
          float fps = 30.0 / elapsed;
          float avgSize = jpegSize / 1024.0;
          float avgDecode = decodeTime / 30.0;

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
        inJpeg = false;
        jpegSize = 0;
      }
    }

    lastByte = c;
  }

  Serial.println("\nStream disconnected! Reconnecting...");
  http.end();
  delay(1000);
}
