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

using JunctionRelayServer.Services;
using System;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace JunctionRelayServer.Services.BackgroundServices
{
    public class Service_CloudBackup_Scheduler : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly TimeSpan _checkInterval = TimeSpan.FromMinutes(15); // Check every 15 minutes
        private DateTime? _lastBackupCheck = null;

        public Service_CloudBackup_Scheduler(
            IServiceProvider serviceProvider,
            IHttpClientFactory httpClientFactory)
        {
            _serviceProvider = serviceProvider;
            _httpClientFactory = httpClientFactory;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                Console.WriteLine("[CLOUD_BACKUP] 🚀 Cloud Backup Scheduler initializing...");

                // Wait a bit before starting to ensure other services are ready
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

                Console.WriteLine("[CLOUD_BACKUP] ✅ Cloud Backup Scheduler started");

                while (!stoppingToken.IsCancellationRequested)
                {
                    try
                    {
                        await CheckAndPerformBackupAsync(stoppingToken);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[CLOUD_BACKUP] ❌ Error during backup check: {ex.Message}");
                    }

                    // Wait for next check interval
                    await Task.Delay(_checkInterval, stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                Console.WriteLine("[CLOUD_BACKUP] 🛑 Cloud Backup Scheduler stopping...");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUP] ❌ Fatal error in Cloud Backup Scheduler: {ex.Message}");
                throw;
            }
        }

        private async Task CheckAndPerformBackupAsync(CancellationToken cancellationToken)
        {
            using var scope = _serviceProvider.CreateScope();
            var cloudSessionStore = scope.ServiceProvider.GetRequiredService<Service_CloudSessionStore>();
            var manifestBackupService = scope.ServiceProvider.GetRequiredService<Service_CloudBackups_Manifest>();
            var backendIdentityService = scope.ServiceProvider.GetRequiredService<Service_BackendIdentity>();

            try
            {
                // Get valid access token
                var token = await cloudSessionStore.GetValidAccessTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    // Only log once when first detected as not authenticated
                    if (_lastBackupCheck.HasValue)
                    {
                        Console.WriteLine("[CLOUD_BACKUP] ⏸️ No valid cloud authentication - skipping backup check");
                        _lastBackupCheck = null;
                    }
                    return;
                }

                // Get backend ID to fetch settings for this specific backend
                var backendId = backendIdentityService.GetBackendId();

                // Get backup status from cloud
                var statusResponse = await CallCloudApiAsync("GET", $"/cloud-backups/status?backendId={backendId}", token);
                if (!statusResponse.Success)
                {
                    Console.WriteLine($"[CLOUD_BACKUP] ⚠️ Failed to get backup status: {statusResponse.ErrorMessage}");
                    return;
                }

                var statusData = JsonSerializer.Deserialize<JsonElement>(statusResponse.Data!.ToString()!);

                // Check if user has valid license
                if (!statusData.GetProperty("hasValidLicense").GetBoolean())
                {
                    // Only log once when first detected as unlicensed
                    if (_lastBackupCheck.HasValue)
                    {
                        Console.WriteLine("[CLOUD_BACKUP] ⏸️ No valid Pro license - skipping backup check");
                        _lastBackupCheck = null;
                    }
                    return;
                }

                var settings = statusData.GetProperty("settings");

                // Check if backups are enabled
                if (!settings.GetProperty("enabled").GetBoolean())
                {
                    // Only log once when first detected as disabled
                    if (_lastBackupCheck.HasValue)
                    {
                        Console.WriteLine("[CLOUD_BACKUP] ⏸️ Cloud backups disabled - skipping");
                        _lastBackupCheck = null;
                    }
                    return;
                }

                // Check if it's time for a backup
                if (!ShouldPerformBackup(settings))
                {
                    return;
                }

                var frequency = settings.GetProperty("frequency").GetString() ?? "daily";
                Console.WriteLine($"[CLOUD_BACKUP] 📦 Starting scheduled backup (Frequency: {frequency})");

                // Perform the backup
                var backupResult = await PerformBackupAsync(
                    manifestBackupService,
                    backendIdentityService,
                    token,
                    settings,
                    cancellationToken);

                if (backupResult)
                {
                    Console.WriteLine($"[CLOUD_BACKUP] ✅ Scheduled backup completed successfully");
                    _lastBackupCheck = DateTime.UtcNow;
                }
                else
                {
                    Console.WriteLine($"[CLOUD_BACKUP] ❌ Scheduled backup failed");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUP] ❌ Error checking/performing backup: {ex.Message}");
            }
        }

        private bool ShouldPerformBackup(JsonElement settings)
        {
            try
            {
                string? lastBackupStr = settings.TryGetProperty("lastBackup", out var lastBackupProp) &&
                                       lastBackupProp.ValueKind != JsonValueKind.Null
                    ? lastBackupProp.GetString()
                    : null;

                string frequency = settings.GetProperty("frequency").GetString()?.ToLower() ?? "daily";

                // If no previous backup, perform one now
                if (string.IsNullOrEmpty(lastBackupStr))
                {
                    Console.WriteLine("[CLOUD_BACKUP] 📋 No previous backup found - scheduling backup");
                    return true;
                }

                var lastBackup = DateTime.Parse(lastBackupStr);
                var timeSinceLastBackup = DateTime.UtcNow - lastBackup;

                bool shouldBackup = frequency switch
                {
                    "daily" => timeSinceLastBackup.TotalHours >= 24,
                    "weekly" => timeSinceLastBackup.TotalDays >= 7,
                    "monthly" => timeSinceLastBackup.TotalDays >= 30,
                    _ => false
                };

                if (shouldBackup)
                {
                    Console.WriteLine($"[CLOUD_BACKUP] ⏰ Backup due (Last: {lastBackup:yyyy-MM-dd HH:mm:ss} UTC, Elapsed: {timeSinceLastBackup.TotalHours:F1}h)");
                }

                return shouldBackup;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUP] ⚠️ Error determining backup schedule: {ex.Message}");
                return false;
            }
        }

        private async Task<bool> PerformBackupAsync(
            Service_CloudBackups_Manifest manifestBackupService,
            Service_BackendIdentity backendIdentityService,
            string token,
            JsonElement settings,
            CancellationToken cancellationToken)
        {
            try
            {
                // Get backup options from settings
                var includeKeys = settings.TryGetProperty("includeKeys", out var keysProp) ?
                    keysProp.GetBoolean() : true;
                var includeIdentity = settings.TryGetProperty("includeIdentity", out var identityProp) ?
                    identityProp.GetBoolean() : true;
                var includeFrameEngine = settings.TryGetProperty("includeFrameEngine", out var frameEngineProp) ?
                    frameEngineProp.GetBoolean() : false;

                var options = new Service_CloudBackups_Manifest.CloudBackupOptions
                {
                    IncludeKeys = includeKeys,
                    IncludeIdentity = includeIdentity,
                    IncludeFrameEngine = includeFrameEngine,
                    ProgressCallback = null  // Scheduler doesn't have UI progress tracking
                };

                // Create cloud backup with manifest
                var backupType = includeFrameEngine ? "manifest-based backup with FrameEngine" : "traditional backup";
                Console.WriteLine($"[CLOUD_BACKUP] 📦 Creating {backupType}...");

                var backupResult = await manifestBackupService.CreateCloudBackupAsync(options);
                if (!backupResult.Success || backupResult.BackupData == null)
                {
                    Console.WriteLine($"[CLOUD_BACKUP] ❌ Failed to create cloud backup: {backupResult.ErrorMessage}");
                    return false;
                }

                Console.WriteLine($"[CLOUD_BACKUP] ✅ Cloud backup created: {backupResult.Filename} ({backupResult.BackupData.Length} bytes)");

                // Get backend ID
                var backendId = backendIdentityService.GetBackendId();

                // Request upload URL from cloud
                var uploadRequest = new
                {
                    filename = backupResult.Filename,
                    backendId = backendId,
                    uncompressedSize = backupResult.BackupData.Length,
                    compressedSize = backupResult.BackupData.Length,
                    manifest = backupResult.Manifest  // Include manifest if available
                };

                var requestUploadResult = await CallCloudApiAsync("POST", "/cloud-backups/request-upload", token, uploadRequest);
                if (!requestUploadResult.Success)
                {
                    Console.WriteLine($"[CLOUD_BACKUP] ❌ Failed to request upload URL: {requestUploadResult.ErrorMessage}");
                    return false;
                }

                var uploadResponse = JsonSerializer.Deserialize<JsonElement>(requestUploadResult.Data!.ToString()!);
                var backupId = uploadResponse.GetProperty("backupId").GetString();
                var uploadUrl = uploadResponse.GetProperty("uploadUrl").GetString();

                Console.WriteLine($"[CLOUD_BACKUP] 🔗 Got upload URL for backup {backupId}");

                // Upload to S3
                var uploadSuccess = await UploadToS3Async(uploadUrl!, backupResult.BackupData, "application/octet-stream");
                if (!uploadSuccess)
                {
                    Console.WriteLine("[CLOUD_BACKUP] ❌ Failed to upload backup to cloud storage");
                    return false;
                }

                Console.WriteLine("[CLOUD_BACKUP] ✅ Successfully uploaded backup to cloud storage");

                // Confirm upload completion
                var completeRequest = new
                {
                    backupId = backupId,
                    actualCompressedSize = backupResult.BackupData.Length,
                    manifest = backupResult.Manifest  // Include manifest in completion
                };

                var completeResult = await CallCloudApiAsync("POST", "/cloud-backups/complete-upload", token, completeRequest);
                if (!completeResult.Success)
                {
                    Console.WriteLine($"[CLOUD_BACKUP] ⚠️ Upload completed but failed to confirm: {completeResult.ErrorMessage}");
                    // Don't return false here - the backup was uploaded successfully
                }

                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUP] ❌ Error performing backup: {ex.Message}");
                return false;
            }
        }

        private async Task<CloudApiResult> CallCloudApiAsync(string method, string endpoint, string token, object? body = null)
        {
            try
            {
                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL") ?? "https://api.junctionrelay.com";
                var fullUrl = $"{cloudBaseUrl.TrimEnd('/')}{endpoint}";

                HttpResponseMessage response;
                if (method.ToUpper() == "GET")
                {
                    response = await httpClient.GetAsync(fullUrl);
                }
                else if (method.ToUpper() == "DELETE")
                {
                    response = await httpClient.DeleteAsync(fullUrl);
                }
                else
                {
                    var json = body != null ? JsonSerializer.Serialize(body) : "{}";
                    var content = new StringContent(json, Encoding.UTF8, "application/json");

                    if (method.ToUpper() == "POST")
                    {
                        response = await httpClient.PostAsync(fullUrl, content);
                    }
                    else if (method.ToUpper() == "PUT")
                    {
                        response = await httpClient.PutAsync(fullUrl, content);
                    }
                    else
                    {
                        return new CloudApiResult { Success = false, ErrorMessage = $"Unsupported HTTP method: {method}" };
                    }
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
                httpClient.Timeout = TimeSpan.FromMinutes(10); // Longer timeout for large uploads

                using var content = new ByteArrayContent(data);
                content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);

                var response = await httpClient.PutAsync(uploadUrl, content);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUP] ❌ S3 upload error: {ex.Message}");
                return false;
            }
        }

        public override async Task StopAsync(CancellationToken cancellationToken)
        {
            Console.WriteLine("[CLOUD_BACKUP] 🛑 Cloud Backup Scheduler shutting down...");
            await base.StopAsync(cancellationToken);
            Console.WriteLine("[CLOUD_BACKUP] ✅ Cloud Backup Scheduler shutdown complete");
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