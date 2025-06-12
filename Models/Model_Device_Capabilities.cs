/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

using Newtonsoft.Json;

public class Model_Device_Capabilities
{
    public bool HasOnboardScreen { get; set; }
    public bool HasOnboardLED { get; set; }
    public bool HasOnboardRGBLED { get; set; }
    public bool HasExternalNeopixels { get; set; }
    public bool HasExternalMatrix { get; set; }
    public bool HasExternalI2CDevices { get; set; }
    public bool HasButtons { get; set; }
    public bool HasBattery { get; set; }
    public bool SupportsWiFi { get; set; }
    public bool SupportsBLE { get; set; }
    public bool SupportsUSB { get; set; }
    public bool SupportsHTTP { get; set; }
    public bool SupportsESPNow { get; set; }
    public bool SupportsMQTT { get; set; }
    public bool SupportsWebSockets { get; set; }
    public bool HasSpeaker { get; set; }
    public bool HasMicroSD { get; set; }

    [JsonProperty("i2cDevices")]
    public List<I2CDevice>? I2cDevices { get; set; }  // Updated to use I2CDevice class

    [JsonProperty("IsGateway")]  // Added IsGateway property
    public bool IsGateway { get; set; }  // Indicates whether the device is a gateway

    // Added Screens property to handle screens defined in the capabilities
    [JsonProperty("Screens")]
    public List<Screen> Screens { get; set; } = new List<Screen>();  // List of screens
}

// I2C Device model to capture device details and its endpoints
public class I2CDevice
{
    [JsonProperty("I2CAddress")]
    public string I2CAddress { get; set; } = string.Empty;

    [JsonProperty("DeviceType")]
    public string DeviceType { get; set; } = string.Empty;

    [JsonProperty("CommunicationProtocol")]
    public string CommunicationProtocol { get; set; } = "I2C";  // Default is I2C, but can be changed

    [JsonProperty("IsEnabled")]
    public bool IsEnabled { get; set; }

    [JsonProperty("Endpoints")]
    public List<Endpoint> Endpoints { get; set; } = new List<Endpoint>();  // A list of endpoints for this device
}

// Endpoint model to represent each endpoint related to an I2C device
public class Endpoint
{
    [JsonProperty("EndpointType")]
    public string EndpointType { get; set; } = string.Empty;  // E.g., "Button", "Encoder"

    [JsonProperty("Address")]
    public string Address { get; set; } = string.Empty;  // MQTT topic address

    [JsonProperty("QoS")]
    public int QoS { get; set; }  // Quality of Service (QoS) level for MQTT

    [JsonProperty("Notes")]
    public string? Notes { get; set; }  // Optional notes for the endpoint
}

// Screen model to represent each screen listed in the device capabilities
public class Screen
{
    [JsonProperty("ScreenKey")]
    public string ScreenKey { get; set; } = string.Empty;

    [JsonProperty("DisplayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonProperty("ScreenType")]
    public string ScreenType { get; set; } = string.Empty;

    [JsonProperty("SupportsConfigPayloads")]
    public bool SupportsConfigPayloads { get; set; }

    [JsonProperty("SupportsSensorPayloads")]
    public bool SupportsSensorPayloads { get; set; }
}
