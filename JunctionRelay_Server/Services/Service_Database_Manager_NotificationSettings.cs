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
    public class Service_Database_Manager_NotificationSettings
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_NotificationSettings(IDbConnection dbConnection)
        {
            _db = dbConnection;
        }

        public async Task<List<Model_NotificationSettings>> GetAllAsync()
        {
            var settings = await _db.QueryAsync<Model_NotificationSettings>(
                "SELECT * FROM NotificationSettings ORDER BY Category");
            return settings.ToList();
        }

        public async Task<Model_NotificationSettings?> GetByCategoryAsync(string category)
        {
            return await _db.QuerySingleOrDefaultAsync<Model_NotificationSettings>(
                "SELECT * FROM NotificationSettings WHERE Category = @Category",
                new { Category = category });
        }

        public async Task<Model_NotificationSettings> UpdateAsync(Model_NotificationSettings settings)
        {
            await _db.ExecuteAsync(@"
                UPDATE NotificationSettings
                SET Enabled = @Enabled,
                    DefaultDurationMs = @DefaultDurationMs,
                    Description = @Description
                WHERE Id = @Id",
                settings);

            return settings;
        }
    }
}
