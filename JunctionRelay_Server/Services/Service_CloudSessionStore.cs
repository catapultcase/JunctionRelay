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
using Microsoft.Extensions.Configuration;
using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Data;
using Dapper;

namespace JunctionRelayServer.Services
{
    public class Service_CloudSessionStore
    {
        private readonly ISecretsService _secretsService;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly IDbConnection _db;
        private readonly object _lock = new();
        private readonly Service_BackendIdentity _backendIdentity;

        private string? _encryptedAccessToken;
        private string? _encryptedRefreshToken;
        private string? _userId;
        private DateTime? _tokenExpiryTime;
        private Task<string?>? _refreshTask;
        private bool _isInitialized = false;

        public Service_CloudSessionStore(
            ISecretsService secretsService,
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            IDbConnection db,
            Service_BackendIdentity backendIdentity)
        {
            _secretsService = secretsService;
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _db = db;
            _backendIdentity = backendIdentity;
        }


        public bool IsAuthenticated
        {
            get
            {
                EnsureInitialized();
                lock (_lock)
                {
                    return !string.IsNullOrEmpty(_encryptedAccessToken) &&
                           !string.IsNullOrEmpty(_encryptedRefreshToken) &&
                           !string.IsNullOrEmpty(_userId);
                }
            }
        }

        public void StoreSession(string accessToken, string refreshToken, string userId)
        {
            if (string.IsNullOrWhiteSpace(accessToken) ||
                string.IsNullOrWhiteSpace(refreshToken) ||
                string.IsNullOrWhiteSpace(userId))
            {
                throw new ArgumentException("Access token, refresh token, and user ID are required to store session.");
            }

            lock (_lock)
            {
                _encryptedAccessToken = _secretsService.EncryptSecret(accessToken);
                _encryptedRefreshToken = _secretsService.EncryptSecret(refreshToken);
                _userId = userId;
                _tokenExpiryTime = ExtractTokenExpiry(accessToken);
                _refreshTask = null;

                var backendId = _backendIdentity.GetBackendId();

                try
                {
                    _db.Execute(@"
                DELETE FROM CloudSessions WHERE UserId = @UserId AND BackendId = @BackendId;

                INSERT INTO CloudSessions (UserId, BackendId, EncryptedRefreshToken, CreatedAt, UpdatedAt)
                VALUES (@UserId, @BackendId, @EncryptedRefreshToken, @Now, @Now);",
                        new
                        {
                            UserId = userId,
                            BackendId = backendId,
                            EncryptedRefreshToken = _encryptedRefreshToken,
                            Now = DateTime.UtcNow
                        });

                    Console.WriteLine($"[CLOUD_SESSION] ✅ Stored cloud session for user: {userId} (backend: {backendId})");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[CLOUD_SESSION] ⚠️ Failed to persist refresh token to database: {ex.Message}");
                }
            }
        }



        public string? GetAccessToken()
        {
            EnsureInitialized();
            lock (_lock)
            {
                return string.IsNullOrEmpty(_encryptedAccessToken)
                    ? null
                    : _secretsService.DecryptSecret(_encryptedAccessToken);
            }
        }

        public void ClearAccessTokenOnly()
        {
            lock (_lock)
            {
                _encryptedAccessToken = null;
                _tokenExpiryTime = null;
                // Keep _encryptedRefreshToken and _userId intact
                Console.WriteLine("[CLOUD_SESSION] 🧪 DEBUG: Cleared access token only - refresh token preserved");
            }
        }

        public async Task<string?> GetValidAccessTokenAsync(CancellationToken cancellationToken = default)
        {
            EnsureInitialized();
            lock (_lock)
            {
                // Console.WriteLine($"[CLOUD_SESSION] 🔍 Token check - HasAccess: {!string.IsNullOrEmpty(_encryptedAccessToken)}, HasRefresh: {!string.IsNullOrEmpty(_encryptedRefreshToken)}, ExpiryTime: {_tokenExpiryTime}, MinutesLeft: {(_tokenExpiryTime?.Subtract(DateTime.UtcNow).TotalMinutes)}");
            }

            lock (_lock)
            {
                // Only return null if we have no refresh token at all
                if (string.IsNullOrEmpty(_encryptedRefreshToken))
                {
                    Console.WriteLine("[CLOUD_SESSION] ❌ No refresh token available");
                    return null;
                }

                // If we have a valid access token, return it
                if (!string.IsNullOrEmpty(_encryptedAccessToken) &&
                    _tokenExpiryTime.HasValue &&
                    _tokenExpiryTime.Value > DateTime.UtcNow.AddMinutes(5))
                {
                    // Console.WriteLine("[CLOUD_SESSION] ✅ Using existing valid access token");
                    return _secretsService.DecryptSecret(_encryptedAccessToken);
                }

                // If we get here, we need to refresh (either no access token or it's expired)
                if (_refreshTask != null)
                {
                    Console.WriteLine("[CLOUD_SESSION] ⏳ Refresh already in progress, waiting...");
                }
                else
                {
                    Console.WriteLine("[CLOUD_SESSION] 🔄 Access token missing or expiring, starting refresh...");
                    _refreshTask = RefreshTokenInternalAsync(cancellationToken);
                }
            }

            try
            {
                var refreshedToken = await _refreshTask!;
                return refreshedToken;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_SESSION] ❌ Token refresh failed: {ex.Message}");
                lock (_lock)
                {
                    _refreshTask = null;
                }

                // Try to return existing access token if we have one, even if it might be expired
                lock (_lock)
                {
                    return string.IsNullOrEmpty(_encryptedAccessToken)
                        ? null
                        : _secretsService.DecryptSecret(_encryptedAccessToken);
                }
            }
        }

