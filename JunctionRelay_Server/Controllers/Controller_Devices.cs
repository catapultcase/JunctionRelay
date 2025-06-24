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

using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Models;
using Newtonsoft.Json;
using JunctionRelayServer.Models.Requests;
using JunctionRelay_Server.Models.Requests;

namespace JunctionRelayServer.Controllers
{
    [Route("api/devices")]
    [ApiController]
    public class Controller_Devices : ControllerBase
    {
        private readonly Service_Database_Manager_Devices _deviceDb;
        private readonly Service_Manager_Devices _deviceService;
        private readonly Service_Database_Manager_Device_I2CDevices _i2cDeviceDb;
        private readonly Service_Manager_Network_Scan _networkScan;
        private readonly Service_Database_Manager_Sensors _sensorDb;
        private readonly Service_HostInfo _hostInfoService;
        private readonly Service_Manager_CloudDevices _cloudDeviceService;

        public Controller_Devices(Service_Database_Manager_Devices deviceDb,
            Service_Manager_Devices deviceService,
            Service_Manager_Network_Scan networkScan,
            Service_Database_Manager_Sensors sensorDb,
            Service_HostInfo hostInfoService,
            Service_Database_Manager_Device_I2CDevices i2cDeviceDb,
            Service_Manager_CloudDevices cloudDeviceService)
        {
            _deviceDb = deviceDb;
            _deviceService = deviceService;
            _networkScan = networkScan;
            _sensorDb = sensorDb;
            _hostInfoService = hostInfoService;
            _i2cDeviceDb = i2cDeviceDb;
            _cloudDeviceService = cloudDeviceService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllDevices()
        {
            try
            {
                // Check if user has cloud authentication
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                bool hasCloudAuth = !string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ");

                // If user is cloud authenticated, sync cloud devices first
                if (hasCloudAuth)
                {
                    var cloudToken = authHeader.Substring("Bearer ".Length);
                    await _cloudDeviceService.SyncCloudDevicesAsync(cloudToken);
                }

                // Return unified device list from local database (includes both local and synced cloud devices)
                var allDevices = await _deviceDb.GetAllDevicesAsync();
                return Ok(allDevices);
            }
            catch (Exception ex)
            {
                // Log error but still return local devices if cloud sync fails
                // This ensures the page doesn't break if cloud is unavailable
                var localDevices = await _deviceDb.GetAllDevicesAsync();
                return Ok(localDevices);
            }
        }

        [HttpPost]
        public async Task<IActionResult> AddDevice([FromBody] Model_Device newDevice)
        {
            try
            {
                // Add the new device to the database
                var addedDevice = await _deviceDb.AddDeviceAsync(newDevice);  // This handles adding device and I2C devices

                // Return the newly created device with 201 status code
                return CreatedAtAction(nameof(GetDeviceById), new { id = addedDevice.Id }, addedDevice);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetDeviceById(int id)
        {
            var device = await _deviceDb.GetDeviceByIdAsync(id);
            return device == null ? NotFound() : Ok(device);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateDevice(int id, [FromBody] Model_Device updatedDevice)
        {
            try
            {
                var success = await _deviceDb.UpdateDeviceAsync(id, updatedDevice);
                return success ? Ok(new { message = "Device updated successfully." }) : NotFound();
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }


        [HttpGet("scan")]
        public async Task<IActionResult> ScanNetwork()
        {
            try
            {
                var results = await _networkScan.ScanNetworkAsync(); // Get the devices found on the network
                var enrichedResults = new List<object>();
                // Get all devices from the database
                var existingDevices = await _deviceDb.GetAllDevicesAsync();

                foreach (var result in results)
                {
                    // Ensure we are working with Model_ScannedDevice
                    var device = result as Model_ScannedDevice;
                    if (device == null)
                    {
                        // If it's not a Model_ScannedDevice, skip it (or handle as needed)
                        continue;
                    }

                    // Fetch device info (including MAC address) using the IP address from the scan results
                    var deviceInfoResponse = await GetDeviceInfo(device.IpAddress);
                    string macAddress = "Unknown";
                    if (deviceInfoResponse is OkObjectResult okResult && okResult.Value != null)
                    {
                        // Deserialize the response into Model_Device_Info
                        var deviceInfoWrapper = okResult.Value as dynamic; // Use dynamic to access the 'deviceInfo' property
                        var deviceInfo = deviceInfoWrapper?.deviceInfo;
                        if (deviceInfo != null)
                        {
                            // Safe null handling with explicit ToString() and null coalescing
                            var uniqueId = deviceInfo?.UniqueIdentifier;
                            macAddress = uniqueId?.ToString() ?? "Unknown";
                        }
                    }

                    // Find all devices matching by IP or MAC address
                    var matchedByMac = existingDevices.Where(d => d.UniqueIdentifier == macAddress).ToList();
                    var matchedByIp = existingDevices.Where(d => d.IPAddress == device.IpAddress).ToList();

                    // Default values
                    string status = "NEW_DEVICE";
                    bool needsResync = false;
                    string? currentIpInDb = null;

                    // Determine if any device with this MAC has a different IP than the scanned one
                    bool hasDifferentIp = matchedByMac.Any(d => d.IPAddress != device.IpAddress);

                    // Determine status and resync need
                    if (matchedByIp.Any() && matchedByMac.Any())
                    {
                        if (matchedByIp.Any(d => matchedByMac.Contains(d)))
                        {
                            // The device exists with the same MAC and IP
                            status = "DEVICE_EXISTS";

                            // Even if there's an exact match, check if ANY device with this MAC has a different IP
                            if (hasDifferentIp)
                            {
                                needsResync = true;
                                status = "NEEDS_RESYNC";
                            }
                        }
                        else
                        {
                            // We have matches for both IP and MAC but in different devices
                            status = "CONFLICTING_RECORDS";
                            needsResync = true;  // This is a conflict, so resync is likely needed
                        }
                    }
                    else if (matchedByIp.Any())
                    {
                        status = "IP_IN_USE";
                    }
                    else if (matchedByMac.Any())
                    {
                        // At least one device with this MAC exists but with a different IP
                        status = "NEEDS_RESYNC";
                        needsResync = true;
                    }

                    // Get the current IPs in the database for this MAC if there are any matches
                    if (matchedByMac.Any())
                    {
                        var existingIps = matchedByMac
                            .Where(d => !string.IsNullOrEmpty(d.IPAddress)) // Filter out null IPs
                            .Select(d => d.IPAddress!)                      // Non-null assertion since we filtered
                            .Distinct()
                            .ToList();
                        currentIpInDb = string.Join(", ", existingIps);
                    }

                    // Add the enriched result with status
                    enrichedResults.Add(new
                    {
                        Instance = device.Instance,
                        IpAddress = device.IpAddress,
                        MacAddress = macAddress,
                        Status = status,
                        MatchingDeviceCount = matchedByMac.Count,
                        NeedsResync = needsResync,
                        CurrentIpInDb = currentIpInDb
                    });
                }

                return Ok(enrichedResults);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }


        [HttpPost("resync")]
        public async Task<IActionResult> ResyncDevice([FromBody] Model_ResyncDeviceRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.MacAddress) || string.IsNullOrWhiteSpace(request.NewIpAddress))
                {
                    return BadRequest("MAC Address and New IP Address are required.");
                }

                var devices = await _deviceDb.GetAllDevicesAsync();
                var matchingDevices = devices.Where(d => d.UniqueIdentifier == request.MacAddress).ToList();

                if (matchingDevices.Count == 0)
                {
                    return NotFound($"No devices with MAC Address {request.MacAddress} found.");
                }

                int updatedCount = 0;
                List<string> updatedDeviceNames = new List<string>();
                List<string> oldIps = new List<string>();

                foreach (var device in matchingDevices)
                {
                    if (device.IPAddress != request.NewIpAddress)
                    {
                        // Add null check before adding to oldIps list
                        if (!string.IsNullOrEmpty(device.IPAddress))
                        {
                            oldIps.Add(device.IPAddress);
                        }

                        device.IPAddress = request.NewIpAddress;
                        device.LastUpdated = DateTime.UtcNow;

                        var success = await _deviceDb.UpdateDeviceAsync(device.Id, device);
                        if (success)
                        {
                            updatedCount++;
                            updatedDeviceNames.Add(device.Name);
                        }
                    }
                }

                if (updatedCount > 0)
                {
                    return Ok(new
                    {
                        message = $"{updatedCount} device(s) with MAC Address {request.MacAddress} successfully updated.",
                        updatedCount = updatedCount,
                        deviceNames = updatedDeviceNames,
                        oldIpAddresses = oldIps,
                        newIpAddress = request.NewIpAddress
                    });
                }
                else
                {
                    return Ok(new
                    {
                        message = "All matching devices already have the requested IP Address.",
                        updatedCount = 0
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }



        [HttpGet("info")]
        public async Task<IActionResult> GetDeviceInfo([FromQuery] string ip)
        {
            if (string.IsNullOrWhiteSpace(ip)) return BadRequest("IP required.");
            try
            {
                // Use the enhanced method that includes firmware information
                var deviceInfoJson = await _deviceService.FetchDeviceInfoWithFirmwareJson(ip);

                // Deserialize the JSON into a strongly-typed Model_Device_Info object
                var deviceInfo = JsonConvert.DeserializeObject<Model_Device_Info>(deviceInfoJson);

                // Return the device info as an object
                return Ok(new { deviceInfo });
            }
            catch (Exception ex)
            {
                // Fallback to basic device info if enhanced method fails
                try
                {
                    var basicDeviceInfoJson = await _deviceService.FetchDeviceInfoJson(ip);
                    var deviceInfo = JsonConvert.DeserializeObject<Model_Device_Info>(basicDeviceInfoJson);
                    return Ok(new { deviceInfo });
                }
                catch
                {
                    return StatusCode(500, ex.Message);
                }
            }
        }



        // Fetch device capabilities from the external device
        [HttpGet("capabilities")]
        public async Task<IActionResult> GetDeviceCapabilities([FromQuery] string ip)
        {
            if (string.IsNullOrWhiteSpace(ip)) return BadRequest("IP required.");
            try
            {
                var json = await _deviceService.FetchDeviceCapabilitiesJson(ip); // Fetch capabilities from device

                // Deserialize into capabilities object
                var capabilities = JsonConvert.DeserializeObject<Model_Device_Capabilities>(json);

                return Ok(new { capabilities });
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // Sample API endpoint to fetch supported protocols
        [HttpGet("api/devices/{id}/supported-protocols")]
        public async Task<IActionResult> GetSupportedProtocols(int id)
        {
            // Fetch the device from the database
            var device = await _deviceService.GetDeviceByIdAsync(id);
            if (device == null)
            {
                return NotFound();
            }

            // Return the supported protocols for the device
            return Ok(device.SupportedProtocols); // Make sure this is set correctly
        }



        // Fetch device sensors from the external device
        [HttpGet("sensors")]
        public async Task<IActionResult> GetDeviceSensors([FromQuery] string ip)
        {
            if (string.IsNullOrWhiteSpace(ip)) return BadRequest("IP required.");
            try
            {
                var json = await _deviceService.FetchDeviceSensorsJson(ip); // Using Service_Manager_Devices for sensors
                return Ok(new { sensors = json });
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("add-from-ip")]
        public async Task<IActionResult> AddDeviceFromIp([FromQuery] string ip, [FromQuery] string instance)
        {
            if (string.IsNullOrWhiteSpace(ip))
                return BadRequest("IP address is required.");

            try
            {
                var added = await _deviceService.AddDeviceFromIpAsync(ip, instance);
                return CreatedAtAction(nameof(GetDeviceById), new { id = added.Id }, added);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error adding device from IP: {ex.Message}");
            }
        }

        // GET all screens for a device
        [HttpGet("{deviceId:int}/screens")]
        public async Task<IActionResult> GetDeviceScreens(int deviceId)
        {
            try
            {
                var screens = await _deviceDb.GetDeviceScreensAsync(deviceId);
                return Ok(screens);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error fetching screens: {ex.Message}");
            }
        }

        // UPDATE a screen
        [HttpPut("{deviceId:int}/screens/{screenId:int}")]
        public async Task<IActionResult> UpdateDeviceScreen(
            int deviceId,
            int screenId,
            [FromBody] Model_Device_Screen_Update_Request updated)
        {
            var existing = await _deviceDb.GetDeviceScreenByIdAsync(screenId);
            if (existing == null || existing.DeviceId != deviceId)
                return NotFound("Screen not found for this device.");

            // Update fields if new values are provided
            existing.DisplayName = updated.DisplayName ?? existing.DisplayName;
            existing.ScreenLayoutId = updated.ScreenLayoutId ?? existing.ScreenLayoutId;
            existing.SupportsConfigPayloads = updated.SupportsConfigPayloads ?? existing.SupportsConfigPayloads;
            existing.SupportsSensorPayloads = updated.SupportsSensorPayloads ?? existing.SupportsSensorPayloads;

            var success = await _deviceDb.UpdateDeviceScreenAsync(screenId, existing);
            return success
                ? Ok(new { message = "Screen updated." })
                : StatusCode(500, "Update failed.");
        }


        // **NEW**: Create a screen
        [HttpPost("{deviceId:int}/screens")]
        public async Task<IActionResult> AddDeviceScreen(
            int deviceId,
            [FromBody] Model_Device_Screens newScreen)
        {
            newScreen.DeviceId = deviceId;
            try
            {
                var added = await _deviceDb.AddDeviceScreenAsync(newScreen);
                return CreatedAtAction(nameof(GetDeviceScreens),
                    new { deviceId = deviceId }, added);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error adding screen: {ex.Message}");
            }
        }

        // **NEW**: Delete a screen
        [HttpDelete("{deviceId:int}/screens/{screenId:int}")]
        public async Task<IActionResult> DeleteDeviceScreen(int deviceId, int screenId)
        {
            try
            {
                var existing = await _deviceDb.GetDeviceScreenByIdAsync(screenId);
                if (existing == null || existing.DeviceId != deviceId)
                    return NotFound($"Screen {screenId} not found for device {deviceId}.");

                var success = await _deviceDb.DeleteDeviceScreenAsync(screenId);
                return success
                    ? Ok(new { message = "Screen deleted." })
                    : StatusCode(500, "Deletion failed.");
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error deleting screen: {ex.Message}");
            }
        }





        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteDevice(int id)
        {
            try
            {
                // Call the service to delete the device by its ID
                var success = await _deviceDb.DeleteDeviceAsync(id);

                if (!success)
                {
                    return NotFound($"Device with ID {id} not found.");
                }

                return Ok(new { message = "Device deleted successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error deleting device: {ex.Message}");
            }
        }

        [HttpGet("{deviceId}/delta")]
        public async Task<IActionResult> GetDeltaSensorsForDevice(int deviceId, [FromQuery] bool isHostDevice)
        {
            // Fetch the device from the database
            var device = await _deviceDb.GetDeviceByIdAsync(deviceId);
            if (device == null)
            {
                return NotFound($"Device with ID {deviceId} not found.");
            }

            try
            {
                List<Model_Sensor> currentSensors;

                // If this is a non-host device, ensure the device IP address is not null or empty
                if (!isHostDevice && string.IsNullOrWhiteSpace(device.IPAddress))
                {
                    return BadRequest("Device IP address is required for non-host devices.");
                }

                // Check if the device is a Host Device (use the query parameter instead)
                if (isHostDevice)
                {
                    // Fetch sensors for a host device using the service method
                    currentSensors = await _hostInfoService.GetHostSensors(1000);  // Fetch host sensors with a sample rate
                }
                else
                {
                    // For regular devices, check for IP address and pass it to the method if it is valid
                    if (string.IsNullOrWhiteSpace(device.IPAddress))
                    {
                        return BadRequest("IP address is required for non-host devices.");
                    }

                    currentSensors = await _deviceService.FetchDeviceSensorsJson(device.IPAddress);  // Fetch device sensors via IP
                }

                // Fetch stored sensors from the database (associated with this deviceId)
                var storedSensors = await _sensorDb.GetSensorsByDeviceIdAsync(deviceId);

                // Initialize a list to store delta sensors (sensors that differ)
                var deltaSensors = new List<Model_Sensor>();

                // Add sensors from the external source (device or host) that do not exist in the database
                foreach (var currentSensor in currentSensors)
                {
                    var storedSensor = storedSensors.FirstOrDefault(s => s.ExternalId == currentSensor.ExternalId);
                    if (storedSensor == null)
                    {
                        // If the sensor does not exist in the database, it's a new delta sensor
                        deltaSensors.Add(currentSensor);
                    }
                }

                // Add sensors from the database that do not exist in the external source (device or host)
                foreach (var storedSensor in storedSensors)
                {
                    var currentSensor = currentSensors.FirstOrDefault(s => s.ExternalId == storedSensor.ExternalId);
                    if (currentSensor == null)
                    {
                        // If the sensor does not exist in the external source, it's a missing sensor (delta)
                        deltaSensors.Add(storedSensor);
                    }
                }

                // Return the list of delta sensors
                return Ok(deltaSensors);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error fetching delta sensors: {ex.Message}");
            }
        }

        // GET: api/devices/preferences
        [HttpGet("preferences")]
        public async Task<IActionResult> GetDevicePreferences([FromQuery] string ip)
        {
            if (string.IsNullOrWhiteSpace(ip))
                return BadRequest("IP address is required.");

            try
            {
                using var client = new HttpClient();
                var response = await client.GetAsync($"http://{ip}/api/device/preferences");

                if (!response.IsSuccessStatusCode)
                    return StatusCode((int)response.StatusCode, $"Error fetching preferences: {response.ReasonPhrase}");

                var content = await response.Content.ReadAsStringAsync();
                return Content(content, "application/json");
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error fetching device preferences: {ex.Message}");
            }
        }

        // POST: api/devices/set-preferences
        [HttpPost("set-preferences")]
        public async Task<IActionResult> SetDevicePreferences([FromBody] Model_Device_Preferences_Request request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Ip) || request.Preferences == null)
                return BadRequest("IP address and preferences are required.");

            try
            {
                using var client = new HttpClient();

                // Create JSON payload for the device (not form data!)
                var devicePayload = new
                {
                    connMode = request.Preferences.ConnMode,
                    wifiSSID = request.Preferences.WifiSSID,
                    wifiPassword = request.Preferences.WifiPassword,
                    mqttBroker = request.Preferences.MqttBroker,
                    mqttUsername = request.Preferences.MqttUsername ?? string.Empty,
                    mqttPassword = request.Preferences.MqttPassword ?? string.Empty,
                    rotation = request.Preferences.Rotation,
                    swapBlueGreen = request.Preferences.SwapBlueGreen ?? false,
                    externalNeoPixelsData1 = string.IsNullOrWhiteSpace(request.Preferences.ExternalNeoPixelsData1) ? "0" : request.Preferences.ExternalNeoPixelsData1,
                    externalNeoPixelsData2 = string.IsNullOrWhiteSpace(request.Preferences.ExternalNeoPixelsData2) ? "0" : request.Preferences.ExternalNeoPixelsData2,
                    restart = request.Preferences.Restart ?? false
                };

                // Serialize to JSON
                var jsonPayload = JsonConvert.SerializeObject(devicePayload);
                var content = new StringContent(jsonPayload, System.Text.Encoding.UTF8, "application/json");

                var response = await client.PostAsync($"http://{request.Ip}/api/device/set-preferences", content);

                if (!response.IsSuccessStatusCode)
                    return StatusCode((int)response.StatusCode, $"Error setting preferences: {response.ReasonPhrase}");

                var responseContent = await response.Content.ReadAsStringAsync();

                // If we're restarting, add a message to the response
                if (request.Preferences.Restart.HasValue && request.Preferences.Restart.Value)
                {
                    // Try to parse the content as JSON and add a reboot message
                    try
                    {
                        var jsonObj = JsonConvert.DeserializeObject<dynamic>(responseContent);
                        if (jsonObj != null)
                        {
                            jsonObj.rebootInitiated = true;
                            return Content(JsonConvert.SerializeObject(jsonObj), "application/json");
                        }
                        else
                        {
                            // If jsonObj is null, return the original content
                            return Content(responseContent, "application/json");
                        }
                    }
                    catch
                    {
                        // If parsing fails, just return the original content
                        return Content(responseContent, "application/json");
                    }
                }

                return Content(responseContent, "application/json");
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error setting device preferences: {ex.Message}");
            }
        }

        // POST: api/devices/reboot
        [HttpPost("reboot")]
        public async Task<IActionResult> RebootDevice([FromBody] Model_Device_Ip_Request request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Ip))
                return BadRequest("IP address is required.");

            try
            {
                using var client = new HttpClient();
                var response = await client.PostAsync($"http://{request.Ip}/api/device/reboot", null);

                if (!response.IsSuccessStatusCode)
                    return StatusCode((int)response.StatusCode, $"Error rebooting device: {response.ReasonPhrase}");

                return Ok(new { message = "Device reboot initiated successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error rebooting device: {ex.Message}");
            }
        }

        // Add these new endpoints to your Controller_Devices class

        // GET: api/devices/{id}/system-stats-lite
        [HttpGet("{id:int}/system-stats-lite")]
        public async Task<IActionResult> GetDeviceSystemStatsLite(int id)
        {
            try
            {
                // Get the device from database to get its IP
                var device = await _deviceDb.GetDeviceByIdAsync(id);
                if (device == null)
                    return NotFound($"Device with ID {id} not found.");

                if (string.IsNullOrWhiteSpace(device.IPAddress))
                    return BadRequest("Device IP address is not available.");

                // Make the API call to the ESP32 device for lightweight stats
                using var client = new HttpClient();
                client.Timeout = TimeSpan.FromSeconds(5); // Shorter timeout for lite version

                var response = await client.GetAsync($"http://{device.IPAddress}/api/system/statslite");

                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode((int)response.StatusCode,
                        $"Error fetching lightweight system stats from device: {response.ReasonPhrase}");
                }

                var content = await response.Content.ReadAsStringAsync();

                // Return the stats data as-is (proxy the ESP32 response)
                return Content(content, "application/json");
            }
            catch (HttpRequestException httpEx)
            {
                // Device is likely unreachable
                return StatusCode(503, new
                {
                    error = "Device unreachable",
                    message = httpEx.Message,
                    deviceId = id
                });
            }
            catch (TaskCanceledException)
            {
                // Request timeout
                return StatusCode(408, new
                {
                    error = "Request timeout",
                    message = "Device did not respond within the timeout period",
                    deviceId = id
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    error = "Internal server error",
                    message = ex.Message,
                    deviceId = id
                });
            }
        }

        // GET: api/devices/system-stats (for direct IP queries)
        [HttpGet("system-stats")]
        public async Task<IActionResult> GetDeviceSystemStatsByIp([FromQuery] string ip, [FromQuery] bool lite = false)
        {
            if (string.IsNullOrWhiteSpace(ip))
                return BadRequest("IP address is required.");

            try
            {
                using var client = new HttpClient();
                client.Timeout = TimeSpan.FromSeconds(lite ? 5 : 10); // Shorter timeout for lite version

                // Choose endpoint based on lite parameter
                var endpoint = lite ? "/api/system/statslite" : "/api/system/stats";
                var response = await client.GetAsync($"http://{ip}{endpoint}");

                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode((int)response.StatusCode,
                        $"Error fetching system stats from device: {response.ReasonPhrase}");
                }

                var content = await response.Content.ReadAsStringAsync();

                // Return the stats data as-is (proxy the ESP32 response)
                return Content(content, "application/json");
            }
            catch (HttpRequestException httpEx)
            {
                // Device is likely unreachable
                return StatusCode(503, new
                {
                    error = "Device unreachable",
                    message = httpEx.Message,
                    ip = ip
                });
            }
            catch (TaskCanceledException)
            {
                // Request timeout
                return StatusCode(408, new
                {
                    error = "Request timeout",
                    message = "Device did not respond within the timeout period",
                    ip = ip
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    error = "Internal server error",
                    message = ex.Message,
                    ip = ip
                });
            }
        }

        // GET: api/devices/{id}/system-stats (full stats version)
        [HttpGet("{id:int}/system-stats")]
        public async Task<IActionResult> GetDeviceSystemStats(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);
                if (device == null)
                    return NotFound($"Device with ID {id} not found.");

                if (string.IsNullOrWhiteSpace(device.IPAddress))
                    return BadRequest("Device IP address is not available.");

                using var client = new HttpClient();
                client.Timeout = TimeSpan.FromSeconds(10); // Longer timeout for full stats

                var response = await client.GetAsync($"http://{device.IPAddress}/api/system/stats");

                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode((int)response.StatusCode,
                        $"Error fetching system stats from device: {response.ReasonPhrase}");
                }

                var content = await response.Content.ReadAsStringAsync();
                return Content(content, "application/json");
            }
            catch (HttpRequestException httpEx)
            {
                return StatusCode(503, new { error = "Device unreachable", message = httpEx.Message, deviceId = id });
            }
            catch (TaskCanceledException)
            {
                return StatusCode(408, new { error = "Request timeout", message = "Device did not respond within the timeout period", deviceId = id });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Internal server error", message = ex.Message, deviceId = id });
            }
        }

        // Add this method to your Controller_Devices class

        [HttpPost("{id:int}/sync-connmode")]
        public async Task<IActionResult> SyncDeviceConnMode(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);
                if (device == null)
                    return NotFound($"Device with ID {id} not found.");

                if (string.IsNullOrWhiteSpace(device.IPAddress))
                    return BadRequest("Device IP address is not available.");

                // Fetch preferences from the device
                using var client = new HttpClient();
                client.Timeout = TimeSpan.FromSeconds(5);

                var response = await client.GetAsync($"http://{device.IPAddress}/api/device/preferences");

                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode((int)response.StatusCode,
                        $"Error fetching preferences from device: {response.ReasonPhrase}");
                }

                var content = await response.Content.ReadAsStringAsync();
                var preferences = JsonConvert.DeserializeObject<dynamic>(content);

                // Update the ConnMode if available
                if (preferences?.connMode != null)
                {
                    device.ConnMode = preferences.connMode.ToString();
                    device.LastUpdated = DateTime.UtcNow;

                    var success = await _deviceDb.UpdateDeviceAsync(id, device);
                    if (success)
                    {
                        return Ok(new
                        {
                            message = "ConnMode synced successfully",
                            connMode = device.ConnMode
                        });
                    }
                    else
                    {
                        return StatusCode(500, "Failed to update device in database");
                    }
                }
                else
                {
                    return Ok(new
                    {
                        message = "No connMode found in device preferences",
                        connMode = device.ConnMode
                    });
                }
            }
            catch (HttpRequestException httpEx)
            {
                return StatusCode(503, new
                {
                    error = "Device unreachable",
                    message = httpEx.Message,
                    deviceId = id
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    error = "Internal server error",
                    message = ex.Message,
                    deviceId = id
                });
            }
        }

