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

using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;

namespace JunctionRelayServer.Controllers
{
    // Lab module (HOMELAB) — the Lab summary for the Homelab dashboard.
    //
    // Serves the same Model_Lab_Briefing the MCP `lab_briefing` tool renders as text, so
    // the dashboard and the assistant always agree.
    [ApiController]
    [Route("api/lab/briefing")]
    public class Controller_Lab_Briefing : ControllerBase
    {
        private readonly Service_Lab_Briefing _briefing;

        public Controller_Lab_Briefing(Service_Lab_Briefing briefing)
        {
            _briefing = briefing;
        }

        [HttpGet]
        public async Task<IActionResult> GetBriefing()
        {
            try
            {
                return Ok(await _briefing.BuildAsync());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_BRIEFING] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error building lab briefing: {ex.Message}");
            }
        }

        // The exact text the assistant receives. Lets the dashboard show what the assistant is
        // actually given, rather than a re-rendering of it that could quietly differ.
        [HttpGet("text")]
        public async Task<IActionResult> GetBriefingText()
        {
            try
            {
                var briefing = await _briefing.BuildAsync();
                return Content(Service_Lab_Briefing.RenderText(briefing), "text/plain");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_BRIEFING] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error rendering lab briefing: {ex.Message}");
            }
        }
    }
}
