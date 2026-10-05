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

using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;

namespace JunctionRelayServer.Services.CollectorPlugins
{
    public class Service_PluginProcess : IDisposable, IAsyncDisposable
    {
        private readonly string _pluginPath;
        private readonly string _entry;
        private readonly string? _rpcHostPath;
        private readonly int _timeoutMs;
        private readonly int _maxRestarts;
        private readonly int _restartDelayMs;

        private Process? _process;
        private int _nextId;
        private readonly ConcurrentDictionary<int, PendingRequest> _pending = new();
        private int _restartCount;
        private bool _stopped;
        private DateTime _lastStartTime;
        private object? _lastConfigureParams;
        private bool _disposed;

        private class PendingRequest
        {
            public TaskCompletionSource<JsonElement> Tcs { get; set; } = new();
            public CancellationTokenRegistration TimeoutRegistration { get; set; }
        }

        public Service_PluginProcess(string pluginPath, string entry, string? rpcHostPath = null, int timeoutMs = 30000, int maxRestarts = 3, int restartDelayMs = 1000)
        {
            _pluginPath = Path.GetFullPath(pluginPath);
            _entry = entry;
            _rpcHostPath = rpcHostPath;
            _timeoutMs = timeoutMs;
            _maxRestarts = maxRestarts;
            _restartDelayMs = restartDelayMs;
        }

        public bool IsRunning => _process != null && !_process.HasExited;

        public async Task StartAsync()
        {
            _stopped = false;
            var entryPath = Path.Combine(_pluginPath, _entry);
            await SpawnProcessAsync(entryPath);
        }

