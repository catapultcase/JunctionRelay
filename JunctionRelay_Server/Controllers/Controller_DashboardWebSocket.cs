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
using Microsoft.AspNetCore.Mvc;
using System.Net.WebSockets;

namespace JunctionRelayServer.Controllers
{
    [Route("api/dashboard-websocket")]
    [ApiController]
    public class Controller_DashboardWebSocket : ControllerBase
    {
        private readonly Service_Manager_WebSocket_Server _dashboardWebSocketManager;

        public Controller_DashboardWebSocket(Service_Manager_WebSocket_Server dashboardWebSocketManager)
        {
            _dashboardWebSocketManager = dashboardWebSocketManager;
        }

        // WebSocket endpoint for dashboard connections
        [HttpGet("connect")]
        public async Task ConnectDashboard([FromQuery] string? clientInfo = null)
        {
            try
            {
                if (!HttpContext.WebSockets.IsWebSocketRequest)
                {
                    HttpContext.Response.StatusCode = 400;
                    await HttpContext.Response.WriteAsync("This endpoint only accepts WebSocket connections");
                    return;
                }

                // Get client IP address for logging
                var clientIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";
                var userAgent = HttpContext.Request.Headers.UserAgent.ToString();

                var fullClientInfo = $"{clientInfo ?? "Dashboard"} from {clientIp} ({userAgent})";

                // Console.WriteLine($"[Dashboard WebSocket] Connection request from {fullClientInfo}");

                // Accept the WebSocket connection
                var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();

                // Handle the connection and wait for it to end
                await _dashboardWebSocketManager.HandleDashboardConnectionAsync(webSocket, fullClientInfo);

                // Console.WriteLine($"[Dashboard WebSocket] Connection ended for {fullClientInfo}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Dashboard WebSocket] Error handling connection request: {ex.Message}");
                Console.WriteLine($"[Dashboard WebSocket] Stack trace: {ex.StackTrace}");
            }
        }

        // Get list of currently connected dashboard clients
        [HttpGet("connected")]
        public IActionResult GetConnectedClients()
        {
            try
            {
                var connectedClients = _dashboardWebSocketManager.GetConnectedClients();
                return Ok(new
                {
                    timestamp = DateTime.UtcNow,
                    connectedCount = connectedClients.Count(),
                    clients = connectedClients
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Dashboard WebSocket] Error getting connected clients: {ex.Message}");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        // Trigger manual data refresh to all connected clients
        [HttpPost("refresh")]
        public Task<IActionResult> RefreshAllClients()
        {
            try
            {
                // The service automatically broadcasts updates, but we can trigger immediate refresh
                var connectedClients = _dashboardWebSocketManager.GetConnectedClients();
                var clientCount = connectedClients.Count();

                if (clientCount == 0)
                {
                    return Task.FromResult<IActionResult>(Ok(new
                    {
                        success = true,
                        message = "No clients connected to refresh",
                        clientCount = 0,
                        timestamp = DateTime.UtcNow
                    }));
                }

                // The service will automatically send updates in the next polling cycle
                return Task.FromResult<IActionResult>(Ok(new
                {
                    success = true,
                    message = $"Refresh triggered for {clientCount} connected clients",
                    clientCount = clientCount,
                    timestamp = DateTime.UtcNow
                }));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Dashboard WebSocket] Error refreshing clients: {ex.Message}");
                return Task.FromResult<IActionResult>(StatusCode(500, new { error = "Internal server error", message = ex.Message }));
            }
        }

        // Get dashboard statistics
        [HttpGet("stats")]
        public IActionResult GetDashboardStats()
        {
            try
            {
                var connectedClients = _dashboardWebSocketManager.GetConnectedClients().ToList();

                return Ok(new
                {
                    timestamp = DateTime.UtcNow,
                    totalConnections = connectedClients.Count,
                    activeConnections = connectedClients.Count(c => (bool)c.GetType().GetProperty("IsConnected")!.GetValue(c)!),
                    oldestConnection = connectedClients.Any()
                        ? connectedClients.Min(c => (DateTime)c.GetType().GetProperty("ConnectedAt")!.GetValue(c)!)
                        : (DateTime?)null,
                    newestConnection = connectedClients.Any()
                        ? connectedClients.Max(c => (DateTime)c.GetType().GetProperty("ConnectedAt")!.GetValue(c)!)
                        : (DateTime?)null
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Dashboard WebSocket] Error getting stats: {ex.Message}");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }
    }
}