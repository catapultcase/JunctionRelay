/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */
using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class Controller_Auth : ControllerBase
    {
        private readonly IService_Auth _authService;
        private readonly IService_Jwt _jwtService;
        private readonly ILogger<Controller_Auth> _logger;

        public Controller_Auth(
            IService_Auth authService,
            IService_Jwt jwtService,
            ILogger<Controller_Auth> logger)
        {
            _authService = authService;
            _jwtService = jwtService;
            _logger = logger;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] Model_LoginRequest request)
        {
            try
            {
                if (!await _authService.ValidateCredentialsAsync(request.Username, request.Password))
                {
                    _logger.LogWarning($"Failed login attempt for username: {request.Username} from IP: {GetClientIP()}");
                    return Unauthorized(new { message = "Invalid username or password" });
                }

                var user = await _authService.GetUserAsync(request.Username);
                if (user == null)
                    return Unauthorized(new { message = "User not found" });

                var token = _jwtService.GenerateToken(user.Username, user.Id);
                var expiresAt = DateTime.UtcNow.AddMinutes(480);

                await _authService.UpdateLastLoginAsync(user.Username, GetClientIP());
                _logger.LogInformation($"Successful login for username: {request.Username} from IP: {GetClientIP()}");

                return Ok(new Model_LoginResponse
                {
                    Token = token,
                    Username = user.Username,
                    ExpiresAt = expiresAt
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error during login for username: {request.Username}");
                return StatusCode(500, new { message = "An error occurred during login" });
            }
        }

        [HttpPost("setup")]
        public async Task<IActionResult> Setup([FromBody] Model_LoginRequest request)
        {
            try
            {
                if (await _authService.HasAnyUsersAsync())
                    return BadRequest(new { message = "Setup has already been completed" });

                if (string.IsNullOrWhiteSpace(request.Username) || request.Username.Length < 3)
                    return BadRequest(new { message = "Username must be at least 3 characters long" });

                if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
                    return BadRequest(new { message = "Password must be at least 6 characters long" });

                var success = await _authService.CreateUserAsync(request.Username, request.Password);
                if (!success)
                    return BadRequest(new { message = "Failed to create admin user" });

                _logger.LogInformation($"Initial admin user created: {request.Username}");
                return Ok(new { message = "Admin user created successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during setup");
                return StatusCode(500, new { message = "An error occurred during setup" });
            }
        }

        [HttpGet("status")]
        public async Task<IActionResult> GetAuthStatus()
        {
            var hasUsers = await _authService.HasAnyUsersAsync();
            return Ok(new
            {
                isConfigured = hasUsers,
                requiresSetup = !hasUsers
            });
        }

        [HttpGet("enabled")]
        public async Task<IActionResult> GetAuthenticationEnabled()
        {
            try
            {
                var isEnabled = await _authService.IsAuthenticationEnabledAsync();
                return Ok(new { enabled = isEnabled });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking authentication status");
                return StatusCode(500, new { message = "Error checking authentication status" });
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
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost("change-password")]
        [Authorize]
        public async Task<IActionResult> ChangePassword([FromBody] Model_ChangePasswordRequest request)
        {
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

                _logger.LogInformation($"Password changed for user: {username}");
                return Ok(new { message = "Password changed successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error changing password");
                return StatusCode(500, new { message = "An error occurred while changing password" });
            }
        }

        [HttpPost("logout")]
        [Authorize]
        public IActionResult Logout()
        {
            var username = User.Identity?.Name;
            _logger.LogInformation($"User logged out: {username}");
            return Ok(new { message = "Logged out successfully" });
        }

        [HttpGet("validate")]
        [Authorize]
        public IActionResult ValidateToken()
        {
            var username = User.Identity?.Name;
            return Ok(new
            {
                valid = true,
                username = username
            });
        }

        private string GetClientIP() =>
            HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";
    }
}
