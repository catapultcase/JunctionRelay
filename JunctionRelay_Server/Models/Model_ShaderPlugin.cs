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

namespace JunctionRelayServer.Models
{
    // ========================================================================
    // Shader Plugin Configuration (appsettings.json → ShaderPlugins section)
    // ========================================================================

    public class Model_ShaderPluginConfig
    {
        public string? ShadersDirectory { get; set; }
        public bool Enabled { get; set; } = true;
    }

    // ========================================================================
    // Discovery Results (filesystem scan output)
    // ========================================================================

    public class DiscoveredShaderPlugin
    {
        public string ShaderName { get; set; } = "";
        public string DisplayName { get; set; } = "";
        public string Description { get; set; } = "";
        public string? Emoji { get; set; }
        public string Version { get; set; } = "";
        public string Source { get; set; } = "";
        public string? PackageName { get; set; }
        public string? AuthorName { get; set; }
        public string? AuthorUrl { get; set; }
        public string Path { get; set; } = "";
        public List<ShaderPassDeclaration> Passes { get; set; } = new();
        public bool Feedback { get; set; }
        public bool Opaque { get; set; } = true;
        public bool UsesTexture { get; set; }
        public List<ShaderUniformDeclaration> Uniforms { get; set; } = new();
        public List<ShaderPresetDeclaration> Presets { get; set; } = new();
        public Dictionary<string, string> GlslSources { get; set; } = new();
    }

    public class ShaderSkippedEntry
    {
        public string Path { get; set; } = "";
        public string Reason { get; set; } = "";
    }

    public class ShaderDiscoveryResult
    {
        public List<DiscoveredShaderPlugin> Shaders { get; set; } = new();
        public List<ShaderSkippedEntry> Skipped { get; set; } = new();
    }

    // ========================================================================
    // Shader Pass Declaration (from package.json junctionrelay.passes[])
    // ========================================================================

    public class ShaderPassDeclaration
    {
        [JsonPropertyName("entry")]
        public string Entry { get; set; } = "";

        [JsonPropertyName("displayName")]
        public string? DisplayName { get; set; }
    }

    // ========================================================================
    // Shader Preset Declaration (from package.json junctionrelay.presets[])
    // ========================================================================

    public class ShaderPresetDeclaration
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("default")]
        public bool IsDefault { get; set; }

        [JsonPropertyName("values")]
        public Dictionary<string, JsonElement> Values { get; set; } = new();
    }

    // ========================================================================
    // Shader Uniform Declaration (from package.json junctionrelay.uniforms[])
    // ========================================================================

    public class ShaderUniformDeclaration
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = "";

        [JsonPropertyName("type")]
        public string Type { get; set; } = "";

        [JsonPropertyName("default")]
        public JsonElement? Default { get; set; }

        [JsonPropertyName("min")]
        public double? Min { get; set; }

        [JsonPropertyName("max")]
        public double? Max { get; set; }

        [JsonPropertyName("pass")]
        public int? Pass { get; set; }

        [JsonPropertyName("description")]
        public string? Description { get; set; }
    }

    // ========================================================================
    // API Response (what the frontend receives from GET /api/shaders)
    // ========================================================================

    /// <summary>
    /// Matches the ShaderDefinition interface expected by FrameEngine's fetchShaders().
    /// </summary>
    public class ShaderDefinition
    {
        [JsonPropertyName("shaderName")]
        public string ShaderName { get; set; } = "";

        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = "";

        [JsonPropertyName("description")]
        public string Description { get; set; } = "";

        [JsonPropertyName("emoji")]
        public string? Emoji { get; set; }

        [JsonPropertyName("version")]
        public string Version { get; set; } = "";

        [JsonPropertyName("source")]
        public string Source { get; set; } = "";

        [JsonPropertyName("packageName")]
        public string? PackageName { get; set; }

        [JsonPropertyName("authorName")]
        public string? AuthorName { get; set; }

        [JsonPropertyName("authorUrl")]
        public string? AuthorUrl { get; set; }

        [JsonPropertyName("passes")]
        public List<ShaderPassDeclaration> Passes { get; set; } = new();

        [JsonPropertyName("feedback")]
        public bool Feedback { get; set; }

        [JsonPropertyName("opaque")]
        public bool Opaque { get; set; } = true;

        [JsonPropertyName("usesTexture")]
        public bool UsesTexture { get; set; }

        [JsonPropertyName("uniforms")]
        public List<ShaderUniformDeclaration> Uniforms { get; set; } = new();

        [JsonPropertyName("presets")]
        public List<ShaderPresetDeclaration> Presets { get; set; } = new();

        [JsonPropertyName("glslSources")]
        public Dictionary<string, string> GlslSources { get; set; } = new();
    }
}
