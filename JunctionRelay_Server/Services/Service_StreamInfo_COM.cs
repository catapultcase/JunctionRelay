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

using System.Text.Json.Serialization;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_StreamInfo_COM
    {
        public string DeviceName { get; set; } = string.Empty;
        public int Rate { get; set; }
        public string Status { get; set; } = string.Empty;
        public string Protocol { get; set; } = "COM";

        [JsonIgnore]
        public CancellationTokenSource Cts { get; set; } = new();

        [JsonIgnore]
        public Service_Send_Data_COM? ComSender { get; set; }

        public string? ComPort { get; set; }
        public int ScreenId { get; set; }
        public string ScreenName { get; set; } = string.Empty;
        public int SensorsCount { get; set; }
        public long Latency { get; set; }
        public DateTime LastSentTime { get; set; }

        // Health tracking
        public ComStreamHealth Health { get; set; } = new ComStreamHealth();

        // Gateway mode support
        public bool IsGatewayMode { get; private set; }
        public string? GatewayTarget { get; private set; }

        // Frame data for blit mode
        [JsonIgnore]
        public byte[]? LastSentFrameBytes { get; private set; }
        public DateTime? LastFrameGeneratedTime { get; private set; }
        public int? LastFrameSize => LastSentFrameBytes?.Length;
        public string? LastFrameLayoutType { get; private set; }

        // Payload tracking for UI and virtual screens
        public string ConfigPayloadPrefix { get; set; } = string.Empty;
        public string ConfigPayloadJson { get; private set; } = string.Empty;
        public string LastSentPayloadPrefix { get; set; } = string.Empty;
        public string LastSentPayloadJson { get; private set; } = string.Empty;
        public string CompressedConfigPayloadPrefix { get; private set; } = string.Empty;
        public string CompressedLastSentPayloadPrefix { get; private set; } = string.Empty;

        // Thread-safe frame operations
        private readonly object _frameLock = new();
        private readonly object _payloadLock = new();

        // Constructor with gateway mode support
        public Service_StreamInfo_COM(bool compressionEnabled = false, bool isGatewayMode = false, string? gatewayTarget = null)
        {
            IsGatewayMode = isGatewayMode;
            GatewayTarget = gatewayTarget;
        }

        public void UpdateLastSentFrame(byte[] frameBytes, string? layoutType = null)
        {
            lock (_frameLock)
            {
                // Only allocate new array if size changed (reduces GC pressure)
                if (LastSentFrameBytes == null || LastSentFrameBytes.Length != frameBytes.Length)
                {
                    LastSentFrameBytes = new byte[frameBytes.Length];
                }
                Array.Copy(frameBytes, LastSentFrameBytes, frameBytes.Length);
                LastFrameGeneratedTime = DateTime.UtcNow;
                LastFrameLayoutType = layoutType;
            }
        }

        public byte[]? GetLastSentFrameCopy()
        {
            lock (_frameLock)
            {
                if (LastSentFrameBytes == null) return null;

                var copy = new byte[LastSentFrameBytes.Length];
                Array.Copy(LastSentFrameBytes, copy, LastSentFrameBytes.Length);
                return copy;
            }
        }

        public void ClearLastSentFrame()
        {
            lock (_frameLock)
            {
                LastSentFrameBytes = null;
                LastFrameGeneratedTime = null;
                LastFrameLayoutType = null;
            }
        }

        public void UpdateConfigPayload(string jsonPayload)
        {
            lock (_payloadLock)
            {
                ConfigPayloadJson = jsonPayload ?? string.Empty;
            }
        }

        public void UpdateLastSentPayload(string jsonPayload)
        {
            lock (_payloadLock)
            {
                LastSentPayloadJson = jsonPayload ?? string.Empty;
            }
        }

        public void UpdateCompressedConfigPayloadPrefix(string prefix)
        {
            lock (_payloadLock)
            {
                CompressedConfigPayloadPrefix = prefix ?? string.Empty;
            }
        }

        public void UpdateCompressedLastSentPayloadPrefix(string prefix)
        {
            lock (_payloadLock)
            {
                CompressedLastSentPayloadPrefix = prefix ?? string.Empty;
            }
        }

        public string GetCompressedConfigPayloadPreview()
        {
            lock (_payloadLock)
            {
                if (string.IsNullOrEmpty(CompressedConfigPayloadPrefix))
                    return ConfigPayloadJson;

                return $"[{CompressedConfigPayloadPrefix}] {(ConfigPayloadJson.Length > 200 ? ConfigPayloadJson.Substring(0, 200) + "..." : ConfigPayloadJson)}";
            }
        }

        public string GetCompressedLastSentPayloadPreview()
        {
            lock (_payloadLock)
            {
                if (string.IsNullOrEmpty(CompressedLastSentPayloadPrefix))
                    return LastSentPayloadJson;

                return $"[{CompressedLastSentPayloadPrefix}] {(LastSentPayloadJson.Length > 200 ? LastSentPayloadJson.Substring(0, 200) + "..." : LastSentPayloadJson)}";
            }
        }

        public void Dispose()
        {
            lock (_frameLock)
            {
                lock (_payloadLock)
                {
                    Cts?.Dispose();
                    ComSender?.Dispose();
                    LastSentFrameBytes = null;
                    LastFrameGeneratedTime = null;
                    LastFrameLayoutType = null;
                    ConfigPayloadJson = string.Empty;
                    LastSentPayloadJson = string.Empty;
                    CompressedConfigPayloadPrefix = string.Empty;
                    CompressedLastSentPayloadPrefix = string.Empty;
                }
            }
        }
    }
}