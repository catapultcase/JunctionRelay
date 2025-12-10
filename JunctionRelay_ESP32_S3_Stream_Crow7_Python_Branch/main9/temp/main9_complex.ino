// ===================================================================
// MJPEG STREAMING POC FOR ESP32-S3 CROWPANEL7 (800x480)
// Using JPEGDEC library for hardware-accelerated decoding
// Connects to Python sender_cdp.js for testing
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
// sender_cdp.js runs on port 5000, serves at /stream
const char* STREAM_URL = "http://10.168.1.92:5000/stream";

// ===== DISPLAY CONFIG =====
#define DISPLAY_WIDTH 800
#define DISPLAY_HEIGHT 480

// ===== GLOBALS =====
Device device(nullptr);
LovyanGFX* display = nullptr;

// ===== JPEG DECODER =====
JPEGDEC jpeg;

// ===== POINTER-BASED FRAME QUEUE (NO MEMCPY) =====
#define FRAME_QUEUE_SIZE 30  // Large queue to hold more backlog for aggressive skipping
#define BUFFER_POOL_SIZE 40  // Pool of buffers (larger than queue for safety)
#define MAX_FRAME_SIZE (100 * 1024)  // 100KB max per frame

// Buffer pool
uint8_t* bufferPool[BUFFER_POOL_SIZE];  // Pool of allocated buffers
volatile bool bufferInUse[BUFFER_POOL_SIZE];  // Track which buffers are in use

// Frame queue stores POINTERS to buffers (not data itself)
struct FrameDescriptor {
  uint8_t* buffer;  // Pointer to buffer in pool
  size_t size;
  unsigned long sequence;
};

volatile FrameDescriptor frameQueue[FRAME_QUEUE_SIZE];
volatile int writeIndex = 0;  // Next queue slot to write to
volatile unsigned long latestSequence = 0;  // Global sequence counter
volatile unsigned long lastProcessedSequence = 0;  // Last sequence Core 1 processed
SemaphoreHandle_t queueMutex;

// ===== STATS =====
unsigned long frameCount = 0;
volatile unsigned long framesSkipped = 0;
unsigned long lastStatTime = 0;
unsigned long totalBytes = 0;
unsigned long decodeTime = 0;

// Stream pointer (shared between cores)
WiFiClient* globalStream = nullptr;
HTTPClient* globalHttp = nullptr;
volatile bool streamActive = false;

// JPEGDEC draw callback - called for each MCU block
int jpegDrawCallback(JPEGDRAW *pDraw) {
  // Cast to lgfx::rgb565_t* like blit mode does
  display->pushImage(pDraw->x, pDraw->y, pDraw->iWidth, pDraw->iHeight,
                     reinterpret_cast<lgfx::rgb565_t*>(pDraw->pPixels));
  return 1; // Continue
}

// Get a free buffer from the pool
int getFreeBuffer() {
  for (int i = 0; i < BUFFER_POOL_SIZE; i++) {
    if (!bufferInUse[i]) {
      bufferInUse[i] = true;
      return i;
    }
  }

  // Debug: Count how many buffers are in use (only log once per 5 seconds to avoid spam)
  static unsigned long lastWarning = 0;
  if (millis() - lastWarning > 5000) {
    int inUseCount = 0;
    for (int i = 0; i < BUFFER_POOL_SIZE; i++) {
      if (bufferInUse[i]) inUseCount++;
    }
    Serial.printf("[CORE 0 ERROR] No free buffers! %d/%d in use\n", inUseCount, BUFFER_POOL_SIZE);
    lastWarning = millis();
  }

  return -1;  // No free buffers
}

// Release a buffer back to the pool
void releaseBuffer(uint8_t* buffer) {
  for (int i = 0; i < BUFFER_POOL_SIZE; i++) {
    if (bufferPool[i] == buffer) {
      bufferInUse[i] = false;
      return;
    }
  }
}

