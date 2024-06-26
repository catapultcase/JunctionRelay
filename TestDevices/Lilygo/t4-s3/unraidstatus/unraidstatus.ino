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

    // Draw a white rectangle border of 10 pixels
    int borderThickness = 10;
    spr.drawRect(borderThickness, borderThickness, WIDTH - 2 * borderThickness, HEIGHT - 2 * borderThickness, TFT_WHITE);

    // Calculate the number of disks dynamically
    const size_t capacity = JSON_OBJECT_SIZE(200) + 4000; // Adjust size based on expected payload
    DynamicJsonDocument doc(capacity);
    deserializeJson(doc, fullPayload);

    int numberOfSensors = doc.size();
    int numberOfDisks = numberOfSensors / 2;

    // Draw inner rectangle for bar chart area with padding
    int padding = 10;
    int chartAreaX = borderThickness + padding + 60; // Move chart further to the right to align with table
    int chartAreaY = borderThickness + padding;
    int chartAreaWidth = WIDTH - chartAreaX - borderThickness - padding;
    int chartAreaHeight = HEIGHT - 2 * borderThickness - 2 * padding - 80; // Leave space for labels and legend at the bottom
    spr.drawRect(chartAreaX, chartAreaY, chartAreaWidth, chartAreaHeight, TFT_WHITE);

    // Display the bar charts inside the inner rectangle
    spr.setTextSize(2);
    spr.setTextColor(TFT_WHITE);
    spr.setTextDatum(TC_DATUM); // Top-center datum for labels

    int barWidth = 25; // Made the bars thicker
    int bottomOffset = 40; // Space at the bottom for labels and added lines
    int maxHeight = chartAreaHeight - bottomOffset; // Adjust maxHeight to leave space for labels and top cap

    // Calculate spacing, move chart to the right for Y axis labels
    int spaceForYAxisLabels = 60;
    int spacePerGroup = (chartAreaWidth - spaceForYAxisLabels) / numberOfDisks;
    int x = chartAreaX + spaceForYAxisLabels + (spacePerGroup - (2 * barWidth)) / 2; // Initial x position inside the border

    // Draw Y axis units inside the rectangle
    int yAxisMax = 3000;
    int yAxisStep = 1000;
    spr.setTextDatum(TR_DATUM); // Top-right datum for Y axis units
    for (int i = 0; i <= yAxisMax; i += yAxisStep) {
        int y = chartAreaY + chartAreaHeight - bottomOffset - map(i, 0, yAxisMax, 0, maxHeight);
        spr.drawString(String(i), chartAreaX + spaceForYAxisLabels - 5, y);
    }

    for (int diskIndex = 1; diskIndex <= numberOfDisks; diskIndex++) {
        String readKey = "disk" + String(diskIndex) + "read";
        String writeKey = "disk" + String(diskIndex) + "write";

        int readValue = doc[readKey];
        int writeValue = doc[writeKey];

        int readBarHeight = max(1, (int)map(readValue, 0, yAxisMax, 0, maxHeight)); // Ensure at least 1px is displayed
        int writeBarHeight = max(1, (int)map(writeValue, 0, yAxisMax, 0, maxHeight)); // Ensure at least 1px is displayed

        // Draw the read bar (green) on the left
        spr.fillRect(x, chartAreaY + chartAreaHeight - bottomOffset - readBarHeight, barWidth, readBarHeight, TFT_GREEN);

        // Draw the write bar (red) on the right
        spr.fillRect(x + barWidth + 5, chartAreaY + chartAreaHeight - bottomOffset - writeBarHeight, barWidth, writeBarHeight, TFT_RED);

        // Move to the next group position
        x += spacePerGroup;
    }

    // Draw the table for disk labels, read/write values
    int tableX = borderThickness + padding; // Start position for the table sticking out to the left of the bar chart
    int tableY = chartAreaY + chartAreaHeight + 20; // Position below the chart
    int tableCellWidth = (chartAreaWidth - spaceForYAxisLabels) / numberOfDisks;

    spr.setTextDatum(TL_DATUM); // Top-left datum for table text
    x = tableX + tableCellWidth; // Start x position for the values, align with disk1

    for (int diskIndex = 1; diskIndex <= numberOfDisks; diskIndex++) {
        // Draw the disk labels
        spr.setTextColor(TFT_WHITE);
        spr.drawString("disk" + String(diskIndex), x, tableY);

        String readKey = "disk" + String(diskIndex) + "read";
        String writeKey = "disk" + String(diskIndex) + "write";

        int readValue = doc[readKey];
        int writeValue = doc[writeKey];

        // Draw the speed values
        spr.setTextColor(TFT_GREEN);
        spr.drawString(String(readValue) + " MB/s", x, tableY + 20);
        spr.setTextColor(TFT_RED);
        spr.drawString(String(writeValue) + " MB/s", x, tableY + 40);

        // Move to the next table cell position
        x += tableCellWidth;
    }

    // Draw the legend at the bottom left
    spr.setTextColor(TFT_GREEN);
    spr.drawString("Read", tableX, tableY + 20);
    spr.setTextColor(TFT_RED);
    spr.drawString("Write", tableX, tableY + 40);

    // Push to display
    amoled.pushColors(0, 0, WIDTH, HEIGHT, (uint16_t *)spr.getPointer());

    // Delay for screen refresh
    delay(500);
}
