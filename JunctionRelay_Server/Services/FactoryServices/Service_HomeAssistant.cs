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
using System.Text.Json;
using System.Collections.Concurrent;

namespace JunctionRelayServer.Services.FactoryServices
{
    public class Service_HomeAssistant : IService
    {
        private static readonly ConcurrentDictionary<int, Service_HomeAssistant> _instances = new();
        private Model_Service? _service;

        public bool IsConnected { get; private set; }
        public Model_Service? GetCurrentService() => _service;

        // Constructor
        public Service_HomeAssistant()
        {
            // No external connections needed - this is a gatekeeper service
        }

        // Static method to get or create singleton instance for a service
        public static Service_HomeAssistant GetInstance(Model_Service service)
        {
            return _instances.GetOrAdd(service.Id, _ =>
            {
                var instance = new Service_HomeAssistant();
                instance.SetService(service);
                return instance;
            });
        }

        // Set the service configuration dynamically
        public void SetService(Model_Service service)
        {
            if (_service != null && _service.Id == service.Id)
                return; // Already set

            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        // Connect - for HomeAssistant this just validates the service is configured
        public async Task ConnectAsync()
        {
            if (_service == null)
            {
                throw new InvalidOperationException($"[SERVICE_HOMEASSISTANT] Service must be configured before connecting.");
            }

            // Only log if not already connected
            if (!IsConnected)
            {
                IsConnected = true;
                Console.WriteLine($"[SERVICE_HOMEASSISTANT][{_service.Id}] HomeAssistant gatekeeper service activated for '{_service.Name}'");

                var sharedJunctions = GetSharedJunctionIds();
                Console.WriteLine($"[SERVICE_HOMEASSISTANT][{_service.Id}] Currently sharing {sharedJunctions.Count} junctions with HomeAssistant");
            }

            await Task.CompletedTask;
        }

        // Check if HomeAssistant access is enabled
        public bool IsHomeAssistantAccessEnabled()
        {
            return _service != null && IsConnected && _service.Status == "Active";
        }

        // Get list of shared junction IDs from the service configuration
        public List<string> GetSharedJunctionIds()
        {
            if (_service?.HomeAssistantSharedJunctions == null)
                return new List<string>();

            try
            {
                var sharedJunctions = JsonSerializer.Deserialize<List<string>>(_service.HomeAssistantSharedJunctions);
                return sharedJunctions ?? new List<string>();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_HOMEASSISTANT][{_service?.Id}] Failed to parse shared junctions: {ex.Message}");
                return new List<string>();
            }
        }

        // Check if a specific junction is shared with HomeAssistant
        public bool IsJunctionShared(string junctionId)
        {
            if (!IsHomeAssistantAccessEnabled())
                return false;

            var sharedJunctions = GetSharedJunctionIds();
            return sharedJunctions.Contains(junctionId);
        }

        // Filter junction data for HomeAssistant access
        public List<T> FilterJunctionsForHomeAssistant<T>(List<T> junctions, Func<T, string> getJunctionId)
        {
            if (!IsHomeAssistantAccessEnabled())
            {
                Console.WriteLine($"[SERVICE_HOMEASSISTANT][{_service?.Id}] HomeAssistant access not enabled - returning empty list");
                return new List<T>();
            }

            var sharedJunctionIds = GetSharedJunctionIds();
            if (sharedJunctionIds.Count == 0)
            {
                Console.WriteLine($"[SERVICE_HOMEASSISTANT][{_service?.Id}] No junctions shared - returning empty list");
                return new List<T>();
            }

            var filteredJunctions = junctions.Where(j => sharedJunctionIds.Contains(getJunctionId(j))).ToList();
            Console.WriteLine($"[SERVICE_HOMEASSISTANT][{_service?.Id}] Filtered {junctions.Count} junctions down to {filteredJunctions.Count} for HomeAssistant");

            return filteredJunctions;
        }

        // Get service status for API responses
        public object GetServiceStatus()
        {
            var sharedJunctions = GetSharedJunctionIds();

            return new
            {
                ServiceName = _service?.Name ?? "Unknown",
                ServiceId = _service?.Id ?? 0,
                IsEnabled = IsHomeAssistantAccessEnabled(),
                SharedJunctionCount = sharedJunctions.Count,
                SharedJunctionIds = sharedJunctions,
                LastUpdated = DateTime.UtcNow
            };
        }

        // Disconnect - just cleanup
        public async Task DisconnectAsync()
        {
            IsConnected = false;
            Console.WriteLine($"[SERVICE_HOMEASSISTANT][{_service?.Id}] HomeAssistant gatekeeper service disconnected");
            await Task.CompletedTask;
        }

        // Clean up singleton instance
        public static void RemoveInstance(int serviceId)
        {
            _instances.TryRemove(serviceId, out _);
        }

        // No resources to dispose for this service
        public void Dispose()
        {
            if (_service != null)
            {
                RemoveInstance(_service.Id);
            }
        }
    }
}