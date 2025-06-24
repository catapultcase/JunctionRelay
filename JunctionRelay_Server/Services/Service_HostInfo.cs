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

namespace JunctionRelayServer.Services
{
    public abstract class Service_HostInfo
    {
        // Abstract method that must be implemented by derived classes.
        public abstract Task<List<Model_Sensor>> GetHostSensors(int sampleRateMs);

        // Centralized sanitation method for sensor objects, now working directly with Model_Sensor.
        protected List<Model_Sensor> SanitizeSensorList(List<Model_Sensor> rawSensors)
        {
            var sanitized = new List<Model_Sensor>();

            foreach (var sensor in rawSensors)
            {
                // If sensor's Value is "N/A", sanitize it with default values for required properties
                if (sensor.Value?.ToString() == "N/A")
                {
                    sanitized.Add(new Model_Sensor
                    {
                        Name = sensor.Name,
                        SensorType = sensor.SensorType,
                        Value = "N/A",
                        ComponentName = sensor.ComponentName,
                        Unit = sensor.Unit ?? "",
                        DeviceId = sensor.DeviceId,
                        ExternalId = sensor.ExternalId,
                        SensorTag = sensor.SensorTag ?? "DefaultSensorTag",  // Set default if null
                        Category = sensor.Category ?? "DefaultCategory",    // Set default if null
                        DeviceName = sensor.DeviceName ?? "DefaultDeviceName",  // Set default if null
                        LastUpdated = DateTime.UtcNow
                    });
                    continue;
                }

                double tmp = 0.0;
                double val = 0.0;
                if (sensor.Value != null &&
                    double.TryParse(sensor.Value.ToString(),
                                    System.Globalization.NumberStyles.Any,
                                    System.Globalization.CultureInfo.InvariantCulture, out tmp))
                {
                    val = (double.IsInfinity(tmp) || double.IsNaN(tmp)) ? 0.0 : tmp;
                }

                sanitized.Add(new Model_Sensor
                {
                    Name = sensor.Name,
                    SensorType = sensor.SensorType,
                    Value = val.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    ComponentName = sensor.ComponentName,
                    Unit = sensor.Unit ?? "",
                    DeviceId = sensor.DeviceId,
                    ExternalId = sensor.ExternalId,
                    SensorTag = sensor.SensorTag ?? "DefaultSensorTag",  // Only assign default if null
                    Category = sensor.Category ?? "DefaultCategory",    // Only assign default if null
                    DeviceName = sensor.DeviceName ?? "DefaultDeviceName",  // Only assign default if null
                    LastUpdated = DateTime.UtcNow
                });
            }

            return sanitized;
        }

    }
}
