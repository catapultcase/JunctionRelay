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

using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Services;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class Controller_LoggingSettings : ControllerBase
    {
        private readonly Service_Database_Manager_LoggingSettings _loggingDb;
        private readonly Service_BlitMode_ResourceMonitor _blitResourceMonitor;
        private readonly Service_StreamHistory_ResourceMonitor _streamHistoryMonitor;
        private readonly Service_LogRotation_Manager _logRotationManager;

        public Controller_LoggingSettings(
            Service_Database_Manager_LoggingSettings loggingDb,
            Service_BlitMode_ResourceMonitor blitResourceMonitor,
            Service_StreamHistory_ResourceMonitor streamHistoryMonitor,
            Service_LogRotation_Manager logRotationManager)
        {
            _loggingDb = loggingDb;
            _blitResourceMonitor = blitResourceMonitor;
            _streamHistoryMonitor = streamHistoryMonitor;
            _logRotationManager = logRotationManager;
        }

        /// <summary>
        /// Gets all logging settings
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var settings = await _loggingDb.GetAllAsync();
            return Ok(settings);
        }

        /// <summary>
        /// Gets a logging setting by category
        /// </summary>
        [HttpGet("{category}")]
        public async Task<IActionResult> GetByCategory(string category)
        {
            var setting = await _loggingDb.GetByCategoryAsync(category);
            if (setting == null)
            {
                return NotFound(new { message = $"Logging setting for category '{category}' not found" });
            }
            return Ok(setting);
        }

        /// <summary>
        /// Creates or updates a logging setting
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> Upsert([FromBody] Model_LoggingSettings settings)
        {
            if (string.IsNullOrEmpty(settings.Category))
            {
                return BadRequest(new { message = "Category is required" });
            }

            var result = await _loggingDb.UpsertAsync(settings);

            // Restart monitoring to apply new settings
            if (settings.Category == "BlitMode")
            {
                _blitResourceMonitor.StopMonitoring();
                if (settings.Enabled)
                {
                    _blitResourceMonitor.StartMonitoring();
                }
            }
            else if (settings.Category == "StreamHistory")
            {
                _streamHistoryMonitor.StopMonitoring();
                if (settings.Enabled)
                {
                    _streamHistoryMonitor.StartMonitoring();
                }
            }

            return Ok(result);
        }

        /// <summary>
        /// Deletes a logging setting
        /// </summary>
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            await _loggingDb.DeleteAsync(id);
            return Ok(new { message = "Logging setting deleted successfully" });
        }

        /// <summary>
        /// Downloads the current blit mode resource log
        /// </summary>
        [HttpGet("blit-mode/download-log")]
        public IActionResult DownloadBlitLog()
        {
            var logPath = _blitResourceMonitor.GetLogFilePath();

            if (!_blitResourceMonitor.LogFileExists())
            {
                return NotFound(new { message = "Log file not found" });
            }

            var fileBytes = System.IO.File.ReadAllBytes(logPath);
            var fileName = Path.GetFileName(logPath);

            // Determine MIME type based on file extension
            var mimeType = fileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase)
                ? "application/json"
                : "text/plain";

            return File(fileBytes, mimeType, fileName);
        }

        /// <summary>
        /// Gets blit mode logging status and info
        /// </summary>
        [HttpGet("blit-mode/status")]
        public IActionResult GetBlitModeStatus()
        {
            var status = new
            {
                IsMonitoring = _blitResourceMonitor.IsMonitoring(),
                LogFilePath = _blitResourceMonitor.GetLogFilePath(),
                LogFileExists = _blitResourceMonitor.LogFileExists(),
                LogFileSizeBytes = _blitResourceMonitor.GetLogFileSize(),
                CurrentIntervalMinutes = _blitResourceMonitor.GetCurrentIntervalMinutes()
            };

            return Ok(status);
        }

        /// <summary>
        /// Gets stream history logging status and info
        /// </summary>
        [HttpGet("stream-history/status")]
        public IActionResult GetStreamHistoryStatus()
        {
            var status = new
            {
                IsMonitoring = _streamHistoryMonitor.IsMonitoring(),
                LogFilePath = _streamHistoryMonitor.GetLogFilePath(),
                LogFileExists = _streamHistoryMonitor.LogFileExists(),
                LogFileSizeBytes = _streamHistoryMonitor.GetLogFileSize(),
                CurrentIntervalMinutes = _streamHistoryMonitor.GetCurrentIntervalMinutes()
            };

            return Ok(status);
        }

        /// <summary>
        /// Triggers a manual snapshot for blit mode resources
        /// </summary>
        [HttpPost("blit-mode/snapshot")]
        public IActionResult TriggerManualSnapshot()
        {
            if (!_blitResourceMonitor.IsMonitoring())
            {
                return BadRequest(new { message = "Blit mode monitoring is not active" });
            }

            _blitResourceMonitor.LogManualSnapshot();
            return Ok(new { message = "Manual snapshot triggered successfully" });
        }

        /// <summary>
        /// Triggers a manual snapshot for stream history resources
        /// </summary>
        [HttpPost("stream-history/snapshot")]
        public IActionResult TriggerStreamHistorySnapshot()
        {
            _streamHistoryMonitor.LogManualSnapshot();
            return Ok(new { message = "Stream history snapshot triggered successfully" });
        }

        /// <summary>
        /// Gets information about all log files
        /// </summary>
        [HttpGet("logs/directory-info")]
        public IActionResult GetLogDirectoryInfo()
        {
            var info = _logRotationManager.GetLogDirectoryInfo();
            return Ok(info);
        }

        /// <summary>
        /// Performs cleanup for all logging categories
        /// </summary>
        [HttpPost("logs/cleanup-all")]
        public async Task<IActionResult> CleanupAllLogs()
        {
            var result = await _logRotationManager.PerformGlobalCleanupAsync();
            if (result.Success)
            {
                return Ok(result);
            }
            return BadRequest(result);
        }

        /// <summary>
        /// Performs cleanup for a specific category
        /// </summary>
        [HttpPost("logs/cleanup/{category}")]
        public async Task<IActionResult> CleanupCategory(string category)
        {
            var result = await _logRotationManager.ManualCleanupAsync(category);
            if (result.Success)
            {
                return Ok(result);
            }
            return BadRequest(result);
        }

        /// <summary>
        /// Downloads a specific log file
        /// </summary>
        [HttpGet("logs/download/{fileName}")]
        public IActionResult DownloadLogFile(string fileName)
        {
            var appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JunctionRelay");
            var logsDir = Path.Combine(appDataDir, "logs");
            var filePath = Path.Combine(logsDir, fileName);

            // Security check: ensure file is within logs directory
            var fullPath = Path.GetFullPath(filePath);
            var logsPath = Path.GetFullPath(logsDir);

            if (!fullPath.StartsWith(logsPath))
            {
                return BadRequest(new { message = "Invalid file path" });
            }

            if (!System.IO.File.Exists(filePath))
            {
                return NotFound(new { message = "Log file not found" });
            }

            var fileBytes = System.IO.File.ReadAllBytes(filePath);

            // Determine MIME type based on file extension
            var mimeType = fileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase)
                ? "application/json"
                : "text/plain";

            return File(fileBytes, mimeType, fileName);
        }

        /// <summary>
        /// Deletes a specific log file
        /// </summary>
        [HttpDelete("logs/delete/{fileName}")]
        public IActionResult DeleteLogFile(string fileName)
        {
            var appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JunctionRelay");
            var logsDir = Path.Combine(appDataDir, "logs");
            var filePath = Path.Combine(logsDir, fileName);

            // Security check: ensure file is within logs directory
            var fullPath = Path.GetFullPath(filePath);
            var logsPath = Path.GetFullPath(logsDir);

            if (!fullPath.StartsWith(logsPath))
            {
                return BadRequest(new { message = "Invalid file path" });
            }

            if (!System.IO.File.Exists(filePath))
            {
                return NotFound(new { message = "Log file not found" });
            }

            try
            {
                System.IO.File.Delete(filePath);
                return Ok(new { message = "Log file deleted successfully" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"Failed to delete file: {ex.Message}" });
            }
        }
    }
}
