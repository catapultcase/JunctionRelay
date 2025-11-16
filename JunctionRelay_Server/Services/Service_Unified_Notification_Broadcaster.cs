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

using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services;

/// <summary>
/// Unified notification broadcaster that handles all notification types through a single WebSocket connection
/// </summary>
public class Service_Unified_Notification_Broadcaster
{
    private readonly ConcurrentDictionary<string, WebSocket> _clients = new();
    private readonly ConcurrentDictionary<string, List<CachedMessage>> _progressCache = new();
    private readonly ILogger<Service_Unified_Notification_Broadcaster> _logger;
    private readonly TimeSpan _cacheTtl = TimeSpan.FromSeconds(30);

    private class CachedMessage
    {
        public object Message { get; set; } = null!;
        public DateTime CachedAt { get; set; }
        public string MessageType { get; set; } = null!;
    }

    public Service_Unified_Notification_Broadcaster(ILogger<Service_Unified_Notification_Broadcaster> logger)
    {
        _logger = logger;

        // Start background cache cleanup task
        _ = Task.Run(CleanupCacheAsync);
    }

    /// <summary>
    /// Add a new WebSocket client connection
    /// </summary>
    public async Task AddClientAsync(string clientId, WebSocket webSocket)
    {
        _clients[clientId] = webSocket;
        _logger.LogInformation($"[UNIFIED_NOTIFICATIONS] Client {clientId} connected. Total clients: {_clients.Count}");

        // Replay cached progress messages for new clients
        await ReplayCachedMessagesAsync(clientId, webSocket);
    }

    /// <summary>
    /// Remove a WebSocket client connection
    /// </summary>
    public async Task RemoveClientAsync(string clientId)
    {
        if (_clients.TryRemove(clientId, out var webSocket))
        {
            try
            {
                if (webSocket.State == WebSocketState.Open)
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Client disconnected", CancellationToken.None);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"[UNIFIED_NOTIFICATIONS] Error closing WebSocket for client {clientId}: {ex.Message}");
            }
            finally
            {
                webSocket.Dispose();
                _logger.LogInformation($"[UNIFIED_NOTIFICATIONS] Client {clientId} disconnected. Total clients: {_clients.Count}");
            }
        }
    }

    /// <summary>
    /// Close all WebSocket connections gracefully
    /// </summary>
    public async Task CloseAllConnectionsAsync(string reason = "Service shutdown")
    {
        _logger.LogInformation($"[UNIFIED_NOTIFICATIONS] Closing all connections: {reason}");

        var clientIds = _clients.Keys.ToList();
        var closeTasks = new List<Task>();

        foreach (var clientId in clientIds)
        {
            closeTasks.Add(RemoveClientAsync(clientId));
        }

        // Wait for all connections to close with timeout
        var timeoutTask = Task.Delay(TimeSpan.FromSeconds(2));
        var allClosedTask = Task.WhenAll(closeTasks);

        if (await Task.WhenAny(allClosedTask, timeoutTask) == timeoutTask)
        {
            var completedCount = closeTasks.Count(t => t.IsCompleted);
            _logger.LogWarning($"[UNIFIED_NOTIFICATIONS] Timeout closing connections - {completedCount}/{clientIds.Count} completed");
        }
        else
        {
            _logger.LogInformation($"[UNIFIED_NOTIFICATIONS] All {clientIds.Count} connections closed successfully");
        }

        _clients.Clear();
    }

    /// <summary>
    /// Broadcast a general notification (no caching)
    /// </summary>
    public async Task BroadcastNotificationAsync(Model_Notifications notification)
    {
        // Parse structuredContent from JSON string to object if present
        object? structuredContentObj = null;
        if (!string.IsNullOrEmpty(notification.StructuredContent))
        {
            try
            {
                structuredContentObj = JsonSerializer.Deserialize<object>(notification.StructuredContent);
            }
            catch (JsonException ex)
            {
                _logger.LogWarning($"[UNIFIED_NOTIFICATIONS] Failed to parse structuredContent: {ex.Message}");
                structuredContentObj = null;
            }
        }

        var message = new
        {
            type = "notification",
            payload = new
            {
                id = notification.Id,
                type = notification.Type,
                message = notification.Message,
                title = notification.Title,
                category = notification.Category,
                duration = notification.Duration,
                persistent = notification.Persistent,
                timestamp = notification.CreatedAt,
                expiresAt = notification.ExpiresAt,
                structuredContent = structuredContentObj
            }
        };

        await BroadcastMessageAsync(message, "notification", cacheMessage: false);
    }

    /// <summary>
    /// Broadcast junction start progress (with caching)
    /// </summary>
    public async Task BroadcastJunctionProgressAsync(Model_Junction_Start_Progress progress)
    {
        var message = new
        {
            type = "junction-progress",
            payload = progress
        };

        // Cache by operation ID
        CacheMessage(progress.OperationId, message, "junction-progress");

        // Remove from cache if complete
        if (progress.IsComplete)
        {
            _ = Task.Run(async () =>
            {
                await Task.Delay(TimeSpan.FromSeconds(30));
                _progressCache.TryRemove(progress.OperationId, out _);
            });
        }

        await BroadcastMessageAsync(message, "junction-progress", cacheMessage: false);
    }

