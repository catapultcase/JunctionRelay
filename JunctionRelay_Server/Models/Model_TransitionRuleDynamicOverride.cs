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
    /// <summary>
    /// Dynamic sensor override for a transition rule.
    /// Allows remapping sensor tags or overriding values for specific rules.
    /// </summary>
    public class Model_TransitionRuleDynamicOverride
    {
        public int Id { get; set; }
        public int RuleId { get; set; }
        public required string SensorTag { get; set; }
        public bool OverrideEnabled { get; set; } = false;
        public string? Value { get; set; }
        public string? SourceSensorTag { get; set; }
        public string? CustomSourceSensorTag { get; set; }
    }
}
