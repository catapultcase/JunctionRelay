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
using System.Text.RegularExpressions;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services.ElementPlugins
{
    /// <summary>
    /// Scans the elements directory for valid element plugin manifests.
    /// Same three-location pattern as collector plugin discovery:
    ///   1. Direct subdirectories of elementsDir
    ///   2. node_modules/@junctionrelay/element-*
    ///   3. node_modules/junctionrelay-element-*
    ///
    /// Unlike collector plugins, the Server never executes element plugin code.
    /// It only reads package.json manifests and serves static bundle files.
    /// </summary>
    public static class Service_ElementPluginDiscovery
    {
        // Matches either native un-namespaced names (e.g. "sensor") or namespaced plugin names (e.g. "junctionrelay.hello-sensor")
        private static readonly Regex ElementNamePattern = new(@"^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)?$", RegexOptions.Compiled);
        // Plugin element names MUST have a dot-separated namespace
        private static readonly Regex PluginElementNamePattern = new(@"^[a-z][a-z0-9]*(-[a-z0-9]+)*\.[a-z][a-z0-9]*(-[a-z0-9]+)*$", RegexOptions.Compiled);

        private static readonly HashSet<string> ValidCategories = new(StringComparer.OrdinalIgnoreCase)
        {
            "Data", "Display", "Drawing", "Effects", "Media", "Visualization", "Utility"
        };

        public static ElementDiscoveryResult DiscoverPlugins(string elementsDir)
        {
            var resolved = Path.GetFullPath(elementsDir);

            // Extract any .zip files before scanning
            Service_PluginZipInstaller.ExtractPendingZips(resolved);

            var plugins = new List<DiscoveredElementPlugin>();
            var skipped = new List<ElementSkippedEntry>();
            var seenTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // 1. Direct subdirectories
            if (Directory.Exists(resolved))
            {
                foreach (var dir in SafeGetDirectories(resolved))
                {
                    TryLoadPlugin(dir, plugins, skipped, seenTypes);
                }
            }

            // 2. node_modules/@junctionrelay/element-*
            var scopedDir = Path.Combine(resolved, "node_modules", "@junctionrelay");
            if (Directory.Exists(scopedDir))
            {
                foreach (var dir in SafeGetDirectories(scopedDir))
                {
                    if (Path.GetFileName(dir).StartsWith("element-", StringComparison.OrdinalIgnoreCase))
                    {
                        TryLoadPlugin(dir, plugins, skipped, seenTypes);
                    }
                }
            }

            // 3. node_modules/junctionrelay-element-*
            var nodeModulesDir = Path.Combine(resolved, "node_modules");
            if (Directory.Exists(nodeModulesDir))
            {
                foreach (var dir in SafeGetDirectories(nodeModulesDir))
                {
                    if (Path.GetFileName(dir).StartsWith("junctionrelay-element-", StringComparison.OrdinalIgnoreCase))
                    {
                        TryLoadPlugin(dir, plugins, skipped, seenTypes);
                    }
                }
            }

            return new ElementDiscoveryResult
            {
                Plugins = plugins,
                Skipped = skipped
            };
        }

        private static void TryLoadPlugin(
            string dirPath,
            List<DiscoveredElementPlugin> plugins,
            List<ElementSkippedEntry> skipped,
            HashSet<string> seenTypes)
        {
            var pkgPath = Path.Combine(dirPath, "package.json");
            if (!File.Exists(pkgPath))
            {
                return; // Not a plugin directory, silently skip
            }

            string dirName = Path.GetFileName(dirPath);

            try
            {
                var raw = File.ReadAllText(pkgPath);
                using var doc = JsonDocument.Parse(raw);
                var root = doc.RootElement;

                // Check for "junctionrelay" field
                if (!root.TryGetProperty("junctionrelay", out var jrProp))
                {
                    skipped.Add(new ElementSkippedEntry { Path = dirPath, Reason = "Missing junctionrelay field in package.json" });
                    return;
                }

                // Check type = "element"
                if (!jrProp.TryGetProperty("type", out var typeProp) || typeProp.GetString() != "element")
                {
                    return; // Not an element plugin (could be a collector plugin) — silently skip
                }

                // Extract package name and version
                var name = root.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? dirName : dirName;
                var version = root.TryGetProperty("version", out var versionProp) ? versionProp.GetString() ?? "0.0.0" : "0.0.0";

                // Validate manifest fields
                var manifest = ValidateManifest(jrProp, dirPath, name);
                if (manifest == null)
                {
                    return; // Validation errors already added to skipped list inline
                }

                // Check for duplicate elementName
                if (seenTypes.Contains(manifest.ElementName))
                {
                    skipped.Add(new ElementSkippedEntry
                    {
                        Path = dirPath,
                        Reason = $"Duplicate elementName '{manifest.ElementName}' — already registered by another plugin"
                    });
                    return;
                }

                // Verify entry point file exists
                var entryPath = Path.Combine(dirPath, manifest.Entry);
                if (!File.Exists(entryPath))
                {
                    skipped.Add(new ElementSkippedEntry
                    {
                        Path = dirPath,
                        Reason = $"Entry point not found: {manifest.Entry}"
                    });
                    return;
                }

                seenTypes.Add(manifest.ElementName);

                plugins.Add(new DiscoveredElementPlugin
                {
                    Name = name,
                    Version = version,
                    Path = dirPath,
                    Entry = manifest.Entry,
                    Manifest = manifest
                });
            }
            catch (JsonException ex)
            {
                skipped.Add(new ElementSkippedEntry { Path = dirPath, Reason = $"Invalid package.json: {ex.Message}" });
            }
            catch (Exception ex)
            {
                skipped.Add(new ElementSkippedEntry { Path = dirPath, Reason = $"Error reading plugin: {ex.Message}" });
            }
        }

        private static ElementPluginManifest? ValidateManifest(JsonElement jrProp, string dirPath, string name)
        {
            var errors = new List<string>();

            string GetString(JsonElement parent, string prop, bool required = true)
            {
                if (parent.TryGetProperty(prop, out var val) && val.GetString() is string s && !string.IsNullOrWhiteSpace(s))
                    return s;
                if (required)
                    errors.Add($"Missing or empty '{prop}'");
                return "";
            }

            var entry = GetString(jrProp, "entry");
            var elementName = GetString(jrProp, "elementName");
            var displayName = GetString(jrProp, "displayName");
            var description = GetString(jrProp, "description");
            var category = GetString(jrProp, "category");
            var icon = GetString(jrProp, "icon");
            var emoji = GetString(jrProp, "emoji", required: false);

            // Validate elementName format — plugins must use namespaced dot-notation
            if (!string.IsNullOrEmpty(elementName) && !PluginElementNamePattern.IsMatch(elementName))
            {
                errors.Add($"Invalid elementName '{elementName}' — must be namespaced dot-notation (e.g. 'junctionrelay.stock-ticker')");
            }

            // Validate category
            if (!string.IsNullOrEmpty(category) && !ValidCategories.Contains(category))
            {
                errors.Add($"Invalid category '{category}' — must be one of: {string.Join(", ", ValidCategories)}");
            }

            // sensorTagCompatible (default false)
            bool sensorTagCompatible = false;
            if (jrProp.TryGetProperty("sensorTagCompatible", out var sbProp) && sbProp.ValueKind == JsonValueKind.True)
            {
                sensorTagCompatible = true;
            }

            // defaultSize
            var defaultSize = new ElementDefaultSize { Width = 200, Height = 100 };
            if (jrProp.TryGetProperty("defaultSize", out var sizeProp) && sizeProp.ValueKind == JsonValueKind.Object)
            {
                if (sizeProp.TryGetProperty("width", out var w) && w.ValueKind == JsonValueKind.Number)
                    defaultSize.Width = w.GetInt32();
                if (sizeProp.TryGetProperty("height", out var h) && h.ValueKind == JsonValueKind.Number)
                    defaultSize.Height = h.GetInt32();
            }

            // defaultProperties
            var defaultProperties = new Dictionary<string, object?>();
            if (jrProp.TryGetProperty("defaultProperties", out var dpProp) && dpProp.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in dpProp.EnumerateObject())
                {
                    defaultProperties[prop.Name] = ConvertJsonElement(prop.Value);
                }
            }

            // layoutModes (optional, defaults to ["composite"])
            List<string>? layoutModes = null;
            if (jrProp.TryGetProperty("layoutModes", out var lmProp) && lmProp.ValueKind == JsonValueKind.Array)
            {
                layoutModes = new List<string>();
                foreach (var item in lmProp.EnumerateArray())
                {
                    if (item.GetString() is string mode)
                        layoutModes.Add(mode);
                }
            }

            // authorName / authorUrl (optional)
            var authorName = GetString(jrProp, "authorName", required: false);
            var authorUrl = GetString(jrProp, "authorUrl", required: false);

            if (errors.Count > 0)
            {
                Console.WriteLine($"[ELEMENT PLUGINS] Skipped {name} at {dirPath}: {string.Join("; ", errors)}");
                return null;
            }

            return new ElementPluginManifest
            {
                Type = "element",
                Entry = entry,
                ElementName = elementName,
                DisplayName = displayName,
                Description = description,
                Category = category,
                Icon = icon,
                Emoji = emoji,
                SensorTagCompatible = sensorTagCompatible,
                DefaultSize = defaultSize,
                DefaultProperties = defaultProperties,
                LayoutModes = layoutModes,
                AuthorName = string.IsNullOrEmpty(authorName) ? null : authorName,
                AuthorUrl = string.IsNullOrEmpty(authorUrl) ? null : authorUrl,
                AuthorId = null,
                AuthorAvatarUrl = null
            };
        }

        private static object? ConvertJsonElement(JsonElement element)
        {
            return element.ValueKind switch
            {
                JsonValueKind.String => element.GetString(),
                JsonValueKind.Number => element.TryGetInt64(out var l) ? l : element.GetDouble(),
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Null => null,
                _ => element.GetRawText()
            };
        }

        private static string[] SafeGetDirectories(string path)
        {
            try
            {
                return Directory.GetDirectories(path);
            }
            catch
            {
                return Array.Empty<string>();
            }
        }
    }

    // ========================================================================
    // Discovery Result Types
    // ========================================================================

    public class ElementDiscoveryResult
    {
        public List<DiscoveredElementPlugin> Plugins { get; set; } = new();
        public List<ElementSkippedEntry> Skipped { get; set; } = new();
    }

    public class ElementSkippedEntry
    {
        public string Path { get; set; } = "";
        public string Reason { get; set; } = "";
    }
}
