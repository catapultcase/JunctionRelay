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
using System.Text.Json;


namespace JunctionRelayServer.Services
{
    public class Service_Manager_Services
    {
        private readonly HttpClient _httpClient;
        private readonly Service_Database_Manager_Services _serviceDb; // Injected Service_Database_Manager_Services

        // Modify constructor to inject _serviceDb
        public Service_Manager_Services(HttpClient httpClient, Service_Database_Manager_Services serviceDb)
        {
            _httpClient = httpClient;
            _serviceDb = serviceDb; // Initialize _serviceDb
        }

        // Fetch service by ID from the database
        public async Task<Model_Service> GetServiceByIdAsync(int serviceId)
        {
            try
            {
                // Call the database manager to get the service by ID
                var service = await _serviceDb.GetServiceByIdAsync(serviceId);

                if (service == null)
                {
                    throw new Exception($"Service with ID {serviceId} not found.");
                }

                return service;
            }
            catch (Exception ex)
            {
                // Handle and log the error
                throw new Exception($"Error retrieving service by ID: {ex.Message}");
            }
        }

        // Fetch service sensors from an external service (API)
        public async Task<List<Model_Sensor>> FetchServiceSensorsJson(string ip)
        {
            try
            {
                var response = await _httpClient.GetAsync($"http://{ip}/api/service/sensors");
                response.EnsureSuccessStatusCode();

                // Read response content and deserialize it into a list of Model_Sensor objects
                var jsonResponse = await response.Content.ReadAsStringAsync();

                var sensors = JsonSerializer.Deserialize<List<Model_Sensor>>(jsonResponse, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                // Return the list of sensors
                return sensors ?? new List<Model_Sensor>();  // If deserialization fails, return an empty list
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error fetching service sensors: {ex.Message}");
                return new List<Model_Sensor>();  // Return empty list in case of error
            }
        }

        // Fetch supported protocols for a service
        public async Task<List<Model_Protocol>> GetSupportedProtocols(int serviceId)
        {
            try
            {
                var service = await _serviceDb.GetServiceByIdAsync(serviceId);
                if (service == null)
                {
                    throw new Exception($"Service with ID {serviceId} not found.");
                }

                // Return supported protocols
                return service.SupportedProtocols;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error fetching protocols for service: {ex.Message}");
                return new List<Model_Protocol>();  // Return empty list in case of error
            }
        }

        // Add service to the database
        public async Task<Model_Service> AddServiceAsync(Model_Service newService)
        {
            try
            {
                return await _serviceDb.AddServiceAsync(newService);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error adding service: {ex.Message}");
                throw;
            }
        }

        // Update an existing service
        public async Task<bool> UpdateServiceAsync(int serviceId, Model_Service updatedService)
        {
            try
            {
                return await _serviceDb.UpdateServiceAsync(serviceId, updatedService);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error updating service: {ex.Message}");
                throw;
            }
        }

        // Delete a service by ID
        public async Task<bool> DeleteServiceAsync(int serviceId)
        {
            try
            {
                return await _serviceDb.DeleteServiceAsync(serviceId);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error deleting service: {ex.Message}");
                throw;
            }
        }
    }
}
