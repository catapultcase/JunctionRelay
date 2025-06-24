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

using JunctionRelayServer.Services.FactoryServices;


namespace JunctionRelayServer.Services
{
    public class Service_Send_Data_MQTT
    {
        private readonly Service_MQTT _mqttService;

        public Service_Send_Data_MQTT(Service_MQTT mqttService)
        {
            _mqttService = mqttService ?? throw new ArgumentNullException(nameof(mqttService));
        }

        // Publish to a given topic with optional QoS
        public async Task<(bool Success, string ResponseMessage)> PublishTopicAsync(string topic, string payload, int qos = 0)
        {
            try
            {
                if (!_mqttService.IsConnected)
                {
                    Console.WriteLine("[SERVICE_SEND_DATA_MQTT] MQTT client is not connected. Attempting to connect.");
                    await _mqttService.ConnectAsync();
                }

                if (!_mqttService.IsConnected)
                {
                    return (false, "MQTT client failed to connect.");
                }

                await _mqttService.PublishAsync(topic, payload, qos);
                return (true, "Payload sent successfully via MQTT.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_SEND_DATA_MQTT] Error sending payload via MQTT: {ex.Message}");
                return (false, ex.Message);
            }
        }
    }
}
