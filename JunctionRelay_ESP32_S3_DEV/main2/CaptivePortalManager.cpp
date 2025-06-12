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
    String html = R"(
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1'>
    <title>Junction Relay Setup</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 500px; 
            margin: 50px auto; 
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { 
            color: #333; 
            text-align: center;
            margin-bottom: 10px;
        }
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .mode-section {
            margin: 20px 0;
            padding: 15px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            transition: border-color 0.3s;
        }
        .mode-section:hover {
            border-color: #007bff;
        }
        .mode-section.selected {
            border-color: #007bff;
            background-color: #f8f9ff;
        }
        .mode-title {
            font-weight: bold;
            margin-bottom: 5px;
            color: #333;
        }
        .mode-description {
            font-size: 12px;
            color: #666;
            margin-bottom: 10px;
        }
        input[type='radio'] {
            margin-right: 10px;
        }
        input[type='text'], input[type='password'] {
            width: 100%;
            padding: 8px;
            margin: 5px 0;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        .wifi-config {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #eee;
        }
        .mqtt-config {
            margin-top: 15px;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 5px;
            border: 1px solid #dee2e6;
        }
        .advanced-toggle {
            background: none;
            border: none;
            color: #007bff;
            cursor: pointer;
            font-size: 14px;
            margin-top: 20px;
            text-decoration: underline;
        }
        .advanced-toggle:hover {
            color: #0056b3;
        }
        .submit-btn {
            background-color: #007bff;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            width: 100%;
            margin-top: 20px;
        }
        .submit-btn:hover {
            background-color: #0056b3;
        }
        .hidden {
            display: none;
        }
        small {
            color: #666;
            font-size: 11px;
        }
    </style>
</head>
<body>
    <div class='container'>
        <h1>🔗 Junction Relay Setup</h1>
        <div class='subtitle'>Device: <strong>)" + apSSID + R"(</strong><br>
        Setup IP: )" + apIP + R"(</div>
        
        <form action='/select' method='POST'>
            <!-- Backend Port -->
            <label><strong>Backend Port:</strong></label>
            <input type='text' name='backend_port' placeholder='7180' style='margin-bottom: 20px;'>
            <small>If your backend runs on a different port, enter it here. Default is <strong>7180</strong>.</small>
            <hr style='margin: 20px 0;'>

            <!-- WiFi Mode -->
            <div class='mode-section' id='wifi-section'>
                <div class='mode-title'>
                    <input type='radio' name='mode' value='wifi' id='wifi-radio' checked>
                    <label for='wifi-radio'>📶 Connect via WiFi</label>
                </div>
                <div class='mode-description'>
                    Connect to your WiFi network. Uses WebSocket for fast communication with HTTP fallback.
                </div>
                <div class='wifi-config' id='wifi-config'>
                    <label>Network Name (SSID):</label>
                    <input type='text' name='ssid' placeholder='Your WiFi network name'>
                    <label>Password:</label>
                    <input type='password' name='pass' placeholder='WiFi password'>
                </div>
            </div>

            <!-- Ethernet Mode -->
            <div class='mode-section' id='ethernet-section'>
                <div class='mode-title'>
                    <input type='radio' name='mode' value='ethernet' id='ethernet-radio'>
                    <label for='ethernet-radio'>🔌 Connect via Ethernet</label>
                </div>
                <div class='mode-description'>
                    Wired network connection with DHCP. Uses WebSocket for fast communication with HTTP fallback.
                </div>
                <div class='wifi-config hidden' id='ethernet-config'>
                    <small>💡 Ethernet uses DHCP for automatic IP configuration. No setup required!</small><br><br>
                    <label>WiFi SSID (Optional Backup):</label>
                    <input type='text' name='ssid' placeholder='Backup WiFi network'>
                    <label>WiFi Password (Optional):</label>
                    <input type='password' name='pass' placeholder='Backup WiFi password'>
                </div>
            </div>

            <!-- ESP-NOW Mode -->
            <div class='mode-section' id='espnow-section'>
                <div class='mode-title'>
                    <input type='radio' name='mode' value='espnow' id='espnow-radio'>
                    <label for='espnow-radio'>📡 Use ESP-NOW</label>
                </div>
                <div class='mode-description'>
                    Direct peer-to-peer communication without network infrastructure. Requires another ESP-NOW device or gateway.
                </div>
            </div>

            <!-- Gateway Mode -->
            <div class='mode-section' id='gateway-section'>
                <div class='mode-title'>
                    <input type='radio' name='mode' value='gateway' id='gateway-radio'>
                    <label for='gateway-radio'>🌐 Gateway Mode</label>
                </div>
                <div class='mode-description'>
                    Bridges ESP-NOW devices to network infrastructure. Combines Ethernet + ESP-NOW for forwarding data.
                </div>
                <div class='wifi-config hidden' id='gateway-config'>
                    <small>Note: Gateway uses Ethernet for network connectivity and ESP-NOW for device bridging.</small><br><br>
                    <label>WiFi SSID (Optional Backup):</label>
                    <input type='text' name='ssid' placeholder='Backup WiFi network'>
                    <label>WiFi Password (Optional):</label>
                    <input type='password' name='pass' placeholder='Backup WiFi password'>
                </div>
            </div>

            <!-- Advanced Settings -->
            <button type='button' class='advanced-toggle' onclick='toggleAdvanced()'>
                ⚙️ Advanced Settings (Optional)
            </button>
            
            <div class='mqtt-config hidden' id='advanced-config'>
                <div style='font-weight: bold; margin-bottom: 10px;'>📬 MQTT Integration (Optional)</div>
                <div style='margin-bottom: 15px;'>
                    <small>Connect to an MQTT broker for additional integrations (Home Assistant, Node-RED, etc.)</small>
                </div>
                
                <label>MQTT Broker:</label>
                <input type='text' name='mqtt_broker' placeholder='192.168.1.100:1883 or mqtt.server.com'>
                
                <label>Username (Optional):</label>
                <input type='text' name='mqtt_user' placeholder='MQTT username'>
                
                <label>Password (Optional):</label>
                <input type='password' name='mqtt_pass' placeholder='MQTT password'>
                
                <div style='margin-top: 10px;'>
                    <small>💡 MQTT runs alongside your primary connection and is completely optional.</small>
                </div>
            </div>

            <input type='submit' value='Save & Connect' class='submit-btn'>
        </form>
    </div>

    <script>
        function updateModeSelection() {
            // Remove selected class from all sections
            document.querySelectorAll('.mode-section').forEach(section => {
                section.classList.remove('selected');
            });
            
            // Hide all config sections
            document.getElementById('wifi-config').style.display = 'none';
            document.getElementById('ethernet-config').style.display = 'none';
            document.getElementById('gateway-config').style.display = 'none';
            
            // Show config for selected mode
            const selectedMode = document.querySelector('input[name="mode"]:checked').value;
            const selectedSection = document.getElementById(selectedMode + '-section');
            if (selectedSection) {
                selectedSection.classList.add('selected');
            }
            
            if (selectedMode === 'wifi') {
                document.getElementById('wifi-config').style.display = 'block';
            } else if (selectedMode === 'ethernet') {
                document.getElementById('ethernet-config').style.display = 'block';
            } else if (selectedMode === 'gateway') {
                document.getElementById('gateway-config').style.display = 'block';
            }
        }

        function toggleAdvanced() {
            const advancedConfig = document.getElementById('advanced-config');
            const button = document.querySelector('.advanced-toggle');
            
            if (advancedConfig.classList.contains('hidden')) {
                advancedConfig.classList.remove('hidden');
                button.textContent = '⚙️ Hide Advanced Settings';
            } else {
                advancedConfig.classList.add('hidden');
                button.textContent = '⚙️ Advanced Settings (Optional)';
            }
        }

        // Set up event listeners
        document.querySelectorAll('input[name="mode"]').forEach(radio => {
            radio.addEventListener('change', updateModeSelection);
        });

        // Initialize the display
        updateModeSelection();
    </script>
</body>
</html>
)";

    request->send(200, "text/html", html);
}

