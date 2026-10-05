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
    [Route("api/[controller]")]
    [ApiController]
    public class Controller_HostInfo : ControllerBase
    {
        private readonly Service_HostInfo _hostInfoService;

        public Controller_HostInfo(Service_HostInfo hostInfoService)
        {
            _hostInfoService = hostInfoService;
        }

        [HttpGet]
        public async Task<IActionResult> GetHostInfo(int sampleRate = 1000)
        {
            try
            {
                var sensors = await _hostInfoService.GetHostSensors(sampleRate);
                return Ok(sensors);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[HOST_INFO] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in GetHostInfo: {ex.Message}");
            }
        }

    }
}
