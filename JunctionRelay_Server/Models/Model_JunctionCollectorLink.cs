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
    public class Model_JunctionCollectorLink
    {
        public int Id { get; set; }
        public int JunctionId { get; set; }
        public int CollectorId { get; set; }
        public required string Role { get; set; }

        public bool IsSelected { get; set; }
        public bool IsTested { get; set; }
        public bool WarnOnDuplicate { get; set; }

        public int? PollRateOverride { get; set; }
        public DateTime? LastPolled { get; set; }

        public int? SendRateOverride { get; set; }
        public DateTime? LastSent { get; set; }

        public int DeclareFailedAfter { get; set; } = 10000;
        public int RetryAttempts { get; set; } = 3;

        public string? CollectorName { get; set; }
        public string? CollectorDescription { get; set; }
        public string? CollectorStatus { get; set; }

        // Raw string for FieldsToInclude, stored as a comma-separated list
        public string? FieldsToInclude { get; set; }

        // Property to get FieldsToInclude as a List<string>
        public List<string> FieldsToIncludeList
        {
            get
            {
                if (string.IsNullOrEmpty(FieldsToInclude))
                    return new List<string>();
                return FieldsToInclude.Split(',').Select(f => f.Trim()).ToList();
            }
        }
    }

}
