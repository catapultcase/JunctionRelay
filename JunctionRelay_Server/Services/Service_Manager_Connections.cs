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

        // Add peers to gateway for ESP-NOW communication (HTTP-based)
        private async Task<bool> AddPeersToGatewayAsync(string gatewayIpAddress, List<Model_Device> targetDevices)
        {
            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 📡 Adding {targetDevices.Count} peers to HTTP gateway {gatewayIpAddress}");

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
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ HTTP Gateway peer setup failed: {ex.Message}");
                return false;
            }
        }

        // Add peers to COM gateway for ESP-NOW communication (COM-based)
        private async Task<bool> AddPeersToCOMGatewayAsync(string gatewayComPort, List<Model_Device> targetDevices)
        {
            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 📡 Adding {targetDevices.Count} peers to COM gateway via {gatewayComPort}");

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var comPortManager = scope.ServiceProvider.GetRequiredService<Service_Manager_COM_Ports>();

                // Ensure gateway COM port is open
                if (!comPortManager.IsPortOpen(gatewayComPort))
                {
                    Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🔌 Opening COM gateway port {gatewayComPort}");
                    comPortManager.OpenConnection(gatewayComPort, 115200);
                    await Task.Delay(500); // Give the port time to stabilize

                    // Check again after attempting to open
                    if (!comPortManager.IsPortOpen(gatewayComPort))
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Failed to open COM gateway port {gatewayComPort}");
                        return false;
                    }
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ✅ COM gateway port {gatewayComPort} is already open");
                }

                bool allSuccessful = true;

                foreach (var device in targetDevices)
                {
                    try
                    {
                        // Create add peer command for COM gateway
                        var addPeerPayload = new
                        {
                            type = "peer_management",
                            action = "add",
                            peerMac = device.UniqueIdentifier,
                            peerName = device.Name
                        };

                        var payloadService = scope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
                        var serializedPayload = payloadService.SerializeGatewayCommand(
                            addPeerPayload,
                            includePrefix: true,  // COM always needs prefix
                            compressPayload: false  // Gateway commands probably don't need compression
                        );

                        comPortManager.SendData(gatewayComPort, serializedPayload);

                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ✅ Sent add peer command for {device.Name} ({device.UniqueIdentifier}) to COM gateway");

                        // Small delay between peer additions
                        await Task.Delay(200);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Error adding peer {device.Name} to COM gateway: {ex.Message}");
                        allSuccessful = false;
                    }
                }

                return allSuccessful;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ COM Gateway peer setup failed: {ex.Message}");
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
            var pollingManager = scope.ServiceProvider.GetRequiredService<Service_Manager_Polling>();
            var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();

            var junction = await junctionDb.GetJunctionByIdAsync(junctionId);
            if (junction == null)
                return Model_Operation_Result.Fail("Junction not found.");

            if (cancellationToken.IsCancellationRequested)
                return Model_Operation_Result.Fail("Start operation was cancelled.");

            junction.Status = "Starting";

            // Log junction mode
            bool isFrameMode = junction.RenderingMode.Equals("FrameEngine", StringComparison.OrdinalIgnoreCase);
            string modeInfo = isFrameMode ? "Frame Engine" : "Payload";
            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🔌 Starting Junction {junctionId} (Type: {junction.Type}, Mode: {modeInfo})");

            // Rest of the existing StartJunctionAsync logic remains the same...
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

            // Special handling for Gateway junctions - add peers before streaming
            if (junction.Type.Equals("Gateway Junction (HTTP to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🚀 Starting HTTP Gateway junction {junctionId}");

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

                // Get current gateway destination from the gateway device
                var currentGatewayDestination = await GetCurrentGatewayDestination(junction, deviceDb);

                // Add all target devices as peers to the HTTP gateway
                if (!string.IsNullOrEmpty(currentGatewayDestination) && targetDevices.Any())
                {
                    var peersAdded = await AddPeersToGatewayAsync(currentGatewayDestination, targetDevices);

                    if (!peersAdded)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ⚠️ Some peers failed to be added to HTTP gateway, continuing anyway...");
                    }
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ⚠️ HTTP Gateway junction has no valid gateway destination or target devices specified");
                }
            }
            else if (junction.Type.Equals("Gateway Junction (COM to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🚀 Starting COM Gateway junction {junctionId}");

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

                // Get current gateway destination from the gateway device
                var currentGatewayDestination = await GetCurrentGatewayDestination(junction, deviceDb);

                // Add all target devices as peers to the COM gateway
                if (!string.IsNullOrEmpty(currentGatewayDestination) && targetDevices.Any())
                {
                    var peersAdded = await AddPeersToCOMGatewayAsync(currentGatewayDestination, targetDevices);

                    if (!peersAdded)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ⚠️ Some peers failed to be added to COM gateway, continuing anyway...");
                    }
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ⚠️ COM Gateway junction has no valid gateway destination or target devices specified");
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

                case "Gateway Junction (COM to ESP:NOW)":
                    var comGatewayStream = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_COM>();
                    await HandleStreamingForJunctionType(comGatewayStream, junction, deviceDb, selectedSensorsCopy);
                    break;

                case "Gateway Junction (HTTP to ESP:NOW)":
                    var httpGatewayStream = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_HTTP>();
                    await HandleStreamingForJunctionType(httpGatewayStream, junction, deviceDb, selectedSensorsCopy);
                    break;

                default:
                    var http = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_HTTP>();
                    await HandleStreamingForJunctionType(http, junction, deviceDb, selectedSensorsCopy);
                    break;
            }

            _startedJunctions[junctionId] = junction;
            junction.Status = "Running";

            string finalModeInfo = isFrameMode ? "Frame Engine mode" : "Payload mode";
            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ✅ Junction {junctionId} ({junction.Name}) started successfully in {finalModeInfo}");

            return Model_Operation_Result.Ok("Junction started.");
        }

        private async Task HandleStreamingForJunctionType(dynamic streamManager, Model_Junction junction, Service_Database_Manager_Devices deviceDb, List<Model_Sensor> selectedSensorsCopy)
        {
            var junctionLinkDb = _scopeFactory.CreateScope().ServiceProvider.GetRequiredService<Service_Database_Manager_JunctionLinks>();

            // Check if this is a frame rendering junction
            bool isFrameMode = junction.RenderingMode.Equals("FrameEngine", StringComparison.OrdinalIgnoreCase);

            if (isFrameMode)
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🖼️ Junction {junction.Id} ({junction.Name}) is in Frame rendering mode");
            }
            else
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 📄 Junction {junction.Id} ({junction.Name}) is in Payload rendering mode");
            }

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
                        // Apply screen layout override if exists
                        if (overrideDict.TryGetValue(screen.Id, out var screenOverride))
                        {
                            screen.ScreenLayoutId = screenOverride.ScreenLayoutId;
                            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 📱 Using screen layout override (ID: {screenOverride.ScreenLayoutId}) for Device {device.Name} Screen {screen.DisplayName}");

                            // For frame mode, also check for frame layout override
                            if (isFrameMode && screenOverride.FrameLayoutId.HasValue)
                            {
                                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🖼️ Using frame layout override (ID: {screenOverride.FrameLayoutId}) for Device {device.Name} Screen {screen.DisplayName}");
                            }
                        }

                        var assignedSensors = junction.JunctionSensorTargets
                            .Where(jst => jst.ScreenId == screen.Id)
                            .SelectMany(jst => selectedSensorsCopy.Where(s => s.Id == jst.SensorId))
                            .ToList();

                        if (assignedSensors.Any())
                        {
                            var screenKey = $"device_{device.Id}_screen_{screen.Id}";

                            string modeDescription = isFrameMode ? "Frame rendering" : "Payload rendering";
                            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🎬 Streaming for Device {device.Name} (ID: {device.Id}) Screen {screen.Id} ({screen.DisplayName}) with {assignedSensors.Count} assigned sensors using {modeDescription} mode and send rate of {defaultSendRate}ms.");

                            // Check if this is a Gateway junction and get the current gateway destination
                            if (junction.Type.Equals("Gateway Junction (HTTP to ESP:NOW)", StringComparison.OrdinalIgnoreCase) ||
                                junction.Type.Equals("Gateway Junction (COM to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
                            {
                                // For gateway junctions, get the current destination from the gateway device
                                string? currentGatewayDestination = await GetCurrentGatewayDestination(junction, deviceDb);
                                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🚀 Current gateway destination for {screenKey}: {currentGatewayDestination ?? "Not available"}");

                                await streamManager.StartStreamingAsync(junction.Id, device.Id, defaultSendRate, screenKey, assignedSensors, screen, junction.Type, currentGatewayDestination);
                            }
                            else
                            {
                                await streamManager.StartStreamingAsync(junction.Id, device.Id, defaultSendRate, screenKey, assignedSensors, screen);
                            }

                            await Task.Delay(100);
                        }
                        else
                        {
                            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ⚠️ No sensors assigned to Device {device.Name} Screen {screen.DisplayName} - skipping stream");
                        }
                    }
                }
            }
        }

        private async Task<string?> GetCurrentGatewayDestination(Model_Junction junction, Service_Database_Manager_Devices deviceDb)
        {
            if (!junction.GatewayDeviceId.HasValue)
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ⚠️ Gateway junction {junction.Id} has no GatewayDeviceId specified");
                return null;
            }

            var gatewayDevice = await deviceDb.GetDeviceByIdAsync(junction.GatewayDeviceId.Value);
            if (gatewayDevice == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Gateway device with ID {junction.GatewayDeviceId} not found");
                return null;
            }

            string? destination = null;

            if (junction.Type.Equals("Gateway Junction (COM to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
            {
                destination = gatewayDevice.COMPort;
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🔌 Using COM port '{destination}' from gateway device '{gatewayDevice.Name}' (ID: {gatewayDevice.Id})");
            }
            else if (junction.Type.Equals("Gateway Junction (HTTP to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
            {
                destination = gatewayDevice.COMPort;
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] 🌐 Using IP address '{destination}' from gateway device '{gatewayDevice.Name}' (ID: {gatewayDevice.Id})");
            }
            else
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ⚠️ Unknown gateway junction type: {junction.Type}");
            }

            if (string.IsNullOrEmpty(destination))
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Gateway device '{gatewayDevice.Name}' has no {(junction.Type.Contains("COM") ? "COM port" : "IP address")} configured");
            }

            return destination;
        }

        // Updated method signature for GetGatewayDestination helper
        private async Task<string?> GetGatewayDestination(Model_Junction junction, Model_Device device, Service_Database_Manager_Devices deviceDb)
        {
            // For gateway junctions, get the current destination from the gateway device
            return await GetCurrentGatewayDestination(junction, deviceDb);
        }

        public async Task<Model_Operation_Result> StopJunctionAsync(int junctionId, CancellationToken cancellationToken)
        {
            if (!_startedJunctions.TryGetValue(junctionId, out var junction))
                return Model_Operation_Result.Fail($"Junction {junctionId} is not running.");

            using var scope = _scopeFactory.CreateScope();
            var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
            var collectorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Collectors>();

            dynamic streamManager;
            switch (junction.Type)
            {
                case "MQTT Junction":
                    streamManager = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_MQTT>();
                    break;

                case "COM Junction":
                case "Gateway Junction (COM to ESP:NOW)":
                    streamManager = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_COM>();
                    break;

                default:
                    // Handle Gateway Junction (HTTP to ESP:NOW), HTTP Junction, and any other types that use HTTP stream manager
                    streamManager = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_HTTP>();
                    break;
            }

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