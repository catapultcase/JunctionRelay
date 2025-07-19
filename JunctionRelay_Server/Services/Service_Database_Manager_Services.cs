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
    public class Service_Database_Manager_Services
    {
        private readonly IDbConnection _db;
        private readonly Service_Database_Manager_Sensors _sensorsDbManager;
        private readonly ISecretsService _secretsService;

        public Service_Database_Manager_Services(IDbConnection dbConnection,
                                                 Service_Database_Manager_Sensors sensorsDbManager,
                                                 ISecretsService secretsService)
        {
            _db = dbConnection;
            _sensorsDbManager = sensorsDbManager;
            _secretsService = secretsService;
        }

        private static readonly ConcurrentDictionary<string, string> _decryptedTokenCache = new();

        // NEW: Cache for user-provided passwords (never stored, only in memory)
        private static readonly ConcurrentDictionary<int, string> _userPasswordCache = new();

        // NEW: Method to unlock a service with user password
        public async Task<bool> UnlockServiceWithPasswordAsync(int serviceId, string password)
        {
            var service = await _db.QuerySingleOrDefaultAsync<Model_Service>(
                "SELECT * FROM Services WHERE Id = @Id", new { Id = serviceId });

            if (service == null || !service.ExternalAccessToken || string.IsNullOrEmpty(service.AccessToken))
            {
                return false;
            }

            try
            {
                // Test if the password can decrypt the token
                var decryptedToken = _secretsService.DecryptWithPassword(service.AccessToken, password);

                // If we get here without exception, password is correct
                // Cache the decrypted token using existing cache mechanism
                var cacheKey = ComputeStableHash(service.AccessToken);
                _decryptedTokenCache[cacheKey] = decryptedToken;

                // Also store that this service is unlocked (for UI state)
                _userPasswordCache[serviceId] = "unlocked"; // We don't store the actual password

                Console.WriteLine($"[SERVICE_UNLOCK] ✅ Service {serviceId} unlocked successfully");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_UNLOCK] ❌ Failed to unlock service {serviceId}: {ex.Message}");
                return false;
            }
        }

        // NEW: Method to lock a service (remove from cache)
        public void LockService(int serviceId)
        {
            _userPasswordCache.TryRemove(serviceId, out _);
            Console.WriteLine($"[SERVICE_UNLOCK] 🔒 Service {serviceId} locked");
        }

        // NEW: Method to check if service is unlocked
        public bool IsServiceUnlocked(int serviceId)
        {
            return _userPasswordCache.ContainsKey(serviceId);
        }

        public async Task<List<Model_Service>> GetAllServicesAsync()
        {
            var services = (await _db.QueryAsync<Model_Service>("SELECT * FROM Services")).ToList();

            foreach (var service in services)
            {
                // Decrypt secrets for each service
                DecryptServiceSecrets(service);

                var sensors = await _db.QueryAsync<Model_Sensor>(
                    "SELECT * FROM Sensors WHERE ServiceId = @ServiceId",
                    new { ServiceId = service.Id });

                service.Sensors = sensors.ToList();
            }

            return services;
        }

        public async Task<Model_Service?> GetServiceByIdAsync(int id)
        {
            var service = await _db.QuerySingleOrDefaultAsync<Model_Service>(
                "SELECT * FROM Services WHERE Id = @Id",
                new { Id = id }
            );
            if (service == null)
                return null;

            // Decrypt secrets for the service
            DecryptServiceSecrets(service);

            var sensors = await _db.QueryAsync<Model_Sensor>(
                "SELECT * FROM Sensors WHERE ServiceId = @ServiceId",
                new { ServiceId = id }
            );

            service.Sensors = sensors.ToList();
            return service;
        }

        public async Task<Model_Service> AddServiceAsync(Model_Service newService)
        {
            newService.Status ??= "Offline";
            newService.LastUpdated = DateTime.UtcNow;

            // Create a copy for database storage
            var serviceForDb = CreateServiceCopy(newService);

            // Handle encryption
            if (!string.IsNullOrEmpty(serviceForDb.EncryptionPassword) && serviceForDb.ExternalAccessToken)
            {
                serviceForDb.AccessToken = _secretsService.EncryptWithPassword(
                    serviceForDb.AccessToken ?? string.Empty,
                    serviceForDb.EncryptionPassword
                );
            }
            else
            {
                EncryptServiceSecrets(serviceForDb);
            }

            var sql = @"
                INSERT INTO Services (
                    Name, Description, Type, Status, LastUpdated, URL, PollRate, SendRate, IsGateway, GatewayId, IsJunctionRelayService, SelectedPort,
                    ServiceModel, ServiceManufacturer, FirmwareVersion, MCU, WirelessConnectivity, UniqueIdentifier, 
                    MQTTBrokerAddress, MQTTBrokerPort, MQTTUsername, AccessToken, ExternalAccessToken
                )
                VALUES (
                    @Name, @Description, @Type, @Status, @LastUpdated, @URL, @PollRate, @SendRate, @IsGateway, @GatewayId, @IsJunctionRelayService, @SelectedPort,
                    @ServiceModel, @ServiceManufacturer, @FirmwareVersion, @MCU, @WirelessConnectivity, @UniqueIdentifier, 
                    @MQTTBrokerAddress, @MQTTBrokerPort, @MQTTUsername, @AccessToken, @ExternalAccessToken
                );
                SELECT last_insert_rowid();";

            int newId = await _db.ExecuteScalarAsync<int>(sql, serviceForDb);
            newService.Id = newId;

            return newService;
        }

        public async Task<bool> UpdateServiceAsync(int id, Model_Service updatedService)
        {
            var existing = await _db.QuerySingleOrDefaultAsync<Model_Service>("SELECT * FROM Services WHERE Id = @Id", new { Id = id });
            if (existing == null) return false;

            updatedService.LastUpdated = DateTime.UtcNow;
            updatedService.Id = id;

            // Create a copy for database storage
            var serviceForDb = CreateServiceCopy(updatedService);

            // Handle encryption
            if (!string.IsNullOrEmpty(serviceForDb.EncryptionPassword) && serviceForDb.ExternalAccessToken)
            {
                serviceForDb.AccessToken = _secretsService.EncryptWithPassword(
                    serviceForDb.AccessToken ?? string.Empty,
                    serviceForDb.EncryptionPassword
                );
            }
            else
            {
                EncryptServiceSecrets(serviceForDb);
            }

            var sql = @"
                UPDATE Services SET
                    Name = @Name, Description = @Description, Type = @Type, Status = @Status, LastUpdated = @LastUpdated,
                    URL = @URL, PollRate = @PollRate, SendRate = @SendRate, IsGateway = @IsGateway, GatewayId = @GatewayId,
                    IsJunctionRelayService = @IsJunctionRelayService, SelectedPort = @SelectedPort,
                    ServiceModel = @ServiceModel, ServiceManufacturer = @ServiceManufacturer,
                    FirmwareVersion = @FirmwareVersion, MCU = @MCU, WirelessConnectivity = @WirelessConnectivity,
                    UniqueIdentifier = @UniqueIdentifier, 
                    MQTTBrokerAddress = @MQTTBrokerAddress, MQTTBrokerPort = @MQTTBrokerPort, MQTTUsername = @MQTTUsername, 
                    AccessToken = @AccessToken, ExternalAccessToken = @ExternalAccessToken
                WHERE Id = @Id;";

            await _db.ExecuteAsync(sql, serviceForDb);

            return true;
        }

        public async Task<bool> DeleteServiceAsync(int id)
        {
            var service = await _db.QuerySingleOrDefaultAsync<Model_Service>("SELECT * FROM Services WHERE Id = @Id", new { Id = id });
            if (service == null) return false;

            // Clean up caches for this service
            LockService(id);

            // Delete associated sensors
            await _db.ExecuteAsync("DELETE FROM Sensors WHERE ServiceId = @Id", new { Id = id });

            // Delete the service
            await _db.ExecuteAsync("DELETE FROM Services WHERE Id = @Id", new { Id = id });

            return true;
        }

        // Helper method to encrypt secrets in a service
        private void EncryptServiceSecrets(Model_Service service)
        {
            if (!string.IsNullOrEmpty(service.AccessToken))
            {
                if (!_secretsService.IsEncrypted(service.AccessToken))
                {
                    service.AccessToken = _secretsService.EncryptSecret(service.AccessToken);
                }
            }
        }

        // MODIFIED: Enhanced to handle password-encrypted tokens
        private void DecryptServiceSecrets(Model_Service service)
        {
            if (!string.IsNullOrEmpty(service.AccessToken))
            {
                // If this is a password-encrypted service and it's not unlocked, don't decrypt
                if (service.ExternalAccessToken && !IsServiceUnlocked(service.Id))
                {
                    service.DecryptedAccessToken = null; // Explicitly null to indicate locked state
                    return;
                }

                var encrypted = service.AccessToken;
                var cacheKey = ComputeStableHash(encrypted);

                if (_decryptedTokenCache.TryGetValue(cacheKey, out var cached))
                {
                    service.DecryptedAccessToken = cached;
                }
                else
                {
                    // Only attempt automatic decryption for non-password encrypted tokens
                    if (!service.ExternalAccessToken)
                    {
                        var decrypted = _secretsService.DecryptSecret(encrypted);
                        _decryptedTokenCache[cacheKey] = decrypted;
                        service.DecryptedAccessToken = decrypted;
                        Console.WriteLine($"[SERVICE_CACHE] 🔓 Cache miss - decrypted and cached service {service.Id}");
                    }
                    else
                    {
                        service.DecryptedAccessToken = null; // Password required
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

        // Helper to create a copy of the service for database operations
        private Model_Service CreateServiceCopy(Model_Service original)
        {
            return new Model_Service
            {
                Id = original.Id,
                Name = original.Name,
                Description = original.Description,
                Type = original.Type,
                Status = original.Status,
                UniqueIdentifier = original.UniqueIdentifier,
                SelectedPort = original.SelectedPort,
                ServiceModel = original.ServiceModel,
                ServiceManufacturer = original.ServiceManufacturer,
                FirmwareVersion = original.FirmwareVersion,
                MCU = original.MCU,
                WirelessConnectivity = original.WirelessConnectivity,
                URL = original.URL,
                IsGateway = original.IsGateway,
                GatewayId = original.GatewayId,
                IsJunctionRelayService = original.IsJunctionRelayService,
                LastUpdated = original.LastUpdated,
                PollRate = original.PollRate,
                SendRate = original.SendRate,
                LastPolled = original.LastPolled,
                AccessToken = original.AccessToken,
                ExternalAccessToken = original.ExternalAccessToken,
                EncryptionPassword = original.EncryptionPassword,
                HomeAssistantAddress = original.HomeAssistantAddress,
                HomeAssistantAPIKey = original.HomeAssistantAPIKey,
                HomeAssistantUsername = original.HomeAssistantUsername,
                MQTTBrokerAddress = original.MQTTBrokerAddress,
                MQTTBrokerPort = original.MQTTBrokerPort,
                MQTTUsername = original.MQTTUsername,
            };
        }
    }
}