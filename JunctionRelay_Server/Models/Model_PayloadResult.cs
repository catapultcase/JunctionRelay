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

namespace JunctionRelayServer.Models
{
    public class Model_PayloadResult
    {
        public byte[] BinaryPayload { get; set; } = Array.Empty<byte>();
        public string UncompressedJson { get; set; } = string.Empty;
        public string UncompressedPrefix { get; set; } = string.Empty;
        public string CompressedPrefix { get; set; } = string.Empty;
        public bool IsCompressed { get; set; }
        public string PayloadType { get; set; } = string.Empty; // "config", "sensor", "composite", etc.
    }

    public class Model_PayloadResultCollection
    {
        public Dictionary<string, Model_PayloadResult> Results { get; set; } = new();

        public Model_PayloadResult? GetResult(string screenKey)
        {
            return Results.TryGetValue(screenKey, out var result) ? result : null;
        }

        public void AddResult(string screenKey, Model_PayloadResult result)
        {
            Results[screenKey] = result;
        }
    }
}