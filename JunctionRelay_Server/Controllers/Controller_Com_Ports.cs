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

using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Services;
using Newtonsoft.Json;
using JunctionRelayServer.Models;
using System.IO.Ports;

namespace JunctionRelayServer.Controllers
{
    [Route("api/com")]
    [ApiController]
    public class Controller_COM_Ports : ControllerBase
    {
        private readonly Service_Manager_COM_Ports _comPortManager;
        private readonly Service_Database_Manager_Devices _deviceDb;

        public Controller_COM_Ports(Service_Manager_COM_Ports comPortManager, Service_Database_Manager_Devices deviceDb)
        {
            _comPortManager = comPortManager;
            _deviceDb = deviceDb;
        }
 
        // GET: api/com/ports
        [HttpGet("ports")]
        public IActionResult GetAvailableComPorts()
        {
            try
            {
                var comPorts = _comPortManager.GetAvailableCOMPorts();
                return Ok(comPorts);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // GET: api/com/scan
        [HttpGet("scan")]
        public async Task<IActionResult> ScanComPorts([FromQuery] int baudRate = 115200, [FromQuery] int timeoutMs = 3000)
        {
            try
            {
                var results = await ScanComPortsInternal(baudRate, timeoutMs);
                return Ok(results);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // GET: api/com/scan/stream
        [HttpGet("scan/stream")]
        public async Task ScanComPortsStreaming([FromQuery] int baudRate = 115200, [FromQuery] int timeoutMs = 3000)
        {
            Response.Headers["Content-Type"] = "text/event-stream";
            Response.Headers["Cache-Control"] = "no-cache";
            Response.Headers["Connection"] = "keep-alive";
            Response.Headers["Access-Control-Allow-Origin"] = "*";

            try
            {
                var existingDevices = await _deviceDb.GetAllDevicesAsync();
                var availablePorts = _comPortManager.GetAvailableCOMPorts();

                // Send status update
                await SendStreamMessage("status", new { message = $"Scanning {availablePorts.Length} COM ports at {baudRate} baud..." });

                foreach (var portName in availablePorts)
                {
                    try
                    {
                        // Send status for current port
                        await SendStreamMessage("status", new { message = $"Checking {portName}..." });

                        var enrichedDevice = await ScanSingleComPort(portName, baudRate, timeoutMs, existingDevices);

                        // Send device result
                        var json = System.Text.Json.JsonSerializer.Serialize(enrichedDevice);
                        await Response.WriteAsync($"data: {json}\n\n");
                        await Response.Body.FlushAsync();

                        // Small delay between ports
                        await Task.Delay(100);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error scanning port {portName}: {ex.Message}");
                        // Continue with next port
                    }
                }

                // Send completion event
                await SendStreamMessage("complete", new
                {
                    status = "complete",
                    message = $"COM port scan completed. Checked {availablePorts.Length} ports."
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in COM streaming scan: {ex.Message}");
                try
                {
                    await SendStreamMessage("error", new { error = ex.Message });
                }
                catch
                {
                    Console.WriteLine("Could not write error to stream - connection likely closed");
                }
            }
        }

        // GET: api/com/info
        [HttpGet("info")]
        public async Task<IActionResult> GetComDeviceInfo([FromQuery] string portName, [FromQuery] int baudRate = 115200, [FromQuery] int timeoutMs = 3000)
        {
            if (string.IsNullOrWhiteSpace(portName))
                return BadRequest("Port name is required.");

            try
            {
                var deviceInfo = await _comPortManager.GetDeviceInfoViaSerial(portName, baudRate, timeoutMs);
                return Ok(new { deviceInfo });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // GET: api/com/capabilities
        [HttpGet("capabilities")]
        public async Task<IActionResult> GetComDeviceCapabilities([FromQuery] string portName, [FromQuery] int baudRate = 115200, [FromQuery] int timeoutMs = 3000)
        {
            if (string.IsNullOrWhiteSpace(portName))
                return BadRequest("Port name is required.");

            try
            {
                var capabilities = await _comPortManager.GetDeviceCapabilitiesViaSerial(portName, baudRate, timeoutMs);
                if (capabilities == null)
                    return StatusCode(504, new { error = "No valid capabilities response received." });

                return Ok(new { capabilities });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }


        // POST: api/com/open?portName=COM3&baudRate=115200
        [HttpPost("open")]
        public IActionResult OpenConnection([FromQuery] string portName, [FromQuery] int baudRate)
        {
            try
            {
                _comPortManager.OpenConnection(portName, baudRate);
                return Ok($"Port {portName} opened at {baudRate} baud.");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // POST: api/com/close?portName=COM3
        [HttpPost("close")]
        public IActionResult CloseConnection([FromQuery] string portName)
        {
            try
            {
                _comPortManager.CloseConnection(portName);
                return Ok($"Port {portName} closed.");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // POST: api/com/send?portName=COM3
        [HttpPost("send")]
        public async Task<IActionResult> SendData([FromQuery] string portName)
        {
            try
            {
                using (StreamReader reader = new StreamReader(Request.Body))
                {
                    string data = await reader.ReadToEndAsync();

                    if (string.IsNullOrWhiteSpace(data))
                        return BadRequest("The data field is required.");

                    Console.WriteLine($"[INFO] Received raw data for {portName}: {data}");

                    _comPortManager.SendData(portName, data);

                    return Ok(new { message = $"Data sent to port {portName}.", sentData = data });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error sending data: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // GET: api/com/status?portName=COM3
        [HttpGet("status")]
        public IActionResult GetPortStatus([FromQuery] string portName)
        {
            try
            {
                var status = _comPortManager.GetPortStatus(portName);
                return Ok(status);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // ==========================================
        // PRIVATE HELPER METHODS - SIMPLIFIED
        // ==========================================

        private async Task<List<object>> ScanComPortsInternal(int baudRate, int timeoutMs)
        {
            var existingDevices = await _deviceDb.GetAllDevicesAsync();
            var availablePorts = _comPortManager.GetAvailableCOMPorts();
            var results = new List<object>();

            foreach (var portName in availablePorts)
            {
                try
                {
                    var enrichedDevice = await ScanSingleComPort(portName, baudRate, timeoutMs, existingDevices);
                    results.Add(enrichedDevice);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error scanning port {portName}: {ex.Message}");
                    // Add port even if it failed to scan
                    results.Add(CreateFailedPortResult(portName, ex.Message));
                }
            }

            return results;
        }

        private async Task<object> ScanSingleComPort(string portName, int baudRate, int timeoutMs, List<Model_Device> existingDevices)
        {
            Console.WriteLine($"[COM SCAN] Scanning port: {portName}");

            string uniqueIdentifier = portName; // Default to port name
            bool isJunctionRelayDevice = false;
            string deviceName = $"{portName} Device";
            string status = "NEW_DEVICE";
            Dictionary<string, object>? deviceInfo = null; // Store the full device info

            // Try to get device info via simple serial communication
            try
            {
                deviceInfo = await _comPortManager.GetDeviceInfoViaSerial(portName, baudRate, 2000); // Shorter timeout for scan
                if (deviceInfo != null)
                {
                    isJunctionRelayDevice = true;

                    // Extract device name and unique identifier from actual response
                    if (deviceInfo.ContainsKey("deviceModel") && !string.IsNullOrEmpty(deviceInfo["deviceModel"]?.ToString()))
                    {
                        deviceName = deviceInfo["deviceModel"]?.ToString() ?? deviceName;
                    }

                    if (deviceInfo.ContainsKey("uniqueIdentifier") && !string.IsNullOrEmpty(deviceInfo["uniqueIdentifier"]?.ToString()))
                    {
                        uniqueIdentifier = deviceInfo["uniqueIdentifier"]?.ToString() ?? uniqueIdentifier;
                    }

                    Console.WriteLine($"[COM SCAN] JunctionRelay device found on {portName}: {deviceName} (ID: {uniqueIdentifier})");
                }
                else
                {
                    status = "NO_RESPONSE";
                    Console.WriteLine($"[COM SCAN] Port {portName} opened but device did not respond");
                }
            }
            catch (UnauthorizedAccessException)
            {
                status = "BUSY";
                Console.WriteLine($"[COM SCAN] Port {portName} is busy/in use by another application");
            }
            catch (Exception ex)
            {
                status = "ERROR";
                Console.WriteLine($"[COM SCAN] Error accessing port {portName}: {ex.Message}");
            }

            // Check if device already exists in database
            var matchedDevices = existingDevices.Where(d =>
                d.UniqueIdentifier == uniqueIdentifier ||
                (d.Type == "COM Device" && d.IPAddress == portName)
            ).ToList();

            if (matchedDevices.Any())
            {
                if (status == "NEW_DEVICE")
                {
                    status = "DEVICE_EXISTS";
                }
            }

            var result = new
            {
                Instance = deviceName,
                IpAddress = portName, // Using IP field to store COM port name for consistency
                MacAddress = uniqueIdentifier,
                Status = status,
                IsJunctionRelayDevice = isJunctionRelayDevice,
                DiscoveryMethod = "com_port",
                MatchingDeviceCount = matchedDevices.Count,
                BaudRate = baudRate,
                PortName = portName,
                Type = "COM Device",
                // Add the missing device info fields
                DeviceModel = deviceInfo?.ContainsKey("deviceModel") == true ? deviceInfo["deviceModel"]?.ToString() : null,
                FirmwareVersion = deviceInfo?.ContainsKey("firmwareVersion") == true ? deviceInfo["firmwareVersion"]?.ToString() : null,
                CustomFirmware = deviceInfo?.ContainsKey("customFirmware") == true ? deviceInfo["customFirmware"] : null
            };

            Console.WriteLine($"[COM SCAN] Completed scan for {portName}: Status = {status}, Name = {deviceName}");
            return result;
        }

        private object CreateFailedPortResult(string portName, string error)
        {
            return new
            {
                Instance = $"{portName} Device",
                IpAddress = portName,
                MacAddress = portName,
                Status = "ERROR",
                IsJunctionRelayDevice = false,
                DiscoveryMethod = "com_port",
                MatchingDeviceCount = 0,
                BaudRate = 0,
                PortName = portName,
                Type = "COM Device",
                Error = error
            };
        }
                
        private async Task SendStreamMessage(string eventType, object data)
        {
            var json = System.Text.Json.JsonSerializer.Serialize(data);
            await Response.WriteAsync($"event: {eventType}\ndata: {json}\n\n");
            await Response.Body.FlushAsync();
        }
    }
}