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
using JunctionRelayServer.Models;
using JunctionRelayServer.Services;

namespace JunctionRelayServer.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class Controller_NotificationSettings : ControllerBase
    {
        private readonly Service_Database_Manager_NotificationSettings _notificationSettingsDb;

        public Controller_NotificationSettings(Service_Database_Manager_NotificationSettings notificationSettingsDb)
        {
            _notificationSettingsDb = notificationSettingsDb;
        }

        // GET: api/Controller_NotificationSettings
        [HttpGet]
        public async Task<ActionResult<List<Model_NotificationSettings>>> GetAll()
        {
            try
            {
                var settings = await _notificationSettingsDb.GetAllAsync();
                return Ok(settings);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to retrieve notification settings", message = ex.Message });
            }
        }

        // GET: api/Controller_NotificationSettings/{category}
        [HttpGet("{category}")]
        public async Task<ActionResult<Model_NotificationSettings>> GetByCategory(string category)
        {
            try
            {
                var settings = await _notificationSettingsDb.GetByCategoryAsync(category);
                if (settings == null)
                {
                    return NotFound(new { error = $"Notification settings for category '{category}' not found" });
                }
                return Ok(settings);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to retrieve notification settings", message = ex.Message });
            }
        }

        // POST: api/Controller_NotificationSettings
        [HttpPost]
        public async Task<ActionResult<Model_NotificationSettings>> Update([FromBody] Model_NotificationSettings settings)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(settings.Category))
                {
                    return BadRequest(new { error = "Category is required" });
                }

                var updated = await _notificationSettingsDb.UpdateAsync(settings);
                return Ok(updated);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to update notification settings", message = ex.Message });
            }
        }
    }
}
