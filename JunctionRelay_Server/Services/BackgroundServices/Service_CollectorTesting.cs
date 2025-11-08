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

using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using JunctionRelayServer.Utils;
using static JunctionRelayServer.Services.Service_Notifications;

namespace JunctionRelayServer.Services.BackgroundServices
{
    /// <summary>
    /// Background service that periodically tests collector connections
    /// </summary>
    public class Service_CollectorTesting : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<Service_CollectorTesting> _logger;
        private readonly StartupSignals _startupSignals;
        private bool _enabled = false;
        private int _frequencyHours = 6;
        private Timer? _testTimer;
        private readonly SemaphoreSlim _testLock = new SemaphoreSlim(1, 1);

        public Service_CollectorTesting(
            IServiceProvider serviceProvider,
            ILogger<Service_CollectorTesting> logger,
            StartupSignals startupSignals)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _startupSignals = startupSignals;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                Console.WriteLine("[COLLECTOR TESTING] 🚀 Service initializing...");

                // Wait for database to be initialized
                await _startupSignals.DatabaseInitialized.Task;
                Console.WriteLine("[COLLECTOR TESTING] ✅ Database initialization confirmed");

                // Load settings
                await LoadSettingsAsync();

                // ALWAYS test all collectors on startup (regardless of auto-testing setting)
                Console.WriteLine("[COLLECTOR TESTING] 🔍 Testing all collectors on startup...");
                await TestAllCollectorsAsync();
                Console.WriteLine("[COLLECTOR TESTING] ✅ Startup testing complete");

                // Signal that collector testing is complete
                _startupSignals.CollectorTestingComplete.TrySetResult(true);

                // Continue with periodic testing loop if enabled
                while (!stoppingToken.IsCancellationRequested)
                {
                    try
                    {
                        // Reload settings in case they changed
                        await LoadSettingsAsync();

                        if (_enabled)
                        {
                            Console.WriteLine($"[COLLECTOR TESTING] ⏰ Periodic testing enabled, frequency: {_frequencyHours} hours");

                            // Schedule periodic testing
                            var interval = TimeSpan.FromHours(_frequencyHours);
                            Console.WriteLine($"[COLLECTOR TESTING] 💤 Next test in {_frequencyHours} hours");

                            await Task.Delay(interval, stoppingToken);

                            Console.WriteLine("[COLLECTOR TESTING] 🔍 Running periodic test...");
                            await TestAllCollectorsAsync();
                            Console.WriteLine("[COLLECTOR TESTING] ✅ Periodic test complete");
                        }
                        else
                        {
                            Console.WriteLine("[COLLECTOR TESTING] ⏸️ Periodic testing disabled");
                            // Wait a bit before checking settings again
                            await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        // Normal shutdown
                        break;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "[COLLECTOR TESTING] Error in testing loop");
                        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
                    }
                }

