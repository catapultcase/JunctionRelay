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
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_CloudDevices
    {
        private readonly Service_Database_Manager_Devices _deviceDb;
        private readonly IConfiguration _configuration;
        private readonly HttpClient _httpClient;

        public Service_Manager_CloudDevices(
            Service_Database_Manager_Devices deviceDb,
            IConfiguration configuration,
            IHttpClientFactory httpClientFactory)
        {
            _deviceDb = deviceDb;
            _configuration = configuration;
            _httpClient = httpClientFactory.CreateClient();
        }

        public async Task<int> SyncCloudDevicesAsync(string cloudToken)
        {
            try
            {
                var cloudDevices = await FetchCloudDevicesAsync(cloudToken);

                if (cloudDevices == null)
                {
                    return 0;
                }

                var existingCloudDevices = await GetExistingCloudDevicesAsync();

                // Build a lookup for incoming cloud device IDs
                var incomingCloudIds = cloudDevices.Select(cd => cd.Id).ToHashSet();

                // Remove any local cloud devices that are no longer present in the cloud
                var devicesToRemove = existingCloudDevices
                    .Where(d => d.CloudDeviceId.HasValue && !incomingCloudIds.Contains(d.CloudDeviceId.Value))
                    .ToList();

                foreach (var device in devicesToRemove)
                {
                    await _deviceDb.DeleteDeviceAsync(device.Id);
                }

                // Upsert or insert the current cloud devices
                int syncedCount = 0;
                foreach (var cloudDevice in cloudDevices)
                {
                    var success = await UpsertCloudDeviceAsync(cloudDevice, existingCloudDevices);
                    if (success) syncedCount++;
                }

                return syncedCount;
            }
            catch (Exception)
            {
                throw;
            }
        }


        private async Task<List<CloudDeviceResponse>> FetchCloudDevicesAsync(string cloudToken)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                throw new InvalidOperationException("Cloud API URL not configured.");
            }

            var devicesUrl = $"{cloudApiUrl}/cloud/devices";

            using var request = new HttpRequestMessage(HttpMethod.Get, devicesUrl);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);

            var response = await _httpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    throw new UnauthorizedAccessException("Cloud authentication token is invalid or expired.");
                }

                var errorContent = await response.Content.ReadAsStringAsync();
                throw new HttpRequestException($"Failed to fetch cloud devices. Status: {response.StatusCode}, Content: {errorContent}");
            }

            var responseContent = await response.Content.ReadAsStringAsync();

            var cloudResponse = JsonSerializer.Deserialize<CloudDevicesApiResponse>(responseContent, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (cloudResponse?.Success != true || cloudResponse.Devices == null)
            {
                throw new InvalidOperationException("Invalid response from cloud API.");
            }

            return cloudResponse.Devices;
        }

        private async Task<List<Model_Device>> GetExistingCloudDevicesAsync()
        {
            var allDevices = await _deviceDb.GetAllDevicesAsync();
            return allDevices.Where(d => d.IsCloudDevice).ToList();
        }

        private async Task<bool> UpsertCloudDeviceAsync(CloudDeviceResponse cloudDevice, List<Model_Device> existingCloudDevices)
        {
            try
            {
                // Use the cloud database ID directly (no parsing needed)
                int cloudDeviceId = cloudDevice.Id;

                var existingDevice = existingCloudDevices.FirstOrDefault(d => d.CloudDeviceId == cloudDeviceId);

                if (existingDevice != null)
                {
                    return await UpdateExistingCloudDeviceAsync(existingDevice, cloudDevice);
                }
                else
                {
                    return await InsertNewCloudDeviceAsync(cloudDevice, cloudDeviceId);
                }
            }
            catch (Exception ex)
            {
                // Add logging here
                Console.WriteLine($"Error upserting cloud device: {ex.Message}");
                return false;
            }
        }

        private async Task<bool> UpdateExistingCloudDeviceAsync(Model_Device existingDevice, CloudDeviceResponse cloudDevice)
        {
            existingDevice.Name = cloudDevice.Name;
            existingDevice.Description = "Cloud Device";
            existingDevice.Type = "Cloud Device";
            existingDevice.Status = cloudDevice.Status;
            existingDevice.UniqueIdentifier = cloudDevice.DeviceId;
            existingDevice.IsCloudDevice = true;
            existingDevice.CloudDeviceId = cloudDevice.Id;
            existingDevice.PushNotifications = cloudDevice.PushNotifications;

            if (!string.IsNullOrWhiteSpace(cloudDevice.LastUpdated) &&
                DateTime.TryParse(cloudDevice.LastUpdated.Trim(), null, System.Globalization.DateTimeStyles.AdjustToUniversal, out var parsedPinged))
            {
                existingDevice.LastPinged = parsedPinged;
            }


            existingDevice.LastPingStatus = cloudDevice.LastHealthStatus;
            existingDevice.LastEncryptedSensorData = cloudDevice.LastEncryptedSensorData;

            existingDevice.SyncMode = cloudDevice.DeviceType?.ToLower() switch
            {
                "cloud" => "cloud_health",
                "cloud_health" => "cloud_health",
                "cloud_sync" => "cloud_sync",
                string other => other
            };

            // Safely parse timestamps
            existingDevice.CreatedAt = DateTime.TryParse(cloudDevice.CreatedAt, out var createdAt)
                ? DateTime.SpecifyKind(createdAt, DateTimeKind.Utc)
                : null;

            existingDevice.LastHealthAlertSent = DateTime.TryParse(cloudDevice.LastHealthAlertSent, out var alertAt)
                ? DateTime.SpecifyKind(alertAt, DateTimeKind.Utc)
                : null;

            existingDevice.LastHealthReminderSent = DateTime.TryParse(cloudDevice.LastHealthReminderSent, out var reminderAt)
                ? DateTime.SpecifyKind(reminderAt, DateTimeKind.Utc)
                : null;

            return await _deviceDb.UpdateDeviceAsync(existingDevice.Id, existingDevice);
        }


        private async Task<bool> InsertNewCloudDeviceAsync(CloudDeviceResponse cloudDevice, int cloudDeviceId)
        {
            try
            {
                // Parse values that require DateTime? assignment
                DateTime? parsedPinged = DateTime.TryParse(cloudDevice.LastUpdated, out var pinged)
                    ? DateTime.SpecifyKind(pinged, DateTimeKind.Utc)
                    : null;

                DateTime? reportAt = DateTime.TryParse(cloudDevice.LastHealthReportAt, out var parsedReport)
                    ? DateTime.SpecifyKind(parsedReport, DateTimeKind.Utc)
                    : null;

                DateTime? createdAt = DateTime.TryParse(cloudDevice.CreatedAt, out var parsedCreated)
                    ? DateTime.SpecifyKind(parsedCreated, DateTimeKind.Utc)
                    : null;

                DateTime? alertAt = DateTime.TryParse(cloudDevice.LastHealthAlertSent, out var parsedAlert)
                    ? DateTime.SpecifyKind(parsedAlert, DateTimeKind.Utc)
                    : null;

                DateTime? reminderAt = DateTime.TryParse(cloudDevice.LastHealthReminderSent, out var parsedReminder)
                    ? DateTime.SpecifyKind(parsedReminder, DateTimeKind.Utc)
                    : null;

                var newDevice = new Model_Device
                {
                    Name = cloudDevice.Name,
                    Description = "Cloud Device",
                    Type = "Cloud Device",
                    Status = cloudDevice.Status,
                    UniqueIdentifier = cloudDevice.DeviceId,
                    IsCloudDevice = true,
                    CloudDeviceId = cloudDeviceId,
                    PushNotifications = cloudDevice.PushNotifications,
                    LastPinged = parsedPinged,
                    LastPingStatus = cloudDevice.LastHealthStatus,
                    LastEncryptedSensorData = cloudDevice.LastEncryptedSensorData,
                    CreatedAt = createdAt,
                    LastHealthAlertSent = alertAt,
                    LastHealthReminderSent = reminderAt,

                    SyncMode = cloudDevice.DeviceType?.ToLower() switch
                    {
                        "cloud" => "cloud_health",
                        "cloud_health" => "cloud_health",
                        "cloud_sync" => "cloud_sync",
                        string other => other
                    }
                };

                var addedDevice = await _deviceDb.AddDeviceAsync(newDevice);
                return addedDevice != null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error inserting new cloud device: {ex.Message}");
                return false;
            }
        }
    }

    public class PendingCloudDeviceResponse
    {
        public int Id { get; set; }                    // Cloud database ID
        public string DeviceId { get; set; } = string.Empty;  // MAC address
        public string Name { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
    }

    public class PendingCloudDevicesApiResponse
    {
        public bool Success { get; set; }
        public List<PendingCloudDeviceResponse> Devices { get; set; } = new();
    }

    public class RegistrationTokenResponse
    {
        public bool Success { get; set; }
        public string RegistrationToken { get; set; } = string.Empty;
        public int ExpiresIn { get; set; }
        public string QrCodeData { get; set; } = string.Empty;
    }

    public class CloudDevicesApiResponse
    {
        public bool Success { get; set; }
        public List<CloudDeviceResponse> Devices { get; set; } = new();
    }

    public class CloudDeviceResponse
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string DeviceId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string LastHealthStatus { get; set; } = string.Empty;
        public string LastEncryptedSensorData { get; set; } = string.Empty;
        public string LastHealthReportAt { get; set; } = string.Empty;
        public string LastHealthAlertSent { get; set; } = string.Empty;
        public string LastHealthReminderSent { get; set; } = string.Empty;
        public string DeviceType { get; set; } = string.Empty;
        public string CreatedAt { get; set; } = string.Empty;
        public string LastUpdated { get; set; } = string.Empty;
        public bool PushNotifications { get; set; }
        public bool ClearAlertsOnHealthy { get; set; }
    }


    public class CloudDeviceRegistrationResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public CloudDeviceResponse Device { get; set; } = new();
    }

    public class CloudTokenValidationResponse
    {
        public bool Valid { get; set; }
        public string Message { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
    }
}