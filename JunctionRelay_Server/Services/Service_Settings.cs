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

using Dapper;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using System.Collections.Concurrent;
using System.Data;

namespace JunctionRelayServer.Services
{
    public interface IService_Settings
    {
        Task<string?> GetSettingAsync(string key);
        Task<bool> GetBoolSettingAsync(string key, bool defaultValue = false);
        Task<int> GetIntSettingAsync(string key, int defaultValue = 0);
        Task SetSettingAsync(string key, string value, string? description = null);
        Task<Dictionary<string, string>> GetAllSettingsAsync();
        Task<List<Model_Setting>> GetAllSettingsWithMetadataAsync();
        Task<bool> DeleteSettingAsync(string key);
        void InvalidateCache(string? key = null);
        Task FlushPendingWritesAsync();
    }

    public class Service_Settings : IService_Settings, IDisposable
    {
        private readonly IDatabaseConnectionFactory _dbFactory;

        // Cache structure: key -> (value, lastRead, isDirty, description, isDeleted)
        private readonly ConcurrentDictionary<string, CachedSetting> _cache = new();
        private readonly SemaphoreSlim _initLock = new SemaphoreSlim(1, 1);
        private readonly Timer _writeTimer;
        private volatile bool _isInitialized = false;
        private volatile bool _disposed = false;

        // Configuration
        private readonly TimeSpan _writeInterval = TimeSpan.FromSeconds(30); // Write dirty values every 30 seconds

        private class CachedSetting
        {
            public string? Value { get; set; }
            public DateTime LastRead { get; set; }
            public bool IsDirty { get; set; }
            public string? Description { get; set; }
            public bool IsDeleted { get; set; }
        }

        public Service_Settings(IDatabaseConnectionFactory dbFactory)
        {
            _dbFactory = dbFactory;

            // Start timer for periodic writes
            _writeTimer = new Timer(async _ => await FlushPendingWritesAsync(),
                                   null,
                                   _writeInterval,
                                   _writeInterval);
        }

        private async Task InitializeCacheAsync()
        {
            if (_isInitialized) return;

            await _initLock.WaitAsync();
            try
            {
                if (_isInitialized) return;

                using var connection = _dbFactory.CreateConnection();
                var allSettings = await connection.QueryAsync<Model_Setting>("SELECT * FROM Settings");
                var now = DateTime.UtcNow;

                foreach (var setting in allSettings)
                {
                    _cache[setting.Key] = new CachedSetting
                    {
                        Value = setting.Value,
                        LastRead = now,
                        IsDirty = false,
                        Description = setting.Description,
                        IsDeleted = false
                    };
                }

                _isInitialized = true;
                Console.WriteLine($"[SETTINGS] Loaded {allSettings.Count()} settings into cache");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SETTINGS] Error initializing cache: {ex.Message}");
            }
            finally
            {
                _initLock.Release();
            }
        }

