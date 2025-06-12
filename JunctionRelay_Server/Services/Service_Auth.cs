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

using BCrypt.Net;
using Dapper;
using System.Data;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using Microsoft.Data.Sqlite;

namespace JunctionRelayServer.Services
{
    public class Service_Auth : IService_Auth
    {
        private readonly IDbConnection _db;
        private readonly ISecretsService _secretsService;

        // Cache fields for authentication status
        private bool? _cachedAuthEnabled = null;
        private DateTime _lastAuthCheck = DateTime.MinValue;
        private readonly TimeSpan _cacheTimeout = TimeSpan.FromMinutes(1); // Cache for 1 minute

        public Service_Auth(IDbConnection db, ISecretsService secretsService)
        {
            _db = db;
            _secretsService = secretsService;
        }

        public async Task<bool> ValidateCredentialsAsync(string username, string password)
        {
            var user = await GetUserFromDbAsync(username);
            if (user == null || !user.IsActive) return false;

            var decryptedHash = _secretsService.DecryptSecret(user.PasswordHash);
            return BCrypt.Net.BCrypt.Verify(password, decryptedHash);
        }

        public async Task<bool> IsAuthenticationEnabledAsync()
        {
            try
            {
                // Check if we have a cached value that's still valid
                if (_cachedAuthEnabled.HasValue &&
                    DateTime.UtcNow - _lastAuthCheck < _cacheTimeout)
                {
                    return _cachedAuthEnabled.Value;
                }

                // Use a proper connection and ensure it's opened
                using var connection = new SqliteConnection(_db.ConnectionString);
                await connection.OpenAsync();

                // First check if the Settings table exists
                var tableExists = await connection.QueryFirstOrDefaultAsync<int>(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Settings'");

                if (tableExists == 0)
                {
                    // Settings table doesn't exist yet, authentication is disabled
                    _cachedAuthEnabled = false;
                    _lastAuthCheck = DateTime.UtcNow;
                    return false;
                }

                var setting = await connection.QueryFirstOrDefaultAsync<Model_Setting>(
                    "SELECT * FROM Settings WHERE Key = @Key",
                    new { Key = "authentication_enabled" });

                var isEnabled = setting?.Value?.ToLower() == "true";

                // Cache the result
                _cachedAuthEnabled = isEnabled;
                _lastAuthCheck = DateTime.UtcNow;

                return isEnabled;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error checking authentication status: {ex.Message}");

                // If we have a cached value, use it even if expired
                if (_cachedAuthEnabled.HasValue)
                {
                    return _cachedAuthEnabled.Value;
                }

                // Default to authentication disabled if we can't check
                return false;
            }
        }

        public async Task<Model_AuthUser?> GetUserAsync(string username)
        {
            var user = await GetUserFromDbAsync(username);
            if (user != null)
            {
                // Don't return the password hash to external callers
                user.PasswordHash = string.Empty;
            }
            return user;
        }

        public async Task<bool> CreateUserAsync(string username, string password)
        {
            try
            {
                var existingUser = await GetUserFromDbAsync(username);
                if (existingUser != null) return false;

                var passwordHash = BCrypt.Net.BCrypt.HashPassword(password);
                var encryptedHash = _secretsService.EncryptSecret(passwordHash);

                var sql = @"
                    INSERT INTO AuthUsers (Username, PasswordHash, IsActive, CreatedAt)
                    VALUES (@Username, @PasswordHash, @IsActive, @CreatedAt)";

                var result = await _db.ExecuteAsync(sql, new
                {
                    Username = username,
                    PasswordHash = encryptedHash,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });

                return result > 0;
            }
            catch
            {
                return false;
            }
        }

        public async Task<bool> ChangePasswordAsync(string username, string currentPassword, string newPassword)
        {
            // First validate current password
            if (!await ValidateCredentialsAsync(username, currentPassword))
                return false;

            try
            {
                var newPasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
                var encryptedHash = _secretsService.EncryptSecret(newPasswordHash);

                var sql = "UPDATE AuthUsers SET PasswordHash = @PasswordHash WHERE Username = @Username";
                var result = await _db.ExecuteAsync(sql, new
                {
                    PasswordHash = encryptedHash,
                    Username = username
                });

                return result > 0;
            }
            catch
            {
                return false;
            }
        }

        public async Task<bool> HasAnyUsersAsync()
        {
            var count = await _db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM AuthUsers WHERE IsActive = 1");
            return count > 0;
        }

        public async Task UpdateLastLoginAsync(string username, string ipAddress)
        {
            try
            {
                var sql = @"
                    UPDATE AuthUsers 
                    SET LastLoginAt = @LastLoginAt, LastLoginIP = @LastLoginIP 
                    WHERE Username = @Username";

                await _db.ExecuteAsync(sql, new
                {
                    LastLoginAt = DateTime.UtcNow,
                    LastLoginIP = ipAddress,
                    Username = username
                });
            }
            catch
            {
                // Non-critical operation, don't throw
            }
        }

        public async Task UpdateUsername(string oldUsername, string newUsername)
        {
            var sql = @"
                UPDATE AuthUsers
                SET Username = @NewUsername
                WHERE Username = @OldUsername";

            await _db.ExecuteAsync(sql, new
            {
                NewUsername = newUsername,
                OldUsername = oldUsername
            });
        }

        public void ClearAuthCache()
        {
            _cachedAuthEnabled = null;
            _lastAuthCheck = DateTime.MinValue;
        }

        private async Task<Model_AuthUser?> GetUserFromDbAsync(string username)
        {
            var user = await _db.QuerySingleOrDefaultAsync<Model_AuthUser>(
                "SELECT * FROM AuthUsers WHERE Username = @Username",
                new { Username = username });

            if (user != null)
            {
                // Decrypt the password hash for internal validation
                user.PasswordHash = _secretsService.DecryptSecret(user.PasswordHash);
            }

            return user;
        }
    }
}