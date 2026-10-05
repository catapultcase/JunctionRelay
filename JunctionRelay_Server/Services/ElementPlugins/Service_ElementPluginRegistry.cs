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

namespace JunctionRelayServer.Services.ElementPlugins
{
    /// <summary>
    /// In-memory registry of discovered element plugins.
    /// Built on startup from discovery results. Registered as singleton in DI.
    ///
    /// Unlike collector plugins, element plugins have no processes to manage.
    /// The Server only reads manifests and serves static bundle files.
    /// The frontend handles dynamic import and rendering.
    /// </summary>
    public class Service_ElementPluginRegistry
    {
        private readonly Dictionary<string, ElementPluginDefinition> _byElementName;
        private readonly List<ElementPluginDefinition> _allDefinitions;
        private readonly string _elementsDirectory;
        private readonly bool _enabled;

        public string ElementsDirectory => _elementsDirectory;

        public Service_ElementPluginRegistry(string elementsDirectory, bool enabled)
        {
            _elementsDirectory = elementsDirectory;
            _enabled = enabled;
            _byElementName = new Dictionary<string, ElementPluginDefinition>(StringComparer.OrdinalIgnoreCase);
            _allDefinitions = new List<ElementPluginDefinition>();
        }

        /// <summary>
        /// Load built-in element definitions from the shared native-elements.json file.
        /// This JSON is the single source of truth, maintained in the FrameEngine repo
        /// and linked into the Server build output via .csproj content link.
        /// </summary>
        private static List<ElementPluginDefinition> LoadBuiltInElements()
        {
            var jsonPath = Path.Combine(AppContext.BaseDirectory, "Data", "native-elements.json");

            if (!File.Exists(jsonPath))
            {
                Console.WriteLine($"[ELEMENT PLUGINS] WARNING: native-elements.json not found at {jsonPath}");
                return new List<ElementPluginDefinition>();
            }

            var json = File.ReadAllText(jsonPath);
            var entries = JsonSerializer.Deserialize<List<NativeElementEntry>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? new List<NativeElementEntry>();

            return entries.Select(e => new ElementPluginDefinition
            {
                ElementName = e.ElementName,
                DisplayName = e.DisplayName,
                Description = e.Description,
                Category = e.Category,
                Icon = e.Icon,
                Emoji = e.Emoji,
                SensorTagCompatible = e.SensorTagCompatible,
                DefaultSize = e.DefaultSize ?? new ElementDefaultSize(),
                DefaultProperties = e.DefaultProperties ?? new(),
                LayoutModes = e.LayoutModes ?? new() { "composite" },
                Source = "native",
                AuthorName = e.AuthorName,
                AuthorUrl = e.AuthorUrl,
                AuthorId = e.AuthorId,
                AuthorAvatarUrl = e.AuthorAvatarUrl
            }).ToList();
        }

        /// <summary>
        /// Deserialization target for native-elements.json entries.
        /// Contains only intrinsic element properties — source, packageName, version,
        /// and bundlePath are host-assigned at runtime.
        /// </summary>
        private class NativeElementEntry
        {
            public string ElementName { get; set; } = "";
            public string DisplayName { get; set; } = "";
            public string Description { get; set; } = "";
            public string Category { get; set; } = "";
            public string Icon { get; set; } = "";
            public string Emoji { get; set; } = "";
            public bool SensorTagCompatible { get; set; }
            public ElementDefaultSize? DefaultSize { get; set; }
            public Dictionary<string, object?>? DefaultProperties { get; set; }
            public List<string>? LayoutModes { get; set; }
            public string? AuthorName { get; set; }
            public string? AuthorUrl { get; set; }
            public string? AuthorId { get; set; }
            public string? AuthorAvatarUrl { get; set; }
        }