// CORE 0 TASK: Parse stream into pointer queue (NO MEMCPY)
void streamParserTask(void* parameter) {
  uint8_t* chunkBuffer = (uint8_t*)ps_malloc(4096);  // Read in 4KB chunks
  uint8_t* currentBuffer = nullptr;
  int currentBufferIndex = -1;
  size_t frameSize = 0;
  bool inJpeg = false;
  uint8_t lastByte = 0;

  Serial.println("[CORE 0] Stream parser started - pointer-based queue (NO MEMCPY)");

  while (streamActive) {
    // Check WiFiClient buffer size - if huge backlog, purge old data
    int available = globalStream ? globalStream->available() : 0;
    if (available > 200 * 1024) {  // More than 200KB queued = old data
      Serial.printf("[PURGE] WiFiClient has %d KB buffered - flushing old data\n", available/1024);
      // Flush half the buffer to get closer to real-time
      for (int i = 0; i < available / 2 && globalStream->available(); i++) {
        globalStream->read();
      }
      inJpeg = false;
      frameSize = 0;
      if (currentBufferIndex != -1) {
        bufferInUse[currentBufferIndex] = false;  // Release buffer
        currentBuffer = nullptr;
        currentBufferIndex = -1;
      }
      continue;
    }

    // Read in chunks instead of byte-by-byte for speed
    if (!globalStream || !globalStream->available()) {
      vTaskDelay(1);
      continue;
    }

    // Read up to 4KB at a time
    int toRead = min(available, 4096);
    int bytesRead = globalStream->readBytes(chunkBuffer, toRead);

    if (bytesRead == 0) {
      vTaskDelay(1);
      continue;
    }

    // Process chunk byte by byte
    for (int i = 0; i < bytesRead; i++) {
      uint8_t c = chunkBuffer[i];

      // Look for JPEG start (0xFF 0xD8)
      if (!inJpeg && lastByte == 0xFF && c == 0xD8) {
        // Get a buffer from the pool
        currentBufferIndex = getFreeBuffer();
        if (currentBufferIndex == -1) {
          continue;  // Skip this frame (error already logged by getFreeBuffer)
        }
        currentBuffer = bufferPool[currentBufferIndex];

        inJpeg = true;
        frameSize = 0;
        currentBuffer[frameSize++] = 0xFF;
        currentBuffer[frameSize++] = 0xD8;
      }
      // Accumulate JPEG data directly in pool buffer
      else if (inJpeg && currentBuffer) {
        currentBuffer[frameSize++] = c;

        // Look for JPEG end (0xFF 0xD9)
        if (lastByte == 0xFF && c == 0xD9) {
          // Frame complete! Put POINTER in queue (NO MEMCPY!)
          int writeSlot = writeIndex;

          xSemaphoreTake(queueMutex, portMAX_DELAY);

          // Store pointer and metadata in queue
          frameQueue[writeSlot].buffer = currentBuffer;
          frameQueue[writeSlot].size = frameSize;
          latestSequence++;
          frameQueue[writeSlot].sequence = latestSequence;

          xSemaphoreGive(queueMutex);

          // Advance write index (circular)
          writeIndex = (writeIndex + 1) % FRAME_QUEUE_SIZE;

          // Reset for next frame
          inJpeg = false;
          frameSize = 0;
          currentBuffer = nullptr;
          currentBufferIndex = -1;  // Buffer is now owned by queue
        }

        if (frameSize >= MAX_FRAME_SIZE - 10) {
          inJpeg = false;
          frameSize = 0;
          if (currentBufferIndex != -1) {
            bufferInUse[currentBufferIndex] = false;  // Release buffer
            currentBuffer = nullptr;
            currentBufferIndex = -1;
          }
        }
      }

      lastByte = c;
    }

    // Yield after processing each chunk
    vTaskDelay(1);
  }

  free(chunkBuffer);
  Serial.println("[CORE 0] Stream parser stopped");
  vTaskDelete(NULL);
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

  // Allocate buffer pool in PSRAM
  Serial.printf("Allocating %d buffers (%d KB each) in PSRAM pool...\n",
                BUFFER_POOL_SIZE, MAX_FRAME_SIZE/1024);

  for (int i = 0; i < BUFFER_POOL_SIZE; i++) {
    bufferPool[i] = (uint8_t*)ps_malloc(MAX_FRAME_SIZE);
    if (!bufferPool[i]) {
      Serial.printf("ERROR: Failed to allocate buffer %d!\n", i);
      display->fillScreen(TFT_RED);
      display->setCursor(10, 10);
      display->printf("ERROR: Buffer %d allocation failed!", i);
      while(1) delay(1000);
    }
    bufferInUse[i] = false;  // All buffers free initially
  }

  // Initialize frame queue (just descriptors, no data)
  for (int i = 0; i < FRAME_QUEUE_SIZE; i++) {
    frameQueue[i].buffer = nullptr;
    frameQueue[i].size = 0;
    frameQueue[i].sequence = 0;
  }

  Serial.printf("Allocated %d KB total buffer pool (queue is pointer-based, NO MEMCPY)\n",
                (BUFFER_POOL_SIZE * MAX_FRAME_SIZE) / 1024);

  // Create mutex for queue access
  queueMutex = xSemaphoreCreateMutex();
  if (!queueMutex) {
    Serial.println("ERROR: Failed to create mutex!");
    while(1) delay(1000);
  }

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
  static HTTPClient http;
  static bool initialized = false;

  if (!initialized) {
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
    globalStream = http.getStreamPtr();
    globalStream->setNoDelay(true);
    globalHttp = &http;

    // Start Core 0 task for stream parsing
    streamActive = true;
    xTaskCreatePinnedToCore(
      streamParserTask,   // Function
      "StreamParser",     // Name
      10000,              // Stack size
      NULL,               // Parameters
      1,                  // Priority
      NULL,               // Task handle
      0                   // Core 0
    );

    Serial.println("[CORE 1] Decoder ready");
    lastStatTime = millis();
    initialized = true;
  }

  // CORE 1: Scan ALL queue slots and find the one with highest sequence
  xSemaphoreTake(queueMutex, portMAX_DELAY);

  // Find slot with highest sequence number
  int latestSlot = -1;
  unsigned long maxSeq = lastProcessedSequence;  // Only consider frames newer than last processed
  uint8_t* frameToProcess = nullptr;
  size_t frameSize = 0;

  for (int i = 0; i < FRAME_QUEUE_SIZE; i++) {
    if (frameQueue[i].sequence > maxSeq && frameQueue[i].buffer != nullptr) {
      maxSeq = frameQueue[i].sequence;
      latestSlot = i;
    }
  }

  unsigned long latestSeq = latestSequence;  // For debug

  // AGGRESSIVE SKIP: If queue is filling up, skip even further ahead
  // Look at how far behind we are
  unsigned long queueDepth = latestSeq - maxSeq;  // How many frames in queue ahead of us

  if (queueDepth > 15) {
    // Queue is building up - we're falling behind. Skip ahead more aggressively.
    // Find a frame that's closer to the absolute latest
    unsigned long targetSeq = latestSeq - 5;  // Aim for 5 frames behind latest (not oldest in queue)

    for (int i = 0; i < FRAME_QUEUE_SIZE; i++) {
      if (frameQueue[i].sequence >= targetSeq && frameQueue[i].sequence > maxSeq && frameQueue[i].buffer != nullptr) {
        maxSeq = frameQueue[i].sequence;
        latestSlot = i;
      }
    }
  }

  // Grab the frame pointer from queue AND release all older frames
  if (latestSlot != -1) {
    frameToProcess = frameQueue[latestSlot].buffer;
    frameSize = frameQueue[latestSlot].size;
    frameQueue[latestSlot].buffer = nullptr;  // Clear slot (buffer now owned by Core 1)

    // CRITICAL: Release all skipped frames back to buffer pool
    for (int i = 0; i < FRAME_QUEUE_SIZE; i++) {
      if (i != latestSlot && frameQueue[i].buffer != nullptr && frameQueue[i].sequence < maxSeq) {
        releaseBuffer(frameQueue[i].buffer);
        frameQueue[i].buffer = nullptr;
      }
    }
  }

  xSemaphoreGive(queueMutex);

  if (frameToProcess != nullptr) {
    unsigned long currentSequence = maxSeq;

    // Track skipped frames based on sequence numbers
    if (currentSequence > lastProcessedSequence) {
      if (lastProcessedSequence > 0) {
        unsigned long skipped = currentSequence - lastProcessedSequence - 1;
        framesSkipped += skipped;
      }
      lastProcessedSequence = currentSequence;
    }
    // NOTE: We always decode latest - no blocking

    // Decode the latest frame
    unsigned long decStart = millis();
    if (jpeg.openRAM(frameToProcess, frameSize, jpegDrawCallback)) {
      if (jpeg.decode(0, 0, 0)) {
        decodeTime += millis() - decStart;
      }
      jpeg.close();
    }

    // IMPORTANT: Release buffer back to pool after decoding
    releaseBuffer(frameToProcess);

    frameCount++;
    totalBytes += frameSize;

    // Print stats every 100 frames (minimal output for performance)
    if (frameCount % 100 == 0) {
      unsigned long now = millis();
      float elapsed = (now - lastStatTime) / 1000.0;
      float fps = 100.0 / elapsed;
      float avgSize = frameSize / 1024.0;
      float avgDecode = decodeTime / 100.0;

      Serial.printf("[FRAME %lu] %.1f FPS | %.1f KB | Decode: %.1f ms | Skipped: %lu\n",
                    frameCount, fps, avgSize, avgDecode, framesSkipped);

      lastStatTime = now;
      decodeTime = 0;
    }
  }

  delay(1);  // Small delay to prevent watchdog
}
