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

using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Payload_Generator_Sensors
    {
        public static string GenerateSensorPayloadForScreen(string screenId, int sensorCount)
        {
            var rand = new Random();

            string Format(double value) => value.ToString("F1");

            // Create a dictionary to hold sensor data
            var sensors = new System.Collections.Generic.Dictionary<string, object>();

            // Generate sensors based on the passed sensor count
            for (int i = 1; i <= sensorCount; i++)
            {
                string sensorKey = $"sensor{i}";

                // Determine the unit based on the sensor index (using modulo operator correctly)
                string unit;
                switch (i % 4)
                {
                    case 0: unit = "Celsius"; break;
                    case 1: unit = "%"; break;
                    case 2: unit = "Lux"; break;
                    default: unit = "kPa"; break;
                }

                // Add sensor data to the dictionary
                sensors[sensorKey] = new[] { new { Value = Format(rand.NextDouble() * 1000.0), Unit = unit } };
            }

            // Create the payload object
            var sensorObject = new
            {
                type = "sensor",
                screenId = screenId, // Top-level target screen ID
                sensors = sensors
            };

            // Serialize the object to JSON
            string json = JsonSerializer.Serialize(sensorObject);
            string prefix = json.Length.ToString().PadLeft(8, '0'); // Add the length prefix
            return prefix + json;
        }
    }
}
