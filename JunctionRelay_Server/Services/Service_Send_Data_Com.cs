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
    public class Service_Send_Data_COM
    {
        private readonly string _comPort;
        private readonly Service_Manager_COM_Ports _comPortManager;

        // Constructor remains unchanged; it still accepts comPort dynamically
        public Service_Send_Data_COM(Service_Manager_COM_Ports comPortManager, string comPort)
        {
            _comPortManager = comPortManager;
            _comPort = comPort;
        }

        // This method sends the payload asynchronously.
        public async Task<(bool Success, string ResponseMessage)> SendPayloadAsync(string payload)
        {
            try
            {
                // Ensure the port is open before sending data
                if (!_comPortManager.IsPortOpen(_comPort))
                {
                    Console.WriteLine($"[DEBUG] COM port {_comPort} is not open, opening it now.");
                    _comPortManager.OpenConnection(_comPort, 115200);  // Open connection with default baud rate
                }

                if (!_comPortManager.IsPortOpen(_comPort))
                {
                    return (false, $"Failed to open COM port {_comPort}.");
                }

                // Convert the payload to bytes and send
                byte[] payloadBytes = Encoding.UTF8.GetBytes(payload);
                _comPortManager.SendData(_comPort, payload);

                return (true, "ACK"); // Return ACK for successful data sending
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error sending data on COM port {_comPort}: {ex.Message}");
                return (false, ex.Message);  // Return error message if something goes wrong
            }
        }

        // Start the streaming process (i.e., continuously sending data at intervals)
        public async Task StartStreamAsync(int rate, CancellationToken cancellationToken)
        {
            // Send an initial configuration payload before starting the sensor stream
            string configPayload = Service_Payload_Generator_Config.GenerateConfigurationPayload("onboard");
            Console.WriteLine($"[DEBUG] Sending initial config payload to COM port {_comPort}: {configPayload}");

            var (configSent, configResponse) = await SendPayloadAsync(configPayload);
            if (!configSent)
            {
                Console.WriteLine("[ERROR] Failed to send initial config payload before streaming.");
                return;
            }

            // Continuous loop for sending sensor data
            while (!cancellationToken.IsCancellationRequested)
            {
                string sensorPayload = Service_Payload_Generator_Sensors.GenerateSensorPayloadForScreen("onboard",8); // HARDCODED FOR NOW
                var (sensorSent, sensorResponse) = await SendPayloadAsync(sensorPayload);

                if (!sensorSent)
                {
                    Console.WriteLine("[ERROR] Failed to send data during streaming.");
                    break;
                }

                // Delay before sending the next sensor payload
                await Task.Delay(rate, cancellationToken);
            }

            Console.WriteLine($"[DEBUG] Streaming loop exited for device {_comPort}.");
        }

        // This method ensures the COM port is open before communication starts
        public void OpenPortIfNotOpen(int baudRate = 115200)
        {
            if (!_comPortManager.IsPortOpen(_comPort))
            {
                Console.WriteLine($"[DEBUG] COM port {_comPort} is not open, opening it now.");
                _comPortManager.OpenConnection(_comPort, baudRate);  // Open connection with specified baud rate
            }
            else
            {
                Console.WriteLine($"[DEBUG] COM port {_comPort} already open.");
            }
        }
    }
}
