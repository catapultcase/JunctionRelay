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

using System;
using System.Collections.Concurrent;
using System.Text;
using System.IO;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using JunctionRelayServer.Models;
using JunctionRelayServer.Utils;
using JunctionRelayServer.Interfaces;
using Renci.SshNet;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_SSH : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ISecretsService _secretsService;
        private readonly ConcurrentDictionary<string, DeviceSshConnection> _sshConnections = new();
        private readonly int _connectionTimeoutMs = 10000;
        private readonly int _healthCheckTimeoutMs = 5000;
        private readonly int _reconnectIntervalMs = 30000;
        private readonly int _maxIdleTimeMs = 300000; // 5 minutes

        public Service_Manager_SSH(IServiceScopeFactory scopeFactory, ISecretsService secretsService)
        {
            _scopeFactory = scopeFactory;
            _secretsService = secretsService;
            Console.WriteLine("[SSH Service] Service initialized for SSH connection management");
        }

        // SSH connection tracking
        private class DeviceSshConnection
        {
            public SshClient? SshClient { get; set; }
            public string DeviceId { get; set; } = string.Empty;
            public string DeviceName { get; set; } = string.Empty;
            public string? IPAddress { get; set; }
            public string? Username { get; set; }
            public int Port { get; set; } = 22;
            public DateTime ConnectedAt { get; set; }
            public DateTime LastUsed { get; set; }
            public bool IsConnected { get; set; } = false;
            public int ReconnectAttempts { get; set; } = 0;
            public DateTime LastReconnectAttempt { get; set; } = DateTime.MinValue;
            public Exception? LastError { get; set; }

            // Authentication details
            public bool UseKeyAuth { get; set; } = false;
            public string? EncryptedPrivateKey { get; set; }
            public string? EncryptedPassword { get; set; }

            // Health check tracking
            public volatile bool LastHealthCheckSuccess = false;
            public DateTime LastHealthCheckSent = DateTime.MinValue;
            public int ConsecutiveFailures { get; set; } = 0;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            Console.WriteLine("[SSH Service] Service started");

            // Wait for database initialization
            using (var initScope = _scopeFactory.CreateScope())
            {
                var startupSignals = initScope.ServiceProvider.GetRequiredService<StartupSignals>();
                await startupSignals.DatabaseInitialized.Task;
            }

            // Main service loop
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await DiscoverAndConnectToDevicesAsync(stoppingToken);
                    await ManageExistingConnectionsAsync(stoppingToken);
                    await CleanupIdleConnectionsAsync();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SSH Service] ❌ Service loop error: {ex.Message}");
                }

                await Task.Delay(_reconnectIntervalMs, stoppingToken);
            }

            Console.WriteLine("[SSH Service] Service stopping...");
            await DisconnectAllDevicesAsync();
        }

        private async Task DiscoverAndConnectToDevicesAsync(CancellationToken stoppingToken)
        {
            using var scope = _scopeFactory.CreateScope();
            var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();

            try
            {
                var devices = await deviceDb.GetAllDevicesAsync();
                var sshDevices = devices.Where(d =>
                    d.HeartbeatEnabled &&
                    d.HeartbeatProtocol?.ToUpper() == "SSH" &&
                    !string.IsNullOrWhiteSpace(d.IPAddress) &&
                    !string.IsNullOrWhiteSpace(d.SshUsername)
                ).ToList();

                Console.WriteLine($"[SSH Service] Found {sshDevices.Count} SSH devices");

                foreach (var device in sshDevices)
                {
                    if (stoppingToken.IsCancellationRequested) break;

                    var deviceKey = $"{device.IPAddress}:{device.SshPort ?? 22}:{device.SshUsername}";

                    // Skip if already connected and healthy
                    if (_sshConnections.TryGetValue(deviceKey, out var existingConn) &&
                        existingConn.IsConnected &&
                        existingConn.SshClient?.IsConnected == true)
                    {
                        continue;
                    }

                    // Check if enough time has passed since last reconnect attempt
                    if (existingConn != null &&
                        (DateTime.UtcNow - existingConn.LastReconnectAttempt).TotalMilliseconds < _reconnectIntervalMs)
                    {
                        continue;
                    }

                    await ConnectToDeviceAsync(device, stoppingToken);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SSH Service] ❌ Discovery error: {ex.Message}");
            }
        }

        private async Task ManageExistingConnectionsAsync(CancellationToken stoppingToken)
        {
            var disconnectedDevices = new List<string>();

            foreach (var kvp in _sshConnections)
            {
                var deviceKey = kvp.Key;
                var connection = kvp.Value;

                // Check if connection is still valid
                if (!connection.IsConnected || connection.SshClient?.IsConnected != true)
                {
                    Console.WriteLine($"[SSH Service] 🔌 Connection lost for device {connection.DeviceName} ({deviceKey})");
                    disconnectedDevices.Add(deviceKey);
                }
                // Check for excessive failures
                else if (connection.ConsecutiveFailures >= 5)
                {
                    Console.WriteLine($"[SSH Service] 🚨 Too many consecutive failures for {connection.DeviceName}, disconnecting");
                    disconnectedDevices.Add(deviceKey);
                }
            }

            foreach (var deviceKey in disconnectedDevices)
            {
                await DisconnectDeviceAsync(deviceKey);
            }
        }

        private async Task CleanupIdleConnectionsAsync()
        {
            var idleConnections = new List<string>();
            var now = DateTime.UtcNow;

            foreach (var kvp in _sshConnections)
            {
                var deviceKey = kvp.Key;
                var connection = kvp.Value;

                // Close connections that have been idle for too long
                if ((now - connection.LastUsed).TotalMilliseconds > _maxIdleTimeMs)
                {
                    Console.WriteLine($"[SSH Service] ⏰ Closing idle connection to {connection.DeviceName}");
                    idleConnections.Add(deviceKey);
                }
            }

            var disconnectTasks = idleConnections.Select(deviceKey => DisconnectDeviceAsync(deviceKey));
            await Task.WhenAll(disconnectTasks);
        }

        private async Task ConnectToDeviceAsync(Model_Device device, CancellationToken stoppingToken)
        {
            var deviceKey = $"{device.IPAddress}:{device.SshPort ?? 22}:{device.SshUsername}";

            Console.WriteLine($"[SSH Service] 🔄 Connecting to {device.Name} ({deviceKey})");

            try
            {
                await DisconnectDeviceAsync(deviceKey);

                // Prepare authentication method
                AuthenticationMethod authMethod;

                if (device.UseSshKeyAuth && !string.IsNullOrEmpty(device.SshPrivateKey))
                {
                    try
                    {
                        var decryptedKey = await _secretsService.DecryptSecretAsync(device.SshPrivateKey);
                        using var keyStream = new MemoryStream(Encoding.UTF8.GetBytes(decryptedKey));
                        var privateKeyFile = new PrivateKeyFile(keyStream);
                        authMethod = new PrivateKeyAuthenticationMethod(device.SshUsername, privateKeyFile);
                        Console.WriteLine($"[SSH Service] 🔑 Using private key authentication for device '{device.Name}'");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SSH Service] ❌ Failed to load private key for device '{device.Name}': {ex.Message}");
                        return;
                    }
                }
                else if (!string.IsNullOrEmpty(device.SshPassword))
                {
                    var decryptedPassword = await _secretsService.DecryptSecretAsync(device.SshPassword);
                    authMethod = new PasswordAuthenticationMethod(device.SshUsername, decryptedPassword);
                    Console.WriteLine($"[SSH Service] 🔐 Using password authentication for device '{device.Name}'");
                }
                else
                {
                    Console.WriteLine($"[SSH Service] ❌ No SSH authentication method available for device '{device.Name}'");
                    return;
                }

                // Create SSH connection info
                var connectionInfo = new Renci.SshNet.ConnectionInfo(
                    device.IPAddress,
                    device.SshPort ?? 22,
                    device.SshUsername,
                    authMethod)
                {
                    Timeout = TimeSpan.FromMilliseconds(_connectionTimeoutMs)
                };

                var sshClient = new SshClient(connectionInfo);
                var connection = new DeviceSshConnection
                {
                    SshClient = sshClient,
                    DeviceId = device.Id.ToString(),
                    DeviceName = device.Name,
                    IPAddress = device.IPAddress,
                    Username = device.SshUsername,
                    Port = device.SshPort ?? 22,
                    UseKeyAuth = device.UseSshKeyAuth,
                    EncryptedPrivateKey = device.SshPrivateKey,
                    EncryptedPassword = device.SshPassword,
                    LastReconnectAttempt = DateTime.UtcNow
                };

                // Connect with retry logic
                var retries = device.SshConnectionRetries ?? 3;
                var connected = false;
                Exception? lastException = null;

                for (int attempt = 1; attempt <= retries && !connected; attempt++)
                {
                    try
                    {
                        using var connectCts = new CancellationTokenSource(_connectionTimeoutMs);
                        using var combinedCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken, connectCts.Token);

                        await Task.Run(() => sshClient.Connect(), combinedCts.Token);
                        connected = sshClient.IsConnected;

                        if (connected)
                        {
                            connection.IsConnected = true;
                            connection.ConnectedAt = DateTime.UtcNow;
                            connection.LastUsed = DateTime.UtcNow;
                            connection.ReconnectAttempts = 0;
                            connection.ConsecutiveFailures = 0;
                            connection.LastError = null;

                            _sshConnections[deviceKey] = connection;

                            Console.WriteLine($"[SSH Service] ✅ Connected to {device.Name} ({deviceKey}) on attempt {attempt}");
                            break;
                        }
                    }
                    catch (Exception ex)
                    {
                        lastException = ex;
                        connection.LastError = ex;

                        if (attempt < retries)
                        {
                            Console.WriteLine($"[SSH Service] ⚠️ SSH connection attempt {attempt} failed for device '{device.Name}': {ex.Message}");
                            await Task.Delay(1000, stoppingToken);
                        }
                    }
                }

                if (!connected)
                {
                    Console.WriteLine($"[SSH Service] ❌ SSH failed to connect to device '{device.Name}' after {retries} attempts: {lastException?.Message}");
                    sshClient.Dispose();

                    if (_sshConnections.TryGetValue(deviceKey, out var existingConn))
                    {
                        existingConn.ReconnectAttempts++;
                        existingConn.LastReconnectAttempt = DateTime.UtcNow;
                        existingConn.LastError = lastException;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SSH Service] ❌ Connection error to {device.Name} ({deviceKey}): {ex.Message}");

                if (_sshConnections.TryGetValue(deviceKey, out var existingConn))
                {
                    existingConn.ReconnectAttempts++;
                    existingConn.LastReconnectAttempt = DateTime.UtcNow;
                    existingConn.LastError = ex;
                }
            }
        }

        // Execute health check command on connected SSH device
        public async Task<(bool success, int duration, string? output)> ExecuteHealthCheckAsync(string deviceKey, string command = "uptime", string expectedValue = "up")
        {
            if (!_sshConnections.TryGetValue(deviceKey, out var connection) ||
                !connection.IsConnected ||
                connection.SshClient?.IsConnected != true)
            {
                Console.WriteLine($"[SSH Service] ❌ Device {deviceKey} not connected for health check");
                return (false, 0, null);
            }

            var sw = System.Diagnostics.Stopwatch.StartNew();

            try
            {
                // Update last used timestamp
                connection.LastUsed = DateTime.UtcNow;
                connection.LastHealthCheckSent = DateTime.UtcNow;

                // Use default 'uptime' if command is empty
                var cmdToExecute = !string.IsNullOrWhiteSpace(command) ? command : "uptime";

                Console.WriteLine($"[SSH Service] 📤 Executing SSH command on device '{connection.DeviceName}': {cmdToExecute}");

                using var sshCommand = connection.SshClient!.CreateCommand(cmdToExecute);
                sshCommand.CommandTimeout = TimeSpan.FromMilliseconds(_healthCheckTimeoutMs);

                var result = await Task.Run(() => sshCommand.Execute());
                sw.Stop();

                var duration = (int)sw.ElapsedMilliseconds;

                // Show first 100 chars of output for debugging
                var outputPreview = result.Length > 100 ? result.Substring(0, 100) + "..." : result;
                Console.WriteLine($"[SSH Service] 📥 SSH command result for device '{connection.DeviceName}' ({duration}ms): {outputPreview?.TrimEnd()}");

                // Check if command executed successfully (exit status 0)
                var commandExitStatus = sshCommand.ExitStatus ?? -1;
                if (commandExitStatus != 0)
                {
                    Console.WriteLine($"[SSH Service] ❌ SSH command failed for device '{connection.DeviceName}' with exit status: {commandExitStatus}");
                    connection.ConsecutiveFailures++;
                    connection.LastHealthCheckSuccess = false;
                    return (false, duration, result);
                }

                // If no result returned, consider it a failure
                if (string.IsNullOrWhiteSpace(result))
                {
                    Console.WriteLine($"[SSH Service] ❌ SSH command returned empty result for device '{connection.DeviceName}'");
                    connection.ConsecutiveFailures++;
                    connection.LastHealthCheckSuccess = false;
                    return (false, duration, null);
                }

                // Validate expected value if configured
                var expectedVal = !string.IsNullOrWhiteSpace(expectedValue) ? expectedValue : "up";
                bool success = result.Contains(expectedVal, StringComparison.OrdinalIgnoreCase);

                if (success)
                {
                    Console.WriteLine($"[SSH Service] ✅ SSH health check for device '{connection.DeviceName}' contains expected value '{expectedVal}'");
                    connection.ConsecutiveFailures = 0;
                    connection.LastHealthCheckSuccess = true;
                }
                else
                {
                    Console.WriteLine($"[SSH Service] ❌ SSH command output for '{connection.DeviceName}' doesn't contain expected value '{expectedVal}'");
                    Console.WriteLine($"[SSH Service] 📄 Full output: {result.Substring(0, Math.Min(200, result.Length))}");
                    connection.ConsecutiveFailures++;
                    connection.LastHealthCheckSuccess = false;
                }

                return (success, duration, result);
            }
            catch (Exception ex)
            {
                sw.Stop();
                Console.WriteLine($"[SSH Service] ❌ SSH health check error for device '{connection.DeviceName}': {ex.Message}");
                connection.ConsecutiveFailures++;
                connection.LastHealthCheckSuccess = false;
                connection.LastError = ex;
                return (false, (int)sw.ElapsedMilliseconds, null);
            }
        }

        // Execute arbitrary command on connected SSH device
        public async Task<(bool success, int duration, string? output, int exitStatus)> ExecuteCommandAsync(string deviceKey, string command, int timeoutMs = 10000)
        {
            if (!_sshConnections.TryGetValue(deviceKey, out var connection) ||
                !connection.IsConnected ||
                connection.SshClient?.IsConnected != true)
            {
                Console.WriteLine($"[SSH Service] ❌ Device {deviceKey} not connected for command execution");
                return (false, 0, null, -1);
            }

            if (string.IsNullOrWhiteSpace(command))
            {
                return (false, 0, "Command cannot be empty", -1);
            }

            var sw = System.Diagnostics.Stopwatch.StartNew();

            try
            {
                // Update last used timestamp
                connection.LastUsed = DateTime.UtcNow;

                Console.WriteLine($"[SSH Service] 📤 Executing SSH command on device '{connection.DeviceName}': {command}");

                using var sshCommand = connection.SshClient!.CreateCommand(command);
                sshCommand.CommandTimeout = TimeSpan.FromMilliseconds(timeoutMs);

                var result = await Task.Run(() => sshCommand.Execute());
                sw.Stop();

                var duration = (int)sw.ElapsedMilliseconds;
                var exitStatus = sshCommand.ExitStatus ?? -1;

                Console.WriteLine($"[SSH Service] 📥 SSH command completed for device '{connection.DeviceName}' ({duration}ms) - Exit Status: {exitStatus}");

                return (exitStatus == 0, duration, result, exitStatus);
            }
            catch (Exception ex)
            {
                sw.Stop();
                Console.WriteLine($"[SSH Service] ❌ SSH command execution error for device '{connection.DeviceName}': {ex.Message}");
                connection.LastError = ex;
                return (false, (int)sw.ElapsedMilliseconds, ex.Message, -1);
            }
        }

        // Check if device is connected
        public bool IsDeviceConnected(string deviceKey)
        {
            return _sshConnections.TryGetValue(deviceKey, out var connection) &&
                   connection.IsConnected &&
                   connection.SshClient?.IsConnected == true;
        }

        // Get connected device info
        public IEnumerable<object> GetConnectedDevices()
        {
            return _sshConnections.Values
                .Where(c => c.IsConnected)
                .Select(c => new
                {
                    DeviceKey = $"{c.IPAddress}:{c.Port}:{c.Username}",
                    DeviceId = c.DeviceId,
                    DeviceName = c.DeviceName,
                    IPAddress = c.IPAddress,
                    Username = c.Username,
                    Port = c.Port,
                    ConnectedAt = c.ConnectedAt,
                    LastUsed = c.LastUsed,
                    ReconnectAttempts = c.ReconnectAttempts,
                    ConsecutiveFailures = c.ConsecutiveFailures,
                    UseKeyAuth = c.UseKeyAuth,
                    LastError = c.LastError?.Message
                });
        }

        // Get all devices (connected and disconnected)
        public IEnumerable<object> GetAllDevices()
        {
            return _sshConnections.Values
                .Select(c => new
                {
                    DeviceKey = $"{c.IPAddress}:{c.Port}:{c.Username}",
                    DeviceId = c.DeviceId,
                    DeviceName = c.DeviceName,
                    IPAddress = c.IPAddress,
                    Username = c.Username,
                    Port = c.Port,
                    IsConnected = c.IsConnected,
                    ConnectedAt = c.ConnectedAt,
                    LastUsed = c.LastUsed,
                    ReconnectAttempts = c.ReconnectAttempts,
                    ConsecutiveFailures = c.ConsecutiveFailures,
                    UseKeyAuth = c.UseKeyAuth,
                    LastError = c.LastError?.Message,
                    LastReconnectAttempt = c.LastReconnectAttempt
                });
        }

        // Force disconnect a specific device
        public async Task<bool> ForceDisconnectDeviceAsync(string deviceKey)
        {
            try
            {
                await DisconnectDeviceAsync(deviceKey);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SSH Service] ❌ Error force disconnecting device {deviceKey}: {ex.Message}");
                return false;
            }
        }

        // Force reconnect a specific device
        public async Task<bool> ForceReconnectDeviceAsync(string deviceKey)
        {
            try
            {
                if (_sshConnections.TryGetValue(deviceKey, out var connection))
                {
                    // Create a temporary device model for reconnection
                    using var scope = _scopeFactory.CreateScope();
                    var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();

                    if (int.TryParse(connection.DeviceId, out var deviceId))
                    {
                        var device = await deviceDb.GetDeviceByIdAsync(deviceId);
                        if (device != null)
                        {
                            await ConnectToDeviceAsync(device, CancellationToken.None);
                            return true;
                        }
                    }
                }
                return false;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SSH Service] ❌ Error force reconnecting device {deviceKey}: {ex.Message}");
                return false;
            }
        }

        private Task DisconnectDeviceAsync(string deviceKey)
        {
            if (_sshConnections.TryRemove(deviceKey, out var connection))
            {
                try
                {
                    connection.IsConnected = false;

                    if (connection.SshClient?.IsConnected == true)
                    {
                        connection.SshClient.Disconnect();
                    }

                    connection.SshClient?.Dispose();

                    Console.WriteLine($"[SSH Service] 🔌 Disconnected from {connection.DeviceName} ({deviceKey})");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SSH Service] ❌ Error disconnecting from {deviceKey}: {ex.Message}");
                }
            }
            return Task.CompletedTask;
        }

        private async Task DisconnectAllDevicesAsync()
        {
            Console.WriteLine("[SSH Service] 🔌 Disconnecting all devices...");

            var disconnectTasks = _sshConnections.Keys.Select(deviceKey => DisconnectDeviceAsync(deviceKey));
            await Task.WhenAll(disconnectTasks);

            _sshConnections.Clear();
            Console.WriteLine("[SSH Service] ✅ All devices disconnected");
        }

        public override void Dispose()
        {
            var disconnectTask = DisconnectAllDevicesAsync();
            disconnectTask.Wait(TimeSpan.FromSeconds(5));

            base.Dispose();
        }
    }
}