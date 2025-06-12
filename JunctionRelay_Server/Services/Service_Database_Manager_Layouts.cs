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

using Dapper;
using System.Data;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_Layouts
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Layouts(IDbConnection db)
        {
            _db = db;
        }

        public async Task<IEnumerable<Model_Screen_Layout>> GetAllTemplatesAsync()
        {
            const string query = "SELECT * FROM ScreenLayouts";
            var templates = await _db.QueryAsync<Model_Screen_Layout>(query);

            return templates;
        }

        public async Task<Model_Screen_Layout?> GetTemplateByIdAsync(int id)
        {
            const string query = "SELECT * FROM ScreenLayouts WHERE Id = @Id";
            var template = await _db.QuerySingleOrDefaultAsync<Model_Screen_Layout>(query, new { Id = id });

            return template;
        }

        public async Task<Model_Screen_Layout?> GetTemplateByNameAsync(string displayName)
        {
            const string query = "SELECT * FROM ScreenLayouts WHERE DisplayName = @DisplayName";
            var template = await _db.QuerySingleOrDefaultAsync<Model_Screen_Layout>(query, new { DisplayName = displayName });
            return template;
        }


        public async Task<int> AddTemplateAsync(Model_Screen_Layout template)
        {
            const string sql = @"
              INSERT INTO ScreenLayouts 
                (DisplayName, Description, LayoutType, CustomLayoutType, Rows, Columns, JsonLayoutConfig, IncludePrefixConfig, IncludePrefixSensor,
                 IsTemplate, IsDraft, IsPublished, Created, LastModified, CreatedBy, Version,
                 TopMargin, BottomMargin, LeftMargin, RightMargin, OuterPadding, InnerPadding, 
                 TextColor, BackgroundColor, BorderColor, BorderVisible, BorderThickness, RoundedCorners,
                 BorderRadiusSize, OpacityPercentage, GradientDirection, GradientEndColor, 
                 JustifyContent, AlignItems, TextAlignment,
                 AnimationType, AnimationDuration,
                 ShowPreview, PreviewHeight, PreviewWidth, PreviewSensors,
                 TextSize, LabelSize, ValueSize,
                 TitleFontId, SubHeadingFontId, SensorLabelsFontId, SensorValuesFontId, SensorUnitsFontId, DecimalPlaces,
                 ChartOutlineVisible, ShowLegend, PositionLegendInside, ShowXAxisLabels, ShowYAxisLabels, 
                 GridDensity, HistoryPointsToShow, ShowUnits, ChartScrollSpeed,
                 IsResponsive, MobileLayoutBehavior,
                 ThemeId, InheritThemeStyles,
                 AllowInteraction, OnClickBehavior, NavigationTarget,
                 DataRefreshIntervalSeconds, CacheData, DataFilterCriteria,
                 BackgroundImageUrl, BackgroundImageId, ImageFit,
                 LazyLoad, RenderPriority, EnableScrollbars, MinWidth, MaxWidth, MinHeight, MaxHeight)
              VALUES 
                (@DisplayName, @Description, @LayoutType, @CustomLayoutType, @Rows, @Columns, @JsonLayoutConfig, @IncludePrefixConfig, @IncludePrefixSensor,
                 @IsTemplate, @IsDraft, @IsPublished, @Created, @LastModified, @CreatedBy, @Version,
                 @TopMargin, @BottomMargin, @LeftMargin, @RightMargin, @OuterPadding, @InnerPadding, 
                 @TextColor, @BackgroundColor, @BorderColor, @BorderVisible, @BorderThickness, @RoundedCorners,
                 @BorderRadiusSize, @OpacityPercentage, @GradientDirection, @GradientEndColor, 
                 @JustifyContent, @AlignItems, @TextAlignment,
                 @AnimationType, @AnimationDuration,
                 @ShowPreview, @PreviewHeight, @PreviewWidth, @PreviewSensors,
                 @TextSize, @LabelSize, @ValueSize,
                 @TitleFontId, @SubHeadingFontId, @SensorLabelsFontId, @SensorValuesFontId, @SensorUnitsFontId, @DecimalPlaces,
                 @ChartOutlineVisible, @ShowLegend, @PositionLegendInside, @ShowXAxisLabels, @ShowYAxisLabels, 
                 @GridDensity, @HistoryPointsToShow, @ShowUnits, @ChartScrollSpeed,
                 @IsResponsive, @MobileLayoutBehavior,
                 @ThemeId, @InheritThemeStyles,
                 @AllowInteraction, @OnClickBehavior, @NavigationTarget,
                 @DataRefreshIntervalSeconds, @CacheData, @DataFilterCriteria,
                 @BackgroundImageUrl, @BackgroundImageId, @ImageFit,
                 @LazyLoad, @RenderPriority, @EnableScrollbars, @MinWidth, @MaxWidth, @MinHeight, @MaxHeight);
              SELECT last_insert_rowid();
            ";


            // Set Created date if not already set
            if (template.Created == default)
            {
                template.Created = DateTime.UtcNow;
            }

            var layoutTemplateId = await _db.ExecuteScalarAsync<int>(sql, template);

            return layoutTemplateId;
        }

        public async Task<bool> UpdateTemplateAsync(int id, Model_Screen_Layout template)
        {
            // Ensure the template exists
            const string checkQuery = "SELECT COUNT(1) FROM ScreenLayouts WHERE Id = @Id";
            var existingTemplateCount = await _db.ExecuteScalarAsync<int>(checkQuery, new { Id = id });

            if (existingTemplateCount == 0)
            {
                throw new Exception($"Template with ID {id} not found.");
            }

            // Update the LastModified timestamp
            template.LastModified = DateTime.UtcNow;

            // Update the layout template
            const string sql = @"
                  UPDATE ScreenLayouts
                  SET 
                    DisplayName         = @DisplayName,
                    Description         = @Description,
                    LayoutType          = @LayoutType,
                    CustomLayoutType    = @CustomLayoutType,
                    Rows                = @Rows,
                    Columns             = @Columns,
                    JsonLayoutConfig    = @JsonLayoutConfig,
                    IncludePrefixConfig = @IncludePrefixConfig,
                    IncludePrefixSensor = @IncludePrefixSensor,
                    IsTemplate          = @IsTemplate,
                    IsDraft             = @IsDraft,
                    IsPublished         = @IsPublished,
                    LastModified        = @LastModified,
                    CreatedBy           = @CreatedBy,
                    Version             = @Version,
                    TopMargin           = @TopMargin,
                    BottomMargin        = @BottomMargin,
                    LeftMargin          = @LeftMargin,
                    RightMargin         = @RightMargin,
                    OuterPadding        = @OuterPadding,
                    InnerPadding        = @InnerPadding,
                    TextColor           = @TextColor,
                    BackgroundColor     = @BackgroundColor,
                    BorderColor         = @BorderColor,
                    BorderVisible       = @BorderVisible,
                    BorderThickness     = @BorderThickness,
                    RoundedCorners      = @RoundedCorners,
                    BorderRadiusSize    = @BorderRadiusSize,
                    OpacityPercentage   = @OpacityPercentage,
                    GradientDirection   = @GradientDirection,
                    GradientEndColor    = @GradientEndColor,
                    JustifyContent      = @JustifyContent,
                    AlignItems          = @AlignItems,
                    TextAlignment       = @TextAlignment,
                    AnimationType       = @AnimationType,
                    AnimationDuration   = @AnimationDuration,
                    ShowPreview         = @ShowPreview,
                    PreviewHeight       = @PreviewHeight,
                    PreviewWidth        = @PreviewWidth,
                    PreviewSensors      = @PreviewSensors,
                    TextSize            = @TextSize,
                    LabelSize           = @LabelSize,
                    ValueSize           = @ValueSize,
                    TitleFontId         = @TitleFontId,
                    SubHeadingFontId    = @SubHeadingFontId,
                    SensorLabelsFontId  = @SensorLabelsFontId,
                    SensorValuesFontId  = @SensorValuesFontId,
                    SensorUnitsFontId   = @SensorUnitsFontId,
                    DecimalPlaces       = @DecimalPlaces,
                    ChartOutlineVisible = @ChartOutlineVisible,
                    ShowLegend          = @ShowLegend,
                    PositionLegendInside= @PositionLegendInside,
                    ShowXAxisLabels     = @ShowXAxisLabels,
                    ShowYAxisLabels     = @ShowYAxisLabels,
                    GridDensity         = @GridDensity,
                    HistoryPointsToShow = @HistoryPointsToShow,
                    ShowUnits           = @ShowUnits,
                    ChartScrollSpeed    = @ChartScrollSpeed,
                    IsResponsive        = @IsResponsive,
                    MobileLayoutBehavior= @MobileLayoutBehavior,
                    ThemeId             = @ThemeId,
                    InheritThemeStyles  = @InheritThemeStyles,
                    AllowInteraction    = @AllowInteraction,
                    OnClickBehavior     = @OnClickBehavior,
                    NavigationTarget    = @NavigationTarget,
                    DataRefreshIntervalSeconds = @DataRefreshIntervalSeconds,
                    CacheData           = @CacheData,
                    DataFilterCriteria  = @DataFilterCriteria,
                    BackgroundImageUrl  = @BackgroundImageUrl,
                    BackgroundImageId   = @BackgroundImageId,
                    ImageFit            = @ImageFit,
                    LazyLoad            = @LazyLoad,
                    RenderPriority      = @RenderPriority,
                    EnableScrollbars    = @EnableScrollbars,
                    MinWidth            = @MinWidth,
                    MaxWidth            = @MaxWidth,
                    MinHeight           = @MinHeight,
                    MaxHeight           = @MaxHeight
                  WHERE Id = @Id";


            var affected = await _db.ExecuteAsync(sql, new
            {
                template.DisplayName,
                template.IsTemplate,
                template.Description,
                template.LayoutType,
                template.CustomLayoutType,
                template.Rows,
                template.Columns,
                template.JsonLayoutConfig,
                template.IncludePrefixConfig,
                template.IncludePrefixSensor,
                template.IsDraft,
                template.IsPublished,
                template.LastModified,
                template.CreatedBy,
                template.Version,
                template.TopMargin,
                template.BottomMargin,
                template.LeftMargin,
                template.RightMargin,
                template.OuterPadding,
                template.InnerPadding,
                template.TextColor,
                template.BackgroundColor,
                template.BorderColor,
                template.BorderVisible,
                template.BorderThickness,
                template.RoundedCorners,
                template.BorderRadiusSize,
                template.OpacityPercentage,
                template.GradientDirection,
                template.GradientEndColor,
                template.JustifyContent,
                template.AlignItems,
                template.TextAlignment,
                template.AnimationType,
                template.AnimationDuration,
                template.ShowPreview,
                template.PreviewHeight,
                template.PreviewWidth,
                template.PreviewSensors,
                template.TextSize,
                template.LabelSize,
                template.ValueSize,
                template.TitleFontId,
                template.SubHeadingFontId,
                template.SensorLabelsFontId,
                template.SensorValuesFontId,
                template.SensorUnitsFontId,
                template.DecimalPlaces,
                template.ChartOutlineVisible,
                template.ChartScrollSpeed,
                template.ShowLegend,
                template.PositionLegendInside,
                template.ShowXAxisLabels,
                template.ShowYAxisLabels,
                template.GridDensity,
                template.HistoryPointsToShow,
                template.ShowUnits,
                template.IsResponsive,
                template.MobileLayoutBehavior,
                template.ThemeId,
                template.InheritThemeStyles,
                template.AllowInteraction,
                template.OnClickBehavior,
                template.NavigationTarget,
                template.DataRefreshIntervalSeconds,
                template.CacheData,
                template.DataFilterCriteria,
                template.BackgroundImageUrl,
                template.BackgroundImageId,
                template.ImageFit,
                template.LazyLoad,
                template.RenderPriority,
                template.EnableScrollbars,
                template.MinWidth,
                template.MaxWidth,
                template.MinHeight,
                template.MaxHeight,
                Id = id
            });

            return affected > 0;
        }

        public async Task<bool> DeleteTemplateAsync(int id)
        {
            const string sql = "DELETE FROM ScreenLayouts WHERE Id = @Id";
            var affected = await _db.ExecuteAsync(sql, new { Id = id });
            return affected > 0;
        }

        public async Task<int> CloneTemplateAsync(int originalId)
        {
            // 1. Get the original template
            var original = await GetTemplateByIdAsync(originalId);
            if (original == null)
            {
                throw new Exception($"Template with ID {originalId} not found.");
            }

            // 2. Create a new template with the same properties but a modified name
            var clone = new Model_Screen_Layout
            {
                DisplayName = $"{original.DisplayName} (Clone)",
                IsTemplate = false ,
                Description = original.Description,
                LayoutType = original.LayoutType,
                CustomLayoutType = original.CustomLayoutType,
                Rows = original.Rows,
                Columns = original.Columns,
                JsonLayoutConfig = original.JsonLayoutConfig,
                IncludePrefixConfig = original.IncludePrefixConfig,
                IncludePrefixSensor = original.IncludePrefixSensor,
                IsDraft = original.IsDraft,
                IsPublished = false, // Clone should not be published by default
                CreatedBy = original.CreatedBy,
                Version = original.Version,

                // Margins and Padding
                TopMargin = original.TopMargin,
                BottomMargin = original.BottomMargin,
                LeftMargin = original.LeftMargin,
                RightMargin = original.RightMargin,
                OuterPadding = original.OuterPadding,
                InnerPadding = original.InnerPadding,

                // Background and Border Styling
                TextColor = original.TextColor,
                BackgroundColor = original.BackgroundColor,
                BorderColor = original.BorderColor,
                BorderVisible = original.BorderVisible,
                BorderThickness = original.BorderThickness,
                RoundedCorners = original.RoundedCorners,
                BorderRadiusSize = original.BorderRadiusSize,
                OpacityPercentage = original.OpacityPercentage,
                GradientDirection = original.GradientDirection,
                GradientEndColor = original.GradientEndColor,

                // Alignment and Positioning
                JustifyContent = original.JustifyContent,
                AlignItems = original.AlignItems,
                TextAlignment = original.TextAlignment,

                // Animation
                AnimationType = original.AnimationType,
                AnimationDuration = original.AnimationDuration,

                // Preview Fields
                ShowPreview = original.ShowPreview,
                PreviewHeight = original.PreviewHeight,
                PreviewWidth = original.PreviewWidth,
                PreviewSensors = original.PreviewSensors,

                // Font Selections
                TextSize = original.TextSize,
                LabelSize = original.LabelSize,
                ValueSize = original.ValueSize,
                TitleFontId = original.TitleFontId,
                SubHeadingFontId = original.SubHeadingFontId,
                SensorLabelsFontId = original.SensorLabelsFontId,
                SensorValuesFontId = original.SensorValuesFontId,
                SensorUnitsFontId = original.SensorUnitsFontId,
                DecimalPlaces = original.DecimalPlaces,

                // Chart Options
                ChartOutlineVisible = original.ChartOutlineVisible,
                ShowLegend = original.ShowLegend,
                PositionLegendInside = original.PositionLegendInside,
                ShowXAxisLabels = original.ShowXAxisLabels,
                ShowYAxisLabels = original.ShowYAxisLabels,
                GridDensity = original.GridDensity,
                ChartScrollSpeed = original.ChartScrollSpeed,
                HistoryPointsToShow = original.HistoryPointsToShow,
                ShowUnits = original.ShowUnits,

                // Responsive Layout
                IsResponsive = original.IsResponsive,
                MobileLayoutBehavior = original.MobileLayoutBehavior,

                // Theming
                ThemeId = original.ThemeId,
                InheritThemeStyles = original.InheritThemeStyles,

                // Interactive Behavior
                AllowInteraction = original.AllowInteraction,
                OnClickBehavior = original.OnClickBehavior,
                NavigationTarget = original.NavigationTarget,

                // Data Handling
                DataRefreshIntervalSeconds = original.DataRefreshIntervalSeconds,
                CacheData = original.CacheData,
                DataFilterCriteria = original.DataFilterCriteria,

                // Media
                BackgroundImageUrl = original.BackgroundImageUrl,
                BackgroundImageId = original.BackgroundImageId,
                ImageFit = original.ImageFit,

                // Performance and Optimization
                LazyLoad = original.LazyLoad,
                RenderPriority = original.RenderPriority,
                EnableScrollbars = original.EnableScrollbars,
                MinWidth = original.MinWidth,
                MaxWidth = original.MaxWidth,
                MinHeight = original.MinHeight,
                MaxHeight = original.MaxHeight
            };

            // 3. Add the cloned template to the database
            return await AddTemplateAsync(clone);
        }
    }
}