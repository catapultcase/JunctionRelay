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
using System.Text.Json;

namespace JunctionRelayServer.Interfaces
{
    public interface IAuthModeService
    {
        Task<string> GetCurrentAuthModeAsync();
        Task SetAuthModeAsync(string mode);
        Task<bool> IsAuthConfiguredAsync();
        Task<bool> RequiresSetupAsync();
    }

    public interface ILocalAuthService
    {
        Task<IActionResult> LoginAsync(JsonElement request);
        Task<IActionResult> GetCurrentUserAsync(HttpContext httpContext);
        Task<IActionResult> ValidateTokenAsync(HttpContext httpContext);
        Task<IActionResult> LogoutAsync(HttpContext httpContext);
        Task<IActionResult> GetAuthStatusAsync(HttpContext httpContext, string? authHeader);
        Task<IActionResult> SetupAsync(JsonElement request);
        Task<IActionResult> ChangePasswordAsync(JsonElement request, HttpContext httpContext);
        Task<IActionResult> ChangeUsernameAsync(JsonElement request, HttpContext httpContext);
        Task<IActionResult> RemoveUserAsync(HttpContext httpContext);
        Task<IActionResult> GetTokenInfoAsync(HttpContext httpContext);
    }

    public interface ICloudAuthService
    {
        Task<IActionResult> InitiateLoginAsync(JsonElement request);
        Task<IActionResult> ExchangeCodeAsync(JsonElement request);
        Task<IActionResult> HandleCallbackAsync(string code, string state, HttpContext httpContext);
        Task<IActionResult> GetUserInfoAsync(string? authHeader);
        Task<IActionResult> ValidateTokenAsync(string? authHeader);
        Task<IActionResult> LogoutAsync(string? authHeader);
        Task<IActionResult> GetAuthStatusAsync(string? authHeader);
        Task<IActionResult> GetDevicesAsync(string? authHeader);
        Task<IActionResult> GetSessionsAsync(string? authHeader);
        Task<IActionResult> RevokeSessionAsync(string sessionId, string? authHeader);
        Task<IActionResult> RevokeAllOtherSessionsAsync(string? authHeader);
        Task<IActionResult> ActivateLicenseAsync(JsonElement request, string? authHeader);
        Task<IActionResult> RemoveLicenseAsync(string? authHeader);
        Task<IActionResult> UpdateProfileAsync(JsonElement request, string? authHeader);
        Task<IActionResult> ChangePasswordAsync(JsonElement request, string? authHeader);
        Task<IActionResult> CreateCheckoutAsync(JsonElement request, string? authHeader);
        Task<IActionResult> GetSubscriptionStatusAsync(string? authHeader);
        Task<IActionResult> GetTokenInfoAsync(string? authHeader);
    }
}