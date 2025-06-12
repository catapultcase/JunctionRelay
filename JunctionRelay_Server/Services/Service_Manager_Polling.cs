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

using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using JunctionRelayServer.Services;
using System.Collections.Concurrent;

public class Service_Manager_Polling
{
    private class PollerState
    {
        public Func<CancellationToken, Task> PollAction { get; set; } = null!;
        public CancellationTokenSource TokenSource { get; set; } = null!;
        public int PollRateMs { get; set; }
        public HashSet<int> Junctions { get; } = new();
        public List<Model_Sensor> SelectedSensors { get; } = new();
        public Model_Collector? Collector { get; set; }
        public Model_Device? Device { get; set; }

        // Track each junction’s originally requested rate
        public Dictionary<int, int> RequestedRates { get; } = new();
    }

    public class PollerInfo
    {
        public string SourceKey { get; set; } = string.Empty;
        public string? SourceName { get; set; }
        public string SourceType { get; set; } = "Unknown";
        public int Rate { get; set; }
        public int SensorCount { get; set; }
        public int JunctionCount { get; set; }
        public DateTime LastPollTime { get; set; }
        public string Status { get; set; } = "Active";
        public List<PolledSensorInfo> PolledSensors { get; set; } = new();
    }
    public class PolledSensorInfo
    {
        public string? DeviceName { get; set; }
        public int OriginalId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string ExternalId { get; set; } = string.Empty;
        public string? Value { get; set; }
        public string? Unit { get; set; }
    }


    private readonly ConcurrentDictionary<string, PollerState> _activePollers = new();
    private readonly ConcurrentDictionary<string, PollerInfo> _pollerDiagnostics = new();
    private readonly IServiceScopeFactory _scopeFactory;

