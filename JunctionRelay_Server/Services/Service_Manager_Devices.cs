/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * JunctionRelay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with JunctionRelay. If not, see <https://www.gnu.org/licenses/>.
 */

using JunctionRelayServer.Models;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Devices
    {
        private readonly HttpClient _httpClient;
        private readonly Service_Database_Manager_Devices _deviceDb; // Injected Service_Database_Manager_Devices

        // Modify constructor to inject _deviceDb
        public Service_Manager_Devices(HttpClient httpClient, Service_Database_Manager_Devices deviceDb)
        {
            _httpClient = httpClient;
            _deviceDb = deviceDb; // Initialize _deviceDb
        }

        public async Task<Model_Device> GetDeviceByIdAsync(int deviceId)
        {
            try
            {
                // Call the database manager to get the device by ID
                var device = await _deviceDb.GetDeviceByIdAsync(deviceId);

                if (device == null)
                {
                    throw new Exception($"Device with ID {deviceId} not found.");
                }

                return device;
            }
            catch (Exception ex)
            {
                // Handle and log the error
                throw new Exception($"Error retrieving device by ID: {ex.Message}");
            }
        }


        public async Task<Model_Device> AddDeviceFromIpAsync(string ip, string instance)
        {
            if (string.IsNullOrWhiteSpace(ip))
                throw new ArgumentException("IP address is required.");

            try
            {
                // Fetch device info and capabilities
                var infoJson = await FetchDeviceInfoJson(ip);
                var capJson = await FetchDeviceCapabilitiesJson(ip);

                Console.WriteLine($"Device Info JSON: {infoJson}");
                Console.WriteLine($"Device Capabilities JSON: {capJson}");

                var info = JsonSerializer.Deserialize<Model_Device_Info>(infoJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                var caps = JsonSerializer.Deserialize<Model_Device_Capabilities>(capJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (info == null || caps == null)
                    throw new Exception("Device info or capabilities data could not be deserialized.");

                // NEW: Fetch device preferences to get ConnMode
                string? connMode = null;
                try
                {
                    using var client = new HttpClient();
                    client.Timeout = TimeSpan.FromSeconds(5);

                    var preferencesResponse = await client.GetAsync($"http://{ip}/api/device/preferences");

                    if (preferencesResponse.IsSuccessStatusCode)
                    {
                        var preferencesContent = await preferencesResponse.Content.ReadAsStringAsync();
                        var preferences = JsonSerializer.Deserialize<JsonElement>(preferencesContent);

                        if (preferences.TryGetProperty("connMode", out var connModeElement))
                        {
                            connMode = connModeElement.GetString();
                            Console.WriteLine($"Found ConnMode: {connMode} for device at {ip}");
                        }
                    }
                    else
                    {
                        Console.WriteLine($"Warning: Could not fetch preferences from device {ip}: {preferencesResponse.StatusCode}");
                    }
                }
                catch (Exception ex)
                {
                    // Log the error but don't fail the entire operation
                    Console.WriteLine($"Warning: Could not fetch ConnMode for device {ip}: {ex.Message}");
                }

                // Create the new device object from the capabilities data
                var newDevice = new Model_Device
                {
                    Name = instance ?? "Unnamed Device",
                    Description = "",  // Add description if needed
                    Type = "Standalone",
                    Status = "Online",
                    LastUpdated = DateTime.UtcNow,
                    IPAddress = ip,
                    IsJunctionRelayDevice = !string.IsNullOrEmpty(info.FirmwareVersion) && info.FirmwareVersion.StartsWith("JunctionRelay", StringComparison.OrdinalIgnoreCase),
                    DeviceModel = info.DeviceModel ?? string.Empty,
                    DeviceManufacturer = info.DeviceManufacturer ?? string.Empty,
                    FirmwareVersion = info.FirmwareVersion ?? string.Empty,
                    HasCustomFirmware = info.CustomFirmware ?? false,
                    MCU = info.MCU ?? string.Empty,
                    WirelessConnectivity = info.WirelessConnectivity ?? string.Empty,
                    Flash = info.Flash ?? string.Empty,
                    PSRAM = info.PSRAM ?? string.Empty,
                    UniqueIdentifier = info.UniqueIdentifier ?? string.Empty,

                    // NEW: Set the ConnMode that we fetched
                    ConnMode = connMode,

                    HasOnboardScreen = caps.HasOnboardScreen,
                    HasOnboardLED = caps.HasOnboardLED,
                    HasOnboardRGBLED = caps.HasOnboardRGBLED,
                    HasExternalNeopixels = caps.HasExternalNeopixels,
                    HasExternalI2CDevices = caps.HasExternalI2CDevices,
                    HasButtons = caps.HasButtons,
                    HasBattery = caps.HasBattery,
                    SupportsWiFi = caps.SupportsWiFi,
                    SupportsHTTP = caps.SupportsHTTP,
                    SupportsESPNow = caps.SupportsESPNow,
                    SupportsBLE = caps.SupportsBLE,
                    HasSpeaker = caps.HasSpeaker,
                    HasMicroSD = caps.HasMicroSD,
                    SupportsUSB = caps.SupportsUSB,
                    SupportsMQTT = caps.SupportsMQTT,
                    SupportsWebSockets = caps.SupportsWebSockets,
                    IsGateway = caps.IsGateway
                };

                // Convert I2C devices to Model_Device_I2CDevice list
                if (caps.I2cDevices != null && caps.I2cDevices.Any())
                {
                    newDevice.I2cDevices = caps.I2cDevices.Select(i2cDevice => new Model_Device_I2CDevice
                    {
                        I2CAddress = i2cDevice.I2CAddress,
                        DeviceType = i2cDevice.DeviceType,
                        CommunicationProtocol = i2cDevice.CommunicationProtocol,
                        IsEnabled = i2cDevice.IsEnabled,
                        Endpoints = i2cDevice.Endpoints.Select(endpoint => new Model_Device_I2CDevice_Endpoint
                        {
                            EndpointType = endpoint.EndpointType,
                            Address = endpoint.Address,
                            QoS = endpoint.QoS,
                            Notes = endpoint.Notes
                        }).ToList()  // Map each endpoint to the correct type
                    }).ToList();
                }

                // Convert Screens to Model_Device_Screens list
                if (caps.Screens != null && caps.Screens.Any())
                {
                    newDevice.Screens = caps.Screens.Select(screen => new Model_Device_Screens
                    {
                        ScreenKey = screen.ScreenKey,
                        DisplayName = screen.DisplayName,
                        ScreenType = screen.ScreenType,
                        SupportsConfigPayloads = screen.SupportsConfigPayloads,
                        SupportsSensorPayloads = screen.SupportsSensorPayloads
                    }).ToList();
                }

                // Call AddDeviceAsync to handle device creation, I2C devices, and screens
                var addedDevice = await _deviceDb.AddDeviceAsync(newDevice);

                return addedDevice;
            }
            catch (Exception ex)
            {
                throw new Exception($"Error adding device from IP: {ex.Message}");
            }
        }


        public async Task<string> FetchDeviceInfoJson(string ip)
        {
            using var client = new HttpClient();
            var response = await client.GetAsync($"http://{ip}/api/device/info");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync();
        }

        // ADD this method to your Service_Manager_Devices class:

        public async Task<string> FetchDeviceInfoWithFirmwareJson(string deviceIp)
        {
            try
            {
                using var client = new HttpClient();
                client.Timeout = TimeSpan.FromSeconds(10);

                // Get both device info and firmware info
                var deviceInfoTask = client.GetAsync($"http://{deviceIp}/api/device/info");
                var firmwareInfoTask = client.GetAsync($"http://{deviceIp}/api/firmware-hash");

                await Task.WhenAll(deviceInfoTask, firmwareInfoTask);

                var deviceInfoResponse = await deviceInfoTask;
                var firmwareInfoResponse = await firmwareInfoTask;

                if (!deviceInfoResponse.IsSuccessStatusCode)
                {
                    throw new Exception($"Failed to fetch device info: {deviceInfoResponse.StatusCode}");
                }

                var deviceInfoJson = await deviceInfoResponse.Content.ReadAsStringAsync();
                var deviceInfo = JsonSerializer.Deserialize<Dictionary<string, object>>(deviceInfoJson);

                // Add null check for deviceInfo
                if (deviceInfo == null)
                {
                    throw new Exception("Failed to deserialize device info");
                }

                // Add firmware information if available
                if (firmwareInfoResponse.IsSuccessStatusCode)
                {
                    var firmwareInfoJson = await firmwareInfoResponse.Content.ReadAsStringAsync();
                    var firmwareInfo = JsonSerializer.Deserialize<Dictionary<string, object>>(firmwareInfoJson);

                    if (firmwareInfo != null)
                    {
                        // Update firmware version from device
                        if (firmwareInfo.TryGetValue("firmware_version", out var fwVersion) && fwVersion != null)
                        {
                            deviceInfo["firmwareVersion"] = fwVersion.ToString() ?? string.Empty;
                        }

                        // Add firmware hash for verification purposes
                        if (firmwareInfo.TryGetValue("firmware_hash", out var fwHash) && fwHash != null)
                        {
                            deviceInfo["currentFirmwareHash"] = fwHash.ToString() ?? string.Empty;
                        }
                    }
                }
                else
                {
                    Console.WriteLine($"[DEVICE_SERVICE] Warning: Could not fetch firmware info from {deviceIp}");
                }

                return JsonSerializer.Serialize(deviceInfo);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DEVICE_SERVICE] Error fetching device info from {deviceIp}: {ex.Message}");
                throw;
            }
        }

        public async Task<string> FetchDeviceCapabilitiesJson(string ip)
        {
            using var client = new HttpClient();
            var response = await client.GetAsync($"http://{ip}/api/device/capabilities");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync();
        }

        public async Task<List<Model_Sensor>> FetchDeviceSensorsJson(string ip)
        {
            try
            {
                var response = await _httpClient.GetAsync($"http://{ip}/api/device/sensors");
                response.EnsureSuccessStatusCode();

                // Read response content and deserialize it into a list of Model_Sensor objects
                var jsonResponse = await response.Content.ReadAsStringAsync();

                var sensors = JsonSerializer.Deserialize<List<Model_Sensor>>(jsonResponse, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                // Return the list of sensors
                return sensors ?? new List<Model_Sensor>();  // If deserialization fails, return an empty list
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error fetching device sensors: {ex.Message}");
                return new List<Model_Sensor>();  // Return empty list in case of error
            }
        }
    }
}