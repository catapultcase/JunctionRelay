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
using JunctionRelayServer.Models;
using JunctionRelayServer.Models.Requests;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_LocalAuth : ILocalAuthService
    {
        private readonly IService_Auth _authService;
        private readonly IService_Jwt _jwtService;

        public Service_LocalAuth(IService_Auth authService, IService_Jwt jwtService)
        {
            _authService = authService ?? throw new ArgumentNullException(nameof(authService));
            _jwtService = jwtService ?? throw new ArgumentNullException(nameof(jwtService));
        }

        public async Task<IActionResult> LoginAsync(JsonElement request)
        {
            if (!request.TryGetProperty("username", out var usernameElement) ||
                !request.TryGetProperty("password", out var passwordElement))
            {
                return new BadRequestObjectResult(new { message = "Username and password are required" });
            }

            var username = usernameElement.GetString();
            var password = passwordElement.GetString();

            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            {
                return new BadRequestObjectResult(new { message = "Username and password cannot be empty" });
            }

            if (!await _authService.ValidateCredentialsAsync(username, password))
            {
                Console.WriteLine($"Failed local login attempt for username: {username}");
                return new UnauthorizedObjectResult(new { message = "Invalid username or password" });
            }

            var user = await _authService.GetUserAsync(username);
            if (user == null)
            {
                return new UnauthorizedObjectResult(new { message = "User not found" });
            }

            var token = _jwtService.GenerateToken(user.Username, user.Id);
            var expiresAt = DateTime.UtcNow.AddMinutes(480);

            await _authService.UpdateLastLoginAsync(user.Username, "127.0.0.1");
            Console.WriteLine($"Successful local login for username: {username}");

            return new OkObjectResult(new
            {
                token = token,
                username = user.Username,
                expiresAt = expiresAt,
                authMode = "local"
            });
        }

        public async Task<IActionResult> GetCurrentUserAsync(HttpContext httpContext)
        {
            if (!httpContext.User.Identity?.IsAuthenticated ?? true)
            {
                return new UnauthorizedObjectResult(new { message = "Not authenticated" });
            }

            var username = httpContext.User.Identity?.Name ?? string.Empty;
            return new OkObjectResult(new { username, authMode = "local" });
        }

        public async Task<IActionResult> ValidateTokenAsync(HttpContext httpContext)
        {
            Console.WriteLine($"[AUTH_DEBUG] ValidateTokenAsync called");
            Console.WriteLine($"[AUTH_DEBUG] User.Identity.IsAuthenticated: {httpContext.User.Identity?.IsAuthenticated}");
            Console.WriteLine($"[AUTH_DEBUG] User.Identity.Name: {httpContext.User.Identity?.Name}");
            Console.WriteLine($"[AUTH_DEBUG] User.Identity.AuthenticationType: {httpContext.User.Identity?.AuthenticationType}");
            Console.WriteLine($"[AUTH_DEBUG] Claims count: {httpContext.User.Claims?.Count()}");

            if (!httpContext.User.Identity?.IsAuthenticated ?? true)
            {
                return new UnauthorizedObjectResult(new { valid = false, message = "Token is invalid" });
            }

            var username = httpContext.User.Identity?.Name ?? "unknown";
            var userId = httpContext.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "unknown";

            return new OkObjectResult(new
            {
                valid = true,
                username = username,
                userId = userId,
                authMode = "local",
                authType = "Local"
            });
        }

        public async Task<IActionResult> LogoutAsync(HttpContext httpContext)
        {
            var username = httpContext.User.Identity?.Name ?? "unknown";
            Console.WriteLine($"Local user logged out: {username}");
            return new OkObjectResult(new { message = "Logged out successfully", authMode = "local" });
        }

        public async Task<IActionResult> GetAuthStatusAsync(HttpContext httpContext, string? authHeader)
        {
            var hasUsers = await _authService.HasAnyUsersAsync();

            // Check if there's a valid token in the auth header
            bool isAuthenticated = false;
            string? username = null;

            if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
            {
                var token = authHeader.Substring("Bearer ".Length);
                var principal = _jwtService.ValidateToken(token);

                if (principal != null)
                {
                    isAuthenticated = true;
                    username = principal.Identity?.Name;
                }
            }

            // Fallback to checking httpContext if no auth header provided
            if (!isAuthenticated && (httpContext.User.Identity?.IsAuthenticated ?? false))
            {
                isAuthenticated = true;
                username = httpContext.User.Identity?.Name;
            }

            return new OkObjectResult(new
            {
                authMode = "local",
                isConfigured = hasUsers,
                requiresSetup = !hasUsers,
                isAuthenticated = isAuthenticated,
                user = username,
                hasValidLicense = false,
                licenseType = "Local",
                backendAuthenticated = isAuthenticated,
                authType = "Local"
            });
        }

        public async Task<IActionResult> SetupAsync(JsonElement request)
        {
            if (!request.TryGetProperty("username", out var usernameElement) ||
                !request.TryGetProperty("password", out var passwordElement))
            {
                return new BadRequestObjectResult(new { message = "Username and password are required" });
            }

            var username = usernameElement.GetString();
            var password = passwordElement.GetString();

            if (string.IsNullOrWhiteSpace(username) || username.Length < 3)
            {
                return new BadRequestObjectResult(new { message = "Username must be at least 3 characters long" });
            }

            if (string.IsNullOrWhiteSpace(password) || password.Length < 6)
            {
                return new BadRequestObjectResult(new { message = "Password must be at least 6 characters long" });
            }

            if (await _authService.HasAnyUsersAsync())
            {
                return new BadRequestObjectResult(new { message = "Setup has already been completed" });
            }

            var success = await _authService.CreateUserAsync(username, password);
            if (!success)
            {
                return new BadRequestObjectResult(new { message = "Failed to create admin user" });
            }

            Console.WriteLine($"Initial local admin user created: {username}");
            return new OkObjectResult(new { message = "Admin user created successfully", authMode = "local" });
        }

        public async Task<IActionResult> ChangePasswordAsync(JsonElement request, HttpContext httpContext)
        {
            var username = httpContext.User.Identity?.Name;
            if (string.IsNullOrEmpty(username))
            {
                return new UnauthorizedResult();
            }

            if (!request.TryGetProperty("currentPassword", out var currentPasswordElement) ||
                !request.TryGetProperty("newPassword", out var newPasswordElement))
            {
                return new BadRequestObjectResult(new { message = "Current password and new password are required" });
            }

            var currentPassword = currentPasswordElement.GetString();
            var newPassword = newPasswordElement.GetString();

            var success = await _authService.ChangePasswordAsync(username, currentPassword, newPassword);
            if (!success)
            {
                return new BadRequestObjectResult(new { message = "Current password is incorrect" });
            }

            Console.WriteLine($"Password changed for local user: {username}");
            return new OkObjectResult(new { message = "Password changed successfully" });
        }

        public async Task<IActionResult> ChangeUsernameAsync(JsonElement request, HttpContext httpContext)
        {
            var currentUsername = httpContext.User.Identity?.Name;
            if (string.IsNullOrWhiteSpace(currentUsername))
            {
                return new UnauthorizedResult();
            }

            if (!request.TryGetProperty("newUsername", out var newUsernameElement))
            {
                return new BadRequestObjectResult(new { message = "New username is required" });
            }

            var newUsername = newUsernameElement.GetString();
            if (string.IsNullOrWhiteSpace(newUsername) || newUsername.Trim().Length < 3)
            {
                return new BadRequestObjectResult(new { message = "Username must be at least 3 characters long" });
            }

            try
            {
                await _authService.UpdateUsername(currentUsername, newUsername.Trim());
                return new OkObjectResult(new { message = "Username updated successfully" });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error changing username for user: {currentUsername}: {ex.Message}");
                return new BadRequestObjectResult(new { message = ex.Message });
            }
        }

        public async Task<IActionResult> RemoveUserAsync(HttpContext httpContext)
        {
            var username = httpContext.User.Identity?.Name;
            if (string.IsNullOrEmpty(username))
            {
                return new UnauthorizedResult();
            }

            try
            {
                await _authService.RemoveUserAsync(username);
                Console.WriteLine($"Local user removed: {username}");

                return new OkObjectResult(new
                {
                    success = true,
                    message = "User removed successfully",
                    requiresReload = true
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error removing local user: {ex.Message}");
                return new ObjectResult(new { message = "An error occurred while removing user" })
                {
                    StatusCode = 500
                };
            }
        }

        // NEW: Required for unified session management
        public async Task<IActionResult> GetTokenInfoAsync(HttpContext httpContext)
        {
            // For local auth, we don't have traditional tokens like cloud mode
            // Return minimal info based on whether user is authenticated
            var isAuthenticated = httpContext.User.Identity?.IsAuthenticated ?? false;
            var username = isAuthenticated ? httpContext.User.Identity?.Name ?? "" : "";

            return new OkObjectResult(new
            {
                hasAccessToken = isAuthenticated,
                hasRefreshToken = false, // Local auth doesn't use refresh tokens
                userId = username,
                isAuthenticated = isAuthenticated,
                accessTokenLength = 0, // No actual token in local mode
                refreshTokenLength = 0,
                accessTokenPreview = "",
                refreshTokenPreview = ""
            });
        }
    }
}