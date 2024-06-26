#include <Arduino.h>
#include <LilyGo_AMOLED.h>
#include <TFT_eSPI.h>
#include <ArduinoJson.h> // Include ArduinoJson library

TFT_eSPI tft = TFT_eSPI();
TFT_eSprite spr = TFT_eSprite(&tft);
LilyGo_Class amoled;

#define WIDTH  amoled.width()
#define HEIGHT amoled.height()

bool serialActive = false; // Flag to indicate if serial connection is active or not
String fullPayload = ""; // String to store the full payload

void setup() {
    Serial.begin(9600);

    if (!amoled.begin()) {
        while (1) {
            Serial.println("There is a problem with the device!~");
            delay(1000);
        }
    }

    spr.createSprite(WIDTH, HEIGHT);
    spr.setSwapBytes(1);
}

void loop() {
    static String jsonBuffer = "";
    
    while (Serial.available() > 0) {
        char incomingByte = Serial.read();
        
        // Accumulate bytes until the end of JSON data
        if (incomingByte == '}') {
            jsonBuffer += incomingByte;
            
            // Parse JSON data
            const size_t capacity = JSON_OBJECT_SIZE(200) + 4000; // Adjust size based on expected payload
            DynamicJsonDocument doc(capacity);
            DeserializationError error = deserializeJson(doc, jsonBuffer);
            
            if (error) {
                Serial.print("deserializeJson() failed: ");
                Serial.println(error.c_str());
                jsonBuffer = "";
                continue;
            }

            // Store the full payload
            fullPayload = "";
            serializeJsonPretty(doc, fullPayload);

            // Reset the JSON buffer
            jsonBuffer = "";

            serialActive = true;
        } else {
            // Append byte to the JSON buffer
            jsonBuffer += incomingByte;
        }
    }

    if (!serialActive) {
        // If serial connection is not active, display initial text
        spr.fillScreen(TFT_BLACK);
        spr.setTextSize(3);
        spr.setTextColor(TFT_YELLOW);
        spr.setTextDatum(MC_DATUM); // Center text horizontally and vertically
        spr.drawString("CATAPULTCASE", WIDTH / 2, HEIGHT / 2 - 20);
        amoled.pushColors(0, 0, WIDTH, HEIGHT, (uint16_t *)spr.getPointer());
        delay(100); // Delay for screen refresh
        return; // Exit loop early
    }

    // Clear the screen
    spr.fillSprite(TFT_BLACK);

    // Display the full payload line by line
    spr.setTextSize(2);
    spr.setTextColor(TFT_WHITE);
    spr.setTextDatum(TL_DATUM); // Top-left datum

    int y = 0;
    const size_t capacity = JSON_OBJECT_SIZE(200) + 4000; // Adjust size based on expected payload
    DynamicJsonDocument doc(capacity);
    deserializeJson(doc, fullPayload);

    for (JsonPair kv : doc.as<JsonObject>()) {
        String line = String(kv.key().c_str()) + ": " + String(kv.value().as<String>());
        if (y >= HEIGHT - 20) { // If the text exceeds the screen height
            spr.fillSprite(TFT_BLACK); // Clear screen
            y = 0; // Reset y position
        }
        spr.drawString(line, 0, y);
        y += 20; // Move to the next line
    }

    // Push to display
    amoled.pushColors(0, 0, WIDTH, HEIGHT, (uint16_t *)spr.getPointer());

    // Delay for screen refresh
    delay(500);
}
