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

namespace JunctionRelayServer.Middleware
{
    public class Middleware_JwtAuthentication
    {
        private readonly RequestDelegate _next;
        private readonly IService_Jwt _jwtService;
        private readonly IService_Auth _authService;

        public Middleware_JwtAuthentication(RequestDelegate next, IService_Jwt jwtService, IService_Auth authService)
        {
            _next = next;
            _jwtService = jwtService;
            _authService = authService;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            // Skip authentication for certain paths
            var path = context.Request.Path.Value?.ToLowerInvariant();
            if (ShouldSkipAuthentication(path))
            {
                await _next(context);
                return;
            }

            // Get current authentication mode
            var authMode = await _authService.GetAuthModeAsync();

            // If auth mode is "none", allow all requests
            if (authMode == "none")
            {
                await _next(context);
                return;
            }

            // For "local" or "cloud" modes, validate token
            var token = ExtractTokenFromRequest(context.Request);

            if (string.IsNullOrEmpty(token))
            {
                // No token provided and auth is required
                context.Response.StatusCode = 401;
                await context.Response.WriteAsync("Authentication required");
                return;
            }

            // Validate token based on auth mode
            if (authMode == "local")
            {
                // Validate local JWT token
                var principal = _jwtService.ValidateToken(token);
                if (principal == null)
                {
                    context.Response.StatusCode = 401;
                    await context.Response.WriteAsync("Invalid or expired token");
                    return;
                }
                context.User = principal;
            }
            else if (authMode == "cloud")
            {
                // For cloud mode, we'll validate the Clerk token
                // For now, we'll trust the token (you can add Clerk validation later)
                // This allows the cloud endpoints to handle Clerk token validation
                if (!token.StartsWith("eyJ")) // Basic JWT format check
                {
                    context.Response.StatusCode = 401;
                    await context.Response.WriteAsync("Invalid token format");
                    return;
                }
                // Set a minimal user context for cloud auth
                // The actual validation happens in the cloud endpoints
                context.User = new System.Security.Claims.ClaimsPrincipal(
                    new System.Security.Claims.ClaimsIdentity("cloud"));
            }

            await _next(context);
        }

        private static bool ShouldSkipAuthentication(string? path)
        {
            if (string.IsNullOrEmpty(path)) return false;

            var publicPaths = new[]
            {
                "/api/auth/login",
                "/api/auth/setup",
                "/api/auth/status",
                "/api/auth/enabled",
                "/api/auth/mode",        // Needed for determining auth mode
                "/api/auth/set-mode",    // Needed for changing modes
                "/api/settings/version", // Needed for version display on all pages
                "/api/settings/flags",   // Needed for feature flags
                "/favicon.ico",
                "/_framework/",
                "/css/",
                "/js/",
                "/images/",
                "/static/",
                "/manifest.json",
                "/index.html"
            };

            // Skip authentication for static files and the main React app
            if (publicPaths.Any(publicPath => path.StartsWith(publicPath)))
                return true;

            // Skip authentication for file extensions (static assets)
            var fileExtensions = new[] { ".js", ".css", ".html", ".ico", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".woff", ".woff2", ".ttf", ".eot", ".map" };
            if (fileExtensions.Any(ext => path.EndsWith(ext)))
                return true;

            // Only apply authentication to API routes
            return !path.StartsWith("/api/");
        }

        private static string? ExtractTokenFromRequest(HttpRequest request)
        {
            var authHeader = request.Headers.Authorization.FirstOrDefault();
            if (authHeader != null && authHeader.StartsWith("Bearer "))
            {
                return authHeader.Substring("Bearer ".Length).Trim();
            }

            // Also check for token in query string (for downloads, etc.)
            return request.Query["token"].FirstOrDefault();
        }
    }
}