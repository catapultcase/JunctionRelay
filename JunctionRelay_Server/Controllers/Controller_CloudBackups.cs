using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Services;
using System.Text.Json;
using System.Text;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/cloud-backups")]
    public class Controller_CloudBackups : ControllerBase
    {
        private readonly Service_Backups _backupService;
        private readonly Service_CloudSessionStore _cloudSessionStore;
        private readonly Service_BackendIdentity _backendIdentityService;
        private readonly IHttpClientFactory _httpClientFactory;

        public Controller_CloudBackups(
            Service_Backups backupService,
            Service_CloudSessionStore cloudSessionStore,
            Service_BackendIdentity backendIdentityService,
            IHttpClientFactory httpClientFactory)
        {
            _backupService = backupService;
            _cloudSessionStore = cloudSessionStore;
            _backendIdentityService = backendIdentityService;
            _httpClientFactory = httpClientFactory;
        }

        [HttpGet("status")]
        public async Task<IActionResult> GetBackupStatus()
        {
            try
            {
                var result = await CallCloudBackupApiAsync("GET", "/cloud-backups/status");

                if (result.Success)
                {
                    return Ok(result.Data);
                }
                else
                {
                    Console.WriteLine($"[CLOUD_BACKUPS] Failed to get status: {result.ErrorMessage}");
                    return StatusCode(500, new { error = result.ErrorMessage });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error getting backup status: {ex.Message}");
                return StatusCode(500, new { error = "Failed to get backup status" });
            }
        }

        [HttpPost("settings")]
        public async Task<IActionResult> UpdateBackupSettings([FromBody] BackupSettingsRequest request)
        {
            try
            {
                var result = await CallCloudBackupApiAsync("POST", "/cloud-backups/settings", request);

                if (result.Success)
                {
                    return Ok(result.Data);
                }
                else
                {
                    Console.WriteLine($"[CLOUD_BACKUPS] Failed to update settings: {result.ErrorMessage}");
                    return StatusCode(500, new { error = result.ErrorMessage });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error updating backup settings: {ex.Message}");
                return StatusCode(500, new { error = "Failed to update backup settings" });
            }
        }

        [HttpPost("create")]
        public async Task<IActionResult> CreateBackup([FromBody] CreateCloudBackupRequest request)
        {
            try
            {
                Console.WriteLine("[CLOUD_BACKUPS] Creating backup for cloud upload...");

                // Create local backup
                var options = new Service_Backups.BackupOptions
                {
                    IncludeKeys = request.IncludeKeys,
                    IncludeIdentity = request.IncludeIdentity,
                    IncludeFrameEngine = request.IncludeFrameEngine
                };

                var backupResult = await _backupService.CreateBackupAsync(options);
                if (!backupResult.Success || backupResult.BackupData == null)
                {
                    return StatusCode(500, new { error = backupResult.ErrorMessage ?? "Failed to create local backup" });
                }

                // Get backend ID
                var backendId = _backendIdentityService.GetBackendId();

                // Request upload URL from cloud
                var uploadRequest = new
                {
                    filename = backupResult.Filename,
                    backendId = backendId,
                    uncompressedSize = backupResult.BackupData.Length,
                    compressedSize = backupResult.BackupData.Length
                };

                var requestUploadResult = await CallCloudBackupApiAsync("POST", "/cloud-backups/request-upload", uploadRequest);
                if (!requestUploadResult.Success)
                {
                    return StatusCode(500, new { error = requestUploadResult.ErrorMessage });
                }

                var uploadResponse = JsonSerializer.Deserialize<JsonElement>(requestUploadResult.Data!.ToString()!);
                var backupId = uploadResponse.GetProperty("backupId").GetString();
                var uploadUrl = uploadResponse.GetProperty("uploadUrl").GetString();

                Console.WriteLine($"[CLOUD_BACKUPS] Got upload URL for backup {backupId}");

                // Upload to S3 (use application/octet-stream to match presigned URL)
                var uploadSuccess = await UploadToS3Async(uploadUrl!, backupResult.BackupData, "application/octet-stream");
                if (!uploadSuccess)
                {
                    return StatusCode(500, new { error = "Failed to upload backup to cloud storage" });
                }

                Console.WriteLine("[CLOUD_BACKUPS] Successfully uploaded backup to cloud storage");

                // Confirm upload
                var completeRequest = new
                {
                    backupId = backupId,
                    actualCompressedSize = backupResult.BackupData.Length
                };

                var completeResult = await CallCloudBackupApiAsync("POST", "/cloud-backups/complete-upload", completeRequest);
                if (!completeResult.Success)
                {
                    Console.WriteLine($"[CLOUD_BACKUPS] Warning: Upload completed but failed to confirm: {completeResult.ErrorMessage}");
                }

                Console.WriteLine("[CLOUD_BACKUPS] Cloud backup completed successfully");

                return Ok(new
                {
                    success = true,
                    filename = backupResult.Filename,
                    size = backupResult.BackupData.Length,
                    backupId = backupId,
                    message = "Backup created and uploaded to cloud successfully"
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error creating cloud backup: {ex.Message}");
                return StatusCode(500, new { error = "Failed to create backup for cloud upload" });
            }
        }

        [HttpGet("{backupId}/download")]
        public async Task<IActionResult> DownloadBackup(string backupId)
        {
            try
            {
                // First get the download URL from the cloud API
                var result = await CallCloudBackupApiAsync("POST", $"/cloud-backups/{backupId}/request-download");

                if (!result.Success)
                {
                    if (result.StatusCode == 404)
                    {
                        return NotFound(new { error = "Backup not found" });
                    }
                    Console.WriteLine($"[CLOUD_BACKUPS] Failed to request download: {result.ErrorMessage}");
                    return StatusCode(500, new { error = result.ErrorMessage });
                }

                var downloadResponse = JsonSerializer.Deserialize<JsonElement>(result.Data!.ToString()!);
                var downloadUrl = downloadResponse.GetProperty("downloadUrl").GetString();
                var filename = downloadResponse.GetProperty("filename").GetString();

                // Download the file from S3 and stream it back to the client
                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.Timeout = TimeSpan.FromMinutes(10);

                var fileResponse = await httpClient.GetAsync(downloadUrl);
                if (!fileResponse.IsSuccessStatusCode)
                {
                    return StatusCode(500, new { error = "Failed to download backup from cloud storage" });
                }

                var fileStream = await fileResponse.Content.ReadAsStreamAsync();

                return File(fileStream, "application/zip", filename);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error downloading backup: {ex.Message}");
                return StatusCode(500, new { error = "Failed to download backup" });
            }
        }

        [HttpGet("list")]
        public async Task<IActionResult> ListBackups([FromQuery] int limit = 50)
        {
            try
            {
                var result = await CallCloudBackupApiAsync("GET", $"/cloud-backups/list?limit={limit}");

                if (result.Success)
                {
                    return Ok(result.Data);
                }
                else
                {
                    Console.WriteLine($"[CLOUD_BACKUPS] Failed to list backups: {result.ErrorMessage}");
                    return StatusCode(500, new { error = result.ErrorMessage });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error listing backups: {ex.Message}");
                return StatusCode(500, new { error = "Failed to list backups" });
            }
        }

        [HttpPost("{backupId}/request-download")]
        public async Task<IActionResult> RequestDownload(string backupId)
        {
            try
            {
                var result = await CallCloudBackupApiAsync("POST", $"/cloud-backups/{backupId}/request-download");

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
                    Console.WriteLine($"[CLOUD_BACKUPS] Failed to request download: {result.ErrorMessage}");
                    return StatusCode(500, new { error = result.ErrorMessage });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error requesting download: {ex.Message}");
                return StatusCode(500, new { error = "Failed to request download" });
            }
        }

        [HttpDelete("{backupId}")]
        public async Task<IActionResult> DeleteBackup(string backupId)
        {
            try
            {
                var result = await CallCloudBackupApiAsync("DELETE", $"/cloud-backups/{backupId}");

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
                    Console.WriteLine($"[CLOUD_BACKUPS] Failed to delete backup: {result.ErrorMessage}");
                    return StatusCode(500, new { error = result.ErrorMessage });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error deleting backup: {ex.Message}");
                return StatusCode(500, new { error = "Failed to delete backup" });
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
                Console.WriteLine($"[CLOUD_BACKUPS] S3 upload error: {ex.Message}");
                return false;
            }
        }

        public class CreateCloudBackupRequest
        {
            public bool IncludeKeys { get; set; } = true;
            public bool IncludeIdentity { get; set; } = true;
            public bool IncludeFrameEngine { get; set; } = false;
        }

        public class BackupSettingsRequest
        {
            public bool Enabled { get; set; }
            public string Frequency { get; set; } = "daily";
            public int RetentionDays { get; set; } = 30;
            public bool? IncludeKeys { get; set; }
            public bool? IncludeIdentity { get; set; }
            public bool? IncludeFrameEngine { get; set; }
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