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
    public class Model_PayloadPluginMetadata
    {
        public required string ProtocolName { get; set; }
        public required string DisplayName { get; set; }
        public required string Description { get; set; }
        public required string Category { get; set; }
        public required string Emoji { get; set; }
        public List<string> Configurable { get; set; } = new();
        public Dictionary<string, object?> Defaults { get; set; } = new();
        public List<string> Profiles { get; set; } = new();
        public string? OutputContentType { get; set; }
        public string? OutputDescription { get; set; }
        public required string Source { get; set; }
        public string? Version { get; set; }
        public string? PackageName { get; set; }
        public string? AuthorName { get; set; }
        public string? AuthorUrl { get; set; }
    }
}
