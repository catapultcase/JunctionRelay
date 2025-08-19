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
using System.Data;
using Dapper;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Notifications : BackgroundService
    {
        private readonly IDbConnection _dbConnection;

        public Service_Notifications(IDbConnection dbConnection)
        {
            _dbConnection = dbConnection;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            Console.WriteLine("[NOTIFICATIONS] ✅ Notification service started");

            // Background service for periodic tasks
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);

                // Periodic cleanup of old notifications
                try
                {
                    await CleanupExpiredNotificationsAsync();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[NOTIFICATIONS] ⚠️ Error during periodic cleanup: {ex.Message}");
                }
            }

            Console.WriteLine("[NOTIFICATIONS] ⛔ Notification service stopping...");
        }

        public override void Dispose()
        {
            base.Dispose();
        }

        // Enhanced core method with structured content support
        public async Task<string> CreateNotificationAsync(
            string message,
            string? title = null,
            NotificationType type = NotificationType.Info,
            NotificationCategory category = NotificationCategory.System,
            int? duration = null,
            bool persistent = false,
            DateTime? expiresAt = null,
            object? structuredContent = null)
        {
            if (string.IsNullOrWhiteSpace(message))
            {
                throw new ArgumentException("Notification message cannot be empty", nameof(message));
            }

            var notification = new Model_Notifications
            {
                Id = Guid.NewGuid().ToString(),
                Type = type.ToString().ToLower(),
                Message = message,
                Title = title,
                Category = category.ToString().ToLower(),
                Duration = duration,
                Persistent = persistent,
                CreatedAt = DateTime.UtcNow,
                IsDelivered = false,
                ExpiresAt = expiresAt,
                StructuredContent = structuredContent != null ? JsonSerializer.Serialize(structuredContent) : null
            };

            var sql = @"
                INSERT INTO Notifications 
                (Id, Type, Message, Title, Category, Duration, Persistent, CreatedAt, IsDelivered, ExpiresAt, StructuredContent) 
                VALUES 
                (@Id, @Type, @Message, @Title, @Category, @Duration, @Persistent, @CreatedAt, @IsDelivered, @ExpiresAt, @StructuredContent)";

            await _dbConnection.ExecuteAsync(sql, notification);
            return notification.Id;
        }

        // Enhanced GetPendingNotificationsAsync with structured content
        public async Task<(List<Model_Notifications> notifications, string? lastTimestamp)> GetPendingNotificationsAsync(DateTime? since = null)
        {
            // First, clean up expired notifications
            await CleanupExpiredNotificationsAsync();

            string sql;
            object parameters;

            if (since.HasValue)
            {
                sql = @"
                    SELECT * FROM Notifications 
                    WHERE IsDelivered = 0 
                    AND (ExpiresAt IS NULL OR ExpiresAt > @Now)
                    AND CreatedAt > @SinceTime 
                    ORDER BY CreatedAt ASC 
                    LIMIT 50";
                parameters = new { SinceTime = since.Value, Now = DateTime.UtcNow };
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
            return (notificationList, lastTimestamp);
        }

        // Clean up expired notifications
        public async Task<int> CleanupExpiredNotificationsAsync()
        {
            var sql = "DELETE FROM Notifications WHERE ExpiresAt IS NOT NULL AND ExpiresAt <= @Now";
            var deletedCount = await _dbConnection.ExecuteAsync(sql, new { Now = DateTime.UtcNow });

            if (deletedCount > 0)
            {
                Console.WriteLine($"[NOTIFICATIONS] 🗑️ Auto-expired {deletedCount} notification(s)");
            }

            return deletedCount;
        }

        // Get a specific notification by ID
        public async Task<Model_Notifications?> GetNotificationByIdAsync(string id)
        {
            return await _dbConnection.QuerySingleOrDefaultAsync<Model_Notifications>(
                "SELECT * FROM Notifications WHERE Id = @Id", new { Id = id });
        }

        // Get notification history
        public async Task<List<Model_Notifications>> GetNotificationHistoryAsync(int limit = 100, int offset = 0)
        {
            var sql = @"
                SELECT * FROM Notifications 
                ORDER BY CreatedAt DESC 
                LIMIT @Limit OFFSET @Offset";

            var notifications = await _dbConnection.QueryAsync<Model_Notifications>(sql, new { Limit = limit, Offset = offset });
            return notifications.ToList();
        }

        // Enhanced cleanup with expiry consideration
        public async Task<int> CleanupOldNotificationsAsync(int daysOld = 30)
        {
            var cutoffDate = DateTime.UtcNow.AddDays(-daysOld);
            var sql = @"
                DELETE FROM Notifications 
                WHERE (CreatedAt < @CutoffDate AND IsDelivered = 1)
                OR (ExpiresAt IS NOT NULL AND ExpiresAt <= @Now)";

            var deletedCount = await _dbConnection.ExecuteAsync(sql, new { CutoffDate = cutoffDate, Now = DateTime.UtcNow });
            return deletedCount;
        }

        // Health Report Notifications with detailed breakdown
        public async Task<string> NotifyHealthReportSentAsync(int totalDevices, int onlineDevices, int offlineDevices, string? additionalDetails = null)
        {
            var timestamp = DateTime.Now.ToString("h:mm tt");
            var title = $"Cloud Sync Complete ({timestamp})";

            var structuredContent = new
            {
                type = "health_report",
                summary = $"Health report sent: {totalDevices} devices",
                details = new[]
                {
                    new { label = "Online", value = onlineDevices, color = "success" },
                    new { label = "Offline", value = offlineDevices, color = offlineDevices > 0 ? "warning" : "muted" }
                },
                additionalInfo = additionalDetails
            };

            var message = $"Health report sent: {totalDevices} devices";

            return await CreateNotificationAsync(
                message,
                title,
                NotificationType.Success,
                NotificationCategory.Cloud,
                expiresAt: DateTime.UtcNow.AddSeconds(60),
                structuredContent: structuredContent
            );
        }

        public async Task<string> NotifyHealthReportFailedAsync(string? error = null, int? attemptedDeviceCount = null)
        {
            var timestamp = DateTime.Now.ToString("h:mm tt");
            var title = $"Cloud Sync Failed ({timestamp})";

            var structuredContent = new
            {
                type = "health_report_error",
                summary = "Failed to send health report to cloud backend",
                details = new[]
                {
                    new { label = "Error", value = error ?? "Unknown error", color = "error" },
                    new { label = "Devices", value = attemptedDeviceCount?.ToString() ?? "Unknown", color = "muted" }
                }
            };

            var message = error ?? "Failed to send health report to cloud backend";

            return await CreateNotificationAsync(
                message,
                title,
                NotificationType.Error,
                NotificationCategory.Cloud,
                expiresAt: DateTime.UtcNow.AddMinutes(10),
                structuredContent: structuredContent
            );
        }
    }

    // Enums for type safety
    public enum NotificationType
    {
        Success,
        Error,
        Warning,
        Info
    }

    public enum NotificationCategory
    {
        Api,
        Auth,
        Cloud,
        System
    }
}