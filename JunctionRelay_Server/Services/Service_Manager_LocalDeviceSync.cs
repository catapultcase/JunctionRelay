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

using System.Text;
using System.Text.Json;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_LocalDeviceSync
    {
        private readonly IConfiguration _configuration;
        private readonly HttpClient _httpClient;
        private readonly Service_BackendIdentity _backendIdentityService;
        private readonly Service_CloudSessionStore _cloudSessionStore;

        public Service_Manager_LocalDeviceSync(
            IConfiguration configuration,
            IHttpClientFactory httpClientFactory,
            Service_BackendIdentity backendIdentityService,
            Service_CloudSessionStore cloudSessionStore)
        {
            _configuration = configuration;
            _httpClient = httpClientFactory.CreateClient();
            _backendIdentityService = backendIdentityService;
            _cloudSessionStore = cloudSessionStore;
        }

        // Register device with cloud based on sync mode
        public async Task<bool> RegisterDeviceAsync(string deviceId, string deviceName, string syncMode, CancellationToken cancellationToken = default)
        {
            try
            {
                var cloudToken = await _cloudSessionStore.GetValidAccessTokenAsync(cancellationToken);
                if (string.IsNullOrEmpty(cloudToken))
                {
                    Console.WriteLine($"[LOCAL_DEVICE_SYNC] ⚠️ No cloud token available for device registration: {deviceName}");
                    return false;
                }

                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                string registerUrl;
                switch (syncMode?.ToLower())
                {
                    case "local_health":
                        registerUrl = $"{cloudApiUrl}/local-devices/register-health";
                        break;
                    case "local_sync":
                        registerUrl = $"{cloudApiUrl}/local-devices/register-sync";
                        break;
                    default:
                        Console.WriteLine($"[LOCAL_DEVICE_SYNC] ⚠️ Invalid sync mode '{syncMode}' for device {deviceName}. Defaulting to health mode.");
                        registerUrl = $"{cloudApiUrl}/local-devices/register-health";
                        break;
                }

                var backendId = _backendIdentityService.GetBackendId();
                var registerRequest = new
                {
                    deviceId = deviceId,
                    deviceName = deviceName,
                    backendId = backendId
                };

                var jsonContent = JsonSerializer.Serialize(registerRequest);
                using var request = new HttpRequestMessage(HttpMethod.Post, registerUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);
                request.Content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request, cancellationToken);

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        Console.WriteLine($"[LOCAL_DEVICE_SYNC] ❌ Unauthorized: Cloud token invalid for device {deviceName}");
                        return false;
                    }

                    var errorContent = await response.Content.ReadAsStringAsync(cancellationToken);

                    // Handle "already registered" as success
                    if (errorContent.Contains("already registered"))
                    {
                        Console.WriteLine($"[LOCAL_DEVICE_SYNC] ✅ Device {deviceName} already registered for {syncMode} - treating as success");
                        return true;
                    }

                    Console.WriteLine($"[LOCAL_DEVICE_SYNC] ❌ Failed to register device {deviceName} for {syncMode}. Status: {response.StatusCode}, Content: {errorContent}");
                    return false;
                }

                var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
                var cloudResponse = JsonSerializer.Deserialize<CloudDeviceRegistrationResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                Console.WriteLine($"[LOCAL_DEVICE_SYNC] ✅ Registered device '{deviceName}' for {syncMode} with BackendId: {backendId ?? "none"}");
                return cloudResponse?.Success == true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LOCAL_DEVICE_SYNC] ❌ Error registering device '{deviceName}' for {syncMode}: {ex.Message}");
                return false;
            }
        }

        // Update device sync mode in cloud
        public async Task<bool> UpdateDeviceSyncModeAsync(string deviceId, string deviceName, string newSyncMode, CancellationToken cancellationToken = default)
        {
            try
            {
                var cloudToken = await _cloudSessionStore.GetValidAccessTokenAsync(cancellationToken);
                if (string.IsNullOrEmpty(cloudToken))
                {
                    Console.WriteLine($"[LOCAL_DEVICE_SYNC] ⚠️ No cloud token available for device sync mode update: {deviceName}");
                    return false;
                }

                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var updateUrl = $"{cloudApiUrl}/local-devices/{deviceId}/sync-mode";

                var updateRequest = new
                {
                    syncMode = newSyncMode
                };

                var jsonContent = JsonSerializer.Serialize(updateRequest);
                using var request = new HttpRequestMessage(HttpMethod.Put, updateUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);
                request.Content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request, cancellationToken);

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        Console.WriteLine($"[LOCAL_DEVICE_SYNC] ❌ Unauthorized: Cloud token invalid for device {deviceName}");
                        return false;
                    }

                    if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                    {
                        Console.WriteLine($"[LOCAL_DEVICE_SYNC] ⚠️ Device '{deviceName}' not found in cloud - may need to register first");
                        return false;
                    }

                    var errorContent = await response.Content.ReadAsStringAsync(cancellationToken);
                    Console.WriteLine($"[LOCAL_DEVICE_SYNC] ❌ Failed to update sync mode for device {deviceName}. Status: {response.StatusCode}, Content: {errorContent}");
                    return false;
                }

                var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
                var cloudResponse = JsonSerializer.Deserialize<CloudDeviceRegistrationResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                Console.WriteLine($"[LOCAL_DEVICE_SYNC] ✅ Updated sync mode for device '{deviceName}' to {newSyncMode}");
                return cloudResponse?.Success == true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LOCAL_DEVICE_SYNC] ❌ Error updating sync mode for device '{deviceName}': {ex.Message}");
                return false;
            }
        }

        // Unregister device from cloud
        public async Task<bool> UnregisterDeviceAsync(string deviceId, string deviceName, CancellationToken cancellationToken = default)
        {
            try
            {
                var cloudToken = await _cloudSessionStore.GetValidAccessTokenAsync(cancellationToken);
                if (string.IsNullOrEmpty(cloudToken))
                {
                    Console.WriteLine($"[CLOUD_SYNC] ⚠️ No cloud token available for device unregistration: {deviceName}");
                    return false;
                }

                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var unregisterUrl = $"{cloudApiUrl}/local-devices/unregister";

                var unregisterRequest = new { deviceId = deviceId };
                var jsonContent = JsonSerializer.Serialize(unregisterRequest);

                using var request = new HttpRequestMessage(HttpMethod.Post, unregisterUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);
                request.Content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request, cancellationToken);

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        Console.WriteLine($"[CLOUD_SYNC] ❌ Unauthorized: Cloud token invalid for device {deviceName}");
                        return false;
                    }

                    var errorContent = await response.Content.ReadAsStringAsync(cancellationToken);

                    // Handle "device not found" or "not registered" as success since goal is achieved
                    if (errorContent.Contains("not found") || errorContent.Contains("not registered"))
                    {
                        Console.WriteLine($"[CLOUD_SYNC] ✅ Device '{deviceName}' was not registered - treating unregister as success");
                        return true;
                    }

                    Console.WriteLine($"[CLOUD_SYNC] ❌ Failed to unregister device '{deviceName}'. Status: {response.StatusCode}, Content: {errorContent}");
                    return false;
                }

                var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
                var cloudResponse = JsonSerializer.Deserialize<CloudDeviceRegistrationResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                Console.WriteLine($"[CLOUD_SYNC] ✅ Unregistered device '{deviceName}' from cloud");
                return cloudResponse?.Success == true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_SYNC] ❌ Error unregistering device '{deviceName}': {ex.Message}");
                return false;
            }
        }

        // Handle sync mode changes - auto register/unregister/update
        public async Task<bool> HandleSyncModeChangeAsync(Model_Device device, string? previousSyncMode, CancellationToken cancellationToken = default)
        {
            var currentSyncMode = device.SyncMode;
            var deviceId = device.UniqueIdentifier ?? device.Id.ToString();
            var deviceName = device.Name;

            Console.WriteLine($"[LOCAL_DEVICE_SYNC] 🔄 Processing sync mode change for '{deviceName}': {previousSyncMode ?? "null"} → {currentSyncMode ?? "null"}");

            var wasCloudMode = IsCloudSyncMode(previousSyncMode);
            var isCloudMode = IsCloudSyncMode(currentSyncMode);

            // Moving FROM cloud mode TO non-cloud mode - unregister
            if (wasCloudMode && !isCloudMode)
            {
                Console.WriteLine($"[LOCAL_DEVICE_SYNC] 📤 Unregistering '{deviceName}' from cloud (disabled {previousSyncMode})");
                return await UnregisterDeviceAsync(deviceId, deviceName, cancellationToken);
            }

            // Moving TO cloud mode FROM non-cloud mode - register
            if (!wasCloudMode && isCloudMode)
            {
                Console.WriteLine($"[LOCAL_DEVICE_SYNC] 📥 Registering '{deviceName}' with cloud (enabled {currentSyncMode})");
                return await RegisterDeviceAsync(deviceId, deviceName, currentSyncMode!, cancellationToken);
            }

            // Moving FROM one cloud mode TO another cloud mode - update sync mode
            if (wasCloudMode && isCloudMode && previousSyncMode != currentSyncMode)
            {
                Console.WriteLine($"[LOCAL_DEVICE_SYNC] 🔄 Updating '{deviceName}' cloud sync mode: {previousSyncMode} → {currentSyncMode}");

                var updateSuccess = await UpdateDeviceSyncModeAsync(deviceId, deviceName, currentSyncMode!, cancellationToken);

                // If update fails (e.g., device not found), try to register instead
                if (!updateSuccess)
                {
                    Console.WriteLine($"[LOCAL_DEVICE_SYNC] ⚠️ Sync mode update failed for '{deviceName}', attempting registration instead");
                    return await RegisterDeviceAsync(deviceId, deviceName, currentSyncMode!, cancellationToken);
                }

                return updateSuccess;
            }

            // No cloud registration change needed (both non-cloud, or same cloud mode)
            Console.WriteLine($"[LOCAL_DEVICE_SYNC] ℹ️ No cloud registration change needed for '{deviceName}'");
            return true;
        }

        private static bool IsCloudSyncMode(string? syncMode)
        {
            return syncMode == "local_health" || syncMode == "local_sync";
        }
    }
}