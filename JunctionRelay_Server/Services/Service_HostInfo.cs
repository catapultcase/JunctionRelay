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

        // Helper method to detect decimal places in a value
        protected int GetDecimalPlaces(string value)
        {
            // Handle null or empty values
            if (string.IsNullOrEmpty(value))
                return 0;

            // Try to parse as decimal to validate it's a numeric value
            if (!decimal.TryParse(value, out decimal numericValue))
                return 0; // Non-numeric values (including "N/A") have 0 decimal places

            // Convert to string to analyze decimal places
            string valueStr = numericValue.ToString();

            // Find the decimal point
            int decimalIndex = valueStr.IndexOf('.');
            if (decimalIndex == -1)
                return 0; // No decimal point found

            // Count digits after decimal point
            return valueStr.Length - decimalIndex - 1;
        }

        // Centralized sanitation method for sensor objects, now working directly with Model_Sensor.
        protected List<Model_Sensor> SanitizeSensorList(List<Model_Sensor> rawSensors)
        {
            var sanitized = new List<Model_Sensor>();
            foreach (var sensor in rawSensors)
            {
                // If sensor's Value is "N/A", sanitize it with default values for required properties
                if (sensor.Value?.ToString() == "N/A")
                {
                    string naValue = "N/A";
                    sanitized.Add(new Model_Sensor
                    {
                        Name = sensor.Name,
                        SensorType = sensor.SensorType,
                        Value = naValue,
                        ComponentName = sensor.ComponentName,
                        Unit = sensor.Unit ?? "",
                        DecimalPlaces = GetDecimalPlaces(naValue),
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
                string valueStr = "0";
                if (sensor.Value != null &&
                    double.TryParse(sensor.Value.ToString(),
                                    System.Globalization.NumberStyles.Any,
                                    System.Globalization.CultureInfo.InvariantCulture, out tmp))
                {
                    val = (double.IsInfinity(tmp) || double.IsNaN(tmp)) ? 0.0 : tmp;
                    valueStr = val.ToString(System.Globalization.CultureInfo.InvariantCulture);
                }

                sanitized.Add(new Model_Sensor
                {
                    Name = sensor.Name,
                    SensorType = sensor.SensorType,
                    Value = valueStr,
                    ComponentName = sensor.ComponentName,
                    Unit = sensor.Unit ?? "",
                    DecimalPlaces = GetDecimalPlaces(valueStr),
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