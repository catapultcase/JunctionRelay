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
using System.Collections.Concurrent;
using JunctionRelayServer.Services.FactoryServices;
using System.Data;
using Microsoft.Data.Sqlite;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace JunctionRelayServer.Services
{
    public class Service_Stream_Manager_MQTT
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IDbConnection _db;
        private readonly Func<Type, Model_Service, IService> _serviceFactory;
        private Service_MQTT? _mqttService; // Made nullable to fix CS8618

        private readonly ConcurrentDictionary<int, Service_MQTT> _mqttInstances = new();
        private readonly ConcurrentDictionary<int, StreamInfo> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _deviceLatencies = new();

        public Service_Stream_Manager_MQTT(
            IServiceScopeFactory scopeFactory,
            Func<Type, Model_Service, IService> serviceFactory,
            IDbConnection db)
        {
            _scopeFactory = scopeFactory;
            _serviceFactory = serviceFactory;
            _db = db;
        }

        private Service_MQTT GetOrCreateMqttService(Model_Service service)
        {
            if (!_mqttInstances.TryGetValue(service.Id, out var mqtt))
            {
                mqtt = _serviceFactory(typeof(Service_MQTT), service) as Service_MQTT
                       ?? throw new InvalidOperationException("Failed to create MQTT service");
                mqtt.SetService(service);
                _mqttInstances[service.Id] = mqtt;
            }
            return mqtt;
        }

        private async Task EnsureConnectedAsync(Model_Service service, Service_MQTT mqtt)
        {
            if (!mqtt.IsConnected)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] MQTT not connected for Service {service.Id}, reconnecting...");
                await ConnectAsync(service);
            }
        }

        public void SetService(Model_Service service)
        {
            if (service == null) throw new ArgumentNullException(nameof(service));
            _mqttService = GetOrCreateMqttService(service);
            _mqttService.SetService(service);
        }

        public class StreamInfo
        {
            public string DeviceName { get; set; } = string.Empty;
            public int Rate { get; set; }
            public string Status { get; set; } = string.Empty;

            [JsonIgnore]
            public CancellationTokenSource Cts { get; set; } = new();

            public int ScreenId { get; set; }
            public string ScreenName { get; set; } = string.Empty;
            public int SensorsCount { get; set; }
            public long Latency { get; set; }
            public DateTime LastSentTime { get; set; }
            public string Protocol { get; set; } = "MQTT";

            // Only the numeric/string prefix before the first '{'
            public string StandardConfigPayloadPrefix { get; set; } = string.Empty;
            public string MqttConfigPayloadPrefix { get; set; } = string.Empty;
            public string LastSentPayloadPrefix { get; set; } = string.Empty;

            // Parsed JSON docs (never null to avoid CS8602)
            [JsonIgnore]
            public JsonDocument StandardConfigPayloadDoc { get; set; } = JsonDocument.Parse("{}");
            [JsonIgnore]
            public JsonDocument MqttConfigPayloadDoc { get; set; } = JsonDocument.Parse("{}");
            [JsonIgnore]
            public JsonDocument LastSentPayloadDoc { get; set; } = JsonDocument.Parse("{}");

            // Thread-safe cached JSON strings to avoid accessing disposed JsonDocuments
            private string _standardConfigPayloadJsonCache = "{}";
            private string _mqttConfigPayloadJsonCache = "{}";
            private string _lastSentPayloadJsonCache = "{}";
            private readonly object _jsonCacheLock = new object();

            // Expose raw JSON strings so we never serialize a disposed JsonDocument/JsonElement
            public string StandardConfigPayloadJson
            {
                get
                {
                    lock (_jsonCacheLock)
                    {
                        return _standardConfigPayloadJsonCache;
                    }
                }
            }

            public string MqttConfigPayloadJson
            {
                get
                {
                    lock (_jsonCacheLock)
                    {
                        return _mqttConfigPayloadJsonCache;
                    }
                }
            }

            public string LastSentPayloadJson
            {
                get
                {
                    lock (_jsonCacheLock)
                    {
                        return _lastSentPayloadJsonCache;
                    }
                }
            }

            // Method to safely update the standard config payload and cache
            public void UpdateStandardConfigPayload(string jsonString)
            {
                lock (_jsonCacheLock)
                {
                    StandardConfigPayloadDoc?.Dispose();
                    StandardConfigPayloadDoc = JsonDocument.Parse(jsonString);
                    _standardConfigPayloadJsonCache = jsonString;
                }
            }

            // Method to safely update the MQTT config payload and cache
            public void UpdateMqttConfigPayload(string jsonString)
            {
                lock (_jsonCacheLock)
                {
                    MqttConfigPayloadDoc?.Dispose();
                    MqttConfigPayloadDoc = JsonDocument.Parse(jsonString);
                    _mqttConfigPayloadJsonCache = jsonString;
                }
            }

            // Method to safely update the last sent payload and cache
            public void UpdateLastSentPayload(string jsonString)
            {
                lock (_jsonCacheLock)
                {
                    LastSentPayloadDoc?.Dispose();
                    LastSentPayloadDoc = JsonDocument.Parse(jsonString);
                    _lastSentPayloadJsonCache = jsonString;
                }
            }

            // Clean up resources
            public void Dispose()
            {
                lock (_jsonCacheLock)
                {
                    StandardConfigPayloadDoc?.Dispose();
                    MqttConfigPayloadDoc?.Dispose();
                    LastSentPayloadDoc?.Dispose();
                    Cts?.Dispose();
                }
            }
        }

        public IEnumerable<object> GetActiveStreams()
        {
            return _streamingTokens.Select(kvp =>
            {
                var info = kvp.Value;
                return new
                {
                    StreamKey = kvp.Key,
                    info.DeviceName,
                    info.ScreenId,
                    info.ScreenName,
                    info.Status,
                    info.Rate,
                    info.Latency,
                    info.LastSentTime,
                    info.Protocol,
                    info.SensorsCount,

                    // Print the two config payload JSON strings sequentially:
                    ConfigPayloadPrefixes = new[]
                    {
                        info.StandardConfigPayloadPrefix,
                        info.MqttConfigPayloadPrefix
                    },
                    ConfigPayloadsJson = new[]
                    {
                        info.StandardConfigPayloadJson,
                        info.MqttConfigPayloadJson
                    },

                    LastSentPayloadPrefix = info.LastSentPayloadPrefix,
                    LastSentPayloadJson = info.LastSentPayloadJson
                };
            });
        }

        public async Task ConnectAsync(Model_Service service)
        {
            if (service == null
                || string.IsNullOrEmpty(service.MQTTBrokerAddress)
                || string.IsNullOrEmpty(service.MQTTBrokerPort))
            {
                throw new InvalidOperationException("MQTT broker address and port must be provided.");
            }

            var mqtt = GetOrCreateMqttService(service);
            await mqtt.ConnectAsync();

            using var scope = _scopeFactory.CreateScope();
            var subDb = scope.ServiceProvider
                             .GetRequiredService<Service_Database_Manager_MQTT_Subscriptions>();
            var subs = await subDb.GetSubscriptionsForServiceAsync(service.Id);

            foreach (var sub in subs)
            {
                try
                {
                    await mqtt.SubscribeAsync(sub.Topic, qos: sub.QoS, force: true);
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Re-subscribed to '{sub.Topic}' (QoS{sub.QoS}).");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Failed to re-subscribe to '{sub.Topic}': {ex.Message}");
                }
            }
        }

        public async Task DisconnectAsync(Model_Service service)
        {
            var mqtt = GetOrCreateMqttService(service);
            await mqtt.DisconnectAsync();
        }

        public async Task<List<Model_MQTT_Subscriptions>> GetSubscribedTopics(Model_Service service)
        {
            var subDb = new Service_Database_Manager_MQTT_Subscriptions(_db);
            return (await subDb.GetSubscriptionsForServiceAsync(service.Id)).ToList();
        }

        public Dictionary<string, string> GetAllLatestPayloads(Model_Service service)
            => GetOrCreateMqttService(service).GetAllLatestPayloads();

        public async Task SubscribeAsync(Model_Service service, string topic, int qos = 0)
        {
            var mqtt = GetOrCreateMqttService(service);
            await EnsureConnectedAsync(service, mqtt);
            await mqtt.SubscribeAsync(topic, qos, force: false);

            var subDb = new Service_Database_Manager_MQTT_Subscriptions((SqliteConnection)_db);
            var existing = await subDb.GetSubscriptionsForServiceAsync(service.Id);
            if (!existing.Any(s => s.Topic == topic))
            {
                await subDb.InsertSubscriptionAsync(new Model_MQTT_Subscriptions
                {
                    ServiceId = service.Id,
                    Topic = topic,
                    QoS = qos,
                    Active = true
                });
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Saved subscription '{topic}'.");
            }
        }

        public int GetTopicQoS(Model_Service service, string topic)
            => GetOrCreateMqttService(service).GetSubscribedQoS(topic) ?? 0;

        public async Task UnsubscribeAsync(Model_Service service, string topic)
        {
            var mqtt = GetOrCreateMqttService(service);
            await EnsureConnectedAsync(service, mqtt);
            await mqtt.UnsubscribeAsync(topic);

            var subDb = new Service_Database_Manager_MQTT_Subscriptions((SqliteConnection)_db);
            await subDb.DeleteSubscriptionAsyncByTopic(service.Id, topic);
            Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Deleted subscription '{topic}'.");
        }

        public async Task PublishAsync(Model_Service service, string topic, string message, int qos = 0)
        {
            var mqtt = GetOrCreateMqttService(service);
            await mqtt.PublishAsync(topic, message, qos);
        }

        public async Task StartStreamingAsync(
            int junctionId,
            int deviceId,
            int rate,
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen)
        {
            var cts = new CancellationTokenSource();

            // Initial resolution & config
            using var scope = _scopeFactory.CreateScope();
            var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
            var payloadService = scope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
            var serviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Services>();
            var device = await deviceDb.GetDeviceByIdAsync(deviceId)
                                         ?? throw new InvalidOperationException($"Device {deviceId} not found");
            var junctionDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();
            var junction = await junctionDb.GetJunctionByIdAsync(junctionId)
                                             ?? throw new InvalidOperationException($"Junction {junctionId} not found");
            if (junction.MQTTBrokerId == null)
                throw new InvalidOperationException($"No MQTT Broker for junction {junctionId}");
            var service = await serviceDb.GetServiceByIdAsync(junction.MQTTBrokerId.Value)
                                             ?? throw new InvalidOperationException($"Service not found");
            var mqtt = GetOrCreateMqttService(service);
            await EnsureConnectedAsync(service, mqtt);

            if (_streamingTokens.ContainsKey(screen.Id))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Stream already active for screen {screen.Id}");
                return;
            }

            var info = new StreamInfo
            {
                DeviceName = device.Name,
                Rate = rate,
                Status = "Active",
                Cts = cts,
                ScreenId = screen.Id,
                ScreenName = screen.DisplayName ?? string.Empty,
                SensorsCount = assignedSensors.Count,
                Latency = 0,
                LastSentTime = DateTime.UtcNow
            };
            _streamingTokens[screen.Id] = info;

            // Generate two config payloads
            var stdCfgs = await payloadService.GenerateConfigPayloadsAsync(screenKey, assignedSensors, screen);
            var mqttCfgs = await payloadService.GenerateMQTTSubscriptionConfigPayloadsAsync(screenKey, assignedSensors, screen);

            if (!stdCfgs.TryGetValue(screenKey, out var stdObj) || stdObj is not string stdRaw ||
                !mqttCfgs.TryGetValue(screenKey, out var mqttObj) || mqttObj is not string mqttRaw)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Missing config payloads for screen {screenKey}");
                return;
            }

            // Capture prefixes & parse and cache safely
            var idxStd = stdRaw.IndexOf('{');
            if (idxStd > 0) info.StandardConfigPayloadPrefix = stdRaw.Substring(0, idxStd);
            var jsonStd = idxStd > 0 ? stdRaw.Substring(idxStd) : stdRaw;
            info.UpdateStandardConfigPayload(jsonStd);

            var idxM = mqttRaw.IndexOf('{');
            if (idxM > 0) info.MqttConfigPayloadPrefix = mqttRaw.Substring(0, idxM);
            var jsonM = idxM > 0 ? mqttRaw.Substring(idxM) : mqttRaw;
            info.UpdateMqttConfigPayload(jsonM);

            // Send both configs via HTTP
            var httpSender = new Service_Send_Data_HTTP($"http://{device.IPAddress}/api/data");
            var (sentStd, _) = await httpSender.SendPayloadAsync(stdRaw);
            var (sentMqtt, _) = await httpSender.SendPayloadAsync(mqttRaw);
            if (!sentStd || !sentMqtt)
            {
                Console.WriteLine("[SERVICE_STREAM_MANAGER_MQTT] Failed to send one or both config payloads");
                return;
            }
            Console.WriteLine("[SERVICE_STREAM_MANAGER_MQTT] Both config payloads sent");

            // Start MQTT-polling loop
            _ = Task.Run(async () =>
            {
                using var ls = _scopeFactory.CreateScope();
                var devDb = ls.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                var plSvc = ls.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
                var dev = await devDb.GetDeviceByIdAsync(deviceId)
                            ?? throw new InvalidOperationException("Device missing in loop");
                var pub = new Service_Send_Data_MQTT(mqtt);

                // Dictionary to store the last sent payload for each sensor
                var lastSentPayloads = new Dictionary<int, string>();

                while (!cts.Token.IsCancellationRequested)
                {
                    foreach (var sensor in assignedSensors)
                    {
                        Dictionary<string, object> sp = screen.Template?.LayoutType switch
                        {
                            "MATRIX" => await plSvc.GenerateMatrixSensorPayloadsAsync(screenKey, 1, new[] { sensor }.ToList(), screen, 0),
                            _ => await plSvc.GenerateSensorPayloadsAsync(screenKey, 1, new[] { sensor }.ToList(), screen)
                        };

                        if (!sp.TryGetValue(screenKey, out var rawObj) || rawObj is not string raw)
                            continue;

                        // Always update the "last generated" payload info for display purposes
                        var i2 = raw.IndexOf('{');
                        if (i2 > 0) info.LastSentPayloadPrefix = raw.Substring(0, i2);
                        var js = i2 > 0 ? raw.Substring(i2) : raw;
                        info.UpdateLastSentPayload(js);

                        // Check if payload has changed and needs to be sent
                        if (!lastSentPayloads.TryGetValue(sensor.Id, out var lastPayload) || lastPayload != raw)
                        {
                            // Check if MQTT topic is not null or empty before publishing
                            if (!string.IsNullOrEmpty(sensor.MQTTTopic))
                            {
                                // Publish via MQTT
                                await pub.PublishTopicAsync(sensor.MQTTTopic, raw, sensor.MQTTQoS ?? 0);
                                info.LastSentTime = DateTime.UtcNow;

                                // Update last sent payload
                                lastSentPayloads[sensor.Id] = raw;
                            }
                            else
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Skipping sensor {sensor.Id} ({sensor.Name}) - MQTT topic is null or empty");
                            }
                        }

                        await Task.Delay(rate, cts.Token);
                    }
                }
                info.Status = "Inactive";
            }, cts.Token);
        }

        public void StopStreaming(int screenId)
        {
            if (_streamingTokens.TryRemove(screenId, out var info))
            {
                info.Cts.Cancel();
                info.Dispose(); // Use the new dispose method
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Stopped stream for screen {screenId}");
            }
            else
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] No stream to stop for screen {screenId}");
            }
        }

        public long GetLatestLatency(int screenId)
        {
            _deviceLatencies.TryGetValue(screenId, out var lat);
            return lat;
        }

        public bool IsStreaming(int screenId)
            => _streamingTokens.ContainsKey(screenId);
    }
}