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

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using JunctionRelayServer.Models;
using System.Text;

namespace JunctionRelayServer.Services
{
    public class Service_Stream_Manager_COM
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IServiceProvider _serviceProvider;
        private readonly ConcurrentDictionary<int, Service_StreamInfo_COM> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _latencies = new();
        private readonly Service_Stream_History_Manager _historyManager;

        public Service_Stream_Manager_COM(
            IServiceScopeFactory scopeFactory,
            IServiceProvider serviceProvider,
            Service_Stream_History_Manager historyManager)
        {
            _scopeFactory = scopeFactory;
            _serviceProvider = serviceProvider;
            _historyManager = historyManager;
        }

        public IEnumerable<object> GetActiveStreams(bool showCompressed = false)
        {
            return _streamingTokens.Select(kvp =>
            {
                Service_StreamInfo_COM info = kvp.Value;
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
                    Health = new
                    {
                        info.Health.ConnectionState,
                        info.Health.SuccessRate,
                        info.Health.LastErrorMessage,
                        info.Health.ErrorType,
                        info.Health.ConsecutiveFailures,
                        info.Health.ConsecutiveSuccesses,
                        KeepAlivePoolRecreated = false,
                        HttpStatusCode = 200,
                        info.Health.AverageLatency,
                        info.Health.MaxLatency,
                        info.Health.MinLatency,
                        info.Health.LastSuccessTime,
                        info.Health.LastFailureTime,
                        info.Health.PoolRecreationCount
                    },
                    info.ConfigPayloadPrefix,
                    ConfigPayloadJson = showCompressed
                        ? info.GetCompressedConfigPayloadPreview()
                        : info.ConfigPayloadJson,
                    info.LastSentPayloadPrefix,
                    LastSentPayloadJson = showCompressed
                        ? info.GetCompressedLastSentPayloadPreview()
                        : info.LastSentPayloadJson,
                    info.CompressedConfigPayloadPrefix,
                    info.CompressedLastSentPayloadPrefix,
                    ConfigPayloadCompressed = info.GetCompressedConfigPayloadPreview(),
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

        public async Task StartStreamingAsync(
            int junctionId,
            int deviceId,
            int rate,
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null)
        {
            if (_streamingTokens.ContainsKey(screen.Id))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Stream already active for device {deviceId}, screen {screenKey}");
                return;
            }

            CancellationTokenSource cts = new();

            using (IServiceScope scope = _scopeFactory.CreateScope())
            {
                Service_Database_Manager_Devices deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                Service_Manager_Payloads payloadService = scope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
                Service_Database_Manager_Junctions junctionDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();

                Model_Device? device = await deviceDb.GetDeviceByIdAsync(deviceId);
                if (device is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Device {deviceId} not found.");
                    return;
                }

                Model_Junction? junction = await junctionDb.GetJunctionByIdAsync(junctionId);
                if (junction is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Junction {junctionId} not found.");
                    return;
                }

                string comPort;
                string? targetMacAddress = device.UniqueIdentifier;

                if (!string.IsNullOrEmpty(junctionType) &&
                    junctionType.Equals("Gateway Junction (COM to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
                {
                    if (string.IsNullOrWhiteSpace(gatewayDestination))
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Gateway junction requires gateway COM port.");
                        return;
                    }

                    comPort = gatewayDestination;
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Gateway junction: COM to {comPort}, ESP-NOW target: {targetMacAddress}");
                }
                else
                {
                    if (string.IsNullOrWhiteSpace(device.SelectedPort))
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No COM port selected for device {deviceId}.");
                        return;
                    }

                    comPort = device.SelectedPort;
                }

                Func<string, Service_Send_Data_COM> senderFactory =
                    _serviceProvider.GetRequiredService<Func<string, Service_Send_Data_COM>>();
                Service_Send_Data_COM comSender = senderFactory(comPort);
                comSender.OpenPortIfNotOpen(115200);

                Service_StreamInfo_COM streamInfo = new(junction.CompressPayload)
                {
                    DeviceName = device.Name,
                    Rate = rate,
                    Status = "Active",
                    Cts = cts,
                    ComSender = comSender,
                    ScreenId = screen.Id,
                    ScreenName = screen.DisplayName ?? string.Empty,
                    SensorsCount = assignedSensors.Count,
                    Latency = 0,
                    LastSentTime = DateTime.UtcNow,
                    Protocol = "COM"
                };
                _streamingTokens[screen.Id] = streamInfo;

                // Prepare uncompressed JSON payload
                Dictionary<string, object> uncompressedConfig = await payloadService.GenerateConfigPayloadsAsync(
                    screenKey,
                    assignedSensors,
                    screen,
                    overrideTemplate: null,
                    junctionType: junctionType,
                    gatewayDestination: targetMacAddress,
                    compressPayload: false);

                if (!uncompressedConfig.TryGetValue(screenKey, out object rawUncompressed) ||
                    rawUncompressed is not string uncompressedJson)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No uncompressed config payload for screen {screenKey}.");
                    streamInfo.Dispose();
                    _streamingTokens.TryRemove(screen.Id, out _);
                    return;
                }

                // Send compressed or uncompressed payload
                if (junction.CompressPayload)
                {
                    Dictionary<string, object> compressedConfig = await payloadService.GenerateConfigPayloadsAsync(
                        screenKey,
                        assignedSensors,
                        screen,
                        overrideTemplate: null,
                        junctionType: junctionType,
                        gatewayDestination: targetMacAddress,
                        compressPayload: true);

                    if (!compressedConfig.TryGetValue(screenKey, out object rawCompressed))
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No compressed config payload for screen {screenKey}.");
                        streamInfo.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    if (rawCompressed is byte[] compressedBytes)
                    {
                        // Extract prefix from binary payload
                        string compressedPrefix = ExtractBinaryPrefix(compressedBytes);
                        streamInfo.UpdateCompressedConfigPayloadPrefix(compressedPrefix);

                        (bool success, _) = await comSender.SendPayloadAsync(compressedBytes);
                        if (!success)
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Failed to send compressed config payload.");
                            streamInfo.Dispose();
                            _streamingTokens.TryRemove(screen.Id, out _);
                            return;
                        }
                    }
                    else if (rawCompressed is string compressedString)
                    {
                        // Extract prefix from string payload (shouldn't happen for compressed, but handle it)
                        string compressedPrefix = ExtractStringPrefix(compressedString);
                        streamInfo.UpdateCompressedConfigPayloadPrefix(compressedPrefix);

                        (bool success, _) = await comSender.SendPayloadAsync(compressedString);
                        if (!success)
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Failed to send compressed config payload as string.");
                            streamInfo.Dispose();
                            _streamingTokens.TryRemove(screen.Id, out _);
                            return;
                        }
                    }
                    else
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Unexpected compressed config payload type for screen {screenKey}.");
                        streamInfo.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }
                }
                else
                {
                    (bool success, _) = await comSender.SendPayloadAsync(uncompressedJson);
                    if (!success)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Failed to send uncompressed config payload.");
                        streamInfo.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }
                }

                // Extract uncompressed prefix and update StreamInfo
                string uncompressedPrefix = ExtractStringPrefix(uncompressedJson);
                streamInfo.ConfigPayloadPrefix = uncompressedPrefix;

                // Extract JSON part (after prefix)
                string jsonConfig = string.IsNullOrEmpty(uncompressedPrefix)
                    ? uncompressedJson
                    : uncompressedJson.Substring(8);
                streamInfo.UpdateConfigPayload(jsonConfig);
            }

            // Sensor polling loop
            _ = Task.Run(async () =>
            {
                using IServiceScope loopScope = _scopeFactory.CreateScope();
                Service_Manager_Payloads loopPayloadService =
                    loopScope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
                Service_Database_Manager_Junctions junctionDb =
                    loopScope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();

                Service_StreamInfo_COM streamInfo = _streamingTokens[screen.Id];
                Model_Junction? junction = await junctionDb.GetJunctionByIdAsync(junctionId);
                if (junction is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Junction {junctionId} not found in sensor loop.");
                    return;
                }

                string? targetMacAddress = null;
                if (!string.IsNullOrEmpty(junctionType) &&
                    junctionType.Equals("Gateway Junction (COM to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
                {
                    using IServiceScope deviceScope = _scopeFactory.CreateScope();
                    Service_Database_Manager_Devices deviceDb =
                        deviceScope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                    Model_Device? device = await deviceDb.GetDeviceByIdAsync(deviceId);
                    targetMacAddress = device?.UniqueIdentifier;
                }

                await Task.Delay(500, cts.Token);

                while (!cts.Token.IsCancellationRequested)
                {
                    try
                    {
                        // Build uncompressed sensor payload JSON
                        Dictionary<string, object> uncompressedSensorPayload = screen.Template?.LayoutType switch
                        {
                            "MATRIX" => await loopPayloadService.GenerateMatrixSensorPayloadsAsync(
                                screenKey,
                                assignedSensors.Count,
                                assignedSensors,
                                screen,
                                startingYOffset: 0,
                                junctionType: junctionType,
                                gatewayDestination: targetMacAddress,
                                compressPayload: false),
                            _ => await loopPayloadService.GenerateSensorPayloadsAsync(
                                screenKey,
                                assignedSensors.Count,
                                assignedSensors,
                                screen,
                                junctionType: junctionType,
                                gatewayDestination: targetMacAddress,
                                compressPayload: false)
                        };

                        if (!uncompressedSensorPayload.TryGetValue(screenKey, out object rawUncompressedSensor) ||
                            rawUncompressedSensor is not string uncompressedSensorJson)
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No uncompressed sensor payload for screen {screenKey}. Exiting loop.");
                            break;
                        }

                        // Extract uncompressed sensor payload info FIRST (always needed for UI)
                        string uncompressedSensorPrefix = ExtractStringPrefix(uncompressedSensorJson);
                        streamInfo.LastSentPayloadPrefix = uncompressedSensorPrefix;

                        string sensorJson = string.IsNullOrEmpty(uncompressedSensorPrefix)
                            ? uncompressedSensorJson
                            : uncompressedSensorJson.Substring(8);
                        streamInfo.UpdateLastSentPayload(sensorJson);

                        // If compression is enabled, send binary; otherwise send JSON string
                        if (junction.CompressPayload)
                        {
                            Dictionary<string, object> compressedSensorPayload = screen.Template?.LayoutType switch
                            {
                                "MATRIX" => await loopPayloadService.GenerateMatrixSensorPayloadsAsync(
                                    screenKey,
                                    assignedSensors.Count,
                                    assignedSensors,
                                    screen,
                                    startingYOffset: 0,
                                    junctionType: junctionType,
                                    gatewayDestination: targetMacAddress,
                                    compressPayload: true),
                                _ => await loopPayloadService.GenerateSensorPayloadsAsync(
                                    screenKey,
                                    assignedSensors.Count,
                                    assignedSensors,
                                    screen,
                                    junctionType: junctionType,
                                    gatewayDestination: targetMacAddress,
                                    compressPayload: true)
                            };

                            if (!compressedSensorPayload.TryGetValue(screenKey, out object rawCompressedSensor))
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No compressed sensor payload for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            if (rawCompressedSensor is byte[] compressedSensorBytes)
                            {
                                // Extract compressed prefix from binary payload
                                string compressedSensorPrefix = ExtractBinaryPrefix(compressedSensorBytes);
                                streamInfo.UpdateCompressedLastSentPayloadPrefix(compressedSensorPrefix);

                                Stopwatch stopwatch = Stopwatch.StartNew();
                                (bool success, _) = await streamInfo.ComSender!.SendPayloadAsync(compressedSensorBytes);
                                stopwatch.Stop();

                                HttpSendResult sendResult = new()
                                {
                                    Success = success,
                                    LatencyMs = stopwatch.ElapsedMilliseconds,
                                    ErrorType = success ? string.Empty : "com_send_failed",
                                    ErrorMessage = success ? string.Empty : "COM send failure",
                                    KeepAlivePoolRecreated = false
                                };

                                streamInfo.Health.UpdateHealth(sendResult);

                                if (!sendResult.Success)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Send failed: {sendResult.ErrorType} - {sendResult.ErrorMessage}");
                                    if (streamInfo.Health.ConnectionState == "disconnected" &&
                                        streamInfo.Health.ConsecutiveFailures > 5)
                                    {
                                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Too many consecutive failures ({streamInfo.Health.ConsecutiveFailures}), stopping stream.");
                                        break;
                                    }
                                    if (streamInfo.Health.ConsecutiveFailures > 1)
                                    {
                                        await Task.Delay(Math.Min(streamInfo.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                    }
                                }

                                streamInfo.Latency = sendResult.LatencyMs;
                                streamInfo.LastSentTime = DateTime.UtcNow;

                                StreamHistoryEntry historyEntry = _historyManager.CreateEntryFromCOM(streamInfo);
                                _historyManager.AddHistoryEntry(historyEntry);

                                _latencies[screen.Id] = sendResult.LatencyMs;

                                int calculatedPause = Math.Max(rate - (int)sendResult.LatencyMs, 0);
                                if (calculatedPause > 0)
                                {
                                    await Task.Delay(calculatedPause, cts.Token);
                                }

                                continue;
                            }
                            else if (rawCompressedSensor is string compressedSensorString)
                            {
                                // Extract compressed prefix from string payload
                                string compressedSensorPrefix = ExtractStringPrefix(compressedSensorString);
                                streamInfo.UpdateCompressedLastSentPayloadPrefix(compressedSensorPrefix);

                                Stopwatch stopwatch = Stopwatch.StartNew();
                                (bool success, _) = await streamInfo.ComSender!.SendPayloadAsync(compressedSensorString);
                                stopwatch.Stop();

                                HttpSendResult sendResult = new()
                                {
                                    Success = success,
                                    LatencyMs = stopwatch.ElapsedMilliseconds,
                                    ErrorType = success ? string.Empty : "com_send_failed",
                                    ErrorMessage = success ? string.Empty : "COM send failure",
                                    KeepAlivePoolRecreated = false
                                };

                                streamInfo.Health.UpdateHealth(sendResult);

                                if (!sendResult.Success)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Send failed: {sendResult.ErrorType} - {sendResult.ErrorMessage}");
                                    if (streamInfo.Health.ConnectionState == "disconnected" &&
                                        streamInfo.Health.ConsecutiveFailures > 5)
                                    {
                                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Too many consecutive failures ({streamInfo.Health.ConsecutiveFailures}), stopping stream.");
                                        break;
                                    }
                                    if (streamInfo.Health.ConsecutiveFailures > 1)
                                    {
                                        await Task.Delay(Math.Min(streamInfo.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                    }
                                }

                                streamInfo.Latency = sendResult.LatencyMs;
                                streamInfo.LastSentTime = DateTime.UtcNow;

                                StreamHistoryEntry historyEntry = _historyManager.CreateEntryFromCOM(streamInfo);
                                _historyManager.AddHistoryEntry(historyEntry);

                                _latencies[screen.Id] = sendResult.LatencyMs;

                                int calculatedPause = Math.Max(rate - (int)sendResult.LatencyMs, 0);
                                if (calculatedPause > 0)
                                {
                                    await Task.Delay(calculatedPause, cts.Token);
                                }

                                continue;
                            }
                            else
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Unexpected compressed sensor payload type for screen {screenKey}. Exiting loop.");
                                break;
                            }
                        }

                        // Send uncompressed JSON sensor payload
                        Stopwatch stopwatchUncompressed = Stopwatch.StartNew();
                        (bool successUncompressed, _) = await streamInfo.ComSender!.SendPayloadAsync(uncompressedSensorJson);
                        stopwatchUncompressed.Stop();

                        HttpSendResult sendResultUncompressed = new()
                        {
                            Success = successUncompressed,
                            LatencyMs = stopwatchUncompressed.ElapsedMilliseconds,
                            ErrorType = successUncompressed ? string.Empty : "com_send_failed",
                            ErrorMessage = successUncompressed ? string.Empty : "COM send failure",
                            KeepAlivePoolRecreated = false
                        };

                        streamInfo.Health.UpdateHealth(sendResultUncompressed);

                        if (!sendResultUncompressed.Success)
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Send failed: {sendResultUncompressed.ErrorType} - {sendResultUncompressed.ErrorMessage}");
                            if (streamInfo.Health.ConnectionState == "disconnected" &&
                                streamInfo.Health.ConsecutiveFailures > 5)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Too many consecutive failures ({streamInfo.Health.ConsecutiveFailures}), stopping stream.");
                                break;
                            }
                            if (streamInfo.Health.ConsecutiveFailures > 1)
                            {
                                await Task.Delay(Math.Min(streamInfo.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                            }
                        }

                        streamInfo.Latency = sendResultUncompressed.LatencyMs;
                        streamInfo.LastSentTime = DateTime.UtcNow;

                        StreamHistoryEntry historyEntryUncompressed = _historyManager.CreateEntryFromCOM(streamInfo);
                        _historyManager.AddHistoryEntry(historyEntryUncompressed);

                        _latencies[screen.Id] = sendResultUncompressed.LatencyMs;

                        int calculatedPauseUncompressed = Math.Max(rate - (int)sendResultUncompressed.LatencyMs, 0);
                        if (calculatedPauseUncompressed > 0)
                        {
                            await Task.Delay(calculatedPauseUncompressed, cts.Token);
                        }
                    }
                    catch (Exception exception) when (exception is not OperationCanceledException)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Unexpected error in streaming loop: {exception.Message}");
                        HttpSendResult errorResult = new()
                        {
                            Success = false,
                            ErrorType = "unexpected_error",
                            ErrorMessage = exception.Message,
                            LatencyMs = 0
                        };
                        _streamingTokens[screen.Id].Health.UpdateHealth(errorResult);
                        await Task.Delay(1000, cts.Token);
                    }
                }

                if (_streamingTokens.TryGetValue(screen.Id, out Service_StreamInfo_COM finalInfo))
                {
                    finalInfo.Status = "Inactive";
                    finalInfo.Health.ConnectionState = "disconnected";
                }
            }, cts.Token);
        }

        public void StopStreaming(int screenId)
        {
            if (_streamingTokens.TryRemove(screenId, out Service_StreamInfo_COM info))
            {
                info.Cts.Cancel();
                info.Dispose();
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Stopped stream for screen {screenId}.");
            }
            else
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No active stream for screen {screenId}.");
            }
        }

        public long GetLatestLatency(int screenId)
        {
            _latencies.TryGetValue(screenId, out long latency);
            return latency;
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
        {
            return _streamingTokens.ContainsKey(screenId);
        }
    }
}