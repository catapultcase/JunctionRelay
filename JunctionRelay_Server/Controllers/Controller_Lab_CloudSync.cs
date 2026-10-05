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
using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;

namespace JunctionRelayServer.Controllers
{
    // Lab module (HOMELAB) — cloud sync management. The sync itself is opt-in
    // and OFF by default; nothing leaves this machine until it is enabled here
    // (or in the Settings UI, which calls this).
    [ApiController]
    [Route("api/lab/cloudsync")]
    public class Controller_Lab_CloudSync : ControllerBase
    {
        private readonly Service_Lab_CloudSyncPush _push;
        private readonly IService_Settings _settings;
        private readonly Service_CloudSessionStore _cloudSessionStore;

        public Controller_Lab_CloudSync(
            Service_Lab_CloudSyncPush push,
            IService_Settings settings,
            Service_CloudSessionStore cloudSessionStore)
        {
            _push = push;
            _settings = settings;
            _cloudSessionStore = cloudSessionStore;
        }

        [HttpGet("status")]
        public async Task<IActionResult> GetStatus()
        {
            try
            {
                return Ok(new
                {
                    share = await _push.GetShareAsync(),
                    intervalMinutes = await _push.IntervalMinutesAsync(),
                    cloudAuthenticated = _cloudSessionStore.IsAuthenticated,
                    lastAttemptAt = _push.LastAttemptAt,
                    lastSuccessAt = _push.LastSuccessAt,
                    lastError = _push.LastError,
                    lastCounts = _push.LastCounts
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_CLOUDSYNC] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error reading cloud sync status: {ex.Message}");
            }
        }

        public class UpdateSettingsRequest
        {
            public int? IntervalMinutes { get; set; }
            public string? SourceName { get; set; }
        }

        // One endpoint for the toggles — only the fields present change.
        [HttpPost("settings")]
        public async Task<IActionResult> UpdateSettings([FromBody] UpdateSettingsRequest req)
        {
            try
            {
                if (req.IntervalMinutes.HasValue)
                {
                    if (req.IntervalMinutes.Value < 1 || req.IntervalMinutes.Value > 1440)
                        return BadRequest("Interval must be 1-1440 minutes.");
                    await _settings.SetSettingAsync(Service_Lab_CloudSyncPush.IntervalMinutesKey,
                        req.IntervalMinutes.Value.ToString(),
                        "Minutes between automatic snapshot pushes");
                }

                if (req.SourceName != null)
                    await _settings.SetSettingAsync(Service_Lab_CloudSyncPush.SourceNameKey,
                        req.SourceName.Trim(),
                        "Display name the cloud shows for this server (a name, not a hostname)");

                return await GetStatus();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_CLOUDSYNC] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error updating cloud sync settings: {ex.Message}");
            }
        }

        // Manual "Sync now" — works even when the periodic loop is disabled,
        // so the first push can be tried before committing to the schedule.
        [HttpPost("now")]
        public async Task<IActionResult> SyncNow()
        {
            try
            {
                var (ok, message) = await _push.PushSnapshotAsync(HttpContext.RequestAborted);
                if (!ok) return BadRequest(new { success = false, error = message });
                return Ok(new { success = true, lastSuccessAt = _push.LastSuccessAt, counts = _push.LastCounts });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_CLOUDSYNC] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error pushing snapshot: {ex.Message}");
            }
        }

        // The allowlist, straight from the DTO types — the UI's "review what
        // leaves this machine" table can never drift from the serializer.
        // What is shared: the categories and the features inside them. Turning anything OFF pushes at once,
        // so the cloud mirror drops it now rather than at the next interval.
        [HttpPut("share")]
        public async Task<IActionResult> SetShare([FromBody] Model_Lab_CloudShare share)
        {
            try
            {
                var before = await _push.GetShareAsync();
                await _push.SetShareAsync(share);
                var narrowed = (before.Homelab.Enabled && !share.Homelab.Enabled) || (before.Models.Enabled && !share.Models.Enabled)
                    || (before.Homelab.Movements && !share.Homelab.Movements) || (before.Homelab.Purchases && !share.Homelab.Purchases)
                    || (before.Homelab.Spaces && !share.Homelab.Spaces) || (before.Homelab.Attachments && !share.Homelab.Attachments)
                    || (before.Models.Serving && !share.Models.Serving) || (before.Models.Scores && !share.Models.Scores)
                    || (before.Models.Benchmarks && !share.Models.Benchmarks);
                string? pushed = null;
                if (narrowed && _cloudSessionStore.HasPersistedSession)
                {
                    var (ok, message) = await _push.PushSnapshotAsync(HttpContext.RequestAborted);
                    pushed = ok ? "The cloud copy was updated." : $"The cloud copy could not be updated yet: {message}";
                }
                return Ok(new { share, pushed });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_CLOUDSYNC] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error saving what is shared: {ex.Message}");
            }
        }

        [HttpGet("contract")]
        public IActionResult GetContract()
        {
            try
            {
                return Ok(Service_Lab_CloudSyncPush.GetShareContract());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_CLOUDSYNC] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error reading contract: {ex.Message}");
            }
        }
    }
}
