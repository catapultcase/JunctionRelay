/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

namespace JunctionRelayServer.Models.Requests
{
    public class Model_JunctionLinkUpdateRequest
    {
        public int? PollRateOverride { get; set; }
        public bool? IsSelected { get; set; }
        public bool? IsTested { get; set; }
        public bool? WarnOnDuplicate { get; set; }
        public int? SendRateOverride { get; set; }
        public DateTime? LastSent { get; set; }
        public int? RetryAttempts { get; set; }
        public int? DeclareFailedAfter { get; set; }
        public List<string> FieldsToInclude { get; set; } = new List<string>();
    }
}
