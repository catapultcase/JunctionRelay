using JunctionRelayServer.Models;

namespace JunctionRelayServer.Extensions
{
    public static class DeviceExtensions
    {
        public static Model_DeviceResponse ToResponse(this Model_Device model)
        {
            return new Model_DeviceResponse
            {
                Id = model.Id,
                Name = model.Name,
                Description = model.Description,
                Type = model.Type,
                Status = model.Status,
                UniqueIdentifier = model.UniqueIdentifier,
                ConnMode = model.ConnMode,
                COMPort = model.COMPort,
                BaudRate = model.BaudRate,
                DeviceModel = model.DeviceModel,
                DeviceManufacturer = model.DeviceManufacturer,
                FirmwareVersion = model.FirmwareVersion,
                HasCustomFirmware = model.HasCustomFirmware,
                IgnoreUpdates = model.IgnoreUpdates,
                MCU = model.MCU,
                WirelessConnectivity = model.WirelessConnectivity,
                Flash = model.Flash,
                PSRAM = model.PSRAM,
                IsConnected = model.IsConnected,
                IPAddress = model.IPAddress,
                HasMQTTConfig = model.HasMQTTConfig,
                HttpPort = model.HttpPort,
                WebSocketPort = model.WebSocketPort,
                MqttPort = model.MqttPort,
                Hostname = model.Hostname,
                IsGateway = model.IsGateway,
                GatewayId = model.GatewayId,
                IsJunctionRelayDevice = model.IsJunctionRelayDevice,
                IsCloudDevice = model.IsCloudDevice,
                CloudDeviceId = model.CloudDeviceId,
                LastHealthReportAt = model.LastHealthReportAt,
                CreatedAt = model.CreatedAt,
                LastHealthAlertSent = model.LastHealthAlertSent,
                LastHealthReminderSent = model.LastHealthReminderSent,
                LastUpdated = model.LastUpdated,
                PushNotifications = model.PushNotifications,
                SyncMode = model.SyncMode,
                Sensors = model.Sensors,
                Peers = model.Peers,
                PollRate = model.PollRate,
                SendRate = model.SendRate,

                // SSH — strip secrets, add boolean flags
                SshUsername = model.SshUsername,
                HasSshPassword = !string.IsNullOrEmpty(model.SshPassword),
                ExternalSshPassword = model.ExternalSshPassword,
                SshPort = model.SshPort,
                SshTimeoutMs = model.SshTimeoutMs,
                HasSshPrivateKey = !string.IsNullOrEmpty(model.SshPrivateKey),
                ExternalSshPrivateKey = model.ExternalSshPrivateKey,
                UseSshKeyAuth = model.UseSshKeyAuth,
                SshConnectionRetries = model.SshConnectionRetries,
                SshVerifyHostKey = model.SshVerifyHostKey,

                // Heartbeat
                HeartbeatProtocol = model.HeartbeatProtocol,
                HeartbeatTarget = model.HeartbeatTarget,
                HeartbeatExpectedValue = model.HeartbeatExpectedValue,
                HeartbeatEnabled = model.HeartbeatEnabled,
                HeartbeatIntervalMs = model.HeartbeatIntervalMs,
                HeartbeatGracePeriodMs = model.HeartbeatGracePeriodMs,
                HeartbeatMaxRetryAttempts = model.HeartbeatMaxRetryAttempts,
                UseStreamAsHeartbeat = model.UseStreamAsHeartbeat,
                StreamHeartbeatThresholdMs = model.StreamHeartbeatThresholdMs,

                // Connection status
                ConnectionStatusEnabled = model.ConnectionStatusEnabled,
                ConnectionStatusIntervalMs = model.ConnectionStatusIntervalMs,
                LastConnectionStatusCheck = model.LastConnectionStatusCheck,
                LastPingAttempt = model.LastPingAttempt,
                LastPinged = model.LastPinged,
                LastPingStatus = model.LastPingStatus,
                LastPingDurationMs = model.LastPingDurationMs,
                ConsecutivePingFailures = model.ConsecutivePingFailures,
                ConfigLastAppliedAt = model.ConfigLastAppliedAt,
                SensorPayloadLastAckAt = model.SensorPayloadLastAckAt,

                // Capabilities
                HasOnboardScreen = model.HasOnboardScreen,
                HasOnboardLED = model.HasOnboardLED,
                HasOnboardRGBLED = model.HasOnboardRGBLED,
                HasExternalNeopixels = model.HasExternalNeopixels,
                HasExternalMatrix = model.HasExternalMatrix,
                HasExternalI2CDevices = model.HasExternalI2CDevices,
                HasButtons = model.HasButtons,
                HasBattery = model.HasBattery,
                SupportsEthernet = model.SupportsEthernet,
                SupportsWiFi = model.SupportsWiFi,
                SupportsBLE = model.SupportsBLE,
                SupportsUSB = model.SupportsUSB,
                SupportsESPNow = model.SupportsESPNow,
                SupportsHTTP = model.SupportsHTTP,
                SupportsMQTT = model.SupportsMQTT,
                SupportsWebSockets = model.SupportsWebSockets,
                HasSpeaker = model.HasSpeaker,
                HasMicroSD = model.HasMicroSD,

                // XSD
                IsXSD = model.IsXSD,
                LinkedCollectorId = model.LinkedCollectorId,
                Screens = model.Screens,
                I2cDevices = model.I2cDevices,
            };
        }

        public static IEnumerable<Model_DeviceResponse> ToResponseList(this IEnumerable<Model_Device> models)
        {
            return models.Select(m => m.ToResponse());
        }
    }
}
