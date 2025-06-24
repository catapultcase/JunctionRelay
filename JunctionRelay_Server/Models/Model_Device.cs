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

namespace JunctionRelayServer.Models
{
    public class Model_Device
    {
        public int Id { get; set; }

        // Required properties
        public required string Name { get; set; }
        public required string Description { get; set; }
        public required string Type { get; set; }
        public required string Status { get; set; }
        public required string UniqueIdentifier { get; set; }

        // Device info
        public string? ConnMode { get; set; }
        public string? SelectedPort { get; set; }
        public string? DeviceModel { get; set; }
        public string? DeviceManufacturer { get; set; }
        public string? FirmwareVersion { get; set; }
        public bool HasCustomFirmware { get; set; } = false;
        public bool IgnoreUpdates { get; set; } = false;
        public string? MCU { get; set; }
        public string? WirelessConnectivity { get; set; }
        public string? Flash { get; set; }
        public string? PSRAM { get; set; }

        // Network info
        public bool IsConnected { get; set; }
        public string? IPAddress { get; set; }
        public bool HasMQTTConfig { get; set; }

        // Logical flags
        public bool IsGateway { get; set; }
        public int? GatewayId { get; set; }
        public bool IsJunctionRelayDevice { get; set; }

        // Cloud device support
        public bool IsCloudDevice { get; set; } = false;
        public int? CloudDeviceId { get; set; }

        // Timestamps with UTC specification (consistent with Model_Sensor)
        private DateTime _lastUpdated;
        public DateTime LastUpdated
        {
            get => _lastUpdated;
            set => _lastUpdated = DateTime.SpecifyKind(value, DateTimeKind.Utc);
        }

        // Protocols and relationships
        public List<Model_Protocol> SupportedProtocols { get; set; } = new();
        public List<Model_Sensor> Sensors { get; set; } = new();
        public List<Model_Device> Peers { get; set; } = new();

        // Poll and Send
        public int? PollRate { get; set; } = 5000;
        public int? SendRate { get; set; } = 5000;

        // Heartbeat (Ping) Configuration & Monitoring
        public string? HeartbeatProtocol { get; set; } = "HTTP";        // Protocol used for heartbeat: "HTTP", "MQTT", etc.
        public string? HeartbeatTarget { get; set; }                    // Target endpoint for ping: HTTP path or MQTT topic
        public string? HeartbeatExpectedValue { get; set; }             // Expected response value: e.g. "online"
        public bool HeartbeatEnabled { get; set; } = true;              // Whether heartbeat checks are enabled
        public int? HeartbeatIntervalMs { get; set; } = 60000;          // Interval between ping attempts (ms)
        public int? HeartbeatGracePeriodMs { get; set; } = 180000;      // Time before marking offline after missed pings (ms)
        public int? HeartbeatMaxRetryAttempts { get; set; } = 3;        // Max failed pings before declaring unreachable

        // Heartbeat DateTime properties with UTC specification
        private DateTime? _lastPingAttempt;
        public DateTime? LastPingAttempt
        {
            get => _lastPingAttempt;
            set => _lastPingAttempt = value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : value;
        }

        private DateTime? _lastPinged;
        public DateTime? LastPinged
        {
            get => _lastPinged;
            set => _lastPinged = value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : value;
        }

        public string? LastPingStatus { get; set; }                     // Result of last ping: "Online", "Timeout", etc.
        public int? LastPingDurationMs { get; set; }                    // Round-trip ping latency in ms
        public int? ConsecutivePingFailures { get; set; }               // Number of back-to-back failed pings

        private DateTime? _configLastAppliedAt;
        public DateTime? ConfigLastAppliedAt
        {
            get => _configLastAppliedAt;
            set => _configLastAppliedAt = value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : value;
        }

        private DateTime? _sensorPayloadLastAckAt;
        public DateTime? SensorPayloadLastAckAt
        {
            get => _sensorPayloadLastAckAt;
            set => _sensorPayloadLastAckAt = value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : value;
        }

        // Capabilities
        public bool HasOnboardScreen { get; set; }
        public bool HasOnboardLED { get; set; }
        public bool HasOnboardRGBLED { get; set; }
        public bool HasExternalNeopixels { get; set; }
        public bool HasExternalMatrix { get; set; }
        public bool HasExternalI2CDevices { get; set; }
        public bool HasButtons { get; set; }
        public bool HasBattery { get; set; }
        public bool SupportsWiFi { get; set; }
        public bool SupportsBLE { get; set; }
        public bool SupportsUSB { get; set; }
        public bool SupportsESPNow { get; set; }
        public bool SupportsHTTP { get; set; }
        public bool SupportsMQTT { get; set; }
        public bool SupportsWebSockets { get; set; }

        public bool HasSpeaker { get; set; }
        public bool HasMicroSD { get; set; }
        public List<Model_Device_Screens> Screens { get; set; } = new();
        public List<Model_Device_I2CDevice> I2cDevices { get; set; } = new();
    }
}