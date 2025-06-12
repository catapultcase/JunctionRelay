/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

using JunctionRelayServer.Models;

namespace JunctionRelayServer.Interfaces
{
    public interface IDataCollector
    {
        // Unique identifier (should be set in ApplyConfiguration)
        int CollectorId { get; }

        // This is used primarily for identifying the handler type (e.g., "HomeAssistant")
        string CollectorName { get; }

        void ApplyConfiguration(Model_Collector collector);

        Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default);

        // New method to fetch only selected sensors
        Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default);

        Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default);

        // Optional persistent session methods
        Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default);
        Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default);
        bool IsConnected(Model_Collector collector);
    }
}
