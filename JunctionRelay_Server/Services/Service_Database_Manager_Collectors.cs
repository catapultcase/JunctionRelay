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

                // Update SecurityStatus in database
                await _db.ExecuteAsync("UPDATE Collectors SET SecurityStatus = 'Unlocked' WHERE Id = @Id", new { Id = collectorId });

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

            // Update SecurityStatus in database
            _db.Execute("UPDATE Collectors SET SecurityStatus = 'Locked' WHERE Id = @Id", new { Id = collectorId });

            Console.WriteLine($"[COLLECTOR_UNLOCK] 🔒 Collector {collectorId} locked");
        }

        // NEW: Method to check if collector is unlocked
        public bool IsCollectorUnlocked(int collectorId)
        {
            return _userPasswordCache.ContainsKey(collectorId);
        }

        // UPDATED: Method to update last fetch information with lost sensors tracking
        public async Task<bool> UpdateLastFetchInfoAsync(int collectorId, DateTime lastFetchTime,
            int totalSensors, int newSensors, bool fetchSuccessful, string errorMessage, int lostSensors = 0)
        {
            try
            {
                var sql = @"
                    UPDATE Collectors SET
                        LastFetchTime = @LastFetchTime,
                        LastFetchTotalSensors = @LastFetchTotalSensors,
                        LastFetchNewSensors = @LastFetchNewSensors,
                        LastFetchLostSensors = @LastFetchLostSensors,
                        LastFetchSuccessful = @LastFetchSuccessful,
                        LastFetchErrorMessage = @LastFetchErrorMessage
                    WHERE Id = @Id;
                ";

                var rowsAffected = await _db.ExecuteAsync(sql, new
                {
                    Id = collectorId,
                    LastFetchTime = lastFetchTime,
                    LastFetchTotalSensors = totalSensors,
                    LastFetchNewSensors = newSensors,
                    LastFetchLostSensors = lostSensors,
                    LastFetchSuccessful = fetchSuccessful,
                    LastFetchErrorMessage = errorMessage
                });

                Console.WriteLine($"[FETCH_TRACKING] Updated last fetch info for collector {collectorId}: Success={fetchSuccessful}, Total={totalSensors}, New={newSensors}, Lost={lostSensors}");
                return rowsAffected > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FETCH_TRACKING] ❌ Error updating last fetch info for collector {collectorId}: {ex.Message}");
                return false;
            }
        }

        // NEW: Method to update last tested timestamp
        public async Task<bool> UpdateLastTestedAsync(int collectorId, DateTime lastTested)
        {
            try
            {
                var sql = @"
                    UPDATE Collectors SET
                        LastTested = @LastTested
                    WHERE Id = @Id;
                ";

                var rowsAffected = await _db.ExecuteAsync(sql, new
                {
                    Id = collectorId,
                    LastTested = lastTested
                });

                Console.WriteLine($"[TEST_TRACKING] Updated last tested for collector {collectorId}: {lastTested}");
                return rowsAffected > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TEST_TRACKING] ❌ Error updating last tested for collector {collectorId}: {ex.Message}");
                return false;
            }
        }

        // NEW: Method to update collector status
        public async Task<bool> UpdateCollectorStatusAsync(int collectorId, string status)
        {
            try
            {
                // EventEngine status is always "Active" and should never be changed
                var collector = await GetCollectorByIdAsync(collectorId);
                if (collector?.CollectorType == "EventEngine")
                {
                    Console.WriteLine($"[COLLECTOR_STATUS] Skipping status update for EventEngine - always Active");
                    return true;
                }

                var sql = @"
                    UPDATE Collectors SET
                        Status = @Status
                    WHERE Id = @Id;
                ";

                var rowsAffected = await _db.ExecuteAsync(sql, new
                {
                    Id = collectorId,
                    Status = status
                });

                Console.WriteLine($"[COLLECTOR_STATUS] Updated status for collector {collectorId}: {status}");
                return rowsAffected > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[COLLECTOR_STATUS] ❌ Error updating status for collector {collectorId}: {ex.Message}");
                return false;
            }
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

            // Set default status for new collectors
            if (string.IsNullOrEmpty(collectorForDb.Status))
            {
                // EventEngine is always Active
                collectorForDb.Status = collectorForDb.CollectorType == "EventEngine" ? "Active" : "Pending";
            }

            // Set SecurityStatus based on ExternalAccessToken
            collectorForDb.SecurityStatus = collectorForDb.ExternalAccessToken ? "Locked" : "Unlocked";

            var sql = @"
        INSERT INTO Collectors (
            Name, CollectorType, Status, SecurityStatus, Description, URL, AccessToken, ExternalAccessToken, PollRate, SendRate, ServiceId, DecimalPlaces, TestFrequency
        ) VALUES (
            @Name, @CollectorType, @Status, @SecurityStatus, @Description, @URL, @AccessToken, @ExternalAccessToken, @PollRate, @SendRate, @ServiceId, @DecimalPlaces, @TestFrequency
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
            // Get the existing collector first to compare encryption methods
            var existingCollector = await _db.QuerySingleOrDefaultAsync<Model_Collector>(
                "SELECT * FROM Collectors WHERE Id = @Id", new { Id = id });

            if (existingCollector == null)
            {
                Console.WriteLine($"[COLLECTOR_UPDATE] ❌ Collector {id} not found for update");
                return false;
            }

            // Create a copy for database storage
            var collectorForDb = CreateCollectorCopy(updatedCollector);
            collectorForDb.Id = id;

            // Handle encryption based on the encryption method
            if (!string.IsNullOrEmpty(collectorForDb.EncryptionPassword) && collectorForDb.ExternalAccessToken)
            {
                // User wants password-based encryption
                Console.WriteLine($"[COLLECTOR_UPDATE] 🔐 Applying password-based encryption for collector {id}");

                if (!string.IsNullOrEmpty(collectorForDb.AccessToken))
                {
                    collectorForDb.AccessToken = _secretsService.EncryptWithPassword(
                        collectorForDb.AccessToken,
                        collectorForDb.EncryptionPassword
                    );
                }

                // If switching FROM database encryption TO password encryption, clean up cache
                if (!existingCollector.ExternalAccessToken && collectorForDb.ExternalAccessToken)
                {
                    Console.WriteLine($"[COLLECTOR_UPDATE] 🔄 Switching from DB encryption to password encryption for collector {id}");
                    LockCollector(id); // This will clear any cached tokens
                }
            }
            else if (!collectorForDb.ExternalAccessToken)
            {
                // User wants database encryption
                Console.WriteLine($"[COLLECTOR_UPDATE] 🗄️ Applying database encryption for collector {id}");

                // If switching FROM password encryption TO database encryption
                if (existingCollector.ExternalAccessToken && !collectorForDb.ExternalAccessToken)
                {
                    Console.WriteLine($"[COLLECTOR_UPDATE] 🔄 Switching from password encryption to DB encryption for collector {id}");
                    LockCollector(id); // Clear any cached tokens

                    // If access token is provided, encrypt it with database encryption
                    if (!string.IsNullOrEmpty(collectorForDb.AccessToken))
                    {
                        EncryptCollectorSecrets(collectorForDb);
                    }
                }
                else if (!string.IsNullOrEmpty(collectorForDb.AccessToken))
                {
                    // Standard database encryption for new/updated tokens
                    EncryptCollectorSecrets(collectorForDb);
                }
            }
            else
            {
                // ExternalAccessToken is true but no encryption password provided
                // This means we're keeping the existing encryption method and password
                Console.WriteLine($"[COLLECTOR_UPDATE] 🔒 Keeping existing password encryption for collector {id}");

                // If no new access token provided, don't update the access token field
                if (string.IsNullOrEmpty(collectorForDb.AccessToken))
                {
                    // Keep the existing access token by not including it in the update
                    // We'll exclude it from the SQL update below
                }
                else
                {
                    // New access token provided but no password - this shouldn't happen with proper UI validation
                    // but we'll handle it gracefully by not updating the access token
                    Console.WriteLine($"[COLLECTOR_UPDATE] ⚠️ New access token provided for password-encrypted collector {id} but no encryption password - skipping access token update");
                    collectorForDb.AccessToken = null; // Don't update the access token
                }
            }

            // Clear the encryption password from the object - we never store this in the database
            collectorForDb.EncryptionPassword = null;

            // Build the SQL update statement dynamically to exclude null access tokens
            var updateFields = new List<string>
    {
        "Name = @Name",
        "CollectorType = @CollectorType",
        "Description = @Description",
        "URL = @URL", // Now included in updates
        "ExternalAccessToken = @ExternalAccessToken",
        "PollRate = @PollRate",
        "SendRate = @SendRate",
        "ServiceId = @ServiceId",
        "DecimalPlaces = @DecimalPlaces",
        "TestFrequency = @TestFrequency" // NEW
    };

            // Only update AccessToken if it's not null (meaning we want to update it)
            if (collectorForDb.AccessToken != null)
            {
                updateFields.Add("AccessToken = @AccessToken");
            }

            var sql = $@"
        UPDATE Collectors SET
            {string.Join(", ", updateFields)}
        WHERE Id = @Id;
    ";

            try
            {
                var rowsAffected = await _db.ExecuteAsync(sql, collectorForDb);

                if (rowsAffected > 0)
                {
                    Console.WriteLine($"[COLLECTOR_UPDATE] ✅ Successfully updated collector {id}");

                    // If we switched encryption methods, the collector might need to be unlocked again
                    if (existingCollector.ExternalAccessToken != collectorForDb.ExternalAccessToken)
                    {
                        Console.WriteLine($"[COLLECTOR_UPDATE] 🔄 Encryption method changed for collector {id} - may require unlock");
                    }

                    return true;
                }
                else
                {
                    Console.WriteLine($"[COLLECTOR_UPDATE] ❌ No rows affected when updating collector {id}");
                    return false;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[COLLECTOR_UPDATE] ❌ Error updating collector {id}: {ex.Message}");
                throw;
            }
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
                TestFrequency = original.TestFrequency,
                Status = original.Status,
            };
        }
    }
}