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

using System.Text.Json;
using System.Text.Json.Serialization;
using System.IO.Compression;
using System.Text;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_StreamInfo_MQTT
    {
        public string DeviceName { get; set; } = string.Empty;
        public int Rate { get; set; }
        public string Status { get; set; } = string.Empty;
        public string Protocol { get; set; } = string.Empty;

        [JsonIgnore]
        public CancellationTokenSource Cts { get; set; } = new();

        [JsonIgnore]
        public Service_Send_Data_MQTT? MqttSender { get; set; }

        public int ScreenId { get; set; }
        public string ScreenName { get; set; } = string.Empty;
        public int SensorsCount { get; set; }
        public long Latency { get; set; }
        public DateTime LastSentTime { get; set; }

        public MqttStreamHealth Health { get; set; } = new MqttStreamHealth();

        [JsonIgnore]
        public bool CompressionEnabled { get; private set; }

        // Standard payload prefixes (for regular config payloads)
        public string ConfigPayloadPrefix { get; set; } = string.Empty;
        public string LastSentPayloadPrefix { get; set; } = string.Empty;

        // MQTT-specific config payload prefixes
        public string StandardConfigPayloadPrefix { get; set; } = string.Empty;
        public string MqttConfigPayloadPrefix { get; set; } = string.Empty;

        // Compressed payload prefixes
        public string CompressedConfigPayloadPrefix { get; set; } = string.Empty;
        public string CompressedLastSentPayloadPrefix { get; set; } = string.Empty;
        public string CompressedStandardConfigPayloadPrefix { get; set; } = string.Empty;
        public string CompressedMqttConfigPayloadPrefix { get; set; } = string.Empty;

        // JSON document storage
        [JsonIgnore]
        public JsonDocument ConfigPayloadDoc { get; set; } = JsonDocument.Parse("{}");
        [JsonIgnore]
        public JsonDocument LastSentPayloadDoc { get; set; } = JsonDocument.Parse("{}");
        [JsonIgnore]
        public JsonDocument StandardConfigPayloadDoc { get; set; } = JsonDocument.Parse("{}");
        [JsonIgnore]
        public JsonDocument MqttConfigPayloadDoc { get; set; } = JsonDocument.Parse("{}");

        // Thread-safe cached JSON strings
        private string _configPayloadJsonCache = "{}";
        private string _lastSentPayloadJsonCache = "{}";
        private string _standardConfigPayloadJsonCache = "{}";
        private string _mqttConfigPayloadJsonCache = "{}";

        // Compressed payload caches as hex strings
        private string? _compressedConfigHexCache;
        private string? _compressedLastSentHexCache;
        private string? _compressedStandardConfigHexCache;
        private string? _compressedMqttConfigHexCache;

        private readonly object _payloadLock = new object();

        public Service_StreamInfo_MQTT(bool compressionEnabled = false)
        {
            CompressionEnabled = compressionEnabled;
        }

        public void SetCompressionEnabled(bool enabled)
        {
            lock (_payloadLock)
            {
                CompressionEnabled = enabled;

                if (!enabled)
                {
                    _compressedConfigHexCache = null;
                    _compressedLastSentHexCache = null;
                    _compressedStandardConfigHexCache = null;
                    _compressedMqttConfigHexCache = null;
                    CompressedConfigPayloadPrefix = string.Empty;
                    CompressedLastSentPayloadPrefix = string.Empty;
                    CompressedStandardConfigPayloadPrefix = string.Empty;
                    CompressedMqttConfigPayloadPrefix = string.Empty;
                }
            }
        }

        // JSON payload properties
        public string ConfigPayloadJson
        {
            get
            {
                lock (_payloadLock)
                {
                    return _configPayloadJsonCache;
                }
            }
        }

        public string LastSentPayloadJson
        {
            get
            {
                lock (_payloadLock)
                {
                    return _lastSentPayloadJsonCache;
                }
            }
        }

        public string StandardConfigPayloadJson
        {
            get
            {
                lock (_payloadLock)
                {
                    return _standardConfigPayloadJsonCache;
                }
            }
        }

        public string MqttConfigPayloadJson
        {
            get
            {
                lock (_payloadLock)
                {
                    return _mqttConfigPayloadJsonCache;
                }
            }
        }

        // Payload update methods
        public void UpdateConfigPayload(string jsonString)
        {
            lock (_payloadLock)
            {
                ConfigPayloadDoc?.Dispose();
                ConfigPayloadDoc = JsonDocument.Parse(jsonString);
                _configPayloadJsonCache = jsonString;
                _compressedConfigHexCache = null;
            }
        }

        public void UpdateLastSentPayload(string jsonString)
        {
            lock (_payloadLock)
            {
                LastSentPayloadDoc?.Dispose();
                LastSentPayloadDoc = JsonDocument.Parse(jsonString);
                _lastSentPayloadJsonCache = jsonString;
                _compressedLastSentHexCache = null;
            }
        }

        public void UpdateStandardConfigPayload(string jsonString)
        {
            lock (_payloadLock)
            {
                StandardConfigPayloadDoc?.Dispose();
                StandardConfigPayloadDoc = JsonDocument.Parse(jsonString);
                _standardConfigPayloadJsonCache = jsonString;
                _compressedStandardConfigHexCache = null;
            }
        }

        public void UpdateMqttConfigPayload(string jsonString)
        {
            lock (_payloadLock)
            {
                MqttConfigPayloadDoc?.Dispose();
                MqttConfigPayloadDoc = JsonDocument.Parse(jsonString);
                _mqttConfigPayloadJsonCache = jsonString;
                _compressedMqttConfigHexCache = null;
            }
        }

        // Compressed prefix update methods
        public void UpdateCompressedConfigPayloadPrefix(string prefix)
        {
            lock (_payloadLock)
            {
                CompressedConfigPayloadPrefix = prefix;
            }
        }

        public void UpdateCompressedLastSentPayloadPrefix(string prefix)
        {
            lock (_payloadLock)
            {
                CompressedLastSentPayloadPrefix = prefix;
            }
        }

        public void UpdateCompressedStandardConfigPayloadPrefix(string prefix)
        {
            lock (_payloadLock)
            {
                CompressedStandardConfigPayloadPrefix = prefix;
            }
        }

        public void UpdateCompressedMqttConfigPayloadPrefix(string prefix)
        {
            lock (_payloadLock)
            {
                CompressedMqttConfigPayloadPrefix = prefix;
            }
        }

        // Compressed payload preview methods
        public string GetCompressedConfigPayloadPreview()
        {
            if (!CompressionEnabled)
                return "[Compression disabled]";

            if (string.IsNullOrEmpty(ConfigPayloadJson))
                return "";

            lock (_payloadLock)
            {
                if (_compressedConfigHexCache != null)
                    return _compressedConfigHexCache;

                var jsonBytes = Encoding.UTF8.GetBytes(ConfigPayloadJson);
                var compressedBytes = CompressData(jsonBytes);
                _compressedConfigHexCache = BytesToHex(compressedBytes);
                return _compressedConfigHexCache;
            }
        }

        public string GetCompressedLastSentPayloadPreview()
        {
            if (!CompressionEnabled)
                return "[Compression disabled]";

            if (string.IsNullOrEmpty(LastSentPayloadJson))
                return "";

            lock (_payloadLock)
            {
                if (_compressedLastSentHexCache != null)
                    return _compressedLastSentHexCache;

                var jsonBytes = Encoding.UTF8.GetBytes(LastSentPayloadJson);
                var compressedBytes = CompressData(jsonBytes);
                _compressedLastSentHexCache = BytesToHex(compressedBytes);
                return _compressedLastSentHexCache;
            }
        }

        public string GetCompressedStandardConfigPayloadPreview()
        {
            if (!CompressionEnabled)
                return "[Compression disabled]";

            if (string.IsNullOrEmpty(StandardConfigPayloadJson))
                return "";

            lock (_payloadLock)
            {
                if (_compressedStandardConfigHexCache != null)
                    return _compressedStandardConfigHexCache;

                var jsonBytes = Encoding.UTF8.GetBytes(StandardConfigPayloadJson);
                var compressedBytes = CompressData(jsonBytes);
                _compressedStandardConfigHexCache = BytesToHex(compressedBytes);
                return _compressedStandardConfigHexCache;
            }
        }

        public string GetCompressedMqttConfigPayloadPreview()
        {
            if (!CompressionEnabled)
                return "[Compression disabled]";

            if (string.IsNullOrEmpty(MqttConfigPayloadJson))
                return "";

            lock (_payloadLock)
            {
                if (_compressedMqttConfigHexCache != null)
                    return _compressedMqttConfigHexCache;

                var jsonBytes = Encoding.UTF8.GetBytes(MqttConfigPayloadJson);
                var compressedBytes = CompressData(jsonBytes);
                _compressedMqttConfigHexCache = BytesToHex(compressedBytes);
                return _compressedMqttConfigHexCache;
            }
        }

        // Helper methods for compression
        private byte[] CompressData(byte[] data)
        {
            using var output = new MemoryStream();
            using (var gzip = new GZipStream(output, CompressionMode.Compress))
            {
                gzip.Write(data, 0, data.Length);
            }
            return output.ToArray();
        }

        private string BytesToHex(byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0)
                return "";

            var sb = new StringBuilder(bytes.Length * 3);
            for (int i = 0; i < Math.Min(bytes.Length, 256); i++)
            {
                if (i > 0)
                    sb.Append(' ');
                sb.Append(bytes[i].ToString("x2"));
            }

            if (bytes.Length > 256)
                sb.Append(" ...");

            return sb.ToString();
        }

        // MQTT-specific status methods
        public bool IsMqttConnected()
        {
            return Health.ConnectionState != "disconnected" && Status == "Active";
        }

        public string GetConnectionStatusSummary()
        {
            var summary = new StringBuilder();
            summary.AppendLine($"Device: {DeviceName}");
            summary.AppendLine($"Protocol: {Protocol}");
            summary.AppendLine($"Status: {Status}");
            summary.AppendLine($"Health: {Health.ConnectionState}");
            summary.AppendLine($"Success Rate: {Health.SuccessRate:F1}%");
            summary.AppendLine($"Publish Failures: {Health.PublishFailures}");

            if (Health.LastErrorMessage != string.Empty)
            {
                summary.AppendLine($"Last Error: {Health.LastErrorMessage}");
            }

            return summary.ToString();
        }

        // Get MQTT-specific metrics for monitoring
        public object GetMqttMetrics()
        {
            return new
            {
                DeviceName,
                Protocol,
                ConnectionHealth = new
                {
                    ConnectionState = Health.ConnectionState,
                    SuccessRate = Health.SuccessRate,
                    ConsecutiveFailures = Health.ConsecutiveFailures,
                    ConsecutiveSuccesses = Health.ConsecutiveSuccesses,
                    AverageLatency = Health.AverageLatency,
                    ConnectionRecreated = Health.ConnectionRecreated,
                    ConnectionRecreationCount = Health.ConnectionRecreationCount
                },
                MqttSpecific = new
                {
                    PublishFailures = Health.PublishFailures,
                    AcknowledgmentTimeouts = Health.AcknowledgmentTimeouts,
                    TopicLatencies = Health.TopicLatencies
                },
                PayloadInfo = new
                {
                    CompressionEnabled,
                    ConfigPayloadPrefix,
                    LastSentPayloadPrefix,
                    StandardConfigPayloadPrefix,
                    MqttConfigPayloadPrefix,
                    CompressedConfigPayloadPrefix,
                    CompressedLastSentPayloadPrefix,
                    CompressedStandardConfigPayloadPrefix,
                    CompressedMqttConfigPayloadPrefix
                },
                PerformanceMetrics = new
                {
                    Latency,
                    AverageLatency = Health.AverageLatency,
                    MaxLatency = Health.MaxLatency,
                    MinLatency = Health.MinLatency,
                    LastSentTime
                }
            };
        }

        public void Dispose()
        {
            lock (_payloadLock)
            {
                ConfigPayloadDoc?.Dispose();
                LastSentPayloadDoc?.Dispose();
                StandardConfigPayloadDoc?.Dispose();
                MqttConfigPayloadDoc?.Dispose();
                Cts?.Dispose();
                MqttSender?.Dispose();

                // Clear compressed caches
                _compressedConfigHexCache = null;
                _compressedLastSentHexCache = null;
                _compressedStandardConfigHexCache = null;
                _compressedMqttConfigHexCache = null;

                Console.WriteLine($"[SERVICE_STREAMINFO_MQTT] Disposed stream info for {DeviceName}");
            }
        }
    }
}