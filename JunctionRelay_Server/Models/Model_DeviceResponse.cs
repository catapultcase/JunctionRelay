namespace JunctionRelayServer.Models
{
    public class Model_DeviceResponse
    {
        public int Id { get; set; }

        // Required properties
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Type { get; set; } = "";
        public string Status { get; set; } = "";
        public string UniqueIdentifier { get; set; } = "";

        // Device info
        public string? ConnMode { get; set; }
        public string? COMPort { get; set; }
        public int? BaudRate { get; set; }
        public string? DeviceModel { get; set; }
        public string? DeviceManufacturer { get; set; }
        public string? FirmwareVersion { get; set; }
        public bool HasCustomFirmware { get; set; }
        public bool IgnoreUpdates { get; set; }
        public string? MCU { get; set; }
        public string? WirelessConnectivity { get; set; }
        public string? Flash { get; set; }
        public string? PSRAM { get; set; }

        // Network info
        public bool IsConnected { get; set; }
        public string? IPAddress { get; set; }
        public bool HasMQTTConfig { get; set; }

        // Network service ports
        public int? HttpPort { get; set; }
        public int? WebSocketPort { get; set; }
        public int? MqttPort { get; set; }
        public string? Hostname { get; set; }

        // Logical flags
        public bool IsGateway { get; set; }
        public int? GatewayId { get; set; }
        public bool IsJunctionRelayDevice { get; set; }

        // Cloud device support
        public bool IsCloudDevice { get; set; }
        public int? CloudDeviceId { get; set; }

        // Timestamps
        public DateTime? LastHealthReportAt { get; set; }
        public DateTime? CreatedAt { get; set; }
        public DateTime? LastHealthAlertSent { get; set; }
        public DateTime? LastHealthReminderSent { get; set; }
        public DateTime LastUpdated { get; set; }

        // Push Notification Config
        public bool PushNotifications { get; set; }
        public string? SyncMode { get; set; }

        // Protocols and relationships
        public List<Model_Sensor> Sensors { get; set; } = new();
        public List<Model_Device> Peers { get; set; } = new();

        // Poll and Send
        public int? PollRate { get; set; }
        public int? SendRate { get; set; }

        // SSH Configuration — secrets stripped, booleans added
        public string? SshUsername { get; set; }
        public bool HasSshPassword { get; set; }
        public bool ExternalSshPassword { get; set; }
        public int? SshPort { get; set; }
        public int? SshTimeoutMs { get; set; }
        public bool HasSshPrivateKey { get; set; }
        public bool ExternalSshPrivateKey { get; set; }
        public bool UseSshKeyAuth { get; set; }
        public int? SshConnectionRetries { get; set; }
        public bool SshVerifyHostKey { get; set; }

        // Heartbeat configuration
        public string? HeartbeatProtocol { get; set; }
        public string? HeartbeatTarget { get; set; }
        public string? HeartbeatExpectedValue { get; set; }
        public bool HeartbeatEnabled { get; set; }
        public int? HeartbeatIntervalMs { get; set; }
        public int? HeartbeatGracePeriodMs { get; set; }
        public int? HeartbeatMaxRetryAttempts { get; set; }

        // Stream heartbeat configuration
        public bool UseStreamAsHeartbeat { get; set; }
        public int? StreamHeartbeatThresholdMs { get; set; }

        // Connection Status Configuration
        public bool ConnectionStatusEnabled { get; set; }
        public int? ConnectionStatusIntervalMs { get; set; }
        public DateTime? LastConnectionStatusCheck { get; set; }
        public DateTime? LastPingAttempt { get; set; }
        public DateTime? LastPinged { get; set; }
        public string? LastPingStatus { get; set; }
        public int? LastPingDurationMs { get; set; }
        public int? ConsecutivePingFailures { get; set; }
        public DateTime? ConfigLastAppliedAt { get; set; }
        public DateTime? SensorPayloadLastAckAt { get; set; }

        // Capabilities
        public bool HasOnboardScreen { get; set; }
        public bool HasOnboardLED { get; set; }
        public bool HasOnboardRGBLED { get; set; }
        public bool HasExternalNeopixels { get; set; }
        public bool HasExternalMatrix { get; set; }
        public bool HasExternalI2CDevices { get; set; }
        public bool HasButtons { get; set; }
        public bool HasBattery { get; set; }
        public bool SupportsEthernet { get; set; }
        public bool SupportsWiFi { get; set; }
        public bool SupportsBLE { get; set; }
        public bool SupportsUSB { get; set; }
        public bool SupportsESPNow { get; set; }
        public bool SupportsHTTP { get; set; }
        public bool SupportsMQTT { get; set; }
        public bool SupportsWebSockets { get; set; }
        public bool HasSpeaker { get; set; }
        public bool HasMicroSD { get; set; }

        // XSD Device Configuration
        public bool IsXSD { get; set; }
        public int? LinkedCollectorId { get; set; }

        public List<Model_Device_Screens> Screens { get; set; } = new();
        public List<Model_Device_I2CDevice> I2cDevices { get; set; } = new();
    }
}
