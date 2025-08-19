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

namespace JunctionRelayServer.Models
{
    public class Model_Notifications
    {
        public string Id { get; set; } = string.Empty;
        public string Type { get; set; } = "info"; // success, error, warning, info
        public string Message { get; set; } = string.Empty;
        public string? Title { get; set; }
        public string Category { get; set; } = "system"; // api, auth, cloud, system
        public int? Duration { get; set; } // milliseconds, null for default
        public bool Persistent { get; set; } = false; // if true, user must manually dismiss
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public bool IsDelivered { get; set; } = false;
        public DateTime? DeliveredAt { get; set; }
        public DateTime? ExpiresAt { get; set; }
        public bool IsExpired => ExpiresAt.HasValue && DateTime.UtcNow > ExpiresAt.Value;
        public string? StructuredContent { get; set; }
    }
}