        // Also add a bulk sync method
        [HttpPost("sync-all-connmodes")]
        public async Task<IActionResult> SyncAllDeviceConnModes()
        {
            try
            {
                var devices = await _deviceDb.GetAllDevicesAsync();
                var junctionRelayDevices = devices.Where(d =>
                    d.IsJunctionRelayDevice &&
                    !string.IsNullOrWhiteSpace(d.IPAddress)
                ).ToList();

                var results = new List<object>();

                foreach (var device in junctionRelayDevices)
                {
                    try
                    {
                        using var client = new HttpClient();
                        client.Timeout = TimeSpan.FromSeconds(3); // Shorter timeout for bulk operation

                        var response = await client.GetAsync($"http://{device.IPAddress}/api/device/preferences");

                        if (response.IsSuccessStatusCode)
                        {
                            var content = await response.Content.ReadAsStringAsync();
                            var preferences = JsonConvert.DeserializeObject<dynamic>(content);

                            if (preferences?.connMode != null)
                            {
                                device.ConnMode = preferences.connMode.ToString();
                                device.LastUpdated = DateTime.UtcNow;

                                await _deviceDb.UpdateDeviceAsync(device.Id, device);

                                results.Add(new
                                {
                                    deviceId = device.Id,
                                    deviceName = device.Name,
                                    connMode = device.ConnMode,
                                    status = "success"
                                });
                            }
                            else
                            {
                                results.Add(new
                                {
                                    deviceId = device.Id,
                                    deviceName = device.Name,
                                    connMode = device.ConnMode,
                                    status = "no_connmode_found"
                                });
                            }
                        }
                        else
                        {
                            results.Add(new
                            {
                                deviceId = device.Id,
                                deviceName = device.Name,
                                status = "device_unreachable"
                            });
                        }
                    }
                    catch (Exception ex)
                    {
                        results.Add(new
                        {
                            deviceId = device.Id,
                            deviceName = device.Name,
                            status = "error",
                            error = ex.Message
                        });
                    }
                }

                return Ok(new
                {
                    message = $"Sync completed for {junctionRelayDevices.Count} devices",
                    results = results
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error syncing ConnModes: {ex.Message}");
            }
        }

        // GET: api/devices/{id}/connection-status
        [HttpGet("{id:int}/connection-status")]
        public async Task<IActionResult> GetDeviceConnectionStatus(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);
                if (device == null)
                    return NotFound($"Device with ID {id} not found.");

                if (string.IsNullOrWhiteSpace(device.IPAddress))
                    return BadRequest("Device IP address is not available.");

                // Make the API call to the device for connection status
                using var client = new HttpClient();
                client.Timeout = TimeSpan.FromSeconds(3); // Short timeout for connection status

                var response = await client.GetAsync($"http://{device.IPAddress}/api/connection/status");

                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode((int)response.StatusCode,
                        $"Error fetching connection status from device: {response.ReasonPhrase}");
                }

                var content = await response.Content.ReadAsStringAsync();

                // Return the connection status as-is (proxy the device response)
                return Content(content, "application/json");
            }
            catch (HttpRequestException httpEx)
            {
                // Device is likely unreachable
                return StatusCode(503, new
                {
                    error = "Device unreachable",
                    message = httpEx.Message,
                    deviceId = id,
                    status = "offline"
                });
            }
            catch (TaskCanceledException)
            {
                // Request timeout
                return StatusCode(408, new
                {
                    error = "Request timeout",
                    message = "Device did not respond within the timeout period",
                    deviceId = id,
                    status = "timeout"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    error = "Internal server error",
                    message = ex.Message,
                    deviceId = id,
                    status = "error"
                });
            }
        }

