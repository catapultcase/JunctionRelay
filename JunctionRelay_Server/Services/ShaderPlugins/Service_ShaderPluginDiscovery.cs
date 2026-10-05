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
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services.ShaderPlugins
{
    /// <summary>
    /// Static discovery service that scans a directory for shader plugins.
    /// Each shader is a subdirectory containing package.json (with junctionrelay.type === "shader")
    /// and a GLSL entry file. No zip extraction — shaders have no build step.
    /// </summary>
    public static class Service_ShaderPluginDiscovery
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true
        };

        /// <summary>
        /// Shader ID must be namespace.name dot-notation (e.g. "junctionrelay.rainwindow").
        /// </summary>
        private static readonly System.Text.RegularExpressions.Regex ShaderIdPattern =
            new(@"^[a-z][a-z0-9]*([_-][a-z0-9]+)*\.[a-z][a-z0-9]*([_-][a-z0-9]+)*$",
                System.Text.RegularExpressions.RegexOptions.Compiled);

        /// <summary>
        /// Scan a directory for shader plugin subdirectories.
        /// </summary>
        public static ShaderDiscoveryResult DiscoverShaders(string shadersDir)
        {
            var result = new ShaderDiscoveryResult();

            if (!Directory.Exists(shadersDir))
                return result;

            foreach (var dir in Directory.GetDirectories(shadersDir))
            {
                try
                {
                    var shader = TryLoadShader(dir);
                    if (shader != null)
                    {
                        result.Shaders.Add(shader);
                    }
                }
                catch (Exception ex)
                {
                    result.Skipped.Add(new ShaderSkippedEntry
                    {
                        Path = dir,
                        Reason = ex.Message
                    });
                }
            }

            return result;
        }

        /// <summary>
        /// Try to load a shader from a directory. Returns null if not a valid shader plugin.
        /// </summary>
        private static DiscoveredShaderPlugin? TryLoadShader(string shaderPath)
        {
            var pkgPath = Path.Combine(shaderPath, "package.json");

            if (!File.Exists(pkgPath))
                return null;

            var json = File.ReadAllText(pkgPath);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            // Must have junctionrelay.type === "shader"
            if (!root.TryGetProperty("junctionrelay", out var jr))
                return null;

            if (!jr.TryGetProperty("type", out var typeEl) || typeEl.GetString() != "shader")
                return null;

            // Extract shader metadata
            var name = root.TryGetProperty("name", out var nameEl) ? nameEl.GetString() ?? "" : "";
            var version = root.TryGetProperty("version", out var versionEl) ? versionEl.GetString() ?? "0.0.0" : "0.0.0";

            var shaderName = jr.TryGetProperty("shaderName", out var snEl) ? snEl.GetString() ?? name : name;

            if (!ShaderIdPattern.IsMatch(shaderName))
            {
                Console.WriteLine($"[SHADER PLUGINS] Skipping shader '{shaderName}' — shaderName must be namespace.name (e.g. junctionrelay.rainwindow)");
                return null;
            }

            var displayName = jr.TryGetProperty("displayName", out var dnEl) ? dnEl.GetString() ?? shaderName : shaderName;
            var description = jr.TryGetProperty("description", out var descEl) ? descEl.GetString() ?? "" : "";
            var emoji = jr.TryGetProperty("emoji", out var emojiEl) ? emojiEl.GetString() : null;
            var usesTexture = jr.TryGetProperty("usesTexture", out var utEl) && utEl.ValueKind == JsonValueKind.True;
            var feedback = jr.TryGetProperty("feedback", out var fbEl) && fbEl.ValueKind == JsonValueKind.True;
            var opaque = !jr.TryGetProperty("opaque", out var opEl) || opEl.ValueKind != JsonValueKind.False; // default true

            // Parse passes array (required)
            if (!jr.TryGetProperty("passes", out var passesEl) || passesEl.ValueKind != JsonValueKind.Array || passesEl.GetArrayLength() == 0)
            {
                Console.WriteLine($"[SHADER PLUGINS] Shader at {shaderPath} missing passes array");
                return null;
            }

            var passes = new List<ShaderPassDeclaration>();
            var glslSources = new Dictionary<string, string>();

            foreach (var passEl in passesEl.EnumerateArray())
            {
                var passEntry = passEl.TryGetProperty("entry", out var peEl) ? peEl.GetString() : null;
                if (string.IsNullOrEmpty(passEntry))
                {
                    Console.WriteLine($"[SHADER PLUGINS] Invalid pass entry in {shaderPath}");
                    return null;
                }

                var passPath = Path.Combine(shaderPath, passEntry);
                if (!File.Exists(passPath))
                {
                    Console.WriteLine($"[SHADER PLUGINS] Pass entry not found: {passPath}");
                    return null;
                }

                try
                {
                    glslSources[passEntry] = File.ReadAllText(passPath);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SHADER PLUGINS] Could not read pass source: {passPath} — {ex.Message}");
                    return null;
                }

                passes.Add(new ShaderPassDeclaration
                {
                    Entry = passEntry,
                    DisplayName = passEl.TryGetProperty("displayName", out var pdnEl) ? pdnEl.GetString() : null
                });
            }

            // Parse presets array
            var presets = new List<ShaderPresetDeclaration>();
            if (jr.TryGetProperty("presets", out var presetsEl) && presetsEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var p in presetsEl.EnumerateArray())
                {
                    var preset = new ShaderPresetDeclaration
                    {
                        Name = p.TryGetProperty("name", out var pn) ? pn.GetString() ?? "" : "",
                        IsDefault = p.TryGetProperty("default", out var pd) && pd.ValueKind == JsonValueKind.True
                    };

                    if (p.TryGetProperty("values", out var pv) && pv.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var prop in pv.EnumerateObject())
                        {
                            preset.Values[prop.Name] = prop.Value.Clone();
                        }
                    }

                    presets.Add(preset);
                }
            }

            // Parse uniforms array
            var uniforms = new List<ShaderUniformDeclaration>();
            if (jr.TryGetProperty("uniforms", out var uniformsEl) && uniformsEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var u in uniformsEl.EnumerateArray())
                {
                    uniforms.Add(new ShaderUniformDeclaration
                    {
                        Name = u.TryGetProperty("name", out var un) ? un.GetString() ?? "" : "",
                        DisplayName = u.TryGetProperty("displayName", out var udn) ? udn.GetString() ?? "" : "",
                        Type = u.TryGetProperty("type", out var ut) ? ut.GetString() ?? "" : "",
                        Default = u.TryGetProperty("default", out var ud) ? ud.Clone() : null,
                        Min = u.TryGetProperty("min", out var umin) && umin.ValueKind == JsonValueKind.Number ? umin.GetDouble() : null,
                        Max = u.TryGetProperty("max", out var umax) && umax.ValueKind == JsonValueKind.Number ? umax.GetDouble() : null,
                        Pass = u.TryGetProperty("pass", out var upass) && upass.ValueKind == JsonValueKind.Number ? upass.GetInt32() : null,
                        Description = u.TryGetProperty("description", out var udesc) ? udesc.GetString() : null
                    });
                }
            }

            var authorName = jr.TryGetProperty("authorName", out var anEl) ? anEl.GetString() : null;
            var authorUrl = jr.TryGetProperty("authorUrl", out var auEl) ? auEl.GetString() : null;

            return new DiscoveredShaderPlugin
            {
                ShaderName = shaderName,
                DisplayName = displayName,
                Description = description,
                Emoji = emoji,
                Version = version,
                PackageName = name,
                AuthorName = authorName,
                AuthorUrl = authorUrl,
                Path = shaderPath,
                Passes = passes,
                Feedback = feedback,
                Opaque = opaque,
                UsesTexture = usesTexture,
                Uniforms = uniforms,
                Presets = presets,
                GlslSources = glslSources
            };
        }
    }
}
