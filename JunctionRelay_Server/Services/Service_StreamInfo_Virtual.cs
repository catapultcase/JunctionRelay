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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * You should have received a copy of the GNU General Public License
 * along with JunctionRelay. If not, see <https://www.gnu.org/licenses/>.
 */

using System.Text.Json;
using System.Text.Json.Serialization;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_StreamInfo_Virtual
    {
        public string DeviceName { get; set; } = string.Empty;
        public int Rate { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? Protocol { get; set; } = "Virtual";

        [JsonIgnore]
        public CancellationTokenSource Cts { get; set; } = new();

        public int ScreenId { get; set; }
        public string ScreenName { get; set; } = string.Empty;
        public int SensorsCount { get; set; }
        public long Latency { get; set; }
        public DateTime LastGeneratedTime { get; set; }

        // Health tracking for the simulated stream
        public StreamHealth Health { get; set; } = new StreamHealth();

        // NEW: track payload count for virtual streams (mirrors real behavior)
        public long PayloadsGenerated { get; private set; }

        // NEW: Last generated frame data
        [JsonIgnore]
        public byte[]? LastGeneratedFrameBytes { get; private set; }
        public DateTime? LastFrameGeneratedTime { get; private set; }
        public int? LastFrameSize => LastGeneratedFrameBytes?.Length;
        public string? LastFrameLayoutType { get; private set; }

        // hold the parsed JSON docs for config/payload
        [JsonIgnore]
        public JsonDocument ConfigPayloadDoc { get; set; } = JsonDocument.Parse("{}");
        [JsonIgnore]
        public JsonDocument LastGeneratedPayloadDoc { get; set; } = JsonDocument.Parse("{}");

        // Thread-safe cached JSON strings
        private string _configPayloadJsonCache = "{}";
        private string _lastGeneratedPayloadJsonCache = "{}";

        private readonly object _jsonCacheLock = new object();

        // Expose JSON text
        public string ConfigPayloadJson
        {
            get { lock (_jsonCacheLock) return _configPayloadJsonCache; }
        }

        public string LastGeneratedPayloadJson
        {
            get { lock (_jsonCacheLock) return _lastGeneratedPayloadJsonCache; }
        }

        // Update config payload
        public void UpdateConfigPayload(string jsonString)
        {
            lock (_jsonCacheLock)
            {
                ConfigPayloadDoc?.Dispose();
                ConfigPayloadDoc = JsonDocument.Parse(jsonString);
                _configPayloadJsonCache = jsonString;
            }
        }

        // Update last generated payload
        public void UpdateLastGeneratedPayload(string jsonString)
        {
            lock (_jsonCacheLock)
            {
                LastGeneratedPayloadDoc?.Dispose();
                LastGeneratedPayloadDoc = JsonDocument.Parse(jsonString);
                _lastGeneratedPayloadJsonCache = jsonString;
                PayloadsGenerated++; // ✅ increment counter
            }
        }

        // Update last generated frame data
        public void UpdateLastGeneratedFrame(byte[] frameBytes, string? layoutType = null)
        {
            lock (_jsonCacheLock)
            {
                LastGeneratedFrameBytes = frameBytes;
                LastFrameGeneratedTime = DateTime.UtcNow;
                LastFrameLayoutType = layoutType;
            }
        }

        // Get a safe copy of the frame
        public byte[]? GetLastGeneratedFrameCopy()
        {
            lock (_jsonCacheLock)
            {
                if (LastGeneratedFrameBytes == null) return null;

                var copy = new byte[LastGeneratedFrameBytes.Length];
                Array.Copy(LastGeneratedFrameBytes, copy, LastGeneratedFrameBytes.Length);
                return copy;
            }
        }

        // Clear last frame
        public void ClearLastGeneratedFrame()
        {
            lock (_jsonCacheLock)
            {
                LastGeneratedFrameBytes = null;
                LastFrameGeneratedTime = null;
                LastFrameLayoutType = null;
            }
        }

        public void Dispose()
        {
            lock (_jsonCacheLock)
            {
                ConfigPayloadDoc?.Dispose();
                LastGeneratedPayloadDoc?.Dispose();
                Cts?.Dispose();

                // clear frame data
                LastGeneratedFrameBytes = null;
                LastFrameGeneratedTime = null;
                LastFrameLayoutType = null;
            }
        }
    }
}
