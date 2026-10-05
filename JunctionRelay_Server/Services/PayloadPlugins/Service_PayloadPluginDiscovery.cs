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
using JunctionRelayServer.Services.ElementPlugins;

namespace JunctionRelayServer.Services.PayloadPlugins
{
    public class DiscoveredPayloadPlugin
    {
        public string Name { get; set; } = "";
        public string Version { get; set; } = "0.0.0";
        public string Path { get; set; } = "";
        public string Entry { get; set; } = "index.js";
        public string Source { get; set; } = "user";
        public PluginPayloadMetadata? Metadata { get; set; }
    }

    public class PluginPayloadMetadata
    {
        public string PayloadName { get; set; } = "";
        public string DisplayName { get; set; } = "";
        public string Description { get; set; } = "";
        public string Category { get; set; } = "";
        public string Emoji { get; set; } = "";
        public List<string> Configurable { get; set; } = new();
        public List<string> Profiles { get; set; } = new();
        public Dictionary<string, object?> Defaults { get; set; } = new();
        public string? OutputContentType { get; set; }
        public string? OutputDescription { get; set; }
        public string? AuthorName { get; set; }
        public string? AuthorUrl { get; set; }
    }

    public static class Service_PayloadPluginDiscovery
    {
        /// <summary>
        /// Discover payload plugins from bundled and user directories.
        /// Bundled plugins take priority — if the same name exists in both, the user copy is skipped.
        /// </summary>
        public static List<DiscoveredPayloadPlugin> DiscoverPlugins(string? bundledDir, string userDir)
        {
            // Extract any .zip files in the user directory before scanning
            Service_PluginZipInstaller.ExtractPendingZips(userDir);

            var plugins = new List<DiscoveredPayloadPlugin>();
            var seenNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // 1. Scan bundled directory first (read-only, ships with install)
            if (bundledDir != null)
            {
                foreach (var plugin in ScanDirectory(bundledDir))
                {
                    plugin.Source = "bundled";
                    plugins.Add(plugin);
                    seenNames.Add(plugin.Name);
                }
            }

            // 2. Scan user directory (mutable, user-installed)
            foreach (var plugin in ScanDirectory(userDir))
            {
                if (seenNames.Contains(plugin.Name))
                {
                    Console.WriteLine($"[PAYLOADS] Skipping user payload '{plugin.Name}' — bundled version takes priority");
                    continue;
                }
                plugin.Source = "user";
                plugins.Add(plugin);
                seenNames.Add(plugin.Name);
            }

            return plugins;
        }