        /// <summary>
        /// Run discovery and populate the registry. Called once at startup.
        /// Registers built-in (native) elements first, then discovers plugins.
        /// Same pattern as Service_CollectorMetadataRegistry merging native + plugin.
        /// </summary>
        public void DiscoverAndRegister()
        {
            // Clear previous registrations so this method is safe to call again (hot-reload)
            _byElementName.Clear();
            _allDefinitions.Clear();

            // ===== BUILT-IN ELEMENTS (loaded from native-elements.json) =====
            var builtInElements = LoadBuiltInElements();

            foreach (var builtin in builtInElements)
            {
                _byElementName[builtin.ElementName] = builtin;
                Console.WriteLine($"[ELEMENT PLUGINS] Built-in: {builtin.DisplayName} ({builtin.ElementName})");
            }

            Console.WriteLine($"[ELEMENT PLUGINS] Registered {builtInElements.Count} built-in element(s)");

            // ===== PLUGIN ELEMENTS (discovered from filesystem) =====
            if (!_enabled)
            {
                Console.WriteLine("[ELEMENT PLUGINS] Plugin discovery is disabled");
                BuildSortedList();
                return;
            }

            if (!Directory.Exists(_elementsDirectory))
            {
                Console.WriteLine($"[ELEMENT PLUGINS] Elements directory not found: {_elementsDirectory}");
                BuildSortedList();
                return;
            }

            Console.WriteLine($"[ELEMENT PLUGINS] Scanning: {_elementsDirectory}");

            var result = Service_ElementPluginDiscovery.DiscoverPlugins(_elementsDirectory);

            foreach (var plugin in result.Plugins)
            {
                // Skip plugins that conflict with built-in element names (same as collector pattern)
                if (_byElementName.ContainsKey(plugin.Manifest.ElementName))
                {
                    Console.WriteLine($"[ELEMENT PLUGINS] SKIPPED {plugin.Manifest.ElementName} — built-in element exists");
                    continue;
                }

                // Build the bundle path relative to the elements directory root.
                // The static file middleware serves /elements/{relativePath}.
                var relativePath = Path.GetRelativePath(_elementsDirectory, Path.Combine(plugin.Path, plugin.Manifest.Entry))
                    .Replace('\\', '/');

                var definition = new ElementPluginDefinition
                {
                    ElementName = plugin.Manifest.ElementName,
                    DisplayName = plugin.Manifest.DisplayName,
                    Description = plugin.Manifest.Description,
                    Category = plugin.Manifest.Category,
                    Icon = plugin.Manifest.Icon,
                    Emoji = plugin.Manifest.Emoji,
                    SensorTagCompatible = plugin.Manifest.SensorTagCompatible,
                    DefaultSize = plugin.Manifest.DefaultSize,
                    DefaultProperties = plugin.Manifest.DefaultProperties,
                    LayoutModes = plugin.Manifest.LayoutModes ?? new List<string> { "composite" },
                    PackageName = plugin.Name,
                    Version = plugin.Version,
                    Source = "user",
                    BundlePath = $"/elements/{relativePath}",
                    AuthorName = plugin.Manifest.AuthorName,
                    AuthorUrl = plugin.Manifest.AuthorUrl,
                    AuthorId = plugin.Manifest.AuthorId,
                    AuthorAvatarUrl = plugin.Manifest.AuthorAvatarUrl
                };

                _byElementName[definition.ElementName] = definition;

                Console.WriteLine($"[ELEMENT PLUGINS] Registered: {definition.DisplayName} ({definition.ElementName}) v{definition.Version} emoji={(!string.IsNullOrEmpty(definition.Emoji) ? definition.Emoji : "(none)")}");

            }

            // Log skipped plugins
            foreach (var entry in result.Skipped)
            {
                Console.WriteLine($"[ELEMENT PLUGINS] Skipped: {Path.GetFileName(entry.Path)} — {entry.Reason}");
            }

            var pluginCount = _byElementName.Count - builtInElements.Count;
            Console.WriteLine($"[ELEMENT PLUGINS] Found {pluginCount} plugin element(s), skipped {result.Skipped.Count}");

            BuildSortedList();
        }

        /// <summary>
        /// Build the sorted list from the dictionary. Called after all registration is complete.
        /// </summary>
        private void BuildSortedList()
        {
            _allDefinitions.Clear();
            _allDefinitions.AddRange(
                _byElementName.Values
                    .OrderBy(d => d.Category)
                    .ThenBy(d => d.DisplayName)
            );
            Console.WriteLine($"[ELEMENT PLUGINS] Total: {_allDefinitions.Count} element type(s)");
        }

        /// <summary>
        /// Get all registered element plugin definitions, sorted by category then display name.
        /// </summary>
        public List<ElementPluginDefinition> GetAll()
        {
            return _allDefinitions.ToList();
        }

        /// <summary>
        /// Get a specific element plugin definition by its element name identifier.
        /// </summary>
        public ElementPluginDefinition? GetByName(string elementName)
        {
            return _byElementName.TryGetValue(elementName, out var definition) ? definition : null;
        }

        /// <summary>
        /// Check if an element name has a registered plugin.
        /// </summary>
        public bool Has(string elementName)
        {
            return _byElementName.ContainsKey(elementName);
        }

        /// <summary>
        /// Get all registered element name identifiers.
        /// </summary>
        public List<string> GetElementNames()
        {
            return _byElementName.Keys.ToList();
        }

        /// <summary>
        /// Number of registered element plugins.
        /// </summary>
        public int Count => _allDefinitions.Count;

    }
}
