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
                    info.DeviceName,
                    info.ScreenId,
                    info.ScreenName,
                    info.Status,
                    info.Rate,
                    info.Latency,
                    info.LastSentTime,
                    info.Protocol,
                    info.SensorsCount,
                    // Add health information for frontend
                    Health = new
                    {
                        info.Health.ConnectionState,
                        info.Health.SuccessRate,
                        info.Health.LastErrorMessage,
                        info.Health.ErrorType,
                        info.Health.ConsecutiveFailures,
                        info.Health.ConsecutiveSuccesses,
                        info.Health.ConnectionRecreated,
                        info.Health.AverageLatency,
                        info.Health.MaxLatency,
                        info.Health.MinLatency,
                        info.Health.LastSuccessTime,
                        info.Health.LastFailureTime,
                        info.Health.ConnectionRecreationCount,
                        info.Health.AcknowledgmentTimeouts,
                        info.Health.PublishFailures,
                        TopicLatencies = info.Health.TopicLatencies
                    },

                    // Print the two config payload JSON strings sequentially:
                    ConfigPayloadPrefixes = new[]
                    {
                        info.StandardConfigPayloadPrefix,
                        info.MqttConfigPayloadPrefix
                    },
                    ConfigPayloadsJson = showCompressed ? new[]
                    {
                        info.GetCompressedStandardConfigPayloadPreview(),
                        info.GetCompressedMqttConfigPayloadPreview()
                    } : new[]
                    {
                        info.StandardConfigPayloadJson,
                        info.MqttConfigPayloadJson
                    },

                    LastSentPayloadPrefix = info.LastSentPayloadPrefix,
                    LastSentPayloadJson = showCompressed ? info.GetCompressedLastSentPayloadPreview() : info.LastSentPayloadJson,

                    // NEW: Add compressed prefix fields
                    CompressedStandardConfigPayloadPrefix = info.CompressedStandardConfigPayloadPrefix,
                    CompressedMqttConfigPayloadPrefix = info.CompressedMqttConfigPayloadPrefix,
                    CompressedLastSentPayloadPrefix = info.CompressedLastSentPayloadPrefix,

                    // NEW: Always include compressed views for UI flexibility
                    ConfigPayloadsCompressed = new[]
                    {
                        info.GetCompressedStandardConfigPayloadPreview(),
                        info.GetCompressedMqttConfigPayloadPreview()
                    },
                    LastSentPayloadCompressed = info.GetCompressedLastSentPayloadPreview()
                };
            });
        }

        // Helper method to extract prefix from binary payload (for compressed payloads)
        private string ExtractBinaryPrefix(byte[] payload)
        {
            if (payload == null || payload.Length < 8)
                return string.Empty;

            // Check if first 8 bytes are ASCII digits (valid prefix)
            for (int i = 0; i < 8; i++)
            {
                if (payload[i] < '0' || payload[i] > '9')
                    return string.Empty;
            }

            // Extract the 8-digit prefix
            return Encoding.ASCII.GetString(payload, 0, 8);
        }

        // Helper method to extract prefix from string payload (for uncompressed payloads)
        private string ExtractStringPrefix(string payload)
        {
            if (string.IsNullOrEmpty(payload) || payload.Length < 8)
                return string.Empty;

            // Check if first 8 characters are digits
            for (int i = 0; i < 8; i++)
            {
                if (payload[i] < '0' || payload[i] > '9')
                    return string.Empty;
            }

            return payload.Substring(0, 8);
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

            // Create enhanced MQTT sender with health tracking
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

            // Generate UNCOMPRESSED payloads first for display/caching
            var uncompressedStdCfgs = await payloadService.GenerateConfigPayloadsAsync(
                screenKey,
                assignedSensors,
                screen,
                compressPayload: false);
            var uncompressedMqttCfgs = await payloadService.GenerateMQTTSubscriptionConfigPayloadsAsync(
                screenKey,
                assignedSensors,
                screen,
                compressPayload: false);

            if (!uncompressedStdCfgs.TryGetValue(screenKey, out var uncompressedStdObj) || uncompressedStdObj is not string uncompressedStdRaw ||
                !uncompressedMqttCfgs.TryGetValue(screenKey, out var uncompressedMqttObj) || uncompressedMqttObj is not string uncompressedMqttRaw)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Missing uncompressed config payloads for screen {screenKey}");
                info.Dispose();
                _streamingTokens.TryRemove(screen.Id, out _);
                return;
            }

            // Now get the transmission payloads (compressed or uncompressed based on junction setting)
            string stdTransmissionPayload;
            string mqttTransmissionPayload;

            if (junction.CompressPayload)
            {
                var compressedStdCfgs = await payloadService.GenerateConfigPayloadsAsync(
                    screenKey,
                    assignedSensors,
                    screen,
                    compressPayload: true);
                var compressedMqttCfgs = await payloadService.GenerateMQTTSubscriptionConfigPayloadsAsync(
                    screenKey,
                    assignedSensors,
                    screen,
                    compressPayload: true);

                if (!compressedStdCfgs.TryGetValue(screenKey, out var compressedStdObj) ||
                    !compressedMqttCfgs.TryGetValue(screenKey, out var compressedMqttObj))
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Missing compressed config payloads for screen {screenKey}");
                    info.Dispose();
                    _streamingTokens.TryRemove(screen.Id, out _);
                    return;
                }

                // Handle standard config compression
                if (compressedStdObj is byte[] stdCompressedBytes)
                {
                    // Extract compressed prefix from binary payload
                    string compressedStdPrefix = ExtractBinaryPrefix(stdCompressedBytes);
                    info.UpdateCompressedStandardConfigPayloadPrefix(compressedStdPrefix);

                    stdTransmissionPayload = Convert.ToBase64String(stdCompressedBytes);
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Standard config compressed ({stdCompressedBytes.Length} bytes)");
                }
                else if (compressedStdObj is string stdCompressedString)
                {
                    // Extract compressed prefix from string payload
                    string compressedStdPrefix = ExtractStringPrefix(stdCompressedString);
                    info.UpdateCompressedStandardConfigPayloadPrefix(compressedStdPrefix);

                    stdTransmissionPayload = stdCompressedString;
                }
                else
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Unexpected standard config compressed payload type for screen {screenKey}");
                    info.Dispose();
                    _streamingTokens.TryRemove(screen.Id, out _);
                    return;
                }

                // Handle MQTT config compression
                if (compressedMqttObj is byte[] mqttCompressedBytes)
                {
                    // Extract compressed prefix from binary payload
                    string compressedMqttPrefix = ExtractBinaryPrefix(mqttCompressedBytes);
                    info.UpdateCompressedMqttConfigPayloadPrefix(compressedMqttPrefix);

                    mqttTransmissionPayload = Convert.ToBase64String(mqttCompressedBytes);
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] MQTT config compressed ({mqttCompressedBytes.Length} bytes)");
                }
                else if (compressedMqttObj is string mqttCompressedString)
                {
                    // Extract compressed prefix from string payload
                    string compressedMqttPrefix = ExtractStringPrefix(mqttCompressedString);
                    info.UpdateCompressedMqttConfigPayloadPrefix(compressedMqttPrefix);

                    mqttTransmissionPayload = mqttCompressedString;
                }
                else
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Unexpected MQTT config compressed payload type for screen {screenKey}");
                    info.Dispose();
                    _streamingTokens.TryRemove(screen.Id, out _);
                    return;
                }
            }
            else
            {
                // Use uncompressed payloads for transmission
                stdTransmissionPayload = uncompressedStdRaw;
                mqttTransmissionPayload = uncompressedMqttRaw;
            }

            // Use the UNCOMPRESSED payloads for display/caching (keeps existing functionality)
            var idxStd = uncompressedStdRaw.IndexOf('{');
            if (idxStd > 0) info.StandardConfigPayloadPrefix = uncompressedStdRaw.Substring(0, idxStd);
            var jsonStd = idxStd > 0 ? uncompressedStdRaw.Substring(idxStd) : uncompressedStdRaw;
            info.UpdateStandardConfigPayload(jsonStd);

            var idxM = uncompressedMqttRaw.IndexOf('{');
            if (idxM > 0) info.MqttConfigPayloadPrefix = uncompressedMqttRaw.Substring(0, idxM);
            var jsonM = idxM > 0 ? uncompressedMqttRaw.Substring(idxM) : uncompressedMqttRaw;
            info.UpdateMqttConfigPayload(jsonM);

            // Send both TRANSMISSION payloads via HTTP (which may be compressed)
            var httpSender = new Service_Send_Data_HTTP($"http://{device.IPAddress}/api/data");
            var (sentStd, _) = await httpSender.SendPayloadAsync(stdTransmissionPayload);
            var (sentMqtt, _) = await httpSender.SendPayloadAsync(mqttTransmissionPayload);
            if (!sentStd || !sentMqtt)
            {
                Console.WriteLine("[SERVICE_STREAM_MANAGER_MQTT] Failed to send one or both config payloads");
                info.Dispose();
                _streamingTokens.TryRemove(screen.Id, out _);
                return;
            }

            string compressionInfo = junction.CompressPayload ? " (compressed)" : "";
            Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Both config payloads sent{compressionInfo}");

            // Start MQTT-polling loop with health tracking and compression support
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

                // Dictionary to store the last sent payload for each sensor
                var lastSentPayloads = new Dictionary<int, string>();

                while (!cts.Token.IsCancellationRequested)
                {
                    foreach (var sensor in assignedSensors)
                    {
                        try
                        {
                            // Generate UNCOMPRESSED payload first for display/caching
                            Dictionary<string, object> uncompressedSp = screen.Template?.LayoutType switch
                            {
                                "MATRIX" => await plSvc.GenerateMatrixSensorPayloadsAsync(
                                    screenKey,
                                    1,
                                    new[] { sensor }.ToList(),
                                    screen,
                                    0,
                                    compressPayload: false),
                                _ => await plSvc.GenerateSensorPayloadsAsync(
                                    screenKey,
                                    1,
                                    new[] { sensor }.ToList(),
                                    screen,
                                    compressPayload: false)
                            };

                            if (!uncompressedSp.TryGetValue(screenKey, out var uncompressedObj) || uncompressedObj is not string uncompressedRaw)
                                continue;

                            // Extract uncompressed sensor payload info FIRST (always needed for UI)
                            string uncompressedSensorPrefix = ExtractStringPrefix(uncompressedRaw);
                            info.LastSentPayloadPrefix = uncompressedSensorPrefix;

                            var i2 = uncompressedRaw.IndexOf('{');
                            var js = i2 > 0 ? uncompressedRaw.Substring(i2) : uncompressedRaw;
                            info.UpdateLastSentPayload(js);

                            // Now get the transmission payload (compressed or uncompressed based on junction setting)
                            string transmissionPayload;
                            if (junc.CompressPayload)
                            {
                                Dictionary<string, object> compressedSp = screen.Template?.LayoutType switch
                                {
                                    "MATRIX" => await plSvc.GenerateMatrixSensorPayloadsAsync(
                                        screenKey,
                                        1,
                                        new[] { sensor }.ToList(),
                                        screen,
                                        0,
                                        compressPayload: true),
                                    _ => await plSvc.GenerateSensorPayloadsAsync(
                                        screenKey,
                                        1,
                                        new[] { sensor }.ToList(),
                                        screen,
                                        compressPayload: true)
                                };

                                if (!compressedSp.TryGetValue(screenKey, out var compressedObj))
                                    continue;

                                if (compressedObj is byte[] compressedBytes)
                                {
                                    // Extract compressed prefix from binary payload
                                    string compressedSensorPrefix = ExtractBinaryPrefix(compressedBytes);
                                    info.UpdateCompressedLastSentPayloadPrefix(compressedSensorPrefix);

                                    transmissionPayload = Convert.ToBase64String(compressedBytes);
                                }
                                else if (compressedObj is string compressedString)
                                {
                                    // Extract compressed prefix from string payload
                                    string compressedSensorPrefix = ExtractStringPrefix(compressedString);
                                    info.UpdateCompressedLastSentPayloadPrefix(compressedSensorPrefix);

                                    transmissionPayload = compressedString;
                                }
                                else
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Unexpected compressed payload type for sensor {sensor.Id}");
                                    continue;
                                }
                            }
                            else
                            {
                                // Use uncompressed payload for transmission
                                transmissionPayload = uncompressedRaw;
                            }

                            // Check if payload has changed and needs to be sent (use transmission payload for comparison)
                            if (!lastSentPayloads.TryGetValue(sensor.Id, out var lastPayload) || lastPayload != transmissionPayload)
                            {
                                // Check if MQTT topic is not null or empty before publishing
                                if (!string.IsNullOrEmpty(sensor.MQTTTopic))
                                {
                                    // Send the TRANSMISSION payload (which may be compressed)
                                    var result = await mqttSender.PublishTopicWithHealthAsync(sensor.MQTTTopic, transmissionPayload, sensor.MQTTQoS ?? 0);

                                    // Update health information
                                    info.Health.UpdateHealth(result);

                                    if (!result.Success)
                                    {
                                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Publish failed: {result.ErrorType} - {result.ErrorMessage}");

                                        // Don't immediately break - let health state determine if we should continue
                                        // Only stop if we're truly disconnected with many consecutive failures
                                        if (info.Health.ConnectionState == "disconnected" && info.Health.ConsecutiveFailures > 5)
                                        {
                                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Too many consecutive failures ({info.Health.ConsecutiveFailures}), stopping stream.");
                                            break;
                                        }

                                        // Add a small delay on failures to prevent rapid retry spam
                                        if (info.Health.ConsecutiveFailures > 1)
                                        {
                                            await Task.Delay(Math.Min(info.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                        }
                                    }
                                    else
                                    {
                                        // Log connection recreation events for debugging
                                        if (result.ConnectionRecreated)
                                        {
                                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] MQTT connection recreated for {info.DeviceName}");
                                        }
                                    }

                                    // Update latency from the actual send result
                                    info.Latency = result.LatencyMs;
                                    info.LastSentTime = DateTime.UtcNow;

                                    var historyEntry = _historyManager.CreateEntryFromMQTT(info);
                                    _historyManager.AddHistoryEntry(historyEntry);

                                    // Store latency in the existing dictionary for backward compatibility
                                    _deviceLatencies[screen.Id] = result.LatencyMs;

                                    // Update last sent payload (use transmission payload)
                                    lastSentPayloads[sensor.Id] = transmissionPayload;
                                }
                                else
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Skipping sensor {sensor.Id} ({sensor.Name}) - MQTT topic is null or empty");
                                }
                            }

                            // Calculate delay, accounting for processing time
                            int pause = Math.Max(rate - (int)info.Latency, 0);
                            if (pause > 0)
                            {
                                await Task.Delay(pause, cts.Token);
                            }
                        }
                        catch (Exception ex) when (ex is not OperationCanceledException)
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_MQTT] Unexpected error in streaming loop: {ex.Message}");

                            // Update health with unexpected error
                            var errorResult = new MqttSendResult
                            {
                                Success = false,
                                ErrorType = "unexpected_error",
                                ErrorMessage = ex.Message,
                                LatencyMs = 0,
                                Topic = sensor.MQTTTopic ?? "unknown"
                            };
                            info.Health.UpdateHealth(errorResult);

                            // Wait a bit before retrying on unexpected errors
                            await Task.Delay(1000, cts.Token);
                        }
                    }
                }

                // Update status when loop exits
                if (_streamingTokens.TryGetValue(screen.Id, out var finalInfo))
                {
                    finalInfo.Status = "Inactive";
                    finalInfo.Health.ConnectionState = "disconnected";
                }

            }, cts.Token);
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
    }
}