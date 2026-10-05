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

namespace JunctionRelayServer.Controllers
{
    /// <summary>
    /// Thin adapter exposing /api/preferences to match XSD's API contract.
    /// Server's settings live at /api/settings via Service_Settings.
    /// The shared FrameEngine UI calls /api/preferences — this adapter bridges the gap.
    /// </summary>
    [ApiController]
    [Route("api/preferences")]
    public class Controller_Preferences_Adapter : ControllerBase
    {
        private readonly IService_Settings _settingsService;

        public Controller_Preferences_Adapter(IService_Settings settingsService)
        {
            _settingsService = settingsService;
        }

        /// <summary>GET /api/preferences — returns all settings as a flat key-value object</summary>
        [HttpGet]
        public async Task<IActionResult> GetPreferences()
        {
            try
            {
                var settings = await _settingsService.GetAllSettingsAsync();
                return Ok(new { success = true, data = settings });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>PATCH /api/preferences/:key — update a single preference</summary>
        [HttpPatch("{key}")]
        public async Task<IActionResult> UpdatePreference(string key, [FromBody] UpdatePreferenceRequest request)
        {
            try
            {
                await _settingsService.SetSettingAsync(key, request.Value ?? "");
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        public class UpdatePreferenceRequest
        {
            public string? Value { get; set; }
        }
    }
}
