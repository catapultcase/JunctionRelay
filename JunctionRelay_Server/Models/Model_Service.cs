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

namespace JunctionRelayServer.Models
{
    public class Model_Service
    {
        public int Id { get; set; }

        // Required properties
        public required string Name { get; set; }
        public required string Description { get; set; }
        public required string Type { get; set; }
        public required string Status { get; set; }
        public required string UniqueIdentifier { get; set; }

        // Service info
        public string? SelectedPort { get; set; }
        public string? ServiceModel { get; set; }
        public string? ServiceManufacturer { get; set; }
        public string? FirmwareVersion { get; set; }
        public string? MCU { get; set; }
        public string? WirelessConnectivity { get; set; }

        // Network info
        public string? IPAddress { get; set; }

        // Logical flags
        public bool IsGateway { get; set; }
        public int? GatewayId { get; set; }
        public bool IsJunctionRelayService { get; set; }

        // Timestamps
        public DateTime LastUpdated { get; set; }

        // Protocols and relationships
        // public List<Model_Collector> Collectors { get; set; } = new();  // Updated to reflect that devices have multiple collectors
        public List<Model_Protocol> SupportedProtocols { get; set; } = new();

        // Sensors can now be linked to either devices or collectors
        public List<Model_Sensor> Sensors { get; set; } = new();
        public List<Model_Device> Peers { get; set; } = new();

        // Junction device links (NEW)
        // public List<Model_JunctionDeviceLink> JunctionLinks { get; set; } = new();

        // Poll and Send
        // public string? AccessToken { get; set; }
        public int? PollRate { get; set; } = 5000;
        public int? SendRate { get; set; } = 5000;
        public DateTime? LastPolled { get; set; }

        // HomeAssistant Properties
        public string? HomeAssistantAddress { get; set; }
        public string? HomeAssistantAPIKey { get; set; }
        public string? HomeAssistantUsername { get; set; }
        public string? HomeAssistantPassword { get; set; }

        // MQTT Properties
        public string? MQTTBrokerAddress { get; set; }
        public string? MQTTBrokerPort { get; set; }
        public string? MQTTUsername { get; set; }
        public string? MQTTPassword { get; set; }

        // Summary
        // public int SensorCount => Sensors.Count;

    }
}