    /// <summary>
    /// Broadcast template version upload progress (with caching)
    /// </summary>
    public async Task BroadcastTemplateVersionProgressAsync(Model_TemplateVersion_Upload_Progress progress)
    {
        var message = new
        {
            type = "template-version-progress",
            payload = progress
        };

        // Cache by operation ID
        CacheMessage(progress.OperationId, message, "template-version-progress");

        // Remove from cache if complete
        if (progress.IsComplete)
        {
            _ = Task.Run(async () =>
            {
                await Task.Delay(TimeSpan.FromSeconds(30));
                _progressCache.TryRemove(progress.OperationId, out _);
            });
        }

        await BroadcastMessageAsync(message, "template-version-progress", cacheMessage: false);
    }

    /// <summary>
    /// Core broadcast method - sends message to all connected clients
    /// </summary>
    private async Task BroadcastMessageAsync(object message, string messageType, bool cacheMessage)
    {
        var json = JsonSerializer.Serialize(message, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        var bytes = Encoding.UTF8.GetBytes(json);
        var buffer = new ArraySegment<byte>(bytes);

        var disconnectedClients = new List<string>();

        foreach (var (clientId, webSocket) in _clients)
        {
            if (webSocket.State != WebSocketState.Open)
            {
                disconnectedClients.Add(clientId);
                continue;
            }

            try
            {
                await webSocket.SendAsync(buffer, WebSocketMessageType.Text, true, CancellationToken.None);
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"[UNIFIED_NOTIFICATIONS] Failed to send {messageType} to client {clientId}: {ex.Message}");
                disconnectedClients.Add(clientId);
            }
        }

        // Clean up disconnected clients
        foreach (var clientId in disconnectedClients)
        {
            await RemoveClientAsync(clientId);
        }
    }

    /// <summary>
    /// Cache a progress message for replay to new clients
    /// </summary>
    private void CacheMessage(string operationId, object message, string messageType)
    {
        if (!_progressCache.ContainsKey(operationId))
        {
            _progressCache[operationId] = new List<CachedMessage>();
        }

        _progressCache[operationId].Add(new CachedMessage
        {
            Message = message,
            CachedAt = DateTime.UtcNow,
            MessageType = messageType
        });
    }

    /// <summary>
    /// Replay cached progress messages to a newly connected client
    /// </summary>
    private async Task ReplayCachedMessagesAsync(string clientId, WebSocket webSocket)
    {
        var allCachedMessages = _progressCache.Values
            .SelectMany(x => x)
            .OrderBy(x => x.CachedAt)
            .ToList();

        foreach (var cached in allCachedMessages)
        {
            try
            {
                var json = JsonSerializer.Serialize(cached.Message, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });

                var bytes = Encoding.UTF8.GetBytes(json);
                await webSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"[UNIFIED_NOTIFICATIONS] Error replaying cached message to client {clientId}: {ex.Message}");
                break;
            }
        }

        if (allCachedMessages.Count > 0)
        {
            _logger.LogDebug($"[UNIFIED_NOTIFICATIONS] Replayed {allCachedMessages.Count} cached messages to client {clientId}");
        }
    }

    /// <summary>
    /// Helper method for template version progress with stage/percentage
    /// </summary>
    public async Task EmitTemplateVersionProgressAsync(
        int templateId,
        string templateName,
        string operationId,
        TemplateVersionUploadStage stage,
        string detailMessage,
        int progressPercentage = 0,
        bool isComplete = false,
        bool hasError = false,
        string? errorMessage = null)
    {
        var progress = new Model_TemplateVersion_Upload_Progress
        {
            TemplateId = templateId,
            TemplateName = templateName,
            OperationId = operationId,
            Stage = stage,
            DetailMessage = detailMessage,
            ProgressPercentage = progressPercentage,
            Timestamp = DateTime.UtcNow,
            IsComplete = isComplete,
            HasError = hasError,
            ErrorMessage = errorMessage
        };

        await BroadcastTemplateVersionProgressAsync(progress);
    }

    /// <summary>
    /// Helper method for junction progress
    /// </summary>
    public async Task EmitJunctionProgressAsync(
        int junctionId,
        string junctionName,
        string operationId,
        JunctionStartStage stage,
        string detailMessage,
        bool isComplete = false,
        bool hasError = false,
        string? errorMessage = null)
    {
        var progress = new Model_Junction_Start_Progress
        {
            JunctionId = junctionId,
            JunctionName = junctionName,
            OperationId = operationId,
            Stage = stage,
            DetailMessage = detailMessage,
            Timestamp = DateTime.UtcNow,
            IsComplete = isComplete,
            HasError = hasError,
            ErrorMessage = errorMessage
        };

        await BroadcastJunctionProgressAsync(progress);
    }

    /// <summary>
    /// Background task to clean up expired cache entries
    /// </summary>
    private async Task CleanupCacheAsync()
    {
        while (true)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(10));

                var cutoff = DateTime.UtcNow - _cacheTtl;
                var keysToRemove = new List<string>();

                foreach (var (operationId, messages) in _progressCache)
                {
                    messages.RemoveAll(m => m.CachedAt < cutoff);

                    if (messages.Count == 0)
                    {
                        keysToRemove.Add(operationId);
                    }
                }

                foreach (var key in keysToRemove)
                {
                    _progressCache.TryRemove(key, out _);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"[UNIFIED_NOTIFICATIONS] Cache cleanup error: {ex.Message}");
            }
        }
    }
}
