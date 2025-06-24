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
using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using System.Text.Json;
using System.Linq;
using JunctionRelay_Server.Models.Requests;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class Controller_Auth : ControllerBase
    {
        private readonly IService_Auth _authService;
        private readonly IService_Jwt _jwtService;
        private readonly ILogger<Controller_Auth> _logger;
        private readonly IConfiguration _configuration;

        public Controller_Auth(
            IService_Auth authService,
            IService_Jwt jwtService,
            ILogger<Controller_Auth> logger,
            IConfiguration configuration)
        {
            _authService = authService ?? throw new ArgumentNullException(nameof(authService));
            _jwtService = jwtService ?? throw new ArgumentNullException(nameof(jwtService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        }

        // ENHANCED STATUS ENDPOINT - Returns comprehensive auth state
        [HttpGet("status")]
        public async Task<IActionResult> GetAuthStatus()
        {
            try
            {
                var authMode = await _authService.GetAuthModeAsync();
                var hasUsers = await _authService.HasAnyUsersAsync();
                var currentUser = User.Identity?.IsAuthenticated == true ? User.Identity?.Name : null;

                return Ok(new
                {
                    authMode = authMode,
                    isConfigured = hasUsers,
                    requiresSetup = authMode == "local" && !hasUsers,
                    canActivateLocal = hasUsers || authMode != "local",
                    isAuthenticated = User.Identity?.IsAuthenticated ?? false,
                    currentUser = currentUser,
                    authType = User.Identity?.AuthenticationType
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting auth status");
                return StatusCode(500, new { message = "Error getting authentication status" });
            }
        }

        // SMART MODE SWITCHING - Handles business logic server-side
        [HttpPost("set-mode")]
        public async Task<IActionResult> SetAuthMode([FromBody] Model_SetAuthModeRequest request)
        {
            if (request == null)
                return BadRequest(new { message = "Invalid request" });

            try
            {
                if (string.IsNullOrWhiteSpace(request.Mode))
                    return BadRequest(new { message = "Mode is required" });

                var validModes = new[] { "none", "local", "cloud" };
                if (!validModes.Contains(request.Mode.ToLower()))
                    return BadRequest(new { message = "Invalid mode. Must be 'none', 'local', or 'cloud'" });

                var mode = request.Mode.ToLower();

                // BUSINESS LOGIC: Check if local mode can be activated
                if (mode == "local")
                {
                    var hasUsers = await _authService.HasAnyUsersAsync();
                    if (!hasUsers)
                    {
                        return Ok(new
                        {
                            success = false,
                            requiresSetup = true,
                            message = "Local authentication requires user setup first"
                        });
                    }
                }

                // Mode can be set - do it
                await _authService.SetAuthModeAsync(mode);
                _logger.LogInformation("Authentication mode changed to: {Mode}", mode);

                return Ok(new
                {
                    success = true,
                    requiresSetup = false,
                    message = $"Authentication mode set to {mode}",
                    authMode = mode
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error setting authentication mode");
                return StatusCode(500, new { message = "Error setting authentication mode" });
            }
        }

        // ATOMIC SETUP AND ACTIVATE - Creates user and sets mode in one operation
        [HttpPost("setup-and-activate-local")]
        public async Task<IActionResult> SetupAndActivateLocal([FromBody] Model_LoginRequest request)
        {
            if (request == null)
                return BadRequest(new { message = "Invalid request" });

            try
            {
                // Validation
                if (string.IsNullOrWhiteSpace(request.Username) || request.Username.Length < 3)
                    return BadRequest(new { message = "Username must be at least 3 characters long" });

                if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
                    return BadRequest(new { message = "Password must be at least 6 characters long" });

                // Check if already configured
                if (await _authService.HasAnyUsersAsync())
                    return BadRequest(new { message = "Local authentication is already configured" });

                // ATOMIC OPERATION: Create user and set mode
                var userCreated = await _authService.CreateUserAsync(request.Username, request.Password);
                if (!userCreated)
                    return BadRequest(new { message = "Failed to create admin user" });

                // Set mode to local
                await _authService.SetAuthModeAsync("local");

                // Generate login token
                var user = await _authService.GetUserAsync(request.Username);
                var token = _jwtService.GenerateToken(user.Username, user.Id);
                var expiresAt = DateTime.UtcNow.AddMinutes(480);

                await _authService.UpdateLastLoginAsync(user.Username, GetClientIP());

                _logger.LogInformation("Local authentication setup completed and activated for: {Username}", request.Username);

                return Ok(new
                {
                    success = true,
                    message = "Local authentication setup and activated successfully",
                    authMode = "local",
                    token = token,
                    username = user.Username,
                    expiresAt = expiresAt
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during local auth setup");
                return StatusCode(500, new { message = "An error occurred during setup" });
            }
        }

        // EXISTING ENDPOINTS (unchanged)
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] Model_LoginRequest request)
        {
            if (request == null)
                return BadRequest(new { message = "Invalid request" });

            try
            {
                var authMode = await _authService.GetAuthModeAsync();
                if (authMode != "local")
                {
                    return BadRequest(new { message = "Local authentication is not enabled" });
                }

                if (!await _authService.ValidateCredentialsAsync(request.Username, request.Password))
                {
                    _logger.LogWarning("Failed login attempt for username: {Username} from IP: {ClientIP}",
                        request.Username, GetClientIP());
                    return Unauthorized(new { message = "Invalid username or password" });
                }

                var user = await _authService.GetUserAsync(request.Username);
                if (user == null)
                    return Unauthorized(new { message = "User not found" });

                var token = _jwtService.GenerateToken(user.Username, user.Id);
                var expiresAt = DateTime.UtcNow.AddMinutes(480);

                await _authService.UpdateLastLoginAsync(user.Username, GetClientIP());
                _logger.LogInformation("Successful login for username: {Username} from IP: {ClientIP}",
                    request.Username, GetClientIP());

                return Ok(new Model_LoginResponse
                {
                    Token = token,
                    Username = user.Username,
                    ExpiresAt = expiresAt
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during login for username: {Username}", request.Username);
                return StatusCode(500, new { message = "An error occurred during login" });
            }
        }

        [HttpPost("setup")]
        public async Task<IActionResult> Setup([FromBody] Model_LoginRequest request)
        {
            if (request == null)
                return BadRequest(new { message = "Invalid request" });

            try
            {
                var authMode = await _authService.GetAuthModeAsync();
                if (authMode != "local")
                {
                    return BadRequest(new { message = "Local authentication is not enabled" });
                }

                if (await _authService.HasAnyUsersAsync())
                    return BadRequest(new { message = "Setup has already been completed" });

                if (string.IsNullOrWhiteSpace(request.Username) || request.Username.Length < 3)
                    return BadRequest(new { message = "Username must be at least 3 characters long" });

                if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
                    return BadRequest(new { message = "Password must be at least 6 characters long" });

                var success = await _authService.CreateUserAsync(request.Username, request.Password);
                if (!success)
                    return BadRequest(new { message = "Failed to create admin user" });

                _logger.LogInformation("Initial admin user created: {Username}", request.Username);
                return Ok(new { message = "Admin user created successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during setup");
                return StatusCode(500, new { message = "An error occurred during setup" });
            }
        }

        [HttpGet("enabled")]
        public async Task<IActionResult> GetAuthenticationEnabled()
        {
            try
            {
                var authMode = await _authService.GetAuthModeAsync();
                var isEnabled = authMode != "none";
                return Ok(new { enabled = isEnabled, mode = authMode });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking authentication status");
                return StatusCode(500, new { message = "Error checking authentication status" });
            }
        }

        [HttpGet("mode")]
        public async Task<IActionResult> GetAuthMode()
        {
            try
            {
                var mode = await _authService.GetAuthModeAsync();
                return Ok(new { mode });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting authentication mode");
                return StatusCode(500, new { message = "Error getting authentication mode" });
            }
        }

        [HttpGet("current-user")]
        [Authorize]
        public IActionResult GetCurrentUser()
        {
            var username = User.Identity?.Name ?? string.Empty;
            return Ok(new { username });
        }

        [HttpPost("change-username")]
        [Authorize]
        public async Task<IActionResult> ChangeUsername([FromBody] Model_ChangeUsernameRequest request)
        {
            if (request == null)
                return BadRequest(new { message = "Invalid request" });

            try
            {
                var currentUsername = User.Identity?.Name;
                if (string.IsNullOrWhiteSpace(currentUsername))
                    return Unauthorized();

                if (string.IsNullOrWhiteSpace(request.NewUsername) || request.NewUsername.Trim().Length < 3)
                    return BadRequest(new { message = "Username must be at least 3 characters long" });

                await _authService.UpdateUsername(currentUsername, request.NewUsername.Trim());
                return Ok(new { message = "Username updated successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error changing username for user: {Username}", User.Identity?.Name);
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost("change-password")]
        [Authorize]
        public async Task<IActionResult> ChangePassword([FromBody] Model_ChangePasswordRequest request)
        {
            if (request == null)
                return BadRequest(new { message = "Invalid request" });

            try
            {
                var username = User.Identity?.Name;
                if (string.IsNullOrEmpty(username))
                    return Unauthorized();

                var success = await _authService.ChangePasswordAsync(
                    username,
                    request.CurrentPassword,
                    request.NewPassword
                );

                if (!success)
                    return BadRequest(new { message = "Current password is incorrect" });

                _logger.LogInformation("Password changed for user: {Username}", username);
                return Ok(new { message = "Password changed successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error changing password for user: {Username}", User.Identity?.Name);
                return StatusCode(500, new { message = "An error occurred while changing password" });
            }
        }

        // IMPROVED REMOVE USER - Handles auth logic server-side
        [HttpDelete("remove-user")]
        public async Task<IActionResult> RemoveUser()
        {
            try
            {
                var authMode = await _authService.GetAuthModeAsync();

                // BUSINESS LOGIC: Different behavior based on auth mode
                if (authMode == "local")
                {
                    // In local mode, require authentication
                    if (!User.Identity?.IsAuthenticated ?? true)
                    {
                        return Unauthorized(new { message = "Authentication required in local auth mode" });
                    }

                    var username = User.Identity?.Name;
                    if (string.IsNullOrEmpty(username))
                        return Unauthorized();

                    await _authService.RemoveUserAsync(username);
                    _logger.LogInformation("Authenticated user removed: {Username}", username);
                }
                else
                {
                    // Not in local auth mode - allow removal without authentication
                    if (!await _authService.HasAnyUsersAsync())
                    {
                        return BadRequest(new { message = "No local user exists to remove" });
                    }

                    // Remove all local users (there should typically only be one admin)
                    var users = await _authService.GetAllUsersAsync();
                    if (users?.Any() == true)
                    {
                        foreach (var user in users)
                        {
                            await _authService.RemoveUserAsync(user.Username);
                            _logger.LogInformation("Local user removed while in {AuthMode} mode: {Username}", authMode, user.Username);
                        }
                    }
                }

                return Ok(new
                {
                    success = true,
                    message = "User removed successfully",
                    requiresReload = true
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error removing user");
                return StatusCode(500, new { message = "An error occurred while removing user" });
            }
        }

        [HttpPost("logout")]
        [Authorize]
        public IActionResult Logout()
        {
            var username = User.Identity?.Name;
            _logger.LogInformation("User logged out: {Username}", username);
            return Ok(new { message = "Logged out successfully" });
        }

        [HttpGet("validate")]
        [Authorize]
        public async Task<IActionResult> ValidateToken()
        {
            try
            {
                var authMode = await _authService.GetAuthModeAsync();
                var username = User.Identity?.Name ?? "unknown";
                var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "unknown";
                var authType = User.Identity?.AuthenticationType ?? "unknown";

                return Ok(new
                {
                    valid = true,
                    username = username,
                    userId = userId,
                    authMode = authMode,
                    authType = authType,
                    isClerkAuth = authType == "Clerk" || authType == "AuthenticationTypes.Federation",
                    isLocalAuth = authType == "Local"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Exception during token validation");
                return Unauthorized(new { message = "Token validation failed", error = ex.Message });
            }
        }

        private string GetClientIP() =>
            HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";
    }
}