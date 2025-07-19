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

using System.Collections.Concurrent;
using System.IO.Ports;
using System.Text;

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

                Console.WriteLine($"[SUCCESS] Port {portName} opened with standard SerialPort.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error opening connection on {portName}: {ex.Message}");
                _portStatuses[portName] = "ERROR";
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

                // Print the binary payload as hex for consistency with UI display
                //Console.Write("[COM] Raw payload (hex): ");
                //Console.Write(BytesToHex(data));
                //Console.WriteLine();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error sending binary data on {portName}: {ex.Message}");
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

        // Helper method to convert bytes to hex string with spaces for readability
        private string BytesToHex(byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0)
                return "";

            var sb = new StringBuilder(bytes.Length * 3);
            for (int i = 0; i < bytes.Length; i++)
            {
                if (i > 0)
                    sb.Append(' ');
                sb.Append(bytes[i].ToString("x2"));
            }
            return sb.ToString();
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
    }
}