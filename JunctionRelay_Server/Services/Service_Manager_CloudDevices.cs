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

        public async Task<RegistrationTokenResponse> GenerateRegistrationTokenAsync(string cloudToken)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var tokenUrl = $"{cloudApiUrl}/cloud/devices/generate-registration-token";

                using var request = new HttpRequestMessage(HttpMethod.Post, tokenUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);
                request.Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        throw new UnauthorizedAccessException("Cloud authentication token is invalid or expired.");
                    }

                    var errorContent = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Failed to generate registration token. Status: {response.StatusCode}, Content: {errorContent}");
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var tokenResponse = JsonSerializer.Deserialize<RegistrationTokenResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (tokenResponse == null)
                {
                    throw new InvalidOperationException("Invalid response from cloud API during token generation.");
                }

                return tokenResponse;
            }
            catch (Exception ex)
            {
                throw;
            }
        }

        public async Task<int> SyncCloudDevicesAsync(string cloudToken)
        {
            try
            {
                var cloudDevices = await FetchCloudDevicesAsync(cloudToken);

                if (cloudDevices == null || !cloudDevices.Any())
                {
                    return 0;
                }

                var existingCloudDevices = await GetExistingCloudDevicesAsync();

                int syncedCount = 0;
                foreach (var cloudDevice in cloudDevices)
                {
                    var success = await UpsertCloudDeviceAsync(cloudDevice, existingCloudDevices);
                    if (success) syncedCount++;
                }

                return syncedCount;
            }
            catch (Exception ex)
            {
                throw;
            }
        }

        public async Task<CloudDeviceResponse> RegisterCloudDeviceAsync(string cloudToken, string deviceId, string deviceName)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var registerUrl = $"{cloudApiUrl}/cloud/devices/register";

                var registerRequest = new
                {
                    deviceId = deviceId,
                    deviceName = deviceName,
                    deviceType = "JunctionRelay"
                };

                var jsonContent = JsonSerializer.Serialize(registerRequest);
                using var request = new HttpRequestMessage(HttpMethod.Post, registerUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);
                request.Content = new StringContent(jsonContent, System.Text.Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        throw new UnauthorizedAccessException("Cloud authentication token is invalid or expired.");
                    }
                    if (response.StatusCode == System.Net.HttpStatusCode.Conflict)
                    {
                        throw new ArgumentException($"Device with ID '{deviceId}' already exists.");
                    }

                    var errorContent = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Failed to register cloud device. Status: {response.StatusCode}, Content: {errorContent}");
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var cloudResponse = JsonSerializer.Deserialize<CloudDeviceRegistrationResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (cloudResponse?.Success != true || cloudResponse.Device == null)
                {
                    throw new InvalidOperationException("Invalid response from cloud API during device registration.");
                }

                var existingCloudDevices = await GetExistingCloudDevicesAsync();
                await UpsertCloudDeviceAsync(cloudResponse.Device, existingCloudDevices);

                return cloudResponse.Device;
            }
            catch (Exception ex)
            {
                throw;
            }
        }

        public async Task<IEnumerable<CloudDeviceResponse>> GetCloudDevicesAsync(string cloudToken)
        {
            try
            {
                var cloudDevices = await FetchCloudDevicesAsync(cloudToken);
                return cloudDevices ?? new List<CloudDeviceResponse>();
            }
            catch (Exception ex)
            {
                throw;
            }
        }

        public async Task<bool> UnregisterCloudDeviceAsync(string cloudToken, string deviceId)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var unregisterUrl = $"{cloudApiUrl}/cloud/devices/{deviceId}";

                using var request = new HttpRequestMessage(HttpMethod.Delete, unregisterUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);

                var response = await _httpClient.SendAsync(request);

                if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    return false;
                }

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        throw new UnauthorizedAccessException("Cloud authentication token is invalid or expired.");
                    }

                    var errorContent = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Failed to unregister cloud device. Status: {response.StatusCode}, Content: {errorContent}");
                }

                if (int.TryParse(deviceId, out int cloudDeviceIdInt))
                {
                    var existingCloudDevices = await GetExistingCloudDevicesAsync();
                    var localDevice = existingCloudDevices.FirstOrDefault(d => d.CloudDeviceId == cloudDeviceIdInt);
                    if (localDevice != null)
                    {
                        await _deviceDb.DeleteDeviceAsync(localDevice.Id);
                    }
                }

                return true;
            }
            catch (Exception ex)
            {
                throw;
            }
        }

        public async Task<bool> ValidateCloudTokenAsync(string cloudToken)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var validateUrl = $"{cloudApiUrl}/cloud/auth/validate";

                using var request = new HttpRequestMessage(HttpMethod.Get, validateUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);

                var response = await _httpClient.SendAsync(request);

                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    return false;
                }

                if (!response.IsSuccessStatusCode)
                {
                    return false;
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var validationResponse = JsonSerializer.Deserialize<CloudTokenValidationResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                return validationResponse?.Valid == true;
            }
            catch (Exception ex)
            {
                return false;
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
                if (!int.TryParse(cloudDevice.DeviceId, out int cloudDeviceId))
                {
                    return false;
                }

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
                return false;
            }
        }

        private async Task<bool> UpdateExistingCloudDeviceAsync(Model_Device existingDevice, CloudDeviceResponse cloudDevice)
        {
            existingDevice.Name = cloudDevice.Name;
            existingDevice.Type = "Cloud Device";
            existingDevice.LastPinged = DateTime.TryParse(cloudDevice.LastUpdated, out var lastUpdated)
                ? lastUpdated
                : DateTime.UtcNow;
            existingDevice.LastUpdated = DateTime.UtcNow;

            var success = await _deviceDb.UpdateDeviceAsync(existingDevice.Id, existingDevice);
            return success;
        }

        private async Task<bool> InsertNewCloudDeviceAsync(CloudDeviceResponse cloudDevice, int cloudDeviceId)
        {
            try
            {
                var newDevice = new Model_Device
                {
                    Name = cloudDevice.Name,
                    Description = "Cloud Device",
                    Type = "Cloud Device",
                    Status = "Online",
                    UniqueIdentifier = $"CLOUD_{cloudDevice.DeviceId}",
                    IsCloudDevice = true,
                    CloudDeviceId = cloudDeviceId,
                    LastPinged = DateTime.TryParse(cloudDevice.LastUpdated, out var lastUpdated)
                        ? lastUpdated
                        : DateTime.UtcNow,
                    LastUpdated = DateTime.UtcNow,
                    IsConnected = false,
                    IsGateway = false,
                    IsJunctionRelayDevice = false,
                    HasCustomFirmware = false,
                    IgnoreUpdates = false,
                    HeartbeatEnabled = false,
                    SupportedProtocols = new List<Model_Protocol>(),
                    Sensors = new List<Model_Sensor>(),
                    Peers = new List<Model_Device>(),
                    Screens = new List<Model_Device_Screens>(),
                    I2cDevices = new List<Model_Device_I2CDevice>()
                };

                var addedDevice = await _deviceDb.AddDeviceAsync(newDevice);
                return true;
            }
            catch (Exception ex)
            {
                return false;
            }
        }

        private async Task RemoveDeletedCloudDevicesAsync(List<CloudDeviceResponse> cloudDevices, List<Model_Device> existingCloudDevices)
        {
            var cloudDeviceIds = cloudDevices
                .Where(cd => int.TryParse(cd.DeviceId, out _))
                .Select(cd => int.Parse(cd.DeviceId))
                .ToHashSet();

            var devicesToRemove = existingCloudDevices
                .Where(d => d.CloudDeviceId.HasValue && !cloudDeviceIds.Contains(d.CloudDeviceId.Value))
                .ToList();

            foreach (var deviceToRemove in devicesToRemove)
            {
                var success = await _deviceDb.DeleteDeviceAsync(deviceToRemove.Id);
            }
        }

        public async Task<IEnumerable<PendingCloudDeviceResponse>> GetPendingCloudDevicesAsync(string cloudToken)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var pendingUrl = $"{cloudApiUrl}/cloud/devices/pending";

                using var request = new HttpRequestMessage(HttpMethod.Get, pendingUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        throw new UnauthorizedAccessException("Cloud authentication token is invalid or expired.");
                    }

                    var errorContent = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Failed to fetch pending devices. Status: {response.StatusCode}, Content: {errorContent}");
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var cloudResponse = JsonSerializer.Deserialize<PendingCloudDevicesApiResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                return cloudResponse?.Devices ?? new List<PendingCloudDeviceResponse>();
            }
            catch (Exception ex)
            {
                throw;
            }
        }

        public async Task<bool> ConfirmCloudDeviceAsync(string cloudToken, string deviceId, bool accept)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var confirmUrl = $"{cloudApiUrl}/cloud/devices/{deviceId}/confirm";

                var confirmRequest = new { accept = accept };
                var jsonContent = JsonSerializer.Serialize(confirmRequest);

                using var request = new HttpRequestMessage(HttpMethod.Post, confirmUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);
                request.Content = new StringContent(jsonContent, System.Text.Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request);

                if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    return false;
                }

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        throw new UnauthorizedAccessException("Cloud authentication token is invalid or expired.");
                    }

                    var errorContent = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Failed to confirm device. Status: {response.StatusCode}, Content: {errorContent}");
                }

                return true;
            }
            catch (Exception ex)
            {
                throw;
            }
        }
    }

    public class PendingCloudDeviceResponse
    {
        public string DeviceId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
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
        public string DeviceId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string LastUpdated { get; set; } = string.Empty;
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