        // GET: api/devices/connection-status (for direct IP queries)
        [HttpGet("connection-status")]
        public async Task<IActionResult> GetDeviceConnectionStatusByIp([FromQuery] string ip)
        {
            if (string.IsNullOrWhiteSpace(ip))
                return BadRequest("IP address is required.");

            try
            {
                using var client = new HttpClient();
                client.Timeout = TimeSpan.FromSeconds(3);

                var response = await client.GetAsync($"http://{ip}/api/connection/status");

                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode((int)response.StatusCode,
                        $"Error fetching connection status from device: {response.ReasonPhrase}");
                }

                var content = await response.Content.ReadAsStringAsync();
                return Content(content, "application/json");
            }
            catch (HttpRequestException httpEx)
            {
                return StatusCode(503, new
                {
                    error = "Device unreachable",
                    message = httpEx.Message,
                    ip = ip,
                    status = "offline"
                });
            }
            catch (TaskCanceledException)
            {
                return StatusCode(408, new
                {
                    error = "Request timeout",
                    message = "Device did not respond within the timeout period",
                    ip = ip,
                    status = "timeout"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    error = "Internal server error",
                    message = ex.Message,
                    ip = ip,
                    status = "error"
                });
            }
        }

        [HttpPost("bulk-connection-status")]
        public async Task<IActionResult> GetBulkConnectionStatus([FromBody] List<int> deviceIds)
        {
            if (deviceIds == null || !deviceIds.Any())
                return BadRequest("Device IDs are required.");

            try
            {
                var devices = await _deviceDb.GetAllDevicesAsync();
                var requestedDevices = devices.Where(d => deviceIds.Contains(d.Id)).ToList();
                var connectionStatuses = new Dictionary<int, object>();

                var semaphore = new SemaphoreSlim(5);
                var tasks = requestedDevices.Select(async device =>
                {
                    await semaphore.WaitAsync();
                    try
                    {
                        if (string.IsNullOrWhiteSpace(device.IPAddress))
                        {
                            connectionStatuses[device.Id] = new
                            {
                                status = "no_ip",
                                error = "Device IP address not available"
                            };
                            return;
                        }

                        using var client = new HttpClient();
                        client.Timeout = TimeSpan.FromSeconds(3);

                        try
                        {
                            var response = await client.GetAsync($"http://{device.IPAddress}/api/connection/status");

                            if (response.IsSuccessStatusCode)
                            {
                                var content = await response.Content.ReadAsStringAsync();

                                if (!string.IsNullOrEmpty(content))
                                {
                                    try
                                    {
                                        var deserializedData = JsonConvert.DeserializeObject(content);

                                        if (deserializedData is Newtonsoft.Json.Linq.JObject jObj)
                                        {
                                            var dict = jObj.ToObject<Dictionary<string, object>>();
                                            connectionStatuses[device.Id] = dict ?? (object)new { status = "unknown" };
                                        }
                                        else
                                        {
                                            connectionStatuses[device.Id] = deserializedData ?? (object)new { status = "unknown" };
                                        }
                                    }
                                    catch (JsonException ex)
                                    {
                                        connectionStatuses[device.Id] = new { status = "json_error", error = ex.Message, rawContent = content };
                                    }
                                }
                                else
                                {
                                    connectionStatuses[device.Id] = new { status = "empty_response" };
                                }
                            }
                            else
                            {
                                connectionStatuses[device.Id] = new
                                {
                                    status = "http_error",
                                    statusCode = (int)response.StatusCode,
                                    error = response.ReasonPhrase ?? "Unknown error"
                                };
                            }
                        }
                        catch (HttpRequestException ex)
                        {
                            connectionStatuses[device.Id] = new
                            {
                                status = "unreachable",
                                error = ex.Message ?? "Device unreachable"
                            };
                        }
                        catch (TaskCanceledException)
                        {
                            connectionStatuses[device.Id] = new
                            {
                                status = "timeout",
                                error = "Request timeout"
                            };
                        }
                    }
                    finally
                    {
                        semaphore.Release();
                    }
                });

                await Task.WhenAll(tasks);

                return Ok(new
                {
                    message = $"Connection status retrieved for {requestedDevices.Count} devices",
                    connectionStatuses = connectionStatuses
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error retrieving bulk connection status: {ex.Message}");
            }
        }

        // Add this to your Controller_Devices class

        // POST: api/devices/{deviceId}/nest-under-gateway
        [HttpPost("{deviceId:int}/nest-under-gateway")]
        public async Task<IActionResult> NestDeviceUnderGateway(int deviceId, [FromBody] Model_Nest_Device_Request request)
        {
            try
            {
                // Validate the request
                if (request == null)
                    return BadRequest("Request body is required.");

                // Get the device to be nested
                var device = await _deviceDb.GetDeviceByIdAsync(deviceId);
                if (device == null)
                    return NotFound($"Device with ID {deviceId} not found.");

                // If gatewayId is null, we're removing the device from its current gateway
                if (request.GatewayId == null)
                {
                    device.GatewayId = null;
                    device.Type = "Standalone"; // Update type to reflect standalone status
                    device.LastUpdated = DateTime.UtcNow;

                    var success = await _deviceDb.UpdateDeviceAsync(deviceId, device);
                    return success
                        ? Ok(new { message = $"Device '{device.Name}' removed from gateway successfully." })
                        : StatusCode(500, "Failed to remove device from gateway.");
                }

                // Validate that the gateway exists and is actually a gateway
                var gateway = await _deviceDb.GetDeviceByIdAsync(request.GatewayId.Value);
                if (gateway == null)
                    return NotFound($"Gateway with ID {request.GatewayId} not found.");

                if (!gateway.IsGateway)
                    return BadRequest($"Device '{gateway.Name}' is not configured as a gateway.");

                // Prevent nesting a gateway under another gateway (optional business rule)
                if (device.IsGateway)
                    return BadRequest("Cannot nest a gateway device under another gateway.");

                // Prevent circular nesting (device cannot be nested under itself)
                if (deviceId == request.GatewayId)
                    return BadRequest("Device cannot be nested under itself.");

                // Update the device's gateway relationship and type
                device.GatewayId = request.GatewayId;
                device.Type = "Child"; // Update type to reflect child status
                device.LastUpdated = DateTime.UtcNow;

                var updateSuccess = await _deviceDb.UpdateDeviceAsync(deviceId, device);

                if (updateSuccess)
                {
                    return Ok(new
                    {
                        message = $"Device '{device.Name}' successfully nested under gateway '{gateway.Name}'.",
                        deviceId = deviceId,
                        deviceName = device.Name,
                        gatewayId = request.GatewayId,
                        gatewayName = gateway.Name,
                        newType = device.Type
                    });
                }
                else
                {
                    return StatusCode(500, "Failed to update device gateway relationship.");
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error nesting device under gateway: {ex.Message}");
            }
        }

        // GET: api/devices/gateways - Get all available gateway devices
        [HttpGet("gateways")]
        public async Task<IActionResult> GetAvailableGateways()
        {
            try
            {
                var devices = await _deviceDb.GetAllDevicesAsync();
                var gateways = devices
                    .Where(d => d.IsGateway)
                    .Select(d => new
                    {
                        id = d.Id,
                        name = d.Name,
                        ipAddress = d.IPAddress,
                        status = d.Status
                    })
                    .OrderBy(g => g.name)
                    .ToList();

                return Ok(gateways);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error fetching available gateways: {ex.Message}");
            }
        }
    }
}
