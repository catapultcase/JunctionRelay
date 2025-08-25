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
using JunctionRelayServer.Models;
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
        void InvalidateCache(string? key = null);
    }

    public class Service_Settings : IService_Settings
    {
        private readonly IDbConnection _db;

        public Service_Settings(IDbConnection db)
        {
            _db = db;
        }

        public async Task<string?> GetSettingAsync(string key)
        {
            try
            {
                var setting = await _db.QuerySingleOrDefaultAsync<Model_Setting>(
                    "SELECT * FROM Settings WHERE Key = @Key", new { Key = key });

                return setting?.Value;
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
            try
            {
                var existing = await _db.QuerySingleOrDefaultAsync<Model_Setting>(
                    "SELECT * FROM Settings WHERE Key = @Key", new { Key = key });

                if (existing != null)
                {
                    await _db.ExecuteAsync(
                        "UPDATE Settings SET Value = @Value WHERE Key = @Key",
                        new { Key = key, Value = value });
                }
                else
                {
                    await _db.ExecuteAsync(
                        "INSERT INTO Settings (Key, Value, Description) VALUES (@Key, @Value, @Description)",
                        new { Key = key, Value = value, Description = description ?? $"Auto-created setting for {key}" });
                }

                Console.WriteLine($"[SETTINGS] Setting updated: {key} = {value}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SETTINGS] Error setting value for key '{key}': {ex.Message}");
                throw;
            }
        }

        public async Task<Dictionary<string, string>> GetAllSettingsAsync()
        {
            try
            {
                var settings = await _db.QueryAsync<Model_Setting>("SELECT * FROM Settings");
                return settings.ToDictionary(s => s.Key, s => s.Value ?? string.Empty);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SETTINGS] Error retrieving all settings: {ex.Message}");
                return new Dictionary<string, string>();
            }
        }

        public void InvalidateCache(string? key = null)
        {
            // No-op since there's no cache
        }
    }
}