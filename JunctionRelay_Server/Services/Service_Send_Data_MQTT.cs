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

using System.Collections.Concurrent;
using System.Diagnostics;
using JunctionRelayServer.Services.FactoryServices;

namespace JunctionRelayServer.Services
{
    // MQTT send result for detailed frontend visualization
    public class MqttSendResult
    {
        public bool Success { get; set; }
        public string ErrorType { get; set; } = string.Empty; // "timeout", "connection_lost", "acknowledgment_timeout", "mqtt_error", etc.
        public string ErrorMessage { get; set; } = string.Empty;
        public long LatencyMs { get; set; }
        public int QoS { get; set; }
        public string Topic { get; set; } = string.Empty;
        public bool ConnectionRecreated { get; set; } = false;
        public ushort? PacketId { get; set; }
        public string ResponseMessage { get; set; } = string.Empty;
    }

    // MQTT stream health tracking for detailed connection analytics
    public class MqttStreamHealth
    {
        public string ConnectionState { get; set; } = "good"; // "good", "poor", "disconnected"
        public int ConsecutiveFailures { get; set; } = 0;
        public int ConsecutiveSuccesses { get; set; } = 0;
        public DateTime LastSuccessTime { get; set; } = DateTime.UtcNow;
        public DateTime LastFailureTime { get; set; } = DateTime.MinValue;
        public string LastErrorMessage { get; set; } = string.Empty;
        public double SuccessRate { get; set; } = 100.0; // Rolling 10-attempt window
        public List<bool> RecentAttempts { get; set; } = new(); // Last 10 attempts for rolling average
        public string ErrorType { get; set; } = string.Empty; // Latest error type

        // MQTT-specific health metrics
        public bool ConnectionRecreated { get; set; } = false;
        public DateTime LastConnectionRecreation { get; set; } = DateTime.MinValue;
        public int ConnectionRecreationCount { get; set; } = 0;
        public int AcknowledgmentTimeouts { get; set; } = 0;
        public int PublishFailures { get; set; } = 0;

        // Performance metrics
        public double AverageLatency { get; set; } = 0.0;
        public long MaxLatency { get; set; } = 0;
        public long MinLatency { get; set; } = long.MaxValue;

        // Topic-specific latencies (for multi-topic streams)
        public Dictionary<string, double> TopicLatencies { get; set; } = new();

        public void UpdateHealth(MqttSendResult result)
        {
            // Update recent attempts (rolling window of 10)
            RecentAttempts.Add(result.Success);
            if (RecentAttempts.Count > 10)
                RecentAttempts.RemoveAt(0);

            // Calculate success rate
            SuccessRate = RecentAttempts.Count > 0 ?
                RecentAttempts.Count(x => x) * 100.0 / RecentAttempts.Count : 100.0;

            // Update latency metrics
            if (result.Success && result.LatencyMs > 0)
            {
                AverageLatency = AverageLatency == 0 ? result.LatencyMs :
                    (AverageLatency * 0.8) + (result.LatencyMs * 0.2); // Weighted average
                MaxLatency = Math.Max(MaxLatency, result.LatencyMs);
                MinLatency = Math.Min(MinLatency, result.LatencyMs);

                // Track per-topic latency
                if (!string.IsNullOrEmpty(result.Topic))
                {
                    TopicLatencies[result.Topic] = TopicLatencies.ContainsKey(result.Topic) ?
                        (TopicLatencies[result.Topic] * 0.8) + (result.LatencyMs * 0.2) : result.LatencyMs;
                }
            }

            if (result.Success)
            {
                ConsecutiveSuccesses++;
                ConsecutiveFailures = 0;
                LastSuccessTime = DateTime.UtcNow;
                ErrorType = string.Empty;
                LastErrorMessage = string.Empty;
            }
            else
            {
                ConsecutiveFailures++;
                ConsecutiveSuccesses = 0;
                LastFailureTime = DateTime.UtcNow;
                ErrorType = result.ErrorType;
                LastErrorMessage = result.ErrorMessage;

                // Track MQTT-specific error types
                if (result.ErrorType == "acknowledgment_timeout")
                {
                    AcknowledgmentTimeouts++;
                }
                else if (result.ErrorType.Contains("publish") || result.ErrorType.Contains("mqtt"))
                {
                    PublishFailures++;
                }
            }

            // Track connection recreation events
            if (result.ConnectionRecreated)
            {
                ConnectionRecreated = true;
                LastConnectionRecreation = DateTime.UtcNow;
                ConnectionRecreationCount++;
            }

            // Determine connection state
            DetermineConnectionState();
        }

