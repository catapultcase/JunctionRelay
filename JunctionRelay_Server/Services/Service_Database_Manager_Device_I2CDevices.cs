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
using System.Data;
using Dapper;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_Device_I2CDevices
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Device_I2CDevices(IDbConnection dbConnection)
        {
            _db = dbConnection;
        }

        // Fetch all I2C devices for a given device
        public async Task<List<Model_Device_I2CDevice>> GetI2CDevicesForDeviceAsync(int deviceId)
        {
            try
            {
                const string sql = "SELECT * FROM DeviceI2CDevices WHERE DeviceId = @DeviceId";
                var devices = await _db.QueryAsync<Model_Device_I2CDevice>(sql, new { DeviceId = deviceId });
                return devices.AsList();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_DEVICE_I2C_DEVICES] Error fetching I2C devices for DeviceId {deviceId}: {ex.Message}");
                throw;
            }
        }

        // Fetch single I2C device by ID
        public async Task<Model_Device_I2CDevice?> GetI2CDeviceByIdAsync(int id)
        {
            try
            {
                const string sql = "SELECT * FROM DeviceI2CDevices WHERE Id = @Id";
                return await _db.QuerySingleOrDefaultAsync<Model_Device_I2CDevice>(sql, new { Id = id });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_DEVICE_I2C_DEVICES] Error fetching I2C device with ID {id}: {ex.Message}");
                throw;
            }
        }

        // Create new I2C device
        public async Task<Model_Device_I2CDevice> AddI2CDeviceAsync(Model_Device_I2CDevice newDevice)
        {
            try
            {
                const string sql = @"
                    INSERT INTO DeviceI2CDevices (DeviceId, I2CAddress, DeviceType, CommunicationProtocol, IsEnabled, DateAdded)
                    VALUES (@DeviceId, @I2CAddress, @DeviceType, @CommunicationProtocol, @IsEnabled, @DateAdded);
                    SELECT * FROM DeviceI2CDevices WHERE Id = last_insert_rowid();";

                return await _db.QuerySingleAsync<Model_Device_I2CDevice>(sql, newDevice);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_DEVICE_I2C_DEVICES] Error adding new I2C device: {ex.Message}");
                throw;
            }
        }

        // Update an existing I2C device
        public async Task<bool> UpdateI2CDeviceAsync(int id, Model_Device_I2CDevice updated)
        {
            try
            {
                const string sql = @"
                    UPDATE DeviceI2CDevices
                    SET I2CAddress = @I2CAddress,
                        DeviceType = @DeviceType,
                        CommunicationProtocol = @CommunicationProtocol,
                        IsEnabled = @IsEnabled
                    WHERE Id = @Id";

                var rows = await _db.ExecuteAsync(sql, new
                {
                    Id = id,
                    updated.I2CAddress,
                    updated.DeviceType,
                    updated.CommunicationProtocol,
                    updated.IsEnabled
                });

                return rows > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_DEVICE_I2C_DEVICES] Error updating I2C device with ID {id}: {ex.Message}");
                throw;
            }
        }

        // Delete an I2C device
        public async Task<bool> DeleteI2CDeviceAsync(int id)
        {
            try
            {
                const string sql = "DELETE FROM DeviceI2CDevices WHERE Id = @Id";
                var rows = await _db.ExecuteAsync(sql, new { Id = id });
                return rows > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_DEVICE_I2C_DEVICES] Error deleting I2C device with ID {id}: {ex.Message}");
                throw;
            }
        }

        // Add endpoint to I2C device
        public async Task<int> AddI2CEndpointAsync(Model_Device_I2CDevice_Endpoint endpoint)
        {
            try
            {
                const string sql = @"
                    INSERT INTO DeviceI2CDeviceEndpoints (I2CDeviceId, EndpointType, Address, QoS, Notes)
                    VALUES (@I2CDeviceId, @EndpointType, @Address, @QoS, @Notes);
                    SELECT last_insert_rowid();";

                return await _db.ExecuteScalarAsync<int>(sql, endpoint);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_DEVICE_I2C_DEVICES] Error adding endpoint to I2C device: {ex.Message}");
                throw;
            }
        }

        // Fetch all endpoints for an I2C device
        public async Task<List<Model_Device_I2CDevice_Endpoint>> GetEndpointsForI2CDeviceAsync(int i2cDeviceId)
        {
            try
            {
                const string sql = "SELECT * FROM DeviceI2CDeviceEndpoints WHERE I2CDeviceId = @I2CDeviceId";
                var endpoints = await _db.QueryAsync<Model_Device_I2CDevice_Endpoint>(sql, new { I2CDeviceId = i2cDeviceId });
                return endpoints.AsList();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_DEVICE_I2C_DEVICES] Error fetching endpoints for I2C device with ID {i2cDeviceId}: {ex.Message}");
                throw;
            }
        }

        // Update an I2C device endpoint
        public async Task<bool> UpdateEndpointAsync(int id, Model_Device_I2CDevice_Endpoint updatedEndpoint)
        {
            try
            {
                const string sql = @"
                    UPDATE DeviceI2CDeviceEndpoints
                    SET EndpointType = @EndpointType,
                        Address = @Address,
                        QoS = @QoS,
                        Notes = @Notes
                    WHERE Id = @Id";

                var rows = await _db.ExecuteAsync(sql, new
                {
                    Id = id,
                    updatedEndpoint.EndpointType,
                    updatedEndpoint.Address,
                    updatedEndpoint.QoS,
                    updatedEndpoint.Notes
                });

                return rows > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_DEVICE_I2C_DEVICES] Error updating endpoint with ID {id}: {ex.Message}");
                throw;
            }
        }

        // Delete an I2C device endpoint
        public async Task<bool> DeleteEndpointAsync(int id)
        {
            try
            {
                const string sql = "DELETE FROM DeviceI2CDeviceEndpoints WHERE Id = @Id";
                var rows = await _db.ExecuteAsync(sql, new { Id = id });
                return rows > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_DEVICE_I2C_DEVICES] Error deleting endpoint with ID {id}: {ex.Message}");
                throw;
            }
        }
    }
}