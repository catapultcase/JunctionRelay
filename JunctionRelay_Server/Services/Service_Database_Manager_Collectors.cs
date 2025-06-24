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
using JunctionRelayServer.Interfaces;
using Dapper;
using System.Data;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_Collectors
    {
        private readonly IDbConnection _db;
        private readonly ISecretsService _secretsService;

        public Service_Database_Manager_Collectors(IDbConnection db, ISecretsService secretsService)
        {
            _db = db;
            _secretsService = secretsService;
        }

        // Fetch all collectors
        public async Task<List<Model_Collector>> GetAllCollectorsAsync()
        {
            var collectors = await _db.QueryAsync<Model_Collector>("SELECT * FROM Collectors");
            var result = collectors.AsList();

            // Decrypt secrets for each collector
            foreach (var collector in result)
            {
                DecryptCollectorSecrets(collector);
            }

            return result;
        }

        // Fetch a collector by its ID
        public async Task<Model_Collector?> GetCollectorByIdAsync(int id)
        {
            var collector = await _db.QuerySingleOrDefaultAsync<Model_Collector>(
                "SELECT * FROM Collectors WHERE Id = @Id", new { Id = id });

            if (collector != null)
            {
                DecryptCollectorSecrets(collector);
            }

            return collector;
        }

        // Fetch collectors associated with a specific junction ID
        public async Task<List<Model_Collector>> GetCollectorsByJunctionIdAsync(int junctionId)
        {
            var sql = @"
                SELECT c.*
                FROM Collectors c
                INNER JOIN JunctionCollectorLinks jcl ON c.Id = jcl.CollectorId
                WHERE jcl.JunctionId = @JunctionId;
            ";

            var collectors = await _db.QueryAsync<Model_Collector>(sql, new { JunctionId = junctionId });
            var result = collectors.ToList();

            // Decrypt secrets for each collector
            foreach (var collector in result)
            {
                DecryptCollectorSecrets(collector);
            }

            return result;
        }

        // Add a new collector
        public async Task<Model_Collector> AddCollectorAsync(Model_Collector newCollector)
        {
            // Create a copy for database storage with encrypted secrets
            var collectorForDb = CreateCollectorCopy(newCollector);
            EncryptCollectorSecrets(collectorForDb);

            var sql = @"
                INSERT INTO Collectors (
                    Name, CollectorType, Description, URL, AccessToken, PollRate, SendRate, ServiceId
                ) VALUES (
                    @Name, @CollectorType, @Description, @URL, @AccessToken, @PollRate, @SendRate, @ServiceId
                );
                SELECT last_insert_rowid();
            ";

            // Get the new ID of the inserted collector
            newCollector.Id = await _db.ExecuteScalarAsync<int>(sql, collectorForDb);

            // Return the original with unencrypted values (for API response)
            return newCollector;
        }

        // Update an existing collector
        public async Task<bool> UpdateCollectorAsync(int id, Model_Collector updatedCollector)
        {
            // Create a copy for database storage with encrypted secrets
            var collectorForDb = CreateCollectorCopy(updatedCollector);
            collectorForDb.Id = id;
            EncryptCollectorSecrets(collectorForDb);

            var sql = @"
                UPDATE Collectors SET
                    Name = @Name,
                    CollectorType = @CollectorType,
                    Description = @Description,
                    URL = @URL,
                    AccessToken = @AccessToken,
                    PollRate = @PollRate,
                    SendRate = @SendRate,
                    ServiceId = @ServiceId
                WHERE Id = @Id;
            ";

            var rowsAffected = await _db.ExecuteAsync(sql, collectorForDb);
            return rowsAffected > 0;
        }

        // Delete a collector by its ID
        public async Task<bool> DeleteCollectorAsync(int id)
        {
            var collector = await _db.QuerySingleOrDefaultAsync<Model_Collector>(
                "SELECT * FROM Collectors WHERE Id = @Id", new { Id = id });

            if (collector == null) return false;

            // Delete associated sensors
            await _db.ExecuteAsync("DELETE FROM Sensors WHERE CollectorId = @Id", new { Id = id });

            // Delete collector
            await _db.ExecuteAsync("DELETE FROM Collectors WHERE Id = @Id", new { Id = id });

            return true;
        }

        // Helper method to encrypt secrets in a collector
        private void EncryptCollectorSecrets(Model_Collector collector)
        {
            if (!string.IsNullOrEmpty(collector.AccessToken))
            {
                collector.AccessToken = _secretsService.EncryptSecret(collector.AccessToken);
            }
        }

        // Helper method to decrypt secrets in a collector
        private void DecryptCollectorSecrets(Model_Collector collector)
        {
            if (!string.IsNullOrEmpty(collector.AccessToken))
            {
                collector.AccessToken = _secretsService.DecryptSecret(collector.AccessToken);
            }
        }

        // Helper to create a copy of the collector for database operations
        private Model_Collector CreateCollectorCopy(Model_Collector original)
        {
            return new Model_Collector
            {
                Id = original.Id,
                Name = original.Name,
                CollectorType = original.CollectorType,
                Description = original.Description,
                URL = original.URL,
                AccessToken = original.AccessToken,
                PollRate = original.PollRate,
                SendRate = original.SendRate,
                ServiceId = original.ServiceId,
                Status = original.Status  // Add the required Status property
            };
        }
    }
}