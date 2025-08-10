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
using JunctionRelayServer.Controllers;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_CloudNotifications
    {
        private readonly IConfiguration _configuration;
        private readonly HttpClient _httpClient;

        public Service_Manager_CloudNotifications(
            IConfiguration configuration,
            IHttpClientFactory httpClientFactory)
        {
            _configuration = configuration;
            _httpClient = httpClientFactory.CreateClient();
        }

        // Get notification preferences from cloud
        public async Task<NotificationPreferencesResponse> GetNotificationPreferencesAsync(string cloudToken)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var preferencesUrl = $"{cloudApiUrl}/cloud/notifications/preferences";

                using var request = new HttpRequestMessage(HttpMethod.Get, preferencesUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        throw new UnauthorizedAccessException("Cloud authentication token is invalid or expired.");
                    }

                    var errorContent = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Failed to get notification preferences. Status: {response.StatusCode}, Content: {errorContent}");
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var preferencesResponse = JsonSerializer.Deserialize<NotificationPreferencesApiResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (preferencesResponse == null || !preferencesResponse.Success)
                {
                    throw new InvalidOperationException("Invalid response from cloud API during preference retrieval.");
                }

                return preferencesResponse.Preferences;
            }
            catch (Exception)
            {
                throw;
            }
        }

        // Update notification preferences in cloud
        public async Task<bool> UpdateNotificationPreferencesAsync(string cloudToken, JunctionRelayServer.Controllers.UpdateNotificationPreferencesRequest request)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var preferencesUrl = $"{cloudApiUrl}/cloud/notifications/preferences";

                var updateRequest = new
                {
                    pushNotificationsEnabled = request.PushNotificationsEnabled,
                    deviceHealthTimeoutMinutes = request.DeviceHealthTimeoutMinutes,
                    deviceHealthReminderIntervalMinutes = request.DeviceHealthReminderIntervalMinutes
                };

                var jsonContent = JsonSerializer.Serialize(updateRequest);

                using var httpRequest = new HttpRequestMessage(HttpMethod.Put, preferencesUrl);
                httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);
                httpRequest.Content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(httpRequest);

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        throw new UnauthorizedAccessException("Cloud authentication token is invalid or expired.");
                    }

                    var errorContent = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Failed to update notification preferences. Status: {response.StatusCode}, Content: {errorContent}");
                }

                return true;
            }
            catch (Exception)
            {
                throw;
            }
        }

        // Create notification pair code for mobile device pairing
        public async Task<CreatePairCodeResponse> CreateNotificationPairCodeAsync(string cloudToken, string deviceName)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var pairCodeUrl = $"{cloudApiUrl}/cloud/notifications/create-pair-code";

                var pairCodeRequest = new { deviceName = deviceName };
                var jsonContent = JsonSerializer.Serialize(pairCodeRequest);

                using var request = new HttpRequestMessage(HttpMethod.Post, pairCodeUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);
                request.Content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        throw new UnauthorizedAccessException("Cloud authentication token is invalid or expired.");
                    }

                    var errorContent = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Failed to create pair code. Status: {response.StatusCode}, Content: {errorContent}");
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var pairCodeResponse = JsonSerializer.Deserialize<CreatePairCodeResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (pairCodeResponse == null || !pairCodeResponse.Success)
                {
                    throw new InvalidOperationException("Invalid response from cloud API during pair code creation.");
                }

                return pairCodeResponse;
            }
            catch (Exception)
            {
                throw;
            }
        }

        // Complete mobile device pairing
        public async Task<CompletePairingResponse> CompletePairingAsync(string cloudToken, JunctionRelayServer.Controllers.CompletePairingRequest request)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var pairingUrl = $"{cloudApiUrl}/cloud/notifications/complete-pairing";

                var pairingRequest = new
                {
                    pairCode = request.PairCode,
                    fcmToken = request.FcmToken,
                    platform = request.Platform
                };

                var jsonContent = JsonSerializer.Serialize(pairingRequest);

                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, pairingUrl);
                httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);
                httpRequest.Content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(httpRequest);

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        throw new UnauthorizedAccessException("Cloud authentication token is invalid or expired.");
                    }

                    var errorContent = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Failed to complete pairing. Status: {response.StatusCode}, Content: {errorContent}");
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var pairingResponse = JsonSerializer.Deserialize<CompletePairingResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (pairingResponse == null || !pairingResponse.Success)
                {
                    throw new InvalidOperationException("Invalid response from cloud API during pairing completion.");
                }

                return pairingResponse;
            }
            catch (Exception)
            {
                throw;
            }
        }

        // Send push notification to all paired devices
        public async Task<SendPushNotificationResponse> SendPushNotificationAsync(string cloudToken, JunctionRelayServer.Controllers.SendPushNotificationRequest request)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var pushUrl = $"{cloudApiUrl}/cloud/firebase/send";

                var pushRequest = new
                {
                    title = request.Title,
                    body = request.Body,
                    data = request.Data ?? new Dictionary<string, string>()
                };

                var jsonContent = JsonSerializer.Serialize(pushRequest);

                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, pushUrl);
                httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);
                httpRequest.Content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(httpRequest);

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        throw new UnauthorizedAccessException("Cloud authentication token is invalid or expired.");
                    }

                    var errorContent = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Failed to send push notification. Status: {response.StatusCode}, Content: {errorContent}");
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var pushResponse = JsonSerializer.Deserialize<SendPushNotificationResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (pushResponse == null || !pushResponse.Success)
                {
                    throw new InvalidOperationException("Invalid response from cloud API during push notification send.");
                }

                return pushResponse;
            }
            catch (Exception)
            {
                throw;
            }
        }

        // Get list of paired mobile devices
        public async Task<IEnumerable<MobileDeviceResponse>> GetMobileDevicesAsync(string cloudToken)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var devicesUrl = $"{cloudApiUrl}/cloud/notifications/devices";

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
                    throw new HttpRequestException($"Failed to get mobile devices. Status: {response.StatusCode}, Content: {errorContent}");
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var devicesResponse = JsonSerializer.Deserialize<MobileDevicesApiResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                return devicesResponse?.Devices ?? new List<MobileDeviceResponse>();
            }
            catch (Exception)
            {
                throw;
            }
        }

        // Remove a paired mobile device
        public async Task<bool> RemoveMobileDeviceAsync(string cloudToken, string deviceId)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                var removeUrl = $"{cloudApiUrl}/cloud/notifications/devices/{deviceId}";

                using var request = new HttpRequestMessage(HttpMethod.Delete, removeUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);

                var response = await _httpClient.SendAsync(request);

                if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    return false; // Device not found
                }

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        throw new UnauthorizedAccessException("Cloud authentication token is invalid or expired.");
                    }

                    var errorContent = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Failed to remove mobile device. Status: {response.StatusCode}, Content: {errorContent}");
                }

                return true;
            }
            catch (Exception)
            {
                throw;
            }
        }

        // Get notification system status
        public async Task<NotificationStatusResponse> GetNotificationStatusAsync(string cloudToken)
        {
            try
            {
                var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
                if (string.IsNullOrEmpty(cloudApiUrl))
                {
                    throw new InvalidOperationException("Cloud API URL not configured.");
                }

                // Test connectivity by trying to get preferences
                var testUrl = $"{cloudApiUrl}/cloud/notifications/preferences";

                using var request = new HttpRequestMessage(HttpMethod.Get, testUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);

                var response = await _httpClient.SendAsync(request);

                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    return new NotificationStatusResponse
                    {
                        Authenticated = false,
                        NotificationsAvailable = false,
                        Message = "Invalid cloud authentication token"
                    };
                }

                var isConnected = response.IsSuccessStatusCode;

                return new NotificationStatusResponse
                {
                    Authenticated = true,
                    NotificationsAvailable = isConnected,
                    CloudConnected = isConnected,
                    Message = isConnected ? "Cloud notifications available" : "Cloud connection error"
                };
            }
            catch (Exception ex)
            {
                return new NotificationStatusResponse
                {
                    Authenticated = true,
                    NotificationsAvailable = false,
                    CloudConnected = false,
                    Message = "Cloud connection error",
                    Error = ex.Message
                };
            }
        }
    }

    // Response models for notifications
    public class NotificationPreferencesResponse
    {
        public bool PushNotificationsEnabled { get; set; }
        public int? DeviceHealthTimeoutMinutes { get; set; }
        public int? DeviceHealthReminderIntervalMinutes { get; set; }
    }

    public class NotificationPreferencesApiResponse
    {
        public bool Success { get; set; }
        public NotificationPreferencesResponse Preferences { get; set; } = new();
    }

    public class CreatePairCodeResponse
    {
        public bool Success { get; set; }
        public string Token { get; set; } = string.Empty;
        public string ExpiresAt { get; set; } = string.Empty;
    }

    public class CompletePairingResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public string DeviceId { get; set; } = string.Empty;
        public string? Error { get; set; }
    }

    public class SendPushNotificationResponse
    {
        public bool Success { get; set; }
        public int Count { get; set; }
        public int TotalDevices { get; set; }
        public List<string>? Errors { get; set; }
    }

    public class MobileDeviceResponse
    {
        public string DeviceId { get; set; } = string.Empty;
        public string DeviceName { get; set; } = string.Empty;
        public string Platform { get; set; } = string.Empty;
        public string PairedAt { get; set; } = string.Empty;
        public string LastSeen { get; set; } = string.Empty;
    }

    public class MobileDevicesApiResponse
    {
        public bool Success { get; set; }
        public List<MobileDeviceResponse> Devices { get; set; } = new();
        public int Count { get; set; }
    }

    public class NotificationStatusResponse
    {
        public bool Authenticated { get; set; }
        public bool NotificationsAvailable { get; set; }
        public bool CloudConnected { get; set; }
        public string Message { get; set; } = string.Empty;
        public string? Error { get; set; }
    }
}