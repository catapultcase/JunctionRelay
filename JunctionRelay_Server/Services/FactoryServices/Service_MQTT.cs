/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

using JunctionRelayServer.Models;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Client.Options;
using MQTTnet.Formatter;
using MQTTnet.Protocol;
using System.Collections.Concurrent;
using System.Text;

namespace JunctionRelayServer.Services.FactoryServices
{
    public class Service_MQTT : IService
    {
        private Model_Service? _service;
        private readonly IMqttClient _mqttClient;
        private Action<string, string>? _messageHandler;
        private readonly ConcurrentDictionary<string, MqttQualityOfServiceLevel> _subscribedTopics = new();  // Track QoS per topic
        private readonly ConcurrentDictionary<string, string> _latestPayloads = new();

        public bool IsConnected => _mqttClient.IsConnected;

        // Constructor to initialize the MQTT client
        public Service_MQTT()
        {
            var factory = new MqttFactory();
            _mqttClient = factory.CreateMqttClient();
        }

        // Set the service configuration dynamically
        public void SetService(Model_Service service)
        {
            if (_service != null && _service.Id == service.Id)
                return; // Already set

            if (_mqttClient.IsConnected)
                throw new InvalidOperationException($"[SERVICE_MQTT][{_service?.Id}] Cannot reset MQTT service while connected.");

            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        // Get the current service configuration
        public Model_Service? GetCurrentService() => _service;

        // Connect to the MQTT broker asynchronously
        public async Task ConnectAsync()
        {
            if (_service == null ||
                string.IsNullOrEmpty(_service.MQTTBrokerAddress) ||
                string.IsNullOrEmpty(_service.MQTTBrokerPort))
            {
                throw new InvalidOperationException($"[SERVICE_MQTT][{_service?.Id}] MQTT broker address and port must be provided.");
            }

            if (_mqttClient.IsConnected)
            {
                Console.WriteLine($"[SERVICE_MQTT][{_service.Id}] MQTT client is already connected.");
                return;
            }

            var options = new MqttClientOptionsBuilder()
                .WithTcpServer(_service.MQTTBrokerAddress, int.Parse(_service.MQTTBrokerPort))
                .WithCredentials(_service.MQTTUsername, _service.MQTTPassword)
                .WithProtocolVersion(MqttProtocolVersion.V311)
                .Build();

            _mqttClient.UseApplicationMessageReceivedHandler(e =>
            {
                var topic = e.ApplicationMessage.Topic;
                var payload = Encoding.UTF8.GetString(e.ApplicationMessage.Payload ?? Array.Empty<byte>());

                Console.WriteLine($"[SERVICE_MQTT][{_service.Id}] Received on '{topic}': {payload}");

                _latestPayloads[topic] = payload;
                Console.WriteLine($"[SERVICE_MQTT][{_service.Id}] Payload stored for topic '{topic}': {payload}");
                _messageHandler?.Invoke(topic, payload);
            });

            try
            {
                await _mqttClient.ConnectAsync(options);
                Console.WriteLine($"[SERVICE_MQTT][{_service.Id}] MQTT client connected.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MQTT][{_service.Id}] MQTT connection failed: {ex.Message}");
                throw;
            }
        }



        // Get a list of subscribed topics
        public List<string> GetSubscribedTopics() => _subscribedTopics.Keys.ToList();

        // Get the latest payload for a given topic
        public string? GetLatestPayload(string topic)
        {
            _latestPayloads.TryGetValue(topic, out var payload);
            return payload;
        }



        // Get all the latest payloads for all topics
        public Dictionary<string, string> GetAllLatestPayloads() => new(_latestPayloads);




        // Subscribe to an MQTT topic with optional force and QoS
        public async Task SubscribeAsync(string topic, int qos = 0, bool force = false)
        {
            if (!_mqttClient.IsConnected)
            {
                Console.WriteLine($"[SERVICE_MQTT][{_service.Id}] MQTT client is not connected. Attempting to reconnect.");
                await ConnectAsync();
            }

            if (!force && _subscribedTopics.ContainsKey(topic))
            {
                // If not forcing, and we think we're already subscribed, skip
                return;
            }

            var qosLevel = (MqttQualityOfServiceLevel)Math.Clamp(qos, 0, 2);

            await _mqttClient.SubscribeAsync(new MqttTopicFilterBuilder()
                .WithTopic(topic)
                .WithQualityOfServiceLevel(qosLevel)
                .Build());

            _subscribedTopics[topic] = qosLevel;  // (Re)set it just in case
            Console.WriteLine($"[SERVICE_MQTT][{_service.Id}] Subscribed to topic: {topic} with QoS {qosLevel}");
        }

        public int? GetSubscribedQoS(string topic)
        {
            if (_subscribedTopics.TryGetValue(topic, out var qos))
                return (int)qos;
            return null;
        }


        // Unsubscribe from an MQTT topic
        public async Task UnsubscribeAsync(string topic)
        {
            if (!_mqttClient.IsConnected)
            {
                Console.WriteLine($"[SERVICE_MQTT][{_service?.Id}] MQTT client is not connected. Attempting to reconnect.");
                await ConnectAsync();
            }

            if (_subscribedTopics.ContainsKey(topic))
            {
                await _mqttClient.UnsubscribeAsync(topic);
                _subscribedTopics.TryRemove(topic, out _);
                Console.WriteLine($"[SERVICE_MQTT][{_service?.Id}] Unsubscribed from topic: {topic}");
            }
            else
            {
                Console.WriteLine($"[SERVICE_MQTT][{_service?.Id}] Topic '{topic}' not found in subscribed topics, skipping unsubscribe.");
            }
        }

        // Publish a message to an MQTT topic
        public async Task PublishAsync(string topic, string message, int qos = 0)
        {
            if (!_mqttClient.IsConnected)
            {
                Console.WriteLine($"[SERVICE_MQTT][{_service.Id}] MQTT client is not connected. Attempting to reconnect.");
                await ConnectAsync();
            }

            var qosLevel = (MqttQualityOfServiceLevel)Math.Clamp(qos, 0, 2);

            var mqttMessage = new MqttApplicationMessageBuilder()
                .WithTopic(topic)
                .WithPayload(message)
                .WithQualityOfServiceLevel(qosLevel)
                .Build();

            // Console.WriteLine($"[SERVICE_MQTT][{_service.Id}] Publishing to topic '{topic}' with QoS {(int)qosLevel}...");

            await _mqttClient.PublishAsync(mqttMessage);
        }


        // Disconnect the MQTT client
        public async Task DisconnectAsync()
        {
            if (_mqttClient.IsConnected)
            {
                await _mqttClient.DisconnectAsync();
                Console.WriteLine($"[SERVICE_MQTT][{_service.Id}] MQTT client disconnected.");
            }
            else
            {
                Console.WriteLine($"[SERVICE_MQTT][{_service.Id}] MQTT client is not connected.");
            }
        }

        // Use a message handler for received messages
        public void UseMessageHandler(Action<string, string> handler)
        {
            _messageHandler = handler;
        }
    }
}
