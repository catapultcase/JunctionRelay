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

using JunctionRelayServer.Models;
using System.Collections.Concurrent;
using JunctionRelayServer.Services.FactoryServices;
using System.Data;
using Microsoft.Data.Sqlite;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text;

namespace JunctionRelayServer.Services
{
    public class Service_Stream_Manager_MQTT
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IDbConnection _db;
        private readonly Func<Type, Model_Service, IService> _serviceFactory;
        private Service_MQTT? _mqttService;
        private readonly Service_Stream_History_Manager _historyManager;

        private readonly ConcurrentDictionary<int, Service_MQTT> _mqttInstances = new();
        private readonly ConcurrentDictionary<int, Service_StreamInfo_MQTT> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _deviceLatencies = new();

        public Service_Stream_Manager_MQTT(
            IServiceScopeFactory scopeFactory,
            Func<Type, Model_Service, IService> serviceFactory,
            IDbConnection db,
            Service_Stream_History_Manager historyManager)
        {
            _scopeFactory = scopeFactory;
            _serviceFactory = serviceFactory;
            _db = db;
            _historyManager = historyManager;
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

        public IEnumerable<object> GetActiveStreams(bool showCompressed = false)
        {
            return _streamingTokens.Select(kvp =>
            {
                var info = kvp.Value;
                return new
                {
                    StreamKey = kvp.Key,
                    DeviceName = info.DeviceName,
                    DeviceMac = "Unknown",
                    ScreenId = info.ScreenId,
                    ScreenName = info.ScreenName,
                    Status = info.Status,
                    Rate = info.Rate,
                    Latency = info.Latency,
                    LastSentTime = info.LastSentTime,
                    Protocol = info.Protocol,
                    SensorsCount = info.SensorsCount,
                    HasLastFrame = false,
                    LastFrameSize = 0,
                    LastFrameTime = (DateTime?)null,
                    LastFrameLayoutType = "",
                    IsGatewayMode = false,
                    GatewayTarget = "",
                    Health = new
                    {
                        ConnectionState = info.Health.ConnectionState,
                        SuccessRate = info.Health.SuccessRate,
                        LastErrorMessage = info.Health.LastErrorMessage,
                        ErrorType = info.Health.ErrorType,
                        ConsecutiveFailures = info.Health.ConsecutiveFailures,
                        ConsecutiveSuccesses = info.Health.ConsecutiveSuccesses,
                        ConnectionRecreated = info.Health.ConnectionRecreated,
                        LastWebSocketState = (string?)null,
                        AverageLatency = info.Health.AverageLatency,
                        MaxLatency = info.Health.MaxLatency,
                        MinLatency = info.Health.MinLatency,
                        LastSuccessTime = info.Health.LastSuccessTime,
                        LastFailureTime = info.Health.LastFailureTime,
                        ConnectionRecreationCount = info.Health.ConnectionRecreationCount,
                        IsFrameMode = false,
                        PayloadType = "JSON",
                        FramesSent = 0,
                        PayloadsSent = 0, // MQTT doesn't track total payloads sent
                        CurrentFrameLayoutType = "",
                        AverageFrameSize = 0.0,
                        MaxFrameSize = 0,
                        MinFrameSize = 0,
                        AverageFrameRenderTime = 0.0,
                        MaxFrameRenderTime = 0.0,
                        MinFrameRenderTime = 0.0,
                        FrameHealthSummary = "",
                        GatewayMessagesSent = 0,
                        GatewayHealthSummary = "",
                        AcknowledgmentTimeouts = info.Health.AcknowledgmentTimeouts,
                        PublishFailures = info.Health.PublishFailures,
                        TopicLatencies = info.Health.TopicLatencies
                    },
                    ConfigPayloadPrefix = info.StandardConfigPayloadPrefix,
                    ConfigPayloadJson = showCompressed ? info.GetCompressedStandardConfigPayloadPreview() : info.StandardConfigPayloadJson,
                    LastSentPayloadPrefix = info.LastSentPayloadPrefix,
                    LastSentPayloadJson = showCompressed ? info.GetCompressedLastSentPayloadPreview() : info.LastSentPayloadJson,
                    CompressedConfigPayloadPrefix = info.CompressedStandardConfigPayloadPrefix,
                    CompressedLastSentPayloadPrefix = info.CompressedLastSentPayloadPrefix,
                    ConfigPayloadCompressed = info.GetCompressedStandardConfigPayloadPreview(),
                    LastSentPayloadCompressed = info.GetCompressedLastSentPayloadPreview(),
                    // MQTT-specific fields
                    MqttConfigPayloadPrefix = info.MqttConfigPayloadPrefix,
                    MqttConfigPayloadJson = info.MqttConfigPayloadJson,
                    CompressedMqttConfigPayloadPrefix = info.CompressedMqttConfigPayloadPrefix,
                    MqttConfigPayloadCompressed = info.GetCompressedMqttConfigPayloadPreview()
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
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null,
            int linkId = 0)
        {
            var cts = new CancellationTokenSource();

            using var scope = _scopeFactory.CreateScope();
            var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
            var payloadService = scope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
            var serviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Services>();
            var junctionDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();

            var device = await deviceDb.GetDeviceByIdAsync(deviceId)
                                         ?? throw new InvalidOperationException($"Device {deviceId} not found");
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

            var renderMode = junction.RenderingMode;
            bool isPayloadMode = renderMode == RenderModes.Payload;

            if (renderMode == RenderModes.Blit || renderMode == RenderModes.Composite)
            {
                throw new InvalidOperationException("MQTT does not support frame engine modes (Blit/Composite)");
            }

            var mqttSender = new Service_Send_Data_MQTT(mqtt);

            var info = new Service_StreamInfo_MQTT(junction.CompressPayload)
            {
                DeviceName = device.Name,
                Rate = rate,
                Status = "Active",
                Protocol = "MQTT",
                Cts = cts,
                MqttSender = mqttSender,
                ScreenId = screen.Id,
                ScreenName = screen.DisplayName ?? string.Empty,
                SensorsCount = assignedSensors.Count,
                Latency = 0,
                LastSentTime = DateTime.UtcNow
            };

            _streamingTokens[screen.Id] = info;

            // Generate config payloads using new binary protocol architecture
            var standardConfigResult = await payloadService.GenerateConfigPayloadsAsync(
                screenKey,
                assignedSensors,
                screen,
                compressPayload: junction.CompressPayload);

            var mqttConfigResult = await payloadService.GenerateMQTTSubscriptionConfigPayloadsAsync(
                screenKey,
                assignedSensors,
                screen,
                compressPayload: junction.CompressPayload);

            var standardConfigPayload = standardConfigResult.GetResult(screenKey);
            var mqttConfigPayload = mqttConfigResult.GetResult(screenKey);

            if (standardConfigPayload == null || mqttConfigPayload == null)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Missing config payloads for screen {screenKey}");
                info.Dispose();
                _streamingTokens.TryRemove(screen.Id, out _);
                return;
            }

            // Update StreamInfo with config details
            info.StandardConfigPayloadPrefix = standardConfigPayload.UncompressedPrefix;
            info.UpdateStandardConfigPayload(standardConfigPayload.UncompressedJson);
            if (standardConfigPayload.IsCompressed)
            {
                info.UpdateCompressedStandardConfigPayloadPrefix(standardConfigPayload.CompressedPrefix);
            }

            info.MqttConfigPayloadPrefix = mqttConfigPayload.UncompressedPrefix;
            info.UpdateMqttConfigPayload(mqttConfigPayload.UncompressedJson);
            if (mqttConfigPayload.IsCompressed)
            {
                info.UpdateCompressedMqttConfigPayloadPrefix(mqttConfigPayload.CompressedPrefix);
            }

            // Send config payloads via HTTP
            var httpSender = new Service_Send_Data_HTTP($"http://{device.IPAddress}/api/data");
            var (sentStd, _) = await httpSender.SendPayloadAsync(standardConfigPayload.BinaryPayload);
            var (sentMqtt, _) = await httpSender.SendPayloadAsync(mqttConfigPayload.BinaryPayload);

            if (!sentStd || !sentMqtt)
            {
                Console.WriteLine("[SERVICE_STREAM_MANAGER_MQTT] Failed to send one or both config payloads");
                info.Dispose();
                _streamingTokens.TryRemove(screen.Id, out _);
                return;
            }

            string compressionInfo = junction.CompressPayload ? " (compressed)" : "";
            Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Both config payloads sent{compressionInfo}");
            Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] MQTT stream started for screen {screenKey} (Mode: Payload)");

            _ = Task.Run(async () =>
            {
                using var ls = _scopeFactory.CreateScope();
                var devDb = ls.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                var plSvc = ls.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
                var jDb = ls.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();

                var dev = await devDb.GetDeviceByIdAsync(deviceId)
                            ?? throw new InvalidOperationException("Device missing in loop");
                var junc = await jDb.GetJunctionByIdAsync(junctionId)
                            ?? throw new InvalidOperationException("Junction missing in loop");

                await Task.Delay(500, cts.Token);

                var lastSentPayloads = new Dictionary<int, string>();

                while (!cts.Token.IsCancellationRequested)
                {
                    foreach (var sensor in assignedSensors)
                    {
                        try
                        {
                            var sensorPayloadResult = await plSvc.GenerateSensorPayloadsAsync(
                                screenKey,
                                1,
                                new[] { sensor }.ToList(),
                                screen,
                                compressPayload: junc.CompressPayload);

                            var sensorPayload = sensorPayloadResult.GetResult(screenKey);
                            if (sensorPayload == null)
                                continue;

                            // Update StreamInfo with sensor payload details
                            info.LastSentPayloadPrefix = sensorPayload.UncompressedPrefix;
                            info.UpdateLastSentPayload(sensorPayload.UncompressedJson);
                            if (sensorPayload.IsCompressed)
                            {
                                info.UpdateCompressedLastSentPayloadPrefix(sensorPayload.CompressedPrefix);
                            }
                           
                            string transmissionPayload = sensorPayload.UncompressedJson;

                            if (!lastSentPayloads.TryGetValue(sensor.Id, out var lastPayload) || lastPayload != transmissionPayload)
                            {
                                if (!string.IsNullOrEmpty(sensor.MQTTTopic))
                                {
                                    var result = await mqttSender.PublishTopicWithHealthAsync(sensor.MQTTTopic, transmissionPayload, sensor.MQTTQoS ?? 0);

                                    info.Health.UpdateHealth(result);

                                    if (!result.Success)
                                    {
                                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Publish failed: {result.ErrorType} - {result.ErrorMessage}");

                                        if (info.Health.ConnectionState == "disconnected" && info.Health.ConsecutiveFailures > 5)
                                        {
                                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Too many consecutive failures ({info.Health.ConsecutiveFailures}), stopping stream.");
                                            break;
                                        }

                                        if (info.Health.ConsecutiveFailures > 1)
                                        {
                                            await Task.Delay(Math.Min(info.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                        }
                                    }
                                    else
                                    {
                                        if (result.ConnectionRecreated)
                                        {
                                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] MQTT connection recreated for {info.DeviceName}");
                                        }
                                    }

                                    info.Latency = result.LatencyMs;
                                    info.LastSentTime = DateTime.UtcNow;

                                    var historyEntry = CreateMQTTHistoryEntry(info, sensor.MQTTTopic ?? "", sensor.MQTTQoS ?? 0);
                                    _historyManager.AddHistoryEntry(historyEntry);

                                    _deviceLatencies[screen.Id] = result.LatencyMs;
                                    lastSentPayloads[sensor.Id] = transmissionPayload;
                                }
                                else
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Skipping sensor {sensor.Id} ({sensor.Name}) - MQTT topic is null or empty");
                                }
                            }

                            int pause = Math.Max(rate - (int)info.Latency, 0);
                            if (pause > 0)
                            {
                                await Task.Delay(pause, cts.Token);
                            }
                        }
                        catch (Exception ex) when (ex is not OperationCanceledException)
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Unexpected error in streaming loop: {ex.Message}");

                            var errorResult = new MqttSendResult
                            {
                                Success = false,
                                ErrorType = "unexpected_error",
                                ErrorMessage = ex.Message,
                                LatencyMs = 0,
                                Topic = sensor.MQTTTopic ?? "unknown"
                            };
                            info.Health.UpdateHealth(errorResult);

                            await Task.Delay(1000, cts.Token);
                        }
                    }
                }

                if (_streamingTokens.TryGetValue(screen.Id, out var finalInfo))
                {
                    finalInfo.Status = "Inactive";
                    finalInfo.Health.ConnectionState = "disconnected";
                }

            }, cts.Token);
        }

        private StreamHistoryEntry CreateMQTTHistoryEntry(Service_StreamInfo_MQTT info, string topic, int qos)
        {
            return new StreamHistoryEntry
            {
                Timestamp = DateTime.UtcNow,
                ScreenId = info.ScreenId,
                DeviceName = info.DeviceName,
                ScreenName = info.ScreenName,
                Protocol = "MQTT",
                Status = info.Status,
                Latency = info.Latency,
                SensorsCount = info.SensorsCount,
                Rate = info.Rate,
                ConnectionState = info.Health.ConnectionState,
                SuccessRate = info.Health.SuccessRate,
                ConsecutiveFailures = info.Health.ConsecutiveFailures,
                ConsecutiveSuccesses = info.Health.ConsecutiveSuccesses,
                AverageLatency = info.Health.AverageLatency,
                LastErrorMessage = info.Health.LastErrorMessage,
                ErrorType = info.Health.ErrorType,
                IsFrameMode = false, // MQTT doesn't support frame mode
                PayloadType = info.CompressionEnabled ? "JSON_COMPRESSED" : "JSON",
                FramesSent = 0,
                PayloadsSent = 0, // MQTT doesn't track total payloads sent in health
                AverageFrameSize = 0,
                AverageFrameRenderTime = 0,
                IsGatewayMode = false,
                GatewayTarget = null,
                GatewayMessagesSent = 0,
                ProtocolSpecificData = new Dictionary<string, object>
                {
                    ["Topic"] = topic,
                    ["QoS"] = qos,
                    ["Compressed"] = info.CompressionEnabled,
                    ["PayloadPrefix"] = info.CompressionEnabled ? info.CompressedLastSentPayloadPrefix : info.LastSentPayloadPrefix,
                    ["PublishLatencyMs"] = info.Latency,
                    ["ConnectionRecreated"] = info.Health.ConnectionRecreated,
                    ["ConnectionRecreationCount"] = info.Health.ConnectionRecreationCount,
                    ["MinLatency"] = info.Health.MinLatency == long.MaxValue ? 0L : info.Health.MinLatency,
                    ["MaxLatency"] = info.Health.MaxLatency,
                    ["LastSuccessTime"] = info.Health.LastSuccessTime.ToString("O") ?? "",
                    ["LastFailureTime"] = info.Health.LastFailureTime.ToString("O") ?? "",
                    ["AcknowledgmentTimeouts"] = info.Health.AcknowledgmentTimeouts,
                    ["PublishFailures"] = info.Health.PublishFailures,
                    ["TopicLatencies"] = info.Health.TopicLatencies
                }
            };
        }

        public void StopStreaming(int screenId)
        {
            if (_streamingTokens.TryRemove(screenId, out var info))
            {
                info.Cts.Cancel();
                info.Dispose();
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

        public StreamHistoryResponse GetStreamHistory(int screenId, DateTime? fromTime = null, DateTime? toTime = null, bool includeStatistics = true)
        {
            return _historyManager.GetStreamHistory(screenId, fromTime, toTime, includeStatistics);
        }

        public Dictionary<int, StreamHistoryResponse> GetAllStreamHistories(DateTime? fromTime = null, DateTime? toTime = null, bool includeStatistics = false)
        {
            return _historyManager.GetAllStreamHistories(fromTime, toTime, includeStatistics);
        }

        public object GetHistorySummary()
        {
            return _historyManager.GetHistorySummary();
        }

        public bool ClearStreamHistory(int screenId)
        {
            return _historyManager.ClearStreamHistory(screenId);
        }

        public void UpdateHistoryRetention(TimeSpan retentionPeriod)
        {
            _historyManager.UpdateRetentionPeriod(retentionPeriod);
        }

        public void UpdateHistoryMaxEntries(int maxEntries)
        {
            _historyManager.UpdateMaxEntries(maxEntries);
        }

        public HistoryConfiguration GetHistoryConfiguration()
        {
            return _historyManager.GetConfiguration();
        }

        public bool IsStreaming(int screenId)
            => _streamingTokens.ContainsKey(screenId);

        public object GetMqttStreamMetrics()
        {
            return new
            {
                TotalStreams = _streamingTokens.Count,
                ActiveStreams = _streamingTokens.Values.Count(s => s.Status == "Active"),
                StreamsByProtocol = _streamingTokens.Values
                    .GroupBy(s => s.Protocol)
                    .ToDictionary(g => g.Key, g => g.Count()),
                MqttInstances = _mqttInstances.Count,
                ConnectedInstances = _mqttInstances.Values.Count(m => m.IsConnected),
                HealthSummary = new
                {
                    Good = _streamingTokens.Values.Count(s => s.Health.ConnectionState == "good"),
                    Poor = _streamingTokens.Values.Count(s => s.Health.ConnectionState == "poor"),
                    Disconnected = _streamingTokens.Values.Count(s => s.Health.ConnectionState == "disconnected")
                }
            };
        }
    }
}