        public string? GetRefreshToken()
        {
            EnsureInitialized();
            lock (_lock)
            {
                return string.IsNullOrEmpty(_encryptedRefreshToken)
                    ? null
                    : _secretsService.DecryptSecret(_encryptedRefreshToken);
            }
        }

        public string? GetUserId()
        {
            EnsureInitialized();
            lock (_lock)
            {
                return _userId;
            }
        }

        public void ClearSession()
        {
            lock (_lock)
            {
                var userIdToDelete = _userId;
                var backendId = _backendIdentity.GetBackendId();

                _encryptedAccessToken = null;
                _encryptedRefreshToken = null;
                _userId = null;
                _tokenExpiryTime = null;
                _refreshTask = null;

                if (!string.IsNullOrEmpty(userIdToDelete))
                {
                    try
                    {
                        _db.Execute("DELETE FROM CloudSessions WHERE UserId = @UserId AND BackendId = @BackendId",
                            new { UserId = userIdToDelete, BackendId = backendId });

                        Console.WriteLine($"[CLOUD_SESSION] 🗑️ Cleared cloud session for user: {userIdToDelete} on backend: {backendId}");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[CLOUD_SESSION] ⚠️ Failed to delete session from database: {ex.Message}");
                    }
                }
                else
                {
                    Console.WriteLine("[CLOUD_SESSION] 🗑️ Cleared cloud session (in-memory only)");
                }
            }
        }


