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

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// Tracks backup progress for real-time updates to the frontend
    /// </summary>
    public class Service_BackupProgressTracker
    {
        private readonly ConcurrentDictionary<string, BackupProgress> _progressStore = new();

        public class BackupProgress
        {
            public string Stage { get; set; } = "";
            public string Message { get; set; } = "";
            public int? CurrentItem { get; set; }
            public int? TotalItems { get; set; }
            public string? ItemName { get; set; }
            public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
            public bool IsComplete { get; set; }
            public bool IsFailed { get; set; }
            public string? ErrorMessage { get; set; }
        }

        public string CreateOperation()
        {
            var operationId = Guid.NewGuid().ToString();
            _progressStore[operationId] = new BackupProgress
            {
                Stage = "starting",
                Message = "Starting backup...",
                LastUpdated = DateTime.UtcNow
            };
            return operationId;
        }

        public void UpdateProgress(string operationId, string stage, string message, int? currentItem = null, int? totalItems = null, string? itemName = null)
        {
            if (_progressStore.TryGetValue(operationId, out var progress))
            {
                progress.Stage = stage;
                progress.Message = message;
                progress.CurrentItem = currentItem;
                progress.TotalItems = totalItems;
                progress.ItemName = itemName;
                progress.LastUpdated = DateTime.UtcNow;
            }
        }

        public void CompleteOperation(string operationId)
        {
            if (_progressStore.TryGetValue(operationId, out var progress))
            {
                progress.IsComplete = true;
                progress.LastUpdated = DateTime.UtcNow;
            }
        }

        public void FailOperation(string operationId, string errorMessage)
        {
            if (_progressStore.TryGetValue(operationId, out var progress))
            {
                progress.IsFailed = true;
                progress.ErrorMessage = errorMessage;
                progress.LastUpdated = DateTime.UtcNow;
            }
        }

        public BackupProgress? GetProgress(string operationId)
        {
            _progressStore.TryGetValue(operationId, out var progress);
            return progress;
        }

        public void CleanupOperation(string operationId)
        {
            _progressStore.TryRemove(operationId, out _);
        }

        // Auto-cleanup old operations (older than 5 minutes)
        public void CleanupOldOperations()
        {
            var cutoffTime = DateTime.UtcNow.AddMinutes(-5);
            var oldOperations = _progressStore
                .Where(kvp => kvp.Value.LastUpdated < cutoffTime)
                .Select(kvp => kvp.Key)
                .ToList();

            foreach (var operationId in oldOperations)
            {
                _progressStore.TryRemove(operationId, out _);
            }
        }
    }
}
