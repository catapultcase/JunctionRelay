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
    public class Service_Database_Manager_Devices
    {
        private readonly IDbConnection _db;
        private readonly Service_Database_Manager_Sensors _sensorsDbManager;
        private readonly Service_HostInfo _hostInfo;
        private readonly Service_Database_Manager_Device_I2CDevices _i2cDeviceDbManager;

        public Service_Database_Manager_Devices(IDbConnection dbConnection,
                                                Service_Database_Manager_Sensors sensorsDbManager,
                                                Service_HostInfo hostInfo,
                                                Service_Database_Manager_Device_I2CDevices i2cDeviceDbManager) // Injected here
        {
            _db = dbConnection;
            _sensorsDbManager = sensorsDbManager;
            _hostInfo = hostInfo;
            _i2cDeviceDbManager = i2cDeviceDbManager; // Set the injected value
        }

        public async Task<List<Model_Device>> GetAllDevicesAsync()
        {
            var devices = (await _db.QueryAsync<Model_Device>("SELECT * FROM Devices")).ToList();

            foreach (var device in devices)
            {
                var protocols = await _db.QueryAsync<Model_Protocol>(
                    "SELECT p.Id, p.Name, dp.Selected FROM Protocols p JOIN DeviceProtocols dp ON p.Id = dp.ProtocolId WHERE dp.DeviceId = @DeviceId",
                    new { DeviceId = device.Id });


                var sensors = await _db.QueryAsync<Model_Sensor>(
                    "SELECT * FROM Sensors WHERE DeviceId = @DeviceId",
                    new { DeviceId = device.Id });

                // Removed collectors related query
                device.SupportedProtocols = protocols.ToList();
                device.Sensors = sensors.ToList();
                // Removed device.Collectors
            }

            return devices;
        }

        public async Task<Model_Device?> GetDeviceByIdAsync(int id)
        {
            var device = await _db.QuerySingleOrDefaultAsync<Model_Device>(
                "SELECT * FROM Devices WHERE Id = @Id",
                new { Id = id });

            if (device == null)
                return null;

            var protocols = await _db.QueryAsync<Model_Protocol>(
                @"SELECT p.Id, p.Name, dp.Selected
          FROM Protocols p
          JOIN DeviceProtocols dp ON p.Id = dp.ProtocolId
          WHERE dp.DeviceId = @DeviceId",
                new { DeviceId = id });

            var sensors = await _db.QueryAsync<Model_Sensor>(
                "SELECT * FROM Sensors WHERE DeviceId = @DeviceId",
                new { DeviceId = id });

            device.SupportedProtocols = protocols.ToList();
            device.Sensors = sensors.ToList();
            return device;
        }


        // Fetch devices associated with a specific junction ID
        public async Task<List<Model_Device>> GetDevicesByJunctionIdAsync(int junctionId)
        {
            var sql = @"
        SELECT d.*
        FROM Devices d
        INNER JOIN JunctionDeviceLinks jdl ON d.Id = jdl.DeviceId
        WHERE jdl.JunctionId = @JunctionId;
    ";

            var devices = await _db.QueryAsync<Model_Device>(sql, new { JunctionId = junctionId });
            return devices.ToList();
        }


        public async Task<Model_Device> AddDeviceAsync(Model_Device newDevice)
        {
            newDevice.Status ??= "Offline";
            newDevice.LastUpdated = DateTime.UtcNow;

            // Set device type based on IsGateway flag and GatewayId
            if (newDevice.IsGateway)
            {
                newDevice.Type = "Gateway";
            }
            else if (newDevice.GatewayId.HasValue && newDevice.GatewayId > 0)
            {
                newDevice.Type = "Child";
            }
            else
            {
                newDevice.Type = "Standalone";
            }

            var sql = @"
        INSERT INTO Devices (
            Name, Description, Type, Status, LastUpdated, IPAddress, PollRate, SendRate, IsGateway, GatewayId, IsJunctionRelayDevice,
            IsCloudDevice, CloudDeviceId,
            ConnMode, SelectedPort,
            DeviceModel, DeviceManufacturer, FirmwareVersion, HasCustomFirmware, IgnoreUpdates, MCU, WirelessConnectivity, Flash, PSRAM, UniqueIdentifier,

            HeartbeatProtocol, HeartbeatTarget, HeartbeatExpectedValue, HeartbeatEnabled, HeartbeatIntervalMs, HeartbeatGracePeriodMs, HeartbeatMaxRetryAttempts,
            LastPingAttempt, LastPinged, LastPingStatus, LastPingDurationMs, ConsecutivePingFailures,
            ConfigLastAppliedAt, SensorPayloadLastAckAt,

            HasOnboardScreen, HasOnboardLED, HasOnboardRGBLED, HasExternalNeopixels, HasExternalMatrix, HasExternalI2CDevices,
            HasButtons, HasBattery, SupportsWiFi, SupportsBLE, SupportsUSB, SupportsESPNow, SupportsHTTP, SupportsMQTT, SupportsWebSockets,
            HasSpeaker, HasMicroSD
        )
        VALUES (
            @Name, @Description, @Type, @Status, @LastUpdated, @IPAddress, @PollRate, @SendRate, @IsGateway, @GatewayId, @IsJunctionRelayDevice,
            @IsCloudDevice, @CloudDeviceId,
            @ConnMode, @SelectedPort,
            @DeviceModel, @DeviceManufacturer, @FirmwareVersion, @HasCustomFirmware, @IgnoreUpdates, @MCU, @WirelessConnectivity, @Flash, @PSRAM, @UniqueIdentifier,

            @HeartbeatProtocol, @HeartbeatTarget, @HeartbeatExpectedValue, @HeartbeatEnabled, @HeartbeatIntervalMs, @HeartbeatGracePeriodMs, @HeartbeatMaxRetryAttempts,
            @LastPingAttempt, @LastPinged, @LastPingStatus, @LastPingDurationMs, @ConsecutivePingFailures,
            @ConfigLastAppliedAt, @SensorPayloadLastAckAt,

            @HasOnboardScreen, @HasOnboardLED, @HasOnboardRGBLED, @HasExternalNeopixels, @HasExternalMatrix, @HasExternalI2CDevices,
            @HasButtons, @HasBattery, @SupportsWiFi, @SupportsBLE, @SupportsUSB, @SupportsESPNow, @SupportsHTTP, @SupportsMQTT, @SupportsWebSockets,
            @HasSpeaker, @HasMicroSD
        );
        SELECT last_insert_rowid();";

            int newId = await _db.ExecuteScalarAsync<int>(sql, newDevice);
            newDevice.Id = newId;

            // Handle protocols
            if (newDevice.SupportedProtocols != null)
            {
                foreach (var protocol in newDevice.SupportedProtocols)
                {
                    var protocolId = await _db.ExecuteScalarAsync<int>(
                        "SELECT Id FROM Protocols WHERE Name = @ProtocolName",
                        new { ProtocolName = protocol.Name });

                    await _db.ExecuteAsync(
                        "INSERT INTO DeviceProtocols (DeviceId, ProtocolId, Selected) VALUES (@DeviceId, @ProtocolId, @Selected)",
                        new { DeviceId = newId, ProtocolId = protocolId, Selected = protocol.Selected });
                }
            }

            // If no protocols were supplied, infer from capabilities
            if (newDevice.SupportedProtocols == null || newDevice.SupportedProtocols.Count == 0)
            {
                var allProtocols = (await _db.QueryAsync<Model_Protocol>("SELECT * FROM Protocols")).ToList();

                var inferred = new List<(string Name, bool IsSupported)>
        {
            ("USB", newDevice.SupportsUSB),
            ("HTTP", newDevice.SupportsHTTP),
            ("ESP-NOW", newDevice.SupportsESPNow),
        };

                foreach (var (name, supported) in inferred)
                {
                    if (!supported) continue;

                    var protocol = allProtocols.FirstOrDefault(p => p.Name == name);
                    if (protocol != null)
                    {
                        // Optional: set default selected protocol
                        bool isDefault = name == "USB";

                        await _db.ExecuteAsync(
                            "INSERT INTO DeviceProtocols (DeviceId, ProtocolId, Selected) VALUES (@DeviceId, @ProtocolId, @Selected)",
                            new { DeviceId = newId, ProtocolId = protocol.Id, Selected = isDefault });
                    }
                }
            }

            // Add I2C devices if provided
            if (newDevice.I2cDevices != null && newDevice.I2cDevices.Count > 0)
            {
                foreach (var i2cDevice in newDevice.I2cDevices)
                {
                    i2cDevice.DeviceId = newId;  // Link I2C device to the main device

                    // Add I2C device to the database
                    var addedI2CDevice = await _i2cDeviceDbManager.AddI2CDeviceAsync(i2cDevice);

                    // Add endpoints for the I2C device if provided
                    if (i2cDevice.Endpoints != null && i2cDevice.Endpoints.Count > 0)
                    {
                        foreach (var endpoint in i2cDevice.Endpoints)
                        {
                            endpoint.I2CDeviceId = addedI2CDevice.Id;  // Link endpoint to the newly added I2C device
                            await _i2cDeviceDbManager.AddI2CEndpointAsync(endpoint);  // Add the endpoint
                        }
                    }
                }
            }

            // Add device screens if provided
            if (newDevice.Screens != null && newDevice.Screens.Count > 0)
            {
                foreach (var screen in newDevice.Screens)
                {
                    screen.DeviceId = newId;  // Link screen to the main device
                    await CreateDeviceScreenAsync(screen);  // Create the screen entry in the database
                }
            }

            return newDevice;
        }

        public async Task CreateDeviceScreenAsync(Model_Device_Screens screen)
        {
            const string sql = @"
        INSERT INTO DeviceScreens (
            DeviceId, ScreenKey, DisplayName, ScreenType, ScreenLayoutId,
            SupportsConfigPayloads, SupportsSensorPayloads
        ) VALUES (
            @DeviceId, @ScreenKey, @DisplayName, @ScreenType, @ScreenLayoutId,
            @SupportsConfigPayloads, @SupportsSensorPayloads
        );";

            await _db.ExecuteAsync(sql, screen);
        }

        public async Task<List<Model_Device_Screens>> GetDeviceScreensAsync(int deviceId)
        {
            var sql = "SELECT * FROM DeviceScreens WHERE DeviceId = @DeviceId";
            var screens = await _db.QueryAsync<Model_Device_Screens>(sql, new { DeviceId = deviceId });
            return screens.ToList();
        }

        public async Task<Model_Device_Screens?> GetDeviceScreenByIdAsync(int screenId)
        {
            const string sql = "SELECT * FROM DeviceScreens WHERE Id = @Id";
            return await _db.QuerySingleOrDefaultAsync<Model_Device_Screens>(sql, new { Id = screenId });
        }


        public async Task<bool> UpdateDeviceScreenAsync(int screenId, Model_Device_Screens updated)
        {
            var sql = @"
        UPDATE DeviceScreens SET
            DisplayName = @DisplayName,
            ScreenLayoutId = @ScreenLayoutId,
            SupportsConfigPayloads = @SupportsConfigPayloads,
            SupportsSensorPayloads = @SupportsSensorPayloads
        WHERE Id = @Id";

            var rows = await _db.ExecuteAsync(sql, new
            {
                Id = screenId,
                DisplayName = updated.DisplayName,
                ScreenLayoutId = updated.ScreenLayoutId,
                SupportsConfigPayloads = updated.SupportsConfigPayloads,
                SupportsSensorPayloads = updated.SupportsSensorPayloads
            });

            return rows > 0;
        }


        public async Task<bool> SetFirmwareVersionAsync(int deviceId, string newVersion)
        {
            const string sql = @"
        UPDATE Devices
        SET FirmwareVersion = @FirmwareVersion,
            LastUpdated = @LastUpdated
        WHERE Id = @Id;";

            int affected = await _db.ExecuteAsync(sql, new
            {
                FirmwareVersion = newVersion,
                LastUpdated = DateTime.UtcNow,
                Id = deviceId
            });

            return affected > 0;
        }

        // NEW: Method to set custom firmware flag
        public async Task<bool> SetCustomFirmwareAsync(int deviceId, bool hasCustomFirmware)
        {
            const string sql = @"
        UPDATE Devices
        SET HasCustomFirmware = @HasCustomFirmware,
            LastUpdated = @LastUpdated
        WHERE Id = @Id;";

            int affected = await _db.ExecuteAsync(sql, new
            {
                HasCustomFirmware = hasCustomFirmware,
                LastUpdated = DateTime.UtcNow,
                Id = deviceId
            });

            return affected > 0;
        }

        public async Task<bool> UpdateDeviceAsync(int id, Model_Device updatedDevice)
        {
            var existing = await _db.QuerySingleOrDefaultAsync<Model_Device>("SELECT * FROM Devices WHERE Id = @Id", new { Id = id });
            if (existing == null) return false;

            updatedDevice.LastUpdated = DateTime.UtcNow;
            updatedDevice.Id = id;

            // SQL update statement for the main device attributes
            var sql = @"
                UPDATE Devices SET
                Name = @Name,
                Description = @Description,
                Type = @Type,
                Status = @Status,
                LastUpdated = @LastUpdated,
                IPAddress = @IPAddress,
                PollRate = @PollRate,
                SendRate = @SendRate,
                IsGateway = @IsGateway,
                GatewayId = @GatewayId,
                IsJunctionRelayDevice = @IsJunctionRelayDevice,
                IsCloudDevice = @IsCloudDevice,
                CloudDeviceId = @CloudDeviceId,
                ConnMode = @ConnMode,
                SelectedPort = @SelectedPort,
                DeviceModel = @DeviceModel,
                DeviceManufacturer = @DeviceManufacturer,
                FirmwareVersion = @FirmwareVersion,
                HasCustomFirmware = @HasCustomFirmware,
                IgnoreUpdates = @IgnoreUpdates,
                MCU = @MCU,
                WirelessConnectivity = @WirelessConnectivity,
                Flash = @Flash,
                PSRAM = @PSRAM,
                UniqueIdentifier = @UniqueIdentifier,

                HeartbeatProtocol = @HeartbeatProtocol,
                HeartbeatTarget = @HeartbeatTarget,
                HeartbeatExpectedValue = @HeartbeatExpectedValue,
                HeartbeatEnabled = @HeartbeatEnabled,
                HeartbeatIntervalMs = @HeartbeatIntervalMs,
                HeartbeatGracePeriodMs = @HeartbeatGracePeriodMs,
                HeartbeatMaxRetryAttempts = @HeartbeatMaxRetryAttempts,
                LastPingAttempt = @LastPingAttempt,
                LastPinged = @LastPinged,
                LastPingStatus = @LastPingStatus,
                LastPingDurationMs = @LastPingDurationMs,
                ConsecutivePingFailures = @ConsecutivePingFailures,
                ConfigLastAppliedAt = @ConfigLastAppliedAt,
                SensorPayloadLastAckAt = @SensorPayloadLastAckAt,

                HasOnboardScreen = @HasOnboardScreen,
                HasOnboardLED = @HasOnboardLED,
                HasOnboardRGBLED = @HasOnboardRGBLED,
                HasExternalNeopixels = @HasExternalNeopixels,
                HasExternalMatrix = @HasExternalMatrix,
                HasExternalI2CDevices = @HasExternalI2CDevices,
                HasButtons = @HasButtons,
                HasBattery = @HasBattery,
                SupportsWiFi = @SupportsWiFi,
                SupportsBLE = @SupportsBLE,
                SupportsUSB = @SupportsUSB,
                SupportsESPNow = @SupportsESPNow,
                SupportsHTTP = @SupportsHTTP,
                SupportsMQTT = @SupportsMQTT,
                SupportsWebSockets = @SupportsWebSockets,
                HasSpeaker = @HasSpeaker,
                HasMicroSD = @HasMicroSD
                WHERE Id = @Id;";


            // Update Supported Protocols if provided
            if (updatedDevice.SupportedProtocols != null)
            {
                foreach (var protocol in updatedDevice.SupportedProtocols)
                {
                    var protocolId = await _db.ExecuteScalarAsync<int>(
                        "SELECT Id FROM Protocols WHERE Name = @ProtocolName",
                        new { ProtocolName = protocol.Name });

                    await _db.ExecuteAsync(
                        "UPDATE DeviceProtocols SET Selected = @Selected WHERE DeviceId = @DeviceId AND ProtocolId = @ProtocolId",
                        new { Selected = protocol.Selected, DeviceId = id, ProtocolId = protocolId });
                }
            }

            // Only update Screens if they are provided (optional)
            if (updatedDevice.Screens != null)
            {
                foreach (var screen in updatedDevice.Screens)
                {
                    // Update screens if necessary
                    var screenSql = @"
                UPDATE Screens
                SET DisplayName = @DisplayName, ScreenLayoutId = @ScreenLayoutId
                WHERE DeviceId = @DeviceId AND Id = @Id;";
                    await _db.ExecuteAsync(screenSql, new { screen.DisplayName, screen.ScreenLayoutId, DeviceId = id, screen.Id });
                }
            }

            // Only update I2C devices if they are provided (optional)
            if (updatedDevice.I2cDevices != null)
            {
                foreach (var i2cDevice in updatedDevice.I2cDevices)
                {
                    // Update I2C device details if necessary
                    var i2cSql = @"
                UPDATE I2CDevices
                SET DeviceType = @DeviceType, CommunicationProtocol = @CommunicationProtocol, IsEnabled = @IsEnabled
                WHERE DeviceId = @DeviceId AND Id = @Id;";
                    await _db.ExecuteAsync(i2cSql, new { i2cDevice.DeviceType, i2cDevice.CommunicationProtocol, i2cDevice.IsEnabled, DeviceId = id, i2cDevice.Id });
                }
            }

            // Execute the main device update
            await _db.ExecuteAsync(sql, updatedDevice);

            return true;
        }

        public async Task<bool> DeleteDeviceAsync(int id)
        {
            var device = await _db.QuerySingleOrDefaultAsync<Model_Device>("SELECT * FROM Devices WHERE Id = @Id", new { Id = id });
            if (device == null) return false;

            // First, get all I2CDeviceIds associated with this device
            var i2cDeviceIds = await _db.QueryAsync<int>("SELECT Id FROM DeviceI2CDevices WHERE DeviceId = @Id", new { Id = id });

            // Delete related DeviceI2CDeviceEndpoints by matching I2CDeviceIds
            await _db.ExecuteAsync("DELETE FROM DeviceI2CDeviceEndpoints WHERE I2CDeviceId IN @I2CDeviceIds", new { I2CDeviceIds = i2cDeviceIds });

            // Delete other related tables
            await _db.ExecuteAsync("DELETE FROM JunctionSensorTargets WHERE DeviceId = @Id", new { Id = id });
            await _db.ExecuteAsync("DELETE FROM JunctionDeviceLinks WHERE DeviceId = @Id", new { Id = id });
            await _db.ExecuteAsync("DELETE FROM JunctionSensors WHERE DeviceId = @Id", new { Id = id });
            await _db.ExecuteAsync("DELETE FROM DeviceProtocols WHERE DeviceId = @Id", new { Id = id });
            await _db.ExecuteAsync("DELETE FROM DeviceI2CDevices WHERE DeviceId = @Id", new { Id = id });
            await _db.ExecuteAsync("DELETE FROM DeviceScreens WHERE DeviceId = @Id", new { Id = id });
            await _db.ExecuteAsync("DELETE FROM Sensors WHERE DeviceId = @Id", new { Id = id });

            // Finally, delete the device itself
            await _db.ExecuteAsync("DELETE FROM Devices WHERE Id = @Id", new { Id = id });

            return true;
        }

        // Creates a new DeviceScreen row and returns the inserted object (with its new Id)
        public async Task<Model_Device_Screens> AddDeviceScreenAsync(Model_Device_Screens newScreen)
        {
            const string sql = @"
        INSERT INTO DeviceScreens (
            DeviceId,
            ScreenKey,
            DisplayName,
            ScreenType,
            ScreenLayoutId,
            SupportsConfigPayloads,
            SupportsSensorPayloads
        ) VALUES (
            @DeviceId,
            @ScreenKey,
            @DisplayName,
            @ScreenType,
            @ScreenLayoutId,
            @SupportsConfigPayloads,
            @SupportsSensorPayloads
        );
        SELECT last_insert_rowid();
    ";

            // Execute the INSERT and fetch the new auto‐generated Id
            int id = await _db.ExecuteScalarAsync<int>(sql, newScreen);
            newScreen.Id = id;
            return newScreen;
        }

        // Deletes a DeviceScreen by its Id and returns true if a row was removed
        public async Task<bool> DeleteDeviceScreenAsync(int screenId)
        {
            const string sql = "DELETE FROM DeviceScreens WHERE Id = @Id";
            int rows = await _db.ExecuteAsync(sql, new { Id = screenId });
            return rows > 0;
        }
    }
}