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

        // Add a dedicated MQTT sender for this stream
        [JsonIgnore]
        public Service_Send_Data_MQTT? MqttSender { get; set; }

        public int ScreenId { get; set; }
        public string ScreenName { get; set; } = string.Empty;
        public int SensorsCount { get; set; }
        public long Latency { get; set; }
        public DateTime LastSentTime { get; set; }

        // Add health tracking
        public MqttStreamHealth Health { get; set; } = new MqttStreamHealth();

        // Add compression setting
        [JsonIgnore]
        public bool CompressionEnabled { get; private set; }

        // Uncompressed payload prefixes (8-digit length hints before the '{')
        public string StandardConfigPayloadPrefix { get; set; } = string.Empty;
        public string MqttConfigPayloadPrefix { get; set; } = string.Empty;
        public string LastSentPayloadPrefix { get; set; } = string.Empty;

        // NEW: Compressed payload prefixes (8-digit LLLLTTRR format)
        public string CompressedStandardConfigPayloadPrefix { get; set; } = string.Empty;
        public string CompressedMqttConfigPayloadPrefix { get; set; } = string.Empty;
        public string CompressedLastSentPayloadPrefix { get; set; } = string.Empty;

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

        // Compressed payload caches - store as hex strings for UI display
        private string? _compressedStandardConfigHexCache;
        private string? _compressedMqttConfigHexCache;
        private string? _compressedLastSentHexCache;

        private readonly object _jsonCacheLock = new object();

        // Constructor to set compression state
        public Service_StreamInfo_MQTT(bool compressionEnabled = false)
        {
            CompressionEnabled = compressionEnabled;
        }

        // Method to update compression setting (in case it changes during runtime)
        public void SetCompressionEnabled(bool enabled)
        {
            lock (_jsonCacheLock)
            {
                CompressionEnabled = enabled;

                // Clear compressed caches if compression is disabled
                if (!enabled)
                {
                    _compressedStandardConfigHexCache = null;
                    _compressedMqttConfigHexCache = null;
                    _compressedLastSentHexCache = null;
                    CompressedStandardConfigPayloadPrefix = string.Empty;
                    CompressedMqttConfigPayloadPrefix = string.Empty;
                    CompressedLastSentPayloadPrefix = string.Empty;
                }
            }
        }

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

                // Clear compressed cache so it gets regenerated on next access
                _compressedStandardConfigHexCache = null;
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

                // Clear compressed cache so it gets regenerated on next access
                _compressedMqttConfigHexCache = null;
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

                // Clear compressed cache so it gets regenerated on next access
                _compressedLastSentHexCache = null;
            }
        }

        // NEW: Methods to update compressed payload prefixes
        public void UpdateCompressedStandardConfigPayloadPrefix(string prefix)
        {
            lock (_jsonCacheLock)
            {
                CompressedStandardConfigPayloadPrefix = prefix;
            }
        }

        public void UpdateCompressedMqttConfigPayloadPrefix(string prefix)
        {
            lock (_jsonCacheLock)
            {
                CompressedMqttConfigPayloadPrefix = prefix;
            }
        }

        public void UpdateCompressedLastSentPayloadPrefix(string prefix)
        {
            lock (_jsonCacheLock)
            {
                CompressedLastSentPayloadPrefix = prefix;
            }
        }

        // UPDATED: Methods to get hex views of compressed payloads (replaces base64)
        public string GetCompressedStandardConfigPayloadPreview()
        {
            if (!CompressionEnabled)
                return "[Compression disabled]";

            if (string.IsNullOrEmpty(StandardConfigPayloadJson))
                return "";

            lock (_jsonCacheLock)
            {
                // Use cached version if available
                if (_compressedStandardConfigHexCache != null)
                    return _compressedStandardConfigHexCache;

                // Generate and cache compressed version as hex
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

            lock (_jsonCacheLock)
            {
                // Use cached version if available
                if (_compressedMqttConfigHexCache != null)
                    return _compressedMqttConfigHexCache;

                // Generate and cache compressed version as hex
                var jsonBytes = Encoding.UTF8.GetBytes(MqttConfigPayloadJson);
                var compressedBytes = CompressData(jsonBytes);
                _compressedMqttConfigHexCache = BytesToHex(compressedBytes);
                return _compressedMqttConfigHexCache;
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

        // Helper method for gzip compression
        private byte[] CompressData(byte[] data)
        {
            using var output = new MemoryStream();
            using (var gzip = new GZipStream(output, CompressionMode.Compress))
            {
                gzip.Write(data, 0, data.Length);
            }
            return output.ToArray();
        }

        // Helper method to convert bytes to hex string with spaces for readability
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

        // Updated dispose method to handle MQTT sender
        public void Dispose()
        {
            lock (_jsonCacheLock)
            {
                StandardConfigPayloadDoc?.Dispose();
                MqttConfigPayloadDoc?.Dispose();
                LastSentPayloadDoc?.Dispose();
                Cts?.Dispose();
                MqttSender?.Dispose(); // Dispose the MQTT sender

                // Clear compressed caches
                _compressedStandardConfigHexCache = null;
                _compressedMqttConfigHexCache = null;
                _compressedLastSentHexCache = null;
            }
        }
    }
}