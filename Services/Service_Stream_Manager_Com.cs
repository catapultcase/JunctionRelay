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

using System.Collections.Concurrent;
using System.Diagnostics;

namespace JunctionRelayServer.Services
{
    public class Service_Stream_Manager_COM
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IServiceProvider _serviceProvider;

        // Single dictionary to store StreamInfo, which includes CancellationTokenSource and other details
        private readonly ConcurrentDictionary<int, StreamInfo> _streamingTokens = new();

        private readonly ConcurrentDictionary<int, long> _deviceLatencies = new();  // Store latencies for each device

        // StreamInfo holds the details of the streaming session
        public class StreamInfo
        {
            public string StreamId { get; set; }
            public string DeviceName { get; set; }
            public int Rate { get; set; }
            public string Status { get; set; }  // Active/Inactive
            public CancellationTokenSource Cts { get; set; }  // CancellationTokenSource for controlling cancellation
            public long Latency { get; set; }  // Latency
            public DateTime LastSentTime { get; set; } 
        }

        public Service_Stream_Manager_COM(IServiceScopeFactory scopeFactory, IServiceProvider serviceProvider)
        {
            _scopeFactory = scopeFactory;
            _serviceProvider = serviceProvider;
        }

        // Get a list of all active streams with additional information
        public IEnumerable<object> GetActiveStreams()
        {
            return _streamingTokens.Values.Select(s => new
            {
                StreamId = s.StreamId,
                DeviceName = s.DeviceName,
                Status = s.Status,
                Rate = s.Rate,
                Latency = s.Latency,
                LastSentTime = s.LastSentTime
            });
        }

        public async Task StartStreamingAsync(int deviceId, int rate, CancellationToken cancellationToken)
        {
            if (_streamingTokens.ContainsKey(deviceId))
            {
                Console.WriteLine($"[DEBUG] Stream already active for device {deviceId}");
                return;
            }

            // Generate a unique stream ID
            string streamId = $"http_{deviceId}";
            var cts = new CancellationTokenSource();

            // Prime the StreamInfo
            _streamingTokens[deviceId] = new StreamInfo
            {
                StreamId = streamId,
                DeviceName = "Device_" + deviceId,   // swap in real name if you have it
                Rate = rate,
                Status = "Active",
                Cts = cts,
                Latency = 0,
                LastSentTime = DateTime.UtcNow,
            };

            // Resolve COM‐port sender
            using var scope = _scopeFactory.CreateScope();
            var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
            var device = await deviceDb.GetDeviceByIdAsync(deviceId);
            if (device == null || string.IsNullOrWhiteSpace(device.SelectedPort))
            {
                Console.WriteLine("[DEBUG] Device not found or COM port not configured.");
                return;
            }
            string comPort = device.SelectedPort;
            var sender = _serviceProvider
                .GetRequiredService<Func<string, Service_Send_Data_COM>>()(comPort);

            // Open the port
            Console.WriteLine($"[DEBUG] Opening COM port {comPort}.");
            sender.OpenPortIfNotOpen(baudRate: 115200);

            Console.WriteLine("[DEBUG] Starting loop for COM device.");
            _ = Task.Run(async () =>
            {
                try
                {
                    // Initial config payload (if you have one)
                    // var configPayload = ...;
                    // await sender.SendPayloadAsync(configPayload);

                    // Now the streaming loop
                    while (!cts.Token.IsCancellationRequested)
                    {
                        // Generate your sensor payload here:
                        string sensorPayload = Service_Payload_Generator_Sensors
                            .GenerateSensorPayloadForScreen("onboard", 8);  // example

                        // Measure send time / latency
                        var sw = Stopwatch.StartNew();
                        var (sensorSent, _) = await sender.SendPayloadAsync(sensorPayload);
                        sw.Stop();

                        if (!sensorSent)
                        {
                            Console.WriteLine("[ERROR] Failed to send data during streaming.");
                            break;
                        }

                        long latency = sw.ElapsedMilliseconds;
                        // store latency globally
                        _deviceLatencies[deviceId] = latency;

                        // update our StreamInfo
                        var info = _streamingTokens[deviceId];
                        info.Latency = latency;
                        info.LastSentTime = DateTime.UtcNow;

                        // wait before next send
                        int delay = Math.Max(rate - (int)latency, 0);
                        await Task.Delay(delay, cts.Token);
                    }
                }
                catch (OperationCanceledException)
                {
                    Console.WriteLine($"[DEBUG] Streaming for device {deviceId} was cancelled.");
                }
                finally
                {
                    Console.WriteLine($"[DEBUG] Streaming loop exited for device {deviceId}");
                    if (_streamingTokens.TryRemove(deviceId, out var removed))
                    {
                        removed.Status = "Inactive";
                    }
                }
            }, cts.Token);

            Console.WriteLine($"[DEBUG] Streaming started for COM device {deviceId}");
        }


        public void StopStreaming(int deviceId)
        {
            if (_streamingTokens.TryRemove(deviceId, out var streamInfo))
            {
                // Cancel the streaming task by calling Cancel on the CancellationTokenSource
                streamInfo.Cts?.Cancel();
                streamInfo.Status = "Inactive";
                Console.WriteLine($"[DEBUG] Stream stopped for COM device {deviceId}.");
            }
            else
            {
                Console.WriteLine($"[DEBUG] No active COM stream to stop for device {deviceId}.");
            }
        }

        public long GetLatestLatency(int deviceId)
        {
            _deviceLatencies.TryGetValue(deviceId, out var latency);
            return latency;
        }

        public bool IsStreaming(int deviceId)
        {
            return _streamingTokens.ContainsKey(deviceId);
        }
    }
}
