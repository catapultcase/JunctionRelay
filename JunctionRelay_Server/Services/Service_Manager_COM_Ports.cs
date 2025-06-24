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

using RJCP.IO.Ports;
using System.Collections.Concurrent;
using System.IO.Ports;
using System.Text;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_COM_Ports
    {
        private readonly ConcurrentDictionary<string, SerialPortStream> _serialPorts = new();
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
                var serialPort = new SerialPortStream(portName, baudRate)
                {
                    NewLine = "\n",
                    Encoding = Encoding.UTF8 // Updated to UTF-8 for consistency
                };

                serialPort.Open();
                _serialPorts[portName] = serialPort;
                _portStatuses[portName] = "OPEN";

                Console.WriteLine($"[SUCCESS] Port {portName} opened.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error opening connection on {portName}: {ex.Message}");
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

                if (!_serialPorts.TryGetValue(portName, out SerialPortStream serialPort))
                {
                    Console.WriteLine($"[ERROR] Port {portName} is not found in open connections.");
                    return;
                }

                if (!serialPort.IsOpen)
                {
                    Console.WriteLine($"[ERROR] Port {portName} is not open.");
                    return;
                }

                byte[] buffer = Encoding.UTF8.GetBytes(data);

                serialPort.Write(buffer, 0, buffer.Length);
                serialPort.Flush(); // Ensure all bytes are pushed to the wire

                Console.WriteLine($"[SUCCESS] Data successfully sent to {portName}.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error sending data on {portName}: {ex.Message}");
            }
        }

        public bool IsPortOpen(string portName)
        {
            if (string.IsNullOrEmpty(portName))
                return false;

            return _portStatuses.TryGetValue(portName, out var status) && status == "OPEN";
        }

        public void CloseConnection(string portName)
        {
            try
            {
                if (string.IsNullOrEmpty(portName))
                    throw new ArgumentNullException(nameof(portName));

                if (_serialPorts.TryRemove(portName, out SerialPortStream serialPort))
                {
                    if (serialPort.IsOpen)
                    {
                        Console.WriteLine($"[INFO] Closing port {portName}...");
                        serialPort.Close();
                    }
                    serialPort.Dispose();
                    _portStatuses[portName] = "CLOSED";

                    Console.WriteLine($"[SUCCESS] Port {portName} closed.");
                }
                else
                {
                    Console.WriteLine($"[WARNING] Port {portName} was not found in the open connections.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error closing connection on {portName}: {ex.Message}");
            }
        }

        public void CloseAllConnections()
        {
            try
            {
                foreach (var portName in _serialPorts.Keys)
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
    }
}
