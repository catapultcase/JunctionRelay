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
using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Connections
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_Manager_Polling _pollingManager;
        public int CacheSaveIntervalMs { get; set; } = 60_000;
        private readonly ConcurrentDictionary<int, DateTime> _lastCacheSave = new();

        private readonly Dictionary<int, Model_Junction> _startedJunctions = new();

        // Global cache for the latest polled sensor data
        private readonly ConcurrentDictionary<int, Model_Sensor> _sensorCache = new();

        public Service_Manager_Connections(IServiceScopeFactory scopeFactory, Service_Manager_Polling pollingManager)
        {
            _scopeFactory = scopeFactory;
            _pollingManager = pollingManager;
        }

        // Method to fetch all sensors (synchronous)
        public IEnumerable<Model_Sensor> GetAllSensors()
        {
            return _sensorCache.Values;
        }

        // Update the global sensor cache with the latest sensor value
        public void UpdateSensorData(Model_Sensor sensor)
        {
            var now = DateTime.UtcNow;

            // 1️ - Update (or insert) the in-memory cache:
            if (_sensorCache.TryGetValue(sensor.OriginalId, out var cached))
            {
                cached.Value = sensor.Value;
                cached.LastUpdated = now;
            }
            else
            {
                sensor.Id = sensor.OriginalId;
                sensor.LastUpdated = now;
                _sensorCache[sensor.OriginalId] = sensor;
                cached = sensor;
            }

            // 2️ - Only once per CacheSaveIntervalMs, push to the DB:
            if (!_lastCacheSave.TryGetValue(cached.Id, out var lastSaved)
                || (now - lastSaved).TotalMilliseconds >= CacheSaveIntervalMs)
            {
                _lastCacheSave[cached.Id] = now;

                _ = Task.Run(async () =>
                {
                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();
                    await db.UpdateSensorAsync(cached.Id, cached);
                });
            }
        }

        // Fetch the latest sensor data from the global cache
        public Model_Sensor? GetSensorData(int sensorId)
        {
            return _sensorCache.TryGetValue(sensorId, out var sensor) ? sensor : null;
        }

        // Add peers to gateway for ESP-NOW communication
        private async Task<bool> AddPeersToGatewayAsync(string gatewayIpAddress, List<Model_Device> targetDevices)
        {
            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 📡 Adding {targetDevices.Count} peers to gateway {gatewayIpAddress}");

            try
            {
                // Create HTTP client for gateway communication
                using var httpClient = new HttpClient();
                httpClient.Timeout = TimeSpan.FromSeconds(10);

                bool allSuccessful = true;

                foreach (var device in targetDevices)
                {
                    // Create add peer payload
                    var addPeerPayload = new
                    {
                        mac = device.UniqueIdentifier,  // Target device MAC
                        name = device.Name              // Target device name
                    };

                    var jsonPayload = JsonSerializer.Serialize(addPeerPayload);
                    var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                    try
                    {
                        // Send add peer request to gateway using correct endpoint
                        var response = await httpClient.PostAsync($"http://{gatewayIpAddress}/api/espnow/peers", content);

                        if (response.IsSuccessStatusCode)
                        {
                            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ✅ Added peer {device.Name} ({device.UniqueIdentifier}) to gateway");
                        }
                        else
                        {
                            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Failed to add peer {device.Name}: {response.StatusCode}");
                            allSuccessful = false;
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Error adding peer {device.Name}: {ex.Message}");
                        allSuccessful = false;
                    }

                    // Small delay between peer additions
                    await Task.Delay(100);
                }

                return allSuccessful;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Gateway peer setup failed: {ex.Message}");
                return false;
            }
        }

        // Start Junction
        public async Task<Model_Operation_Result> StartJunctionAsync(int junctionId, CancellationToken cancellationToken)
        {
            if (_startedJunctions.ContainsKey(junctionId))
                return Model_Operation_Result.Fail($"Junction {junctionId} is already running.");

            using var scope = _scopeFactory.CreateScope();
            var junctionDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();
            var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
            var collectorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Collectors>();
            var protocolDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Protocols>();
            var pollingManager = scope.ServiceProvider.GetRequiredService<Service_Manager_Polling>();
            var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();

            var junction = await junctionDb.GetJunctionByIdAsync(junctionId);
            if (junction == null)
                return Model_Operation_Result.Fail("Junction not found.");

            if (cancellationToken.IsCancellationRequested)
                return Model_Operation_Result.Fail("Start operation was cancelled.");

            junction.Status = "Starting";
            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🔌 Starting Junction {junctionId} (Type: {junction.Type})");

            // Populate links and sensors (including JunctionSensorTargets)
            await junctionDb.PopulateLinksAndSensors(junction);

            // Select the sensors that are marked as selected
            var selectedSensors = junction.ClonedSensors.Where(s => s.IsSelected).ToList();
            // Create a copy of selectedSensors for further use in the class
            var selectedSensorsCopy = selectedSensors.Select(s => s.TrueClone()).ToList();

            // Register polling for devices
            foreach (var link in junction.SourceLinks)
            {
                var device = await deviceDb.GetDeviceByIdAsync(link.DeviceId);
                if (device != null)
                {
                    int pollRate = pollingManager.GetPollRate(
                        junctionDeviceLinks: new List<Model_JunctionDeviceLink> { link },
                        junctionCollectorLinks: new List<Model_JunctionCollectorLink>(),
                        device: device,
                        collector: null!
                    );

                    _pollingManager.RegisterJunctionSource(
                        key: $"Device-{device.Id}",
                        junctionId,
                        pollRateMs: pollRate,
                        device: device
                    );
                }
            }

            // Register polling for collectors
            foreach (var link in junction.SourceCollectorLinks)
            {
                var collector = await collectorDb.GetCollectorByIdAsync(link.CollectorId);
                if (collector != null)
                {
                    int pollRate = pollingManager.GetPollRate(
                        junctionDeviceLinks: new List<Model_JunctionDeviceLink>(),
                        junctionCollectorLinks: new List<Model_JunctionCollectorLink> { link },
                        device: null!,
                        collector: collector
                    );

                    // Pass the original collection to RegisterJunctionSource
                    _pollingManager.RegisterJunctionSource(
                        key: $"Collector-{collector.Id}",
                        junctionId,
                        pollRateMs: pollRate,
                        collector: collector,
                        selectedSensors: selectedSensors // Pass the real collection
                    );
                }
            }

            await protocolDb.GetProtocolsForJunction(junction, deviceDb, collectorDb);

            // Special handling for Gateway junctions - add peers before streaming
            if (junction.Type.Equals("Gateway Junction (HTTP)", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🚀 Starting Gateway junction {junctionId}");

                // Get all target devices for this junction
                var targetDevices = new List<Model_Device>();
                foreach (var link in junction.TargetLinks)
                {
                    var device = await deviceDb.GetDeviceByIdAsync(link.DeviceId);
                    if (device != null)
                    {
                        targetDevices.Add(device);
                    }
                }

                // Add all target devices as peers to the gateway
                if (!string.IsNullOrEmpty(junction.GatewayDestination) && targetDevices.Any())
                {
                    var peersAdded = await AddPeersToGatewayAsync(junction.GatewayDestination, targetDevices);

                    if (!peersAdded)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ⚠️ Some peers failed to be added to gateway, continuing anyway...");
                    }
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ⚠️ Gateway junction has no destination or target devices specified");
                }
            }

            // Streaming based on junction type
            switch (junction.Type)
            {
                case "MQTT Junction":
                    var mqtt = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_MQTT>();
                    await HandleStreamingForJunctionType(mqtt, junction, deviceDb, selectedSensorsCopy);
                    break;

                case "COM Junction":
                    var com = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_COM>();
                    await HandleStreamingForJunctionType(com, junction, deviceDb, selectedSensorsCopy);
                    break;

                case "Gateway Junction (HTTP)":
                    var gatewayStream = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_HTTP>();
                    await HandleStreamingForJunctionType(gatewayStream, junction, deviceDb, selectedSensorsCopy);
                    break;

                default:
                    var http = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_HTTP>();
                    await HandleStreamingForJunctionType(http, junction, deviceDb, selectedSensorsCopy);
                    break;
            }

            _startedJunctions[junctionId] = junction;
            junction.Status = "Running";
            return Model_Operation_Result.Ok("Junction started.");
        }

        private async Task HandleStreamingForJunctionType(dynamic streamManager, Model_Junction junction, Service_Database_Manager_Devices deviceDb, List<Model_Sensor> selectedSensorsCopy)
        {
            var junctionLinkDb = _scopeFactory.CreateScope().ServiceProvider.GetRequiredService<Service_Database_Manager_JunctionLinks>();

            foreach (var link in junction.TargetLinks)
            {
                var device = await deviceDb.GetDeviceByIdAsync(link.DeviceId);
                if (device != null)
                {
                    int defaultSendRate = device.SendRate ?? 5000;
                    if (link.SendRateOverride.HasValue && link.SendRateOverride.Value > 0 && link.SendRateOverride.Value < defaultSendRate)
                        defaultSendRate = link.SendRateOverride.Value;

                    var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByLinkIdAsync(link.Id);
                    var overrideDict = screenLayoutOverrides.ToDictionary(o => o.DeviceScreenId);

                    var screens = junction.DeviceScreens.Where(screen => screen.DeviceId == device.Id && screen.SupportsConfigPayloads).ToList();

                    foreach (var screen in screens)
                    {
                        if (overrideDict.TryGetValue(screen.Id, out var screenOverride))
                        {
                            screen.ScreenLayoutId = screenOverride.ScreenLayoutId;
                            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 📱 Using screen layout override (ID: {screenOverride.ScreenLayoutId}) for Device {device.Name} Screen {screen.DisplayName}");
                        }

                        var assignedSensors = junction.JunctionSensorTargets
                            .Where(jst => jst.ScreenId == screen.Id)
                            .SelectMany(jst => selectedSensorsCopy.Where(s => s.Id == jst.SensorId)) // Using Where to get all matching sensors
                            .ToList();

                        if (assignedSensors.Any())
                        {
                            var screenKey = $"device_{device.Id}_screen_{screen.Id}";
                            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🎬 Streaming for Device {device.Name} (ID: {device.Id}) Screen {screen.Id} ({screen.DisplayName}) with assigned sensors using a send rate of {defaultSendRate}ms.");

                            // Check if this is a Gateway junction and pass the gateway destination
                            if (junction.Type.Equals("Gateway Junction (HTTP)", StringComparison.OrdinalIgnoreCase))
                            {
                                // Extract gateway destination from junction properties
                                string? gatewayDestination = GetGatewayDestination(junction, device);
                                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🚀 Gateway destination for {screenKey}: {gatewayDestination ?? "Not specified"}");

                                await streamManager.StartStreamingAsync(junction.Id, device.Id, defaultSendRate, screenKey, assignedSensors, screen, junction.Type, gatewayDestination);
                            }
                            else
                            {
                                await streamManager.StartStreamingAsync(junction.Id, device.Id, defaultSendRate, screenKey, assignedSensors, screen);
                            }

                            await Task.Delay(100);
                        }
                    }
                }
            }
        }

        // Helper method to extract gateway destination from junction properties
        private string? GetGatewayDestination(Model_Junction junction, Model_Device device)
        {
            // Priority 1: Check if junction has a GatewayDestination property (should be gateway IP)
            if (!string.IsNullOrEmpty(junction.GatewayDestination))
            {
                return junction.GatewayDestination;
            }

            // Priority 2: Check junction description for IP address pattern (fallback)
            if (!string.IsNullOrEmpty(junction.Description))
            {
                var ipPattern = @"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b";
                var match = System.Text.RegularExpressions.Regex.Match(junction.Description, ipPattern);
                if (match.Success)
                {
                    return match.Value;
                }
            }

            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ⚠️ Gateway junction {junction.Id} has no destination specified");
            return null;
        }

        public async Task<Model_Operation_Result> StopJunctionAsync(int junctionId, CancellationToken cancellationToken)
        {
            if (!_startedJunctions.TryGetValue(junctionId, out var junction))
                return Model_Operation_Result.Fail($"Junction {junctionId} is not running.");

            using var scope = _scopeFactory.CreateScope();
            var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
            var collectorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Collectors>();

            dynamic streamManager;
            if (junction.Type == "MQTT Junction")
                streamManager = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_MQTT>();
            else if (junction.Type == "Gateway Junction (HTTP)")
                streamManager = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_HTTP>();
            else if (junction.Type == "HTTP Junction")
                streamManager = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_HTTP>();
            else
                return Model_Operation_Result.Fail($"Unsupported junction type: {junction.Type}");

            if (cancellationToken.IsCancellationRequested)
                return Model_Operation_Result.Fail("Stop operation was cancelled.");

            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🛑 Stopping Junction {junctionId} (Type: {junction.Type})");

            foreach (var link in junction.SourceLinks)
                _pollingManager.UnregisterJunctionSource($"Device-{link.DeviceId}", junctionId);
            foreach (var link in junction.SourceCollectorLinks)
                _pollingManager.UnregisterJunctionSource($"Collector-{link.CollectorId}", junctionId);

            foreach (var link in junction.TargetLinks)
            {
                var device = await deviceDb.GetDeviceByIdAsync(link.DeviceId);
                if (device != null)
                {
                    var deviceScreens = junction.DeviceScreens.Where(screen => screen.DeviceId == device.Id);
                    foreach (var screen in deviceScreens)
                        streamManager.StopStreaming(screen.Id);
                }
            }

            junction.Status = "Idle";
            _startedJunctions.Remove(junctionId);
            return Model_Operation_Result.Ok("Junction stopped.");
        }

        public async Task HandleSensorUpdateForDevice(int deviceId, List<Model_Sensor> sensors)
        {
            using var scope = _scopeFactory.CreateScope();
            foreach (var sensor in sensors)
                UpdateSensorData(sensor);
            await Task.CompletedTask;
        }

        public async Task HandleSensorUpdateForCollector(int collectorId, List<Model_Sensor> sensors)
        {
            using var scope = _scopeFactory.CreateScope();
            foreach (var sensor in sensors)
                UpdateSensorData(sensor);
            await Task.CompletedTask;
        }

        public async Task<IEnumerable<Model_Sensor>> GetSensorsByJunctionAsync(int junctionId)
        {
            using var scope = _scopeFactory.CreateScope();
            var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();

            var junctionSensorTargets = await sensorDb.GetAllSensorTargetsForJunctionAsync(junctionId);
            if (junctionSensorTargets == null || !junctionSensorTargets.Any())
                return Enumerable.Empty<Model_Sensor>();

            var clonedSensors = await sensorDb.GetJunctionSensorsByJunctionIdAsync(junctionId);
            if (clonedSensors == null || !clonedSensors.Any())
                return Enumerable.Empty<Model_Sensor>();

            var junctionSensorIds = junctionSensorTargets.Select(target => target.SensorId).Distinct();
            var relevantClonedSensors = clonedSensors.Where(cs => junctionSensorIds.Contains(cs.Id)).ToList();

            var foundSensors = new List<Model_Sensor>();
            foreach (var clonedSensor in relevantClonedSensors)
            {
                var originalId = clonedSensor.OriginalId;
                if (_sensorCache.TryGetValue(originalId, out var cachedSensor))
                {
                    foundSensors.Add(cachedSensor);
                }
                else
                {
                    var sensor = await sensorDb.GetSensorByIdAsync(originalId);
                    if (sensor != null)
                    {
                        _sensorCache[originalId] = sensor;
                        foundSensors.Add(sensor);
                    }
                }
            }

            return foundSensors;
        }

        public bool IsJunctionRunning(int id) => _startedJunctions.ContainsKey(id);
        public IReadOnlyDictionary<int, Model_Junction> RunningJunctions => _startedJunctions;
    }
}