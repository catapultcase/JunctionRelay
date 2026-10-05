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

using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using JunctionRelayServer.Interfaces;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// Custom authorization handler that respects the server's auth mode setting.
    /// When auth mode is "none", all requests are allowed through.
    /// When auth mode is "local", normal JWT validation applies (ASP.NET "Local" scheme).
    /// When auth mode is "cloud", validates the Bearer token against the Cloud API,
    /// because cloud tokens are issued by api.junctionrelay.com (HS256), not by Clerk's
    /// JWKS (RS256), so the ASP.NET "Clerk" JWT scheme cannot validate them.
    /// After successful cloud validation, sets HttpContext.User with token claims
    /// so controllers can use User.Identity consistently across all auth modes.
    /// </summary>
    public class AuthModeAuthorizationHandler : AuthorizationHandler<DenyAnonymousAuthorizationRequirement>
    {
        private readonly IServiceProvider _serviceProvider;

        public AuthModeAuthorizationHandler(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        protected override async Task HandleRequirementAsync(
            AuthorizationHandlerContext context,
            DenyAnonymousAuthorizationRequirement requirement)
        {
            using var scope = _serviceProvider.CreateScope();
            var authModeService = scope.ServiceProvider.GetRequiredService<IAuthModeService>();
            var mode = await authModeService.GetCurrentAuthModeAsync();

            if (mode == "none")
            {
                context.Succeed(requirement);
                return;
            }

            if (mode == "cloud")
            {
                // Cloud tokens are issued by the Cloud API (HS256), not by Clerk's JWKS (RS256).
                // The ASP.NET "Clerk" JWT bearer scheme cannot validate them, so we validate
                // by proxying to the Cloud API via the cloud auth service (which caches results).
                //
                // context.Resource is AuthorizationFilterContext when using global MVC AuthorizeFilter,
                // or HttpContext when using endpoint-level RequireAuthorization().
                HttpContext? httpContext = context.Resource as HttpContext
                    ?? (context.Resource as AuthorizationFilterContext)?.HttpContext;

                if (httpContext != null)
                {
                    var authHeader = httpContext.Request.Headers.Authorization.FirstOrDefault();
                    if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
                    {
                        try
                        {
                            var cloudAuthService = scope.ServiceProvider.GetRequiredService<ICloudAuthService>();
                            var result = await cloudAuthService.ValidateTokenAsync(authHeader);
                            if (result is OkObjectResult)
                            {
                                // Token is valid — set ClaimsPrincipal so controllers can use
                                // HttpContext.User.Identity.Name, User.Claims, etc.
                                var token = authHeader.Substring("Bearer ".Length);
                                var claims = ExtractClaimsFromValidatedJwt(token);
                                var identity = new ClaimsIdentity(claims, "cloud");
                                httpContext.User = new ClaimsPrincipal(identity);

                                context.Succeed(requirement);
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[AuthModeHandler] Cloud token validation failed: {ex.Message}");
                        }
                    }
                }
                return;
            }

            // "local" mode: don't call Succeed — let normal JWT validation handle it
        }

        /// <summary>
        /// Extracts claims from a JWT payload without cryptographic validation.
        /// This is safe because the token has ALREADY been validated by the Cloud API
        /// via ValidateTokenAsync() before this method is called. We only read claims
        /// from a token we know is valid to populate HttpContext.User.
        /// </summary>
        private static List<Claim> ExtractClaimsFromValidatedJwt(string token)
        {
            var claims = new List<Claim>();
            try
            {
                var parts = token.Split('.');
                if (parts.Length < 2) return claims;

                // Decode base64url payload
                var payload = parts[1]
                    .Replace('-', '+')
                    .Replace('_', '/');

                switch (payload.Length % 4)
                {
                    case 2: payload += "=="; break;
                    case 3: payload += "="; break;
                }

                var json = Encoding.UTF8.GetString(Convert.FromBase64String(payload));
                using var doc = JsonDocument.Parse(json);

                foreach (var prop in doc.RootElement.EnumerateObject())
                {
                    var value = prop.Value.ValueKind == JsonValueKind.String
                        ? prop.Value.GetString() ?? ""
                        : prop.Value.GetRawText();

                    // Map well-known JWT claims to .NET ClaimTypes for consistency
                    var claimType = prop.Name switch
                    {
                        "email" => ClaimTypes.Email,
                        "userId" => ClaimTypes.NameIdentifier,
                        "sub" => ClaimTypes.NameIdentifier,
                        _ => prop.Name
                    };

                    claims.Add(new Claim(claimType, value));
                }

                // Ensure Name claim is set (for User.Identity.Name)
                if (!claims.Any(c => c.Type == ClaimTypes.Name))
                {
                    var email = claims.FirstOrDefault(c => c.Type == ClaimTypes.Email)?.Value;
                    var userId = claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value;
                    if (!string.IsNullOrEmpty(email))
                        claims.Add(new Claim(ClaimTypes.Name, email));
                    else if (!string.IsNullOrEmpty(userId))
                        claims.Add(new Claim(ClaimTypes.Name, userId));
                }
            }
            catch
            {
                // If JWT parsing fails, return empty claims — the token was already validated
                // by the Cloud API, so authorization still succeeds via context.Succeed()
            }

            return claims;
        }
    }
}
