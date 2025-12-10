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

using JunctionRelayServer.Services;
using JunctionRelayServer.Models;
using JunctionRelayServer.Interfaces;
using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Connections : IDisposable
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_Manager_Polling _pollingManager;
        private readonly Service_Events _eventService;
        private readonly Service_BlitMode_ResourceMonitor _blitResourceMonitor;
        private Timer? _cleanupTimer;

        public int CacheSaveIntervalMs { get; set; } = 60_000;
        private readonly ConcurrentDictionary<int, DateTime> _lastCacheSave = new();

        private readonly Dictionary<int, Model_Junction> _startedJunctions = new();

        private readonly ConcurrentDictionary<int, Model_Sensor> _sensorCache = new();

        // Cache junction-to-sensor mappings to avoid DB calls during cleanup
        private readonly ConcurrentDictionary<int, HashSet<int>> _junctionSensorMappings = new();

        public Service_Manager_Connections(
            IServiceScopeFactory scopeFactory,
            Service_Manager_Polling pollingManager,
            Service_Events eventService,
            Service_BlitMode_ResourceMonitor blitResourceMonitor)
        {
            _scopeFactory = scopeFactory;
            _pollingManager = pollingManager;
            _eventService = eventService;
            _blitResourceMonitor = blitResourceMonitor;

            StartCleanupTimer();
        }

        private async void StartCleanupTimer()
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var settingsService = scope.ServiceProvider.GetRequiredService<IService_Settings>();

                var cleanupIntervalMs = await settingsService.GetIntSettingAsync("global_sensorcache_expiry", 60000);

                _cleanupTimer = new Timer(async _ => await CleanupExpiredSensorsAsync(),
                                         null,
                                         TimeSpan.FromMilliseconds(cleanupIntervalMs),
                                         TimeSpan.FromMilliseconds(cleanupIntervalMs));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Error starting cleanup timer: {ex.Message}");
            }
        }

        private async Task CleanupExpiredSensorsAsync()
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var settingsService = scope.ServiceProvider.GetRequiredService<IService_Settings>();

                var gracePeriodMs = await settingsService.GetIntSettingAsync("global_sensorcache_expiry", 60000);
                var now = DateTime.UtcNow;

                // Get all sensors that are currently protected by running junctions (from cache, no DB calls)
                var protectedSensorIds = new HashSet<int>();

                // Protect sensors belonging to currently running junctions
                foreach (var runningJunctionId in _startedJunctions.Keys)
                {
                    if (_junctionSensorMappings.TryGetValue(runningJunctionId, out var junctionSensorIds))
                    {
                        foreach (var sensorId in junctionSensorIds)
                        {
                            protectedSensorIds.Add(sensorId);
                        }
                    }
                }

                // Find sensors eligible for cleanup (not protected by running junctions and beyond grace period since last update)
                var sensorsToRemove = new List<int>();

                foreach (var kvp in _sensorCache)
                {
                    var sensorId = kvp.Key;
                    var sensor = kvp.Value;

                    // Skip sensors that are protected by currently running junctions
                    if (protectedSensorIds.Contains(sensorId))
                    {
                        continue;
                    }

                    // Only remove sensors that are both unprotected AND beyond the grace period
                    if (sensor.LastUpdated != default(DateTime) &&
                        (now - sensor.LastUpdated).TotalMilliseconds > gracePeriodMs)
                    {
                        sensorsToRemove.Add(sensorId);
                    }
                }

                // Remove expired, unprotected sensors from cache
                foreach (var sensorId in sensorsToRemove)
                {
                    _sensorCache.TryRemove(sensorId, out _);
                    _lastCacheSave.TryRemove(sensorId, out _);
                }

                // if (sensorsToRemove.Count > 0)
                // {
                //     Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Cleaned up {sensorsToRemove.Count} expired sensors from cache (grace period: {gracePeriodMs}ms, protected: {protectedSensorIds.Count})");
                // }

                // Update cleanup timer interval based on current grace period setting
                var newIntervalMs = gracePeriodMs;
                _cleanupTimer?.Dispose();
                _cleanupTimer = new Timer(async _ => await CleanupExpiredSensorsAsync(),
                                         null,
                                         TimeSpan.FromMilliseconds(newIntervalMs),
                                         TimeSpan.FromMilliseconds(newIntervalMs));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Error during sensor cache cleanup: {ex.Message}");
            }
        }

        public IEnumerable<Model_Sensor> GetAllSensors()
        {
            return _sensorCache.Values;
        }

        public void UpdateSensorData(Model_Sensor sensor)
        {
            var now = DateTime.UtcNow;
            bool valueChanged = false;

            if (_sensorCache.TryGetValue(sensor.OriginalId, out var cached))
            {
                valueChanged = cached.Value != sensor.Value;
                cached.Value = sensor.Value;
                cached.LastUpdated = now;
            }
            else
            {
                // Console.WriteLine($"[CONNECTION_MGR] Sensor {sensor.OriginalId}: NEW sensor, value='{sensor.Value}'");

                // Clone the sensor before adding to cache to prevent shared reference issues
                var clonedSensor = new Model_Sensor
                {
                    Id = sensor.OriginalId,
                    OriginalId = sensor.OriginalId,
                    ExternalId = sensor.ExternalId,
                    Name = sensor.Name,
                    Value = sensor.Value,
                    Unit = sensor.Unit,
                    LastUpdated = now,
                    DeviceId = sensor.DeviceId,
                    CollectorId = sensor.CollectorId,
                    JunctionId = sensor.JunctionId,
                    DecimalPlaces = sensor.DecimalPlaces,
                    SensorType = sensor.SensorType,
                    DeviceName = sensor.DeviceName,
                    ComponentName = sensor.ComponentName,
                    Category = sensor.Category,
                    SensorTag = sensor.SensorTag,
                    IsSelected = sensor.IsSelected,
                    IsEventSensor = sensor.IsEventSensor
                };

                _sensorCache[sensor.OriginalId] = clonedSensor;
                cached = clonedSensor;
                valueChanged = true;
            }

            // Only notify event service if value actually changed
            if (valueChanged)
            {
                _eventService.OnSensorUpdated(cached.Id, cached.Value);
            }

            if (!_lastCacheSave.TryGetValue(cached.Id, out var lastSaved)
            || (now - lastSaved).TotalMilliseconds >= CacheSaveIntervalMs)
            {
                _lastCacheSave[cached.Id] = now;
                _ = Task.Run(async () =>
                {
                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();
                    await db.UpdateSensorValueAsync(cached.Id, cached);
                });
            }
        }

        public Model_Sensor? GetSensorData(int sensorId)
        {
            return _sensorCache.TryGetValue(sensorId, out var sensor) ? sensor : null;
        }

        private async Task<bool> AddPeersToGatewayAsync(string gatewayIpAddress, List<Model_Device> targetDevices)
        {
            // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Adding {targetDevices.Count} peers to HTTP gateway {gatewayIpAddress}");

            try
            {
                using var httpClient = new HttpClient();
                httpClient.Timeout = TimeSpan.FromSeconds(10);

                bool allSuccessful = true;

                foreach (var device in targetDevices)
                {
                    var addPeerPayload = new
                    {
                        mac = device.UniqueIdentifier,
                        name = device.Name
                    };

                    var jsonPayload = JsonSerializer.Serialize(addPeerPayload);
                    var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                    try
                    {
                        var response = await httpClient.PostAsync($"http://{gatewayIpAddress}/api/espnow/peers", content);

                        if (response.IsSuccessStatusCode)
                        {
                            // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Added peer {device.Name} ({device.UniqueIdentifier}) to gateway");
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

        private async Task<bool> AddPeersToCOMGatewayAsync(string gatewayComPort, List<Model_Device> targetDevices)
        {
            // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Adding {targetDevices.Count} peers to COM gateway via {gatewayComPort}");

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var comPortManager = scope.ServiceProvider.GetRequiredService<Service_Manager_COM_Ports>();

                if (!comPortManager.IsPortOpen(gatewayComPort))
                {
                    // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Opening COM gateway port {gatewayComPort}");
                    comPortManager.OpenConnection(gatewayComPort, 115200);
                    await Task.Delay(500);

                    if (!comPortManager.IsPortOpen(gatewayComPort))
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Failed to open COM gateway port {gatewayComPort}");
                        return false;
                    }
                }
                // else
                // {
                //     Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] COM gateway port {gatewayComPort} is already open");
                // }

                bool allSuccessful = true;

                foreach (var device in targetDevices)
                {
                    try
                    {
                        var addPeerPayload = new
                        {
                            type = "peer_management",
                            action = "add",
                            peerMac = device.UniqueIdentifier,
                            peerName = device.Name
                        };

                        var payloadService = scope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
                        var serializedPayload = payloadService.SerializeGatewayCommand(addPeerPayload, false);

                        comPortManager.SendData(gatewayComPort, serializedPayload);

                        // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Sent add peer command for {device.Name} ({device.UniqueIdentifier}) to COM gateway");

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

        private async Task<bool> AddPeersToWebSocketGatewayAsync(string gatewayDeviceMac, List<Model_Device> targetDevices)
        {
            // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Adding {targetDevices.Count} peers to WebSocket gateway {gatewayDeviceMac}");

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var webSocketManager = scope.ServiceProvider.GetRequiredService<Service_Manager_WebSocket_Client>();

                if (!webSocketManager.IsDeviceConnected(gatewayDeviceMac))
                {
                    Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ WebSocket gateway {gatewayDeviceMac} is not connected");
                    return false;
                }

                bool allSuccessful = true;

                foreach (var device in targetDevices)
                {
                    try
                    {
                        var addPeerPayload = new
                        {
                            type = "peer_management",
                            action = "add",
                            peerMac = device.UniqueIdentifier,
                            peerName = device.Name
                        };

                        var payloadService = scope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
                        var serializedPayload = payloadService.SerializeGatewayCommand(addPeerPayload, false);

                        var webSocketSender = new Service_Send_Data_WebSocket(
                            gatewayDeviceMac,
                            webSocketManager,
                            isGatewayMode: false,
                            gatewayTarget: null
                        );

                        var result = await webSocketSender.SendPayloadWithHealthAsync(serializedPayload);

                        if (result.Success)
                        {
                            // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Added peer {device.Name} ({device.UniqueIdentifier}) to WebSocket gateway");
                        }
                        else
                        {
                            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Failed to add peer {device.Name}: {result.ErrorMessage}");
                            allSuccessful = false;
                        }

                        webSocketSender.Dispose();

                        await Task.Delay(200);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Error adding peer {device.Name} to WebSocket gateway: {ex.Message}");
                        allSuccessful = false;
                    }
                }

                return allSuccessful;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ WebSocket Gateway peer setup failed: {ex.Message}");
                return false;
            }
        }

        public async Task<Model_Operation_Result> StartJunctionAsync(int junctionId, CancellationToken cancellationToken)
        {
            var operationId = Guid.NewGuid().ToString();
            string junctionName = $"Junction {junctionId}";

            if (_startedJunctions.ContainsKey(junctionId))
                return Model_Operation_Result.Fail($"Junction {junctionId} is already running.");

            using var scope = _scopeFactory.CreateScope();
            var progressBroadcaster = scope.ServiceProvider.GetRequiredService<Service_Unified_Notification_Broadcaster>();

            try
            {
                var junctionDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();
                var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                var collectorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Collectors>();
                var pollingManager = scope.ServiceProvider.GetRequiredService<Service_Manager_Polling>();
                var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();

                // STAGE 1: Validating
                await progressBroadcaster.EmitJunctionProgressAsync(
                    junctionId,
                    junctionName,
                    operationId,
                    JunctionStartStage.Validating,
                    "Checking if junction is already running...");

                var junction = await junctionDb.GetJunctionByIdAsync(junctionId);
                junctionName = junction?.Name ?? junctionName; // Update name if available
            if (junction == null)
            {
                await progressBroadcaster.EmitJunctionProgressAsync(
                    junctionId,
                    $"Junction {junctionId}",
                    operationId,
                    JunctionStartStage.Validating,
                    "Junction not found",
                    isComplete: false,
                    hasError: true,
                    errorMessage: "Junction not found");
                return Model_Operation_Result.Fail("Junction not found.");
            }

            if (cancellationToken.IsCancellationRequested)
            {
                await progressBroadcaster.EmitJunctionProgressAsync(
                    junctionId,
                    junction.Name,
                    operationId,
                    JunctionStartStage.Validating,
                    "Start operation was cancelled",
                    isComplete: false,
                    hasError: true,
                    errorMessage: "Operation cancelled");
                return Model_Operation_Result.Fail("Start operation was cancelled.");
            }

            await progressBroadcaster.EmitJunctionProgressAsync(
                junctionId,
                junction.Name,
                operationId,
                JunctionStartStage.Validating,
                "Validation complete");

            // Minimum display time for stage visibility
            await Task.Delay(500, cancellationToken);

            junction.Status = "Starting";

            var renderMode = junction.RenderingMode;
            string modeInfo = renderMode switch
            {
                RenderModes.Blit => "Blit (pre-rendered frames)",
                RenderModes.Composite => "Composite (frame assembly)",
                RenderModes.Payload => "Payload (data)",
                _ => $"Unknown ({renderMode})"
            };
            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Starting Junction {junctionId} (Type: {junction.Type}, Mode: {modeInfo})");

            // STAGE 2: Loading Configuration
            await progressBroadcaster.EmitJunctionProgressAsync(
                junctionId,
                junction.Name,
                operationId,
                JunctionStartStage.LoadingConfiguration,
                $"Loading junction configuration (Type: {junction.Type}, Mode: {modeInfo})...");

            await junctionDb.PopulateLinksAndSensors(junction);

            // Minimum display time for stage visibility
            await Task.Delay(500, cancellationToken);

            var selectedSensors = junction.ClonedSensors.Where(s => s.IsSelected).ToList();
            var selectedSensorsCopy = selectedSensors.Select(s => s.TrueClone()).ToList();

            // Cache junction-to-sensor mappings for cleanup optimization
            var junctionSensorIds = new HashSet<int>();
            foreach (var sensor in selectedSensors)
            {
                junctionSensorIds.Add(sensor.OriginalId);
            }
            _junctionSensorMappings[junctionId] = junctionSensorIds;

            // STAGE 3: Testing Collectors
            var collectorLinksToTest = junction.SourceCollectorLinks.ToList();
            if (collectorLinksToTest.Any() && junction.EnableTests)
            {
                await progressBroadcaster.EmitJunctionProgressAsync(
                    junctionId,
                    junction.Name,
                    operationId,
                    JunctionStartStage.TestingCollectors,
                    $"Testing {collectorLinksToTest.Count} collector(s)...");

                var dataCollectorFactory = scope.ServiceProvider.GetRequiredService<Func<Model_Collector, IDataCollector>>();
                int testsPassed = 0;
                int testsFailed = 0;
                var failedCollectorNames = new List<string>();

                foreach (var link in collectorLinksToTest)
                {
                    var collector = await collectorDb.GetCollectorByIdAsync(link.CollectorId);
                    if (collector != null)
                    {
                        await progressBroadcaster.EmitJunctionProgressAsync(
                            junctionId,
                            junction.Name,
                            operationId,
                            JunctionStartStage.TestingCollectors,
                            $"Testing collector '{collector.Name}'...");

                        try
                        {
                            var dataCollector = dataCollectorFactory(collector);
                            dataCollector.ApplyConfiguration(collector);

                            var skipConnectionTest = collector.CollectorType == "LibreHardwareMonitor" ||
                                                    collector.CollectorType == "HWiNFO" ||
                                                    collector.CollectorType == "Host" ||
                                                    collector.CollectorType == "EventEngine" ||
                                                    collector.CollectorType == "RateTester" ||
                                                    collector.CollectorType == "SystemTime" ||
                                                    collector.CollectorType == "InternetTime";

                            bool testSuccessful;

                            if (skipConnectionTest)
                            {
                                var sensors = await dataCollector.FetchSensorsAsync(collector);
                                testSuccessful = sensors != null && sensors.Count() > 0;
                            }
                            else
                            {
                                var connectionOk = await dataCollector.TestConnectionAsync(collector);
                                if (connectionOk)
                                {
                                    var sensors = await dataCollector.FetchSensorsAsync(collector);
                                    testSuccessful = sensors != null && sensors.Count() > 0;
                                }
                                else
                                {
                                    testSuccessful = false;
                                }
                            }

                            if (testSuccessful)
                            {
                                testsPassed++;
                                // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ✅ Collector '{collector.Name}' test passed");
                            }
                            else
                            {
                                testsFailed++;
                                failedCollectorNames.Add(collector.Name);
                                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Collector '{collector.Name}' test failed");
                            }
                        }
                        catch (Exception ex)
                        {
                            testsFailed++;
                            failedCollectorNames.Add(collector.Name);
                            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Error testing collector '{collector.Name}': {ex.Message}");
                        }
                    }
                }

                // Report test results
                var testSummary = $"Collector tests: {testsPassed} passed, {testsFailed} failed";
                if (testsFailed > 0)
                {
                    if (!junction.AllowStartOnCollectorTestFailure)
                    {
                        // Fail the junction start
                        var errorMsg = $"Junction start aborted: {testsFailed} collector(s) failed tests ({string.Join(", ", failedCollectorNames)})";
                        await progressBroadcaster.EmitJunctionProgressAsync(
                            junctionId,
                            junction.Name,
                            operationId,
                            JunctionStartStage.TestingCollectors,
                            errorMsg,
                            isComplete: false,
                            hasError: true,
                            errorMessage: errorMsg);
                        return Model_Operation_Result.Fail(errorMsg);
                    }
                    else
                    {
                        // Continue despite failures
                        // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ⚠️ Continuing despite collector test failures (AllowStartOnCollectorTestFailure is enabled)");
                        await progressBroadcaster.EmitJunctionProgressAsync(
                            junctionId,
                            junction.Name,
                            operationId,
                            JunctionStartStage.TestingCollectors,
                            $"{testSummary} - continuing despite failures");
                    }
                }
                else
                {
                    await progressBroadcaster.EmitJunctionProgressAsync(
                        junctionId,
                        junction.Name,
                        operationId,
                        JunctionStartStage.TestingCollectors,
                        testSummary);
                }

                // Minimum display time for stage visibility
                await Task.Delay(500, cancellationToken);
            }
            // else if (!junction.EnableTests)
            // {
            //     Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ⏭️ Collector testing disabled for junction {junctionId}");
            // }

            // STAGE 4: Registering Sources
            await progressBroadcaster.EmitJunctionProgressAsync(
                junctionId,
                junction.Name,
                operationId,
                JunctionStartStage.RegisteringSources,
                $"Registering {junction.SourceLinks.Count + junction.SourceCollectorLinks.Count} source(s) and {selectedSensors.Count} sensor(s) with polling manager...");

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

                    _pollingManager.RegisterJunctionSource(
                        key: $"Collector-{collector.Id}",
                        junctionId,
                        pollRateMs: pollRate,
                        collector: collector,
                        selectedSensors: selectedSensors
                    );
                }
            }

            // Minimum display time for stage visibility
            await Task.Delay(500, cancellationToken);

            bool isGatewayJunction = junction.Type.Contains("Gateway Junction", StringComparison.OrdinalIgnoreCase);

            if (junction.Type.Equals("Gateway Junction (HTTP to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
            {
                // STAGE 5: Configuring Gateway (only for Gateway junctions)
                await progressBroadcaster.EmitJunctionProgressAsync(
                    junctionId,
                    junction.Name,
                    operationId,
                    JunctionStartStage.ConfiguringGateway,
                    "Configuring HTTP gateway and adding peers...");

                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Starting HTTP Gateway junction {junctionId}");

                var targetDevices = new List<Model_Device>();
                foreach (var link in junction.TargetLinks)
                {
                    var device = await deviceDb.GetDeviceByIdAsync(link.DeviceId);
                    if (device != null)
                    {
                        targetDevices.Add(device);
                    }
                }

                var currentGatewayDestination = await GetCurrentGatewayDestination(junction, deviceDb);

                if (!string.IsNullOrEmpty(currentGatewayDestination) && targetDevices.Any())
                {
                    var peersAdded = await AddPeersToGatewayAsync(currentGatewayDestination, targetDevices);

                    if (!peersAdded)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Some peers failed to be added to HTTP gateway, continuing anyway...");
                    }
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ HTTP Gateway junction has no valid gateway destination or target devices specified");
                }
            }
            else if (junction.Type.Equals("Gateway Junction (COM to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
            {
                // STAGE 5: Configuring Gateway (only for Gateway junctions)
                await progressBroadcaster.EmitJunctionProgressAsync(
                    junctionId,
                    junction.Name,
                    operationId,
                    JunctionStartStage.ConfiguringGateway,
                    "Configuring COM gateway and adding peers...");

                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Starting COM Gateway junction {junctionId}");

                var targetDevices = new List<Model_Device>();
                foreach (var link in junction.TargetLinks)
                {
                    var device = await deviceDb.GetDeviceByIdAsync(link.DeviceId);
                    if (device != null)
                    {
                        targetDevices.Add(device);
                    }
                }

                var currentGatewayDestination = await GetCurrentGatewayDestination(junction, deviceDb);

                if (!string.IsNullOrEmpty(currentGatewayDestination) && targetDevices.Any())
                {
                    var peersAdded = await AddPeersToCOMGatewayAsync(currentGatewayDestination, targetDevices);

                    if (!peersAdded)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Some peers failed to be added to COM gateway, continuing anyway...");
                    }
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ COM Gateway junction has no valid gateway destination or target devices specified");
                }
            }
            else if (junction.Type.Equals("Gateway Junction (WebSocket to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
            {
                // STAGE 5: Configuring Gateway (only for Gateway junctions)
                await progressBroadcaster.EmitJunctionProgressAsync(
                    junctionId,
                    junction.Name,
                    operationId,
                    JunctionStartStage.ConfiguringGateway,
                    "Configuring WebSocket gateway and adding peers...");

                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Starting WebSocket Gateway junction {junctionId}");

                var targetDevices = new List<Model_Device>();
                foreach (var link in junction.TargetLinks)
                {
                    var device = await deviceDb.GetDeviceByIdAsync(link.DeviceId);
                    if (device != null)
                    {
                        targetDevices.Add(device);
                    }
                }

                var currentGatewayDestination = await GetCurrentGatewayDestination(junction, deviceDb);

                if (!string.IsNullOrEmpty(currentGatewayDestination) && targetDevices.Any())
                {
                    var peersAdded = await AddPeersToWebSocketGatewayAsync(currentGatewayDestination, targetDevices);

                    if (!peersAdded)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Some peers failed to be added to WebSocket gateway, continuing anyway...");
                    }
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ WebSocket Gateway junction has no valid gateway destination or target devices specified");
                }

                // Minimum display time for stage visibility
                await Task.Delay(500, cancellationToken);
            }

            // STAGE 6: Starting Streams
            await progressBroadcaster.EmitJunctionProgressAsync(
                junctionId,
                junction.Name,
                operationId,
                JunctionStartStage.StartingStreams,
                $"Initializing stream manager for {junction.TargetLinks.Count} target device(s)...");

            switch (junction.Type)
            {
                case "Virtual Junction":
                    var virtualMgr = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_Virtual>();
                    await HandleStreamingForJunctionType(virtualMgr, junction, deviceDb, selectedSensorsCopy);
                    break;

                case "MQTT Junction":
                    var mqtt = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_MQTT>();
                    await HandleStreamingForJunctionType(mqtt, junction, deviceDb, selectedSensorsCopy);
                    break;

                case "COM Junction":
                    var com = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_COM>();
                    await HandleStreamingForJunctionType(com, junction, deviceDb, selectedSensorsCopy);
                    break;

                case "WebSocket Junction":
                    var webSocket = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_WebSocket>();
                    await HandleStreamingForJunctionType(webSocket, junction, deviceDb, selectedSensorsCopy);
                    break;

                case "Gateway Junction (COM to ESP:NOW)":
                    var comGatewayStream = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_COM>();
                    await HandleStreamingForJunctionType(comGatewayStream, junction, deviceDb, selectedSensorsCopy);
                    break;

                case "Gateway Junction (HTTP to ESP:NOW)":
                    var httpGatewayStream = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_HTTP>();
                    await HandleStreamingForJunctionType(httpGatewayStream, junction, deviceDb, selectedSensorsCopy);
                    break;

                case "Gateway Junction (WebSocket to ESP:NOW)":
                    var webSocketGatewayStream = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_WebSocket>();
                    await HandleStreamingForJunctionType(webSocketGatewayStream, junction, deviceDb, selectedSensorsCopy);
                    break;

                default:
                    var http = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_HTTP>();
                    await HandleStreamingForJunctionType(http, junction, deviceDb, selectedSensorsCopy);
                    break;
            }

            // Minimum display time for stage visibility
            await Task.Delay(500, cancellationToken);

            _startedJunctions[junctionId] = junction;
            junction.Status = "Running";

            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Junction {junctionId} ({junction.Name}) started successfully");

            // STAGE 7: Complete
            await progressBroadcaster.EmitJunctionProgressAsync(
                junctionId,
                junction.Name,
                operationId,
                JunctionStartStage.Complete,
                $"Junction '{junction.Name}' started successfully",
                isComplete: true);

                return Model_Operation_Result.Ok("Junction started.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Error starting junction {junctionId}: {ex.Message}");

                await progressBroadcaster.EmitJunctionProgressAsync(
                    junctionId,
                    junctionName,
                    operationId,
                    JunctionStartStage.Complete,
                    $"Failed to start junction: {ex.Message}",
                    isComplete: true,
                    hasError: true,
                    errorMessage: ex.Message);

                return Model_Operation_Result.Fail($"Failed to start junction: {ex.Message}");
            }
        }

        private async Task HandleStreamingForJunctionType(
            dynamic streamManager,
            Model_Junction junction,
            Service_Database_Manager_Devices deviceDb,
            List<Model_Sensor> selectedSensorsCopy)
        {
            var junctionLinkDb = _scopeFactory.CreateScope().ServiceProvider
                .GetRequiredService<Service_Database_Manager_JunctionLinks>();

            var renderMode = junction.RenderingMode;
            bool isPayloadMode = renderMode == RenderModes.Payload;
            bool isBlitMode = renderMode == RenderModes.Blit;
            bool isCompositeMode = renderMode == RenderModes.Composite;
            bool isStreamingMode = renderMode == RenderModes.Streaming;
            bool isAnyFrameMode = junction.IsFrameMode;

            string modeDescription = renderMode switch
            {
                RenderModes.Payload => "Data Payloads",
                RenderModes.Blit => "Pre-rendered Frames (Blit)",
                RenderModes.Composite => "Frame Assembly (Composite)",
                RenderModes.Streaming => "Frame Streaming (MJPEG)",
                _ => $"Unknown mode ({renderMode})"
            };

            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Junction {junction.Id} ({junction.Name}) is using {modeDescription} rendering");

            Service_Stream_Manager_Virtual? virtualMgr = null;
            if (isBlitMode || isStreamingMode)
            {
                virtualMgr = _scopeFactory.CreateScope().ServiceProvider
                    .GetRequiredService<Service_Stream_Manager_Virtual>();
            }

            bool isGatewayJunction = junction.Type.Contains("Gateway Junction", StringComparison.OrdinalIgnoreCase);
            string? gatewayDestination = null;
            string? junctionTypeForGateway = null;

            if (isGatewayJunction)
            {
                gatewayDestination = await GetCurrentGatewayDestination(junction, deviceDb);
                junctionTypeForGateway = junction.Type;
            }

            foreach (var link in junction.TargetLinks)
            {
                var device = await deviceDb.GetDeviceByIdAsync(link.DeviceId);
                if (device == null) continue;

                int defaultSendRate = device.SendRate ?? 5000;
                if (link.SendRateOverride.HasValue && link.SendRateOverride.Value > 0 && link.SendRateOverride.Value < defaultSendRate)
                    defaultSendRate = link.SendRateOverride.Value;

                var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByLinkIdAsync(link.Id);
                var overrideDict = screenLayoutOverrides.ToDictionary(o => o.DeviceScreenId);

                var screens = junction.DeviceScreens
                    .Where(screen => screen.DeviceId == device.Id && screen.SupportsConfigPayloads)
                    .ToList();

                foreach (var screen in screens)
                {
                    if (overrideDict.TryGetValue(screen.Id, out var screenOverride))
                    {
                        if (!string.IsNullOrEmpty(screenOverride.ScreenLayoutId?.ToString()))
                        {
                            screen.ScreenLayoutId = screenOverride.ScreenLayoutId;
                            // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Using screen layout override (ID: {screenOverride.ScreenLayoutId}) for Device {device.Name} Screen {screen.DisplayName}");
                        }

                        // if (isAnyFrameMode && screenOverride.FrameLayoutId.HasValue)
                        // {
                        //     string frameType = isBlitMode ? "Blit" : "Composite";
                        //     Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Using frame layout override (ID: {screenOverride.FrameLayoutId}) for {frameType} mode on Device {device.Name} Screen {screen.DisplayName}");
                        // }
                    }

                    var assignedSensors = junction.JunctionSensorTargets
                        .Where(jst => jst.ScreenId == screen.Id)
                        .SelectMany(jst => selectedSensorsCopy.Where(s => s.Id == jst.SensorId))
                        .ToList();

                    if (!assignedSensors.Any())
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ No sensors assigned to Device {device.Name} Screen {screen.DisplayName} - skipping stream");
                        continue;
                    }

                    var screenKey = $"device_{device.Id}_screen_{screen.Id}";

                    Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Streaming for Device {device.Name} (ID: {device.Id}) Screen {screen.Id} ({screen.DisplayName}) with {assignedSensors.Count} assigned sensors using {modeDescription} and send rate of {defaultSendRate}ms. LinkId: {link.Id}");

                    // if (isGatewayJunction && gatewayDestination != null)
                    // {
                    //     Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Current gateway destination for {screenKey}: {gatewayDestination}");
                    // }

                    if ((isBlitMode || isStreamingMode) && virtualMgr != null)
                    {
                        try
                        {
                            var virtualScreenInfo = await virtualMgr.CreateBlitModeVirtualScreenAsync(
                                device,
                                screen,
                                junction.Id,
                                link.Id,
                                defaultSendRate,
                                assignedSensors,
                                isStreamingMode);

                            if (virtualScreenInfo.HasValue)
                            {
                                var modeLabel = isStreamingMode ? "streaming mode" : "blit mode";
                                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Created virtual screen for {modeLabel}: {device.Name} -> {virtualScreenInfo.Value.virtualScreenUrl} (LinkId: {link.Id})");

                                if (isStreamingMode)
                                {
                                    Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] MJPEG stream available at: /api/junctions/{junction.Id}/stream");
                                }

                                // Register blit session for resource monitoring (used by both Blit and Streaming modes)
                                var sessionId = $"J{junction.Id}_D{device.Id}_S{screen.Id}_L{link.Id}";
                                var junctionId = $"J{junction.Id}";
                                var protocolType = junction.Type; // COM, HTTP, WebSocket, etc.
                                _blitResourceMonitor.RegisterBlitSession(sessionId, junctionId, device.Name, protocolType);
                            }
                            else
                            {
                                var modeLabel = isStreamingMode ? "streaming mode" : "blit mode";
                                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Failed to create virtual screen for {modeLabel}: {device.Name} Screen {screen.DisplayName}");
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Error creating virtual screen for blit mode: {device.Name} Screen {screen.DisplayName} - {ex.Message}");
                        }
                    }

                    await streamManager.StartStreamingAsync(
                        junction.Id,
                        device.Id,
                        defaultSendRate,
                        screenKey,
                        assignedSensors,
                        screen,
                        junctionTypeForGateway,
                        gatewayDestination,
                        link.Id);

                    await Task.Delay(100);
                }
            }
        }

        private async Task<string?> GetCurrentGatewayDestination(Model_Junction junction, Service_Database_Manager_Devices deviceDb)
        {
            if (!junction.GatewayDeviceId.HasValue)
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Gateway junction {junction.Id} has no GatewayDeviceId specified");
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
                // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Using COM port '{destination}' from gateway device '{gatewayDevice.Name}' (ID: {gatewayDevice.Id})");
            }
            else if (junction.Type.Equals("Gateway Junction (HTTP to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
            {
                destination = gatewayDevice.IPAddress;
                // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Using IP address '{destination}' from gateway device '{gatewayDevice.Name}' (ID: {gatewayDevice.Id})");
            }
            else if (junction.Type.Equals("Gateway Junction (WebSocket to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
            {
                destination = gatewayDevice.UniqueIdentifier;
                // Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Using MAC address '{destination}' from gateway device '{gatewayDevice.Name}' (ID: {gatewayDevice.Id})");
            }
            else
            {
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Unknown gateway junction type: {junction.Type}");
            }

            if (string.IsNullOrEmpty(destination))
            {
                string destinationType = junction.Type switch
                {
                    var t when t.Contains("COM") => "COM port",
                    var t when t.Contains("HTTP") => "IP address",
                    var t when t.Contains("WebSocket") => "MAC address",
                    _ => "destination"
                };
                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] ❌ Gateway device '{gatewayDevice.Name}' has no {destinationType} configured");
            }

            return destination;
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
                case "Virtual Junction":
                    streamManager = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_Virtual>();
                    break;

                case "MQTT Junction":
                    streamManager = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_MQTT>();
                    break;

                case "COM Junction":
                case "Gateway Junction (COM to ESP:NOW)":
                    streamManager = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_COM>();
                    break;

                case "WebSocket Junction":
                case "Gateway Junction (WebSocket to ESP:NOW)":
                    streamManager = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_WebSocket>();
                    break;

                default:
                    streamManager = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_HTTP>();
                    break;
            }

            if (cancellationToken.IsCancellationRequested)
                return Model_Operation_Result.Fail("Stop operation was cancelled.");

            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Stopping Junction {junctionId} (Type: {junction.Type})");

            foreach (var link in junction.SourceLinks)
                _pollingManager.UnregisterJunctionSource($"Device-{link.DeviceId}", junctionId);
            foreach (var link in junction.SourceCollectorLinks)
                _pollingManager.UnregisterJunctionSource($"Collector-{link.CollectorId}", junctionId);

            if (junction.RenderingMode == RenderModes.Blit)
            {
                var virtualMgr = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_Virtual>();

                foreach (var link in junction.TargetLinks)
                {
                    var device = await deviceDb.GetDeviceByIdAsync(link.DeviceId);
                    if (device != null)
                    {
                        var deviceScreens = junction.DeviceScreens.Where(screen => screen.DeviceId == device.Id);
                        foreach (var screen in deviceScreens)
                        {
                            await virtualMgr.StopBlitModeVirtualScreen(screen.Id);

                            // Unregister blit session from resource monitoring
                            var sessionId = $"J{junction.Id}_D{device.Id}_S{screen.Id}_L{link.Id}";
                            _blitResourceMonitor.UnregisterBlitSession(sessionId);
                        }
                    }
                }

                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Cleaned up virtual screens for blit mode junction {junctionId}");
            }
            else if (junction.RenderingMode == RenderModes.Streaming)
            {
                var virtualMgr = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_Virtual>();

                foreach (var link in junction.TargetLinks)
                {
                    var device = await deviceDb.GetDeviceByIdAsync(link.DeviceId);
                    if (device != null)
                    {
                        var deviceScreens = junction.DeviceScreens.Where(screen => screen.DeviceId == device.Id);
                        foreach (var screen in deviceScreens)
                        {
                            // Stop virtual screen (this closes the Node.js CDP subprocess)
                            await virtualMgr.StopBlitModeVirtualScreen(screen.Id);

                            // Unregister streaming session from resource monitoring
                            var sessionId = $"J{junction.Id}_D{device.Id}_S{screen.Id}_L{link.Id}";
                            _blitResourceMonitor.UnregisterBlitSession(sessionId);
                        }
                    }
                }

                Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Cleaned up virtual screens and CDP subprocesses for streaming mode junction {junctionId}");
            }

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

            // Remove junction-to-sensor mappings when junction stops
            _junctionSensorMappings.TryRemove(junctionId, out _);

            Console.WriteLine($"[SERVICE_MANAGER_CONNECTIONS] Junction {junctionId} stopped successfully");

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

        public void Dispose()
        {
            // Junctions are stopped in ApplicationStopping handler before IServiceProvider is disposed
            // This just cleans up the timer
            _cleanupTimer?.Dispose();
        }
    }
}