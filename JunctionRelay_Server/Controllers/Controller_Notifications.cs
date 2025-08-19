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
using JunctionRelayServer.Models;
using System.Data;
using Dapper;

namespace JunctionRelayServer.Controllers
{
    [Route("api/notifications")]
    [ApiController]
    public class Controller_Notifications : ControllerBase
    {
        private readonly IDbConnection _dbConnection;

        public Controller_Notifications(IDbConnection dbConnection)
        {
            _dbConnection = dbConnection;
        }

        // GET: api/notifications/pending - UPDATED with auto-cleanup
        [HttpGet("pending")]
        public async Task<IActionResult> GetPendingNotifications([FromQuery] string? since = null)
        {
            try
            {
                // First, clean up expired notifications
                var expiredCount = await CleanupExpiredNotificationsAsync();
                if (expiredCount > 0)
                {
                    Console.WriteLine($"[NOTIFICATIONS] 🗑️ Auto-expired {expiredCount} notification(s) during API call");
                }

                string sql;
                object parameters;

                if (!string.IsNullOrEmpty(since))
                {
                    if (DateTime.TryParse(since, out DateTime sinceTime))
                    {
                        sql = @"
                            SELECT * FROM Notifications 
                            WHERE IsDelivered = 0 
                            AND (ExpiresAt IS NULL OR ExpiresAt > @Now)
                            AND CreatedAt > @SinceTime 
                            ORDER BY CreatedAt ASC 
                            LIMIT 50";
                        parameters = new { SinceTime = sinceTime, Now = DateTime.UtcNow };
                    }
                    else
                    {
                        sql = @"
                            SELECT * FROM Notifications 
                            WHERE IsDelivered = 0 
                            AND (ExpiresAt IS NULL OR ExpiresAt > @Now)
                            ORDER BY CreatedAt ASC 
                            LIMIT 50";
                        parameters = new { Now = DateTime.UtcNow };
                    }
                }
                else
                {
                    sql = @"
                        SELECT * FROM Notifications 
                        WHERE IsDelivered = 0 
                        AND (ExpiresAt IS NULL OR ExpiresAt > @Now)
                        ORDER BY CreatedAt ASC 
                        LIMIT 50";
                    parameters = new { Now = DateTime.UtcNow };
                }

                var notifications = await _dbConnection.QueryAsync<Model_Notifications>(sql, parameters);
                var notificationList = notifications.ToList();

                // Mark notifications as delivered
                if (notificationList.Any())
                {
                    var ids = notificationList.Select(n => n.Id).ToArray();
                    var updateSql = "UPDATE Notifications SET IsDelivered = 1, DeliveredAt = @DeliveredAt WHERE Id IN @Ids";
                    await _dbConnection.ExecuteAsync(updateSql, new { DeliveredAt = DateTime.UtcNow, Ids = ids });
                }

                string? lastTimestamp = notificationList.LastOrDefault()?.CreatedAt.ToString("O");

                var response = new
                {
                    notifications = notificationList.Select(n => new
                    {
                        id = n.Id,
                        type = n.Type,
                        message = n.Message,
                        title = n.Title,
                        category = n.Category,
                        duration = n.Duration,
                        persistent = n.Persistent,
                        timestamp = n.CreatedAt,
                        expiresAt = n.ExpiresAt // Include expiry info for frontend
                    }),
                    lastTimestamp = lastTimestamp,
                    expiredCount = expiredCount // Let frontend know how many were cleaned up
                };

                return Ok(response);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Database error: {ex.Message}");
            }
        }

        // POST: api/notifications - UPDATED to support expiry
        [HttpPost]
        public async Task<IActionResult> CreateNotification([FromBody] CreateNotificationRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Message))
            {
                return BadRequest("Notification message is required.");
            }

            var notification = new Model_Notifications
            {
                Id = Guid.NewGuid().ToString(),
                Type = request.Type ?? "info",
                Message = request.Message,
                Title = request.Title,
                Category = request.Category ?? "system",
                Duration = request.Duration,
                Persistent = request.Persistent,
                CreatedAt = DateTime.UtcNow,
                IsDelivered = false,
                ExpiresAt = request.ExpiresAt // Support expiry in API
            };

            var sql = @"
                INSERT INTO Notifications 
                (Id, Type, Message, Title, Category, Duration, Persistent, CreatedAt, IsDelivered, ExpiresAt) 
                VALUES 
                (@Id, @Type, @Message, @Title, @Category, @Duration, @Persistent, @CreatedAt, @IsDelivered, @ExpiresAt)";

