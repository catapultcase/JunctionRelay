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
    /// Global transition rule definition.
    /// Schema matches XSD2 for import/export compatibility.
    /// </summary>
    public class Model_TransitionRule
    {
        public int Id { get; set; }
        public string? Name { get; set; }
        public bool Enabled { get; set; } = true;
        public int Priority { get; set; } = 100;
        public int SortOrder { get; set; }

        // Trigger configuration
        public string TriggerEvent { get; set; } = "";
        public string? SensorLogic { get; set; } // "ANY" or "ALL" for sensor conditions

        // Target layout
        public string NewLayout { get; set; } = "";

        // Transition effect
        public string TransitionEffect { get; set; } = "";
        public int TransitionDuration { get; set; }

        // Optional transition layout (intermediate layout during transition)
        public string? TransitionLayoutPath { get; set; }
        public string? TransitionLayoutInEffect { get; set; }
        public int? TransitionLayoutFadeIn { get; set; }
        public int? TransitionLayoutHold { get; set; }
        public string? TransitionLayoutOutEffect { get; set; }
        public int? TransitionLayoutFadeOut { get; set; }

        // Timing extensions
        public int ExistingLayoutExtend { get; set; } = 0;
        public int NewLayoutExtend { get; set; } = 0;
        public int? ExistingLayoutFadeDuration { get; set; }
        public int? NewLayoutFadeDuration { get; set; }
        public int NewLayoutHold { get; set; } = 2000;

        // Preview settings
        public bool PreviewTransitionTransparency { get; set; } = true;

        // Generated timeline JSON for animation execution
        public string? TimelineJson { get; set; }

        // Timestamps
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Related entities (populated when loading)
        public List<Model_TransitionRuleSensorCondition> SensorConditions { get; set; } = new();
    }
}
