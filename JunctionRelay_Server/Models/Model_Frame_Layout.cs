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
        public string LayoutType { get; set; } = "PRE_RENDERED_IMAGE"; // "PRE_RENDERED_IMAGE", "COMPOSITE_MODE", or "PIXEL_MODE"

        // Status and Metadata
        public bool IsTemplate { get; set; } = false;
        public bool IsDraft { get; set; } = true;
        public bool IsPublished { get; set; } = false;
        public bool IsStandalone { get; set; } = false; // True = Standalone sensors, False = Collector sensors
        public DateTime Created { get; set; } = DateTime.UtcNow;
        public DateTime? LastModified { get; set; }
        public string? CreatedBy { get; set; }
        public string? Version { get; set; } = "1.0";

        // Cloud Template Tracking (UUID strings from PostgreSQL)
        public string? CloudTemplateId { get; set; }
        public string? CloudVariantId { get; set; }

        // Frame Dimensions and Orientation
        public int Width { get; set; } = 800;
        public int Height { get; set; } = 600;
        public string Orientation { get; set; } = "landscape"; // "landscape" or "portrait"

        // Background Configuration
        public string BackgroundType { get; set; } = "color"; // "none", "color", "image", "video", "rive"
        public string? BackgroundColor { get; set; } = "#FFFFFF";
        public string? BackgroundImageUrl { get; set; }
        public string? BackgroundImageFit { get; set; } = "cover"; // "cover", "contain", "fill", "tile", "stretch", "none"
        public double BackgroundOpacity { get; set; } = 1.0;

        // Video Background Configuration
        public string? BackgroundVideoUrl { get; set; } // Filename or path to video file
        public string? BackgroundVideoFit { get; set; } = "cover"; // "cover", "contain", "fill", "stretch", "none"
        public bool VideoLoop { get; set; } = true; // Whether video should loop
        public bool VideoMuted { get; set; } = true; // Whether video should be muted
        public bool VideoAutoplay { get; set; } = true; // Whether video should autoplay
        public bool? BackgroundLoopCompensation { get; set; } // Enable dual-video seamless loop compensation
        public int? BackgroundLoopCutoverMs { get; set; } // Milliseconds before end to trigger loop swap
        public int? BackgroundLoopCrossfadeMs { get; set; } // Crossfade duration in milliseconds

        // Rive Configuration
        public string? RiveFile { get; set; }

        // Thumbnail Configuration
        public string? ThumbnailPath { get; set; } // Relative path to thumbnail file (e.g., "frameengine/thumbnails/123.png")
        public DateTime? ThumbnailGeneratedAt { get; set; } // When thumbnail was last generated
        public bool HasThumbnail { get; set; } = false; // Quick check if thumbnail exists
        public string? ThumbnailFormat { get; set; } = "png"; // "png", "jpg", "webp"
        public bool ThumbnailOverride { get; set; } = false;

        // Frame Configuration (JSON)
        public string? JsonFrameConfig { get; set; } // Full config with discovery data for editor use
        public string? JsonFrameConfigRuntime { get; set; } // Optimized config for device runtime (stripped of discovery metadata, flattened structure)
        public string? JsonFrameElements { get; set; } // Positioned elements (sensors, text, images)             
    }
}