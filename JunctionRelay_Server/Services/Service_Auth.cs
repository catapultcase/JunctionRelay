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
                // Get the current auth mode
                var authMode = await GetAuthModeAsync();

                // Authentication is enabled if mode is not "none"
                var isEnabled = authMode != "none";

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

        public async Task<string> GetAuthModeAsync()
        {
            try
            {
                using var connection = new SqliteConnection(_db.ConnectionString);
                await connection.OpenAsync();

                // First check if the Settings table exists
                var tableExists = await connection.QueryFirstOrDefaultAsync<int>(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Settings'");

                if (tableExists == 0)
                {
                    // Settings table doesn't exist yet, default to 'none'
                    return "none";
                }

                var setting = await connection.QueryFirstOrDefaultAsync<Model_Setting>(
                    "SELECT * FROM Settings WHERE Key = @Key",
                    new { Key = "authentication_mode" });

                // Return the stored mode or default to 'none'
                return setting?.Value?.ToLower() ?? "none";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting authentication mode: {ex.Message}");
                return "none"; // Default fallback
            }
        }

        public async Task SetAuthModeAsync(string mode)
        {
            try
            {
                using var connection = new SqliteConnection(_db.ConnectionString);
                await connection.OpenAsync();

                // First check if the Settings table exists
                var tableExists = await connection.QueryFirstOrDefaultAsync<int>(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Settings'");

                if (tableExists == 0)
                {
                    throw new InvalidOperationException("Settings table does not exist. Database may not be initialized.");
                }

                // Check if the setting already exists
                var existingSetting = await connection.QueryFirstOrDefaultAsync<Model_Setting>(
                    "SELECT * FROM Settings WHERE Key = @Key",
                    new { Key = "authentication_mode" });

                if (existingSetting != null)
                {
                    // Update existing setting
                    await connection.ExecuteAsync(
                        "UPDATE Settings SET Value = @Value WHERE Key = @Key",
                        new { Value = mode.ToLower(), Key = "authentication_mode" });
                }
                else
                {
                    // Insert new setting
                    await connection.ExecuteAsync(
                        "INSERT INTO Settings (Key, Value, Description) VALUES (@Key, @Value, @Description)",
                        new
                        {
                            Key = "authentication_mode",
                            Value = mode.ToLower(),
                            Description = "Authentication mode: none, local, or cloud"
                        });
                }

                // Clear the auth cache since mode changed
                ClearAuthCache();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error setting authentication mode: {ex.Message}");
                throw; // Re-throw to let controller handle the error
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

        public async Task<IEnumerable<Model_AuthUser>> GetAllUsersAsync()
        {
            try
            {
                var users = await _db.QueryAsync<Model_AuthUser>(
                    "SELECT Id, Username, IsActive, CreatedAt, LastLoginAt, LastLoginIP FROM AuthUsers WHERE IsActive = 1");

                // Don't return password hashes to external callers
                return users.Select(u => new Model_AuthUser
                {
                    Id = u.Id,
                    Username = u.Username,
                    IsActive = u.IsActive,
                    CreatedAt = u.CreatedAt,
                    LastLoginAt = u.LastLoginAt,
                    LastLoginIP = u.LastLoginIP,
                    PasswordHash = string.Empty // Never return password hash
                });
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to retrieve users: {ex.Message}", ex);
            }
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

        public async Task RemoveUserAsync(string username)
        {
            try
            {
                var sql = "DELETE FROM AuthUsers WHERE Username = @Username";
                var result = await _db.ExecuteAsync(sql, new { Username = username });

                if (result == 0)
                {
                    throw new InvalidOperationException($"User '{username}' not found or could not be removed");
                }
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to remove user '{username}': {ex.Message}", ex);
            }
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