        public async Task<string?> GetSettingAsync(string key)
        {
            if (_disposed) return null;

            try
            {
                await InitializeCacheAsync();

                // Return cached value if available and not deleted
                if (_cache.TryGetValue(key, out var cached) && !cached.IsDeleted)
                {
                    cached.LastRead = DateTime.UtcNow; // Update access time for statistics
                    return cached.Value;
                }

                // Cache miss - fetch from database
                using var connection = _dbFactory.CreateConnection();
                var setting = await connection.QuerySingleOrDefaultAsync<Model_Setting>(
                    "SELECT * FROM Settings WHERE Key = @Key", new { Key = key });

                var newValue = setting?.Value;
                Console.WriteLine($"[SETTINGS] 🆕 Setting loaded from database: '{key}' = '{newValue}'");

                // Add to cache
                _cache[key] = new CachedSetting
                {
                    Value = newValue,
                    LastRead = DateTime.UtcNow,
                    IsDirty = false,
                    Description = setting?.Description,
                    IsDeleted = false
                };

                return newValue;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SETTINGS] Error retrieving setting '{key}': {ex.Message}");
                return null;
            }
        }

        public async Task<bool> GetBoolSettingAsync(string key, bool defaultValue = false)
        {
            var value = await GetSettingAsync(key);
            if (string.IsNullOrEmpty(value))
                return defaultValue;

            return string.Equals(value.Trim(), "true", StringComparison.OrdinalIgnoreCase);
        }

        public async Task<int> GetIntSettingAsync(string key, int defaultValue = 0)
        {
            var value = await GetSettingAsync(key);
            if (string.IsNullOrEmpty(value))
                return defaultValue;

            return int.TryParse(value, out var result) ? result : defaultValue;
        }

        public async Task SetSettingAsync(string key, string value, string? description = null)
        {
            if (_disposed) return;

            try
            {
                await InitializeCacheAsync();

                var now = DateTime.UtcNow;
                var oldValue = _cache.TryGetValue(key, out var existing) ? existing.Value : null;

                // Update cache immediately (lazy write)
                _cache[key] = new CachedSetting
                {
                    Value = value,
                    LastRead = now,
                    IsDirty = true,
                    Description = description,
                    IsDeleted = false
                };

                // Log the change
                if (oldValue != value)
                {
                    Console.WriteLine($"[SETTINGS] 🔄 Setting changed in cache: '{key}' = '{oldValue}' -> '{value}'");
                }
                else
                {
                    Console.WriteLine($"[SETTINGS] Setting queued for write: {key} = {value}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SETTINGS] Error caching setting '{key}': {ex.Message}");

                // Fallback to immediate write if caching fails
                await WriteSettingToDatabaseAsync(key, value, description);
            }
        }

        public async Task<Dictionary<string, string>> GetAllSettingsAsync()
        {
            if (_disposed) return new Dictionary<string, string>();

            try
            {
                await InitializeCacheAsync();

                // Return all cached values, including dirty ones, excluding deleted
                var result = new Dictionary<string, string>();

                foreach (var kvp in _cache.Where(c => !c.Value.IsDeleted))
                {
                    if (!string.IsNullOrEmpty(kvp.Value.Value))
                    {
                        result[kvp.Key] = kvp.Value.Value;
                    }
                }

                // Also fetch any settings that might not be cached yet
                using var connection = _dbFactory.CreateConnection();
                var allDbSettings = await connection.QueryAsync<Model_Setting>("SELECT * FROM Settings");
                foreach (var setting in allDbSettings)
                {
                    if (!result.ContainsKey(setting.Key) && !string.IsNullOrEmpty(setting.Value))
                    {
                        result[setting.Key] = setting.Value;

                        // Cache this setting for future use
                        _cache[setting.Key] = new CachedSetting
                        {
                            Value = setting.Value,
                            LastRead = DateTime.UtcNow,
                            IsDirty = false,
                            Description = setting.Description,
                            IsDeleted = false
                        };
                    }
                }

                return result;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SETTINGS] Error retrieving all settings: {ex.Message}");
                return new Dictionary<string, string>();
            }
        }

        public async Task<List<Model_Setting>> GetAllSettingsWithMetadataAsync()
        {
            if (_disposed) return new List<Model_Setting>();

            try
            {
                await InitializeCacheAsync();

                var result = new List<Model_Setting>();

                // Get all from cache first (excluding deleted)
                foreach (var kvp in _cache.Where(c => !c.Value.IsDeleted))
                {
                    result.Add(new Model_Setting
                    {
                        Id = kvp.Key.GetHashCode(), // Generate consistent ID for API compatibility
                        Key = kvp.Key,
                        Value = kvp.Value.Value ?? string.Empty,
                        Description = kvp.Value.Description ?? string.Empty
                    });
                }

                // Also fetch any settings that might not be cached yet
                using var connection = _dbFactory.CreateConnection();
                var allDbSettings = await connection.QueryAsync<Model_Setting>("SELECT * FROM Settings");
                foreach (var setting in allDbSettings)
                {
                    if (!result.Any(r => r.Key == setting.Key))
                    {
                        result.Add(setting);

                        // Cache this setting for future use
                        _cache[setting.Key] = new CachedSetting
                        {
                            Value = setting.Value,
                            LastRead = DateTime.UtcNow,
                            IsDirty = false,
                            Description = setting.Description,
                            IsDeleted = false
                        };
                    }
                }

                return result.OrderBy(s => s.Key).ToList();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SETTINGS] Error retrieving all settings with metadata: {ex.Message}");
                return new List<Model_Setting>();
            }
        }

        public async Task<bool> DeleteSettingAsync(string key)
        {
            if (_disposed) return false;

            try
            {
                await InitializeCacheAsync();

                // Mark as deleted in cache (lazy delete)
                if (_cache.TryGetValue(key, out var existing))
                {
                    existing.IsDeleted = true;
                    existing.IsDirty = true;
                    existing.LastRead = DateTime.UtcNow;
                }
                else
                {
                    // Add as deleted entry
                    _cache[key] = new CachedSetting
                    {
                        Value = null,
                        LastRead = DateTime.UtcNow,
                        IsDirty = true,
                        Description = null,
                        IsDeleted = true
                    };
                }

                Console.WriteLine($"[SETTINGS] 🗑️ Setting marked for deletion in cache: '{key}'");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SETTINGS] Error deleting setting '{key}': {ex.Message}");
                return false;
            }
        }

        public void InvalidateCache(string? key = null)
        {
            if (_disposed) return;

            if (key == null)
            {
                // Clear entire cache
                _cache.Clear();
                _isInitialized = false;
                Console.WriteLine("[SETTINGS] Cache cleared completely");
            }
            else
            {
                // Remove specific key
                if (_cache.TryRemove(key, out var removed))
                {
                    Console.WriteLine($"[SETTINGS] Cache invalidated for key: {key}");
                }
            }
        }

        public async Task FlushPendingWritesAsync()
        {
            if (_disposed) return;

            try
            {
                var dirtySettings = _cache
                    .Where(kvp => kvp.Value.IsDirty)
                    .ToList();

                if (!dirtySettings.Any()) return;

                Console.WriteLine($"[SETTINGS] Flushing {dirtySettings.Count} dirty settings to database");

                foreach (var kvp in dirtySettings)
                {
                    var key = kvp.Key;
                    var setting = kvp.Value;

                    if (setting.IsDeleted)
                    {
                        // Handle deletion
                        await DeleteSettingFromDatabaseAsync(key);
                        // Remove from cache entirely after successful deletion
                        _cache.TryRemove(key, out _);
                    }
                    else
                    {
                        // Handle insert/update
                        await WriteSettingToDatabaseAsync(key, setting.Value, setting.Description);
                        // Mark as clean
                        setting.IsDirty = false;
                    }
                }

                Console.WriteLine($"[SETTINGS] Successfully flushed {dirtySettings.Count} settings");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SETTINGS] Error flushing pending writes: {ex.Message}");
            }
        }

        private async Task WriteSettingToDatabaseAsync(string key, string? value, string? description)
        {
            try
            {
                using var connection = _dbFactory.CreateConnection();
                var existing = await connection.QuerySingleOrDefaultAsync<Model_Setting>(
                    "SELECT * FROM Settings WHERE Key = @Key", new { Key = key });

                if (existing != null)
                {
                    await connection.ExecuteAsync(
                        "UPDATE Settings SET Value = @Value, Description = @Description WHERE Key = @Key",
                        new { Key = key, Value = value, Description = description ?? existing.Description });
                }
                else
                {
                    await connection.ExecuteAsync(
                        "INSERT INTO Settings (Key, Value, Description) VALUES (@Key, @Value, @Description)",
                        new { Key = key, Value = value, Description = description ?? $"Auto-created setting for {key}" });
                }

                Console.WriteLine($"[SETTINGS] Database updated: {key} = {value}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SETTINGS] Error writing setting '{key}' to database: {ex.Message}");
                throw;
            }
        }

        private async Task DeleteSettingFromDatabaseAsync(string key)
        {
            try
            {
                using var connection = _dbFactory.CreateConnection();
                var rowsAffected = await connection.ExecuteAsync("DELETE FROM Settings WHERE Key = @Key", new { Key = key });
                Console.WriteLine($"[SETTINGS] Database deletion: {key} ({rowsAffected} rows affected)");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SETTINGS] Error deleting setting '{key}' from database: {ex.Message}");
                throw;
            }
        }

        public void Dispose()
        {
            if (_disposed) return;

            _disposed = true;

            try
            {
                // Flush any pending writes before disposing
                FlushPendingWritesAsync().Wait(TimeSpan.FromSeconds(5));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SETTINGS] Error during dispose flush: {ex.Message}");
            }

            _writeTimer?.Dispose();
            _initLock?.Dispose();
        }
    }
}