        private void DetermineConnectionState()
        {
            // Simplified MQTT connection state logic (no acknowledgment timeout simulation)
            // Good: High success rate and no recent failures
            if (SuccessRate >= 95.0 && ConsecutiveFailures == 0)
            {
                ConnectionState = "good";
            }
            // Poor: Moderate success rate or some failures but still functional
            else if (SuccessRate >= 70.0 || (ConsecutiveFailures > 0 && ConsecutiveFailures < 3))
            {
                ConnectionState = "poor";
            }
            // Disconnected: Low success rate or sustained failures
            else
            {
                ConnectionState = "disconnected";
            }

            // Special cases for MQTT connection issues
            if (ConnectionRecreated && SuccessRate < 90.0)
            {
                ConnectionState = "poor"; // Connection recreation indicates instability
            }

            // High latency threshold for MQTT (typically lower than HTTP)
            if (ConnectionState == "good" && AverageLatency > 150) // 150ms threshold for MQTT
            {
                ConnectionState = "poor";
            }
        }
    }

    public class Service_Send_Data_MQTT : IDisposable
    {
        private readonly string _brokerAddress;
        private readonly int _brokerPort;
        private readonly string? _username;
        private readonly string? _password;
        private readonly Service_MQTT _mqttService;
        private bool _disposed = false;

        public Service_Send_Data_MQTT(
            string brokerAddress,
            int? mqttPort = null,
            string? username = null,
            string? password = null,
            Service_MQTT? existingMqttService = null)
        {
            _brokerAddress = brokerAddress ?? throw new ArgumentNullException(nameof(brokerAddress));
            _brokerPort = mqttPort ?? 1883; // Default MQTT port
            _username = username;
            _password = password;

            // Use existing MQTT service if provided, otherwise create new one
            _mqttService = existingMqttService ?? new Service_MQTT();
        }

        public async Task<(bool Success, string ResponseMessage)> PublishTopicAsync(string topic, string payload, int qos = 0)
        {
            var result = await PublishTopicWithHealthAsync(topic, payload, qos);
            return (result.Success, result.ResponseMessage);
        }

        public async Task<MqttSendResult> PublishTopicWithHealthAsync(string topic, string payload, int qos = 0)
        {
            if (_disposed)
                throw new ObjectDisposedException(nameof(Service_Send_Data_MQTT));

            var stopwatch = Stopwatch.StartNew();
            bool connectionRecreated = false;

            try
            {
                // Check and restore connection if needed
                if (!_mqttService.IsConnected)
                {
                    Console.WriteLine($"[SERVICE_SEND_DATA_MQTT] MQTT client is not connected to {_brokerAddress}:{_brokerPort}. Attempting to connect.");
                    await _mqttService.ConnectAsync();
                    connectionRecreated = true;
                }

                if (!_mqttService.IsConnected)
                {
                    stopwatch.Stop();
                    return new MqttSendResult
                    {
                        Success = false,
                        ErrorType = "connection_failed",
                        ErrorMessage = $"MQTT client failed to connect to {_brokerAddress}:{_brokerPort}",
                        LatencyMs = stopwatch.ElapsedMilliseconds,
                        QoS = qos,
                        Topic = topic,
                        ConnectionRecreated = connectionRecreated
                    };
                }

                // Publish to MQTT broker
                await _mqttService.PublishAsync(topic, payload, qos);
                stopwatch.Stop();

                return new MqttSendResult
                {
                    Success = true,
                    LatencyMs = stopwatch.ElapsedMilliseconds,
                    QoS = qos,
                    Topic = topic,
                    ConnectionRecreated = connectionRecreated,
                    ResponseMessage = $"Published to {topic} on {_brokerAddress}:{_brokerPort} with QoS {qos}"
                };
            }
            catch (TaskCanceledException ex) when (ex.InnerException is TimeoutException)
            {
                stopwatch.Stop();
                return new MqttSendResult
                {
                    Success = false,
                    ErrorType = "timeout",
                    ErrorMessage = "MQTT publish operation timed out",
                    LatencyMs = stopwatch.ElapsedMilliseconds,
                    QoS = qos,
                    Topic = topic,
                    ConnectionRecreated = connectionRecreated
                };
            }
            catch (Exception ex)
            {
                stopwatch.Stop();

                // Categorize MQTT errors
                string errorType = ex.Message.ToLower() switch
                {
                    var msg when msg.Contains("connection") && msg.Contains("lost") => "connection_lost",
                    var msg when msg.Contains("connection") && msg.Contains("refused") => "connection_refused",
                    var msg when msg.Contains("broker") && msg.Contains("unavailable") => "broker_unavailable",
                    var msg when msg.Contains("authentication") => "authentication_failed",
                    var msg when msg.Contains("authorization") => "authorization_failed",
                    var msg when msg.Contains("timeout") => "timeout",
                    var msg when msg.Contains("network") => "network_error",
                    var msg when msg.Contains("topic") => "topic_error",
                    _ => "mqtt_error"
                };

                Console.WriteLine($"[SERVICE_SEND_DATA_MQTT] MQTT error publishing to {topic} on {_brokerAddress}:{_brokerPort} (QoS {qos}): {ex.Message}");

                return new MqttSendResult
                {
                    Success = false,
                    ErrorType = errorType,
                    ErrorMessage = ex.Message,
                    LatencyMs = stopwatch.ElapsedMilliseconds,
                    QoS = qos,
                    Topic = topic,
                    ConnectionRecreated = connectionRecreated
                };
            }
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                _disposed = true;
                // No cleanup needed for simplified version
            }
        }
    }
}