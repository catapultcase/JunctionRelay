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
    public class Model_Sensor
    {
        public int Id { get; set; }
        public int OriginalId { get; set; }
        public int? JunctionId { get; set; }
        public int? JunctionDeviceLinkId { get; set; }
        public int? JunctionCollectorLinkId { get; set; }
        public int SensorOrder { get; set; }
        public int? MQTTServiceId { get; set; }
        public string? MQTTTopic { get; set; }
        public int? MQTTQoS { get; set; }

        // Required properties
        public required string SensorType { get; set; }  // E.g., 'Analog', 'Digital'
        public required string ExternalId { get; set; }
        public required string DeviceName { get; set; }  // Changed from DataSourceName to DeviceName
        public required string Name { get; set; }
        public required string ComponentName { get; set; }
        public required string Category { get; set; }
        public required string Unit { get; set; }
        public required string Value { get; set; }
        public required string SensorTag { get; set; }

        // Optional properties (nullable types)
        public string? Formula { get; set; }
        private DateTime _lastUpdated;
        public DateTime LastUpdated
        {
            get => _lastUpdated;
            set => _lastUpdated = DateTime.SpecifyKind(value, DateTimeKind.Utc);
        }

        public string? CustomAttribute1 { get; set; }
        public string? CustomAttribute2 { get; set; }
        public string? CustomAttribute3 { get; set; }
        public string? CustomAttribute4 { get; set; }
        public string? CustomAttribute5 { get; set; }
        public string? CustomAttribute6 { get; set; }
        public string? CustomAttribute7 { get; set; }
        public string? CustomAttribute8 { get; set; }
        public string? CustomAttribute9 { get; set; }
        public string? CustomAttribute10 { get; set; }

        // Other properties
        public bool IsMissing { get; set; }
        public bool IsStale { get; set; }
        public bool IsSelected { get; set; }
        public bool IsVisible { get; set; }

        // Relationships
        public int? DeviceId { get; set; }  // Nullable to link to devices
        public int? ServiceId { get; set; }  // Nullable to link to devices
        public int? CollectorId { get; set; }  // Nullable to link to collectors


        public Model_Sensor Clone()
        {
            return new Model_Sensor
            {
                Id = this.Id,
                OriginalId = this.Id,
                JunctionId = this.JunctionId,
                JunctionDeviceLinkId = this.JunctionDeviceLinkId,
                JunctionCollectorLinkId = this.JunctionCollectorLinkId,
                SensorOrder = this.SensorOrder,
                MQTTServiceId = this.MQTTServiceId,
                MQTTTopic = this.MQTTTopic,
                MQTTQoS = this.MQTTQoS,
                SensorType = this.SensorType,
                IsMissing = this.IsMissing,
                IsStale = this.IsStale,
                IsSelected = this.IsSelected,
                IsVisible = this.IsVisible,
                ExternalId = this.ExternalId,
                DeviceId = this.DeviceId,
                ServiceId = this.ServiceId,
                CollectorId = this.CollectorId,
                DeviceName = this.DeviceName,
                Name = this.Name,
                ComponentName = this.ComponentName,
                Category = this.Category,
                Unit = this.Unit,
                Value = this.Value,
                SensorTag = this.SensorTag,
                Formula = this.Formula,
                LastUpdated = this.LastUpdated,
                CustomAttribute1 = this.CustomAttribute1,
                CustomAttribute2 = this.CustomAttribute2,
                CustomAttribute3 = this.CustomAttribute3,
                CustomAttribute4 = this.CustomAttribute4,
                CustomAttribute5 = this.CustomAttribute5,
                CustomAttribute6 = this.CustomAttribute6,
                CustomAttribute7 = this.CustomAttribute7,
                CustomAttribute8 = this.CustomAttribute8,
                CustomAttribute9 = this.CustomAttribute9,
                CustomAttribute10 = this.CustomAttribute10,
            };
        }

        public Model_Sensor TrueClone()
        {
            return new Model_Sensor
            {
                Id = this.Id,
                OriginalId = this.OriginalId, // Keep original ID as is
                JunctionId = this.JunctionId,
                JunctionDeviceLinkId = this.JunctionDeviceLinkId,
                JunctionCollectorLinkId = this.JunctionCollectorLinkId,
                SensorOrder = this.SensorOrder,
                MQTTServiceId = this.MQTTServiceId,
                MQTTTopic = this.MQTTTopic,
                MQTTQoS = this.MQTTQoS,
                SensorType = this.SensorType,
                IsMissing = this.IsMissing,
                IsStale = this.IsStale,
                IsSelected = this.IsSelected,
                IsVisible = this.IsVisible,
                ExternalId = this.ExternalId,
                DeviceId = this.DeviceId,
                ServiceId = this.ServiceId,
                CollectorId = this.CollectorId,
                DeviceName = this.DeviceName,
                Name = this.Name,
                ComponentName = this.ComponentName,
                Category = this.Category,
                Unit = this.Unit,
                Value = this.Value,
                SensorTag = this.SensorTag,
                Formula = this.Formula,
                LastUpdated = this.LastUpdated,
                CustomAttribute1 = this.CustomAttribute1,
                CustomAttribute2 = this.CustomAttribute2,
                CustomAttribute3 = this.CustomAttribute3,
                CustomAttribute4 = this.CustomAttribute4,
                CustomAttribute5 = this.CustomAttribute5,
                CustomAttribute6 = this.CustomAttribute6,
                CustomAttribute7 = this.CustomAttribute7,
                CustomAttribute8 = this.CustomAttribute8,
                CustomAttribute9 = this.CustomAttribute9,
                CustomAttribute10 = this.CustomAttribute10,
            };
        }
    }
}
