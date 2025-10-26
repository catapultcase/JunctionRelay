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
using System.Text.Json;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using System.Security.Cryptography;
using System.Collections.Concurrent;

namespace JunctionRelayServer.Services
{
    public class Service_CloudAuth : ICloudAuthService
    {
        private readonly IConfiguration _configuration;
        private readonly HttpClient _httpClient;
        private readonly Service_CloudSessionStore _cloudSessionStore;
        private readonly IMemoryCache _cache;
        private readonly IService_Auth _authService;
        private readonly IService_Settings _settingsService;
        private readonly IService_Jwt _jwtService;

        // Cache configuration
        private static readonly TimeSpan ValidResponseCacheDuration = TimeSpan.FromSeconds(60);
        private static readonly TimeSpan InvalidResponseCacheDuration = TimeSpan.FromSeconds(30);
        private static readonly TimeSpan ReadOnlyOperationCacheDuration = TimeSpan.FromMinutes(2);

        // Singleflight implementation - one semaphore per cache key
        private static readonly ConcurrentDictionary<string, SemaphoreSlim> _singleflightGates = new();

        // Fallback authentication setting key
        private const string FALLBACK_ENABLED_KEY = "cloud_auth_fallback_enabled";

        public Service_CloudAuth(
            IConfiguration configuration,
            IHttpClientFactory httpClientFactory,
            Service_CloudSessionStore cloudSessionStore,
            IMemoryCache cache,
            IService_Auth authService,
            IService_Settings settingsService,
            IService_Jwt jwtService)
        {
            _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
            _httpClient = httpClientFactory.CreateClient();
            _cloudSessionStore = cloudSessionStore ?? throw new ArgumentNullException(nameof(cloudSessionStore));
            _cache = cache ?? throw new ArgumentNullException(nameof(cache));
            _authService = authService ?? throw new ArgumentNullException(nameof(authService));
            _settingsService = settingsService ?? throw new ArgumentNullException(nameof(settingsService));
            _jwtService = jwtService ?? throw new ArgumentNullException(nameof(jwtService));
        }

        public async Task<IActionResult> InitiateLoginAsync(JsonElement request)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrWhiteSpace(cloudApiUrl))
            {
                Console.WriteLine("[CLOUD_AUTH] Cloud API URL not configured.");
                return new ObjectResult(new { message = "Cloud API not configured." }) { StatusCode = 500 };
            }

            var origin = request.TryGetProperty("origin", out var originElement)
                ? originElement.GetString()
                : "http://localhost:7180";

            Console.WriteLine($"[CLOUD_AUTH] Initiating login. Origin: {origin}");