                Console.WriteLine("[COLLECTOR TESTING] 🛑 Service stopped");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[COLLECTOR TESTING] ❌ Fatal error: {ex.Message}");
                _startupSignals.CollectorTestingComplete.TrySetException(ex);
                throw;
            }
        }

        /// <summary>
        /// Load testing settings from database
        /// </summary>
        private async Task LoadSettingsAsync()
        {
            using var scope = _serviceProvider.CreateScope();
            var settingsService = scope.ServiceProvider.GetRequiredService<IService_Settings>();

            _enabled = await settingsService.GetBoolSettingAsync("collector_testing_enabled", false);
            _frequencyHours = await settingsService.GetIntSettingAsync("collector_testing_frequency", 6);
        }

        /// <summary>
        /// Test all collectors
        /// </summary>
        public async Task TestAllCollectorsAsync()
        {
            await _testLock.WaitAsync();
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var collectorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Collectors>();
                var dataCollectorFactory = scope.ServiceProvider.GetRequiredService<Func<Model_Collector, IDataCollector>>();
                var notificationService = scope.ServiceProvider.GetRequiredService<Service_Notifications>();

                var collectors = await collectorDb.GetAllCollectorsAsync();

                if (collectors.Count == 0)
                {
                    // Console.WriteLine("[COLLECTOR TESTING] ℹ️ No collectors to test");
                    return;
                }

                // Console.WriteLine($"[COLLECTOR TESTING] 📊 Testing {collectors.Count} collector(s)...");

                // Create start notification
                await notificationService.CreateNotificationAsync(
                    message: $"Testing {collectors.Count} collector{(collectors.Count != 1 ? "s" : "")}...",
                    title: "Collector Testing Started",
                    type: NotificationType.Info,
                    category: NotificationCategory.System,
                    duration: 3000
                );

                var tasks = collectors.Select(collector => TestCollectorAsync(collector, dataCollectorFactory, collectorDb));
                await Task.WhenAll(tasks);

                var testedCount = collectors.Count(c => c.Status == "Tested");
                var errorCount = collectors.Count(c => c.Status == "Error");
                // Console.WriteLine($"[COLLECTOR TESTING] 📈 Results: {testedCount} passed, {errorCount} failed");

                // Create completion notification
                var completionType = errorCount > 0 ? NotificationType.Warning : NotificationType.Success;
                var completionMessage = errorCount > 0
                    ? $"{testedCount} passed, {errorCount} failed"
                    : $"All {testedCount} collector{(testedCount != 1 ? "s" : "")} passed";

                await notificationService.CreateNotificationAsync(
                    message: completionMessage,
                    title: "Collector Testing Complete",
                    type: completionType,
                    category: NotificationCategory.System,
                    duration: 5000
                );
            }
            finally
            {
                _testLock.Release();
            }
        }

        /// <summary>
        /// Test a single collector
        /// </summary>
        private async Task TestCollectorAsync(
            Model_Collector collector,
            Func<Model_Collector, IDataCollector> dataCollectorFactory,
            Service_Database_Manager_Collectors collectorDb)
        {
            string? errorMessage = null;

            try
            {
                // Console.WriteLine($"[COLLECTOR TESTING] 🔍 Testing '{collector.Name}' ({collector.CollectorType})...");

                var dataCollector = dataCollectorFactory(collector);
                dataCollector.ApplyConfiguration(collector);

                // Special handling for collectors that don't have a traditional API
                var skipConnectionTest = collector.CollectorType == "LibreHardwareMonitor" ||
                                        collector.CollectorType == "HWiNFO" ||
                                        collector.CollectorType == "Host" ||
                                        collector.CollectorType == "EventEngine" ||
                                        collector.CollectorType == "RateTester" ||
                                        collector.CollectorType == "SystemTime" ||
                                        collector.CollectorType == "InternetTime";

                bool testSuccessful;
                List<Model_Sensor>? sensors = null;

                if (skipConnectionTest)
                {
                    // For non-API collectors, just try to fetch sensors directly
                    sensors = await dataCollector.FetchSensorsAsync(collector);
                    testSuccessful = sensors != null && sensors.Count > 0;

                    if (!testSuccessful)
                    {
                        errorMessage = sensors == null ? "Failed to fetch sensors" : "No sensors found";
                    }
                }
                else
                {
                    // For API-based collectors, test connection first, then fetch sensors
                    var connectionOk = await dataCollector.TestConnectionAsync(collector);

                    if (!connectionOk)
                    {
                        testSuccessful = false;
                        errorMessage = "Connection test failed";
                    }
                    else
                    {
                        // Connection OK, now try to fetch sensors
                        sensors = await dataCollector.FetchSensorsAsync(collector);
                        testSuccessful = sensors != null && sensors.Count > 0;

                        if (!testSuccessful)
                        {
                            errorMessage = sensors == null ? "Connected but failed to fetch sensors" : "Connected but no sensors found";
                        }
                    }
                }

                // Update collector status
                var newStatus = testSuccessful ? "Tested" : "Error";
                collector.Status = newStatus;

                // Clear error message on success
                if (testSuccessful)
                {
                    errorMessage = "";
                    // Console.WriteLine($"[COLLECTOR TESTING] ✅ '{collector.Name}' passed - {sensors!.Count} sensors found");
                }

                await collectorDb.UpdateLastTestedAsync(collector.Id, DateTime.UtcNow);
                await collectorDb.UpdateCollectorStatusAsync(collector.Id, newStatus);

                // Update error message (clear it if successful, set it if failed)
                await collectorDb.UpdateLastFetchInfoAsync(
                    collector.Id,
                    DateTime.UtcNow,
                    0, // totalSensors (not relevant for test)
                    0, // newSensors
                    testSuccessful,
                    errorMessage,
                    0  // lostSensors
                );

                // var emoji = testSuccessful ? "✅" : "❌";
                // Console.WriteLine($"[COLLECTOR TESTING] {emoji} '{collector.Name}': {newStatus}");
            }
            catch (Exception ex)
            {
                errorMessage = ex.Message;
                Console.WriteLine($"[COLLECTOR TESTING] ❌ Error testing '{collector.Name}': {ex.Message}");

                // Update status to Error and save error message
                try
                {
                    await collectorDb.UpdateLastTestedAsync(collector.Id, DateTime.UtcNow);
                    await collectorDb.UpdateCollectorStatusAsync(collector.Id, "Error");

                    // Save the error message
                    await collectorDb.UpdateLastFetchInfoAsync(
                        collector.Id,
                        DateTime.UtcNow,
                        0, // totalSensors
                        0, // newSensors
                        false, // fetchSuccessful
                        errorMessage,
                        0  // lostSensors
                    );
                }
                catch (Exception updateEx)
                {
                    Console.WriteLine($"[COLLECTOR TESTING] ⚠️ Failed to update error status for collector {collector.Id}: {updateEx.Message}");
                }
            }
        }

        public override void Dispose()
        {
            _testTimer?.Dispose();
            _testLock.Dispose();
            base.Dispose();
        }
    }
}
