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

namespace JunctionRelayServer.Services.CollectorPlugins
{
    public static class Service_PluginDiscovery
    {
        /// <summary>
        /// Discover plugins from bundled and user directories.
        /// Bundled plugins take priority — if the same name exists in both, the user copy is skipped.
        /// </summary>
        public static List<DiscoveredPlugin> DiscoverPlugins(string? bundledDir, string userDir)
        {
            // Extract any .zip files in the user directory before scanning
            ElementPlugins.Service_PluginZipInstaller.ExtractPendingZips(userDir);

            var plugins = new List<DiscoveredPlugin>();
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
                    Console.WriteLine($"[PLUGINS] Skipping user plugin '{plugin.Name}' — bundled version takes priority");
                    continue;
                }
                plugin.Source = "user";
                plugins.Add(plugin);
                seenNames.Add(plugin.Name);
            }

            return plugins;
        }

        private static List<DiscoveredPlugin> ScanDirectory(string pluginsDir)
        {
            var resolved = Path.GetFullPath(pluginsDir);
            var plugins = new List<DiscoveredPlugin>();

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
            var scopedDir = Path.Combine(resolved, "node_modules", "@junctionrelay");
            if (Directory.Exists(scopedDir))
            {
                foreach (var dir in SafeGetDirectories(scopedDir))
                {
                    if (Path.GetFileName(dir).StartsWith("plugin-", StringComparison.OrdinalIgnoreCase))
                    {
                        var plugin = TryLoadPlugin(dir);
                        if (plugin != null) plugins.Add(plugin);
                    }
                }
            }

            // 3. node_modules/junctionrelay-plugin-*
            var nodeModulesDir = Path.Combine(resolved, "node_modules");
            if (Directory.Exists(nodeModulesDir))
            {
                foreach (var dir in SafeGetDirectories(nodeModulesDir))
                {
                    if (Path.GetFileName(dir).StartsWith("junctionrelay-plugin-", StringComparison.OrdinalIgnoreCase))
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

        private static DiscoveredPlugin? TryLoadPlugin(string dirPath)
        {
            var pkgPath = Path.Combine(dirPath, "package.json");
            if (!File.Exists(pkgPath)) return null;

            try
            {
                var raw = File.ReadAllText(pkgPath);
                using var doc = JsonDocument.Parse(raw);
                var root = doc.RootElement;

                // Check for "junctionrelay": { "type": "collector" }
                if (!root.TryGetProperty("junctionrelay", out var jrProp)) return null;
                if (!jrProp.TryGetProperty("type", out var typeProp)) return null;
                if (typeProp.GetString() != "collector") return null;

                // Extract entry
                string entry = "index.ts";
                if (jrProp.TryGetProperty("entry", out var entryProp) && entryProp.GetString() is string e)
                {
                    entry = e;
                }
                else if (root.TryGetProperty("main", out var mainProp) && mainProp.GetString() is string m)
                {
                    entry = m;
                }

                // Extract collectorName from manifest (preferred), fallback to package name
                string? collectorName = null;
                if (jrProp.TryGetProperty("collectorName", out var cnProp) && cnProp.GetString() is string cn && !string.IsNullOrWhiteSpace(cn))
                {
                    collectorName = cn;
                }

                // Extract name and version
                var name = collectorName
                    ?? (root.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? Path.GetFileName(dirPath) : Path.GetFileName(dirPath));
                var version = root.TryGetProperty("version", out var versionProp) ? versionProp.GetString() ?? "0.0.0" : "0.0.0";

                // Read full metadata from manifest (manifest-first discovery)
                var metadata = TryParseMetadata(jrProp, collectorName ?? name);

                return new DiscoveredPlugin
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
        /// Parse full collector metadata from the junctionrelay manifest section of package.json.
        /// Returns null if required fields (displayName, description) are missing.
        /// </summary>
        private static PluginCollectorMetadata? TryParseMetadata(JsonElement jr, string collectorName)
        {
            try
            {
                // Required fields — if missing, fall back to runtime metadata probing
                if (!jr.TryGetProperty("displayName", out var displayNameProp) || displayNameProp.GetString() is not string displayName)
                    return null;
                if (!jr.TryGetProperty("description", out var descProp) || descProp.GetString() is not string description)
                    return null;

                var category = jr.TryGetProperty("category", out var catProp) ? catProp.GetString() ?? "" : "";
                var emoji = jr.TryGetProperty("emoji", out var emojiProp) ? emojiProp.GetString() ?? "" : "";

                // Parse fields
                var fields = new PluginFieldRequirements();
                if (jr.TryGetProperty("fields", out var fieldsProp))
                {
                    if (fieldsProp.TryGetProperty("requiresUrl", out var ruProp)) fields.RequiresUrl = ruProp.GetBoolean();
                    if (fieldsProp.TryGetProperty("requiresAccessToken", out var ratProp)) fields.RequiresAccessToken = ratProp.GetBoolean();
                    if (fieldsProp.TryGetProperty("urlLabel", out var ulProp)) fields.UrlLabel = ulProp.GetString();
                    if (fieldsProp.TryGetProperty("urlPlaceholder", out var upProp)) fields.UrlPlaceholder = upProp.GetString();
                    if (fieldsProp.TryGetProperty("accessTokenLabel", out var atlProp)) fields.AccessTokenLabel = atlProp.GetString();
                    if (fieldsProp.TryGetProperty("accessTokenPlaceholder", out var atpProp)) fields.AccessTokenPlaceholder = atpProp.GetString();
                    if (fieldsProp.TryGetProperty("urlValidationPattern", out var uvpProp)) fields.UrlValidationPattern = uvpProp.ValueKind == JsonValueKind.Null ? null : uvpProp.GetString();
                    if (fieldsProp.TryGetProperty("accessTokenValidationPattern", out var avpProp)) fields.AccessTokenValidationPattern = avpProp.ValueKind == JsonValueKind.Null ? null : avpProp.GetString();
                }

                // Parse defaults
                var defaults = new PluginDefaults();
                if (jr.TryGetProperty("defaults", out var defaultsProp))
                {
                    if (defaultsProp.TryGetProperty("name", out var dnProp)) defaults.Name = dnProp.GetString();
                    if (defaultsProp.TryGetProperty("url", out var duProp)) defaults.Url = duProp.GetString();
                    if (defaultsProp.TryGetProperty("pollRate", out var prProp)) defaults.PollRate = prProp.GetInt32();
                    if (defaultsProp.TryGetProperty("sendRate", out var srProp)) defaults.SendRate = srProp.GetInt32();
                }

                // Parse setupInstructions
                var setupInstructions = new List<PluginSetupStep>();
                if (jr.TryGetProperty("setupInstructions", out var siProp) && siProp.ValueKind == JsonValueKind.Array)
                {
                    foreach (var step in siProp.EnumerateArray())
                    {
                        var title = step.TryGetProperty("title", out var tProp) ? tProp.GetString() ?? "" : "";
                        var body = step.TryGetProperty("body", out var bProp) ? bProp.GetString() ?? "" : "";
                        setupInstructions.Add(new PluginSetupStep { Title = title, Body = body });
                    }
                }

                // Parse optional fields
                string? setupNote = null;
                if (jr.TryGetProperty("setupNote", out var snProp))
                    setupNote = snProp.ValueKind == JsonValueKind.Null ? null : snProp.GetString();

                bool supportsPersistentSession = false;
                if (jr.TryGetProperty("supportsPersistentSession", out var spsProp))
                    supportsPersistentSession = spsProp.GetBoolean();

                bool requiresService = false;
                if (jr.TryGetProperty("requiresService", out var rsProp))
                    requiresService = rsProp.GetBoolean();

                string? requiredServiceType = null;
                if (jr.TryGetProperty("requiredServiceType", out var rstProp))
                    requiredServiceType = rstProp.ValueKind == JsonValueKind.Null ? null : rstProp.GetString();

                // authorName / authorUrl (optional)
                string? authorName = null;
                if (jr.TryGetProperty("authorName", out var anProp) && anProp.GetString() is string an && !string.IsNullOrWhiteSpace(an))
                    authorName = an;

                string? authorUrl = null;
                if (jr.TryGetProperty("authorUrl", out var auProp) && auProp.GetString() is string au && !string.IsNullOrWhiteSpace(au))
                    authorUrl = au;

                return new PluginCollectorMetadata
                {
                    CollectorName = collectorName,
                    DisplayName = displayName,
                    Description = description,
                    Category = category,
                    Emoji = emoji,
                    Fields = fields,
                    Defaults = defaults,
                    SetupInstructions = setupInstructions,
                    SetupNote = setupNote,
                    SupportsPersistentSession = supportsPersistentSession,
                    RequiresService = requiresService,
                    RequiredServiceType = requiredServiceType,
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
