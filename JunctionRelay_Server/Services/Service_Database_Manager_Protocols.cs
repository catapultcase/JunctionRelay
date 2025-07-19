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

using Dapper;
using System.Data;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_Protocols
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Protocols(IDbConnection db)
        {
            _db = db;
        }

        // Get the selected protocol for a device
        // Get the selected protocol for a device
        public async Task<string?> GetDeviceProtocolAsync(int deviceId)
        {
            const string query = @"
        SELECT p.Name
        FROM Protocols p
        INNER JOIN DeviceProtocols dp ON dp.ProtocolId = p.Id
        WHERE dp.DeviceId = @DeviceId AND dp.Selected = 1
        LIMIT 1";

            return await _db.ExecuteScalarAsync<string?>(query, new { DeviceId = deviceId });
        }

        // Get the selected protocol for a collector
        public async Task<string?> GetCollectorProtocolAsync(int collectorId)
        {
            const string query = @"
        SELECT p.Name
        FROM Protocols p
        INNER JOIN CollectorProtocols cp ON cp.ProtocolId = p.Id
        WHERE cp.CollectorId = @CollectorId AND cp.Selected = 1
        LIMIT 1";

            return await _db.ExecuteScalarAsync<string?>(query, new { CollectorId = collectorId });
        }


        // Fetch and log protocols for all target devices and collectors in a junction
        public async Task GetProtocolsForJunction(Model_Junction junction, Service_Database_Manager_Devices deviceDb, Service_Database_Manager_Collectors collectorDb)
        {
            // Console.WriteLine($"[SERVICE_DATABASE_MANAGER_PROTOCOLS] 📡 Fetching Protocols for Target Devices:");

            foreach (var link in junction.TargetLinks)
            {
                var device = await deviceDb.GetDeviceByIdAsync(link.DeviceId);
                if (device != null)
                {
                    // Get selected protocol for the device
                    var selectedProtocolName = await GetDeviceProtocolAsync(device.Id);

                    if (!string.IsNullOrEmpty(selectedProtocolName))
                    {
                        // Console.WriteLine($"[SERVICE_DATABASE_MANAGER_PROTOCOLS] ✅ Device {device.Name} uses protocol: {selectedProtocolName}");
                    }
                    else
                    {
                        // Console.WriteLine($"[SERVICE_DATABASE_MANAGER_PROTOCOLS] ❌ Device {device.Name} has no selected protocol.");
                    }
                }
            }

            // Console.WriteLine($"[SERVICE_DATABASE_MANAGER_PROTOCOLS] 📡 Fetching Protocols for Target Collectors:");

            foreach (var link in junction.TargetCollectorLinks)
            {
                var collector = await collectorDb.GetCollectorByIdAsync(link.CollectorId);
                if (collector != null)
                {
                    // Get selected protocol for the collector
                    var selectedProtocolName = await GetCollectorProtocolAsync(collector.Id);

                    if (!string.IsNullOrEmpty(selectedProtocolName))
                    {
                        // Console.WriteLine($"[SERVICE_DATABASE_MANAGER_PROTOCOLS] ✅ Collector {collector.Name} uses protocol: {selectedProtocolName}");
                    }
                    else
                    {
                        // Console.WriteLine($"[SERVICE_DATABASE_MANAGER_PROTOCOLS] ❌ Collector {collector.Name} has no selected protocol.");
                    }
                }
            }
        }
    }
}
