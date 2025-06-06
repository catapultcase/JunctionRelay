#include "CaptivePortalManager.h"

CaptivePortalManager::CaptivePortalManager() : server(80) {}

void CaptivePortalManager::begin(const String& ssidPrefix) {
    // Use the utility function to get the correctly formatted MAC address
    String macStr = getFormattedMacAddress();  // Call the helper function

    apSSID = ssidPrefix + macStr.substring(3);  // Append the MAC address suffix to the SSID prefix (trim the leading "00:" from the MAC address)

    WiFi.softAP(apSSID.c_str());
    apIP = WiFi.softAPIP().toString();
    Serial.print("[DEBUG] AP SSID: ");
    Serial.println(apSSID);
    Serial.print("[DEBUG] AP IP address: ");
    Serial.println(apIP);

    startWebServer();
}


void CaptivePortalManager::startWebServer() {
    // Handle GET request for the main page (form page)
    server.on("/", HTTP_GET, [this](AsyncWebServerRequest *request) {
        this->handleRequest(request);
    });

    // Handle POST request for form submission (WiFi credentials or connection mode)
    server.on("/select", HTTP_POST, [this](AsyncWebServerRequest *request) {
        this->handleFormSubmission(request);
    });

    // Redirect any not-found requests back to the main captive portal page
    server.onNotFound([](AsyncWebServerRequest *request){
        request->redirect("http://192.168.4.1/");
    });

    // Start the web server
    server.begin();
    Serial.println("[DEBUG] Captive portal started successfully.");
}

void CaptivePortalManager::handleRequest(AsyncWebServerRequest *request) {
    String html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>JunctionRelay Setup</title></head><body>"
                  "<h1>JunctionRelay Setup</h1>"
                  "<p>Connect to the WiFi network: <strong>" + apSSID + 
                  "</strong> (AP IP: " + apIP + ")</p>"
                  "<p>Select connection mode:</p>"
                  "<form action='/select' method='POST'>"
                  "<input type='radio' name='mode' value='wifi' checked> Connect via WiFi<br>"
                  "<input type='radio' name='mode' value='espnow'> Use ESP-NOW<br><br>"
                  "<div id='wifiConfig'>"
                  "SSID: <input type='text' name='ssid'><br>"
                  "Password: <input type='password' name='pass'><br><br>"
                  "</div>"
                  "<input type='submit' value='Submit'>"
                  "</form>"
                  "<script>"
                  "document.querySelectorAll('input[name=\"mode\"]').forEach(function(radio){"
                  "  radio.addEventListener('change', function(){"
                  "    document.getElementById('wifiConfig').style.display = (this.value=='wifi') ? 'block' : 'none';"
                  "  });"
                  "});"
                  "</script>"
                  "</body></html>";

    request->send(200, "text/html", html);
}

void CaptivePortalManager::handleFormSubmission(AsyncWebServerRequest *request) {
    String mode = "";
    String ssid = "";
    String pass = "";

    // Retrieve the form data
    if (request->hasParam("mode", true)) {
        mode = request->getParam("mode", true)->value();
    }
    if (request->hasParam("ssid", true)) {
        ssid = request->getParam("ssid", true)->value();
    }
    if (request->hasParam("pass", true)) {
        pass = request->getParam("pass", true)->value();
    }

    // Print the submitted data for debugging
    Serial.println("[DEBUG] Form submitted:");
    Serial.print("Mode: ");
    Serial.println(mode);
    Serial.print("SSID: ");
    Serial.println(ssid);
    Serial.print("Password: ");
    Serial.println(pass);

    // Save the configuration (e.g., to Preferences or other means)
    Preferences prefs;
    prefs.begin("connConfig", false);
    prefs.putString("connMode", mode);
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    prefs.end();

    // Respond to the user with a confirmation
    String response = "<html><body><h1>Settings Saved</h1><p>The device will reboot now to apply the settings.</p></body></html>";
    request->send(200, "text/html", response);

    // Restart the device after saving the settings
    delay(3000);  // Delay to show the confirmation message
    ESP.restart(); // Reboot the device to apply new settings
}
