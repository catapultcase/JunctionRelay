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

using System;
using System.Collections.Generic;
using System.Linq;

namespace JunctionRelayServer.Models
{
    public static class RenderModes
    {
        // Internal values for database/code
        public const string Payload = "Payload";
        public const string Blit = "Blit";
        public const string Composite = "Composite";

        public static bool IsFrameMode(string mode)
        {
            return mode == Blit || mode == Composite;
        }
    }

    public class Model_Junction
    {
        public int Id { get; set; }

        // Basic metadata
        public required string Name { get; set; }
        public string Description { get; set; } = string.Empty;
        public required string Type { get; set; }
        public string Status { get; set; } = "Idle";
        public int SortOrder { get; set; }
        public bool ShowOnDashboard { get; set; } = true;
        public bool AutoStartOnLaunch { get; set; } = false;
        public string? CronExpression { get; set; }
        public bool AllTargetsAllData { get; set; } = false;
        public bool AllTargetsAllScreens { get; set; } = false;
        public bool CompressPayload { get; set; }
        public string? Timezone { get; set; }

        // Gateway configuration (only needed when Type = "Gateway")
        public int? GatewayDeviceId { get; set; }
        public string? GatewayDestination { get; set; }
        public string? DestinationOverride { get; set; }

        // COM configuration
        public int? BaudRate { get; set; }

        // Services configuration
        public int? MQTTBrokerId { get; set; }

        // Payload configuration
        public string SelectedPayloadAttributes { get; set; } = string.Empty;

        // Stream timeout
        public bool StreamAutoTimeout { get; set; } = false;
        public int StreamAutoTimeoutMs { get; set; } = 10000;

        // Retry policy
        public int RetryCount { get; set; } = 3;
        public int RetryIntervalMs { get; set; } = 1000;

        // Heartbeat / Liveness probe
        public bool EnableTests { get; set; } = true;
        public bool EnableHealthCheck { get; set; } = true;
        public int HealthCheckIntervalMs { get; set; } = 60_000;
        public bool AllowStartOnCollectorTestFailure { get; set; } = false;

        // Payload control
        public bool SendConfigPayload { get; set; } = true;
        public bool SendSensorPayloads { get; set; } = true;
        public bool SendStopPayload { get; set; } = true;

        // Notifications
        public bool EnableNotifications { get; set; } = false;

        // Rendering Configuration
        public string RenderingMode { get; set; } = RenderModes.Payload;

        // Related entities
        public List<Model_JunctionDeviceLink> DeviceLinks { get; set; } = new();
        public List<Model_JunctionCollectorLink> CollectorLinks { get; set; } = new();
        public List<Model_Sensor> ClonedSensors { get; set; } = new();
        public List<Model_Device_Screens> DeviceScreens { get; set; } = new();
        public List<Model_Logic> Logic { get; set; } = new();
        public List<Model_Notifications> Notifications { get; set; } = new();

        // Filtered view of device links by role
        public List<Model_JunctionDeviceLink> SourceLinks =>
            DeviceLinks.Where(l => l.Role.Equals("Source", StringComparison.OrdinalIgnoreCase)).ToList();

        public List<Model_JunctionDeviceLink> TargetLinks =>
            DeviceLinks.Where(l => l.Role.Equals("Target", StringComparison.OrdinalIgnoreCase)).ToList();

        public List<Model_JunctionDeviceLink> BidirectionalLinks =>
            DeviceLinks.Where(l => l.Role.Equals("Bidirectional", StringComparison.OrdinalIgnoreCase)).ToList();

        // Filtered view of collector links by role
        public List<Model_JunctionCollectorLink> SourceCollectorLinks =>
            CollectorLinks.Where(l => l.Role.Equals("Source", StringComparison.OrdinalIgnoreCase)).ToList();

        public List<Model_JunctionCollectorLink> TargetCollectorLinks =>
            CollectorLinks.Where(l => l.Role.Equals("Target", StringComparison.OrdinalIgnoreCase)).ToList();

        public List<Model_JunctionCollectorLink> BidirectionalCollectorLinks =>
            CollectorLinks.Where(l => l.Role.Equals("Bidirectional", StringComparison.OrdinalIgnoreCase)).ToList();

        public List<Model_JunctionSensorTarget> JunctionSensorTargets { get; set; } = new();

        // Convenience properties
        public List<string> SelectedPayloadAttributesList
        {
            get => SelectedPayloadAttributes?.Split(',').ToList() ?? new List<string>();
            set => SelectedPayloadAttributes = string.Join(",", value);
        }

        // Rendering mode helpers
        public bool IsFrameMode => RenderModes.IsFrameMode(RenderingMode);
    }
}