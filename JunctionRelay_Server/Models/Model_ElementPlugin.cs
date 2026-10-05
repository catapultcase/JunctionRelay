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

namespace JunctionRelayServer.Models
{
    // ========================================================================
    // Element Plugin Configuration (appsettings.json → ElementPlugins section)
    // ========================================================================

    public class Model_ElementPluginConfig
    {
        public string? ElementsDirectory { get; set; }
        public bool Enabled { get; set; } = true;
    }

    // ========================================================================
    // Element Plugin Manifest (mirrors ElementPluginManifest from protocol)
    // ========================================================================

    /// <summary>
    /// The "junctionrelay" field from a plugin's package.json.
    /// Read at discovery time — the Server never executes plugin code.
    /// </summary>
    public class ElementPluginManifest
    {
        [JsonPropertyName("type")]
        public string Type { get; set; } = "";

        [JsonPropertyName("entry")]
        public string Entry { get; set; } = "";

        [JsonPropertyName("elementName")]
        public string ElementName { get; set; } = "";

        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = "";

        [JsonPropertyName("description")]
        public string Description { get; set; } = "";

        [JsonPropertyName("category")]
        public string Category { get; set; } = "";

        [JsonPropertyName("icon")]
        public string Icon { get; set; } = "";

        [JsonPropertyName("emoji")]
        public string Emoji { get; set; } = "";

        [JsonPropertyName("sensorTagCompatible")]
        public bool SensorTagCompatible { get; set; }

        [JsonPropertyName("defaultSize")]
        public ElementDefaultSize DefaultSize { get; set; } = new();

        [JsonPropertyName("defaultProperties")]
        public Dictionary<string, object?> DefaultProperties { get; set; } = new();

        [JsonPropertyName("layoutModes")]
        public List<string>? LayoutModes { get; set; }

        [JsonPropertyName("authorName")]
        public string? AuthorName { get; set; }

        [JsonPropertyName("authorUrl")]
        public string? AuthorUrl { get; set; }

        [JsonPropertyName("authorId")]
        public string? AuthorId { get; set; }

        [JsonPropertyName("authorAvatarUrl")]
        public string? AuthorAvatarUrl { get; set; }
    }

    public class ElementDefaultSize
    {
        [JsonPropertyName("width")]
        public int Width { get; set; }

        [JsonPropertyName("height")]
        public int Height { get; set; }
    }

    // ========================================================================
    // Discovery Result (filesystem scan output)
    // ========================================================================

    /// <summary>
    /// Result of scanning the elements directory for a valid plugin manifest.
    /// </summary>
    public class DiscoveredElementPlugin
    {
        public string Name { get; set; } = "";
        public string Version { get; set; } = "";
        public string Path { get; set; } = "";
        public string Entry { get; set; } = "";
        public ElementPluginManifest Manifest { get; set; } = new();
    }

    // ========================================================================
    // Registry Entry (what the API returns to the frontend)
    // ========================================================================

    /// <summary>
    /// Complete element plugin definition exposed to the frontend.
    /// The frontend uses this to populate the Library tab and know
    /// which element types have plugin renderers.
    /// </summary>
    public class ElementPluginDefinition
    {
        [JsonPropertyName("elementName")]
        public string ElementName { get; set; } = "";

        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = "";

        [JsonPropertyName("description")]
        public string Description { get; set; } = "";

        [JsonPropertyName("category")]
        public string Category { get; set; } = "";

        [JsonPropertyName("icon")]
        public string Icon { get; set; } = "";

        [JsonPropertyName("emoji")]
        public string Emoji { get; set; } = "";

        [JsonPropertyName("sensorTagCompatible")]
        public bool SensorTagCompatible { get; set; }

        [JsonPropertyName("defaultSize")]
        public ElementDefaultSize DefaultSize { get; set; } = new();

        [JsonPropertyName("defaultProperties")]
        public Dictionary<string, object?> DefaultProperties { get; set; } = new();

        [JsonPropertyName("layoutModes")]
        public List<string> LayoutModes { get; set; } = new() { "composite" };

        [JsonPropertyName("packageName")]
        public string PackageName { get; set; } = "";

        [JsonPropertyName("version")]
        public string Version { get; set; } = "";

        [JsonPropertyName("source")]
        public string Source { get; set; } = "user";

        [JsonPropertyName("bundlePath")]
        public string BundlePath { get; set; } = "";

        [JsonPropertyName("authorName")]
        public string? AuthorName { get; set; }

        [JsonPropertyName("authorUrl")]
        public string? AuthorUrl { get; set; }

        [JsonPropertyName("authorId")]
        public string? AuthorId { get; set; }

        [JsonPropertyName("authorAvatarUrl")]
        public string? AuthorAvatarUrl { get; set; }
    }
}
