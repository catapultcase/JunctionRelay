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
using System.Reflection;
using System.Text.RegularExpressions;
using JunctionRelayServer.Collectors;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services.CollectorPlugins
{
    public class Service_PluginManager : IDisposable, IAsyncDisposable
    {
        // Plugin collector names MUST have a dot-separated namespace (e.g. 'junctionrelay.system-time')
        private static readonly Regex PluginCollectorNamePattern = new(@"^[a-z][a-z0-9]*(-[a-z0-9]+)*\.[a-z][a-z0-9]*(-[a-z0-9]+)*$", RegexOptions.Compiled);

        private readonly string? _bundledDir;
        private readonly string _userDir;
        private readonly Model_PluginConfig _config;
        private readonly string? _rpcHostPath;
        private readonly ConcurrentDictionary<string, PluginCollectorMetadata> _metadataCache = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, DiscoveredPlugin> _discoveredPlugins = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<int, (Service_PluginProcess Process, DataCollector_Plugin Collector)> _runningInstances = new();
        private bool _disposed;
        private bool _nodeAvailable;

        public string UserDirectory => _userDir;

        public Service_PluginManager(string? bundledDir, string userDir, Model_PluginConfig config)
        {
            _bundledDir = bundledDir;
            _userDir = userDir;
            _config = config;

            // Extract rpc-host-collectors.mjs from embedded resources — Server owns this launcher
            _rpcHostPath = ExtractEmbeddedRpcHost("rpc-host-collectors.mjs");
        }

        private static string ExtractEmbeddedRpcHost(string fileName)
        {
            var assembly = Assembly.GetExecutingAssembly();

            // .NET SDK (net5+) preserves hyphens in manifest resource names — search by exact filename
            var resourceName = assembly.GetManifestResourceNames()
                .FirstOrDefault(n => n.EndsWith(fileName))
                ?? throw new FileNotFoundException(
                    $"Embedded resource matching '{fileName}' not found. Ensure '{fileName}' is included as EmbeddedResource in the project.");

            var outputDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "JunctionRelay", "rpc-hosts");
            Directory.CreateDirectory(outputDir);

            var outputPath = Path.Combine(outputDir, fileName);
            using var stream = assembly.GetManifestResourceStream(resourceName)!;
            using var file = File.Create(outputPath);
            stream.CopyTo(file);

            return outputPath;
        }

        public async Task DiscoverAndCacheMetadataAsync(HashSet<string> nativeCollectorTypes)
        {
            if (!_config.Enabled)
            {
                Console.WriteLine("[PLUGINS] Plugin system disabled via configuration");
                return;
            }

            // Check for Node.js availability
            _nodeAvailable = await CheckNodeAvailableAsync();
            if (!_nodeAvailable)
            {
                Console.WriteLine("[PLUGINS] WARNING: Node.js not found on PATH. Plugin system disabled. " +
                    "Install Node.js to enable external collector plugins.");
                return;
            }

            var discovered = Service_PluginDiscovery.DiscoverPlugins(_bundledDir, _userDir);

            var bundledCount = discovered.Count(p => p.Source == "bundled");
            var userCount = discovered.Count(p => p.Source == "user");
            Console.WriteLine($"[PLUGINS] Discovered {discovered.Count} plugin(s) ({bundledCount} bundled, {userCount} user)");

            foreach (var plugin in discovered)
            {
                try
                {
                    // Manifest-first: metadata comes from package.json, no process spawn needed
                    if (plugin.Metadata == null)
                    {
                        Console.WriteLine($"[PLUGINS] SKIPPED {plugin.Name} — no metadata in package.json manifest");
                        continue;
                    }

                    var metadata = plugin.Metadata;

                    // Reject plugins with un-namespaced collectorName
                    if (!PluginCollectorNamePattern.IsMatch(metadata.CollectorName))
                    {
                        Console.WriteLine($"[PLUGINS]   -> SKIPPED {metadata.CollectorName} — collectorName must be namespaced dot-notation (e.g. 'junctionrelay.system-time')");
                        continue;
                    }

                    // Skip plugins that conflict with native collectors
                    if (nativeCollectorTypes.Contains(metadata.CollectorName))
                    {
                        Console.WriteLine($"[PLUGINS]   -> SKIPPED {metadata.CollectorName} — native collector exists");
                        continue;
                    }

                    _metadataCache[metadata.CollectorName] = metadata;
                    _discoveredPlugins[metadata.CollectorName] = plugin;

                    Console.WriteLine($"[PLUGINS]   -> {metadata.CollectorName} ({metadata.DisplayName}) [{metadata.Category}] [{plugin.Source}]");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[PLUGINS] Failed to load metadata for {plugin.Name}: {ex.Message}");
                }
            }

            Console.WriteLine($"[PLUGINS] Registered {_metadataCache.Count} plugin type(s)");
        }

        public List<Model_CollectorMetadata> GetAllMetadata()
        {
            return _metadataCache
                .Select(kvp =>
                {
                    _discoveredPlugins.TryGetValue(kvp.Key, out var plugin);
                    return MapToModel(kvp.Value, plugin);
                })
                .ToList();
        }

        public List<string> GetRegisteredTypes()
        {
            return _discoveredPlugins.Keys.ToList();
        }

        public bool HasPlugin(string collectorType)
        {
            return _discoveredPlugins.ContainsKey(collectorType);
        }

        public async Task<DataCollector_Plugin> GetOrCreateCollectorAsync(Model_Collector collector)
        {
            if (_runningInstances.TryGetValue(collector.Id, out var existing))
            {
                // Re-apply configuration (URL/token may have changed)
                await existing.Collector.ConfigurePluginAsync(collector);
                return existing.Collector;
            }

            if (!_discoveredPlugins.TryGetValue(collector.CollectorType, out var plugin))
            {
                throw new InvalidOperationException($"No plugin found for collector type '{collector.CollectorType}'");
            }

            if (!_metadataCache.TryGetValue(collector.CollectorType, out var metadata))
            {
                throw new InvalidOperationException($"No cached metadata for collector type '{collector.CollectorType}'");
            }

            // Create and start a new process for this collector instance
            var process = new Service_PluginProcess(
                plugin.Path,
                plugin.Entry,
                _rpcHostPath,
                _config.DefaultTimeoutMs,
                _config.MaxRestarts,
                _config.RestartDelayMs
            );

            await process.StartAsync();

            var modelMetadata = MapToModel(metadata, plugin);
            var adapter = new DataCollector_Plugin(process, modelMetadata);
            await adapter.ConfigurePluginAsync(collector);

            _runningInstances[collector.Id] = (process, adapter);
            Console.WriteLine($"[PLUGINS] Started plugin process for collector {collector.Id} ({collector.CollectorType})");

            return adapter;
        }

        private static Model_CollectorMetadata MapToModel(PluginCollectorMetadata pm, DiscoveredPlugin? plugin)
        {
            return new Model_CollectorMetadata
            {
                CollectorName = pm.CollectorName,
                DisplayName = pm.DisplayName,
                Description = pm.Description,
                Category = pm.Category,
                Emoji = pm.Emoji,
                Fields = new Model_CollectorFieldRequirements
                {
                    RequiresUrl = pm.Fields.RequiresUrl,
                    RequiresAccessToken = pm.Fields.RequiresAccessToken,
                    UrlLabel = pm.Fields.UrlLabel,
                    UrlPlaceholder = pm.Fields.UrlPlaceholder,
                    AccessTokenLabel = pm.Fields.AccessTokenLabel,
                    AccessTokenPlaceholder = pm.Fields.AccessTokenPlaceholder,
                    UrlValidationPattern = pm.Fields.UrlValidationPattern,
                    AccessTokenValidationPattern = pm.Fields.AccessTokenValidationPattern
                },
                Defaults = new Model_CollectorDefaults
                {
                    Name = pm.Defaults.Name,
                    Url = pm.Defaults.Url,
                    PollRate = pm.Defaults.PollRate,
                    SendRate = pm.Defaults.SendRate
                },
                SetupInstructions = pm.SetupInstructions.Select(s => new Model_SetupStep
                {
                    Title = s.Title,
                    Body = s.Body
                }).ToList(),
                SetupNote = pm.SetupNote,
                SupportsPersistentSession = pm.SupportsPersistentSession,
                RequiresService = pm.RequiresService,
                RequiredServiceType = pm.RequiredServiceType,
                Source = plugin?.Source ?? "user",
                Version = plugin?.Version,
                PackageName = plugin?.Name,
                AuthorName = pm.AuthorName,
                AuthorUrl = pm.AuthorUrl
            };
        }

        private static async Task<bool> CheckNodeAvailableAsync()
        {
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "node",
                    Arguments = "--version",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using var process = System.Diagnostics.Process.Start(psi);
                if (process == null) return false;

                var output = await process.StandardOutput.ReadToEndAsync();
                await process.WaitForExitAsync();

                if (process.ExitCode == 0)
                {
                    Console.WriteLine($"[PLUGINS] Node.js detected: {output.Trim()}");
                    return true;
                }

                return false;
            }
            catch
            {
                return false;
            }
        }

        // Graceful: each plugin is asked to exit and given time to (the host and the shutdown sequence use this).
        public async ValueTask DisposeAsync()
        {
            if (_disposed) return;
            _disposed = true;

            Console.WriteLine($"[PLUGINS] Stopping {_runningInstances.Count} running plugin process(es)...");
            await Task.WhenAll(_runningInstances.Select(async kvp =>
            {
                try
                {
                    await kvp.Value.Process.DisposeAsync();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[PLUGINS] Error stopping plugin process for collector {kvp.Key}: {ex.Message}");
                }
            }));

            _runningInstances.Clear();
            Console.WriteLine("[PLUGINS] All plugin processes stopped");
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;

            Console.WriteLine($"[PLUGINS] Stopping {_runningInstances.Count} running plugin process(es)...");

            foreach (var kvp in _runningInstances)
            {
                try
                {
                    kvp.Value.Process.Dispose();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[PLUGINS] Error stopping plugin process for collector {kvp.Key}: {ex.Message}");
                }
            }

            _runningInstances.Clear();
            Console.WriteLine("[PLUGINS] All plugin processes stopped");
        }
    }
}
