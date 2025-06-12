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

using JunctionRelayServer.Models;
using Tmds.MDns;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Network_Scan
    {
        private Dictionary<string, string> _discoveredDevices = new Dictionary<string, string>();

        public async Task<List<Model_ScannedDevice>> ScanNetworkAsync()
        {
            var discoveredDevices = new List<Model_ScannedDevice>();
            string serviceType = "_junctionrelay._tcp";  // Default service type for ESP32 devices

            var serviceBrowser = new ServiceBrowser();
            serviceBrowser.ServiceAdded += (sender, e) =>
            {
                var ipAddress = e.Announcement.Addresses.FirstOrDefault()?.ToString();
                if (ipAddress != null)
                {
                    discoveredDevices.Add(new Model_ScannedDevice
                    {
                        Instance = e.Announcement.Instance,
                        IpAddress = ipAddress
                    });
                }
            };

            serviceBrowser.ServiceRemoved += (sender, e) =>
            {
                // Handle service removal if needed
            };

            serviceBrowser.ServiceChanged += (sender, e) =>
            {
                // Handle service changes if needed
            };

            Console.WriteLine("Browsing for type: {0}", serviceType);
            var cts = new System.Threading.CancellationTokenSource();
            var token = cts.Token;

            serviceBrowser.StartBrowse(serviceType);

            try
            {
                await Task.Delay(5000, token);  // Scan for 5 seconds
            }
            catch (TaskCanceledException)
            {
                Console.WriteLine("Scanning cancelled after timeout.");
            }

            serviceBrowser.StopBrowse();
            Console.WriteLine("Browsing stopped.");

            return discoveredDevices;
        }



        public async Task<string> GetDeviceIpByInstance(string instance)
        {
            try
            {
                Console.WriteLine($"Attempting to resolve IP for instance: {instance}");  // Debug log
                if (_discoveredDevices.ContainsKey(instance))
                {
                    return await Task.FromResult(_discoveredDevices[instance]);
                }
                else
                {
                    throw new Exception("Device IP not found for instance: " + instance);
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Error retrieving IP for instance {instance}: {ex.Message}");
            }
        }
    }
}
