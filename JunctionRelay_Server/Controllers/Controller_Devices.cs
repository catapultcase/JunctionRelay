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
using System.Diagnostics;
using JunctionRelayServer.Models.DeviceSync;
using System.IO.Ports;

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
        private readonly Service_Manager_Device_Sync _deviceSyncManager;
        private readonly Service_Manager_COM_Ports _comPortManager;
        private readonly Service_Stream_Manager_Virtual _virtualStreamManager;
        public Controller_Devices(Service_Database_Manager_Devices deviceDb,
            Service_Manager_Devices deviceService,
            Service_Manager_Network_Scan networkScan,
            Service_Database_Manager_Sensors sensorDb,
            Service_HostInfo hostInfoService,
            Service_Database_Manager_Device_I2CDevices i2cDeviceDb,
            Service_Manager_CloudDevices cloudDeviceService,
            Service_Manager_Device_Sync deviceSyncManager,
            Service_Manager_COM_Ports comPortManager,
            Service_Stream_Manager_Virtual virtualStreamManager)
        {
            _deviceDb = deviceDb;
            _deviceService = deviceService;
            _networkScan = networkScan;
            _sensorDb = sensorDb;
            _hostInfoService = hostInfoService;
            _i2cDeviceDb = i2cDeviceDb;
            _cloudDeviceService = cloudDeviceService;
            _deviceSyncManager = deviceSyncManager;
            _comPortManager = comPortManager;
            _virtualStreamManager = virtualStreamManager;
        }

        // Update the GetAllDevices method in Controller_Devices.cs

        [HttpGet]
        public async Task<IActionResult> GetAllDevices()
        {
            try
            {
                // Just return devices from DB — no cloud sync attempted
                var devices = await _deviceDb.GetAllDevicesAsync();
                return Ok(devices);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch devices: {ex.Message}");
                return StatusCode(500, "Failed to fetch devices.");
            }
        }

        [HttpGet("local-and-cloud")]
        public async Task<IActionResult> GetLocalAndCloudDevices([FromQuery] bool skipCloudSync = false)
        {
            try
            {
                if (!skipCloudSync)
                {
                    var authHeader = Request.Headers.Authorization.FirstOrDefault();

                    // Null-safe "Bearer " check + token extraction
                    if (authHeader?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) == true)
                    {
                        // Avoid substring if token is missing (e.g., "Bearer " only)
                        if (authHeader.Length > 7)
                        {
                            var cloudToken = authHeader.Substring(7).Trim();
                            if (!string.IsNullOrWhiteSpace(cloudToken))
                            {
                                await _cloudDeviceService.SyncCloudDevicesAsync(cloudToken);
                            }
                        }
                    }
                }

                var allDevices = await _deviceDb.GetAllDevicesAsync();
                return Ok(allDevices);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Cloud sync failed: {ex.Message}");
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
            // First try to get from database
            var device = await _deviceDb.GetDeviceByIdAsync(id);
            if (device != null)
            {
                return Ok(device);
            }

            // If not found and ID is negative, check if it's a virtual device from blit mode
            if (id < 0)
            {
                var virtualDevice = _virtualStreamManager.GetVirtualDeviceById(id);
                if (virtualDevice != null)
                {
                    return Ok(virtualDevice);
                }
            }

            return NotFound();
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
        public async Task<IActionResult> ScanNetwork([FromQuery] string? type = null)
        {
            bool isFullScan = type?.ToLower() == "full";

            if (isFullScan)
            {
                // For full scan, use the streaming endpoint
                await ScanNetworkStreaming();
                return new EmptyResult(); // Return empty result since streaming handles the response
            }
            else
            {
                // Keep original behavior for JunctionRelay-only scans
                return await ScanNetworkStandard();
            }
        }

        private async Task<IActionResult> ScanNetworkStandard()
        {
            try
            {
                var results = await _networkScan.ScanNetworkAsync();
                var enrichedResults = new List<object>();

                var existingDevices = await _deviceDb.GetAllDevicesAsync();

                foreach (var device in results)
                {
                    var enriched = await EnrichSingleDevice(device, existingDevices, "standard");
                    enrichedResults.Add(enriched);
                }

                return Ok(enrichedResults);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpGet("scan/stream")]
        public async Task ScanNetworkStreaming()
        {
            Response.Headers["Content-Type"] = "text/event-stream";
            Response.Headers["Cache-Control"] = "no-cache";
            Response.Headers["Connection"] = "keep-alive";
            Response.Headers["Access-Control-Allow-Origin"] = "*";

            try
            {
                var existingDevices = await _deviceDb.GetAllDevicesAsync();
                var processedIps = new HashSet<string>();

                await foreach (var deviceWithMethod in _networkScan.ScanNetworkStreamAsyncWithMethod())
                {
                    if (processedIps.Contains(deviceWithMethod.Device.IpAddress))
                        continue;

                    processedIps.Add(deviceWithMethod.Device.IpAddress);

                    // Enrich the single device with discovery method
                    var enrichedDevice = await EnrichSingleDevice(deviceWithMethod.Device, existingDevices, deviceWithMethod.DiscoveryMethod);

                    // Send as SSE event
                    var json = System.Text.Json.JsonSerializer.Serialize(enrichedDevice);
                    await Response.WriteAsync($"data: {json}\n\n");
                    await Response.Body.FlushAsync();

                    // Small delay to prevent overwhelming the client
                    await Task.Delay(50);
                }

                // Send completion event
                await Response.WriteAsync("event: complete\ndata: {\"status\": \"complete\"}\n\n");
                await Response.Body.FlushAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in streaming scan: {ex.Message}");
                try
                {
                    var errorJson = System.Text.Json.JsonSerializer.Serialize(new { error = ex.Message });
                    await Response.WriteAsync($"event: error\ndata: {errorJson}\n\n");
                    await Response.Body.FlushAsync();
                }
                catch
                {
                    // If we can't write the error, the connection is probably closed
                    Console.WriteLine("Could not write error to stream - connection likely closed");
                }
            }

            // Don't return anything - the response is already complete
        }

        private async Task<List<object>> EnrichScanResults(List<Model_ScannedDevice> results)
        {
            var existingDevices = await _deviceDb.GetAllDevicesAsync();
            var enrichedResults = new List<object>();

            foreach (var device in results)
            {
                var enriched = await EnrichSingleDevice(device, existingDevices, "standard");
                enrichedResults.Add(enriched);
            }

            return enrichedResults;
        }

        private async Task<object> EnrichSingleDevice(Model_ScannedDevice device, List<Model_Device> existingDevices, string discoveryMethod = "unknown")
        {
            Console.WriteLine($"[ENRICH] Processing device {device.IpAddress} discovered via {discoveryMethod}");

            string macAddress = "Unknown";
            bool isJunctionRelayDevice = false;

            // Try to get JunctionRelay device info if:
            // 1. Device was discovered via JunctionRelay mDNS scan, OR
            // 2. Device already exists in our database, OR  
            // 3. This is the standard (JunctionRelay-only) scan
            bool shouldTryJunctionRelayInfo = discoveryMethod == "junctionrelay" ||
                                            existingDevices.Any(d => d.IPAddress == device.IpAddress) ||
                                            discoveryMethod == "standard";

            Console.WriteLine($"[ENRICH] Device {device.IpAddress}: shouldTryJunctionRelayInfo = {shouldTryJunctionRelayInfo}");

            if (shouldTryJunctionRelayInfo)
            {
                Console.WriteLine($"[ENRICH] Attempting to get JunctionRelay device info for {device.IpAddress}");
                try
                {
                    var deviceInfoResponse = await GetDeviceInfo(device.IpAddress);
                    if (deviceInfoResponse is OkObjectResult okResult && okResult.Value != null)
                    {
                        var deviceInfoWrapper = okResult.Value as dynamic;
                        var deviceInfo = deviceInfoWrapper?.deviceInfo;
                        if (deviceInfo != null)
                        {
                            var uniqueId = deviceInfo?.UniqueIdentifier;
                            macAddress = uniqueId?.ToString() ?? "Unknown";
                            isJunctionRelayDevice = true;
                            Console.WriteLine($"[ENRICH] Successfully got JunctionRelay info for {device.IpAddress}: MAC = {macAddress}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[ENRICH] Failed to get device info for {device.IpAddress}: {ex.Message}");
                    // For devices from JunctionRelay scan that fail, still try ARP
                    if (discoveryMethod == "junctionrelay" || discoveryMethod == "standard")
                    {
                        Console.WriteLine($"[ENRICH] Trying ARP for JunctionRelay device {device.IpAddress}");
                        macAddress = await GetMacAddressFromArp(device.IpAddress) ?? "Unknown";
                    }
                }
            }
            else
            {
                Console.WriteLine($"[ENRICH] Skipping JunctionRelay API call for {device.IpAddress}, using ARP only");
                // For subnet-discovered devices, just get MAC via ARP
                macAddress = await GetMacAddressFromArp(device.IpAddress) ?? "Unknown";
            }

            Console.WriteLine($"[ENRICH] Final MAC for {device.IpAddress}: {macAddress}");

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
                    status = "DEVICE_EXISTS";
                    if (hasDifferentIp)
                    {
                        needsResync = true;
                        status = "NEEDS_RESYNC";
                    }
                }
                else
                {
                    status = "CONFLICTING_RECORDS";
                    needsResync = true;
                }
            }
            else if (matchedByIp.Any())
            {
                status = "IP_IN_USE";
            }
            else if (matchedByMac.Any())
            {
                status = "NEEDS_RESYNC";
                needsResync = true;
            }

            // Get the current IPs in the database for this MAC if there are any matches
            if (matchedByMac.Any())
            {
                var existingIps = matchedByMac
                    .Where(d => !string.IsNullOrEmpty(d.IPAddress))
                    .Select(d => d.IPAddress!)
                    .Distinct()
                    .ToList();
                currentIpInDb = string.Join(", ", existingIps);
            }

            var result = new
            {
                Instance = device.Instance,
                IpAddress = device.IpAddress,
                MacAddress = macAddress,
                Status = status,
                IsJunctionRelayDevice = isJunctionRelayDevice,
                DiscoveryMethod = discoveryMethod,
                MatchingDeviceCount = matchedByMac.Count,
                NeedsResync = needsResync,
                CurrentIpInDb = currentIpInDb
            };

            Console.WriteLine($"[ENRICH] Completed enrichment for {device.IpAddress}: Status = {status}, MAC = {macAddress}");
            return result;
        }

        private async Task<string?> GetMacAddressFromArp(string ipAddress)
        {
            try
            {
                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = "arp",
                        Arguments = $"-a {ipAddress}",
                        RedirectStandardOutput = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    }
                };

                process.Start();
                var output = await process.StandardOutput.ReadToEndAsync();
                await process.WaitForExitAsync();

                // Parse ARP output to extract MAC address
                var lines = output.Split('\n');
                foreach (var line in lines)
                {
                    if (line.Contains(ipAddress))
                    {
                        var parts = line.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 2)
                        {
                            var macCandidate = parts[1];
                            if (macCandidate.Contains("-") || macCandidate.Contains(":"))
                            {
                                return macCandidate;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to get MAC from ARP for {ipAddress}: {ex.Message}");
            }

            return null;
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

        // POST: api/devices/{id}/analyze-sync
        [HttpPost("{id:int}/analyze-sync")]
        public async Task<IActionResult> AnalyzeDeviceSync(int id, [FromBody] Model_Device_Sync_Request? request = null)
        {
            try
            {
                // Create default request if none provided
                request ??= new Model_Device_Sync_Request { DeviceId = id };
                request.DeviceId = id; // Ensure ID matches route parameter

                var analysis = await _deviceSyncManager.AnalyzeDeviceSyncAsync(request);

                return Ok(new
                {
                    success = true,
                    analysis = analysis,
                    summary = new
                    {
                        canProceedAutomatically = analysis.CanProceedAutomatically,
                        totalChanges = GetTotalChangesCount(analysis),
                        blockingIssuesCount = analysis.BlockingIssues.Count,
                        warningsCount = analysis.Warnings.Count,
                        hasDeviceInfoChanges = analysis.DeviceInfo.HasChanges,
                        hasScreenChanges = analysis.Screens.HasChanges,
                        hasI2CChanges = analysis.I2CDevices.HasChanges,
                        hasSensorChanges = analysis.Sensors.HasChanges
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    error = "Failed to analyze device sync",
                    message = ex.Message
                });
            }
        }

        // POST: api/devices/{id}/execute-full-sync
        [HttpPost("{id:int}/execute-full-sync")]
        public async Task<IActionResult> ExecuteFullDeviceSync(int id, [FromBody] Model_Device_Full_Sync_Request request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new
                    {
                        success = false,
                        error = "Request body is required"
                    });
                }

                request.DeviceId = id; // Ensure ID matches route parameter

                var result = await _deviceSyncManager.ExecuteFullDeviceSyncAsync(request);

                if (result.Success)
                {
                    return Ok(new
                    {
                        success = true,
                        result = result,
                        summary = new
                        {
                            totalItemsProcessed = GetTotalItemsProcessed(result),
                            deviceInfoUpdated = result.DeviceInfoUpdates > 0,
                            screensModified = result.ScreensAdded + result.ScreensUpdated + result.ScreensDeleted,
                            i2cDevicesModified = result.I2CDevicesAdded + result.I2CDevicesUpdated + result.I2CDevicesDeleted,
                            sensorsModified = result.SensorsAdded + result.SensorsUpdated + result.SensorsDeleted
                        }
                    });
                }
                else
                {
                    return StatusCode(500, new
                    {
                        success = false,
                        result = result,
                        error = result.ErrorMessage ?? "Unknown error occurred during sync"
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    error = "Failed to execute device sync",
                    message = ex.Message
                });
            }
        }

        // GET: api/devices/{id}/sync-status
        [HttpGet("{id:int}/sync-status")]
        public async Task<IActionResult> GetDeviceSyncStatus(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);
                if (device == null)
                {
                    return NotFound($"Device with ID {id} not found.");
                }

                // Check if device is eligible for sync
                var isEligible = device.IsJunctionRelayDevice && !string.IsNullOrWhiteSpace(device.IPAddress);

                // Test connectivity if eligible
                bool isReachable = false;
                if (isEligible)
                {
                    try
                    {
                        using var client = new HttpClient();
                        client.Timeout = TimeSpan.FromSeconds(3);
                        var response = await client.GetAsync($"http://{device.IPAddress}/api/device/info");
                        isReachable = response.IsSuccessStatusCode;
                    }
                    catch
                    {
                        isReachable = false;
                    }
                }

                return Ok(new
                {
                    deviceId = id,
                    deviceName = device.Name,
                    isEligibleForSync = isEligible,
                    isReachable = isReachable,
                    ipAddress = device.IPAddress,
                    lastUpdated = device.LastUpdated,
                    syncEligibilityReasons = GetSyncEligibilityReasons(device)
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    error = "Failed to get sync status",
                    message = ex.Message
                });
            }
        }

        // GET: api/devices/bulk-sync-status
        [HttpPost("bulk-sync-status")]
        public async Task<IActionResult> GetBulkSyncStatus([FromBody] List<int> deviceIds)
        {
            try
            {
                if (deviceIds == null || !deviceIds.Any())
                {
                    return BadRequest("Device IDs are required");
                }

                var devices = await _deviceDb.GetAllDevicesAsync();
                var requestedDevices = devices.Where(d => deviceIds.Contains(d.Id)).ToList();

                var syncStatuses = new Dictionary<int, object>();

                foreach (var device in requestedDevices)
                {
                    var isEligible = device.IsJunctionRelayDevice && !string.IsNullOrWhiteSpace(device.IPAddress);

                    syncStatuses[device.Id] = new
                    {
                        deviceName = device.Name,
                        isEligibleForSync = isEligible,
                        ipAddress = device.IPAddress,
                        lastUpdated = device.LastUpdated,
                        reasons = GetSyncEligibilityReasons(device)
                    };
                }

                return Ok(new
                {
                    success = true,
                    syncStatuses = syncStatuses
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    error = "Failed to get bulk sync status",
                    message = ex.Message
                });
            }
        }

        // Helper methods
        private int GetTotalChangesCount(Model_Device_Sync_Analysis analysis)
        {
            return (analysis.DeviceInfo.HasChanges ? 1 : 0) +
                   analysis.Screens.ToAdd.Count + analysis.Screens.ToUpdate.Count + analysis.Screens.ToDelete.Count +
                   analysis.I2CDevices.ToAdd.Count + analysis.I2CDevices.ToUpdate.Count + analysis.I2CDevices.ToDelete.Count +
                   analysis.Sensors.ToAdd.Count + analysis.Sensors.ToUpdate.Count + analysis.Sensors.ToDelete.Count;
        }

        private int GetTotalItemsProcessed(Model_Device_Sync_Result result)
        {
            return result.DeviceInfoUpdates +
                   result.ScreensAdded + result.ScreensUpdated + result.ScreensDeleted +
                   result.I2CDevicesAdded + result.I2CDevicesUpdated + result.I2CDevicesDeleted +
                   result.SensorsAdded + result.SensorsUpdated + result.SensorsDeleted;
        }

        private List<string> GetSyncEligibilityReasons(Model_Device device)
        {
            var reasons = new List<string>();

            if (!device.IsJunctionRelayDevice)
            {
                reasons.Add("Device is not a JunctionRelay device");
            }

            if (string.IsNullOrWhiteSpace(device.IPAddress))
            {
                reasons.Add("Device has no IP address");
            }

            if (device.Status != "Active")
            {
                reasons.Add($"Device status is '{device.Status}' (should be 'Active')");
            }

            if (reasons.Count == 0)
            {
                reasons.Add("Device is eligible for sync");
            }

            return reasons;
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
            existing.FrameLayoutId = updated.FrameLayoutId ?? existing.FrameLayoutId;
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

        // Add this endpoint to your Controller_Devices class, after your existing endpoints:

        // POST: api/devices/{id}/sync-mode
        [HttpPost("{id:int}/sync-mode")]
        public async Task<IActionResult> UpdateDeviceSyncMode(int id, [FromBody] UpdateSyncModeRequest request)
        {
            try
            {
                if (request == null || string.IsNullOrWhiteSpace(request.SyncMode))
                {
                    return BadRequest("Sync mode is required.");
                }

                // Validate sync mode values
                var validSyncModes = new[] { "cloud_health", "cloud_sync", "local_health", "local_sync", "disabled" };
                if (!validSyncModes.Contains(request.SyncMode.ToLower()))
                {
                    return BadRequest($"Invalid sync mode. Valid values are: {string.Join(", ", validSyncModes)}");
                }

                // Get the device from database
                var device = await _deviceDb.GetDeviceByIdAsync(id);
                if (device == null)
                {
                    return NotFound($"Device with ID {id} not found.");
                }

                // Update the sync mode
                device.SyncMode = request.SyncMode;
                device.LastUpdated = DateTime.UtcNow;

                var success = await _deviceDb.UpdateDeviceAsync(id, device);

                if (success)
                {
                    return Ok(new
                    {
                        success = true,
                        message = $"Sync mode updated to '{request.SyncMode}' for device '{device.Name}'",
                        deviceId = id,
                        deviceName = device.Name,
                        syncMode = request.SyncMode
                    });
                }
                else
                {
                    return StatusCode(500, new
                    {
                        success = false,
                        message = "Failed to update device sync mode"
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error updating device sync mode",
                    error = ex.Message
                });
            }
        }

        // POST: api/devices/{id}/switch-connection-method
        [HttpPost("{id:int}/switch-connection-method")]
        public async Task<IActionResult> SwitchConnectionMethod(int id, [FromBody] SwitchConnectionMethodRequest request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest("Request body is required.");
                }

                // Get the device from database
                var device = await _deviceDb.GetDeviceByIdAsync(id);
                if (device == null)
                {
                    return NotFound($"Device with ID {id} not found.");
                }

                // Validate target method
                if (request.TargetMethod != "COM" && request.TargetMethod != "Network")
                {
                    return BadRequest("TargetMethod must be either 'COM' or 'Network'.");
                }

                // Prevent switching to the same method
                var currentMethod = device.Type == "COM Device" ? "COM" : "Network";
                if (currentMethod == request.TargetMethod)
                {
                    return BadRequest($"Device is already configured as {request.TargetMethod} device.");
                }

                // Handle the switch based on target method
                if (request.TargetMethod == "Network")
                {
                    return await SwitchComToNetwork(device, request);
                }
                else
                {
                    return await SwitchNetworkToCom(device, request);
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error switching connection method",
                    error = ex.Message
                });
            }
        }

        // Helper method: Switch from COM to Network
        private async Task<IActionResult> SwitchComToNetwork(Model_Device device, SwitchConnectionMethodRequest request)
        {
            try
            {
                // Validate network configuration
                if (request.NetworkConfig == null)
                {
                    return BadRequest("NetworkConfig is required when switching to Network mode.");
                }

                if (string.IsNullOrWhiteSpace(request.NetworkConfig.WifiSSID))
                {
                    return BadRequest("WiFi SSID is required for network connection.");
                }

                // Ensure we have the COM port info from dedicated COM port field
                var comPort = device.COMPort; // Use dedicated COM port column
                if (string.IsNullOrWhiteSpace(comPort))
                {
                    return BadRequest("Device COM port information is missing.");
                }

                // Validate it's a proper COM port format
                if (!comPort.StartsWith("COM", StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest($"Invalid COM port format: '{comPort}'. Expected format like 'COM3' or 'COM5'.");
                }

                Console.WriteLine($"[SWITCH] Converting {device.Name} from COM ({comPort}) to Network");

                // Create preferences payload for the device
                var networkPreferences = new
                {
                    connMode = request.NetworkConfig.ConnectionMode ?? "wifi", // default to wifi
                    wifiSSID = request.NetworkConfig.WifiSSID,
                    wifiPassword = request.NetworkConfig.WifiPassword ?? "",
                    mqttBroker = request.NetworkConfig.MqttBroker ?? "",
                    mqttUsername = request.NetworkConfig.MqttUsername ?? "",
                    mqttPassword = request.NetworkConfig.MqttPassword ?? "",
                    rotation = request.NetworkConfig.Rotation ?? 0,
                    swapBlueGreen = request.NetworkConfig.SwapBlueGreen ?? false,
                    externalNeoPixelsData1 = request.NetworkConfig.ExternalNeoPixelsData1 ?? "0",
                    externalNeoPixelsData2 = request.NetworkConfig.ExternalNeoPixelsData2 ?? "0",
                    restart = true // Force restart to apply network settings
                };

                // Send network configuration via COM port using simple SerialPort approach
                try
                {
                    var baudRate = request.ComSettings?.BaudRate ?? 115200;
                    var timeoutMs = request.TimeoutMs ?? 10000;

                    // Use simple SerialPort approach like the controller methods
                    using var serialPort = new SerialPort(comPort, baudRate, Parity.None, 8, StopBits.One)
                    {
                        ReadTimeout = timeoutMs,
                        WriteTimeout = 1000,
                        NewLine = "\n"
                    };

                    Console.WriteLine($"[SWITCH] Opening {comPort} at {baudRate} baud...");
                    serialPort.Open();

                    Console.WriteLine($"[SWITCH] Waiting for ESP32 to stabilize...");
                    await Task.Delay(2000);

                    Console.WriteLine($"[SWITCH] Clearing buffers...");
                    serialPort.DiscardInBuffer();
                    serialPort.DiscardOutBuffer();

                    // Send network configuration as JSON command
                    var configCommand = new
                    {
                        type = "set_preferences",
                        preferences = networkPreferences
                    };

                    var requestJson = JsonConvert.SerializeObject(configCommand);
                    Console.WriteLine($"[SWITCH] Sending network config: {requestJson}");
                    serialPort.WriteLine(requestJson);

                    // Simple read - just like the controller methods
                    Console.WriteLine($"[SWITCH] Reading response...");
                    var response = serialPort.ReadExisting();

                    // If no immediate response, wait and try again
                    if (string.IsNullOrEmpty(response))
                    {
                        await Task.Delay(1000);
                        response = serialPort.ReadExisting();
                    }

                    Console.WriteLine($"[SWITCH] Sent network config to {comPort}, response: {response}");

                    // SerialPort is automatically disposed here due to 'using' statement

                    // Wait for device to restart and connect to network
                    await Task.Delay(request.RestartDelayMs ?? 5000);

                    // Device will get IP via DHCP, no need to discover immediately
                    Console.WriteLine($"[SWITCH] Network configuration sent. Device will obtain IP via DHCP.");

                    // Update device record - clear the COM port info since it's now a network device
                    device.Type = "Network Device";
                    device.IPAddress = null; // Will be updated when device is discovered on network
                    device.ConnMode = networkPreferences.connMode;
                    device.LastUpdated = DateTime.UtcNow;

                    var success = await _deviceDb.UpdateDeviceAsync(device.Id, device);

                    if (success)
                    {
                        return Ok(new
                        {
                            success = true,
                            message = $"Device '{device.Name}' network configuration sent successfully. Device will obtain IP address automatically.",
                            deviceId = device.Id,
                            oldComPort = comPort,
                            newType = device.Type,
                            note = "Device IP will be available once it connects to the network. Use device discovery to find it."
                        });
                    }
                    else
                    {
                        return StatusCode(500, "Failed to update device record in database.");
                    }
                }
                catch (Exception ex)
                {
                    return StatusCode(500, new
                    {
                        success = false,
                        message = $"Failed to send network configuration via COM port: {ex.Message}"
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error during COM to Network switch",
                    error = ex.Message
                });
            }
        }

        // Helper method: Switch from Network to COM
        private async Task<IActionResult> SwitchNetworkToCom(Model_Device device, SwitchConnectionMethodRequest request)
        {
            try
            {
                // Validate COM configuration
                if (request.ComSettings == null || string.IsNullOrWhiteSpace(request.ComSettings.ComPort))
                {
                    return BadRequest("ComSettings with ComPort is required when switching to COM mode.");
                }

                var targetComPort = request.ComSettings.ComPort;
                var currentIpAddress = device.IPAddress;

                Console.WriteLine($"[SWITCH] Converting {device.Name} from Network ({currentIpAddress}) to COM ({targetComPort})");

                // Send command to device via HTTP to switch to COM mode
                try
                {
                    using var client = new HttpClient();
                    client.Timeout = TimeSpan.FromSeconds(request.TimeoutMs / 1000 ?? 10);

                    // Create preferences to switch to COM mode
                    var comPreferences = new
                    {
                        connMode = "usb", // or "serial" depending on your device's terminology
                        restart = true
                    };

                    // Send preferences to device
                    var preferencesPayload = new
                    {
                        connMode = comPreferences.connMode,
                        restart = comPreferences.restart
                    };

                    var jsonPayload = JsonConvert.SerializeObject(preferencesPayload);
                    var content = new StringContent(jsonPayload, System.Text.Encoding.UTF8, "application/json");

                    var response = await client.PostAsync($"http://{currentIpAddress}/api/device/set-preferences", content);

                    if (!response.IsSuccessStatusCode)
                    {
                        return StatusCode(500, $"Failed to send COM mode command to device: {response.ReasonPhrase}");
                    }

                    Console.WriteLine($"[SWITCH] Sent COM mode command to {currentIpAddress}");

                    // Wait for device to restart
                    await Task.Delay(request.RestartDelayMs ?? 3000);

                    // Update device record
                    device.Type = "COM Device";
                    device.IPAddress = targetComPort; // Store COM port in IPAddress field
                    device.ConnMode = "usb";
                    device.LastUpdated = DateTime.UtcNow;

                    var success = await _deviceDb.UpdateDeviceAsync(device.Id, device);

                    if (success)
                    {
                        return Ok(new
                        {
                            success = true,
                            message = $"Device '{device.Name}' successfully switched from Network to COM mode",
                            deviceId = device.Id,
                            oldIpAddress = currentIpAddress,
                            newComPort = targetComPort,
                            newType = device.Type,
                            note = "Device should now be accessible via COM port. You may need to reconnect."
                        });
                    }
                    else
                    {
                        return StatusCode(500, "Failed to update device record in database.");
                    }
                }
                catch (HttpRequestException ex)
                {
                    return StatusCode(503, new
                    {
                        success = false,
                        message = $"Could not reach device at {currentIpAddress}: {ex.Message}",
                        suggestion = "Device may already be in COM mode. Try updating the device record manually."
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error during Network to COM switch",
                    error = ex.Message
                });
            }
        }

        // Helper endpoint to finalize network switch when IP is discovered later
        // PUT: api/devices/{id}/finalize-network-switch
        [HttpPut("{id:int}/finalize-network-switch")]
        public async Task<IActionResult> FinalizeNetworkSwitch(int id, [FromBody] FinalizeNetworkSwitchRequest request)
        {
            try
            {
                if (request == null || string.IsNullOrWhiteSpace(request.IpAddress))
                {
                    return BadRequest("IP address is required.");
                }

                var device = await _deviceDb.GetDeviceByIdAsync(id);
                if (device == null)
                {
                    return NotFound($"Device with ID {id} not found.");
                }

                // Verify device is reachable at the new IP
                try
                {
                    using var client = new HttpClient();
                    client.Timeout = TimeSpan.FromSeconds(5);
                    var response = await client.GetAsync($"http://{request.IpAddress}/api/device/info");

                    if (!response.IsSuccessStatusCode)
                    {
                        return BadRequest($"Device is not reachable at {request.IpAddress}");
                    }
                }
                catch (Exception)
                {
                    return BadRequest($"Device is not reachable at {request.IpAddress}");
                }

                // Update device record
                var oldComPort = device.IPAddress; // Should be COM port if switching from COM
                device.Type = "Network Device";
                device.IPAddress = request.IpAddress;
                device.LastUpdated = DateTime.UtcNow;

                var success = await _deviceDb.UpdateDeviceAsync(device.Id, device);

                if (success)
                {
                    return Ok(new
                    {
                        success = true,
                        message = $"Device '{device.Name}' network switch finalized",
                        deviceId = device.Id,
                        oldComPort = oldComPort,
                        newIpAddress = request.IpAddress,
                        newType = device.Type
                    });
                }
                else
                {
                    return StatusCode(500, "Failed to update device record.");
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error finalizing network switch",
                    error = ex.Message
                });
            }
        }

        public class SwitchConnectionMethodRequest
        {
            public string TargetMethod { get; set; } = string.Empty; // "COM" or "Network"
            public NetworkConfigSettings? NetworkConfig { get; set; }
            public ComConfigSettings? ComSettings { get; set; }
            public string? ExpectedIpAddress { get; set; } // For COM->Network switch
            public int? TimeoutMs { get; set; } = 10000;
            public int? RestartDelayMs { get; set; } = 5000;
        }

        public class NetworkConfigSettings
        {
            public string WifiSSID { get; set; } = string.Empty;
            public string? WifiPassword { get; set; }
            public string? ConnectionMode { get; set; } = "wifi"; // "wifi" or "ethernet"
            public string? MqttBroker { get; set; }
            public string? MqttUsername { get; set; }
            public string? MqttPassword { get; set; }
            public int? Rotation { get; set; } = 0;
            public bool? SwapBlueGreen { get; set; } = false;
            public string? ExternalNeoPixelsData1 { get; set; } = "0";
            public string? ExternalNeoPixelsData2 { get; set; } = "0";
        }

        public class ComConfigSettings
        {
            public string ComPort { get; set; } = string.Empty; // e.g., "COM3"
            public int? BaudRate { get; set; } = 115200;
        }

        public class FinalizeNetworkSwitchRequest
        {
            public string IpAddress { get; set; } = string.Empty;
        }

        public class UpdateSyncModeRequest
        {
            public string SyncMode { get; set; } = string.Empty;
        }
    }
}