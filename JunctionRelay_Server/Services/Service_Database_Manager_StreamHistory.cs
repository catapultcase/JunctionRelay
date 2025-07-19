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
using Dapper;
using System.Data;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_StreamHistory
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_StreamHistory(IDbConnection dbConnection)
        {
            _db = dbConnection;
        }

        public async Task<HistoryConfiguration> GetConfigurationAsync()
        {
            var config = await _db.QuerySingleOrDefaultAsync<HistoryConfigurationDto>(
                "SELECT * FROM StreamHistoryConfiguration ORDER BY Id DESC LIMIT 1");

            if (config == null)
            {
                // Return default config if none exists
                return new HistoryConfiguration();
            }

            return new HistoryConfiguration
            {
                RetentionPeriod = TimeSpan.FromHours(config.RetentionHours),
                MaxEntriesPerStream = config.MaxEntriesPerStream,
                CleanupInterval = TimeSpan.FromMinutes(config.CleanupIntervalMinutes),
                LoggingEnabled = config.LoggingEnabled
            };
        }

        public async Task UpdateConfigurationAsync(HistoryConfiguration config)
        {
            var dto = new HistoryConfigurationDto
            {
                RetentionHours = config.RetentionPeriod.TotalHours,
                MaxEntriesPerStream = config.MaxEntriesPerStream,
                CleanupIntervalMinutes = (int)config.CleanupInterval.TotalMinutes,
                LoggingEnabled = config.LoggingEnabled,
                UpdatedAt = DateTime.UtcNow
            };

            // Check if configuration exists
            var exists = await _db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM StreamHistoryConfiguration") > 0;

            if (exists)
            {
                await _db.ExecuteAsync(@"
                    UPDATE StreamHistoryConfiguration SET
                        RetentionHours = @RetentionHours,
                        MaxEntriesPerStream = @MaxEntriesPerStream,
                        CleanupIntervalMinutes = @CleanupIntervalMinutes,
                        LoggingEnabled = @LoggingEnabled,
                        UpdatedAt = @UpdatedAt", dto);
            }
            else
            {
                await _db.ExecuteAsync(@"
                    INSERT INTO StreamHistoryConfiguration (RetentionHours, MaxEntriesPerStream, CleanupIntervalMinutes, LoggingEnabled, UpdatedAt)
                    VALUES (@RetentionHours, @MaxEntriesPerStream, @CleanupIntervalMinutes, @LoggingEnabled, @UpdatedAt)", dto);
            }
        }

        // DTO for database operations
        private class HistoryConfigurationDto
        {
            public int Id { get; set; }
            public double RetentionHours { get; set; }
            public int MaxEntriesPerStream { get; set; }
            public int CleanupIntervalMinutes { get; set; }
            public bool LoggingEnabled { get; set; } = true;
            public DateTime UpdatedAt { get; set; }
        }
    }
}