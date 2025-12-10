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
using JunctionRelayServer.Interfaces;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("auth")]
    public class Controller_AuthCallback : ControllerBase
    {
        private readonly ICloudAuthService _cloudAuthService;

        public Controller_AuthCallback(ICloudAuthService cloudAuthService)
        {
            _cloudAuthService = cloudAuthService ?? throw new ArgumentNullException(nameof(cloudAuthService));
        }

        [HttpGet("callback")]
        public async Task<IActionResult> HandleCallback([FromQuery] string code, [FromQuery] string state)
        {
            try
            {
                // Console.WriteLine($"[AUTH_CALLBACK] Received callback: code={code}, state={state}");
                return await _cloudAuthService.HandleCallbackAsync(code, state, HttpContext);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[AUTH_CALLBACK] Error during OAuth callback: {ex.Message}");
                return Redirect("/settings?auth=error&message=Authentication failed");
            }
        }
    }
}