            try
            {
                await _dbConnection.ExecuteAsync(sql, notification);
                return CreatedAtAction(nameof(GetNotification), new { id = notification.Id }, notification);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Database error: {ex.Message}");
            }
        }

        // GET: api/notifications/{id}
        [HttpGet("{id}")]
        public async Task<IActionResult> GetNotification(string id)
        {
            var notification = await _dbConnection.QuerySingleOrDefaultAsync<Model_Notifications>(
                "SELECT * FROM Notifications WHERE Id = @Id", new { Id = id });

            if (notification == null) return NotFound();

            return Ok(notification);
        }

        // GET: api/notifications/history
        [HttpGet("history")]
        public async Task<IActionResult> GetNotificationHistory([FromQuery] int limit = 100, [FromQuery] int offset = 0)
        {
            try
            {
                var sql = @"
                    SELECT * FROM Notifications 
                    ORDER BY CreatedAt DESC 
                    LIMIT @Limit OFFSET @Offset";

                var notifications = await _dbConnection.QueryAsync<Model_Notifications>(sql, new { Limit = limit, Offset = offset });

                return Ok(notifications);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Database error: {ex.Message}");
            }
        }

        // DELETE: api/notifications/cleanup - UPDATED with expiry consideration
        [HttpDelete("cleanup")]
        public async Task<IActionResult> CleanupOldNotifications([FromQuery] int daysOld = 30)
        {
            try
            {
                var cutoffDate = DateTime.UtcNow.AddDays(-daysOld);
                var sql = @"
                    DELETE FROM Notifications 
                    WHERE (CreatedAt < @CutoffDate AND IsDelivered = 1)
                    OR (ExpiresAt IS NOT NULL AND ExpiresAt <= @Now)";

                int deletedCount = await _dbConnection.ExecuteAsync(sql, new
                {
                    CutoffDate = cutoffDate,
                    Now = DateTime.UtcNow
                });

                return Ok(new
                {
                    deletedCount = deletedCount,
                    message = $"Cleaned up {deletedCount} old and expired notifications"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Database error: {ex.Message}");
            }
        }

        // NEW: DELETE: api/notifications/expired - Manual cleanup endpoint
        [HttpDelete("expired")]
        public async Task<IActionResult> CleanupExpiredNotifications()
        {
            try
            {
                var deletedCount = await CleanupExpiredNotificationsAsync();
                return Ok(new
                {
                    deletedCount = deletedCount,
                    message = $"Cleaned up {deletedCount} expired notifications"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Database error: {ex.Message}");
            }
        }

        // POST: api/notifications/health-report-sent - UPDATED with auto-expiry
        [HttpPost("health-report-sent")]
        public async Task<IActionResult> NotifyHealthReportSent([FromBody] object? details = null)
        {
            var notification = new Model_Notifications
            {
                Id = Guid.NewGuid().ToString(),
                Type = "success",
                Message = "Health report sent successfully to cloud backend",
                Title = "Cloud Sync Complete",
                Category = "cloud",
                CreatedAt = DateTime.UtcNow,
                IsDelivered = false,
                ExpiresAt = DateTime.UtcNow.AddSeconds(60) // AUTO-EXPIRE in 60 seconds
            };

            var sql = @"
                INSERT INTO Notifications 
                (Id, Type, Message, Title, Category, Duration, Persistent, CreatedAt, IsDelivered, ExpiresAt) 
                VALUES 
                (@Id, @Type, @Message, @Title, @Category, @Duration, @Persistent, @CreatedAt, @IsDelivered, @ExpiresAt)";

            try
            {
                await _dbConnection.ExecuteAsync(sql, notification);
                return Ok(new { message = "Health report notification queued", notificationId = notification.Id });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Database error: {ex.Message}");
            }
        }

        // POST: api/notifications/system-update - UPDATED with auto-expiry
        [HttpPost("system-update")]
        public async Task<IActionResult> NotifySystemUpdate([FromBody] SystemUpdateRequest request)
        {
            var notification = new Model_Notifications
            {
                Id = Guid.NewGuid().ToString(),
                Type = request.Type ?? "info",
                Message = request.Message ?? "System update available",
                Title = request.Title ?? "System Update",
                Category = "system",
                CreatedAt = DateTime.UtcNow,
                IsDelivered = false,
                ExpiresAt = request.ExpiresAt ?? DateTime.UtcNow.AddHours(24) // Default: expire in 24 hours
            };

            var sql = @"
                INSERT INTO Notifications 
                (Id, Type, Message, Title, Category, Duration, Persistent, CreatedAt, IsDelivered, ExpiresAt) 
                VALUES 
                (@Id, @Type, @Message, @Title, @Category, @Duration, @Persistent, @CreatedAt, @IsDelivered, @ExpiresAt)";

            try
            {
                await _dbConnection.ExecuteAsync(sql, notification);
                return Ok(new { message = "System update notification queued", notificationId = notification.Id });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Database error: {ex.Message}");
            }
        }

        // NEW: POST: api/notifications/health-report-failed
        [HttpPost("health-report-failed")]
        public async Task<IActionResult> NotifyHealthReportFailed([FromBody] HealthReportFailedRequest request)
        {
            var notification = new Model_Notifications
            {
                Id = Guid.NewGuid().ToString(),
                Type = "error",
                Message = request.Error ?? "Failed to send health report to cloud backend",
                Title = "Cloud Sync Failed",
                Category = "cloud",
                CreatedAt = DateTime.UtcNow,
                IsDelivered = false,
                ExpiresAt = DateTime.UtcNow.AddMinutes(10) // Keep failures for 10 minutes
            };

            var sql = @"
                INSERT INTO Notifications 
                (Id, Type, Message, Title, Category, Duration, Persistent, CreatedAt, IsDelivered, ExpiresAt) 
                VALUES 
                (@Id, @Type, @Message, @Title, @Category, @Duration, @Persistent, @CreatedAt, @IsDelivered, @ExpiresAt)";

            try
            {
                await _dbConnection.ExecuteAsync(sql, notification);
                return Ok(new { message = "Health report failure notification queued", notificationId = notification.Id });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Database error: {ex.Message}");
            }
        }

        // NEW: POST: api/notifications/auth-event
        [HttpPost("auth-event")]
        public async Task<IActionResult> NotifyAuthEvent([FromBody] AuthEventRequest request)
        {
            string message;
            string title;
            string type;
            DateTime? expiresAt = null;
            bool persistent = false;

            switch (request.EventType?.ToLower())
            {
                case "login":
                    message = request.Message ?? $"User '{request.Username}' signed in successfully";
                    title = "Authentication";
                    type = "success";
                    expiresAt = DateTime.UtcNow.AddMinutes(30);
                    break;

                case "logout":
                    message = request.Message ?? $"User '{request.Username}' signed out";
                    title = "Authentication";
                    type = "info";
                    expiresAt = DateTime.UtcNow.AddMinutes(15);
                    break;

                case "failure":
                    message = request.Message ?? request.Reason ?? "Authentication failed";
                    title = "Authentication Failed";
                    type = "error";
                    persistent = true; // Security issues don't expire
                    break;

                case "expired":
                    message = request.Message ?? "Your session has expired. Please sign in again.";
                    title = "Session Expired";
                    type = "warning";
                    persistent = true; // Security issues don't expire
                    break;

                default:
                    message = request.Message ?? "Authentication event occurred";
                    title = "Authentication";
                    type = "info";
                    expiresAt = DateTime.UtcNow.AddMinutes(15);
                    break;
            }

            var notification = new Model_Notifications
            {
                Id = Guid.NewGuid().ToString(),
                Type = type,
                Message = message,
                Title = title,
                Category = "auth",
                CreatedAt = DateTime.UtcNow,
                IsDelivered = false,
                Persistent = persistent,
                ExpiresAt = persistent ? null : (request.ExpiresAt ?? expiresAt)
            };

            var sql = @"
                INSERT INTO Notifications 
                (Id, Type, Message, Title, Category, Duration, Persistent, CreatedAt, IsDelivered, ExpiresAt) 
                VALUES 
                (@Id, @Type, @Message, @Title, @Category, @Duration, @Persistent, @CreatedAt, @IsDelivered, @ExpiresAt)";

            try
            {
                await _dbConnection.ExecuteAsync(sql, notification);
                return Ok(new { message = "Authentication event notification queued", notificationId = notification.Id });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Database error: {ex.Message}");
            }
        }

        // Helper method for expiry cleanup
        private async Task<int> CleanupExpiredNotificationsAsync()
        {
            var sql = "DELETE FROM Notifications WHERE ExpiresAt IS NOT NULL AND ExpiresAt <= @Now";
            return await _dbConnection.ExecuteAsync(sql, new { Now = DateTime.UtcNow });
        }
    }

    // UPDATED: Request models with expiry support
    public class CreateNotificationRequest
    {
        public string Message { get; set; } = string.Empty;
        public string? Type { get; set; }
        public string? Title { get; set; }
        public string? Category { get; set; }
        public int? Duration { get; set; }
        public bool Persistent { get; set; }
        public DateTime? ExpiresAt { get; set; } // NEW: Support expiry in API
    }

    public class SystemUpdateRequest
    {
        public string? Type { get; set; }
        public string? Message { get; set; }
        public string? Title { get; set; }
        public string? Version { get; set; }
        public DateTime? ExpiresAt { get; set; } // NEW: Support expiry
    }

    public class AuthEventRequest
    {
        public string? EventType { get; set; } // login, logout, failure, expired
        public string? Username { get; set; }
        public string? Reason { get; set; }
        public string? Message { get; set; }
        public DateTime? ExpiresAt { get; set; } // NEW: Support expiry
    }

    // NEW: Request model for health report failures
    public class HealthReportFailedRequest
    {
        public string? Error { get; set; }
        public string? Details { get; set; }
    }
}