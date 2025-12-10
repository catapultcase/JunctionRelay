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
using JunctionRelayServer.Interfaces;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_Devices
    {
        private readonly IDbConnection _db;
        private readonly Service_Database_Manager_Sensors _sensorsDbManager;
        private readonly Service_HostInfo _hostInfo;
        private readonly Service_Database_Manager_Device_I2CDevices _i2cDeviceDbManager;
        private readonly ISecretsService _secretsService;

        public Service_Database_Manager_Devices(IDbConnection dbConnection,
                                                Service_Database_Manager_Sensors sensorsDbManager,
                                                Service_HostInfo hostInfo,
                                                Service_Database_Manager_Device_I2CDevices i2cDeviceDbManager,
                                                ISecretsService secretsService)
        {
            _db = dbConnection;
            _sensorsDbManager = sensorsDbManager;
            _hostInfo = hostInfo;
            _i2cDeviceDbManager = i2cDeviceDbManager;
            _secretsService = secretsService;
        }

        public async Task<List<Model_Device>> GetAllDevicesAsync()
        {
            var devices = (await _db.QueryAsync<Model_Device>("SELECT * FROM Devices")).ToList();

            foreach (var device in devices)
            {
                var sensors = await _db.QueryAsync<Model_Sensor>(
                    "SELECT * FROM Sensors WHERE DeviceId = @DeviceId",
                    new { DeviceId = device.Id });

                device.Sensors = sensors.ToList();
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

            var sensors = await _db.QueryAsync<Model_Sensor>(
                "SELECT * FROM Sensors WHERE DeviceId = @DeviceId",
                new { DeviceId = id });
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
            newDevice.Status ??= "Active";
            newDevice.LastUpdated = DateTime.UtcNow;

            // If the device is marked as a Cloud Device, set its type explicitly
            if (newDevice.IsCloudDevice)
            {
                newDevice.Type = "Cloud Device";
            }
            else if (newDevice.Type != "Custom" && newDevice.Type != "Virtual Screen" && newDevice.Type != "VirtualDevice")
            {
                // Otherwise, determine type based on gateway info (only if not already set to Custom, Virtual Screen, or VirtualDevice)
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
            }
            // If Type is already "Custom", "Virtual Screen", or "VirtualDevice", we preserve it

            // Encrypt SSH secrets before storing
            if (!string.IsNullOrEmpty(newDevice.SshPassword))
            {
                newDevice.SshPassword = await _secretsService.EncryptSecretAsync(newDevice.SshPassword);
            }
            if (!string.IsNullOrEmpty(newDevice.SshPrivateKey))
            {
                newDevice.SshPrivateKey = await _secretsService.EncryptSecretAsync(newDevice.SshPrivateKey);
            }

            var sql = @"
INSERT INTO Devices (
    Name, Description, Type, Status, LastUpdated, IPAddress, PollRate, SendRate, IsGateway, GatewayId, IsJunctionRelayDevice,
    IsCloudDevice, CloudDeviceId, LastEncryptedSensorData, LastHealthReportAt,
    ConnMode, COMPort,
    DeviceModel, DeviceManufacturer, FirmwareVersion, HasCustomFirmware, IgnoreUpdates, MCU, WirelessConnectivity, Flash, PSRAM, UniqueIdentifier,

    HttpPort, WebSocketPort, MqttPort, Hostname,

    HeartbeatProtocol, HeartbeatTarget, HeartbeatExpectedValue, HeartbeatEnabled, HeartbeatIntervalMs, HeartbeatGracePeriodMs, HeartbeatMaxRetryAttempts,
    UseStreamAsHeartbeat, StreamHeartbeatThresholdMs,
    ConnectionStatusEnabled, ConnectionStatusIntervalMs, LastConnectionStatusCheck,
    LastPingAttempt, LastPinged, LastPingStatus, LastPingDurationMs, ConsecutivePingFailures,
    ConfigLastAppliedAt, SensorPayloadLastAckAt,

    SshUsername, SshPassword, SshPort, SshTimeoutMs, SshPrivateKey, UseSshKeyAuth, SshConnectionRetries, SshVerifyHostKey,

    HasOnboardScreen, HasOnboardLED, HasOnboardRGBLED, HasExternalNeopixels, HasExternalMatrix, HasExternalI2CDevices,
    HasButtons, HasBattery, SupportsWiFi, SupportsBLE, SupportsUSB, SupportsESPNow, SupportsHTTP, SupportsMQTT, SupportsWebSockets,
    HasSpeaker, HasMicroSD, SupportsEthernet, PushNotifications, SyncMode,

    IsVirtualDevice, LinkedCollectorId,
    VirtualDevice_Mode1_Enabled, VirtualDevice_Mode1_PollRate,
    VirtualDevice_Mode2_Enabled, VirtualDevice_Mode2_JunctionId, VirtualDevice_Mode2_SendRate,
    VirtualDevice_Mode3_Enabled, VirtualDevice_Mode3_LayoutConfig
)
VALUES (
    @Name, @Description, @Type, @Status, @LastUpdated, @IPAddress, @PollRate, @SendRate, @IsGateway, @GatewayId, @IsJunctionRelayDevice,
    @IsCloudDevice, @CloudDeviceId, @LastEncryptedSensorData, @LastHealthReportAt,
    @ConnMode, @COMPort,
    @DeviceModel, @DeviceManufacturer, @FirmwareVersion, @HasCustomFirmware, @IgnoreUpdates, @MCU, @WirelessConnectivity, @Flash, @PSRAM, @UniqueIdentifier,

    @HttpPort, @WebSocketPort, @MqttPort, @Hostname,

    @HeartbeatProtocol, @HeartbeatTarget, @HeartbeatExpectedValue, @HeartbeatEnabled, @HeartbeatIntervalMs, @HeartbeatGracePeriodMs, @HeartbeatMaxRetryAttempts,
    @UseStreamAsHeartbeat, @StreamHeartbeatThresholdMs,
    @ConnectionStatusEnabled, @ConnectionStatusIntervalMs, @LastConnectionStatusCheck,
    @LastPingAttempt, @LastPinged, @LastPingStatus, @LastPingDurationMs, @ConsecutivePingFailures,
    @ConfigLastAppliedAt, @SensorPayloadLastAckAt,

    @SshUsername, @SshPassword, @SshPort, @SshTimeoutMs, @SshPrivateKey, @UseSshKeyAuth, @SshConnectionRetries, @SshVerifyHostKey,

    @HasOnboardScreen, @HasOnboardLED, @HasOnboardRGBLED, @HasExternalNeopixels, @HasExternalMatrix, @HasExternalI2CDevices,
    @HasButtons, @HasBattery, @SupportsWiFi, @SupportsBLE, @SupportsUSB, @SupportsESPNow, @SupportsHTTP, @SupportsMQTT, @SupportsWebSockets,
    @HasSpeaker, @HasMicroSD, @SupportsEthernet, @PushNotifications, @SyncMode,

    @IsVirtualDevice, @LinkedCollectorId,
    @VirtualDevice_Mode1_Enabled, @VirtualDevice_Mode1_PollRate,
    @VirtualDevice_Mode2_Enabled, @VirtualDevice_Mode2_JunctionId, @VirtualDevice_Mode2_SendRate,
    @VirtualDevice_Mode3_Enabled, @VirtualDevice_Mode3_LayoutConfig
);
SELECT last_insert_rowid();";

            int newId = await _db.ExecuteScalarAsync<int>(sql, newDevice);
            newDevice.Id = newId;

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

            // Automatically create a virtual screen record for Virtual Screen devices
            if (newDevice.Type == "Virtual Screen")
            {
                var virtualScreen = new Model_Device_Screens
                {
                    DeviceId = newId,
                    ScreenKey = "virtual",
                    DisplayName = "Virtual Screen Display",
                    ScreenType = "virtual",
                    SupportsConfigPayloads = true,
                    SupportsSensorPayloads = true,
                    SupportsStopPayloads = true,
                    UseKeepAlive = false
                };
                await CreateDeviceScreenAsync(virtualScreen);
            }

            // Automatically set up Virtual Device
            if (newDevice.Type == "VirtualDevice")
            {
                var virtualDeviceScreen = new Model_Device_Screens
                {
                    DeviceId = newId,
                    ScreenKey = "virtual_device",
                    DisplayName = "Virtual Device Display",
                    ScreenType = "virtual_device",
                    SupportsConfigPayloads = true,
                    SupportsSensorPayloads = true,
                    SupportsStopPayloads = true,
                    UseKeepAlive = false
                };
                await CreateDeviceScreenAsync(virtualDeviceScreen);
            }

            return newDevice;
        }

        public async Task CreateDeviceScreenAsync(Model_Device_Screens screen)
        {
            const string sql = @"
        INSERT INTO DeviceScreens (
            DeviceId, ScreenKey, DisplayName, ScreenType, ScreenLayoutId,
            SupportsConfigPayloads, SupportsSensorPayloads, SupportsStopPayloads
        ) VALUES (
            @DeviceId, @ScreenKey, @DisplayName, @ScreenType, @ScreenLayoutId,
            @SupportsConfigPayloads, @SupportsSensorPayloads, @SupportsStopPayloads
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
                    FrameLayoutId = @FrameLayoutId,
                    SupportsConfigPayloads = @SupportsConfigPayloads,
                    SupportsSensorPayloads = @SupportsSensorPayloads,
                    SupportsStopPayloads = @SupportsStopPayloads
                WHERE Id = @Id";

            var rows = await _db.ExecuteAsync(sql, new
            {
                Id = screenId,
                DisplayName = updated.DisplayName,
                ScreenLayoutId = updated.ScreenLayoutId,
                FrameLayoutId = updated.FrameLayoutId,
                SupportsConfigPayloads = updated.SupportsConfigPayloads,
                SupportsSensorPayloads = updated.SupportsSensorPayloads,
                SupportsStopPayloads = updated.SupportsStopPayloads
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

        // NEW: Cloud device status update method
        public async Task<bool> UpdateCloudDeviceStatusAsync(Model_Device device)
        {
            const string sql = @"
        UPDATE Devices
        SET Status = @Status,
            IsCloudDevice = @IsCloudDevice,
            CloudDeviceId = @CloudDeviceId,
            LastPinged = @LastPinged,
            LastUpdated = @LastUpdated
        WHERE Id = @Id;";

            device.LastUpdated = DateTime.UtcNow;

            int affected = await _db.ExecuteAsync(sql, new
            {
                Status = device.Status,
                IsCloudDevice = device.IsCloudDevice,
                CloudDeviceId = device.CloudDeviceId,
                LastPinged = device.LastPinged,
                LastUpdated = device.LastUpdated,
                Id = device.Id
            });

            return affected > 0;
        }

        // NEW: Method to update device notification setting
        public async Task<bool> UpdateDeviceNotificationSettingAsync(int deviceId, bool enableNotifications)
        {
            const string sql = @"
        UPDATE Devices
        SET PushNotifications = @PushNotifications,
            LastUpdated = @LastUpdated
        WHERE Id = @Id;";

            int affected = await _db.ExecuteAsync(sql, new
            {
                PushNotifications = enableNotifications,                
                LastUpdated = DateTime.UtcNow,
                Id = deviceId
            });

            return affected > 0;
        }

        // NEW: Method to update device sync mode
        public async Task<bool> UpdateDeviceSyncModeAsync(int deviceId, string syncMode)
        {
            const string sql = @"
        UPDATE Devices
        SET SyncMode = @SyncMode,
            LastUpdated = @LastUpdated
        WHERE Id = @Id;";

            int affected = await _db.ExecuteAsync(sql, new
            {
                SyncMode = syncMode,
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

            // Encrypt SSH secrets before storing (only if they've changed)
            if (!string.IsNullOrEmpty(updatedDevice.SshPassword) && updatedDevice.SshPassword != existing.SshPassword)
            {
                updatedDevice.SshPassword = await _secretsService.EncryptSecretAsync(updatedDevice.SshPassword);
            }
            if (!string.IsNullOrEmpty(updatedDevice.SshPrivateKey) && updatedDevice.SshPrivateKey != existing.SshPrivateKey)
            {
                updatedDevice.SshPrivateKey = await _secretsService.EncryptSecretAsync(updatedDevice.SshPrivateKey);
            }

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
LastEncryptedSensorData = @LastEncryptedSensorData,
LastHealthReportAt = @LastHealthReportAt,
ConnMode = @ConnMode,
COMPort = @COMPort,
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

HttpPort = @HttpPort,
WebSocketPort = @WebSocketPort,
MqttPort = @MqttPort,
Hostname = @Hostname,

HeartbeatProtocol = @HeartbeatProtocol,
HeartbeatTarget = @HeartbeatTarget,
HeartbeatExpectedValue = @HeartbeatExpectedValue,
HeartbeatEnabled = @HeartbeatEnabled,
HeartbeatIntervalMs = @HeartbeatIntervalMs,
HeartbeatGracePeriodMs = @HeartbeatGracePeriodMs,
HeartbeatMaxRetryAttempts = @HeartbeatMaxRetryAttempts,
UseStreamAsHeartbeat = @UseStreamAsHeartbeat,
StreamHeartbeatThresholdMs = @StreamHeartbeatThresholdMs,
ConnectionStatusEnabled = @ConnectionStatusEnabled,
ConnectionStatusIntervalMs = @ConnectionStatusIntervalMs,
LastConnectionStatusCheck = @LastConnectionStatusCheck,
LastPingAttempt = @LastPingAttempt,
LastPinged = @LastPinged,
LastPingStatus = @LastPingStatus,
LastPingDurationMs = @LastPingDurationMs,
ConsecutivePingFailures = @ConsecutivePingFailures,
ConfigLastAppliedAt = @ConfigLastAppliedAt,
SensorPayloadLastAckAt = @SensorPayloadLastAckAt,

SshUsername = @SshUsername,
SshPassword = @SshPassword,
SshPort = @SshPort,
SshTimeoutMs = @SshTimeoutMs,
SshPrivateKey = @SshPrivateKey,
UseSshKeyAuth = @UseSshKeyAuth,
SshConnectionRetries = @SshConnectionRetries,
SshVerifyHostKey = @SshVerifyHostKey,

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
HasMicroSD = @HasMicroSD,
SupportsEthernet = @SupportsEthernet,
PushNotifications = @PushNotifications,
SyncMode = @SyncMode,

IsVirtualDevice = @IsVirtualDevice,
LinkedCollectorId = @LinkedCollectorId,
VirtualDevice_Mode1_Enabled = @VirtualDevice_Mode1_Enabled,
VirtualDevice_Mode1_PollRate = @VirtualDevice_Mode1_PollRate,
VirtualDevice_Mode2_Enabled = @VirtualDevice_Mode2_Enabled,
VirtualDevice_Mode2_JunctionId = @VirtualDevice_Mode2_JunctionId,
VirtualDevice_Mode2_SendRate = @VirtualDevice_Mode2_SendRate,
VirtualDevice_Mode3_Enabled = @VirtualDevice_Mode3_Enabled,
VirtualDevice_Mode3_LayoutConfig = @VirtualDevice_Mode3_LayoutConfig
WHERE Id = @Id;";

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
            SupportsSensorPayloads,
            SupportsStopPayloads
        ) VALUES (
            @DeviceId,
            @ScreenKey,
            @DisplayName,
            @ScreenType,
            @ScreenLayoutId,
            @SupportsConfigPayloads,
            @SupportsSensorPayloads,
            @SupportsStopPayloads
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