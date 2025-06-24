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

namespace JunctionRelayServer.Services.FactoryServices
{
    public class Service_HomeAssistant : IService
    {
        private string? _url;
        private string? _apiKey;

        // Constructor accepting configuration from Model_Service
        public Service_HomeAssistant(string? url, string? apiKey)
        {
            _url = url;
            _apiKey = apiKey;
        }

        // Implement the ConnectAsync method from IService
        public async Task ConnectAsync()
        {
            if (string.IsNullOrEmpty(_url) || string.IsNullOrEmpty(_apiKey))
            {
                throw new InvalidOperationException("Home Assistant URL and API key must be provided.");
            }

            Console.WriteLine($"Connecting to HomeAssistant at {_url} with API key {_apiKey}");
            // Simulate async connection (stub for now)
            await Task.Delay(1000);  // Simulate delay for connection
            Console.WriteLine("Connected to HomeAssistant.");

            // Add actual HomeAssistant connection logic here when needed
        }

        // Stub method for executing HomeAssistant commands
        public void Execute()
        {
            Console.WriteLine("Executing HomeAssistant service logic.");
            // Simulate some logic here
        }
    }
}
