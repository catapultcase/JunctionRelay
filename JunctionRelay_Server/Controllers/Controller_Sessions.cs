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
using System.Text.Json;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/cloud-auth")]
    public class Controller_Sessions : ControllerBase
    {
        private readonly IConfiguration _configuration;
        private readonly HttpClient _httpClient;

        public Controller_Sessions(
            IConfiguration configuration,
            IHttpClientFactory httpClientFactory)
        {
            _configuration = configuration;
            _httpClient = httpClientFactory.CreateClient();
        }

        [HttpGet("sessions")]
        public async Task<IActionResult> GetUserSessions()
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                Console.WriteLine("Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                return Unauthorized(new { message = "No cloud authentication token provided" });
            }

            var token = authHeader.Substring("Bearer ".Length);

            try
            {
                var sessionsUrl = $"{cloudApiUrl}/api/auth/sessions";
                using var request = new HttpRequestMessage(HttpMethod.Get, sessionsUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"Failed to get user sessions. StatusCode: {response.StatusCode}");
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        return Unauthorized(new { message = "Invalid or expired cloud token" });
                    }
                    return StatusCode((int)response.StatusCode, new { message = "Failed to get user sessions" });
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                Console.WriteLine("Successfully retrieved user sessions.");

                return Ok(json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting user sessions: {ex.Message}");
                return StatusCode(500, new { message = "Failed to get user sessions" });
            }
        }

        [HttpDelete("sessions/{sessionId}")]
        public async Task<IActionResult> RevokeSession(string sessionId)
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                Console.WriteLine("Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                return Unauthorized(new { message = "No cloud authentication token provided" });
            }

            var token = authHeader.Substring("Bearer ".Length);

            try
            {
                var revokeUrl = $"{cloudApiUrl}/api/auth/sessions/{Uri.EscapeDataString(sessionId)}";
                using var request = new HttpRequestMessage(HttpMethod.Delete, revokeUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"Failed to revoke session {sessionId}. StatusCode: {response.StatusCode}");
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        return Unauthorized(new { message = "Invalid or expired cloud token" });
                    }
                    if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                    {
                        return NotFound(new { message = "Session not found" });
                    }
                    return StatusCode((int)response.StatusCode, new { message = "Failed to revoke session" });
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                Console.WriteLine($"Successfully revoked session {sessionId}.");

                return Ok(json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error revoking session {sessionId}: {ex.Message}");
                return StatusCode(500, new { message = "Failed to revoke session" });
            }
        }

        [HttpDelete("sessions")]
        public async Task<IActionResult> RevokeAllOtherSessions()
        {
            var cloudApiUrl = _configuration["JunctionRelayCloud:ApiUrl"];
            if (string.IsNullOrEmpty(cloudApiUrl))
            {
                Console.WriteLine("Cloud API URL not configured.");
                return StatusCode(500, new { message = "Cloud API not configured." });
            }

            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                return Unauthorized(new { message = "No cloud authentication token provided" });
            }

            var token = authHeader.Substring("Bearer ".Length);

            try
            {
                var revokeAllUrl = $"{cloudApiUrl}/api/auth/sessions";
                using var request = new HttpRequestMessage(HttpMethod.Delete, revokeAllUrl);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"Failed to revoke all other sessions. StatusCode: {response.StatusCode}");
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        return Unauthorized(new { message = "Invalid or expired cloud token" });
                    }
                    return StatusCode((int)response.StatusCode, new { message = "Failed to revoke all other sessions" });
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var json = JsonSerializer.Deserialize<JsonElement>(responseContent);
                Console.WriteLine("Successfully revoked all other sessions.");

                return Ok(json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error revoking all other sessions: {ex.Message}");
                return StatusCode(500, new { message = "Failed to revoke all other sessions" });
            }
        }
    }
}