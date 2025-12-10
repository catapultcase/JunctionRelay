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
    public class Model_LoggingSettings
    {
        public int Id { get; set; }
        public string Category { get; set; } = string.Empty;
        public bool Enabled { get; set; } = true;
        public bool IsEventDriven { get; set; } = false;
        public int LogIntervalMinutes { get; set; } = 60;
        public string? Description { get; set; }
        public DateTime? LastLoggedAt { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Log Rotation & Retention Settings
        public int MaxLogRetentionDays { get; set; } = 30;
        public int MaxLogFileSizeMB { get; set; } = 100;
        public bool AutoCleanupEnabled { get; set; } = true;
        public DateTime? LastCleanupAt { get; set; }
    }
}
