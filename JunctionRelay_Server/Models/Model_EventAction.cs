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

namespace JunctionRelayServer.Services.BackgroundServices
{
    public class Model_EventAction
    {
        public int Id { get; set; }
        public int EventRuleId { get; set; }
        public int ActionOrder { get; set; }
        public bool IsActive { get; set; } = true;
        public int DelayBeforeNextMs { get; set; }

        // Action Configuration
        public string ActionType { get; set; } = "UpdateEventSensor";
        public int? ActionTargetSensorId { get; set; }
        public string? ActionStaticValue { get; set; }
        public string? ActionTransform { get; set; }
        public int? ActionJunctionId { get; set; }
        public string? ActionMqttTopic { get; set; }
        public string? ActionMqttPayload { get; set; }
        public int? ActionMqttServiceId { get; set; }
        public string? ActionHttpUrl { get; set; }
        public string? ActionHttpMethod { get; set; }
        public string? ActionHttpPayload { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}