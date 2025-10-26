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

using JunctionRelayServer.Models;
using Dapper;
using System.Data;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_LoggingSettings
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_LoggingSettings(IDbConnection dbConnection)
        {
            _db = dbConnection;
        }

        public async Task<List<Model_LoggingSettings>> GetAllAsync()
        {
            var settings = await _db.QueryAsync<Model_LoggingSettings>(
                "SELECT * FROM LoggingSettings ORDER BY Category");
            return settings.ToList();
        }

        public async Task<Model_LoggingSettings?> GetByCategoryAsync(string category)
        {
            return await _db.QuerySingleOrDefaultAsync<Model_LoggingSettings>(
                "SELECT * FROM LoggingSettings WHERE Category = @Category",
                new { Category = category });
        }

        public async Task<Model_LoggingSettings> UpsertAsync(Model_LoggingSettings settings)
        {
            var existing = await GetByCategoryAsync(settings.Category);

            if (existing != null)
            {
                // Update
                settings.Id = existing.Id;
                settings.UpdatedAt = DateTime.UtcNow;

                await _db.ExecuteAsync(@"
                    UPDATE LoggingSettings
                    SET Enabled = @Enabled,
                        LogIntervalMinutes = @LogIntervalMinutes,
                        Description = @Description,
                        LastLoggedAt = @LastLoggedAt,
                        MaxLogRetentionDays = @MaxLogRetentionDays,
                        MaxLogFileSizeMB = @MaxLogFileSizeMB,
                        AutoCleanupEnabled = @AutoCleanupEnabled,
                        LastCleanupAt = @LastCleanupAt,
                        UpdatedAt = @UpdatedAt
                    WHERE Id = @Id",
                    settings);
            }
            else
            {
                // Insert
                settings.CreatedAt = DateTime.UtcNow;
                settings.UpdatedAt = DateTime.UtcNow;

                var id = await _db.QuerySingleAsync<int>(@"
                    INSERT INTO LoggingSettings (Category, Enabled, LogIntervalMinutes, Description, LastLoggedAt,
                        MaxLogRetentionDays, MaxLogFileSizeMB, AutoCleanupEnabled, LastCleanupAt, CreatedAt, UpdatedAt)
                    VALUES (@Category, @Enabled, @LogIntervalMinutes, @Description, @LastLoggedAt,
                        @MaxLogRetentionDays, @MaxLogFileSizeMB, @AutoCleanupEnabled, @LastCleanupAt, @CreatedAt, @UpdatedAt);
                    SELECT last_insert_rowid();",
                    settings);

                settings.Id = id;
            }

            return settings;
        }

        public async Task UpdateLastLoggedAsync(string category)
        {
            await _db.ExecuteAsync(@"
                UPDATE LoggingSettings
                SET LastLoggedAt = @Now,
                    UpdatedAt = @Now
                WHERE Category = @Category",
                new { Category = category, Now = DateTime.UtcNow });
        }

        public async Task UpdateLastCleanupAsync(string category)
        {
            await _db.ExecuteAsync(@"
                UPDATE LoggingSettings
                SET LastCleanupAt = @Now,
                    UpdatedAt = @Now
                WHERE Category = @Category",
                new { Category = category, Now = DateTime.UtcNow });
        }

        public async Task DeleteAsync(int id)
        {
            await _db.ExecuteAsync(
                "DELETE FROM LoggingSettings WHERE Id = @Id",
                new { Id = id });
        }

        public async Task InitializeDefaultsAsync()
        {
            var defaults = new List<Model_LoggingSettings>
            {
                new Model_LoggingSettings
                {
                    Category = "BlitMode",
                    Enabled = true,
                    LogIntervalMinutes = 60,
                    Description = "Blit mode resource consumption monitoring (memory, CPU, frame metrics)"
                },
                new Model_LoggingSettings
                {
                    Category = "StreamHistory",
                    Enabled = false,
                    LogIntervalMinutes = 15,
                    Description = "Stream history memory tracking (entry counts, estimated memory usage)"
                }
            };

            foreach (var setting in defaults)
            {
                var existing = await GetByCategoryAsync(setting.Category);
                if (existing == null)
                {
                    await UpsertAsync(setting);
                }
            }
        }
    }
}