    public Service_Manager_Polling(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public IEnumerable<PollerInfo> GetActivePollers()
    {
        return _pollerDiagnostics.Values;
    }

    public void RegisterJunctionSource(
        string key,
        int junctionId,
        int pollRateMs,
        Model_Collector? collector = null,
        Model_Device? device = null,
        List<Model_Sensor>? selectedSensors = null
    )
    {
        var timestamp = DateTime.UtcNow.ToString("HH:mm:ss.fff");

        if (_activePollers.TryGetValue(key, out var existingPoller))
        {
            Console.WriteLine($"[SERVICE_MANAGER_POLLING] Poller for key {key} already exists. Merging sensors and junctions...");
            bool sensorChanged = MergeSensors(existingPoller, selectedSensors, junctionId);
            bool junctionChanged = existingPoller.Junctions.Add(junctionId);
            existingPoller.RequestedRates[junctionId] = pollRateMs;

            if (sensorChanged || junctionChanged)
            {
                var effectiveRate = Math.Min(pollRateMs, existingPoller.PollRateMs);
                Console.WriteLine($"[SERVICE_MANAGER_POLLING] Changes detected, restarting poller at {effectiveRate}ms...");
                RestartPoller(existingPoller, effectiveRate);
            }
            else
            {
                Console.WriteLine($"[SERVICE_MANAGER_POLLING] No changes detected, poller continues at {existingPoller.PollRateMs}ms.");
            }
        }
        else
        {
            Console.WriteLine($"[SERVICE_MANAGER_POLLING] Creating new poller for key {key} at {pollRateMs}ms...");
            CreateNewPoller(key, junctionId, pollRateMs, collector, device, selectedSensors);
        }
    }

    public int GetPollRate(
    List<Model_JunctionDeviceLink> junctionDeviceLinks,
    List<Model_JunctionCollectorLink> junctionCollectorLinks,
    Model_Device? device,
    Model_Collector? collector
)
    {
        int? fastestOverride = null;

        if (junctionDeviceLinks != null && junctionDeviceLinks.Any())
            fastestOverride = junctionDeviceLinks
                              .Where(l => l.PollRateOverride.HasValue && l.PollRateOverride.Value > 0) // Only consider values > 0
                              .Min(l => l.PollRateOverride);

        if (junctionCollectorLinks != null && junctionCollectorLinks.Any())
        {
            int? collectorOverride = junctionCollectorLinks
                                    .Where(l => l.PollRateOverride.HasValue && l.PollRateOverride.Value > 0) // Only consider values > 0
                                    .Min(l => l.PollRateOverride);

            if (collectorOverride.HasValue && (!fastestOverride.HasValue || collectorOverride < fastestOverride))
                fastestOverride = collectorOverride;
        }

        if (fastestOverride.HasValue) return fastestOverride.Value;
        if (device != null) return device.PollRate ?? 5000;
        if (collector != null) return collector.PollRate ?? 5000;
        return 5000;
    }

    private bool MergeSensors(PollerState existingPoller, List<Model_Sensor>? newSensors, int junctionId)
    {
        bool sensorChanged = false;
        if (newSensors != null)
        {
            foreach (var sensor in newSensors)
            {
                var existingSensor = existingPoller.SelectedSensors
                    .FirstOrDefault(s => s.ExternalId == sensor.ExternalId && s.JunctionId == junctionId);
                if (existingSensor == null)
                {
                    existingPoller.SelectedSensors.Add(new Model_Sensor
                    {
                        Id = sensor.Id,
                        OriginalId = sensor.OriginalId,
                        ExternalId = sensor.ExternalId,
                        JunctionId = sensor.JunctionId,
                        CollectorId = sensor.CollectorId,
                        DeviceId = sensor.DeviceId,
                        Name = sensor.Name,
                        Unit = sensor.Unit,
                        Value = sensor.Value,
                        SensorType = sensor.SensorType,
                        DeviceName = sensor.DeviceName,
                        ComponentName = sensor.ComponentName,
                        Category = sensor.Category,
                        SensorTag = sensor.SensorTag
                    });
                    sensorChanged = true;
                }
            }
        }
        return sensorChanged;
    }

    private void RestartPoller(PollerState poller, int pollRateMs)
    {
        var timestamp = DateTime.UtcNow.ToString("HH:mm:ss.fff");
        Console.WriteLine($"[SERVICE_MANAGER_POLLING] Restarting poller for {(poller.Collector?.Name ?? poller.Device?.Name)} with new rate {pollRateMs}ms...");

        poller.TokenSource.Cancel();
        poller.TokenSource.Token.WaitHandle.WaitOne();

        poller.TokenSource = new CancellationTokenSource();
        poller.PollRateMs = pollRateMs;
        poller.PollAction = GetPollAction(poller.Collector, poller.Device, poller.SelectedSensors, pollRateMs);

        Task.Run(() => RunPollLoop(poller, poller.TokenSource.Token));
        Console.WriteLine($"[SERVICE_MANAGER_POLLING] Poller restarted at {pollRateMs}ms");
    }

    private void CreateNewPoller(
        string key,
        int junctionId,
        int pollRateMs,
        Model_Collector? collector,
        Model_Device? device,
        List<Model_Sensor>? selectedSensors
    )
    {
        var timestamp = DateTime.UtcNow.ToString("HH:mm:ss.fff");
        var cts = new CancellationTokenSource();
        var pollAction = GetPollAction(collector, device, selectedSensors ?? new List<Model_Sensor>(), pollRateMs);

        var newPoller = new PollerState
        {
            PollRateMs = pollRateMs,
            PollAction = pollAction,
            TokenSource = cts,
            Collector = collector,
            Device = device
        };
        newPoller.Junctions.Add(junctionId);
        newPoller.RequestedRates[junctionId] = pollRateMs;
        if (selectedSensors != null) newPoller.SelectedSensors.AddRange(selectedSensors);

        _activePollers[key] = newPoller;
        Task.Run(() => RunPollLoop(newPoller, cts.Token));
    }

    public void UnregisterJunctionSource(string key, int junctionId)
    {
        if (!_activePollers.TryGetValue(key, out var state))
            return;

        var timestamp = DateTime.UtcNow.ToString("HH:mm:ss.fff");
        state.Junctions.Remove(junctionId);
        state.RequestedRates.Remove(junctionId);

        if (!state.Junctions.Any())
        {
            Console.WriteLine($"[SERVICE_MANAGER_POLLING] No more junctions, stopping poller for {key}.");
            StopPoller(state);
            _activePollers.TryRemove(key, out _);
        }
        else
        {
            var newRate = state.RequestedRates.Values.Min();
            Console.WriteLine($"[SERVICE_MANAGER_POLLING] Junction removed; lowering poll rate to {newRate}ms");
            RestartPoller(state, newRate);
        }
    }

    private void StopPoller(PollerState state)
    {
        state.TokenSource.Cancel();
        state.TokenSource.Token.WaitHandle.WaitOne();

        // Reset to a no-op delegate instead of null
        state.PollAction = _ => Task.CompletedTask;

        string? sourceKey = state.Collector != null
            ? $"Collector-{state.Collector.Id}"
            : state.Device != null
                ? $"Device-{state.Device.Id}"
                : null;

        if (!string.IsNullOrEmpty(sourceKey))
            _pollerDiagnostics.TryRemove(sourceKey, out _);
    }

    private Func<CancellationToken, Task> GetPollAction(
        Model_Collector? collector,
        Model_Device? device,
        List<Model_Sensor> selectedSensors,
        int pollRateMs = 0
    )
    {
        if (collector != null)
        {
            return async token =>
            {
                using var scope = _scopeFactory.CreateScope();
                var factory = scope.ServiceProvider.GetRequiredService<Func<Model_Collector, IDataCollector>>();
                var handler = factory(collector);

                var ids = selectedSensors.Select(s => s.ExternalId).ToList();
                var sensors = await handler.FetchSelectedSensorsAsync(collector, ids, token);

                foreach (var fetched in sensors)
                {
                    foreach (var target in selectedSensors.Where(s => s.ExternalId == fetched.ExternalId))
                    {
                        target.Value = fetched.Value;
                        target.LastUpdated = DateTime.UtcNow;
                    }
                }

                var connection = scope.ServiceProvider.GetRequiredService<Service_Manager_Connections>();
                await connection.HandleSensorUpdateForCollector(
                    collector.Id,
                    selectedSensors.Where(s => s.CollectorId == collector.Id).ToList()
                );

                string sourceKey = $"Collector-{collector.Id}";
                _pollerDiagnostics[sourceKey] = new PollerInfo
                {
                    SourceKey = sourceKey,
                    SourceName = collector.Name,
                    SourceType = collector.CollectorType,
                    Rate = pollRateMs,
                    SensorCount = selectedSensors.Where(s => s.CollectorId == collector.Id).GroupBy(s => s.OriginalId).Count(),
                    JunctionCount = selectedSensors.Select(s => s.JunctionId).Distinct().Count(),
                    LastPollTime = DateTime.UtcNow,
                    Status = "Active",
                    PolledSensors = selectedSensors
                        .Where(s => s.CollectorId == collector.Id)
                        .GroupBy(s => s.OriginalId)
                        .Select(g =>
                        {
                            var first = g.First();
                            return new PolledSensorInfo
                            {
                                OriginalId = first.OriginalId,
                                Name = first.Name ?? "",
                                Value = first.Value,
                                Unit = first.Unit,
                                ExternalId = first.ExternalId
                            };
                        }).ToList()
                };
            };
        }

        if (device != null)
        {
            return async token =>
            {
                string sourceKey = $"Device-{device.Id}";
                _pollerDiagnostics[sourceKey] = new PollerInfo
                {
                    SourceKey = sourceKey,
                    SourceName = device.Name,
                    SourceType = "Device",
                    Rate = pollRateMs,
                    SensorCount = selectedSensors.Where(s => s.DeviceId == device.Id).GroupBy(s => s.OriginalId).Count(),
                    JunctionCount = selectedSensors.Select(s => s.JunctionId).Distinct().Count(),
                    LastPollTime = DateTime.UtcNow,
                    Status = "Active",
                    PolledSensors = selectedSensors
                        .Where(s => s.DeviceId == device.Id)
                        .GroupBy(s => s.OriginalId)
                        .Select(g =>
                        {
                            var first = g.First();
                            return new PolledSensorInfo
                            {
                                OriginalId = first.OriginalId,
                                Name = first.Name ?? "",
                                Value = first.Value,
                                Unit = first.Unit,
                                ExternalId = first.ExternalId
                            };
                        }).ToList()
                };
                await Task.CompletedTask;
            };
        }

        return _ => Task.CompletedTask;
    }

    private async Task RunPollLoop(PollerState state, CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try { await state.PollAction(token); }
            catch { /* ignore */ }

            try { await Task.Delay(state.PollRateMs, token); }
            catch (TaskCanceledException) { break; }
        }
    }
}
