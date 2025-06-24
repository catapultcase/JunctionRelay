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

        public Controller_CloudAuth(
            ILogger<Controller_CloudAuth> logger,
            IConfiguration configuration,
            IHttpClientFactory httpClientFactory)
        {
            _logger = logger;
            _configuration = configuration;
            _httpClient = httpClientFactory.CreateClient();
        }

        [HttpPost("initiate-login")]
        public IActionResult InitiateLogin([FromBody] CloudAuthInitiateRequest? request)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                _logger.LogError("Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            var origin = request?.Origin ?? $"{Request.Scheme}://{Request.Host}";
            _logger.LogInformation("Initiating login. Origin: {Origin}, CloudAPI: {CloudApiUrl}", origin, cloudApiUrl);

            var initiateUrl = $"{cloudApiUrl}/api/auth/initiate-login";
            var payload = new { origin = origin };

            var response = _httpClient.PostAsJsonAsync(initiateUrl, payload).Result;
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Failed to initiate cloud auth: {StatusCode}", response.StatusCode);
                return StatusCode(500, new { message = "Failed to initiate cloud auth" });
            }

            var json = response.Content.ReadFromJsonAsync<JsonElement>().Result;
            _logger.LogInformation("Received successful response from cloud initiate-login.");
            return Ok(json);
        }

        [HttpPost("exchange-code")]
        public IActionResult ExchangeCode([FromBody] CloudAuthExchangeRequest request)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                _logger.LogError("Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            _logger.LogInformation("Exchanging code with cloud. Code={Code}, State={State}", request.Code, request.State);

            var exchangeUrl = $"{cloudApiUrl}/api/auth/exchange-code";
            var payload = new
            {
                code = request.Code,
                state = request.State,
                origin = request.Origin
            };

            var response = _httpClient.PostAsJsonAsync(exchangeUrl, payload).Result;
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Failed to exchange code with cloud: {StatusCode}", response.StatusCode);
                return StatusCode(500, new { message = "Failed to exchange cloud auth code." });
            }

            var json = response.Content.ReadFromJsonAsync<JsonElement>().Result;
            _logger.LogInformation("Successfully exchanged code and received cloud tokens.");
            return Ok(json);
        }

        [HttpGet("callback")]
        public async Task<IActionResult> OAuthCallback([FromQuery] string code, [FromQuery] string state)
        {
            _logger.LogInformation("Received browser callback: Code={Code}, State={State}", code, state);

            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                _logger.LogError("Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            try
            {
                _logger.LogInformation("DEBUG: Starting code exchange process...");

                // Exchange code with cloud backend
                var exchangeUrl = $"{cloudApiUrl}/api/auth/exchange-code";
                var payload = new
                {
                    code = code,
                    state = state,
                    origin = $"{Request.Scheme}://{Request.Host}"
                };

                _logger.LogInformation("DEBUG: Making request to {ExchangeUrl} with payload: {@Payload}", exchangeUrl, payload);

                var response = await _httpClient.PostAsJsonAsync(exchangeUrl, payload);

                _logger.LogInformation("DEBUG: Exchange response status: {StatusCode}", response.StatusCode);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogError("Failed to exchange code with cloud during callback: {StatusCode}, Content: {Content}", response.StatusCode, errorContent);
                    return Redirect("/settings?auth=error&message=Failed to complete authentication");
                }

                _logger.LogInformation("DEBUG: Reading response content...");
                var tokenData = await response.Content.ReadFromJsonAsync<JsonElement>();

                _logger.LogInformation("DEBUG: Token data received: {TokenData}", tokenData);

                // Extract the JWT token and refresh token from cloud response
                _logger.LogInformation("DEBUG: Extracting tokens from response...");

                if (!tokenData.TryGetProperty("token", out var tokenElement))
                {
                    _logger.LogError("DEBUG: No 'token' property found in response");
                    return Redirect("/settings?auth=error&message=Invalid response from cloud");
                }

                if (!tokenData.TryGetProperty("refreshToken", out var refreshTokenElement))
                {
                    _logger.LogError("DEBUG: No 'refreshToken' property found in response");
                    return Redirect("/settings?auth=error&message=Invalid response from cloud");
                }

                var token = tokenElement.GetString();
                var refreshToken = refreshTokenElement.GetString();

                _logger.LogInformation("DEBUG: Extracted token: {Token} (length: {TokenLength})",
                    token?.Substring(0, Math.Min(20, token?.Length ?? 0)) + "...", token?.Length);
                _logger.LogInformation("DEBUG: Extracted refreshToken: {RefreshToken} (length: {RefreshTokenLength})",
                    refreshToken?.Substring(0, Math.Min(20, refreshToken?.Length ?? 0)) + "...", refreshToken?.Length);

                if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(refreshToken))
                {
                    _logger.LogError("DEBUG: Token or refresh token is null/empty");
                    return Redirect("/settings?auth=error&message=Missing tokens in response");
                }

                _logger.LogInformation("Successfully exchanged code during callback, received tokens.");

                // Redirect to settings page with tokens as URL parameters
                // The frontend will capture these and store them appropriately
                var settingsUrl = $"/settings?auth=success&token={Uri.EscapeDataString(token)}&refreshToken={Uri.EscapeDataString(refreshToken)}";

                _logger.LogInformation("DEBUG: Redirecting to: {SettingsUrl}", settingsUrl);
                _logger.LogInformation("DEBUG: About to call Redirect()...");

                var redirectResult = Redirect(settingsUrl);

                _logger.LogInformation("DEBUG: Redirect() called successfully, returning result");

                return redirectResult;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DEBUG: Exception during OAuth callback processing");
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

        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                _logger.LogError("Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            // Get the refresh token from the request body or headers
            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            string? refreshToken = null;

            if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
            {
                // For logout, we might want to pass the refresh token
                // You could modify this to accept refresh token in request body
                try
                {
                    var requestBody = await Request.GetRawBodyStringAsync();
                    if (!string.IsNullOrEmpty(requestBody))
                    {
                        var logoutData = JsonSerializer.Deserialize<JsonElement>(requestBody);
                        if (logoutData.TryGetProperty("refreshToken", out var refreshTokenElement))
                        {
                            refreshToken = refreshTokenElement.GetString();
                        }
                    }
                }
                catch
                {
                    // If we can't parse the body, just proceed without refresh token
                }
            }

            try
            {
                var logoutUrl = $"{cloudApiUrl}/api/auth/logout";
                var payload = new { refreshToken = refreshToken ?? "" };

                var response = await _httpClient.PostAsJsonAsync(logoutUrl, payload);

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("Successfully logged out from cloud");
                    return Ok(new { message = "Logged out from cloud successfully" });
                }
                else
                {
                    _logger.LogWarning("Failed to log out from cloud: {StatusCode}", response.StatusCode);
                    return Ok(new { message = "Logged out locally (cloud logout may have failed)" });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during cloud logout");
                return Ok(new { message = "Logged out locally (cloud logout failed)" });
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
    }

    public class CloudAuthInitiateRequest
    {
        public string Origin { get; set; } = "";
    }

    public class CloudAuthExchangeRequest
    {
        public string Code { get; set; } = "";
        public string State { get; set; } = "";
        public string Origin { get; set; } = "";
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