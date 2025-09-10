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
using Microsoft.AspNetCore.Authorization;
using JunctionRelayServer.Interfaces;
using System.Text.Json;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/unified-auth")]
    public class Controller_UnifiedAuth : ControllerBase
    {
        private readonly IAuthModeService _authModeService;
        private readonly ILocalAuthService _localAuthService;
        private readonly ICloudAuthService _cloudAuthService;

        public Controller_UnifiedAuth(
            IAuthModeService authModeService,
            ILocalAuthService localAuthService,
            ICloudAuthService cloudAuthService)
        {
            _authModeService = authModeService ?? throw new ArgumentNullException(nameof(authModeService));
            _localAuthService = localAuthService ?? throw new ArgumentNullException(nameof(localAuthService));
            _cloudAuthService = cloudAuthService ?? throw new ArgumentNullException(nameof(cloudAuthService));
        }

        [HttpGet("status")]
        public async Task<IActionResult> GetAuthStatus()
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                return authMode switch
                {
                    "none" => await HandleNoneAuthStatus(),
                    "local" => await HandleLocalAuthStatus(),
                    "cloud" => await HandleCloudAuthStatus(),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting unified auth status: {ex.Message}");
                return StatusCode(500, new { message = "Error getting authentication status" });
            }
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] JsonElement request)
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                return authMode switch
                {
                    "local" => await _localAuthService.LoginAsync(request),
                    "cloud" => await _cloudAuthService.InitiateLoginAsync(request),
                    "none" => BadRequest(new { message = "Authentication is disabled" }),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error during unified login: {ex.Message}");
                return StatusCode(500, new { message = "Error during login" });
            }
        }

        [HttpGet("user-info")]
        public async Task<IActionResult> GetUserInfo()
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                return authMode switch
                {
                    "local" => await _localAuthService.GetCurrentUserAsync(HttpContext),
                    "cloud" => await _cloudAuthService.GetUserInfoAsync(Request.Headers.Authorization.FirstOrDefault()),
                    "none" => Unauthorized(new { message = "Authentication is disabled" }),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting user info: {ex.Message}");
                return StatusCode(500, new { message = "Error getting user information" });
            }
        }

        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                return authMode switch
                {
                    "local" => await _localAuthService.LogoutAsync(HttpContext),
                    "cloud" => await _cloudAuthService.LogoutAsync(Request.Headers.Authorization.FirstOrDefault()),
                    "none" => Ok(new { message = "No active session" }),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error during logout: {ex.Message}");
                return StatusCode(500, new { message = "Error during logout" });
            }
        }

        [HttpPost("exchange-code")]
        [AllowAnonymous]
        public async Task<IActionResult> ExchangeCode([FromBody] JsonElement request)
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                if (authMode != "cloud")
                {
                    return BadRequest(new { message = "Code exchange only available in cloud mode" });
                }

                return await _cloudAuthService.ExchangeCodeAsync(request);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error during code exchange: {ex.Message}");
                return StatusCode(500, new { message = "Error during code exchange" });
            }
        }

        [HttpGet("callback")]
        [AllowAnonymous]
        public async Task<IActionResult> OAuthCallback([FromQuery] string code, [FromQuery] string state)
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                if (authMode != "cloud")
                {
                    return BadRequest(new { message = "OAuth callback only available in cloud mode" });
                }

                return await _cloudAuthService.HandleCallbackAsync(code, state, HttpContext);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error during OAuth callback: {ex.Message}");
                return Redirect("/settings?auth=error&message=Authentication failed");
            }
        }

        [HttpPost("create-checkout")]
        public async Task<IActionResult> CreateCheckout([FromBody] JsonElement request)
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                return authMode switch
                {
                    "cloud" => await _cloudAuthService.CreateCheckoutAsync(request, Request.Headers.Authorization.FirstOrDefault()),
                    "local" => BadRequest(new { message = "Checkout only available in cloud mode" }),
                    "none" => BadRequest(new { message = "Authentication is disabled" }),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error creating checkout: {ex.Message}");
                return StatusCode(500, new { message = "Error creating checkout session" });
            }
        }

        [HttpPost("setup")]
        [AllowAnonymous]
        public async Task<IActionResult> Setup([FromBody] JsonElement request)
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                if (authMode != "local")
                {
                    return BadRequest(new { message = "Setup only available in local mode" });
                }

                return await _localAuthService.SetupAsync(request);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error during setup: {ex.Message}");
                return StatusCode(500, new { message = "Error during setup" });
            }
        }

        [HttpGet("config")]
        [AllowAnonymous]
        public async Task<IActionResult> GetAuthConfig()
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();
                var config = new
                {
                    authMode = authMode,
                    isConfigured = await _authModeService.IsAuthConfiguredAsync(),
                    requiresSetup = await _authModeService.RequiresSetupAsync(),
                    availableModes = new[] { "none", "local", "cloud" }
                };

                return Ok(config);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting auth config: {ex.Message}");
                return StatusCode(500, new { message = "Error getting authentication configuration" });
            }
        }

        [HttpPost("set-mode")]
        public async Task<IActionResult> SetAuthMode([FromBody] JsonElement request)
        {
            try
            {
                if (!request.TryGetProperty("mode", out var modeElement))
                {
                    return BadRequest(new { message = "Mode is required" });
                }

                var mode = modeElement.GetString();
                if (string.IsNullOrWhiteSpace(mode))
                {
                    return BadRequest(new { message = "Mode cannot be empty" });
                }

                var validModes = new[] { "none", "local", "cloud" };
                if (!validModes.Contains(mode.ToLower()))
                {
                    return BadRequest(new { message = "Invalid mode. Must be 'none', 'local', or 'cloud'" });
                }

                await _authModeService.SetAuthModeAsync(mode.ToLower());

                return Ok(new
                {
                    success = true,
                    authMode = mode.ToLower(),
                    message = $"Authentication mode set to {mode.ToLower()}"
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error setting auth mode: {ex.Message}");
                return StatusCode(500, new { message = "Error setting authentication mode" });
            }
        }

        [HttpGet("tokens")]
        public async Task<IActionResult> GetTokenInfo()
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                return authMode switch
                {
                    "cloud" => await _cloudAuthService.GetTokenInfoAsync(Request.Headers.Authorization.FirstOrDefault()),
                    "local" => await _localAuthService.GetTokenInfoAsync(HttpContext),
                    "none" => Ok(new { hasAccessToken = false, hasRefreshToken = false, isAuthenticated = false }),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting token info: {ex.Message}");
                return StatusCode(500, new { message = "Error getting token information" });
            }
        }

        [HttpGet("sessions")]
        public async Task<IActionResult> GetSessions()
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                return authMode switch
                {
                    "cloud" => await _cloudAuthService.GetSessionsAsync(Request.Headers.Authorization.FirstOrDefault()),
                    "local" => Ok(new { success = true, sessions = new object[0], message = "Session management not available in local mode" }),
                    "none" => Ok(new { success = true, sessions = new object[0], message = "No authentication active" }),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting sessions: {ex.Message}");
                return StatusCode(500, new { message = "Error getting sessions" });
            }
        }

        [HttpDelete("sessions/{sessionId}")]
        public async Task<IActionResult> RevokeSession(string sessionId)
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                return authMode switch
                {
                    "cloud" => await _cloudAuthService.RevokeSessionAsync(sessionId, Request.Headers.Authorization.FirstOrDefault()),
                    "local" => BadRequest(new { message = "Session revocation not available in local mode" }),
                    "none" => BadRequest(new { message = "No authentication active" }),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error revoking session: {ex.Message}");
                return StatusCode(500, new { message = "Error revoking session" });
            }
        }

        [HttpDelete("sessions")]
        public async Task<IActionResult> RevokeAllOtherSessions()
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                return authMode switch
                {
                    "cloud" => await _cloudAuthService.RevokeAllOtherSessionsAsync(Request.Headers.Authorization.FirstOrDefault()),
                    "local" => BadRequest(new { message = "Session revocation not available in local mode" }),
                    "none" => BadRequest(new { message = "No authentication active" }),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error revoking all sessions: {ex.Message}");
                return StatusCode(500, new { message = "Error revoking all sessions" });
            }
        }

        [HttpPost("change-username")]
        public async Task<IActionResult> ChangeUsername([FromBody] JsonElement request)
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                return authMode switch
                {
                    "local" => await _localAuthService.ChangeUsernameAsync(request, HttpContext),
                    "cloud" => BadRequest(new { message = "Username changes handled through cloud account management" }),
                    "none" => BadRequest(new { message = "Authentication is disabled" }),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error changing username: {ex.Message}");
                return StatusCode(500, new { message = "Error changing username" });
            }
        }

        [HttpPost("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] JsonElement request)
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                return authMode switch
                {
                    "local" => await _localAuthService.ChangePasswordAsync(request, HttpContext),
                    "cloud" => await _cloudAuthService.ChangePasswordAsync(request, Request.Headers.Authorization.FirstOrDefault()),
                    "none" => BadRequest(new { message = "Authentication is disabled" }),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error changing password: {ex.Message}");
                return StatusCode(500, new { message = "Error changing password" });
            }
        }

        [HttpDelete("remove-user")]
        [Authorize]
        public async Task<IActionResult> RemoveUser()
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                return authMode switch
                {
                    "local" => await _localAuthService.RemoveUserAsync(HttpContext),
                    "cloud" => BadRequest(new { message = "User removal handled through cloud account management" }),
                    "none" => BadRequest(new { message = "Authentication is disabled" }),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error removing user: {ex.Message}");
                return StatusCode(500, new { message = "Error removing user" });
            }
        }

        [HttpPost("validate")]
        [AllowAnonymous]
        public async Task<IActionResult> ValidateToken()
        {
            try
            {
                var authMode = await _authModeService.GetCurrentAuthModeAsync();

                if (authMode == "none")
                {
                    return Ok(new { valid = false, message = "Authentication is disabled" });
                }

                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return new UnauthorizedObjectResult(new { valid = false, message = "No token provided" });
                }

                return authMode switch
                {
                    "local" => await ValidateLocalTokenDirectly(authHeader),
                    "cloud" => await _cloudAuthService.ValidateTokenAsync(authHeader),
                    _ => BadRequest(new { message = "Unknown authentication mode" })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error validating token: {ex.Message}");
                return StatusCode(500, new { message = "Error validating token" });
            }
        }

        private async Task<IActionResult> ValidateLocalTokenDirectly(string authHeader)
        {
            var token = authHeader.Substring("Bearer ".Length);
            var jwtService = HttpContext.RequestServices.GetRequiredService<IService_Jwt>();
            var principal = jwtService.ValidateToken(token);

            if (principal == null)
            {
                return new UnauthorizedObjectResult(new { valid = false, message = "Token is invalid" });
            }

            var username = principal.Identity?.Name ?? "unknown";
            var userId = principal.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "unknown";

            return new OkObjectResult(new
            {
                valid = true,
                username = username,
                userId = userId,
                authMode = "local",
                authType = "Local"
            });
        }

        private async Task<IActionResult> HandleNoneAuthStatus()
        {
            return Ok(new
            {
                authMode = "none",
                isAuthenticated = false,
                isConfigured = true,
                requiresSetup = false,
                message = "Authentication is disabled"
            });
        }

        private async Task<IActionResult> HandleLocalAuthStatus()
        {
            return await _localAuthService.GetAuthStatusAsync(HttpContext);
        }

        private async Task<IActionResult> HandleCloudAuthStatus()
        {
            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            return await _cloudAuthService.GetAuthStatusAsync(authHeader);
        }
    }
}