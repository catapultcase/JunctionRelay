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

using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services.ShaderPlugins
{
    /// <summary>
    /// In-memory registry of discovered shader plugins.
    /// Built on startup from discovery results. Registered as singleton in DI.
    /// Scans bundled shaders first (bundled wins on duplicate ID), then user shaders.
    /// </summary>
    public class Service_ShaderPluginRegistry
    {
        private readonly Dictionary<string, ShaderDefinition> _byShaderName;
        private readonly List<ShaderDefinition> _allDefinitions;
        private readonly string? _bundledShadersDir;
        private readonly string _userShadersDir;
        private readonly bool _enabled;

        public Service_ShaderPluginRegistry(string? bundledShadersDir, string userShadersDir, bool enabled)
        {
            _bundledShadersDir = bundledShadersDir;
            _userShadersDir = userShadersDir;
            _enabled = enabled;
            _byShaderName = new Dictionary<string, ShaderDefinition>(StringComparer.OrdinalIgnoreCase);
            _allDefinitions = new List<ShaderDefinition>();
        }

        /// <summary>
        /// Run discovery and populate the registry. Called once at startup.
        /// Bundled shaders are registered first; user shaders with duplicate IDs are skipped.
        /// </summary>
        public void DiscoverAndRegister()
        {
            _byShaderName.Clear();
            _allDefinitions.Clear();

            if (!_enabled)
            {
                Console.WriteLine("[SHADER PLUGINS] Shader discovery is disabled");
                return;
            }

            // ===== BUNDLED SHADERS (ship with install, read-only) =====
            if (!string.IsNullOrEmpty(_bundledShadersDir) && Directory.Exists(_bundledShadersDir))
            {
                Console.WriteLine($"[SHADER PLUGINS] Scanning bundled: {_bundledShadersDir}");
                var bundledResult = Service_ShaderPluginDiscovery.DiscoverShaders(_bundledShadersDir);

                foreach (var shader in bundledResult.Shaders)
                {
                    RegisterShader(shader, "bundled");
                }

                foreach (var entry in bundledResult.Skipped)
                {
                    Console.WriteLine($"[SHADER PLUGINS] Skipped bundled: {Path.GetFileName(entry.Path)} — {entry.Reason}");
                }
            }

            // ===== USER SHADERS (user-installed, writable) =====
            if (Directory.Exists(_userShadersDir))
            {
                Console.WriteLine($"[SHADER PLUGINS] Scanning user: {_userShadersDir}");
                var userResult = Service_ShaderPluginDiscovery.DiscoverShaders(_userShadersDir);

                foreach (var shader in userResult.Shaders)
                {
                    if (_byShaderName.ContainsKey(shader.ShaderName))
                    {
                        Console.WriteLine($"[SHADER PLUGINS] Skipping user shader '{shader.ShaderName}' — bundled version takes priority");
                        continue;
                    }
                    RegisterShader(shader, "user");
                }

                foreach (var entry in userResult.Skipped)
                {
                    Console.WriteLine($"[SHADER PLUGINS] Skipped user: {Path.GetFileName(entry.Path)} — {entry.Reason}");
                }
            }

            _allDefinitions.AddRange(
                _byShaderName.Values.OrderBy(d => d.DisplayName)
            );

            var bundledCount = _allDefinitions.Count(s => s.Source == "bundled");
            var userCount = _allDefinitions.Count(s => s.Source == "user");
            Console.WriteLine($"[SHADER PLUGINS] Discovered {_allDefinitions.Count} shader(s) ({bundledCount} bundled, {userCount} user)");
        }

        private void RegisterShader(DiscoveredShaderPlugin shader, string origin)
        {
            var definition = new ShaderDefinition
            {
                ShaderName = shader.ShaderName,
                DisplayName = shader.DisplayName,
                Description = shader.Description,
                Emoji = shader.Emoji,
                Version = shader.Version,
                Source = origin,
                PackageName = shader.PackageName,
                AuthorName = shader.AuthorName,
                AuthorUrl = shader.AuthorUrl,
                Passes = shader.Passes,
                Feedback = shader.Feedback,
                Opaque = shader.Opaque,
                UsesTexture = shader.UsesTexture,
                Uniforms = shader.Uniforms,
                Presets = shader.Presets,
                GlslSources = shader.GlslSources
            };

            _byShaderName[definition.ShaderName] = definition;
            Console.WriteLine($"[SHADER PLUGINS] Registered: {definition.DisplayName} ({definition.ShaderName}) v{definition.Version} [{origin}]");
        }

        /// <summary>
        /// Get all registered shader definitions.
        /// </summary>
        public List<ShaderDefinition> GetAll()
        {
            return _allDefinitions.ToList();
        }

        /// <summary>
        /// Get a specific shader definition by shaderName.
        /// </summary>
        public ShaderDefinition? GetByShaderName(string shaderName)
        {
            return _byShaderName.TryGetValue(shaderName, out var definition) ? definition : null;
        }
    }
}