        private async Task SpawnProcessAsync(string entryPath)
        {
            var isTs = entryPath.EndsWith(".ts", StringComparison.OrdinalIgnoreCase);

            string fileName;
            string arguments;

            if (isTs)
            {
                fileName = "npx";
                arguments = $"tsx {entryPath}";
            }
            else
            {
                var rpcHostPath = _rpcHostPath
                    ?? throw new InvalidOperationException(
                        "rpc-host path not set. Service_PluginManager must extract the embedded rpc-host before spawning plugins.");
                fileName = "node";
                arguments = $"{rpcHostPath} {entryPath}";
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                WorkingDirectory = _pluginPath,
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            _process = new Process { StartInfo = startInfo };
            _process.Start();
            _lastStartTime = DateTime.UtcNow;

            // Read stdout lines for JSON-RPC responses
            _ = Task.Run(() => ReadStdoutLoop());

            // Read stderr lines for logging
            _ = Task.Run(() => ReadStderrLoop());

            // Set up exit handler
            _process.EnableRaisingEvents = true;
            _process.Exited += OnProcessExited;

            // Wait for the plugin to signal readiness (first stderr line)
            var readyTcs = new TaskCompletionSource<bool>();
            var readyCts = new CancellationTokenSource(_timeoutMs);
            readyCts.Token.Register(() => readyTcs.TrySetException(
                new TimeoutException($"Timeout waiting for plugin ready signal from {Path.GetFileName(_pluginPath)}")));

            void OnFirstStderr(object? sender, DataReceivedEventArgs e)
            {
                if (e.Data != null)
                {
                    readyTcs.TrySetResult(true);
                }
            }

            // We already have a stderr loop running; instead, just wait briefly for the process to be alive
            // The TypeScript host waits for first stderr line, but we can use a simpler approach:
            // wait for the process to not crash immediately
            await Task.Delay(500);

            if (_process.HasExited)
            {
                throw new InvalidOperationException(
                    $"Plugin process exited immediately with code {_process.ExitCode}");
            }
        }

        private async Task ReadStdoutLoop()
        {
            try
            {
                while (_process != null && !_process.HasExited)
                {
                    var line = await _process.StandardOutput.ReadLineAsync();
                    if (line == null) break;

                    try
                    {
                        var response = JsonSerializer.Deserialize<JsonRpcResponse>(line);
                        if (response != null && _pending.TryRemove(response.Id, out var pending))
                        {
                            pending.TimeoutRegistration.Dispose();

                            if (response.Error != null)
                            {
                                pending.Tcs.TrySetException(new InvalidOperationException(response.Error.Message));
                            }
                            else if (response.Result.HasValue)
                            {
                                pending.Tcs.TrySetResult(response.Result.Value);
                            }
                            else
                            {
                                pending.Tcs.TrySetResult(default);
                            }
                        }
                    }
                    catch (JsonException)
                    {
                        Console.WriteLine($"[PLUGIN] Failed to parse stdout from {Path.GetFileName(_pluginPath)}: {line}");
                    }
                }
            }
            catch (Exception ex) when (ex is not ObjectDisposedException)
            {
                Console.WriteLine($"[PLUGIN] Stdout reader error for {Path.GetFileName(_pluginPath)}: {ex.Message}");
            }
        }

        private async Task ReadStderrLoop()
        {
            try
            {
                while (_process != null && !_process.HasExited)
                {
                    var line = await _process.StandardError.ReadLineAsync();
                    if (line == null) break;

                    Console.WriteLine($"[PLUGIN:{Path.GetFileName(_pluginPath)}] {line}");
                }
            }
            catch (Exception ex) when (ex is not ObjectDisposedException)
            {
                // Ignore stderr read errors during shutdown
            }
        }

        private async void OnProcessExited(object? sender, EventArgs e)
        {
            var exitCode = _process?.ExitCode;

            // Reject all pending requests
            foreach (var kvp in _pending)
            {
                if (_pending.TryRemove(kvp.Key, out var pending))
                {
                    pending.TimeoutRegistration.Dispose();
                    pending.Tcs.TrySetException(new InvalidOperationException(
                        $"Plugin process exited with code {exitCode}"));
                }
            }

            if (_stopped) return;

            // Reset restart counter if process ran for 60+ seconds
            var runTime = DateTime.UtcNow - _lastStartTime;
            if (runTime.TotalSeconds >= 60)
            {
                _restartCount = 0;
            }

            if (_restartCount < _maxRestarts)
            {
                _restartCount++;
                var delay = _restartDelayMs * (1 << (_restartCount - 1)); // exponential backoff: 1s, 2s, 4s
                Console.WriteLine($"[PLUGIN] {Path.GetFileName(_pluginPath)} exited unexpectedly (code {exitCode}), " +
                    $"restarting (attempt {_restartCount}/{_maxRestarts}) in {delay}ms...");

                await Task.Delay(delay);

                if (_stopped) return;

                try
                {
                    var entryPath = Path.Combine(_pluginPath, _entry);
                    await SpawnProcessAsync(entryPath);

                    // Re-send last configure params if available
                    if (_lastConfigureParams != null)
                    {
                        await SendAsync("configure", _lastConfigureParams);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[PLUGIN] Restart failed for {Path.GetFileName(_pluginPath)}: {ex.Message}");
                }
            }
            else
            {
                Console.WriteLine($"[PLUGIN] Max restarts ({_maxRestarts}) exceeded for {Path.GetFileName(_pluginPath)}");
            }
        }

        private Task<JsonElement> SendAsync(string method, object? parameters = null)
        {
            if (_process == null || _process.HasExited || _process.StandardInput == null)
            {
                return Task.FromException<JsonElement>(
                    new InvalidOperationException("Plugin process not running"));
            }

            var id = Interlocked.Increment(ref _nextId);

            var request = new JsonRpcRequest
            {
                Method = method,
                Params = parameters ?? new { },
                Id = id
            };

            var pending = new PendingRequest();
            _pending[id] = pending;

            // Set up timeout
            var cts = new CancellationTokenSource(_timeoutMs);
            pending.TimeoutRegistration = cts.Token.Register(() =>
            {
                if (_pending.TryRemove(id, out var p))
                {
                    p.Tcs.TrySetException(new TimeoutException(
                        $"Request timed out after {_timeoutMs}ms: {method}"));
                }
            });

            try
            {
                var json = JsonSerializer.Serialize(request);
                _process.StandardInput.WriteLine(json);
                _process.StandardInput.Flush();
            }
            catch (Exception ex)
            {
                if (_pending.TryRemove(id, out var p))
                {
                    p.TimeoutRegistration.Dispose();
                    p.Tcs.TrySetException(ex);
                }
            }

            return pending.Tcs.Task;
        }

        // ====================================================================
        // Typed RPC Methods
        // ====================================================================

        public async Task<PluginCollectorMetadata> GetMetadataAsync()
        {
            var result = await SendAsync("getMetadata");
            return JsonSerializer.Deserialize<PluginCollectorMetadata>(result.GetRawText())
                ?? throw new InvalidOperationException("Failed to deserialize plugin metadata");
        }

        public async Task<PluginConfigureResult> ConfigureAsync(int collectorId, string? url, string? accessToken, int? decimalPlaces)
        {
            var parameters = new { collectorId, url, accessToken, decimalPlaces };
            _lastConfigureParams = parameters;
            var result = await SendAsync("configure", parameters);
            return JsonSerializer.Deserialize<PluginConfigureResult>(result.GetRawText())
                ?? new PluginConfigureResult { Success = false };
        }

        public async Task<PluginFetchSensorsResult> FetchSensorsAsync()
        {
            var result = await SendAsync("fetchSensors");
            return JsonSerializer.Deserialize<PluginFetchSensorsResult>(result.GetRawText())
                ?? new PluginFetchSensorsResult();
        }

        public async Task<PluginFetchSensorsResult> FetchSelectedSensorsAsync(List<string> sensorIds)
        {
            var result = await SendAsync("fetchSelectedSensors", new { sensorIds });
            return JsonSerializer.Deserialize<PluginFetchSensorsResult>(result.GetRawText())
                ?? new PluginFetchSensorsResult();
        }

        public async Task<PluginTestConnectionResult> TestConnectionAsync()
        {
            var result = await SendAsync("testConnection");
            return JsonSerializer.Deserialize<PluginTestConnectionResult>(result.GetRawText())
                ?? new PluginTestConnectionResult { Success = false };
        }

        public async Task<PluginHealthCheckResult> HealthCheckAsync()
        {
            var result = await SendAsync("healthCheck");
            return JsonSerializer.Deserialize<PluginHealthCheckResult>(result.GetRawText())
                ?? new PluginHealthCheckResult { Healthy = false };
        }

        public async Task<PluginSessionResult> StartSessionAsync()
        {
            var result = await SendAsync("startSession");
            return JsonSerializer.Deserialize<PluginSessionResult>(result.GetRawText())
                ?? new PluginSessionResult { Success = false };
        }

        public async Task<PluginSessionResult> StopSessionAsync()
        {
            var result = await SendAsync("stopSession");
            return JsonSerializer.Deserialize<PluginSessionResult>(result.GetRawText())
                ?? new PluginSessionResult { Success = false };
        }

        // ====================================================================
        // Shutdown
        // ====================================================================

        public async Task StopAsync()
        {
            _stopped = true;

            // Reject all pending requests
            foreach (var kvp in _pending)
            {
                if (_pending.TryRemove(kvp.Key, out var pending))
                {
                    pending.TimeoutRegistration.Dispose();
                    pending.Tcs.TrySetCanceled();
                }
            }

            if (_process != null && !_process.HasExited)
            {
                try
                {
                    // Close stdin to signal the plugin to exit
                    _process.StandardInput.Close();

                    // Wait up to 5 seconds for graceful exit
                    using var exitTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                    try
                    {
                        await _process.WaitForExitAsync(exitTimeout.Token);
                    }
                    catch (OperationCanceledException)
                    {
                        Console.WriteLine($"[PLUGIN] Force killing {Path.GetFileName(_pluginPath)} after 5s timeout");
                        _process.Kill(entireProcessTree: true);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[PLUGIN] Error stopping {Path.GetFileName(_pluginPath)}: {ex.Message}");
                    try { _process.Kill(entireProcessTree: true); } catch { }
                }
            }

            _process?.Dispose();
            _process = null;
        }

        public async ValueTask DisposeAsync()
        {
            if (_disposed) return;
            _disposed = true;
            await StopAsync();
        }

        // Synchronous path: no graceful wait - the process tree is killed outright.
        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _stopped = true;
            foreach (var kvp in _pending)
            {
                if (_pending.TryRemove(kvp.Key, out var pending))
                {
                    pending.TimeoutRegistration.Dispose();
                    pending.Tcs.TrySetCanceled();
                }
            }
            try { if (_process != null && !_process.HasExited) _process.Kill(entireProcessTree: true); }
            catch (Exception ex) { Console.WriteLine($"[PLUGIN] Error killing {Path.GetFileName(_pluginPath)}: {ex.Message}"); }
            _process?.Dispose();
            _process = null;
        }
    }
}
