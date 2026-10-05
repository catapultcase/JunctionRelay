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

using JunctionRelayServer.Collectors;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using JunctionRelayServer.Services.CollectorPlugins;

namespace JunctionRelayServer.Services
{
    public class Service_CollectorMetadataRegistry
    {
        private readonly IServiceProvider _provider;
        private readonly Service_PluginManager _pluginManager;
        private List<Model_CollectorMetadata> _allMetadata;
        private Dictionary<string, Model_CollectorMetadata> _byName;

        public Service_CollectorMetadataRegistry(IServiceProvider provider, Service_PluginManager pluginManager)
        {
            _provider = provider;
            _pluginManager = pluginManager;
            Rebuild();
        }

        public void Rebuild()
        {
            using var scope = _provider.CreateScope();
            var sp = scope.ServiceProvider;

            var collectors = new List<IDataCollector>
            {
                sp.GetRequiredService<DataCollector_Cloudflare>(),
                sp.GetRequiredService<DataCollector_EventEngine>(),
                sp.GetRequiredService<DataCollector_Github>(),
                sp.GetRequiredService<DataCollector_Host>(),
                sp.GetRequiredService<DataCollector_HWiNFO>(),
                sp.GetRequiredService<DataCollector_iCal>(),
                sp.GetRequiredService<DataCollector_LibreHardwareMonitor>(),
                sp.GetRequiredService<DataCollector_MQTT>(),
                sp.GetRequiredService<DataCollector_NeoPixelColor>(),
                sp.GetRequiredService<DataCollector_RateTester>(),
                sp.GetRequiredService<DataCollector_Render>(),
                sp.GetRequiredService<DataCollector_SonarrCalendar>(),
                sp.GetRequiredService<DataCollector_SSH_Linux>(),
                sp.GetRequiredService<DataCollector_Stripe>(),
                sp.GetRequiredService<DataCollector_Unraid>(),
                sp.GetRequiredService<DataCollector_UptimeKuma>(),
                sp.GetRequiredService<DataCollector_XSD>()
            };

            var nativeMetadata = collectors
                .Select(c =>
                {
                    var m = c.GetMetadata();
                    m.Source = "native";
                    m.AuthorName = "JunctionRelay";
                    return m;
                })
                .ToList();

            // Plugin metadata only contains non-conflicting types (conflicts filtered at discovery)
            var pluginMetadata = _pluginManager.GetAllMetadata();

            _byName = nativeMetadata
                .Concat(pluginMetadata)
                .ToDictionary(
                    m => m.CollectorName,
                    m => m,
                    StringComparer.OrdinalIgnoreCase
                );

            _allMetadata = _byName.Values
                .OrderBy(m => m.Category)
                .ThenBy(m => m.DisplayName)
                .ToList();
        }

        public List<Model_CollectorMetadata> GetAll()
        {
            return _allMetadata
                .Where(m => m.Category != "Internal")
                .ToList();
        }

        public Model_CollectorMetadata? GetByName(string name)
        {
            return _byName.TryGetValue(name, out var metadata) ? metadata : null;
        }
    }
}
