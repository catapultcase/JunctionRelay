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
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// Stream manager for Broadcast junction sensor broadcasts.
    /// Follows the established pattern of Service_Stream_Manager_* classes.
    /// Manages stream lifecycle and exposes GetActiveStreams() for dashboard display.
    /// Delegates WebSocket server work to Service_Manager_WebSocket_Server_Broadcast.
    /// </summary>
    public class Service_Stream_Manager_Broadcast
    {
        private readonly Service_Manager_WebSocket_Server_Broadcast _webSocketServer;
        private readonly Service_Stream_History_Manager _historyManager;

        // Track active streams by junction ID
        private readonly ConcurrentDictionary<int, Service_StreamInfo_Broadcast> _activeStreams = new();

        public Service_Stream_Manager_Broadcast(
            Service_Manager_WebSocket_Server_Broadcast webSocketServer,
            Service_Stream_History_Manager historyManager)
        {
            _webSocketServer = webSocketServer;
            _historyManager = historyManager;

            Console.WriteLine("[SERVICE_STREAM_MANAGER_BROADCAST] Service initialized");
        }

        /// <summary>
        /// Start streaming for a Broadcast junction.
        /// </summary>
        public async Task StartStreamingAsync(
            int junctionId,
            string junctionName,
            int rate,
            int port,
            List<Model_Sensor> sensors)
        {
            if (_activeStreams.ContainsKey(junctionId))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_BROADCAST] Stream already active for junction {junctionId}");
                return;
            }

            // Create stream info for tracking
            var streamInfo = new Service_StreamInfo_Broadcast
            {
                JunctionId = junctionId,
                JunctionName = junctionName,
                Rate = rate,
                Status = "Starting",
                StartedAt = DateTime.UtcNow,
                SensorsCount = sensors.Count
            };

            _activeStreams[junctionId] = streamInfo;

            try
            {
                // Delegate to WebSocket server to start the broadcast
                await _webSocketServer.StartJunctionBroadcastAsync(junctionId, junctionName, rate, port, sensors);
                streamInfo.Status = "Active";

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_BROADCAST] Started stream for junction '{junctionName}' on port {port}");
            }
            catch (Exception ex)
            {
                _activeStreams.TryRemove(junctionId, out _);
                streamInfo.Dispose();
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_BROADCAST] Failed to start stream for junction {junctionId}: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Stop streaming for a junction.
        /// </summary>
        public async Task StopStreamingAsync(int junctionId)
        {
            // Stop the WebSocket server broadcast
            _webSocketServer.StopJunctionBroadcast(junctionId);

            // Remove and dispose local tracking
            if (_activeStreams.TryRemove(junctionId, out var streamInfo))
            {
                streamInfo.Status = "Stopped";
                await streamInfo.DisposeAsync();
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_BROADCAST] Stopped stream for junction {junctionId}");
            }
        }

        /// <summary>
        /// Check if a junction is currently streaming.
        /// </summary>
        public bool IsStreaming(int junctionId)
        {
            return _webSocketServer.IsJunctionActive(junctionId);
        }

        /// <summary>
        /// Get active streams in Model_StreamInfo_DTO format for dashboard display.
        /// Follows the pattern of other stream managers.
        /// </summary>
        public IEnumerable<Model_StreamInfo_DTO> GetActiveStreams(bool showCompressed = false)
        {
            // Delegate to WebSocket server which has the actual stream state
            return _webSocketServer.GetActiveStreams();
        }

        /// <summary>
        /// Get information about a specific junction's stream.
        /// </summary>
        public object? GetStreamInfo(int junctionId)
        {
            return _webSocketServer.GetJunctionInfo(junctionId);
        }

        /// <summary>
        /// Get all active junctions with their broadcast info.
        /// </summary>
        public IEnumerable<object> GetActiveJunctions()
        {
            return _webSocketServer.GetActiveJunctions();
        }

        /// <summary>
        /// Check if a port is available for use.
        /// </summary>
        public async Task<PortCheckResult> CheckPortAvailabilityAsync(int port, int? excludeJunctionId = null)
        {
            return await _webSocketServer.CheckPortAvailabilityAsync(port, excludeJunctionId);
        }

        /// <summary>
        /// Stop all streams (for shutdown).
        /// </summary>
        public async Task StopAllStreamsAsync()
        {
            Console.WriteLine($"[SERVICE_STREAM_MANAGER_BROADCAST] Stopping all {_activeStreams.Count} streams...");

            await _webSocketServer.StopAllBroadcastsAsync();

            foreach (var kvp in _activeStreams)
            {
                kvp.Value.Status = "Stopped";
                kvp.Value.Dispose();
            }
            _activeStreams.Clear();

            Console.WriteLine("[SERVICE_STREAM_MANAGER_BROADCAST] All streams stopped");
        }

        /// <summary>
        /// Get metrics about Broadcast streams.
        /// </summary>
        public object GetStreamMetrics()
        {
            var activeJunctions = _webSocketServer.GetActiveJunctions().ToList();

            return new
            {
                TotalStreams = activeJunctions.Count,
                ActiveStreams = activeJunctions.Count,
                Protocol = "Broadcast",
                StreamsByStatus = new
                {
                    Active = activeJunctions.Count,
                    Inactive = 0
                }
            };
        }

        /// <summary>
        /// Get stream history for a junction.
        /// </summary>
        public StreamHistoryResponse GetStreamHistory(int junctionId, DateTime? fromTime = null, DateTime? toTime = null, bool includeStatistics = true)
        {
            return _historyManager.GetStreamHistory(junctionId, fromTime, toTime, includeStatistics);
        }
    }
}
