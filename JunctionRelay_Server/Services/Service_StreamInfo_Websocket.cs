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
    public class Service_StreamInfo_WebSocket
    {
        public string DeviceName { get; set; } = string.Empty;
        public string DeviceMac { get; set; } = string.Empty;
        public int Rate { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? Protocol { get; set; }

        [JsonIgnore]
        public CancellationTokenSource Cts { get; set; } = new();

        // WebSocket sender for this stream
        [JsonIgnore]
        public Service_Send_Data_WebSocket? WebSocketSender { get; set; }

        public int ScreenId { get; set; }
        public string ScreenName { get; set; } = string.Empty;
        public int SensorsCount { get; set; }
        public long Latency { get; set; }
        public DateTime LastSentTime { get; set; }

        // WebSocket-specific health tracking
        public WebSocketStreamHealth Health { get; set; } = new WebSocketStreamHealth();

        // Compression setting
        [JsonIgnore]
        public bool CompressionEnabled { get; private set; }

        // Gateway mode settings
        [JsonIgnore]
        public bool IsGatewayMode { get; private set; }
        [JsonIgnore]
        public string? GatewayTarget { get; private set; }

        // Frame data for frame mode (same as HTTP version)
        [JsonIgnore]
        public byte[]? LastSentFrameBytes { get; private set; }
        public DateTime? LastFrameGeneratedTime { get; private set; }
        public int? LastFrameSize => LastSentFrameBytes?.Length;
        public string? LastFrameLayoutType { get; private set; }

        // Uncompressed payload prefixes (8-digit length hints)
        public string ConfigPayloadPrefix { get; set; } = string.Empty;
        public string LastSentPayloadPrefix { get; set; } = string.Empty;

        // Compressed payload prefixes (8-digit LLLLTTRR format)
        public string CompressedConfigPayloadPrefix { get; set; } = string.Empty;
        public string CompressedLastSentPayloadPrefix { get; set; } = string.Empty;

        // JSON document storage
        [JsonIgnore]
        public JsonDocument ConfigPayloadDoc { get; set; } = JsonDocument.Parse("{}");
        [JsonIgnore]
        public JsonDocument LastSentPayloadDoc { get; set; } = JsonDocument.Parse("{}");

        // Thread-safe cached JSON strings
        private string _configPayloadJsonCache = "{}";
        private string _lastSentPayloadJsonCache = "{}";

        // Compressed payload caches as hex strings
        private string? _compressedConfigHexCache;
        private string? _compressedLastSentHexCache;

        private readonly object _jsonCacheLock = new object();

        public bool IsVirtualBlitMode { get; set; } = false;
        public int? VirtualScreenId { get; set; }

        // Constructor with WebSocket-specific settings
        public Service_StreamInfo_WebSocket(
            bool compressionEnabled = false,
            bool isGatewayMode = false,
            string? gatewayTarget = null)
        {
            CompressionEnabled = compressionEnabled;
            IsGatewayMode = isGatewayMode;
            GatewayTarget = gatewayTarget;

            // Set health tracking gateway mode
            Health.IsGatewayMode = isGatewayMode;
            Health.GatewayTarget = gatewayTarget;
        }

        // Method to update compression setting
        public void SetCompressionEnabled(bool enabled)
        {
            lock (_jsonCacheLock)
            {
                CompressionEnabled = enabled;

                // Clear compressed caches if compression is disabled
                if (!enabled)
                {
                    _compressedConfigHexCache = null;
                    _compressedLastSentHexCache = null;
                    CompressedConfigPayloadPrefix = string.Empty;
                    CompressedLastSentPayloadPrefix = string.Empty;
                }
            }
        }

        // Method to update gateway settings
        public void SetGatewayMode(bool isGatewayMode, string? gatewayTarget = null)
        {
            lock (_jsonCacheLock)
            {
                IsGatewayMode = isGatewayMode;
                GatewayTarget = gatewayTarget;
                Health.IsGatewayMode = isGatewayMode;
                Health.GatewayTarget = gatewayTarget;
            }
        }

        // Frame management methods (same as HTTP version)
        public void UpdateLastSentFrame(byte[] frameBytes, string? layoutType = null)
        {
            lock (_jsonCacheLock)
            {
                LastSentFrameBytes = frameBytes;
                LastFrameGeneratedTime = DateTime.UtcNow;
                LastFrameLayoutType = layoutType;
                // Console.WriteLine($"[StreamInfo WS] Set LastFrameGeneratedTime={LastFrameGeneratedTime} for {DeviceName} - {ScreenName}");
            }
        }

        public byte[]? GetLastSentFrameCopy()
        {
            lock (_jsonCacheLock)
            {
                if (LastSentFrameBytes == null) return null;

                var copy = new byte[LastSentFrameBytes.Length];
                Array.Copy(LastSentFrameBytes, copy, LastSentFrameBytes.Length);
                return copy;
            }
        }

        public void ClearLastSentFrame()
        {
            lock (_jsonCacheLock)
            {
                LastSentFrameBytes = null;
                LastFrameGeneratedTime = null;
                LastFrameLayoutType = null;
            }
        }

        // JSON payload management
        public string ConfigPayloadJson
        {
            get
            {
                lock (_jsonCacheLock)
                {
                    return _configPayloadJsonCache;
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

        public void UpdateConfigPayload(string jsonString)
        {
            lock (_jsonCacheLock)
            {
                ConfigPayloadDoc?.Dispose();
                ConfigPayloadDoc = JsonDocument.Parse(jsonString);
                _configPayloadJsonCache = jsonString;

                // Clear compressed cache so it gets regenerated on next access
                _compressedConfigHexCache = null;
            }
        }

        public void UpdateLastSentPayload(string jsonString)
        {
            lock (_jsonCacheLock)
            {
                LastSentPayloadDoc?.Dispose();
                LastSentPayloadDoc = JsonDocument.Parse(jsonString);
                _lastSentPayloadJsonCache = jsonString;

                // Clear compressed cache so it gets regenerated on next access
                _compressedLastSentHexCache = null;
            }
        }

        // Compressed payload prefix management
        public void UpdateCompressedConfigPayloadPrefix(string prefix)
        {
            lock (_jsonCacheLock)
            {
                CompressedConfigPayloadPrefix = prefix;
            }
        }

        public void UpdateCompressedLastSentPayloadPrefix(string prefix)
        {
            lock (_jsonCacheLock)
            {
                CompressedLastSentPayloadPrefix = prefix;
            }
        }

        // Compressed payload preview methods
        public string GetCompressedConfigPayloadPreview()
        {
            if (!CompressionEnabled)
                return "[Compression disabled]";

            if (string.IsNullOrEmpty(ConfigPayloadJson))
                return "";

            lock (_jsonCacheLock)
            {
                // Use cached version if available
                if (_compressedConfigHexCache != null)
                    return _compressedConfigHexCache;

                // Generate and cache compressed version as hex
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

            lock (_jsonCacheLock)
            {
                // Use cached version if available
                if (_compressedLastSentHexCache != null)
                    return _compressedLastSentHexCache;

                // Generate and cache compressed version as hex
                var jsonBytes = Encoding.UTF8.GetBytes(LastSentPayloadJson);
                var compressedBytes = CompressData(jsonBytes);
                _compressedLastSentHexCache = BytesToHex(compressedBytes);
                return _compressedLastSentHexCache;
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
            for (int i = 0; i < bytes.Length; i++)
            {
                if (i > 0)
                    sb.Append(' ');
                sb.Append(bytes[i].ToString("x2"));
            }
            return sb.ToString();
        }

        // WebSocket-specific status methods
        public bool IsWebSocketConnected()
        {
            // This would check the WebSocket connection status through the manager
            // Implementation depends on how you want to expose connection status
            return Health.ConnectionState != "disconnected" &&
                   Status == "Active";
        }

        public string GetConnectionStatusSummary()
        {
            var summary = new StringBuilder();
            summary.AppendLine($"Device: {DeviceName} ({DeviceMac})");
            summary.AppendLine($"Protocol: {Protocol}");
            summary.AppendLine($"Status: {Status}");
            summary.AppendLine($"Health: {Health.ConnectionState}");
            summary.AppendLine($"Success Rate: {Health.SuccessRate:F1}%");

            if (IsGatewayMode)
            {
                summary.AppendLine($"Gateway Mode: Yes");
                summary.AppendLine($"Gateway Target: {GatewayTarget}");
                summary.AppendLine($"Gateway Messages Sent: {Health.GatewayMessagesSent}");
            }

            if (Health.IsFrameMode)
            {
                summary.AppendLine($"Frame Mode: Yes");
                summary.AppendLine($"Frames Sent: {Health.FramesSent}");
                summary.AppendLine($"Average Frame Size: {Health.AverageFrameSize:F0} bytes");
            }
            else
            {
                summary.AppendLine($"Payloads Sent: {Health.PayloadsSent}");
            }

            if (Health.LastErrorMessage != string.Empty)
            {
                summary.AppendLine($"Last Error: {Health.LastErrorMessage}");
            }

            return summary.ToString();
        }

        // Get WebSocket-specific metrics for monitoring
        public object GetWebSocketMetrics()
        {
            return new
            {
                DeviceMac,
                DeviceName,
                Protocol,
                ConnectionHealth = new
                {
                    ConnectionState = Health.ConnectionState,
                    SuccessRate = Health.SuccessRate,
                    ConsecutiveFailures = Health.ConsecutiveFailures,
                    ConsecutiveSuccesses = Health.ConsecutiveSuccesses,
                    AverageLatency = Health.AverageLatency,
                    LastWebSocketState = Health.LastWebSocketState?.ToString(),
                    ConnectionRecreated = Health.ConnectionRecreated,
                    ConnectionRecreationCount = Health.ConnectionRecreationCount
                },
                GatewayInfo = IsGatewayMode ? new
                {
                    IsGatewayMode,
                    GatewayTarget,
                    GatewayMessagesSent = Health.GatewayMessagesSent
                } : null,
                FrameInfo = Health.IsFrameMode ? new
                {
                    IsFrameMode = Health.IsFrameMode,
                    FramesSent = Health.FramesSent,
                    AverageFrameSize = Health.AverageFrameSize,
                    CurrentFrameLayoutType = Health.CurrentFrameLayoutType,
                    AverageFrameRenderTime = Health.AverageFrameRenderTime
                } : null,
                PayloadInfo = new
                {
                    CompressionEnabled,
                    PayloadsSent = Health.PayloadsSent,
                    PayloadType = Health.PayloadType,
                    ConfigPayloadPrefix,
                    LastSentPayloadPrefix,
                    CompressedConfigPayloadPrefix,
                    CompressedLastSentPayloadPrefix
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

        // Dispose method with WebSocket-specific cleanup
        public void Dispose()
        {
            lock (_jsonCacheLock)
            {
                ConfigPayloadDoc?.Dispose();
                LastSentPayloadDoc?.Dispose();
                Cts?.Dispose();
                WebSocketSender?.Dispose();

                // Clear compressed caches
                _compressedConfigHexCache = null;
                _compressedLastSentHexCache = null;

                // Clear frame data to free memory
                LastSentFrameBytes = null;
                LastFrameGeneratedTime = null;
                LastFrameLayoutType = null;

                Console.WriteLine($"[SERVICE_STREAMINFO_WEBSOCKET] Disposed stream info for {DeviceName} ({DeviceMac})");
            }
        }
    }
}