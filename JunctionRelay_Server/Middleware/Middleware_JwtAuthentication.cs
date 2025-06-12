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

            // Check if authentication is enabled
            var authEnabled = await _authService.IsAuthenticationEnabledAsync();

            if (!authEnabled)
            {
                // Authentication is disabled, allow all requests
                await _next(context);
                return;
            }

            // Authentication is enabled, validate token
            var token = ExtractTokenFromRequest(context.Request);

            if (string.IsNullOrEmpty(token))
            {
                // No token provided and auth is required
                context.Response.StatusCode = 401;
                await context.Response.WriteAsync("Authentication required");
                return;
            }

            var principal = _jwtService.ValidateToken(token);
            if (principal == null)
            {
                // Invalid token
                context.Response.StatusCode = 401;
                await context.Response.WriteAsync("Invalid or expired token");
                return;
            }

            // Valid token, set user context
            context.User = principal;
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
                "/api/auth/enabled",  // Add this so frontend can check auth status
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