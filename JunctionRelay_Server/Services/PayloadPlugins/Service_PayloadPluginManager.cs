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

using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services.PayloadPlugins
{
    public class Service_PayloadPluginManager
    {
        // Payload plugin names MUST have a dot-separated namespace (e.g. 'junctionrelay.raw-json')
        private static readonly Regex PayloadNamePattern = new(@"^[a-z][a-z0-9]*(-[a-z0-9]+)*\.[a-z][a-z0-9]*(-[a-z0-9]+)*$", RegexOptions.Compiled);

        private readonly string? _bundledDir;
        private readonly string _userDir;
        private readonly bool _enabled;
        private readonly ConcurrentDictionary<string, PluginPayloadMetadata> _metadataCache = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, DiscoveredPayloadPlugin> _discoveredPlugins = new(StringComparer.OrdinalIgnoreCase);

        public string UserDirectory => _userDir;

        public Service_PayloadPluginManager(string? bundledDir, string userDir, bool enabled)
        {
            _bundledDir = bundledDir;
            _userDir = userDir;
            _enabled = enabled;
        }

        public Task DiscoverAndCacheMetadataAsync()
        {
            if (!_enabled)
            {
                Console.WriteLine("[PAYLOADS] Payload plugin system disabled via configuration");
                return Task.CompletedTask;
            }

            var discovered = Service_PayloadPluginDiscovery.DiscoverPlugins(_bundledDir, _userDir);

            var bundledCount = discovered.Count(p => p.Source == "bundled");
            var userCount = discovered.Count(p => p.Source == "user");
            Console.WriteLine($"[PAYLOADS] Discovered {discovered.Count} plugin(s) ({bundledCount} bundled, {userCount} user)");

            foreach (var plugin in discovered)
            {
                try
                {
                    if (plugin.Metadata == null)
                    {
                        Console.WriteLine($"[PAYLOADS] SKIPPED {plugin.Name} — no metadata in package.json manifest");
                        continue;
                    }

                    var metadata = plugin.Metadata;

                    // Reject plugins with un-namespaced payloadName
                    if (!PayloadNamePattern.IsMatch(metadata.PayloadName))
                    {
                        Console.WriteLine($"[PAYLOADS]   -> SKIPPED {metadata.PayloadName} — payloadName must be namespaced dot-notation (e.g. 'junctionrelay.raw-json')");
                        continue;
                    }

                    _metadataCache[metadata.PayloadName] = metadata;
                    _discoveredPlugins[metadata.PayloadName] = plugin;

                    Console.WriteLine($"[PAYLOADS]   -> {metadata.PayloadName} ({metadata.DisplayName}) [{metadata.Category}] [{plugin.Source}]");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[PAYLOADS] Failed to load metadata for {plugin.Name}: {ex.Message}");
                }
            }

            Console.WriteLine($"[PAYLOADS] Registered {_metadataCache.Count} payload type(s)");
            return Task.CompletedTask;
        }

        public List<Model_PayloadPluginMetadata> GetAllMetadata()
        {
            return _metadataCache
                .Select(kvp =>
                {
                    _discoveredPlugins.TryGetValue(kvp.Key, out var plugin);
                    return MapToModel(kvp.Value, plugin);
                })
                .ToList();
        }

        public bool HasPlugin(string payloadType)
        {
            return _discoveredPlugins.ContainsKey(payloadType);
        }

        private static Model_PayloadPluginMetadata MapToModel(PluginPayloadMetadata pm, DiscoveredPayloadPlugin? plugin)
        {
            return new Model_PayloadPluginMetadata
            {
                ProtocolName = pm.PayloadName,
                DisplayName = pm.DisplayName,
                Description = pm.Description,
                Category = pm.Category,
                Emoji = pm.Emoji,
                Configurable = pm.Configurable,
                Defaults = pm.Defaults,
                Profiles = pm.Profiles,
                OutputContentType = pm.OutputContentType,
                OutputDescription = pm.OutputDescription,
                Source = plugin?.Source ?? "user",
                Version = plugin?.Version,
                PackageName = plugin?.Name,
                AuthorName = pm.AuthorName,
                AuthorUrl = pm.AuthorUrl
            };
        }
    }
}
