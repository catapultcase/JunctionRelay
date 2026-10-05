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

using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;
using ModelContextProtocol.Server;

namespace JunctionRelayServer.Controllers
{
    // Lab module (HOMELAB) — MCP endpoint status and key management.
    //
    // ⚠️ This controller never returns the key. It reports whether one exists, how it is
    // protected, and whether it is unlocked — nothing that would let a caller reconstruct it.
    [ApiController]
    [Route("api/lab/mcp")]
    public class Controller_Lab_Mcp : ControllerBase
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly Service_Lab_McpKey _keyService;
        private readonly IAuthModeService _authMode;

        public Controller_Lab_Mcp(
            IServiceProvider serviceProvider,
            Service_Lab_McpKey keyService,
            IAuthModeService authMode)
        {
            _serviceProvider = serviceProvider;
            _keyService = keyService;
            _authMode = authMode;
        }

        public class SetKeyRequest
        {
            public string? Key { get; set; }
            // Optional. When supplied the key is encrypted with it and the server cannot
            // use the key after a restart until someone unlocks it.
            public string? Password { get; set; }
        }

        public class UnlockRequest
        {
            public string? Password { get; set; }
        }

        [HttpGet("status")]
        public async Task<IActionResult> GetStatus()
        {
            try
            {
                var status = await _keyService.GetStatusAsync();

                // Read the live tool registrations rather than a hardcoded list, so the
                // dashboard cannot claim a tool surface the server does not actually serve.
                var tools = _serviceProvider.GetServices<McpServerTool>()
                    .Select(t => new { name = t.ProtocolTool.Name, description = t.ProtocolTool.Description })
                    .OrderBy(t => t.name)
                    .ToList<object>();

                // "Enabled" means a request would actually be served: a key exists and is
                // usable right now. A locked key is configured but not enabled.
                var enabled = status.Configured && !status.Locked;

                return Ok(new
                {
                    enabled,
                    // Informational: in `none` mode this endpoint's key is not the weakest
                    // link - the whole API is already open. Surfaced so the UI can say so.
                    serverAuthOpen = await IsUnauthenticatedModeAsync(),
                    configured = status.Configured,
                    locked = status.Locked,
                    keySource = status.Source,
                    protection = status.Protection,
                    route = "/mcp",
                    transport = "streamable-http",
                    authRequired = true,
                    toolCount = tools.Count,
                    tools
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MCP] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error reading MCP status: {ex.Message}");
            }
        }

        [HttpPost("key")]
        public async Task<IActionResult> SetKey([FromBody] SetKeyRequest request)
        {
            if (string.IsNullOrWhiteSpace(request?.Key))
                return BadRequest("Key is required.");

            try
            {
                await _keyService.SetKeyAsync(request.Key.Trim(), request.Password);
                return Ok(await _keyService.GetStatusAsync());
            }
            catch (ArgumentException ex)
            {
                // A weak key is the caller's mistake, not a server fault (audit M6).
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MCP] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error storing MCP key: {ex.Message}");
            }
        }

        // Suggests a key rather than making the operator invent one (audit M6). Generated
        // here and returned once; it is not stored until the caller posts it back to
        // /key, exactly like the cloud's generate-then-save flow.
        [HttpGet("key/suggest")]
        public IActionResult SuggestKey()
        {
            try { return Ok(new { key = Service_Lab_McpKey.GenerateKey() }); }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MCP] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error generating a key: {ex.Message}");
            }
        }

        // ⛔ Rate-limited (audit L1). Password guessing against the encrypted key was
        // unlimited; the only policy this server defines is "login", and it fits here for
        // exactly the same reason.
        [HttpPost("key/unlock")]
        [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("login")]
        public async Task<IActionResult> Unlock([FromBody] UnlockRequest request)
        {
            if (string.IsNullOrWhiteSpace(request?.Password))
                return BadRequest("Password is required.");

            try
            {
                var ok = await _keyService.UnlockAsync(request.Password);
                if (!ok) return BadRequest("Incorrect password, or the key is not password-protected.");

                return Ok(await _keyService.GetStatusAsync());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MCP] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error unlocking MCP key: {ex.Message}");
            }
        }

        [HttpPost("key/lock")]
        public async Task<IActionResult> Lock()
        {
            try
            {
                _keyService.Lock();
                return Ok(await _keyService.GetStatusAsync());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MCP] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error locking MCP key: {ex.Message}");
            }
        }

        [HttpDelete("key")]
        public async Task<IActionResult> ClearKey()
        {
            try
            {
                await _keyService.ClearAsync();
                return Ok(await _keyService.GetStatusAsync());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MCP] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error clearing MCP key: {ex.Message}");
            }
        }

        // Auth mode `none` is reported, not enforced against.
        //
        // An earlier revision refused key writes in `none` mode, reasoning that an
        // unauthenticated caller could store their own key and then use it. That was
        // wrong: in `none` mode every controller is already open, including all the Lab
        // write endpoints, so such a caller has strictly MORE capability than the MCP key
        // grants. Blocking the write protected nothing and locked out the legitimate
        // operator on a default install. The UI surfaces the mode instead.
        private async Task<bool> IsUnauthenticatedModeAsync()
        {
            var mode = await _authMode.GetCurrentAuthModeAsync();
            return string.Equals(mode, "none", StringComparison.OrdinalIgnoreCase);
        }
    }
}
