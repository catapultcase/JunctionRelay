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

using Newtonsoft.Json;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Ports;
using System.Text;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_COM_Ports
    {
        private readonly ConcurrentDictionary<string, SerialPort> _serialPorts = new();
        private readonly ConcurrentDictionary<string, string> _portStatuses = new();

        public string[] GetAvailableCOMPorts()
        {
            return SerialPort.GetPortNames();
        }

        public void OpenConnection(string portName, int baudRate)
        {
            try
            {
                if (string.IsNullOrEmpty(portName))
                    throw new ArgumentNullException(nameof(portName), "Port name cannot be null or empty.");

                if (_serialPorts.ContainsKey(portName))
                {
                    Console.WriteLine($"[INFO] Port {portName} is already open.");
                    return;
                }

                Console.WriteLine($"[INFO] Opening serial port: {portName} at {baudRate} baud...");

                var serialPort = new SerialPort(portName, baudRate)
                {
                    // Standard Arduino-compatible settings
                    DataBits = 8,
                    Parity = Parity.None,
                    StopBits = StopBits.One,
                    Handshake = Handshake.None,

                    // Timeouts (important for stability)
                    ReadTimeout = 1000,
                    WriteTimeout = 1000,

                    // Buffer sizes (reasonable for Arduino)
                    ReadBufferSize = 4096,
                    WriteBufferSize = 4096,

                    // Encoding
                    Encoding = Encoding.UTF8,
                    NewLine = "\n",

                    // Flow control (disable for Arduino)
                    DtrEnable = false,
                    RtsEnable = false
                };

                serialPort.Open();

                // Small delay after opening (Arduino best practice)
                Thread.Sleep(100);

                _serialPorts[portName] = serialPort;
                _portStatuses[portName] = "OPEN";

                Console.WriteLine($"[SUCCESS] Port {portName} opened successfully.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error opening connection on {portName}: {ex.Message}");
                _portStatuses[portName] = "ERROR";
                throw;
            }
        }

        public void SendData(string portName, string data)
        {
            try
            {
                if (string.IsNullOrEmpty(portName))
                    throw new ArgumentNullException(nameof(portName));

                if (string.IsNullOrEmpty(data))
                    throw new ArgumentNullException(nameof(data));

                if (!_serialPorts.TryGetValue(portName, out var serialPort) || !serialPort.IsOpen)
                {
                    Console.WriteLine($"[ERROR] Port {portName} is not open or not found.");
                    return;
                }

                byte[] buffer = Encoding.UTF8.GetBytes(data);
                serialPort.Write(buffer, 0, buffer.Length);

                // Force immediate transmission
                serialPort.BaseStream.Flush();

                // Print the raw string payload
                Console.Write("[COM] Raw payload: ");
                Console.Write(data);
                Console.WriteLine();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error sending data on {portName}: {ex.Message}");
                throw;
            }
        }

        public void SendData(string portName, byte[] data)
        {
            try
            {
                if (string.IsNullOrEmpty(portName))
                    throw new ArgumentNullException(nameof(portName));

                if (data == null || data.Length == 0)
                    throw new ArgumentNullException(nameof(data));

                if (!_serialPorts.TryGetValue(portName, out var serialPort) || !serialPort.IsOpen)
                {
                    Console.WriteLine($"[ERROR] Port {portName} is not open or not found.");
                    return;
                }

                serialPort.Write(data, 0, data.Length);

                // Force immediate transmission
                serialPort.BaseStream.Flush();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error sending binary data on {portName}: {ex.Message}");
                throw;
            }
        }

        public void Flush(string portName)
        {
            if (string.IsNullOrEmpty(portName)) return;

            if (_serialPorts.TryGetValue(portName, out var port) && port.IsOpen)
            {
                // Flush both the SerialPort buffer and the underlying stream
                port.BaseStream.Flush();
            }
        }

        public bool IsPortOpen(string portName)
        {
            if (string.IsNullOrEmpty(portName))
                return false;

            // Check both status and actual port state
            if (!_portStatuses.TryGetValue(portName, out var status) || status != "OPEN")
                return false;

            if (!_serialPorts.TryGetValue(portName, out SerialPort? serialPort) || serialPort == null)
                return false;

            return serialPort.IsOpen;
        }

        public void CloseConnection(string portName)
        {
            try
            {
                if (string.IsNullOrEmpty(portName))
                    throw new ArgumentNullException(nameof(portName));

                if (_serialPorts.TryRemove(portName, out SerialPort? serialPort) && serialPort != null)
                {
                    if (serialPort.IsOpen)
                    {
                        Console.WriteLine($"[INFO] Closing port {portName}...");

                        // Proper cleanup sequence
                        serialPort.DiscardInBuffer();
                        serialPort.DiscardOutBuffer();
                        serialPort.Close();
                    }
                    serialPort.Dispose();
                    _portStatuses[portName] = "CLOSED";

                    Console.WriteLine($"[SUCCESS] Port {portName} closed.");
                }
                else
                {
                    Console.WriteLine($"[WARNING] Port {portName} was not found in the open connections.");
                    _portStatuses.TryRemove(portName, out _); // Clean up status if port wasn't found
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error closing connection on {portName}: {ex.Message}");
                _portStatuses[portName] = "ERROR";
            }
        }

        public void CloseAllConnections()
        {
            try
            {
                var portNames = _serialPorts.Keys.ToList(); // Create a copy to avoid enumeration issues
                foreach (var portName in portNames)
                {
                    CloseConnection(portName);
                }
                _serialPorts.Clear();
                _portStatuses.Clear();
                Console.WriteLine("[INFO] Closed all serial ports.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error closing all connections: {ex.Message}");
            }
        }

        public string GetPortStatus(string portName)
        {
            if (string.IsNullOrEmpty(portName))
                throw new ArgumentNullException(nameof(portName));

            if (!_portStatuses.TryGetValue(portName, out var status) || string.IsNullOrEmpty(status))
                return "CLOSED";

            return status;
        }

        // Additional helper methods for better management
        public IReadOnlyDictionary<string, string> GetAllPortStatuses()
        {
            return new Dictionary<string, string>(_portStatuses);
        }

        public int GetOpenPortCount()
        {
            return _portStatuses.Count(kvp => kvp.Value == "OPEN");
        }

        public void Dispose()
        {
            CloseAllConnections();
        }

        // Get COM port info (for UI display)
        public object GetPortInfo(string portName)
        {
            try
            {
                var status = GetPortStatus(portName);
                var isOpen = IsPortOpen(portName);

                return new
                {
                    portName = portName,
                    status = status,
                    isOpen = isOpen,
                    isAvailable = !isOpen && status != "ERROR"
                };
            }
            catch (Exception ex)
            {
                return new
                {
                    portName = portName,
                    status = "ERROR",
                    isOpen = false,
                    isAvailable = false,
                    error = ex.Message
                };
            }
        }

        // DEVICE INFO


        public async Task<Dictionary<string, object>?> GetDeviceInfoViaSerial(string portName, int baudRate, int timeoutMs)
        {
            try
            {
                Console.WriteLine($"[COM] Getting device info from {portName} at {baudRate} baud");

                using var serialPort = new SerialPort(portName, baudRate)
                {
                    DataBits = 8,
                    Parity = Parity.None,
                    StopBits = StopBits.One,
                    Handshake = Handshake.None,
                    ReadTimeout = 1000,
                    WriteTimeout = 1000,
                    ReadBufferSize = 4096,
                    WriteBufferSize = 4096,
                    Encoding = Encoding.UTF8,
                    NewLine = "\n",
                    DtrEnable = true,
                    RtsEnable = false
                };

                serialPort.Open();
                await Task.Delay(2000); // Allow ESP32 to boot

                serialPort.DiscardInBuffer();
                serialPort.DiscardOutBuffer();

                var requestJson = "{\"type\":\"device_info\"}\n";
                serialPort.Write(requestJson);
                serialPort.BaseStream.Flush();
                await Task.Delay(50); // Allow ESP32 to respond

                Console.WriteLine($"📤 Sending: {requestJson.Trim()}");
                Console.WriteLine("⏳ Waiting for response...");

                var buffer = new StringBuilder();
                var startTime = DateTime.UtcNow;
                string? extractedJson = null;

                while ((DateTime.UtcNow - startTime).TotalMilliseconds < timeoutMs)
                {
                    try
                    {
                        if (serialPort.BytesToRead > 0)
                        {
                            string incoming = serialPort.ReadExisting();
                            if (!string.IsNullOrWhiteSpace(incoming))
                            {
                                buffer.Append(incoming);

                                var lines = incoming.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                                foreach (var line in lines)
                                {
                                    Console.WriteLine($"📋 Read: {line}");

                                    if (extractedJson == null && line.Trim().StartsWith("{") && line.Trim().EndsWith("}"))
                                    {
                                        try
                                        {
                                            var parsed = JsonDocument.Parse(line.Trim());
                                            extractedJson = line.Trim();
                                        }
                                        catch { }
                                    }
                                }

                                if (extractedJson != null)
                                {
                                    Console.WriteLine("✅ Complete JSON response found!");
                                    Console.WriteLine($"📄 Response: {extractedJson}");

                                    var parsed = JsonConvert.DeserializeObject<Dictionary<string, object>>(extractedJson);
                                    return parsed;
                                }
                            }
                        }
                    }
                    catch (TimeoutException)
                    {
                        // harmless, just retry
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[COM] Read error: {ex.Message}");
                    }

                    await Task.Delay(50);
                }

                Console.WriteLine("⏰ Timeout after waiting for valid JSON.");
                Console.WriteLine($"📝 Final buffer contents: {buffer.Length} chars");
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[COM] Error getting device info from {portName}: {ex.Message}");
                return null;
            }
        }

        public async Task<Dictionary<string, object>?> GetDeviceCapabilitiesViaSerial(string portName, int baudRate, int timeoutMs)
        {
            try
            {
                Console.WriteLine($"[COM] Getting device capabilities from {portName} at {baudRate} baud");

                using var serialPort = new SerialPort(portName, baudRate, Parity.None, 8, StopBits.One)
                {
                    ReadTimeout = 1000,
                    WriteTimeout = 1000,
                    NewLine = "\n",
                    DtrEnable = true,
                    RtsEnable = true
                };

                Console.WriteLine($"[COM] Opening {portName}...");
                serialPort.Open();

                Console.WriteLine("[COM] Waiting for ESP32...");
                await Task.Delay(2000);

                serialPort.DiscardInBuffer();
                serialPort.DiscardOutBuffer();

                var request = new { type = "device_capabilities" };
                var requestJson = JsonConvert.SerializeObject(request);
                Console.WriteLine($"[COM] Sending: {requestJson}");
                serialPort.WriteLine(requestJson);

                var start = DateTime.Now;
                var builder = new StringBuilder();

                while ((DateTime.Now - start).TotalMilliseconds < timeoutMs)
                {
                    try
                    {
                        await Task.Delay(200); // Small wait
                        string chunk = serialPort.ReadExisting();

                        if (!string.IsNullOrWhiteSpace(chunk))
                        {
                            builder.Append(chunk);
                            Console.WriteLine($"[COM] 📥 Chunk received ({chunk.Length} chars)");
                        }

                        // Try extracting JSON if we have any accumulated data
                        var jsonRaw = ExtractJsonFromResponse(builder.ToString());
                        if (!string.IsNullOrEmpty(jsonRaw))
                        {
                            Console.WriteLine($"[COM] ✅ JSON found: {jsonRaw}");
                            var parsed = JsonConvert.DeserializeObject<Dictionary<string, object>>(jsonRaw);
                            return parsed;
                        }
                    }
                    catch (TimeoutException)
                    {
                        // Ignore read timeouts
                    }
                }

                Console.WriteLine("[COM] ❌ Timeout: No valid JSON found.");
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[COM] ❌ Error getting capabilities: {ex.Message}");
                return null;
            }
        }


        private string? ExtractJsonFromResponse(string response)
        {
            if (string.IsNullOrWhiteSpace(response))
                return null;

            int braceDepth = 0;
            int jsonStart = -1;

            for (int i = 0; i < response.Length; i++)
            {
                if (response[i] == '{')
                {
                    if (braceDepth == 0)
                        jsonStart = i;
                    braceDepth++;
                }
                else if (response[i] == '}')
                {
                    braceDepth--;
                    if (braceDepth == 0 && jsonStart != -1)
                    {
                        int jsonEnd = i;
                        string jsonCandidate = response.Substring(jsonStart, jsonEnd - jsonStart + 1);

                        try
                        {
                            JsonConvert.DeserializeObject<object>(jsonCandidate);
                            return jsonCandidate;
                        }
                        catch
                        {
                            jsonStart = -1;
                        }
                    }
                }
            }

            return null;
        }



    }
}