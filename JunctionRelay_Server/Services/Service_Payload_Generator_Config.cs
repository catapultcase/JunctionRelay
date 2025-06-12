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
    public class Service_Payload_Generator_Config
    {
        public static string GenerateConfigurationPayload(string screenId)
        {
            var configObject = new
            {
                type = "config",
                screenId = screenId, // Top-level screen identifier
                grid = new
                {
                    columns = 4,
                    rows = 1,
                    layout = new[]
                    {
                        new { id = 1, label = "Sensor 1" },
                        new { id = 2, label = "Sensor 2" },
                        new { id = 3, label = "Sensor 3" },
                        new { id = 4, label = "Sensor 4" }
                    }
                }
            };

            string json = JsonSerializer.Serialize(configObject);
            string prefix = json.Length.ToString().PadLeft(8, '0');
            return prefix + json;
        }
    }
}
