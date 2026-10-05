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

using System.Text;

namespace JunctionRelayServer.Services
{
    public class Service_Send_Data_COM : IDisposable
    {
        private readonly string _comPort;
        private readonly Service_Manager_COM_Ports _comPortManager;
        private bool _disposed = false;

        public Service_Send_Data_COM(Service_Manager_COM_Ports comPortManager, string comPort)
        {
            _comPortManager = comPortManager ?? throw new ArgumentNullException(nameof(comPortManager));
            _comPort = comPort ?? throw new ArgumentNullException(nameof(comPort));

            Console.WriteLine($"[SERVICE_SEND_DATA_COM] Created COM sender for {comPort} (no chunking - direct transmission)");
        }

        public Task<(bool Success, string ResponseMessage)> SendPayloadAsync(string payload)
        {
            try
            {
                if (_disposed)
                    return Task.FromResult((false, "COM sender has been disposed."));

                if (string.IsNullOrEmpty(payload))
                    return Task.FromResult((false, "Payload cannot be null or empty."));

                // Convert string to UTF-8 bytes and send as binary
                byte[] payloadBytes = Encoding.UTF8.GetBytes(payload);
                return SendPayloadAsync(payloadBytes);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_SEND_DATA_COM] Error converting string payload: {ex.Message}");
                return Task.FromResult((false, ex.Message));
            }
        }

        public Task<(bool Success, string ResponseMessage)> SendPayloadAsync(byte[] payloadBytes)
        {
            try
            {
                if (_disposed)
                    return Task.FromResult((false, "COM sender has been disposed."));

                if (payloadBytes == null || payloadBytes.Length == 0)
                    return Task.FromResult((false, "Payload cannot be null or empty."));

                if (!_comPortManager.IsPortOpen(_comPort))
                {
                    Console.WriteLine($"[SERVICE_SEND_DATA_COM] COM port {_comPort} not open. Attempting to open...");
                    _comPortManager.OpenConnection(_comPort, 115200);
                }

                if (!_comPortManager.IsPortOpen(_comPort))
                    return Task.FromResult((false, $"Failed to open COM port {_comPort}."));

                // Send entire payload directly - no chunking
                _comPortManager.SendData(_comPort, payloadBytes);
                _comPortManager.Flush(_comPort);

                // Console.WriteLine($"[SERVICE_SEND_DATA_COM] Sent {payloadBytes.Length} bytes to {_comPort}");
                return Task.FromResult((true, "ACK"));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_SEND_DATA_COM] Error sending payload to {_comPort}: {ex.Message}");
                return Task.FromResult((false, ex.Message));
            }
        }

        public void OpenPortIfNotOpen(int baudRate = 115200)
        {
            try
            {
                if (_disposed)
                {
                    Console.WriteLine($"[SERVICE_SEND_DATA_COM] Cannot open port {_comPort} - sender has been disposed.");
                    return;
                }

                if (!_comPortManager.IsPortOpen(_comPort))
                {
                    Console.WriteLine($"[SERVICE_SEND_DATA_COM] Opening COM port {_comPort} at {baudRate} baud...");
                    _comPortManager.OpenConnection(_comPort, baudRate);

                    // Verify the port opened successfully
                    if (_comPortManager.IsPortOpen(_comPort))
                    {
                        Console.WriteLine($"[SERVICE_SEND_DATA_COM] Successfully opened COM port {_comPort}.");
                    }
                    else
                    {
                        Console.WriteLine($"[SERVICE_SEND_DATA_COM] Failed to open COM port {_comPort}.");
                    }
                }
                else
                {
                    Console.WriteLine($"[SERVICE_SEND_DATA_COM] COM port {_comPort} already open.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_SEND_DATA_COM] Error opening COM port {_comPort}: {ex.Message}");
            }
        }

        public bool IsOpen()
        {
            if (_disposed)
            {
                return false;
            }

            try
            {
                return _comPortManager.IsPortOpen(_comPort);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_SEND_DATA_COM] Error checking if port {_comPort} is open: {ex.Message}");
                return false;
            }
        }

        public void ClosePort()
        {
            try
            {
                if (!_disposed && _comPortManager.IsPortOpen(_comPort))
                {
                    Console.WriteLine($"[SERVICE_SEND_DATA_COM] Closing COM port {_comPort}...");
                    _comPortManager.CloseConnection(_comPort);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_SEND_DATA_COM] Error closing COM port {_comPort}: {ex.Message}");
            }
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                ClosePort();
                _disposed = true;
            }
        }
    }
}