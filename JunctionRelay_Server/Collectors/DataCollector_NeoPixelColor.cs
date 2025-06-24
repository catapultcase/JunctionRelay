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
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_NeoPixelColor : IDataCollector
    {
        public string CollectorName => "NeoPixelColor";
        public int CollectorId { get; private set; }
        private readonly Random _random = new Random();

        public void ApplyConfiguration(Model_Collector collector)
        {
            CollectorId = collector.Id;
        }

        public Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);

            // Generate a random color within the 0-255 range for red, green, and blue
            int red = _random.Next(0, 256);
            int green = _random.Next(0, 256);
            int blue = _random.Next(0, 256);

            // Combine the RGB components into a single 24-bit integer (0xRRGGBB)
            int randomColor = (red << 16) | (green << 8) | blue;

            var sensors = new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    CollectorId = collector.Id,
                    ExternalId = "neopixel_color",
                    Name = "NeoPixel Color",
                    ComponentName = "NeoPixelColor",
                    Value = $"{randomColor:X6}", // Force 6-digit hex with leading zeros
                    Unit = "RGB",
                    SensorTag = "neopixel",
                    SensorType = "Color",
                    Category = "LED",
                    DeviceName = collector.Name,
                    MQTTQoS = 1,
                }
            };

            return Task.FromResult(sensors);
        }

        public Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            return FetchSensorsAsync(collector, cancellationToken);
        }

        public Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(true); // Always available
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public bool IsConnected(Model_Collector collector) => true;
    }
}