        private void EnsureInitialized()
        {
            if (_isInitialized) return;

            lock (_lock)
            {
                if (_isInitialized) return;

                try
                {
                    var session = _db.QueryFirstOrDefault<CloudSessionRow>(@"
                SELECT UserId, EncryptedRefreshToken 
                FROM CloudSessions 
                WHERE BackendId = @BackendId 
                ORDER BY UpdatedAt DESC 
                LIMIT 1",
                        new { BackendId = _backendIdentity.GetBackendId() });

                    if (session != null)
                    {
                        _userId = session.UserId;
                        _encryptedRefreshToken = session.EncryptedRefreshToken;
                        Console.WriteLine($"[CLOUD_SESSION] 🔄 Restored session for user: {_userId} (backend: {_backendIdentity.GetBackendId()})");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[CLOUD_SESSION] ⚠️ Failed to load session from database: {ex.Message}");
                }

                _isInitialized = true;
            }
        }


        private async Task<string?> RefreshTokenInternalAsync(CancellationToken cancellationToken)
        {
            string? currentRefreshToken;
            lock (_lock)
            {
                currentRefreshToken = string.IsNullOrEmpty(_encryptedRefreshToken)
                    ? null
                    : _secretsService.DecryptSecret(_encryptedRefreshToken);
            }
            if (string.IsNullOrEmpty(currentRefreshToken))
            {
                Console.WriteLine("[CLOUD_SESSION] ❌ No refresh token available");
                return null;
            }
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                Console.WriteLine("[CLOUD_SESSION] ❌ Cloud API URL not configured");
                return null;
            }

            // Retry logic - try up to 3 times before clearing session
            for (int attempt = 1; attempt <= 3; attempt++)
            {
                try
                {
                    //Console.WriteLine($"[CLOUD_SESSION] 🔍 DEBUG: Sending refresh token: {currentRefreshToken?.Substring(0, 20)}... (length: {currentRefreshToken?.Length})");
                    //Console.WriteLine($"[CLOUD_SESSION] 🔍 DEBUG: Sending backend ID: {_backendIdentity.GetBackendId()}");

                    var httpClient = _httpClientFactory.CreateClient();
                    httpClient.Timeout = TimeSpan.FromSeconds(10);
                    var refreshUrl = $"{cloudApiUrl}/api/auth/refresh";
                    var payload = new { refreshToken = currentRefreshToken, backendId = _backendIdentity.GetBackendId() };
                    var jsonContent = JsonSerializer.Serialize(payload);
                    var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                    Console.WriteLine($"[CLOUD_SESSION] 🔄 Requesting token refresh from cloud (attempt {attempt}/3)...");
                    var response = await httpClient.PostAsync(refreshUrl, content, cancellationToken);

                    if (response.IsSuccessStatusCode)
                    {
                        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
                        var tokenData = JsonSerializer.Deserialize<JsonElement>(responseContent);
                        if (tokenData.TryGetProperty("token", out var tokenElement))
                        {
                            var newAccessToken = tokenElement.GetString();
                            var newRefreshToken = tokenData.TryGetProperty("refreshToken", out var refreshTokenElement)
                                ? refreshTokenElement.GetString()
                                : null;
                            if (!string.IsNullOrEmpty(newAccessToken))
                            {
                                lock (_lock)
                                {
                                    _encryptedAccessToken = _secretsService.EncryptSecret(newAccessToken);
                                    _tokenExpiryTime = ExtractTokenExpiry(newAccessToken);
                                    if (!string.IsNullOrEmpty(newRefreshToken))
                                    {
                                        _encryptedRefreshToken = _secretsService.EncryptSecret(newRefreshToken);
                                        Console.WriteLine("[CLOUD_SESSION] 🔁 Stored new refresh token");

                                        if (!string.IsNullOrEmpty(_userId) && !string.IsNullOrEmpty(_encryptedRefreshToken))
                                        {
                                            try
                                            {
                                                _db.Execute(@"
            DELETE FROM CloudSessions WHERE UserId = @UserId AND BackendId = @BackendId;

            INSERT INTO CloudSessions (UserId, BackendId, EncryptedRefreshToken, CreatedAt, UpdatedAt)
            VALUES (@UserId, @BackendId, @EncryptedRefreshToken, @Now, @Now);",
                                                    new
                                                    {
                                                        UserId = _userId,
                                                        BackendId = _backendIdentity.GetBackendId(),
                                                        EncryptedRefreshToken = _encryptedRefreshToken,
                                                        Now = DateTime.UtcNow
                                                    });

                                                Console.WriteLine($"[CLOUD_SESSION] 💾 Persisted new refresh token to DB for {_userId}");
                                            }
                                            catch (Exception ex)
                                            {
                                                Console.WriteLine($"[CLOUD_SESSION] ⚠️ Failed to persist refresh token after refresh: {ex.Message}");
                                            }
                                        }

                                    }
                                    _refreshTask = null;
                                }
                                Console.WriteLine($"[CLOUD_SESSION] ✅ Token refreshed successfully on attempt {attempt}");
                                return newAccessToken;
                            }
                        }
                        Console.WriteLine("[CLOUD_SESSION] ❌ Invalid response format from refresh endpoint");
                        return null;
                    }
                    else if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        Console.WriteLine($"[CLOUD_SESSION] ⚠️ Refresh token unauthorized on attempt {attempt}/3");
                        if (attempt == 3)
                        {
                            Console.WriteLine("[CLOUD_SESSION] 🚨 Refresh token invalid/expired after 3 attempts - clearing session");
                            ClearSession();
                            return null;
                        }
                        // Wait a bit before retrying
                        await Task.Delay(1000, cancellationToken);
                    }
                    else
                    {
                        Console.WriteLine($"[CLOUD_SESSION] ❌ Token refresh failed: {response.StatusCode} (attempt {attempt}/3)");
                        if (attempt == 3)
                        {
                            return null;
                        }
                        // Wait a bit before retrying
                        await Task.Delay(1000, cancellationToken);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[CLOUD_SESSION] ❌ Exception during token refresh (attempt {attempt}/3): {ex.Message}");
                    if (attempt == 3)
                    {
                        return null;
                    }
                    // Wait a bit before retrying
                    await Task.Delay(1000, cancellationToken);
                }
            }

            return null;
        }


        private DateTime? ExtractTokenExpiry(string accessToken)
        {
            try
            {
                var parts = accessToken.Split('.');
                if (parts.Length != 3)
                    return null;

                var payload = parts[1];

                switch (payload.Length % 4)
                {
                    case 2: payload += "=="; break;
                    case 3: payload += "="; break;
                }

                var bytes = Convert.FromBase64String(payload);
                var json = Encoding.UTF8.GetString(bytes);

                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("exp", out var expElement))
                {
                    var exp = expElement.GetInt64();
                    return DateTimeOffset.FromUnixTimeSeconds(exp).UtcDateTime;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_SESSION] ⚠️ Failed to extract token expiry: {ex.Message}");
            }

            return null;
        }

        public string GetBackendId()
        {
            return _backendIdentity.GetBackendId();
        }

        public string? GetFriendlyName()
        {
            return _backendIdentity.GetFriendlyName();
        }

        private class CloudSessionRow
        {
            public string UserId { get; set; } = "";
            public string EncryptedRefreshToken { get; set; } = "";
        }
    }
}