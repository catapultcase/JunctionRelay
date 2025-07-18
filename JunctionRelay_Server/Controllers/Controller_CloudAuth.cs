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


using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/cloud-auth")]
    public class Controller_CloudAuth : ControllerBase
    {
        private readonly ILogger<Controller_CloudAuth> _logger;
        private readonly IConfiguration _configuration;
        private readonly HttpClient _httpClient;
        private readonly Service_CloudSessionStore _cloudSessionStore;

        public Controller_CloudAuth(
            ILogger<Controller_CloudAuth> logger,
            IConfiguration configuration,
            IHttpClientFactory httpClientFactory,
            Service_CloudSessionStore cloudSessionStore)
        {
            _logger = logger;
            _configuration = configuration;
            _httpClient = httpClientFactory.CreateClient();
            _cloudSessionStore = cloudSessionStore;
        }

        [HttpPost("initiate-login")]
        public async Task<IActionResult> InitiateLogin([FromBody] CloudAuthInitiateRequest? request)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                Console.WriteLine("[CLOUD_AUTH] ❌ Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            var origin = request?.Origin ?? $"{Request.Scheme}://{Request.Host}";
            var redirectUrl = request?.RedirectUrl ?? origin;

            Console.WriteLine($"[CLOUD_AUTH] Initiating login. Origin: {origin}, Redirect: {redirectUrl}, CloudAPI: {cloudApiUrl}");

            // STEP 1: If backend already has a valid session, try to match it to current frontend user
            try
            {
                var backendToken = await _cloudSessionStore.GetValidAccessTokenAsync();
                var backendUserId = _cloudSessionStore.GetUserId();

                if (!string.IsNullOrEmpty(backendToken) && !string.IsNullOrEmpty(backendUserId))
                {
                    // Check frontend token if provided
                    var frontendAuthHeader = Request.Headers.Authorization.FirstOrDefault();
                    if (!string.IsNullOrEmpty(frontendAuthHeader) && frontendAuthHeader.StartsWith("Bearer "))
                    {
                        var frontendToken = frontendAuthHeader.Substring("Bearer ".Length);

                        // Validate token with cloud
                        var validateUrl = $"{cloudApiUrl}/api/auth/validate-token";
                        using var validateRequest = new HttpRequestMessage(HttpMethod.Post, validateUrl);
                        validateRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", frontendToken);

                        var validateResponse = await _httpClient.SendAsync(validateRequest);
                        if (validateResponse.IsSuccessStatusCode)
                        {
                            var json = await validateResponse.Content.ReadFromJsonAsync<JsonElement>();
                            if (json.TryGetProperty("userId", out var frontendUserIdElement))
                            {
                                var frontendUserId = frontendUserIdElement.GetString();
                                if (frontendUserId == backendUserId)
                                {
                                    Console.WriteLine("[CLOUD_AUTH] ✅ Frontend user matches backend session. Reusing access token.");
                                    return Ok(new
                                    {
                                        alreadyAuthenticated = true,
                                        token = backendToken,
                                        expiresAt = DateTime.UtcNow.AddHours(8)
                                    });
                                }
                                else
                                {
                                    Console.WriteLine("[CLOUD_AUTH] ⚠️ Frontend userId does not match backend session.");
                                }
                            }
                        }
                        else
                        {
                            Console.WriteLine("[CLOUD_AUTH] ⚠️ Failed to validate frontend token with cloud.");
                        }
                    }
                    else
                    {
                        Console.WriteLine("[CLOUD_AUTH] No frontend token provided — will initiate new login.");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH] ⚠️ Failed token check or backend session validation: {ex.Message}");
            }

            // STEP 2: Fallback — initiate full cloud login flow
            var initiateUrl = $"{cloudApiUrl}/api/auth/initiate-login";
            var backendId = _cloudSessionStore.GetBackendId();
            var payload = new
            {
                origin = origin,
                redirectUrl = redirectUrl,
                backendId = backendId
            };

            try
            {
                var response = await _httpClient.PostAsJsonAsync(initiateUrl, payload);
                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_AUTH] ❌ Failed to initiate cloud auth: {response.StatusCode}");
                    return StatusCode(500, new { message = "Failed to initiate cloud auth" });
                }

                var json = await response.Content.ReadFromJsonAsync<JsonElement>();
                Console.WriteLine("[CLOUD_AUTH] 🔁 Starting new cloud login flow.");
                return Ok(json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH] ❌ Error initiating login request to cloud: {ex.Message}");
                return StatusCode(500, new { message = "Error contacting cloud" });
            }
        }


        [HttpPost("exchange-code")]
        public IActionResult ExchangeCode([FromBody] CloudAuthExchangeRequest request)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                Console.WriteLine("❌ Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            Console.WriteLine($"🌐 Exchanging code with cloud. Code={request.Code}, State={request.State}, Backend={request.BackendId}");

            var exchangeUrl = $"{cloudApiUrl}/api/auth/exchange-code";
            var payload = new
            {
                code = request.Code,
                state = request.State,
                origin = request.Origin,
                backendId = request.BackendId
            };

            var response = _httpClient.PostAsJsonAsync(exchangeUrl, payload).Result;
            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"❌ Failed to exchange code with cloud: {response.StatusCode}");
                return StatusCode(500, new { message = "Failed to exchange cloud auth code." });
            }

            var json = response.Content.ReadFromJsonAsync<JsonElement>().Result;
            Console.WriteLine("✅ Successfully exchanged code and received cloud tokens.");
            return Ok(json);
        }


        [HttpGet("callback")]
        public async Task<IActionResult> OAuthCallback([FromQuery] string code, [FromQuery] string state)
        {
            Console.WriteLine($"Received browser callback: Code={code}, State={state}");

            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                Console.WriteLine("Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            try
            {
                Console.WriteLine("DEBUG: Starting code exchange process...");

                // Get backendId from session store
                var backendId = _cloudSessionStore.GetBackendId() ?? "";

                // Exchange code with cloud backend
                var exchangeUrl = $"{cloudApiUrl}/api/auth/exchange-code";
                var payload = new
                {
                    code = code,
                    state = state,
                    origin = $"{Request.Scheme}://{Request.Host}",
                    backendId = backendId
                };

                Console.WriteLine($"DEBUG: Making request to {exchangeUrl} with payload: {System.Text.Json.JsonSerializer.Serialize(payload)}");

                var response = await _httpClient.PostAsJsonAsync(exchangeUrl, payload);

                Console.WriteLine($"DEBUG: Exchange response status: {response.StatusCode}");

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"Failed to exchange code with cloud during callback: {response.StatusCode}, Content: {errorContent}");
                    return Redirect("/settings?auth=error&message=Failed to complete authentication");
                }

                Console.WriteLine("DEBUG: Reading response content...");
                var tokenData = await response.Content.ReadFromJsonAsync<JsonElement>();

                Console.WriteLine($"DEBUG: Token data received: {tokenData}");

                if (!tokenData.TryGetProperty("token", out var tokenElement) || !tokenData.TryGetProperty("refreshToken", out var refreshTokenElement))
                {
                    Console.WriteLine("DEBUG: Missing 'token' or 'refreshToken' in response");
                    return Redirect("/settings?auth=error&message=Invalid response from cloud");
                }

                var token = tokenElement.GetString();
                var refreshToken = refreshTokenElement.GetString();

                Console.WriteLine($"DEBUG: Extracted token: {token?.Substring(0, Math.Min(20, token?.Length ?? 0))}... (length: {token?.Length})");
                Console.WriteLine($"DEBUG: Extracted refreshToken: {refreshToken?.Substring(0, Math.Min(20, refreshToken?.Length ?? 0))}... (length: {refreshToken?.Length})");

                if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(refreshToken))
                {
                    Console.WriteLine("DEBUG: Token or refresh token is null/empty");
                    return Redirect("/settings?auth=error&message=Missing tokens in response");
                }

                // Extract userId from JWT token payload
                string? userId = null;
                try
                {
                    var parts = token.Split('.');
                    if (parts.Length == 3)
                    {
                        var payloadBase64 = parts[1];
                        // Pad base64 string if needed
                        switch (payloadBase64.Length % 4)
                        {
                            case 2: payloadBase64 += "=="; break;
                            case 3: payloadBase64 += "="; break;
                        }
                        var bytes = Convert.FromBase64String(payloadBase64);
                        var jsonPayload = Encoding.UTF8.GetString(bytes);
                        using var doc = JsonDocument.Parse(jsonPayload);
                        if (doc.RootElement.TryGetProperty("userId", out var userIdElement))
                        {
                            userId = userIdElement.GetString();
                            Console.WriteLine($"Extracted userId from token payload: {userId}");
                        }
                        else
                        {
                            Console.WriteLine("WARNING: userId property not found in JWT payload");
                        }
                    }
                    else
                    {
                        Console.WriteLine("WARNING: JWT token format invalid");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"WARNING: Failed to parse JWT token payload: {ex.Message}");
                }

                // Store the token in backend session store if we have userId
                if (!string.IsNullOrEmpty(userId))
                {
                    try
                    {
                        _cloudSessionStore.StoreSession(token, refreshToken, userId);
                        Console.WriteLine("Stored tokens in local cloud session store successfully");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"WARNING: Failed to store tokens in local session store: {ex.Message}");
                    }
                }
                else
                {
                    Console.WriteLine("WARNING: userId not found in token data; cannot store session");
                }

                Console.WriteLine("Successfully exchanged code during callback, received tokens.");

                // Redirect to settings page with tokens as URL parameters for frontend capture
                var settingsUrl = $"/settings?auth=success&token={Uri.EscapeDataString(token)}&refreshToken={Uri.EscapeDataString(refreshToken)}";

                Console.WriteLine($"DEBUG: Redirecting to: {settingsUrl}");
                Console.WriteLine("DEBUG: About to call Redirect()...");

                var redirectResult = Redirect(settingsUrl);

                Console.WriteLine("DEBUG: Redirect() called successfully, returning result");

                return redirectResult;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"DEBUG: Exception during OAuth callback processing: {ex}");
                return Redirect("/settings?auth=error&message=Authentication failed");
            }
        }

        [HttpGet("user-info")]
        public async Task<IActionResult> GetCloudUserInfo()
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                _logger.LogError("Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            // Get the cloud proxy token from the Authorization header
            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                return Unauthorized(new { message = "No cloud authentication token provided" });
            }

            var token = authHeader.Substring("Bearer ".Length);

            try
            {
                var userInfoUrl = $"{cloudApiUrl}/api/auth/user-info";
                using var request = new HttpRequestMessage(HttpMethod.Get, userInfoUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError("Failed to get cloud user info. StatusCode: {StatusCode}", response.StatusCode);
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        return Unauthorized(new { message = "Invalid or expired cloud token" });
                    }
                    return StatusCode((int)response.StatusCode, new { message = "Failed to get cloud user info" });
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                _logger.LogInformation("Successfully retrieved cloud user info.");

                return Ok(json);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting cloud user info");
                return StatusCode(500, new { message = "Failed to get cloud user info" });
            }
        }

        [HttpPost("clear-access-token")]
        public IActionResult ClearAccessTokenForDebug()
        {
            _cloudSessionStore.ClearAccessTokenOnly();
            return Ok(new { message = "Access token cleared - refresh token preserved - next heartbeat will trigger refresh" });
        }

        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                _logger.LogError("Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            // Use stored refresh token from session
            var refreshToken = _cloudSessionStore.GetRefreshToken();

            if (string.IsNullOrEmpty(refreshToken))
            {
                _logger.LogWarning("No refresh token found in session — skipping cloud logout");
                _cloudSessionStore.ClearSession();
                return Ok(new { message = "Session cleared locally (no refresh token available)" });
            }

            try
            {
                var logoutUrl = $"{cloudApiUrl}/api/auth/logout";
                var payload = new { refreshToken };

                var response = await _httpClient.PostAsJsonAsync(logoutUrl, payload);
                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("Successfully logged out from cloud");
                    _cloudSessionStore.ClearSession();
                    return Ok(new { message = "Logged out from cloud successfully" });
                }
                else
                {
                    _logger.LogWarning("Failed to log out from cloud: {StatusCode}", response.StatusCode);
                    _cloudSessionStore.ClearSession();
                    return Ok(new { message = "Logged out locally (cloud logout may have failed)" });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during cloud logout");
                _cloudSessionStore.ClearSession();
                return Ok(new { message = "Logged out locally (cloud logout failed)" });
            }
        }


        [HttpGet("backendstatus")]
        public IActionResult GetBackendCloudAuthStatus()
        {
            try
            {
                // Check if cloud session store has valid authentication
                var isAuthenticated = _cloudSessionStore.IsAuthenticated;
                var userId = _cloudSessionStore.GetUserId();

                return Ok(new
                {
                    isAuthenticated = isAuthenticated,
                    userId = userId,
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking cloud auth status");
                return Ok(new
                {
                    isAuthenticated = false,
                    userId = (string?)null,
                    timestamp = DateTime.UtcNow,
                    error = "Failed to check authentication status"
                });
            }
        }

        [HttpPost("validate")]
        public async Task<IActionResult> ValidateCloudToken()
        {
            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                return Unauthorized(new { message = "No cloud authentication token provided" });
            }

            var token = authHeader.Substring("Bearer ".Length);
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];

            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                return StatusCode(500, new { message = "Cloud API not configured" });
            }

            try
            {
                var validateUrl = $"{cloudApiUrl}/api/auth/validate-token";
                using var request = new HttpRequestMessage(HttpMethod.Post, validateUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadFromJsonAsync<JsonElement>();
                    return Ok(json);
                }
                else
                {
                    return Unauthorized(new { message = "Invalid cloud token" });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error validating cloud token");
                return StatusCode(500, new { message = "Failed to validate cloud token" });
            }
        }

        // NEW ACCOUNT MANAGEMENT ENDPOINTS

        [HttpPost("activate-license")]
        public async Task<IActionResult> ActivateLicense([FromBody] JsonElement request)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                return Unauthorized(new { message = "No cloud authentication token provided" });
            }

            var token = authHeader.Substring("Bearer ".Length);

            try
            {
                var activateUrl = $"{cloudApiUrl}/api/auth/activate-license";
                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, activateUrl);
                httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                httpRequest.Content = new StringContent(request.GetRawText(), System.Text.Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(httpRequest);
                var responseContent = await response.Content.ReadAsStringAsync();

                _logger.LogInformation("License activation response: {StatusCode}", response.StatusCode);

                if (response.IsSuccessStatusCode)
                {
                    var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return Ok(json);
                }
                else
                {
                    var errorJson = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return StatusCode((int)response.StatusCode, errorJson);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error activating license");
                return StatusCode(500, new { message = "Failed to activate license" });
            }
        }

        [HttpDelete("remove-license")]
        public async Task<IActionResult> RemoveLicense()
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                return Unauthorized(new { message = "No cloud authentication token provided" });
            }

            var token = authHeader.Substring("Bearer ".Length);

            try
            {
                var removeLicenseUrl = $"{cloudApiUrl}/api/auth/remove-license";
                using var httpRequest = new HttpRequestMessage(HttpMethod.Delete, removeLicenseUrl);
                httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(httpRequest);
                var responseContent = await response.Content.ReadAsStringAsync();

                _logger.LogInformation("License removal response: {StatusCode}", response.StatusCode);

                if (response.IsSuccessStatusCode)
                {
                    var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return Ok(json);
                }
                else
                {
                    var errorJson = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return StatusCode((int)response.StatusCode, errorJson);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error removing license");
                return StatusCode(500, new { message = "Failed to remove license" });
            }
        }

        [HttpPost("update-profile")]
        public async Task<IActionResult> UpdateProfile([FromBody] JsonElement request)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                return Unauthorized(new { message = "No cloud authentication token provided" });
            }

            var token = authHeader.Substring("Bearer ".Length);

            try
            {
                var updateUrl = $"{cloudApiUrl}/api/auth/update-profile";
                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, updateUrl);
                httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                httpRequest.Content = new StringContent(request.GetRawText(), System.Text.Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(httpRequest);
                var responseContent = await response.Content.ReadAsStringAsync();

                _logger.LogInformation("Profile update response: {StatusCode}", response.StatusCode);

                if (response.IsSuccessStatusCode)
                {
                    var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return Ok(json);
                }
                else
                {
                    var errorJson = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return StatusCode((int)response.StatusCode, errorJson);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating profile");
                return StatusCode(500, new { message = "Failed to update profile" });
            }
        }

        [HttpPost("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] JsonElement request)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                return Unauthorized(new { message = "No cloud authentication token provided" });
            }

            var token = authHeader.Substring("Bearer ".Length);

            try
            {
                var changePasswordUrl = $"{cloudApiUrl}/api/auth/change-password";
                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, changePasswordUrl);
                httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                httpRequest.Content = new StringContent(request.GetRawText(), System.Text.Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(httpRequest);
                var responseContent = await response.Content.ReadAsStringAsync();

                _logger.LogInformation("Password change response: {StatusCode}", response.StatusCode);

                if (response.IsSuccessStatusCode)
                {
                    var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return Ok(json);
                }
                else
                {
                    var errorJson = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return StatusCode((int)response.StatusCode, errorJson);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error changing password");
                return StatusCode(500, new { message = "Failed to change password" });
            }
        }

        // Add this method to your Controller_CloudAuth.cs class

        [HttpGet("devices")]
        public async Task<IActionResult> GetCloudDevices()
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                _logger.LogError("Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            // Get the cloud proxy token from the Authorization header
            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                return Unauthorized(new { message = "No cloud authentication token provided" });
            }

            var token = authHeader.Substring("Bearer ".Length);

            try
            {
                var devicesUrl = $"{cloudApiUrl}/api/devices";
                using var request = new HttpRequestMessage(HttpMethod.Get, devicesUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError("Failed to get cloud devices. StatusCode: {StatusCode}", response.StatusCode);
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        return Unauthorized(new { message = "Invalid or expired cloud token" });
                    }
                    return StatusCode((int)response.StatusCode, new { message = "Failed to get cloud devices" });
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                _logger.LogInformation("Successfully retrieved cloud devices.");

                return Ok(json);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting cloud devices");
                return StatusCode(500, new { message = "Failed to get cloud devices" });
            }
        }

        [HttpPost("devices/register")]
        public async Task<IActionResult> RegisterCloudDevice([FromBody] JsonElement request)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                return Unauthorized(new { message = "No cloud authentication token provided" });
            }

            var token = authHeader.Substring("Bearer ".Length);

            try
            {
                var registerUrl = $"{cloudApiUrl}/api/devices/register";
                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, registerUrl);
                httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                httpRequest.Content = new StringContent(request.GetRawText(), System.Text.Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(httpRequest);
                var responseContent = await response.Content.ReadAsStringAsync();

                _logger.LogInformation("Cloud device registration response: {StatusCode}", response.StatusCode);

                if (response.IsSuccessStatusCode)
                {
                    var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return Ok(json);
                }
                else
                {
                    var errorJson = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return StatusCode((int)response.StatusCode, errorJson);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error registering cloud device");
                return StatusCode(500, new { message = "Failed to register cloud device" });
            }
        }

        [HttpPost("create-checkout")]
        public async Task<IActionResult> CreateCheckout([FromBody] JsonElement requestBody)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
                return StatusCode(500, new { message = "Cloud API not configured." });

            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                return Unauthorized(new { message = "No cloud authentication token provided" });

            var token = authHeader.Substring("Bearer ".Length);

            try
            {
                var checkoutUrl = $"{cloudApiUrl}/api/billing/create-checkout";
                using var request = new HttpRequestMessage(HttpMethod.Post, checkoutUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                request.Content = new StringContent(requestBody.GetRawText(), Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return Ok(json);
                }
                else
                {
                    var errorJson = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return StatusCode((int)response.StatusCode, errorJson);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating checkout session");
                return StatusCode(500, new { message = "Failed to create checkout session" });
            }
        }

        [HttpGet("subscription-status")]
        public async Task<IActionResult> GetSubscriptionStatus()
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
                return StatusCode(500, new { message = "Cloud API not configured." });

            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                return Unauthorized(new { message = "No cloud authentication token provided" });

            var token = authHeader.Substring("Bearer ".Length);

            try
            {
                var subscriptionUrl = $"{cloudApiUrl}/api/billing/subscription-status";
                using var request = new HttpRequestMessage(HttpMethod.Get, subscriptionUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();
                    var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return Ok(json);
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    var errorJson = JsonSerializer.Deserialize<JsonElement>(errorContent);
                    return StatusCode((int)response.StatusCode, errorJson);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting subscription status");
                return StatusCode(500, new { message = "Failed to get subscription status" });
            }
        }

        // TOKEN DEBUG

        [HttpGet("tokens")]
        public IActionResult GetTokensForDebug()
        {
            var accessToken = _cloudSessionStore.GetAccessToken();
            var refreshToken = _cloudSessionStore.GetRefreshToken();
            var userId = _cloudSessionStore.GetUserId();
            var isAuthenticated = _cloudSessionStore.IsAuthenticated;

            return Ok(new
            {
                hasAccessToken = !string.IsNullOrEmpty(accessToken),
                hasRefreshToken = !string.IsNullOrEmpty(refreshToken),
                userId = userId,
                isAuthenticated = isAuthenticated,
                accessTokenLength = accessToken?.Length ?? 0,
                refreshTokenLength = refreshToken?.Length ?? 0,
                // Show first 20 chars for debugging (safe to show)
                accessTokenPreview = accessToken?.Substring(0, Math.Min(20, accessToken?.Length ?? 0)) + "...",
                refreshTokenPreview = refreshToken?.Substring(0, Math.Min(20, refreshToken?.Length ?? 0)) + "..."
            });
        }

        [HttpGet("validate-token")]
        public async Task<IActionResult> ValidateTokenForDebug()
        {
            try
            {
                Console.WriteLine("[DEBUG] Starting GetValidAccessTokenAsync test...");
                var token = await _cloudSessionStore.GetValidAccessTokenAsync();

                return Ok(new
                {
                    success = !string.IsNullOrEmpty(token),
                    hasToken = !string.IsNullOrEmpty(token),
                    tokenLength = token?.Length ?? 0,
                    tokenPreview = token?.Substring(0, Math.Min(20, token?.Length ?? 0)) + "...",
                    isAuthenticated = _cloudSessionStore.IsAuthenticated,
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return Ok(new
                {
                    success = false,
                    error = ex.Message,
                    stackTrace = ex.StackTrace,
                    timestamp = DateTime.UtcNow
                });
            }
        }

        [HttpGet("token-config")]
        public IActionResult GetConfigForDebug()
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            return Ok(new
            {
                cloudApiUrl = cloudApiUrl,
                hasCloudApiUrl = !string.IsNullOrEmpty(cloudApiUrl),
                fullRefreshUrl = !string.IsNullOrEmpty(cloudApiUrl) ? $"{cloudApiUrl}/api/auth/refresh" : "N/A"
            });
        }

        [HttpGet("token-expiry")]
        public IActionResult GetTokenExpiryDebug()
        {
            var accessToken = _cloudSessionStore.GetAccessToken();

            if (string.IsNullOrEmpty(accessToken))
            {
                return Ok(new { error = "No access token available" });
            }

            try
            {
                // Manually extract expiry to debug
                var parts = accessToken.Split('.');
                if (parts.Length != 3)
                {
                    return Ok(new { error = "Invalid JWT format", partsCount = parts.Length });
                }

                var payload = parts[1];

                // Add padding
                switch (payload.Length % 4)
                {
                    case 2: payload += "=="; break;
                    case 3: payload += "="; break;
                }

                var bytes = Convert.FromBase64String(payload);
                var json = System.Text.Encoding.UTF8.GetString(bytes);

                using var doc = System.Text.Json.JsonDocument.Parse(json);
                var hasExp = doc.RootElement.TryGetProperty("exp", out var expElement);

                if (hasExp)
                {
                    var exp = expElement.GetInt64();
                    var expiry = DateTimeOffset.FromUnixTimeSeconds(exp).UtcDateTime;
                    var minutesLeft = expiry.Subtract(DateTime.UtcNow).TotalMinutes;

                    return Ok(new
                    {
                        success = true,
                        rawPayload = json,
                        hasExpProperty = hasExp,
                        expValue = exp,
                        expiryTime = expiry,
                        minutesLeft = minutesLeft,
                        currentTime = DateTime.UtcNow
                    });
                }
                else
                {
                    return Ok(new
                    {
                        error = "No 'exp' property found in token",
                        rawPayload = json
                    });
                }
            }
            catch (Exception ex)
            {
                return Ok(new
                {
                    error = ex.Message,
                    stackTrace = ex.StackTrace
                });
            }
        }
    }

    public class CloudAuthInitiateRequest
    {
        public string Origin { get; set; } = "";
        public string? RedirectUrl { get; set; }
    }

    public class CloudAuthExchangeRequest
    {
        public string Code { get; set; } = "";
        public string State { get; set; } = "";
        public string Origin { get; set; } = "";
        public string BackendId { get; set; } = "";
    }
}

// Extension method to help with reading raw request body
public static class HttpRequestExtensions
{
    public static async Task<string> GetRawBodyStringAsync(this HttpRequest request)
    {
        using var reader = new StreamReader(request.Body);
        return await reader.ReadToEndAsync();
    }
}