            try
            {
                var initiateUrl = $"{cloudApiUrl}/auth/initiate-login";
                var payload = new { origin };

                var response = await _httpClient.PostAsJsonAsync(initiateUrl, payload);
                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_AUTH] Failed to initiate cloud auth: {response.StatusCode}");
                    return new ObjectResult(new { message = "Failed to initiate cloud auth" }) { StatusCode = 500 };
                }

                var json = await response.Content.ReadFromJsonAsync<JsonElement>();

                if (json.ValueKind == JsonValueKind.Object &&
                    json.TryGetProperty("authUrl", out var authUrlEl) &&
                    authUrlEl.ValueKind == JsonValueKind.String)
                {
                    var authUrl = authUrlEl.GetString();
                    if (!string.IsNullOrWhiteSpace(authUrl))
                    {
                        Console.WriteLine("[CLOUD_AUTH] 🔁 Returning authUrl for browser redirect.");
                        return new OkObjectResult(new { authUrl });
                    }
                }

                Console.WriteLine("[CLOUD_AUTH] Cloud response missing authUrl; refusing to return tokens.");
                return new ObjectResult(new { message = "Auth URL not available" }) { StatusCode = 500 };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH] Error initiating login: {ex.Message}");
                return new ObjectResult(new { message = "Error contacting cloud" }) { StatusCode = 500 };
            }
        }

        public async Task<IActionResult> ExchangeCodeAsync(JsonElement request)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                Console.WriteLine("Cloud API URL not configured.");
                return new ObjectResult(new { message = "Cloud API not configured." }) { StatusCode = 500 };
            }

            if (!request.TryGetProperty("code", out var codeElement) ||
                !request.TryGetProperty("state", out var stateElement))
            {
                return new BadRequestObjectResult(new { message = "Code and state are required" });
            }

            var code = codeElement.GetString();
            var state = stateElement.GetString();

            var backendId = _cloudSessionStore.GetBackendId() ?? "";
            var friendlyName = _cloudSessionStore.GetFriendlyName();

            Console.WriteLine($"[CLOUD_AUTH] 🌐 Exchanging code with cloud. Code={code}, State={state}, Backend={backendId}");

            try
            {
                var exchangeUrl = $"{cloudApiUrl}/auth/exchange-code";
                var payload = new
                {
                    code = code,
                    state = state,
                    backendId = backendId,
                    friendlyName = friendlyName
                };

                var response = await _httpClient.PostAsJsonAsync(exchangeUrl, payload);
                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_AUTH] Failed to exchange code with cloud: {response.StatusCode}");
                    return new ObjectResult(new { message = "Failed to exchange cloud auth code." }) { StatusCode = 500 };
                }

                var tokenData = await response.Content.ReadFromJsonAsync<JsonElement>();

                if (tokenData.TryGetProperty("token", out var tokenElement) &&
                    tokenData.TryGetProperty("refreshToken", out var refreshTokenElement))
                {
                    var token = tokenElement.GetString();
                    var refreshToken = refreshTokenElement.GetString();

                    if (!string.IsNullOrEmpty(token) && !string.IsNullOrEmpty(refreshToken))
                    {
                        string? userId = ExtractUserIdFromToken(token);
                        if (!string.IsNullOrEmpty(userId))
                        {
                            _cloudSessionStore.StoreSession(token, refreshToken, userId);
                            Console.WriteLine("[CLOUD_AUTH] ✅ Stored tokens in cloud session store successfully");

                            // Clear any cached data for the old session (covers user-info, validate, sessions)
                            InvalidateUserCaches(token);
                        }
                    }
                }

                Console.WriteLine("[CLOUD_AUTH] ✅ Successfully exchanged code and received cloud tokens.");
                return new OkObjectResult(tokenData);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH] Error during code exchange: {ex.Message}");
                return new ObjectResult(new { message = "Error during code exchange" }) { StatusCode = 500 };
            }
        }

        public async Task<IActionResult> HandleCallbackAsync(string code, string state, HttpContext httpContext)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                Console.WriteLine("[CLOUD_AUTH] Cloud API URL not configured.");
                return new RedirectResult("/settings?auth=error&message=Cloud API not configured");
            }

            try
            {
                var backendId = _cloudSessionStore.GetBackendId() ?? "";
                var friendlyName = _cloudSessionStore.GetFriendlyName();

                var exchangeUrl = $"{cloudApiUrl}/auth/exchange-code";
                var payload = new
                {
                    code = code,
                    state = state,
                    backendId = backendId,
                    friendlyName = friendlyName
                };

                var response = await _httpClient.PostAsJsonAsync(exchangeUrl, payload);
                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUD_AUTH] Failed to exchange code during callback: {response.StatusCode}, Content: {errorContent}");
                    return new RedirectResult("/settings?auth=error&message=Failed to complete authentication");
                }

                var tokenData = await response.Content.ReadFromJsonAsync<JsonElement>();
                if (!tokenData.TryGetProperty("token", out var tokenElement) ||
                    !tokenData.TryGetProperty("refreshToken", out var refreshTokenElement))
                {
                    Console.WriteLine("[CLOUD_AUTH] Missing 'token' or 'refreshToken' in response");
                    return new RedirectResult("/settings?auth=error&message=Invalid response from cloud");
                }

                var token = tokenElement.GetString();
                var refreshToken = refreshTokenElement.GetString();

                if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(refreshToken))
                {
                    Console.WriteLine("[CLOUD_AUTH] Token or refresh token is null/empty");
                    return new RedirectResult("/settings?auth=error&message=Missing tokens in response");
                }

                string? userId = ExtractUserIdFromToken(token);
                if (!string.IsNullOrEmpty(userId))
                {
                    _cloudSessionStore.StoreSession(token, refreshToken, userId);
                    Console.WriteLine("[CLOUD_AUTH] Stored tokens in cloud session store successfully");

                    // Clear any cached data for the old session
                    InvalidateUserCaches(token);
                }

                var settingsUrl = $"/settings?auth=success&token={Uri.EscapeDataString(token)}&refreshToken={Uri.EscapeDataString(refreshToken)}";
                return new RedirectResult(settingsUrl);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH] Exception during OAuth callback processing: {ex}");
                return new RedirectResult("/settings?auth=error&message=Authentication failed");
            }
        }

        public async Task<IActionResult> GetUserInfoAsync(string? authHeader)
            => await ProxyCloudRequest("auth/user-info", HttpMethod.Get, authHeader, cacheDuration: ReadOnlyOperationCacheDuration);

        // Non-cached version for backend token validation (avoids stale cache after token refresh)
        private async Task<IActionResult> ValidateBackendTokenAsync(string backendToken)
            => await ProxyCloudRequest("auth/user-info", HttpMethod.Get, $"Bearer {backendToken}", cacheDuration: null);

        public async Task<IActionResult> ValidateTokenAsync(string? authHeader)
            => await ProxyCloudRequest("auth/validate-token", HttpMethod.Post, authHeader, cacheDuration: ValidResponseCacheDuration);

        public async Task<IActionResult> GetAuthStatusAsync(string? authHeader)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                return new OkObjectResult(new
                {
                    authMode = "cloud",
                    isAuthenticated = false,
                    user = (string?)null,
                    hasValidLicense = false,
                    licenseType = "Cloud",
                    backendAuthenticated = false,
                    profileImageUrl = (string?)null,
                    error = "Cloud API not configured"
                });
            }

            try
            {
                var backendToken = await _cloudSessionStore.GetValidAccessTokenAsync();
                var userId = _cloudSessionStore.GetUserId();

                if (string.IsNullOrEmpty(backendToken) || string.IsNullOrEmpty(userId))
                {
                    return new OkObjectResult(new
                    {
                        authMode = "cloud",
                        isAuthenticated = false,
                        user = (string?)null,
                        hasValidLicense = false,
                        licenseType = "Cloud",
                        backendAuthenticated = false,
                        profileImageUrl = (string?)null
                    });
                }

                // Validate backend token without caching (to avoid stale cache after token refresh)
                var userInfoResult = await ValidateBackendTokenAsync(backendToken);

                if (userInfoResult is OkObjectResult okResult && okResult.Value is JsonElement userInfo)
                {
                    return new OkObjectResult(new
                    {
                        authMode = "cloud",
                        isAuthenticated = true,
                        user = userInfo.TryGetProperty("email", out var email) ? email.GetString() : userId,
                        hasValidLicense = userInfo.TryGetProperty("hasValidLicense", out var license) && license.GetBoolean(),
                        licenseType = userInfo.TryGetProperty("hasValidLicense", out var lic) && lic.GetBoolean() ? "Pro" : "Cloud",
                        backendAuthenticated = true,
                        profileImageUrl = userInfo.TryGetProperty("profileImageUrl", out var imgUrl) ? imgUrl.GetString() : null  // ✅ Add this
                    });
                }
                else
                {
                    return new OkObjectResult(new
                    {
                        authMode = "cloud",
                        isAuthenticated = false,
                        user = (string?)null,
                        hasValidLicense = false,
                        licenseType = "Cloud",
                        backendAuthenticated = false,
                        profileImageUrl = (string?)null
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH] Error getting cloud auth status: {ex.Message}");
                return new OkObjectResult(new
                {
                    authMode = "cloud",
                    isAuthenticated = false,
                    user = (string?)null,
                    hasValidLicense = false,
                    licenseType = "Cloud",
                    backendAuthenticated = false,
                    profileImageUrl = (string?)null
                });
            }
        }

        public async Task<IActionResult> LogoutAsync(string? authHeader)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                return new ObjectResult(new { message = "Cloud API not configured." }) { StatusCode = 500 };
            }

            var refreshToken = _cloudSessionStore.GetRefreshToken();
            var backendId = _cloudSessionStore.GetBackendId();

            // Clear all caches for this user before logging out
            if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
            {
                var token = authHeader.Substring("Bearer ".Length);
                InvalidateUserCaches(token);
            }

            if (string.IsNullOrEmpty(refreshToken))
            {
                Console.WriteLine("[CLOUD_AUTH] No refresh token found — skipping cloud logout");
                _cloudSessionStore.ClearSession();
                return new OkObjectResult(new { message = "Session cleared locally (no refresh token available)" });
            }

            try
            {
                var logoutUrl = $"{cloudApiUrl}/auth/logout";
                var payload = new
                {
                    refreshToken = refreshToken,
                    backendId = backendId
                };

                var response = await _httpClient.PostAsJsonAsync(logoutUrl, payload);
                if (response.IsSuccessStatusCode)
                {
                    Console.WriteLine("[CLOUD_AUTH] Successfully logged out from cloud");
                    _cloudSessionStore.ClearSession();
                    return new OkObjectResult(new { message = "Logged out from cloud successfully" });
                }
                else
                {
                    Console.WriteLine($"[CLOUD_AUTH] Failed to log out from cloud: {response.StatusCode}");
                    _cloudSessionStore.ClearSession();
                    return new OkObjectResult(new { message = "Logged out locally (cloud logout may have failed)" });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH] Error during cloud logout: {ex.Message}");
                _cloudSessionStore.ClearSession();
                return new OkObjectResult(new { message = "Logged out locally (cloud logout failed)" });
            }
        }

        public async Task<IActionResult> GetDevicesAsync(string? authHeader)
            => await ProxyCloudRequest("cloud-devices", HttpMethod.Get, authHeader, cacheDuration: ReadOnlyOperationCacheDuration);

        public async Task<IActionResult> GetSessionsAsync(string? authHeader)
            => await ProxyCloudRequest("sessions/sessions", HttpMethod.Get, authHeader, cacheDuration: ReadOnlyOperationCacheDuration);

        public async Task<IActionResult> RevokeSessionAsync(string sessionId, string? authHeader)
        {
            var result = await ProxyCloudRequest($"sessions/sessions/{Uri.EscapeDataString(sessionId)}", HttpMethod.Delete, authHeader);
            if (result is OkObjectResult && !string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
            {
                var token = authHeader.Substring("Bearer ".Length);
                var key = $"proxy:sessions/sessions:{GenerateUserKeySuffix(token)}";
                _cache.Remove(key);
                Console.WriteLine($"[CLOUD_AUTH][CACHE] 🗑️ Removed sessions cache after revocation: {key}");
            }
            return result;
        }

        public async Task<IActionResult> RevokeAllOtherSessionsAsync(string? authHeader)
        {
            var result = await ProxyCloudRequest("sessions/sessions", HttpMethod.Delete, authHeader);
            if (result is OkObjectResult && !string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
            {
                var token = authHeader.Substring("Bearer ".Length);
                var key = $"proxy:sessions/sessions:{GenerateUserKeySuffix(token)}";
                _cache.Remove(key);
                Console.WriteLine($"[CLOUD_AUTH][CACHE] 🗑️ Removed sessions cache after bulk revocation: {key}");
            }
            return result;
        }

        public async Task<IActionResult> ActivateLicenseAsync(JsonElement request, string? authHeader)
        {
            var result = await ProxyCloudRequest("auth/activate-license", HttpMethod.Post, authHeader, request);
            if (result is OkObjectResult && !string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
            {
                var token = authHeader.Substring("Bearer ".Length);
                InvalidateUserCaches(token);
            }
            return result;
        }

        public async Task<IActionResult> RemoveLicenseAsync(string? authHeader)
        {
            var result = await ProxyCloudRequest("auth/remove-license", HttpMethod.Delete, authHeader);
            if (result is OkObjectResult && !string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
            {
                var token = authHeader.Substring("Bearer ".Length);
                InvalidateUserCaches(token);
            }
            return result;
        }

        public async Task<IActionResult> UpdateProfileAsync(JsonElement request, string? authHeader)
        {
            var result = await ProxyCloudRequest("auth/update-profile", HttpMethod.Post, authHeader, request);
            if (result is OkObjectResult && !string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
            {
                var token = authHeader.Substring("Bearer ".Length);
                InvalidateUserCaches(token);
            }
            return result;
        }

        public async Task<IActionResult> CreateCheckoutAsync(JsonElement request, string? authHeader)
            => await ProxyCloudRequest("stripe/create-checkout", HttpMethod.Post, authHeader, request);

        public async Task<IActionResult> GetSubscriptionStatusAsync(string? authHeader)
            => await ProxyCloudRequest("stripe/subscription-status", HttpMethod.Get, authHeader, cacheDuration: ValidResponseCacheDuration);

        public async Task<IActionResult> GetTokenInfoAsync(string? authHeader)
        {
            var backendToken = await _cloudSessionStore.GetValidAccessTokenAsync();
            var refreshToken = _cloudSessionStore.GetRefreshToken();
            var userId = _cloudSessionStore.GetUserId();

            return new OkObjectResult(new
            {
                hasAccessToken = !string.IsNullOrEmpty(backendToken),
                hasRefreshToken = !string.IsNullOrEmpty(refreshToken),
                userId = userId ?? "",
                isAuthenticated = !string.IsNullOrEmpty(backendToken) && !string.IsNullOrEmpty(userId),
                accessTokenLength = backendToken?.Length ?? 0,
                refreshTokenLength = refreshToken?.Length ?? 0,
                accessTokenPreview = backendToken?.Length > 10 ? backendToken.Substring(0, 10) : "",
                refreshTokenPreview = refreshToken?.Length > 10 ? refreshToken.Substring(0, 10) : ""
            });
        }

        // --------------------------------------------------------------------
        // OPTIMIZED SINGLEFLIGHT IMPLEMENTATION
        // --------------------------------------------------------------------
        private async Task<IActionResult> ProxyCloudRequest(
            string endpoint,
            HttpMethod method,
            string? authHeader,
            JsonElement? requestBody = null,
            TimeSpan? cacheDuration = null)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
                return new ObjectResult(new { message = "Cloud API not configured." }) { StatusCode = 500 };

            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                return new UnauthorizedObjectResult(new { message = "No cloud authentication token provided" });

            var token = authHeader.Substring("Bearer ".Length);

            // Only cache GET requests and read-only POST (validate-token)
            if (cacheDuration.HasValue && (method == HttpMethod.Get || endpoint == "auth/validate-token"))
            {
                var cacheKey = $"proxy:{endpoint}:{GenerateUserKeySuffix(token)}";
                // var threadId = Thread.CurrentThread.ManagedThreadId;
                // Console.WriteLine($"[SINGLEFLIGHT] Thread {threadId} requesting {endpoint} with cache key: {cacheKey}");

                return await ExecuteWithSingleflight(cacheKey, async () =>
                {
                    // Console.WriteLine($"[SINGLEFLIGHT] Thread {threadId} ENTERED gate for key: {cacheKey}");

                    // Check cache inside the singleflight gate
                    if (_cache.TryGetValue<IActionResult>(cacheKey, out var cachedResult))
                    {
                        Console.WriteLine($"[CLOUD_AUTH][CACHE] ✅ Cache HIT for {endpoint}");
                        return cachedResult;
                    }

                    Console.WriteLine($"[CLOUD_AUTH][CACHE] ❌ Cache MISS for {endpoint}");

                    // Execute the actual request
                    var result = await ExecuteCloudRequest(endpoint, method, token, requestBody, cloudApiUrl);

                    // Console.WriteLine($"[SINGLEFLIGHT] Thread {threadId} HTTP request completed for {endpoint}");

                    // Cache the result if appropriate
                    if (ShouldCacheResult(result))
                    {
                        var ttl = IsSuccessResult(result) ? cacheDuration.Value : InvalidResponseCacheDuration;
                        _cache.Set(cacheKey, result, new MemoryCacheEntryOptions
                        {
                            AbsoluteExpirationRelativeToNow = ttl
                        });
                        Console.WriteLine($"[CLOUD_AUTH][CACHE] 🔄 Cached {endpoint} for {ttl.TotalSeconds}s");
                    }

                    return result;
                });
            }

            // Non-cacheable requests go directly to cloud
            return await ExecuteCloudRequest(endpoint, method, token, requestBody, cloudApiUrl);
        }

        private async Task<T> ExecuteWithSingleflight<T>(string key, Func<Task<T>> factory)
        {
            // var threadId = Thread.CurrentThread.ManagedThreadId;
            var gate = _singleflightGates.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
            // var gateHashCode = gate.GetHashCode();

            // Console.WriteLine($"[SINGLEFLIGHT] Thread {threadId} waiting for gate {gateHashCode} (key: {key})");

            await gate.WaitAsync();
            try
            {
                // Console.WriteLine($"[SINGLEFLIGHT] Thread {threadId} acquired gate {gateHashCode} (key: {key})");
                var result = await factory();
                // Console.WriteLine($"[SINGLEFLIGHT] Thread {threadId} releasing gate {gateHashCode} (key: {key})");
                return result;
            }
            finally
            {
                gate.Release();

                // Clean up unused gates to prevent memory leaks
                if (gate.CurrentCount == 1 && !_cache.TryGetValue(key, out _))
                {
                    _singleflightGates.TryRemove(key, out _);
                    // Console.WriteLine($"[SINGLEFLIGHT] Cleaned up unused gate for key: {key}");
                }
            }
        }

        private async Task<IActionResult> ExecuteCloudRequest(
            string endpoint,
            HttpMethod method,
            string token,
            JsonElement? requestBody,
            string cloudApiUrl)
        {
            try
            {
                var requestUrl = $"{cloudApiUrl}/{endpoint}";
                using var httpRequest = new HttpRequestMessage(method, requestUrl);
                httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                if (requestBody.HasValue)
                {
                    httpRequest.Content = new StringContent(requestBody.Value.GetRawText(), Encoding.UTF8, "application/json");
                }

                var response = await _httpClient.SendAsync(httpRequest);
                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                    return new OkObjectResult(json);
                }

                // Handle specific error cases
                return response.StatusCode switch
                {
                    System.Net.HttpStatusCode.Unauthorized =>
                        new UnauthorizedObjectResult(new { message = "Invalid or expired cloud token" }),

                    System.Net.HttpStatusCode.NotFound =>
                        new NotFoundObjectResult(new { message = "Resource not found" }),

                    System.Net.HttpStatusCode.TooManyRequests =>
                        CreateRateLimitedResult(responseContent),

                    _ => CreateGenericErrorResult(response, responseContent, endpoint, method)
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH] Error during cloud API request: {method} {endpoint} - {ex.Message}");
                return new ObjectResult(new { message = "Failed to contact cloud API" }) { StatusCode = 500 };
            }
        }

        private ObjectResult CreateRateLimitedResult(string responseContent)
        {
            Console.WriteLine("[CLOUD_AUTH] ⚠️ Rate limited by cloud API");
            try
            {
                var errorJson = JsonSerializer.Deserialize<JsonElement>(responseContent);
                return new ObjectResult(errorJson) { StatusCode = 429 };
            }
            catch
            {
                return new ObjectResult(new { message = "Rate limited by cloud API" }) { StatusCode = 429 };
            }
        }

        private ObjectResult CreateGenericErrorResult(HttpResponseMessage response, string responseContent, string endpoint, HttpMethod method)
        {
            Console.WriteLine($"[CLOUD_AUTH] Cloud API request failed: {method} {endpoint} - {response.StatusCode}");
            try
            {
                var errorJson = JsonSerializer.Deserialize<JsonElement>(responseContent);
                return new ObjectResult(errorJson) { StatusCode = (int)response.StatusCode };
            }
            catch
            {
                return new ObjectResult(new { message = "Cloud API request failed" }) { StatusCode = (int)response.StatusCode };
            }
        }

        // Helper methods
        private static bool IsSuccessResult(IActionResult result)
        {
            return result is OkObjectResult ||
                   (result is ObjectResult objResult && objResult.StatusCode >= 200 && objResult.StatusCode < 300);
        }

        private static bool ShouldCacheResult(IActionResult result)
        {
            // Cache successful results and auth errors (to prevent hammering)
            return result is OkObjectResult || result is UnauthorizedObjectResult;
        }

        private void InvalidateUserCaches(string token)
        {
            var suffix = GenerateUserKeySuffix(token);
            var keysToRemove = new[]
            {
                $"proxy:auth/user-info:{suffix}",
                $"proxy:auth/validate-token:{suffix}",
                $"proxy:sessions/sessions:{suffix}"
            };

            foreach (var key in keysToRemove)
            {
                _cache.Remove(key);
                Console.WriteLine($"[CLOUD_AUTH][CACHE] 🗑️ Invalidated cache: {key}");
            }

            // Also clean up corresponding singleflight gates
            foreach (var key in keysToRemove)
            {
                _singleflightGates.TryRemove(key, out _);
            }
        }

        private string GenerateUserKeySuffix(string token)
        {
            var userId = ExtractUserIdFromToken(token);
            return !string.IsNullOrEmpty(userId) ? $"uid:{userId}" : $"tok:{ComputeTokenHash(token)}";
        }

        private static string ComputeTokenHash(string token)
        {
            using var sha = SHA256.Create();
            var hashBytes = sha.ComputeHash(Encoding.UTF8.GetBytes(token));
            return Convert.ToHexString(hashBytes)[..16]; // Use first 16 chars for brevity
        }

        private string? ExtractUserIdFromToken(string token)
        {
            try
            {
                var parts = token.Split('.');
                if (parts.Length != 3) return null;

                var payload = parts[1];
                // Add padding if needed
                payload = payload.PadRight((payload.Length + 3) / 4 * 4, '=');

                var bytes = Convert.FromBase64String(payload);
                var json = Encoding.UTF8.GetString(bytes);

                using var doc = JsonDocument.Parse(json);
                return doc.RootElement.TryGetProperty("userId", out var userIdElement)
                    ? userIdElement.GetString()
                    : null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH] Failed to extract userId from token: {ex.Message}");
                return null;
            }
        }

        // --------------------------------------------------------------------
        // FALLBACK AUTHENTICATION METHODS
        // --------------------------------------------------------------------

        public async Task<IActionResult> GetFallbackStatusAsync()
        {
            try
            {
                var isEnabled = await _settingsService.GetBoolSettingAsync(FALLBACK_ENABLED_KEY, false);
                var hasUser = await _authService.HasAnyUsersAsync();

                return new OkObjectResult(new
                {
                    enabled = isEnabled,
                    userConfigured = hasUser,
                    message = isEnabled ? "Fallback authentication is enabled" : "Fallback authentication is disabled"
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH][FALLBACK] Error getting fallback status: {ex.Message}");
                return new ObjectResult(new { message = "Error getting fallback status" }) { StatusCode = 500 };
            }
        }

        public async Task<IActionResult> EnableFallbackAsync(JsonElement request)
        {
            try
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

                // Check if fallback is already enabled
                var isAlreadyEnabled = await _settingsService.GetBoolSettingAsync(FALLBACK_ENABLED_KEY, false);
                if (isAlreadyEnabled && await _authService.HasAnyUsersAsync())
                {
                    return new BadRequestObjectResult(new { message = "Fallback authentication is already enabled" });
                }

                // Create or update the local user
                var hasUser = await _authService.HasAnyUsersAsync();
                if (hasUser)
                {
                    // If user exists, we might want to update the password or skip
                    // For now, we'll just enable fallback without creating a duplicate user
                    Console.WriteLine("[CLOUD_AUTH][FALLBACK] User already exists, enabling fallback");
                }
                else
                {
                    var success = await _authService.CreateUserAsync(username, password);
                    if (!success)
                    {
                        return new BadRequestObjectResult(new { message = "Failed to create fallback user" });
                    }
                    Console.WriteLine($"[CLOUD_AUTH][FALLBACK] Created fallback user: {username}");
                }

                // Enable fallback in settings
                await _settingsService.SetSettingAsync(FALLBACK_ENABLED_KEY, "true", "Enable local authentication fallback for cloud mode");

                Console.WriteLine("[CLOUD_AUTH][FALLBACK] Fallback authentication enabled");
                return new OkObjectResult(new
                {
                    success = true,
                    message = "Fallback authentication enabled successfully",
                    username = username
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH][FALLBACK] Error enabling fallback: {ex.Message}");
                return new ObjectResult(new { message = "Error enabling fallback authentication" }) { StatusCode = 500 };
            }
        }

        public async Task<IActionResult> DisableFallbackAsync(bool removeUser)
        {
            try
            {
                // Disable fallback in settings
                await _settingsService.SetSettingAsync(FALLBACK_ENABLED_KEY, "false", "Enable local authentication fallback for cloud mode");

                if (removeUser)
                {
                    // Get all users and remove them
                    var users = await _authService.GetAllUsersAsync();
                    foreach (var user in users)
                    {
                        await _authService.RemoveUserAsync(user.Username);
                        Console.WriteLine($"[CLOUD_AUTH][FALLBACK] Removed fallback user: {user.Username}");
                    }
                }

                Console.WriteLine("[CLOUD_AUTH][FALLBACK] Fallback authentication disabled");
                return new OkObjectResult(new
                {
                    success = true,
                    message = removeUser ? "Fallback authentication disabled and user removed" : "Fallback authentication disabled"
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH][FALLBACK] Error disabling fallback: {ex.Message}");
                return new ObjectResult(new { message = "Error disabling fallback authentication" }) { StatusCode = 500 };
            }
        }

        public async Task<IActionResult> LoginWithFallbackAsync(JsonElement request)
        {
            try
            {
                // Check if fallback is enabled
                var isEnabled = await _settingsService.GetBoolSettingAsync(FALLBACK_ENABLED_KEY, false);
                if (!isEnabled)
                {
                    return new BadRequestObjectResult(new { message = "Fallback authentication is not enabled" });
                }

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

                // Validate credentials using local auth
                if (!await _authService.ValidateCredentialsAsync(username, password))
                {
                    Console.WriteLine($"[CLOUD_AUTH][FALLBACK] Failed login attempt for username: {username}");
                    return new UnauthorizedObjectResult(new { message = "Invalid username or password" });
                }

                var user = await _authService.GetUserAsync(username);
                if (user == null)
                {
                    return new UnauthorizedObjectResult(new { message = "User not found" });
                }

                // Generate JWT token for local auth
                var token = _jwtService.GenerateToken(user.Username, user.Id);
                var expiresAt = DateTime.UtcNow.AddMinutes(480);

                await _authService.UpdateLastLoginAsync(user.Username, "127.0.0.1");
                Console.WriteLine($"[CLOUD_AUTH][FALLBACK] Successful fallback login for username: {username}");

                return new OkObjectResult(new
                {
                    token = token,
                    username = user.Username,
                    expiresAt = expiresAt,
                    authMode = "local",
                    usedFallback = true,
                    message = "Logged in using fallback authentication. System will switch to local mode."
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_AUTH][FALLBACK] Error during fallback login: {ex.Message}");
                return new ObjectResult(new { message = "Error during fallback login" }) { StatusCode = 500 };
            }
        }
    }
}