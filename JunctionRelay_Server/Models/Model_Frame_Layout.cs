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
        public string LayoutType { get; set; } = "FRAME_SENSOR_GRID";

        // Grid Configuration
        public int? Rows { get; set; } = 2;
        public int? Columns { get; set; } = 2;

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

        // Frame Configuration (JSON)
        public string? JsonFrameConfig { get; set; } // Frame-specific settings (fonts, colors, layout rules)
        public string? JsonElementPositions { get; set; } // Positioned elements (sensors, text, images)

        // Helper method to get supported frame types
        public static string[] GetSupportedFrameTypes()
        {
            return new[]
            {
                "FRAME_SENSOR_GRID",
                "FRAME_CALENDAR",
                "FRAME_DASHBOARD",
                "FRAME_CHART",
                "FRAME_QUAD",
                "FRAME_IMAGE",
                "FRAME_CUSTOM"
            };
        }

        // Helper method to validate frame type
        public bool IsValidFrameType()
        {
            return GetSupportedFrameTypes().Contains(LayoutType, StringComparer.OrdinalIgnoreCase);
        }

        // Helper method to swap dimensions for orientation change
        public void SwapDimensions()
        {
            (Width, Height) = (Height, Width);
            Orientation = Orientation == "landscape" ? "portrait" : "landscape";
        }

        // Helper method to get aspect ratio
        public double GetAspectRatio()
        {
            return Height == 0 ? 1.0 : (double)Width / Height;
        }

        // Helper method to check if frame is e-paper optimized
        public bool IsEPaperOptimized()
        {
            // Common e-paper dimensions
            var ePaperSizes = new[]
            {
                (792, 272),   // 5.79" e-paper
                (880, 528),   // 7.5" e-paper
                (400, 300),   // 4.2" e-paper
                (640, 384),   // 7.5" e-paper (alternative)
            };

            return ePaperSizes.Any(size =>
                (Width == size.Item1 && Height == size.Item2) ||
                (Width == size.Item2 && Height == size.Item1));
        }

        // Helper method to create a copy for cloning
        public Model_Frame_Layout CreateCopy(string? newDisplayName = null)
        {
            return new Model_Frame_Layout
            {
                DisplayName = newDisplayName ?? $"{DisplayName} (Copy)",
                Description = Description,
                LayoutType = LayoutType,
                Rows = Rows,
                Columns = Columns,
                IsTemplate = false, // Copies are never templates
                IsDraft = true,
                IsPublished = false,
                CreatedBy = CreatedBy,
                Version = Version,
                Width = Width,
                Height = Height,
                Orientation = Orientation,
                BackgroundType = BackgroundType,
                BackgroundColor = BackgroundColor,
                BackgroundImageUrl = BackgroundImageUrl,
                BackgroundImageData = BackgroundImageData?.ToArray(), // Deep copy byte array
                BackgroundOpacity = BackgroundOpacity,
                JsonFrameConfig = JsonFrameConfig,
                JsonElementPositions = JsonElementPositions
            };
        }

        // Helper method to get display-friendly type name
        public string GetDisplayTypeName()
        {
            return LayoutType switch
            {
                "FRAME_SENSOR_GRID" => "Sensor Grid",
                "FRAME_CALENDAR" => "Calendar",
                "FRAME_DASHBOARD" => "Dashboard",
                "FRAME_CHART" => "Chart",
                "FRAME_QUAD" => "Quad Layout",
                "FRAME_IMAGE" => "Image Frame",
                "FRAME_CUSTOM" => "Custom",
                _ => LayoutType
            };
        }

        // Helper method to get recommended dimensions for frame type
        public static (int Width, int Height) GetRecommendedDimensions(string frameType)
        {
            return frameType switch
            {
                "FRAME_SENSOR_GRID" => (792, 272),  // E-paper optimized
                "FRAME_CALENDAR" => (1024, 600),    // Wide for multiple columns
                "FRAME_DASHBOARD" => (1280, 720),   // HD for detailed dashboards
                "FRAME_CHART" => (800, 600),        // Standard chart dimensions
                "FRAME_QUAD" => (800, 800),         // Square for equal quadrants
                "FRAME_IMAGE" => (1920, 1080),      // Full HD for image frames
                _ => (792, 272)                      // Default e-paper size
            };
        }

        // Validation method
        public List<string> Validate()
        {
            var errors = new List<string>();

            if (string.IsNullOrWhiteSpace(DisplayName))
                errors.Add("Display name is required");

            if (DisplayName?.Length > 100)
                errors.Add("Display name must be 100 characters or less");

            if (!IsValidFrameType())
                errors.Add($"Invalid frame type: {LayoutType}");

            if (Width <= 0 || Height <= 0)
                errors.Add("Width and height must be greater than 0");

            if (Width > 10000 || Height > 10000)
                errors.Add("Width and height must be less than 10000 pixels");

            if (Rows < 1 || Rows > 100)
                errors.Add("Rows must be between 1 and 100");

            if (Columns < 1 || Columns > 100)
                errors.Add("Columns must be between 1 and 100");

            if (BackgroundOpacity < 0 || BackgroundOpacity > 1)
                errors.Add("Background opacity must be between 0 and 1");

            if (!string.IsNullOrEmpty(JsonFrameConfig))
            {
                try
                {
                    System.Text.Json.JsonDocument.Parse(JsonFrameConfig);
                }
                catch
                {
                    errors.Add("Frame configuration JSON is invalid");
                }
            }

            if (!string.IsNullOrEmpty(JsonElementPositions))
            {
                try
                {
                    System.Text.Json.JsonDocument.Parse(JsonElementPositions);
                }
                catch
                {
                    errors.Add("Element positions JSON is invalid");
                }
            }

            return errors;
        }

        // Override ToString for debugging
        public override string ToString()
        {
            return $"Frame Layout: {DisplayName} ({LayoutType}) - {Width}x{Height}";
        }
    }
}