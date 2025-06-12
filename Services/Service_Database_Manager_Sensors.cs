/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

using JunctionRelayServer.Models;
using Dapper;
using System.Data;
using Microsoft.Data.Sqlite;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_Sensors
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Sensors(IDbConnection dbConnection)
        {
            _db = dbConnection;
        }

        // Fetch all sensors from the database (can be linked to a device or a collector)
        public async Task<List<Model_Sensor>> GetAllSensorsAsync()
        {
            var sensors = (await _db.QueryAsync<Model_Sensor>("SELECT * FROM Sensors")).ToList();
            return sensors;
        }

        // Fetch a sensor by ID from the database
        public async Task<Model_Sensor?> GetSensorByIdAsync(int id)
        {
            var sensor = await _db.QuerySingleOrDefaultAsync<Model_Sensor>(
                "SELECT * FROM Sensors WHERE Id = @Id",
                new { Id = id }
            );
            return sensor;
        }

        // Fetch a sensor by ExternalId for a specific junction
        public async Task<Model_Sensor?> GetSensorByExternalIdAsync(int junctionId, string externalId)
        {
            var sensor = await _db.QuerySingleOrDefaultAsync<Model_Sensor>(
                "SELECT * FROM JunctionSensors WHERE JunctionId = @JunctionId AND ExternalId = @ExternalId",
                new { JunctionId = junctionId, ExternalId = externalId }
            );
            return sensor;
        }

        public async Task<List<Model_Sensor>> GetJunctionSensorsByJunctionIdAsync(int junctionId)
        {
            var sql = "SELECT * FROM JunctionSensors WHERE JunctionId = @JunctionId";
            var sensors = await _db.QueryAsync<Model_Sensor>(sql, new { JunctionId = junctionId });
            return sensors.ToList();
        }

        public async Task<List<Model_JunctionSensorTarget>> GetSensorTargetsAsyncForScreen(int junctionId, int screenId)
        {
            var sql = @"
        SELECT *
        FROM JunctionSensorTargets
        WHERE JunctionId = @JunctionId AND ScreenId = @ScreenId";

            var results = await _db.QueryAsync<Model_JunctionSensorTarget>(sql, new { JunctionId = junctionId, ScreenId = screenId });
            return results.ToList();
        }

        public async Task<List<Model_JunctionSensorTarget>> GetAllSensorTargetsForJunctionAsync(int junctionId)
        {
            var sql = @"
        SELECT *
        FROM JunctionSensorTargets
        WHERE JunctionId = @JunctionId";

            var results = await _db.QueryAsync<Model_JunctionSensorTarget>(sql, new { JunctionId = junctionId });
            return results.ToList();
        }



        // Add a new sensor to the database
        public async Task<Model_Sensor> AddSensorAsync(Model_Sensor newSensor)
        {
            newSensor.LastUpdated = DateTime.UtcNow;

            var sql = @"
        INSERT INTO Sensors (
            Name, SensorType, Value, ComponentName, Unit, DeviceId, ServiceId, CollectorId, ExternalId, SensorTag, Category, DeviceName, LastUpdated,
            MQTTTopic, MQTTServiceId, MQTTQoS
        )
        VALUES (
            @Name, @SensorType, @Value, @ComponentName, @Unit, @DeviceId, @ServiceId, @CollectorId, @ExternalId, @SensorTag, @Category, @DeviceName, @LastUpdated,
            @MQTTTopic, @MQTTServiceId, @MQTTQoS
        );
        SELECT last_insert_rowid();";

            int newId = await _db.ExecuteScalarAsync<int>(sql, newSensor);
            newSensor.Id = newId;

            return newSensor;
        }

        public async Task<bool> DeleteSensorAsync(int id)
        {
            const string sql = "DELETE FROM Sensors WHERE Id = @Id;";
            var rows = await _db.ExecuteAsync(sql, new { Id = id });
            return rows > 0;
        }

        // Update a sensor's data in the database
        public async Task<bool> UpdateSensorAsync(int id, Model_Sensor updatedSensor)
        {
            var existing = await _db.QuerySingleOrDefaultAsync<Model_Sensor>(
                "SELECT * FROM Sensors WHERE Id = @Id",
                new { Id = id }
            );
            if (existing == null) return false;

            updatedSensor.LastUpdated = DateTime.UtcNow;
            updatedSensor.Id = id;

            var sql = @"
                UPDATE Sensors SET
                    Name = @Name,
                    SensorType = @SensorType,
                    Value = @Value,
                    ComponentName = @ComponentName,
                    Unit = @Unit,
                    DeviceId = @DeviceId,
                    ServiceId = @ServiceId,
                    CollectorId = @CollectorId,  -- Optional: Update CollectorId
                    ExternalId = @ExternalId,
                    LastUpdated = @LastUpdated
                WHERE Id = @Id;";

            await _db.ExecuteAsync(sql, updatedSensor);
            return true;
        }

        public async Task<bool> UpdateJunctionSensorValueAsync(int junctionId, string externalId, string value, DateTime timestamp)
        {
            var sql = @"
        UPDATE JunctionSensors
        SET Value = @Value,
            LastUpdated = @LastUpdated
        WHERE JunctionId = @JunctionId AND ExternalId = @ExternalId";

            var rowsAffected = await _db.ExecuteAsync(sql, new
            {
                JunctionId = junctionId,
                ExternalId = externalId,
                Value = value,
                LastUpdated = timestamp
            });

            return rowsAffected > 0;
        }


        // Check if a sensor exists in the database using ExternalId
        public async Task<bool> SensorExistsAsync(string externalId)
        {
            var existing = await _db.QuerySingleOrDefaultAsync<Model_Sensor>(
                "SELECT * FROM Sensors WHERE ExternalId = @ExternalId",
                new { ExternalId = externalId }
            );

            return existing != null;
        }

        // Fetch all sensors for a specific device from the database
        public async Task<List<Model_Sensor>> GetSensorsByDeviceIdAsync(int deviceId)
        {
            string query = "SELECT * FROM Sensors WHERE DeviceId = @DeviceId";

            var sensors = (await _db.QueryAsync<Model_Sensor>(query, new { DeviceId = deviceId })).ToList();

            return sensors;
        }

        // Fetch all sensors for a specific collector from the database
        public async Task<List<Model_Sensor>> GetSensorsByCollectorIdAsync(int collectorId)
        {
            string query = "SELECT * FROM Sensors WHERE CollectorId = @CollectorId";

            var sensors = (await _db.QueryAsync<Model_Sensor>(query, new { CollectorId = collectorId })).ToList();

            return sensors;
        }


        // Insert cloned sensors into JunctionSensors table for a specific junction
        public async Task InsertJunctionSensorsAsync(int junctionId, List<Model_Sensor> sensors)
        {
            int insertedCount = 0;

            // Fetch both the type and MQTTBrokerId in a single query
            var junctionData = await _db.QueryFirstOrDefaultAsync(
                "SELECT Type, MQTTBrokerId FROM Junctions WHERE Id = @Id",
                new { Id = junctionId });

            // Now declare these as nullable
            string? junctionType = junctionData?.Type;
            int? junctionMQTTBrokerId = (int?)junctionData?.MQTTBrokerId;

            bool isMqttJunction =
                string.Equals(junctionType, "MQTT Junction", StringComparison.OrdinalIgnoreCase);

            foreach (var sensor in sensors)
            {
                var clonedSensor = sensor.Clone();
                clonedSensor.JunctionId = junctionId;
                clonedSensor.LastUpdated = DateTime.UtcNow;

                if (isMqttJunction)
                {
                    clonedSensor.MQTTServiceId = junctionMQTTBrokerId;

                    // Simplified topic (you can re-add prefixes if you need them)
                    clonedSensor.MQTTTopic = $"JunctionRelay/j{junctionId}/{sensor.ExternalId.Replace("/", "")}";
                }
                else
                {
                    clonedSensor.MQTTTopic = null;
                }

                const string sql = @"
INSERT INTO JunctionSensors (
    OriginalId, JunctionId, JunctionDeviceLinkId, JunctionCollectorLinkId, SensorOrder,
    MQTTServiceId, MQTTTopic, MQTTQoS, SensorType, 
    IsMissing, IsStale, IsSelected, IsVisible, ExternalId, DeviceId, ServiceId, CollectorId, 
    DeviceName, Name, ComponentName, Category, Unit, Value, SensorTag, Formula, 
    LastUpdated, CustomAttribute1, CustomAttribute2, CustomAttribute3, 
    CustomAttribute4, CustomAttribute5, CustomAttribute6, CustomAttribute7, 
    CustomAttribute8, CustomAttribute9, CustomAttribute10
) VALUES (
    @OriginalId, @JunctionId, @JunctionDeviceLinkId, @JunctionCollectorLinkId, @SensorOrder,
    @MQTTServiceId, @MQTTTopic, @MQTTQoS, @SensorType, 
    @IsMissing, @IsStale, @IsSelected, @IsVisible, @ExternalId, @DeviceId, @ServiceId, @CollectorId, 
    @DeviceName, @Name, @ComponentName, @Category, @Unit, @Value, @SensorTag, @Formula, 
    @LastUpdated, @CustomAttribute1, @CustomAttribute2, @CustomAttribute3, 
    @CustomAttribute4, @CustomAttribute5, @CustomAttribute6, @CustomAttribute7, 
    @CustomAttribute8, @CustomAttribute9, @CustomAttribute10
);";

                await _db.ExecuteAsync(sql, clonedSensor);
                insertedCount++;
            }
        }


        public async Task<int?> GetMaxSensorOrderAsync(int junctionId)
        {
            var sql = "SELECT MAX(SensorOrder) FROM JunctionSensors WHERE JunctionId = @JunctionId";
            return await _db.ExecuteScalarAsync<int?>(sql, new { JunctionId = junctionId });
        }


        // Remove associated JunctionSensors by source (Device or Collector)
        public async Task RemoveJunctionSensorsBySourceIdAsync(int junctionId, int sourceId, bool isDevice)
        {
            // The key is that we need to delete only the sensors associated with the correct source type (device or collector).
            string sql;

            if (isDevice)
            {
                // Remove sensors associated with the device
                sql = @"
            DELETE FROM JunctionSensors 
            WHERE JunctionId = @JunctionId 
            AND JunctionDeviceLinkId = @SourceId";
            }
            else
            {
                // Remove sensors associated with the collector
                sql = @"
            DELETE FROM JunctionSensors 
            WHERE JunctionId = @JunctionId 
            AND JunctionCollectorLinkId = @SourceId";
            }

            // Execute the query and get the number of affected rows.
            var affectedRows = await _db.ExecuteAsync(sql, new { JunctionId = junctionId, SourceId = sourceId });

            // Log how many rows were affected (deleted).
            // Console.WriteLine($"[SERVICE_DATABASE_MANAGER_SENSORS] ✅ Removed {affectedRows} JunctionSensors for source link with ID {sourceId} in junction {junctionId}.");
        }


        // Update a junction sensor for a device (only IsSelected)
        public async Task<bool> UpdateJunctionSensorForDeviceAsync(int sensorId, bool isSelected)
        {
            var sql = @"
        UPDATE JunctionSensors
        SET IsSelected = @IsSelected,
            LastUpdated = @LastUpdated
        WHERE Id = @SensorId AND JunctionDeviceLinkId IS NOT NULL;";

            var rowsAffected = await _db.ExecuteAsync(sql, new
            {
                SensorId = sensorId,
                IsSelected = isSelected,
                LastUpdated = DateTime.UtcNow
            });

            return rowsAffected > 0;
        }

        // Update a junction sensor for a collector (only IsSelected)
        public async Task<bool> UpdateJunctionSensorForCollectorAsync(int sensorId, bool isSelected)
        {
            var sql = @"
        UPDATE JunctionSensors
        SET IsSelected = @IsSelected,
            LastUpdated = @LastUpdated
        WHERE Id = @SensorId AND JunctionCollectorLinkId IS NOT NULL;";

            var rowsAffected = await _db.ExecuteAsync(sql, new
            {
                SensorId = sensorId,
                IsSelected = isSelected,
                LastUpdated = DateTime.UtcNow
            });

            return rowsAffected > 0;
        }


        public async Task<bool> UpdateJunctionSensorAsync(Model_Sensor updatedSensor)
        {
            updatedSensor.LastUpdated = DateTime.UtcNow;

            var sql = @"
        UPDATE JunctionSensors SET
            OriginalId = @OriginalId,
            JunctionId = @JunctionId,
            JunctionDeviceLinkId = @JunctionDeviceLinkId,
            JunctionCollectorLinkId = @JunctionCollectorLinkId,
            SensorOrder = @SensorOrder,
            MQTTServiceId = @MQTTServiceId,
            MQTTTopic = @MQTTTopic,
            MQTTQoS = @MQTTQoS,
            SensorType = @SensorType,
            IsMissing = @IsMissing,
            IsStale = @IsStale,
            IsSelected = @IsSelected,
            IsVisible = @IsVisible,
            ExternalId = @ExternalId,
            DeviceId = @DeviceId,
            ServiceId = @ServiceId,
            CollectorId = @CollectorId,
            DeviceName = @DeviceName,
            Name = @Name,
            ComponentName = @ComponentName,
            Category = @Category,
            Unit = @Unit,
            Value = @Value,
            SensorTag = @SensorTag,
            Formula = @Formula,
            LastUpdated = @LastUpdated,
            CustomAttribute1 = @CustomAttribute1,
            CustomAttribute2 = @CustomAttribute2,
            CustomAttribute3 = @CustomAttribute3,
            CustomAttribute4 = @CustomAttribute4,
            CustomAttribute5 = @CustomAttribute5,
            CustomAttribute6 = @CustomAttribute6,
            CustomAttribute7 = @CustomAttribute7,
            CustomAttribute8 = @CustomAttribute8,
            CustomAttribute9 = @CustomAttribute9,
            CustomAttribute10 = @CustomAttribute10
        WHERE Id = @Id;";

            var rowsAffected = await _db.ExecuteAsync(sql, updatedSensor);
            return rowsAffected > 0;
        }


        // Get junction sensors by junction and collector link ID
        public async Task<List<Model_Sensor>> GetJunctionSensorsByJunctionCollectorLinkIdAsync(int junctionId, int collectorLinkId)
        {
            const string sql = @"
        SELECT * FROM JunctionSensors 
        WHERE JunctionId = @JunctionId 
        AND JunctionCollectorLinkId = @CollectorLinkId";

            var sensors = await _db.QueryAsync<Model_Sensor>(sql, new
            {
                JunctionId = junctionId,
                CollectorLinkId = collectorLinkId
            });

            return sensors.ToList();
        }

        public async Task AddJunctionSensorTargetAsync(int junctionId, int sensorId, int deviceId, int? screenId)
        {
            const string sql = @"
        INSERT INTO JunctionSensorTargets (JunctionId, SensorId, DeviceId, ScreenId)
        VALUES (@JunctionId, @SensorId, @DeviceId, @ScreenId);";

            await _db.ExecuteAsync(sql, new
            {
                JunctionId = junctionId,
                SensorId = sensorId,
                DeviceId = deviceId,
                ScreenId = screenId
            });
        }


        public async Task RemoveJunctionSensorTargetAsync(int junctionId, int sensorId, int deviceId)
        {
            const string sql = @"
        DELETE FROM JunctionSensorTargets
        WHERE JunctionId = @JunctionId AND SensorId = @SensorId AND DeviceId = @DeviceId;";

            await _db.ExecuteAsync(sql, new
            {
                JunctionId = junctionId,
                SensorId = sensorId,
                DeviceId = deviceId
            });
        }

        // Remove all sensor targets for a specific device in a junction
        public async Task RemoveSensorTargetsByDeviceAsync(int junctionId, int deviceId)
        {
            const string sql = @"
        DELETE FROM JunctionSensorTargets
        WHERE JunctionId = @JunctionId AND DeviceId = @DeviceId;";

            var affectedRows = await _db.ExecuteAsync(sql, new
            {
                JunctionId = junctionId,
                DeviceId = deviceId
            });

            Console.WriteLine($"[SERVICE_DATABASE_MANAGER_SENSORS] Removed {affectedRows} sensor targets for device {deviceId} in junction {junctionId}");
        }



        public async Task<List<Model_JunctionSensorTarget>> GetSensorTargetsAsync(int junctionId, int sensorId)
        {
            try
            {
                const string sql = @"
            SELECT Id, JunctionId, SensorId, DeviceId, ScreenId, PositionIndex
            FROM JunctionSensorTargets
            WHERE JunctionId = @JunctionId AND SensorId = @SensorId;";

                return (await _db.QueryAsync<Model_JunctionSensorTarget>(sql, new
                {
                    JunctionId = junctionId,
                    SensorId = sensorId
                })).ToList();
            }
            catch (Exception ex)
            {
                // Log the error
                Console.Error.WriteLine($"Error in GetSensorTargetsAsync: {ex.Message}");
                // Return empty list instead of letting the exception propagate
                return new List<Model_JunctionSensorTarget>();
            }
        }

        public async Task<Dictionary<int, List<Model_JunctionSensorTarget>>> GetAllSensorTargetsForJunctionGroupedAsync(int junctionId)
        {
            try
            {
                const string sql = @"
            SELECT Id, JunctionId, SensorId, DeviceId, ScreenId, PositionIndex
            FROM JunctionSensorTargets
            WHERE JunctionId = @JunctionId
            ORDER BY SensorId, DeviceId;";

                using (var connection = new SqliteConnection(_db.ConnectionString))
                {
                    await connection.OpenAsync();
                    var results = await connection.QueryAsync<Model_JunctionSensorTarget>(sql, new { JunctionId = junctionId });

                    // Group the results by SensorId
                    return results
                        .GroupBy(t => t.SensorId)
                        .ToDictionary(
                            group => group.Key,
                            group => group.ToList()
                        );
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error in GetAllSensorTargetsForJunctionGroupedAsync: {ex.Message}");
                return new Dictionary<int, List<Model_JunctionSensorTarget>>();
            }
        }

        public async Task AddScreenToJunctionSensorTargetAsync(int junctionId, int sensorId, int deviceId, int screenId)
        {
            const string sql = @"
        INSERT INTO JunctionSensorTargets (JunctionId, SensorId, DeviceId, ScreenId)
        SELECT @JunctionId, @SensorId, @DeviceId, @ScreenId
        WHERE NOT EXISTS (
            SELECT 1 FROM JunctionSensorTargets
            WHERE JunctionId = @JunctionId AND SensorId = @SensorId AND DeviceId = @DeviceId AND ScreenId = @ScreenId
        );";
            await _db.ExecuteAsync(sql, new { JunctionId = junctionId, SensorId = sensorId, DeviceId = deviceId, ScreenId = screenId });
        }

        public async Task RemoveScreenFromJunctionSensorTargetAsync(int junctionId, int sensorId, int deviceId, int screenId)
        {
            const string sql = @"
        DELETE FROM JunctionSensorTargets
        WHERE JunctionId = @JunctionId AND SensorId = @SensorId AND DeviceId = @DeviceId AND ScreenId = @ScreenId;";

            await _db.ExecuteAsync(sql, new { JunctionId = junctionId, SensorId = sensorId, DeviceId = deviceId, ScreenId = screenId });
        }

        public async Task RemoveAllSensorTargetsAsync(int junctionId, int sensorId)
        {
            const string sql = @"
        DELETE FROM JunctionSensorTargets
        WHERE JunctionId = @JunctionId AND SensorId = @SensorId;";

            await _db.ExecuteAsync(sql, new { JunctionId = junctionId, SensorId = sensorId });
        }
    }
}
