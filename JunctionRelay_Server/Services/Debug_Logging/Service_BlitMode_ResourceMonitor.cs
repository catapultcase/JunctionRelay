using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace JunctionRelayServer.Services
{
    public class Service_BlitMode_ResourceMonitor
    {
        private readonly ILogger<Service_BlitMode_ResourceMonitor> _logger;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_BackendIdentity _backendIdentity;
        private readonly Service_LogRotation_Manager _logRotationManager;
        private readonly Process _currentProcess;
        private Timer? _hourlyLogTimer;
        private readonly string _logFilePath;
        private readonly ConcurrentDictionary<string, BlitModeMetrics> _activeBlitSessions;
        private DateTime _monitoringStartTime;
        private readonly DateTime _processStartTime;
        private long _totalFramesProcessed;
        private long _totalBytesProcessed;
        private int _currentIntervalMinutes = 60;

        public Service_BlitMode_ResourceMonitor(
            ILogger<Service_BlitMode_ResourceMonitor> logger,
            IServiceScopeFactory scopeFactory,
            Service_BackendIdentity backendIdentity,
            Service_LogRotation_Manager logRotationManager)
        {
            _logger = logger;
            _scopeFactory = scopeFactory;
            _backendIdentity = backendIdentity;
            _logRotationManager = logRotationManager;
            _currentProcess = Process.GetCurrentProcess();
            _activeBlitSessions = new ConcurrentDictionary<string, BlitModeMetrics>();
            _monitoringStartTime = DateTime.UtcNow;
            _processStartTime = _currentProcess.StartTime.ToUniversalTime();

            // Create logs directory if it doesn't exist (in user's local app data)
            var appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JunctionRelay");
            var logsDir = Path.Combine(appDataDir, "logs");
            Directory.CreateDirectory(logsDir);

            // Create a dated JSON log file for blit resource monitoring
            var fileName = $"blit_resources_{DateTime.Now:yyyy-MM-dd}.json";
            _logFilePath = Path.Combine(logsDir, fileName);

            _logger.LogInformation("Blit Mode Resource Monitor initialized. Log file: {LogPath}", _logFilePath);
        }

        public async void StartMonitoring()
        {
            if (_hourlyLogTimer != null)
            {
                _logger.LogWarning("Blit resource monitoring already started");
                return;
            }

            // Load settings from database
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                var settings = await loggingDb.GetByCategoryAsync("BlitMode");

                if (settings == null || !settings.Enabled)
                {
                    _logger.LogInformation("Blit Mode resource monitoring is disabled in settings");
                    return;
                }

                _currentIntervalMinutes = settings.LogIntervalMinutes;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load logging settings, using defaults");
                _currentIntervalMinutes = 60;
            }

            _monitoringStartTime = DateTime.UtcNow;

            // Log immediately on start
            LogResourceSnapshot("INITIAL");

            // Then log at configured interval
            var intervalMs = TimeSpan.FromMinutes(_currentIntervalMinutes);
            _hourlyLogTimer = new Timer(
                callback: _ => LogResourceSnapshot("SCHEDULED"),
                state: null,
                dueTime: intervalMs,
                period: intervalMs
            );

            _logger.LogInformation("Blit Mode resource monitoring started (interval: {Interval} minutes)", _currentIntervalMinutes);
        }

        public void StopMonitoring()
        {
            if (_hourlyLogTimer != null)
            {
                LogResourceSnapshot("FINAL");

                // Close the JSON array
                try
                {
                    if (File.Exists(_logFilePath))
                    {
                        File.AppendAllText(_logFilePath, "\n]");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to close JSON array in log file");
                }

                _hourlyLogTimer.Dispose();
                _hourlyLogTimer = null;
                _logger.LogInformation("Blit Mode resource monitoring stopped");
            }
        }

        public void RegisterBlitSession(string sessionId, string junctionId, string deviceName, string protocolType)
        {
            var metrics = new BlitModeMetrics
            {
                SessionId = sessionId,
                JunctionId = junctionId,
                DeviceName = deviceName,
                ProtocolType = protocolType,
                StartTime = DateTime.UtcNow
            };

            _activeBlitSessions.TryAdd(sessionId, metrics);
            _logger.LogInformation("Registered blit session: {SessionId} for Junction {JunctionId} ({DeviceName}, {Protocol})",
                sessionId, junctionId, deviceName, protocolType);
        }

        public void UnregisterBlitSession(string sessionId)
        {
            if (_activeBlitSessions.TryRemove(sessionId, out var metrics))
            {
                var duration = DateTime.UtcNow - metrics.StartTime;
                _logger.LogInformation("Unregistered blit session: {SessionId}, Duration: {Duration}, Frames: {Frames}",
                    sessionId, duration, metrics.FrameCount);
            }
        }

        public void RecordFrameProcessed(string sessionId, long frameSizeBytes, long renderTimeMs,
            long conversionTimeMs, long compressionTimeMs)
        {
            if (_activeBlitSessions.TryGetValue(sessionId, out var metrics))
            {
                Interlocked.Increment(ref metrics.FrameCount);
                Interlocked.Add(ref metrics.TotalBytes, frameSizeBytes);
                Interlocked.Add(ref metrics.TotalRenderTimeMs, renderTimeMs);
                Interlocked.Add(ref metrics.TotalConversionTimeMs, conversionTimeMs);
                Interlocked.Add(ref metrics.TotalCompressionTimeMs, compressionTimeMs);

                // Track peak times
                if (renderTimeMs > metrics.PeakRenderTimeMs)
                    metrics.PeakRenderTimeMs = renderTimeMs;
                if (conversionTimeMs > metrics.PeakConversionTimeMs)
                    metrics.PeakConversionTimeMs = conversionTimeMs;
            }

            Interlocked.Increment(ref _totalFramesProcessed);
            Interlocked.Add(ref _totalBytesProcessed, frameSizeBytes);
        }

        public void RecordBrowserOperation(string sessionId, string operationType, long durationMs)
        {
            if (_activeBlitSessions.TryGetValue(sessionId, out var metrics))
            {
                Interlocked.Increment(ref metrics.BrowserOperationCount);
                Interlocked.Add(ref metrics.TotalBrowserOperationTimeMs, durationMs);
            }
        }

        private double GetMemoryUsageMB()
        {
            _currentProcess.Refresh();
            return _currentProcess.WorkingSet64 / 1024.0 / 1024.0;
        }

        private double GetPrivateMemoryUsageMB()
        {
            _currentProcess.Refresh();
            return _currentProcess.PrivateMemorySize64 / 1024.0 / 1024.0;
        }

        private double GetTotalCpuSeconds()
        {
            _currentProcess.Refresh();
            return _currentProcess.TotalProcessorTime.TotalSeconds;
        }

        private int GetThreadCount()
        {
            _currentProcess.Refresh();
            return _currentProcess.Threads.Count;
        }

        private (long Gen0, long Gen1, long Gen2, long TotalAllocated) GetGCInfo()
        {
            return (
                GC.CollectionCount(0),
                GC.CollectionCount(1),
                GC.CollectionCount(2),
                GC.GetTotalAllocatedBytes()
            );
        }

        private (int ChildProcessCount, double ChildProcessMemoryMB, List<(int Pid, string Name, double MemoryMB)> ChildProcesses) GetChildProcessInfo()
        {
            try
            {
                var currentProcessId = _currentProcess.Id;
                var allProcesses = Process.GetProcesses();
                var childProcesses = new List<(int Pid, string Name, double MemoryMB)>();
                double totalChildMemory = 0;

                // Find all chrome/chromium processes (Puppeteer child processes)
                // These may not have direct parent-child relationship visible in .NET
                // but we can identify them by name
                var chromeProcessNames = new[] { "chrome", "chromium", "chromium-browser", "google-chrome" };

                foreach (var process in allProcesses)
                {
                    try
                    {
                        var processName = process.ProcessName.ToLowerInvariant();

                        // Check if this is a Chrome/Chromium process
                        if (chromeProcessNames.Any(name => processName.Contains(name)))
                        {
                            process.Refresh();
                            var memoryMB = process.WorkingSet64 / 1024.0 / 1024.0;
                            childProcesses.Add((process.Id, process.ProcessName, memoryMB));
                            totalChildMemory += memoryMB;
                        }
                    }
                    catch
                    {
                        // Process may have exited or we don't have access
                        continue;
                    }
                    finally
                    {
                        process.Dispose();
                    }
                }

                return (childProcesses.Count, totalChildMemory, childProcesses);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to get child process info");
                return (0, 0, new List<(int, string, double)>());
            }
        }

        private void LogResourceSnapshot(string snapshotType)
        {
            try
            {
                // Update last logged timestamp in database
                Task.Run(async () =>
                {
                    try
                    {
                        using var scope = _scopeFactory.CreateScope();
                        var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                        await loggingDb.UpdateLastLoggedAsync("BlitMode");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to update last logged timestamp");
                    }
                });

                var now = DateTime.UtcNow;
                var monitoringUptime = now - _monitoringStartTime;
                var processUptime = now - _processStartTime;
                var memoryMB = GetMemoryUsageMB();
                var privateMemoryMB = GetPrivateMemoryUsageMB();
                var cpuSeconds = GetTotalCpuSeconds();
                var threadCount = GetThreadCount();
                var gcInfo = GetGCInfo();
                var childProcessInfo = GetChildProcessInfo();

                // Build the snapshot object
                var snapshot = new
                {
                    timestamp = now,
                    snapshotType = snapshotType,
                    backendId = _backendIdentity.GetBackendId(),
                    backendName = _backendIdentity.GetFriendlyName(),
                    processStartTime = _processStartTime,
                    monitoringStartTime = _monitoringStartTime,
                    processUptimeSeconds = (int)processUptime.TotalSeconds,
                    monitoringUptimeSeconds = (int)monitoringUptime.TotalSeconds,
                    wasRestarted = (processUptime - monitoringUptime).TotalSeconds > 10, // Process started more than 10s before monitoring
                    systemResources = new
                    {
                        workingSetMemoryMB = Math.Round(memoryMB, 2),
                        privateMemoryMB = Math.Round(privateMemoryMB, 2),
                        totalCpuSeconds = Math.Round(cpuSeconds, 2),
                        threadCount = threadCount,
                        childProcessCount = childProcessInfo.ChildProcessCount,
                        childProcessMemoryMB = Math.Round(childProcessInfo.ChildProcessMemoryMB, 2),
                        totalMemoryMB = Math.Round(memoryMB + childProcessInfo.ChildProcessMemoryMB, 2)
                    },
                    childProcesses = childProcessInfo.ChildProcesses.Select(p => new
                    {
                        pid = p.Pid,
                        name = p.Name,
                        memoryMB = Math.Round(p.MemoryMB, 2)
                    }).ToList(),
                    garbageCollection = new
                    {
                        gen0Collections = gcInfo.Gen0,
                        gen1Collections = gcInfo.Gen1,
                        gen2Collections = gcInfo.Gen2,
                        totalAllocatedMB = Math.Round(gcInfo.TotalAllocated / 1024.0 / 1024.0, 2)
                    },
                    blitStatistics = new
                    {
                        activeSessions = _activeBlitSessions.Count,
                        totalFrames = _totalFramesProcessed,
                        totalDataMB = Math.Round(_totalBytesProcessed / 1024.0 / 1024.0, 2),
                        avgFrameSizeKB = _totalFramesProcessed > 0
                            ? Math.Round(_totalBytesProcessed / (double)_totalFramesProcessed / 1024.0, 2)
                            : 0,
                        framesPerHour = _totalFramesProcessed > 0
                            ? (int)(_totalFramesProcessed / Math.Max(0.01, monitoringUptime.TotalHours))
                            : 0
                    },
                    activeSessions = _activeBlitSessions.OrderBy(x => x.Value.StartTime).Select(kvp =>
                    {
                        var session = kvp.Value;
                        var sessionUptime = now - session.StartTime;
                        return new
                        {
                            sessionId = session.SessionId,
                            junctionId = session.JunctionId,
                            deviceName = session.DeviceName,
                            protocolType = session.ProtocolType,
                            startTime = session.StartTime,
                            durationSeconds = (int)sessionUptime.TotalSeconds,
                            frames = session.FrameCount,
                            dataSentMB = Math.Round(session.TotalBytes / 1024.0 / 1024.0, 2),
                            avgRenderTimeMs = session.FrameCount > 0
                                ? Math.Round(session.TotalRenderTimeMs / (double)session.FrameCount, 1)
                                : 0,
                            peakRenderTimeMs = session.PeakRenderTimeMs,
                            avgConvertTimeMs = session.FrameCount > 0
                                ? Math.Round(session.TotalConversionTimeMs / (double)session.FrameCount, 1)
                                : 0,
                            peakConvertTimeMs = session.PeakConversionTimeMs,
                            avgCompressTimeMs = session.FrameCount > 0
                                ? Math.Round(session.TotalCompressionTimeMs / (double)session.FrameCount, 1)
                                : 0,
                            browserOperations = session.BrowserOperationCount,
                            avgBrowserTimeMs = session.BrowserOperationCount > 0
                                ? Math.Round(session.TotalBrowserOperationTimeMs / (double)session.BrowserOperationCount, 1)
                                : 0
                        };
                    }).ToList(),
                    perJunctionStatistics = _activeBlitSessions
                        .GroupBy(kvp => kvp.Value.JunctionId)
                        .Select(group => new
                        {
                            junctionId = group.Key,
                            sessionCount = group.Count(),
                            totalFrames = group.Sum(s => s.Value.FrameCount),
                            totalDataMB = Math.Round(group.Sum(s => s.Value.TotalBytes) / 1024.0 / 1024.0, 2),
                            avgFrameSizeKB = group.Sum(s => s.Value.FrameCount) > 0
                                ? Math.Round(group.Sum(s => s.Value.TotalBytes) / (double)group.Sum(s => s.Value.FrameCount) / 1024.0, 2)
                                : 0
                        }).ToList()
                };

                // Serialize to JSON with indentation for readability
                var options = new JsonSerializerOptions
                {
                    WriteIndented = true,
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                };
                var jsonLine = JsonSerializer.Serialize(snapshot, options);

                // Check if file needs rotation based on max size setting
                long maxFileSizeMB = 100; // Default
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                    var settings = loggingDb.GetByCategoryAsync("BlitMode").GetAwaiter().GetResult();
                    if (settings != null)
                    {
                        maxFileSizeMB = settings.MaxLogFileSizeMB;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to load max file size setting, using default");
                }

                // Check and rotate if needed
                if (_logRotationManager.ShouldRotateFile(_logFilePath, maxFileSizeMB))
                {
                    try
                    {
                        // Close the JSON array before rotating
                        if (File.Exists(_logFilePath))
                        {
                            File.AppendAllText(_logFilePath, "\n]");
                        }

                        var rotatedPath = _logRotationManager.RotateLogFile(_logFilePath);
                        _logger.LogInformation("Log file rotated: {RotatedFile}", rotatedPath);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to rotate log file");
                    }
                }

                // Append to file with a newline separator between snapshots
                if (File.Exists(_logFilePath) && new FileInfo(_logFilePath).Length > 0)
                {
                    File.AppendAllText(_logFilePath, ",\n" + jsonLine);
                }
                else
                {
                    // First entry - start JSON array
                    File.WriteAllText(_logFilePath, "[\n" + jsonLine);
                }

                // Also log to standard logger at info level for immediate visibility
                _logger.LogInformation("Blit resource snapshot logged to: {LogFile}", _logFilePath);

                // Log a summary to console
                _logger.LogInformation(
                    "[{Type}] Memory: {Mem:N1}MB | Child Procs: {ChildCount} ({ChildMem:N1}MB) | TOTAL: {TotalMem:N1}MB | CPU: {Cpu:N1}s | Threads: {Threads} | Sessions: {Sessions} | Frames: {Frames:N0}",
                    snapshotType, memoryMB, childProcessInfo.ChildProcessCount, childProcessInfo.ChildProcessMemoryMB,
                    memoryMB + childProcessInfo.ChildProcessMemoryMB, cpuSeconds, threadCount, _activeBlitSessions.Count, _totalFramesProcessed
                );
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to log resource snapshot");
            }
        }

        public void LogManualSnapshot()
        {
            LogResourceSnapshot("MANUAL");
        }

        public string GetLogFilePath()
        {
            return _logFilePath;
        }

        public bool LogFileExists()
        {
            return File.Exists(_logFilePath);
        }

        public long GetLogFileSize()
        {
            if (!File.Exists(_logFilePath))
                return 0;

            var fileInfo = new FileInfo(_logFilePath);
            return fileInfo.Length;
        }

        public bool IsMonitoring()
        {
            return _hourlyLogTimer != null;
        }

        public int GetCurrentIntervalMinutes()
        {
            return _currentIntervalMinutes;
        }
    }

    public class BlitModeMetrics
    {
        public string SessionId { get; set; } = string.Empty;
        public string JunctionId { get; set; } = string.Empty;
        public string DeviceName { get; set; } = string.Empty;
        public string ProtocolType { get; set; } = string.Empty;
        public DateTime StartTime { get; set; }

        public long FrameCount;
        public long TotalBytes;
        public long TotalRenderTimeMs;
        public long TotalConversionTimeMs;
        public long TotalCompressionTimeMs;
        public long PeakRenderTimeMs;
        public long PeakConversionTimeMs;

        public long BrowserOperationCount;
        public long TotalBrowserOperationTimeMs;
    }
}
