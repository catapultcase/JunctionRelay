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

public class Model_Logic_Condition
{
    public int Id { get; set; }
    public int LogicId { get; set; }

    // Field to evaluate — currently just "value", but could be "rate", "status", etc.
    public string Field { get; set; } = "value";

    public string Operator { get; set; } = ">"; // >, <, ==, >=, <=, !=
    public double TargetValue { get; set; }

    // Optional for chaining, e.g., "(value > 10) AND (value < 100)"
    public string? LogicalJoin { get; set; } = "AND"; // AND, OR — for future rule engine use
}
