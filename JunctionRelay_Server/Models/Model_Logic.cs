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

public class Model_Logic
{
    public int Id { get; set; }
    public string? LogicName { get; set; }
    public string? Description { get; set; }

    public int? JunctionId { get; set; }
    public int SensorId { get; set; }

    // List of conditions (e.g., value > 50 AND value < 100)
    public List<Model_Logic_Condition> Conditions { get; set; } = new();

    // Action if all conditions are true
    public string? OverrideColorHex { get; set; }
    public string? OverrideDisplayText { get; set; }
    public bool? HideSensorValue { get; set; }
    public string? OverrideUnits { get; set; }
    public int? Priority { get; set; }

    public bool IsEnabled { get; set; } = true;
    public string? AppliesWhen { get; set; } // "always", "only_when_active", etc.
}