void CaptivePortalManager::handleFormSubmission(AsyncWebServerRequest *request) {
    String mode = "";
    String ssid = "";
    String pass = "";
    String mqttBroker = "";
    String mqttUser = "";
    String mqttPass = "";
    String backendPort = "";  // New field

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
    if (request->hasParam("mqtt_broker", true)) {
        mqttBroker = request->getParam("mqtt_broker", true)->value();
    }
    if (request->hasParam("mqtt_user", true)) {
        mqttUser = request->getParam("mqtt_user", true)->value();
    }
    if (request->hasParam("mqtt_pass", true)) {
        mqttPass = request->getParam("mqtt_pass", true)->value();
    }
    if (request->hasParam("backend_port", true)) {
        backendPort = request->getParam("backend_port", true)->value();
    }

    // Print the submitted data for debugging
    Serial.println("[DEBUG] Form submitted:");
    Serial.print("Mode: ");
    Serial.println(mode);
    Serial.print("SSID: ");
    Serial.println(ssid);
    Serial.print("Password: ");
    Serial.println(pass.isEmpty() ? "(empty)" : "(provided)");
    Serial.print("MQTT Broker: ");
    Serial.println(mqttBroker);
    Serial.print("MQTT User: ");
    Serial.println(mqttUser);
    Serial.print("MQTT Pass: ");
    Serial.println(mqttPass.isEmpty() ? "(empty)" : "(provided)");
    Serial.print("Backend Port: ");
    Serial.println(backendPort.isEmpty() ? "(default: 7180)" : backendPort);

    // Save the configuration
    Preferences prefs;
    prefs.begin("connConfig", false);
    prefs.putString("connMode", mode);
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    prefs.putString("mqttBroker", mqttBroker);
    prefs.putString("mqttUsername", mqttUser);
    prefs.putString("mqttPassword", mqttPass);
    int backendPortInt = backendPort.toInt();
        if (backendPortInt <= 0 || backendPortInt > 65535) {
            backendPortInt = 7180;
        }
        prefs.putInt("backendPort", backendPortInt);
    prefs.end();

    // Generate appropriate response based on mode
    String modeDescription;
    String nextSteps;
    if (mode == "wifi") {
        modeDescription = "WiFi Connection";
        nextSteps = "Device will connect to your WiFi network and use WebSocket/HTTP for communication.";
    } else if (mode == "ethernet") {
        modeDescription = "Ethernet Connection";
        nextSteps = "Device will use wired Ethernet connection and use WebSocket/HTTP for communication.";
    } else if (mode == "espnow") {
        modeDescription = "ESP-NOW Mode";
        nextSteps = "Device will use ESP-NOW for peer-to-peer communication. Make sure you have a compatible gateway device.";
    } else if (mode == "gateway") {
        modeDescription = "Gateway Mode";
        nextSteps = "Device will use Ethernet as primary connection and ESP-NOW for bridging other devices.";
    } else {
        modeDescription = "Unknown Mode";
        nextSteps = "Please contact support if you see this message.";
    }

    String response = R"(
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1'>
    <title>Settings Saved - JunctionRelay</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 500px; 
            margin: 50px auto; 
            padding: 20px;
            background-color: #f5f5f5;
            text-align: center;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .success-icon {
            font-size: 48px;
            margin-bottom: 20px;
        }
        h1 { 
            color: #28a745; 
            margin-bottom: 10px;
        }
        .mode-info {
            background-color: #e7f3ff;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            border-left: 4px solid #007bff;
        }
        .countdown {
            font-size: 18px;
            font-weight: bold;
            color: #007bff;
            margin: 20px 0;
        }
        .progress-bar {
            width: 100%;
            height: 10px;
            background-color: #e0e0e0;
            border-radius: 5px;
            overflow: hidden;
            margin: 20px 0;
        }
        .progress-fill {
            height: 100%;
            background-color: #007bff;
            width: 0%;
            transition: width 0.1s linear;
        }
    </style>
</head>
<body>
    <div class='container'>
        <div class='success-icon'>✅</div>
        <h1>Settings Saved Successfully!</h1>
        
        <div class='mode-info'>
            <strong>Selected Mode:</strong> )" + modeDescription + R"(<br>
            )" + nextSteps + R"(
        </div>
        
        <div class='countdown' id='countdown'>Restarting in 5 seconds...</div>
        <div class='progress-bar'>
            <div class='progress-fill' id='progress'></div>
        </div>
        
        <p><small>The device will automatically restart and apply your settings.</small></p>
    </div>

    <script>
        let countdown = 5;
        const countdownElement = document.getElementById('countdown');
        const progressElement = document.getElementById('progress');
        
        function updateCountdown() {
            countdownElement.textContent = `Restarting in ${countdown} seconds...`;
            progressElement.style.width = ((5 - countdown) / 5 * 100) + '%';
            
            if (countdown <= 0) {
                countdownElement.textContent = 'Restarting now...';
                progressElement.style.width = '100%';
            } else {
                countdown--;
                setTimeout(updateCountdown, 1000);
            }
        }
        
        updateCountdown();
    </script>
</body>
</html>
)";

    request->send(200, "text/html", response);

    // Restart the device after saving the settings
    delay(5000);  // 5 second delay to show the confirmation message
    ESP.restart(); // Reboot the device to apply new settings
}
