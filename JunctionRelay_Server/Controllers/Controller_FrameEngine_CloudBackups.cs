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

using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Services;
using System.Text.Json;
using System.Text;

namespace JunctionRelayServer.Controllers
{
    /// <summary>
    /// Controller for FrameEngine-enabled cloud backups with manifest-based architecture
    /// </summary>
    [ApiController]
    [Route("api/frameengine/cloud-backups")]
    public class Controller_FrameEngine_CloudBackups : ControllerBase
    {
        private readonly Service_CloudBackups_Manifest _manifestBackupService;
        private readonly Service_CloudSessionStore _cloudSessionStore;
        private readonly Service_BackendIdentity _backendIdentityService;
        private readonly IHttpClientFactory _httpClientFactory;

        public Controller_FrameEngine_CloudBackups(
            Service_CloudBackups_Manifest manifestBackupService,
            Service_CloudSessionStore cloudSessionStore,
            Service_BackendIdentity backendIdentityService,
            IHttpClientFactory httpClientFactory)
        {
            _manifestBackupService = manifestBackupService;
            _cloudSessionStore = cloudSessionStore;
            _backendIdentityService = backendIdentityService;
            _httpClientFactory = httpClientFactory;
        }

        /// <summary>
        /// Creates a cloud backup with FrameEngine manifest (reference-based, no asset duplication)
        /// </summary>
        [HttpPost("create")]
        public async Task<IActionResult> CreateManifestBackup([FromBody] CreateManifestBackupRequest request)
        {
            try
            {
                Console.WriteLine("[FRAMEENGINE_CLOUD_BACKUPS] Creating manifest-based backup for cloud upload...");

                // Create local backup with manifest
                var options = new Service_CloudBackups_Manifest.CloudBackupOptions
                {
                    IncludeKeys = request.IncludeKeys,
                    IncludeIdentity = request.IncludeIdentity,
                    IncludeFrameEngine = request.IncludeFrameEngine
                };

                var backupResult = await _manifestBackupService.CreateCloudBackupAsync(options);
                if (!backupResult.Success || backupResult.BackupData == null)
                {
                    return StatusCode(500, new { error = backupResult.ErrorMessage ?? "Failed to create manifest backup" });
                }

                // Get backend ID
                var backendId = _backendIdentityService.GetBackendId();

                // Request upload URL from cloud
                var uploadRequest = new
                {
                    filename = backupResult.Filename,
                    backendId = backendId,
                    uncompressedSize = backupResult.BackupData.Length,
                    compressedSize = backupResult.BackupData.Length,
                    manifest = backupResult.Manifest
                };

                var requestUploadResult = await CallCloudBackupApiAsync("POST", "/cloud-backups/request-upload", uploadRequest);
                if (!requestUploadResult.Success)
                {
                    return StatusCode(500, new { error = requestUploadResult.ErrorMessage });
                }

                var uploadResponse = JsonSerializer.Deserialize<JsonElement>(requestUploadResult.Data!.ToString()!);
                var backupId = uploadResponse.GetProperty("backupId").GetString();
                var uploadUrl = uploadResponse.GetProperty("uploadUrl").GetString();

                Console.WriteLine($"[FRAMEENGINE_CLOUD_BACKUPS] Got upload URL for backup {backupId}");

                // Upload to S3
                var uploadSuccess = await UploadToS3Async(uploadUrl!, backupResult.BackupData, "application/octet-stream");
                if (!uploadSuccess)
                {
                    return StatusCode(500, new { error = "Failed to upload backup to cloud storage" });
                }

                Console.WriteLine("[FRAMEENGINE_CLOUD_BACKUPS] Successfully uploaded backup to cloud storage");

                // Confirm upload with manifest
                var completeRequest = new
                {
                    backupId = backupId,
                    actualCompressedSize = backupResult.BackupData.Length,
                    manifest = backupResult.Manifest
                };

                var completeResult = await CallCloudBackupApiAsync("POST", "/cloud-backups/complete-upload", completeRequest);
                if (!completeResult.Success)
                {
                    Console.WriteLine($"[FRAMEENGINE_CLOUD_BACKUPS] Warning: Upload completed but failed to confirm: {completeResult.ErrorMessage}");
                }

                Console.WriteLine("[FRAMEENGINE_CLOUD_BACKUPS] Cloud backup with manifest completed successfully");

                return Ok(new
                {
                    success = true,
                    filename = backupResult.Filename,
                    size = backupResult.BackupData.Length,
                    backupId = backupId,
                    manifest = backupResult.Manifest,
                    message = "Manifest-based backup created and uploaded to cloud successfully"
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FRAMEENGINE_CLOUD_BACKUPS] Error creating manifest backup: {ex.Message}");
                return StatusCode(500, new { error = "Failed to create manifest backup for cloud upload" });
            }
        }

        /// <summary>
        /// Gets restore information for a backup including manifest and download URLs
        /// </summary>
        [HttpGet("{backupId}/restore-info")]
        public async Task<IActionResult> GetRestoreInfo(string backupId)
        {
            try
            {
                var result = await CallCloudBackupApiAsync("POST", $"/cloud-backups/{backupId}/restore-info");

                if (result.Success)
                {
                    return Ok(result.Data);
                }
                else if (result.StatusCode == 404)
                {
                    return NotFound(new { error = "Backup not found" });
                }
                else
                {
                    Console.WriteLine($"[FRAMEENGINE_CLOUD_BACKUPS] Failed to get restore info: {result.ErrorMessage}");
                    return StatusCode(500, new { error = result.ErrorMessage });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FRAMEENGINE_CLOUD_BACKUPS] Error getting restore info: {ex.Message}");
                return StatusCode(500, new { error = "Failed to get restore info" });
            }
        }

        private async Task<CloudApiResult> CallCloudBackupApiAsync(string method, string endpoint, object? body = null)
        {
            try
            {
                var token = await _cloudSessionStore.GetValidAccessTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    return new CloudApiResult { Success = false, ErrorMessage = "No valid cloud authentication token" };
                }

                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL") ?? "https://api.junctionrelay.com";
                var fullUrl = $"{cloudBaseUrl.TrimEnd('/')}{endpoint}";

                HttpResponseMessage response;
                if (method.ToUpper() == "GET")
                {
                    response = await httpClient.GetAsync(fullUrl);
                }
                else if (method.ToUpper() == "POST")
                {
                    var json = body != null ? JsonSerializer.Serialize(body, new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                    }) : "{}";

                    var content = new StringContent(json, Encoding.UTF8, "application/json");
                    response = await httpClient.PostAsync(fullUrl, content);
                }
                else
                {
                    return new CloudApiResult { Success = false, ErrorMessage = $"Unsupported HTTP method: {method}" };
                }

                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    var responseData = JsonSerializer.Deserialize<object>(responseContent);
                    return new CloudApiResult { Success = true, Data = responseData };
                }
                else
                {
                    var errorMessage = "Unknown error";
                    try
                    {
                        var errorObj = JsonSerializer.Deserialize<JsonElement>(responseContent);
                        if (errorObj.TryGetProperty("error", out var errorProp))
                        {
                            errorMessage = errorProp.GetString() ?? errorMessage;
                        }
                        else if (errorObj.TryGetProperty("message", out var messageProp))
                        {
                            errorMessage = messageProp.GetString() ?? errorMessage;
                        }
                    }
                    catch
                    {
                        errorMessage = responseContent.Length > 100 ? responseContent.Substring(0, 100) + "..." : responseContent;
                    }

                    return new CloudApiResult
                    {
                        Success = false,
                        ErrorMessage = errorMessage,
                        StatusCode = (int)response.StatusCode
                    };
                }
            }
            catch (Exception ex)
            {
                return new CloudApiResult { Success = false, ErrorMessage = ex.Message };
            }
        }

        private async Task<bool> UploadToS3Async(string uploadUrl, byte[] data, string contentType)
        {
            try
            {
                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.Timeout = TimeSpan.FromMinutes(10);

                using var content = new ByteArrayContent(data);
                content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);

                var response = await httpClient.PutAsync(uploadUrl, content);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FRAMEENGINE_CLOUD_BACKUPS] S3 upload error: {ex.Message}");
                return false;
            }
        }

        public class CreateManifestBackupRequest
        {
            public bool IncludeKeys { get; set; } = true;
            public bool IncludeIdentity { get; set; } = true;
            public bool IncludeFrameEngine { get; set; } = true;
        }

        private class CloudApiResult
        {
            public bool Success { get; set; }
            public object? Data { get; set; }
            public string? ErrorMessage { get; set; }
            public int StatusCode { get; set; }
        }
    }
}
