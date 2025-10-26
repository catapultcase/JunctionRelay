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
using JunctionRelayServer.Services.FactoryServices;
using JunctionRelayServer.Utils;
using JunctionRelayServer.Services.BackgroundServices;
using System.Collections.Concurrent;
using System.Data;
using Dapper;

namespace JunctionRelayServer.Services
{
    public class Service_Startup : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly StartupSignals _startupSignals;
        private readonly ConcurrentDictionary<int, IService> _activeServices = new();
        private Service_CloudBackup_Scheduler? _backupScheduler;

        public Service_Startup(
            IServiceProvider serviceProvider,
            StartupSignals startupSignals)
        {
            _serviceProvider = serviceProvider;
            _startupSignals = startupSignals;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                Console.WriteLine("[STARTUP] 🚀 Service_Startup initializing...");

                // Wait for database to be initialized
                await _startupSignals.DatabaseInitialized.Task;
                Console.WriteLine("[STARTUP] ✅ Database initialization confirmed");

                // Update collector states on startup
                using (var dbScope = _serviceProvider.CreateScope())
                {
                    var db = dbScope.ServiceProvider.GetRequiredService<IDbConnection>();

                    // Re-lock collectors with external access tokens
                    var reLockedCount = db.Execute("UPDATE Collectors SET SecurityStatus = 'Locked' WHERE ExternalAccessToken = 1 AND SecurityStatus != 'Locked'");
                    if (reLockedCount > 0)
                    {
                        Console.WriteLine($"[STARTUP] 🔒 Re-locked {reLockedCount} collector(s) with external access tokens");
                    }

                    // Update EventEngine collectors to always show "Active" status
                    var eventEngineCount = db.Execute("UPDATE Collectors SET Status = 'Active' WHERE CollectorType = 'EventEngine' AND Status != 'Active'");
                    if (eventEngineCount > 0)
                    {
                        Console.WriteLine($"[STARTUP] ✅ Updated {eventEngineCount} EventEngine collector(s) to Active status");
                    }
                }

                // Wait for event engine to be initialized
                await _startupSignals.EventEngineInitialized.Task;
                Console.WriteLine("[STARTUP] ✅ Event engine initialization confirmed");

                // Wait for collector testing to complete BEFORE starting services/junctions
                await _startupSignals.CollectorTestingComplete.Task;
                Console.WriteLine("[STARTUP] ✅ Collector testing confirmed");

                // Start services and junctions
                await StartActiveServicesAsync();

                // Check if junction autostart is enabled
                using var scope = _serviceProvider.CreateScope();
                var settingsService = scope.ServiceProvider.GetRequiredService<IService_Settings>();
                var autostartEnabled = await settingsService.GetBoolSettingAsync("junction_autostart_enabled", true);

                if (autostartEnabled)
                {
                    await StartAutoStartJunctionsAsync();
                }
                else
                {
                    Console.WriteLine("[STARTUP] ⏸️ Junction autostart is disabled - skipping auto-start junctions");
                }

                // Start cloud backup scheduler
                _backupScheduler = scope.ServiceProvider.GetRequiredService<Service_CloudBackup_Scheduler>();
                _ = _backupScheduler.StartAsync(stoppingToken); // Fire and forget

                Console.WriteLine("[STARTUP] ✅ Service_Startup initialization complete");

                // Keep the service running
                while (!stoppingToken.IsCancellationRequested)
                {
                    await Task.Delay(60000, stoppingToken); // Wait 1 minute
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STARTUP] ❌ Fatal error in Service_Startup: {ex.Message}");
                throw;
            }
        }

        private async Task StartActiveServicesAsync()
        {
            try
            {
                Console.WriteLine("[STARTUP] 🔧 Loading active services from database...");

                using var scope = _serviceProvider.CreateScope();
                var serviceManager = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Services>();
                var serviceFactory = scope.ServiceProvider.GetRequiredService<Func<Type, Model_Service, IService>>();

                var services = await serviceManager.GetAllServicesAsync();
                var activeServices = services.Where(s => s.Status == "Active").ToList();

                Console.WriteLine($"[STARTUP] 📋 Found {activeServices.Count} active services to load");

                foreach (var service in activeServices)
                {
                    try
                    {
                        Console.WriteLine($"[STARTUP] 🔌 Loading service: {service.Name} (Type: {service.Type})");

                        // Determine service type
                        Type serviceType = service.Type switch
                        {
                            "MQTT Broker" => typeof(Service_MQTT),
                            "HomeAssistant" => typeof(Service_HomeAssistant),
                            "Grafana" => typeof(Service_Grafana),
                            _ => null
                        };

                        if (serviceType == null)
                        {
                            Console.WriteLine($"[STARTUP] ⚠️ Unknown service type '{service.Type}' for service '{service.Name}' - skipping");
                            continue;
                        }

                        // Create and initialize service instance
                        var serviceInstance = serviceFactory(serviceType, service);
                        await serviceInstance.ConnectAsync();

                        // Store for lifecycle management
                        _activeServices[service.Id] = serviceInstance;

                        Console.WriteLine($"[STARTUP] ✅ Successfully loaded service: {service.Name}");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[STARTUP] ❌ Failed to load service '{service.Name}': {ex.Message}");
                    }
                }

                Console.WriteLine($"[STARTUP] 🎯 Successfully loaded {_activeServices.Count} services");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STARTUP] ❌ Error loading services: {ex.Message}");
            }
        }

        private async Task StartAutoStartJunctionsAsync()
        {
            try
            {
                Console.WriteLine("[STARTUP] 🔗 Starting auto-start junctions...");

                using var scope = _serviceProvider.CreateScope();
                var junctionManager = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();
                var connectionManager = scope.ServiceProvider.GetRequiredService<Service_Manager_Connections>();
                var settingsService = scope.ServiceProvider.GetRequiredService<IService_Settings>();

                // Get startup mode setting
                var startupModeParallel = await settingsService.GetBoolSettingAsync("junction_autostart_parallel", true);

                var junctions = await junctionManager.GetAllJunctionsAsync();
                var autoStartJunctions = junctions.Where(j => j.AutoStartOnLaunch).ToList();

                Console.WriteLine($"[STARTUP] 📋 Found {autoStartJunctions.Count} junctions set to auto-start");
                Console.WriteLine($"[STARTUP] 🔧 Startup mode: {(startupModeParallel ? "Parallel" : "Sequential")}");

                if (autoStartJunctions.Count == 0)
                {
                    Console.WriteLine("[STARTUP] ✅ No auto-start junctions found - startup complete");
                    return;
                }

                if (startupModeParallel)
                {
                    await StartJunctionsInParallelAsync(autoStartJunctions, connectionManager, CancellationToken.None);
                }
                else
                {
                    await StartJunctionsSequentiallyAsync(autoStartJunctions, connectionManager, CancellationToken.None);
                }

                Console.WriteLine($"[STARTUP] 🎯 Auto-start processing complete for {autoStartJunctions.Count} junctions");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STARTUP] ❌ Error starting auto-start junctions: {ex.Message}");
            }
        }

        private async Task StartJunctionsInParallelAsync(List<Model_Junction> junctions, Service_Manager_Connections connectionManager, CancellationToken cancellationToken)
        {
            Console.WriteLine("[STARTUP] 🚀 Starting junctions in parallel...");

            var startupTasks = junctions.Select(async junction =>
            {
                try
                {
                    Console.WriteLine($"[STARTUP] 🔗 Starting junction: {junction.Name} (ID: {junction.Id})");

                    var result = await connectionManager.StartJunctionAsync(junction.Id, cancellationToken);

                    if (result.Success)
                    {
                        Console.WriteLine($"[STARTUP] ✅ Junction '{junction.Name}' started successfully");
                    }
                    else
                    {
                        Console.WriteLine($"[STARTUP] ❌ Junction '{junction.Name}' failed to start: {result.Message}");
                    }

                    return (Junction: junction, Result: result);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[STARTUP] ❌ Exception starting junction '{junction.Name}': {ex.Message}");
                    return (Junction: junction, Result: (dynamic)new { Success = false, Message = ex.Message });
                }
            }).ToArray();

            var results = await Task.WhenAll(startupTasks);

            var successCount = results.Count(r => r.Result.Success);
            var failureCount = results.Length - successCount;

            Console.WriteLine($"[STARTUP] 📊 Parallel startup results: {successCount} successful, {failureCount} failed");
        }

        private async Task StartJunctionsSequentiallyAsync(List<Model_Junction> junctions, Service_Manager_Connections connectionManager, CancellationToken cancellationToken)
        {
            Console.WriteLine("[STARTUP] 🔗 Starting junctions sequentially...");

            int successCount = 0;
            int failureCount = 0;

            foreach (var junction in junctions)
            {
                try
                {
                    Console.WriteLine($"[STARTUP] 🔗 Starting junction: {junction.Name} (ID: {junction.Id})");

                    var result = await connectionManager.StartJunctionAsync(junction.Id, cancellationToken);

                    if (result.Success)
                    {
                        Console.WriteLine($"[STARTUP] ✅ Junction '{junction.Name}' started successfully");
                        successCount++;
                    }
                    else
                    {
                        Console.WriteLine($"[STARTUP] ❌ Junction '{junction.Name}' failed to start: {result.Message}");
                        failureCount++;
                    }

                    // Small delay between sequential starts to avoid overwhelming the system
                    await Task.Delay(500, cancellationToken);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[STARTUP] ❌ Exception starting junction '{junction.Name}': {ex.Message}");
                    failureCount++;
                }
            }

            Console.WriteLine($"[STARTUP] 📊 Sequential startup results: {successCount} successful, {failureCount} failed");
        }

        public override async Task StopAsync(CancellationToken cancellationToken)
        {
            Console.WriteLine("[STARTUP] 🛑 Service_Startup shutting down...");

            // Stop cloud backup scheduler
            if (_backupScheduler != null)
            {
                await _backupScheduler.StopAsync(cancellationToken);
            }

            // Gracefully disconnect all services
            foreach (var kvp in _activeServices)
            {
                try
                {
                    if (kvp.Value is IDisposable disposable)
                    {
                        disposable.Dispose();
                    }
                    Console.WriteLine($"[STARTUP] ✅ Disconnected service {kvp.Key}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[STARTUP] ⚠️ Error disconnecting service {kvp.Key}: {ex.Message}");
                }
            }

            _activeServices.Clear();
            Console.WriteLine("[STARTUP] ✅ Service_Startup shutdown complete");

            await base.StopAsync(cancellationToken);
        }
    }
}