        private static List<DiscoveredPayloadPlugin> ScanDirectory(string pluginsDir)
        {
            var resolved = System.IO.Path.GetFullPath(pluginsDir);
            var plugins = new List<DiscoveredPayloadPlugin>();

            // 1. Direct subdirectories
            if (Directory.Exists(resolved))
            {
                foreach (var dir in SafeGetDirectories(resolved))
                {
                    var plugin = TryLoadPlugin(dir);
                    if (plugin != null) plugins.Add(plugin);
                }
            }

            // 2. node_modules/@junctionrelay/plugin-*
            var scopedDir = System.IO.Path.Combine(resolved, "node_modules", "@junctionrelay");
            if (Directory.Exists(scopedDir))
            {
                foreach (var dir in SafeGetDirectories(scopedDir))
                {
                    if (System.IO.Path.GetFileName(dir).StartsWith("plugin-", StringComparison.OrdinalIgnoreCase))
                    {
                        var plugin = TryLoadPlugin(dir);
                        if (plugin != null) plugins.Add(plugin);
                    }
                }
            }

            // 3. node_modules/junctionrelay-plugin-*
            var nodeModulesDir = System.IO.Path.Combine(resolved, "node_modules");
            if (Directory.Exists(nodeModulesDir))
            {
                foreach (var dir in SafeGetDirectories(nodeModulesDir))
                {
                    if (System.IO.Path.GetFileName(dir).StartsWith("junctionrelay-plugin-", StringComparison.OrdinalIgnoreCase))
                    {
                        var plugin = TryLoadPlugin(dir);
                        if (plugin != null) plugins.Add(plugin);
                    }
                }
            }

            return plugins;
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

        private static DiscoveredPayloadPlugin? TryLoadPlugin(string dirPath)
        {
            var pkgPath = System.IO.Path.Combine(dirPath, "package.json");
            if (!File.Exists(pkgPath)) return null;

            try
            {
                var raw = File.ReadAllText(pkgPath);
                using var doc = JsonDocument.Parse(raw);
                var root = doc.RootElement;

                // Check for "junctionrelay": { "type": "payload" }
                if (!root.TryGetProperty("junctionrelay", out var jrProp)) return null;
                if (!jrProp.TryGetProperty("type", out var typeProp)) return null;
                if (typeProp.GetString() != "payload") return null;

                // Extract entry
                string entry = "index.js";
                if (jrProp.TryGetProperty("entry", out var entryProp) && entryProp.GetString() is string e)
                {
                    entry = e;
                }
                else if (root.TryGetProperty("main", out var mainProp) && mainProp.GetString() is string m)
                {
                    entry = m;
                }

                // Extract payloadName from manifest (preferred), fallback to package name
                string? payloadName = null;
                if (jrProp.TryGetProperty("payloadName", out var pnProp) && pnProp.GetString() is string pn && !string.IsNullOrWhiteSpace(pn))
                {
                    payloadName = pn;
                }

                // Extract name and version
                var name = payloadName
                    ?? (root.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? System.IO.Path.GetFileName(dirPath) : System.IO.Path.GetFileName(dirPath));
                var version = root.TryGetProperty("version", out var versionProp) ? versionProp.GetString() ?? "0.0.0" : "0.0.0";

                // Read full metadata from manifest
                var metadata = TryParseMetadata(jrProp, payloadName ?? name);

                return new DiscoveredPayloadPlugin
                {
                    Name = name,
                    Version = version,
                    Path = dirPath,
                    Entry = entry,
                    Metadata = metadata
                };
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Parse full payload metadata from the junctionrelay manifest section of package.json.
        /// Returns null if required fields (displayName, description) are missing.
        /// </summary>
        private static PluginPayloadMetadata? TryParseMetadata(JsonElement jr, string payloadName)
        {
            try
            {
                // Required fields
                if (!jr.TryGetProperty("displayName", out var displayNameProp) || displayNameProp.GetString() is not string displayName)
                    return null;
                if (!jr.TryGetProperty("description", out var descProp) || descProp.GetString() is not string description)
                    return null;

                var category = jr.TryGetProperty("category", out var catProp) ? catProp.GetString() ?? "" : "";
                var emoji = jr.TryGetProperty("emoji", out var emojiProp) ? emojiProp.GetString() ?? "" : "";

                // Parse fields.configurable (string[])
                var configurable = new List<string>();
                if (jr.TryGetProperty("fields", out var fieldsProp) &&
                    fieldsProp.TryGetProperty("configurable", out var confProp) &&
                    confProp.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in confProp.EnumerateArray())
                    {
                        if (item.GetString() is string s) configurable.Add(s);
                    }
                }

                // Parse profiles (string[])
                var profiles = new List<string>();
                if (jr.TryGetProperty("profiles", out var profilesProp) && profilesProp.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in profilesProp.EnumerateArray())
                    {
                        if (item.GetString() is string s) profiles.Add(s);
                    }
                }

                // Parse defaults (arbitrary key-value)
                var defaults = new Dictionary<string, object?>();
                if (jr.TryGetProperty("defaults", out var defaultsProp) && defaultsProp.ValueKind == JsonValueKind.Object)
                {
                    foreach (var kvp in defaultsProp.EnumerateObject())
                    {
                        defaults[kvp.Name] = kvp.Value.ValueKind switch
                        {
                            JsonValueKind.String => kvp.Value.GetString(),
                            JsonValueKind.True => true,
                            JsonValueKind.False => false,
                            JsonValueKind.Number => kvp.Value.TryGetInt64(out var l) ? l : kvp.Value.GetDouble(),
                            JsonValueKind.Null => null,
                            _ => kvp.Value.GetRawText()
                        };
                    }
                }

                // Parse optional fields
                string? outputContentType = null;
                if (jr.TryGetProperty("outputContentType", out var octProp) && octProp.GetString() is string oct)
                    outputContentType = oct;

                string? outputDescription = null;
                if (jr.TryGetProperty("outputDescription", out var odProp) && odProp.GetString() is string od)
                    outputDescription = od;

                string? authorName = null;
                if (jr.TryGetProperty("authorName", out var anProp) && anProp.GetString() is string an && !string.IsNullOrWhiteSpace(an))
                    authorName = an;

                string? authorUrl = null;
                if (jr.TryGetProperty("authorUrl", out var auProp) && auProp.GetString() is string au && !string.IsNullOrWhiteSpace(au))
                    authorUrl = au;

                return new PluginPayloadMetadata
                {
                    PayloadName = payloadName,
                    DisplayName = displayName,
                    Description = description,
                    Category = category,
                    Emoji = emoji,
                    Configurable = configurable,
                    Profiles = profiles,
                    Defaults = defaults,
                    OutputContentType = outputContentType,
                    OutputDescription = outputDescription,
                    AuthorName = authorName,
                    AuthorUrl = authorUrl
                };
            }
            catch
            {
                return null;
            }
        }
    }
}
