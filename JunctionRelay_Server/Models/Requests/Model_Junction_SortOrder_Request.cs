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

using System.Collections.Generic;

namespace JunctionRelayServer.Models.Requests
{
    // Keep the class name for compatibility, but modify it to handle bulk operations
    public class Model_Junction_SortOrder_Request
    {
        // For individual junction update
        public int JunctionId { get; set; }
        public int SortOrder { get; set; }

        // For bulk updates
        public List<Model_Junction_SortOrder_Item> Updates { get; set; } = new List<Model_Junction_SortOrder_Item>();
    }

    public class Model_Junction_SortOrder_Item
    {
        public int JunctionId { get; set; }
        public int SortOrder { get; set; }
    }
}