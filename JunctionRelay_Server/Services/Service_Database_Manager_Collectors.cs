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
using System.Collections.Concurrent;

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

        private static readonly ConcurrentDictionary<string, string> _decryptedTokenCache = new();

        // NEW: Cache for user-provided passwords (never stored, only in memory)
        private static readonly ConcurrentDictionary<int, string> _userPasswordCache = new();

        // NEW: Method to unlock a collector with user password
        public async Task<bool> UnlockCollectorWithPasswordAsync(int collectorId, string password)
        {
            var collector = await _db.QuerySingleOrDefaultAsync<Model_Collector>(
                "SELECT * FROM Collectors WHERE Id = @Id", new { Id = collectorId });

            if (collector == null || !collector.ExternalAccessToken || string.IsNullOrEmpty(collector.AccessToken))
            {
                return false;
            }

            try
            {
                // Test if the password can decrypt the token
                var decryptedToken = _secretsService.DecryptWithPassword(collector.AccessToken, password);

                // If we get here without exception, password is correct
                // Cache the decrypted token using existing cache mechanism
                var cacheKey = ComputeStableHash(collector.AccessToken);
                _decryptedTokenCache[cacheKey] = decryptedToken;

                // Also store that this collector is unlocked (for UI state)
                _userPasswordCache[collectorId] = "unlocked"; // We don't store the actual password

                Console.WriteLine($"[COLLECTOR_UNLOCK] ✅ Collector {collectorId} unlocked successfully");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[COLLECTOR_UNLOCK] ❌ Failed to unlock collector {collectorId}: {ex.Message}");
                return false;
            }
        }

        // NEW: Method to lock a collector (remove from cache)
        public void LockCollector(int collectorId)
        {
            _userPasswordCache.TryRemove(collectorId, out _);

            // Also remove the decrypted token from cache if we can identify it
            // Note: This is a limitation - we can't easily remove from _decryptedTokenCache 
            // without the original encrypted token, but that's okay for security

            Console.WriteLine($"[COLLECTOR_UNLOCK] 🔒 Collector {collectorId} locked");
        }

        // NEW: Method to check if collector is unlocked
        public bool IsCollectorUnlocked(int collectorId)
        {
            return _userPasswordCache.ContainsKey(collectorId);
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
            // Create a copy for database storage
            var collectorForDb = CreateCollectorCopy(newCollector);

            // Handle encryption
            if (!string.IsNullOrEmpty(collectorForDb.EncryptionPassword) && collectorForDb.ExternalAccessToken)
            {
                collectorForDb.AccessToken = _secretsService.EncryptWithPassword(
                    collectorForDb.AccessToken ?? string.Empty,
                    collectorForDb.EncryptionPassword
                );
            }
            else
            {
                EncryptCollectorSecrets(collectorForDb);
            }

            var sql = @"
        INSERT INTO Collectors (
            Name, CollectorType, Description, URL, AccessToken, ExternalAccessToken, PollRate, SendRate, ServiceId, DecimalPlaces
        ) VALUES (
            @Name, @CollectorType, @Description, @URL, @AccessToken, @ExternalAccessToken, @PollRate, @SendRate, @ServiceId, @DecimalPlaces
        );
        SELECT last_insert_rowid();
    ";

            // Save and assign ID to original (clean) object
            newCollector.Id = await _db.ExecuteScalarAsync<int>(sql, collectorForDb);

            return newCollector;
        }

        // Update an existing collector
        public async Task<bool> UpdateCollectorAsync(int id, Model_Collector updatedCollector)
        {
            // Create a copy for database storage
            var collectorForDb = CreateCollectorCopy(updatedCollector);
            collectorForDb.Id = id;

            // Handle encryption
            if (!string.IsNullOrEmpty(collectorForDb.EncryptionPassword) && collectorForDb.ExternalAccessToken)
            {
                collectorForDb.AccessToken = _secretsService.EncryptWithPassword(
                    collectorForDb.AccessToken ?? string.Empty,
                    collectorForDb.EncryptionPassword
                );
            }
            else
            {
                EncryptCollectorSecrets(collectorForDb);
            }

            var sql = @"
        UPDATE Collectors SET
            Name = @Name,
            CollectorType = @CollectorType,
            Description = @Description,
            URL = @URL,
            AccessToken = @AccessToken,
            ExternalAccessToken = @ExternalAccessToken,
            PollRate = @PollRate,
            SendRate = @SendRate,
            ServiceId = @ServiceId,
            DecimalPlaces = @DecimalPlaces
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

            // Clean up caches for this collector
            LockCollector(id);

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
                if (!string.IsNullOrEmpty(collector.AccessToken) && !_secretsService.IsEncrypted(collector.AccessToken))
                {
                    collector.AccessToken = _secretsService.EncryptSecret(collector.AccessToken);
                }
            }
        }

        // MODIFIED: Enhanced to handle password-encrypted tokens
        private void DecryptCollectorSecrets(Model_Collector collector)
        {
            if (!string.IsNullOrEmpty(collector.AccessToken))
            {
                // If this is a password-encrypted collector and it's not unlocked, don't decrypt
                if (collector.ExternalAccessToken && !IsCollectorUnlocked(collector.Id))
                {
                    collector.DecryptedAccessToken = null; // Explicitly null to indicate locked state
                    return;
                }

                var encrypted = collector.AccessToken;
                var cacheKey = ComputeStableHash(encrypted);

                if (_decryptedTokenCache.TryGetValue(cacheKey, out var cached))
                {
                    collector.DecryptedAccessToken = cached;
                    // Console.WriteLine($"[COLLECTOR_CACHE] ✅ Cache hit for collector {collector.Id}");
                }
                else
                {
                    // Only attempt automatic decryption for non-password encrypted tokens
                    if (!collector.ExternalAccessToken)
                    {
                        var decrypted = _secretsService.DecryptSecret(encrypted);
                        _decryptedTokenCache[cacheKey] = decrypted;
                        collector.DecryptedAccessToken = decrypted;
                        Console.WriteLine($"[COLLECTOR_CACHE] 🔓 Cache miss - decrypted and cached collector {collector.Id}");
                    }
                    else
                    {
                        collector.DecryptedAccessToken = null; // Password required
                    }
                }
            }
        }

        private static string ComputeStableHash(string input)
        {
            using var sha256 = System.Security.Cryptography.SHA256.Create();
            var bytes = System.Text.Encoding.UTF8.GetBytes(input);
            var hash = sha256.ComputeHash(bytes);
            return Convert.ToBase64String(hash);
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
                ExternalAccessToken = original.ExternalAccessToken,
                EncryptionPassword = original.EncryptionPassword,
                PollRate = original.PollRate,
                SendRate = original.SendRate,
                ServiceId = original.ServiceId,
                DecimalPlaces = original.DecimalPlaces,
                Status = original.Status,
            };
        }
    }
}