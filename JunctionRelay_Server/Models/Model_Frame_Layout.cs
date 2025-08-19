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
    public class Model_Frame_Layout
    {
        // Core Properties
        public int Id { get; set; }
        public string? DisplayName { get; set; }
        public string? Description { get; set; }
        public string LayoutType { get; set; } = "Pre-Rendered Image"; // "Pre-Rendered Image" or "Rive Mapping"

        // Status and Metadata
        public bool IsTemplate { get; set; } = false;
        public bool IsDraft { get; set; } = true;
        public bool IsPublished { get; set; } = false;
        public DateTime Created { get; set; } = DateTime.UtcNow;
        public DateTime? LastModified { get; set; }
        public string? CreatedBy { get; set; }
        public string? Version { get; set; } = "1.0";

        // Frame Dimensions and Orientation
        public int Width { get; set; } = 792;
        public int Height { get; set; } = 272;
        public string Orientation { get; set; } = "landscape"; // "landscape" or "portrait"

        // Background Configuration
        public string BackgroundType { get; set; } = "color"; // "none", "color", "image", "url"
        public string? BackgroundColor { get; set; } = "#FFFFFF";
        public string? BackgroundImageUrl { get; set; }
        public byte[]? BackgroundImageData { get; set; } // For uploaded images
        public double BackgroundOpacity { get; set; } = 1.0;

        // Rive Configuration
        public string? RiveFile { get; set; }
        public bool RiveEmbedInPayload { get; set; } = true; // Whether to embed Rive file data in config payload

        // Frame Configuration (JSON)
        public string? JsonFrameConfig { get; set; } // Frame-specific settings (fonts, colors, layout rules, rive state machine mapping etc)
        public string? JsonFrameElements { get; set; } // Positioned elements (sensors, text, images)             
    }
}