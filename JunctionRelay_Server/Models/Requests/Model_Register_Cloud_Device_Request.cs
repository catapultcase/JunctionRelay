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

using System.ComponentModel.DataAnnotations;

namespace JunctionRelay_Server.Models.Requests
{
    public class Model_Register_Cloud_Device_Request
    {
        [Required]
        [StringLength(100, MinimumLength = 1)]
        public string DeviceId { get; set; } = string.Empty;

        [Required]
        [StringLength(200, MinimumLength = 1)]
        public string DeviceName { get; set; } = string.Empty;

        [StringLength(500)]
        public string? Description { get; set; }
        public string? Metadata { get; set; }
    }
}