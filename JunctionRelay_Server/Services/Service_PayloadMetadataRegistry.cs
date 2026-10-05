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
using JunctionRelayServer.Services.PayloadPlugins;

namespace JunctionRelayServer.Services
{
    public class Service_PayloadMetadataRegistry
    {
        private readonly Service_PayloadPluginManager _pluginManager;
        private List<Model_PayloadPluginMetadata> _allMetadata = new();
        private Dictionary<string, Model_PayloadPluginMetadata> _byName = new(StringComparer.OrdinalIgnoreCase);

        public Service_PayloadMetadataRegistry(Service_PayloadPluginManager pluginManager)
        {
            _pluginManager = pluginManager;
            Rebuild();
        }

        public void Rebuild()
        {
            var pluginMetadata = _pluginManager.GetAllMetadata();

            _byName = pluginMetadata.ToDictionary(
                m => m.ProtocolName,
                m => m,
                StringComparer.OrdinalIgnoreCase
            );

            _allMetadata = _byName.Values
                .OrderBy(m => m.Category)
                .ThenBy(m => m.DisplayName)
                .ToList();
        }

        public List<Model_PayloadPluginMetadata> GetAll()
        {
            return _allMetadata;
        }

        public Model_PayloadPluginMetadata? GetByName(string name)
        {
            return _byName.TryGetValue(name, out var metadata) ? metadata : null;
        }
    }
}
