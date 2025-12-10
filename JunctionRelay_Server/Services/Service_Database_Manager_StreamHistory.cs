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
using JunctionRelayServer.Interfaces;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_StreamHistory
    {
        private readonly IDatabaseConnectionFactory _dbFactory;

        public Service_Database_Manager_StreamHistory(IDatabaseConnectionFactory dbFactory)
        {
            _dbFactory = dbFactory;
        }

        public async Task<HistoryConfiguration> GetConfigurationAsync()
        {
            using var connection = _dbFactory.CreateConnection();
            var config = await connection.QuerySingleOrDefaultAsync<HistoryConfigurationDto>(
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

            using var connection = _dbFactory.CreateConnection();

            // Check if configuration exists
            var exists = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM StreamHistoryConfiguration") > 0;

            if (exists)
            {
                await connection.ExecuteAsync(@"
                    UPDATE StreamHistoryConfiguration SET
                        RetentionHours = @RetentionHours,
                        MaxEntriesPerStream = @MaxEntriesPerStream,
                        CleanupIntervalMinutes = @CleanupIntervalMinutes,
                        LoggingEnabled = @LoggingEnabled,
                        UpdatedAt = @UpdatedAt", dto);
            }
            else
            {
                await connection.ExecuteAsync(@"
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