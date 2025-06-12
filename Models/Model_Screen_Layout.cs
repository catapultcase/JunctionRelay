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

public class Model_Screen_Layout
{
    // Core Properties
    public int Id { get; set; }
    public string? DisplayName { get; set; }
    public string? Description { get; set; }
    public string LayoutType { get; set; } = "LVGL_GRID";
    public string? CustomLayoutType { get; set; }
    public bool IncludePrefixConfig {  get; set; }
    public bool IncludePrefixSensor {  get; set; }

    // Grid-specific properties
    public int? Rows { get; set; }
    public int? Columns { get; set; }
    public string? JsonLayoutConfig { get; set; }

    // Status and Metadata
    public bool IsTemplate { get; set; } = false;
    public bool IsDraft { get; set; } = true;
    public bool IsPublished { get; set; } = false;
    public DateTime Created { get; set; } = DateTime.UtcNow;
    public DateTime? LastModified { get; set; }
    public string? CreatedBy { get; set; }
    public string? Version { get; set; }

    // Margin and padding for layout spacing
    public int TopMargin { get; set; } = 0;
    public int BottomMargin { get; set; } = 0;
    public int LeftMargin { get; set; } = 0;
    public int RightMargin { get; set; } = 0;
    public int OuterPadding { get; set; } = 0;
    public int InnerPadding { get; set; } = 0;

    // Background and border styling
    public string? BackgroundColor { get; set; }
    public string? BorderColor { get; set; }
    public bool? BorderVisible { get; set; }
    public int? BorderThickness { get; set; }
    public bool? RoundedCorners { get; set; }
    public int? BorderRadiusSize { get; set; }
    public int? OpacityPercentage { get; set; }
    public string? GradientDirection { get; set; }
    public string? GradientEndColor { get; set; }

    // Charts
    public bool? ChartOutlineVisible { get; set; }
    public bool? ShowLegend { get; set; }
    public bool? PositionLegendInside { get; set; }
    public bool? ShowXAxisLabels { get; set; }
    public bool? ShowYAxisLabels { get; set; }
    public int? GridDensity { get; set; }
    public int? HistoryPointsToShow { get; set; }
    public int? ChartScrollSpeed { get; set; }

    // Sensors and Fonts
    public bool? ShowUnits { get; set; }
    public string? TextColor { get; set; }
    public string? TextSize { get; set; }
    public string? LabelSize { get; set; }
    public string? ValueSize { get; set; }
    public int? TitleFontId { get; set; }
    public int? SubHeadingFontId { get; set; }
    public int? SensorLabelsFontId { get; set; }
    public int? SensorValuesFontId { get; set; }
    public int? SensorUnitsFontId { get; set; }
    public int? DecimalPlaces { get; set; }

    // Alignment and Positioning
    public string? JustifyContent { get; set; }  // e.g., "flex-start", "center", "flex-end"
    public string? AlignItems { get; set; }      // e.g., "stretch", "center", "flex-start"
    public string? TextAlignment { get; set; }   // e.g., "left", "right", "centered", "justified"

    // Animation
    public string? AnimationType { get; set; }    // e.g., "fade", "slide", "zoom"
    public int? AnimationDuration { get; set; }   // duration in ms

    // Preview fields
    public bool ShowPreview { get; set; }
    public int? PreviewHeight { get; set; }
    public int? PreviewWidth { get; set; }
    public int? PreviewSensors { get; set; }

    // Mobile/Responsive Layout Support
    public bool IsResponsive { get; set; } = false;
    public string? MobileLayoutBehavior { get; set; }  // "stack", "scroll", "compress"

    // Theming
    public int? ThemeId { get; set; }
    public bool InheritThemeStyles { get; set; } = false;

    // Interactive Behavior
    public bool AllowInteraction { get; set; } = false;
    public string? OnClickBehavior { get; set; }  // "none", "expand", "navigate", "popup"
    public string? NavigationTarget { get; set; }

    // Data Handling
    public int? DataRefreshIntervalSeconds { get; set; }
    public bool CacheData { get; set; } = false;
    public string? DataFilterCriteria { get; set; }

    // Media

    public string? BackgroundImageUrl { get; set; }
    public string? BackgroundImageId { get; set; }
    public string? ImageFit {  get; set; }


    // Performance and Optimization
    public bool LazyLoad { get; set; } = false;
    public int? RenderPriority { get; set; }
    public bool EnableScrollbars { get; set; } = false;
    public int? MinWidth { get; set; }
    public int? MaxWidth { get; set; }
    public int? MinHeight { get; set; }
    public int? MaxHeight { get; set; }
}