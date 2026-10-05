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
    public class Service_Notifications
    {
        private readonly Service_Unified_Notification_Broadcaster _unifiedNotificationBroadcaster;

        public Service_Notifications(Service_Unified_Notification_Broadcaster unifiedNotificationBroadcaster)
        {
            _unifiedNotificationBroadcaster = unifiedNotificationBroadcaster;
        }

        // Core method - broadcasts notifications via WebSocket only (no database)
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

            // Broadcast notification to connected WebSocket clients
            await _unifiedNotificationBroadcaster.BroadcastNotificationAsync(notification);

            return notification.Id;
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
                duration: 3000, // Auto-dismiss after 3 seconds
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
                duration: 5000, // Auto-dismiss after 5 seconds
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