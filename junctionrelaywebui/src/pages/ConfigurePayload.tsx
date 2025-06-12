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

import React, { useState, useEffect } from "react";
import {
    Button,
    Typography,
    Box,
    CircularProgress,
    Snackbar,
    Alert,
    Paper,
    Tabs,
    Tab,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    FormControlLabel,
    Switch,
    Divider
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";

// Import icons
import SettingsIcon from '@mui/icons-material/Settings';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import PaletteIcon from '@mui/icons-material/Palette';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import InsertChartIcon from '@mui/icons-material/InsertChart';
import AnimationIcon from '@mui/icons-material/Animation';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import DataObjectIcon from '@mui/icons-material/DataObject';
import PhotoIcon from '@mui/icons-material/Photo';
import SpeedIcon from '@mui/icons-material/Speed';

// Import the LayoutPreview component
import LayoutPreview, { LayoutType } from '../components/PayloadPreview';


// Define types for the color picker
interface ColorPickerInputProps {
    label: string;
    value: string | undefined;
    onChange: (value: string) => void;
    placeholder: string;
    disabled?: boolean;
}

// Define TabPanel component for the tabbed interface
interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`layout-tabpanel-${index}`}
            aria-labelledby={`layout-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 2 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

// Color Picker Component
const ColorPickerInput: React.FC<ColorPickerInputProps> = ({ label, value, onChange, placeholder, disabled = false }) => {
    return (
        <TextField
            label={label}
            fullWidth
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            size="small"
            margin="dense"
            placeholder={placeholder}
            disabled={disabled}
            slotProps={{
                input: {
                    endAdornment: (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <input
                                type="color"
                                value={value || "#000000"}
                                onChange={(e) => onChange(e.target.value)}
                                style={{ width: '28px', height: '28px', border: 'none', padding: 0, backgroundColor: 'transparent' }}
                                disabled={disabled}
                            />
                        </div>
                    ),
                }
            }}
        />
    );
};

const ConfigureLayout: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [currentTab, setCurrentTab] = useState(0);

    const [loading, setLoading] = useState<boolean>(true);
    const [layoutData, setLayoutData] = useState<any>(null);

    // Basic Info
    const [displayName, setDisplayName] = useState<string>("");
    const [description, setDescription] = useState<string>("");
    const [layoutType, setLayoutType] = useState<LayoutType>("LVGL_GRID");
    const [customLayoutType, setCustomLayoutType] = useState<string>("");
    const [rows, setRows] = useState<number | string>("");
    const [columns, setColumns] = useState<number | string>("");
    const [jsonLayoutConfig, setJsonLayoutConfig] = useState<string>("");
    const [includePrefixConfig, setIncludePrefixConfig] = useState<boolean>(false);
    const [includePrefixSensor, setIncludePrefixSensor] = useState<boolean>(false);
    const [version, setVersion] = useState<string>("");

    // Status and Metadata
    const [isDraft, setIsDraft] = useState<boolean>(true);
    const [isPublished, setIsPublished] = useState<boolean>(false);
    const [isTemplate, setIsTemplate] = useState<boolean>(false);
    const [createdBy, setCreatedBy] = useState<string>("");

    // Margins and Padding
    const [topMargin, setTopMargin] = useState<number | string>(0);
    const [bottomMargin, setBottomMargin] = useState<number | string>(0);
    const [leftMargin, setLeftMargin] = useState<number | string>(0);
    const [rightMargin, setRightMargin] = useState<number | string>(0);
    const [outerPadding, setOuterPadding] = useState<number | string>(0);
    const [innerPadding, setInnerPadding] = useState<number | string>(0);

    // Background and Border Styling
    const [textColor, setTextColor] = useState<string>("");
    const [backgroundColor, setBackgroundColor] = useState<string>("");
    const [borderColor, setBorderColor] = useState<string>("");
    const [borderVisible, setBorderVisible] = useState<boolean>(true);
    const [borderThickness, setBorderThickness] = useState<number | string>("");
    const [roundedCorners, setRoundedCorners] = useState<boolean>(true);
    const [borderRadiusSize, setBorderRadiusSize] = useState<number | string>("");
    const [opacityPercentage, setOpacityPercentage] = useState<number | string>("");
    const [gradientDirection, setGradientDirection] = useState<string>("");
    const [gradientEndColor, setGradientEndColor] = useState<string>("");

    // Justify and Align Content Fields
    const [justifyContent, setJustifyContent] = useState<string>("");
    const [alignItems, setAlignItems] = useState<string>("");
    const [textAlignment, setTextAlignment] = useState<string>("");

    // Animation
    const [animationType, setAnimationType] = useState<string>("");
    const [animationDuration, setAnimationDuration] = useState<number | string>("");

    // Preview Fields
    const [showPreview, setShowPreview] = useState<boolean>(true);
    const [previewHeight, setPreviewHeight] = useState<number | string>("");
    const [previewWidth, setPreviewWidth] = useState<number | string>("");
    const [previewSensors, setPreviewSensors] = useState<number | string>("");

    // Font Selections
    const [titleFontId, setTitleFontId] = useState<number | string>("");
    const [subHeadingFontId, setSubHeadingFontId] = useState<number | string>("");
    const [sensorLabelsFontId, setSensorLabelsFontId] = useState<number | string>("");
    const [sensorValuesFontId, setSensorValuesFontId] = useState<number | string>("");
    const [sensorUnitsFontId, setSensorUnitsFontId] = useState<number | string>("");
    const [textSize, setTextSize] = useState<string>("");
    const [labelSize, setLabelSize] = useState<string>("");
    const [valueSize, setValueSize] = useState<string>("");

    // Chart Options
    const [chartOutlineVisible, setChartOutlineVisible] = useState<boolean>(true);
    const [showLegend, setShowLegend] = useState<boolean>(true);
    const [positionLegendInside, setPositionLegendInside] = useState<boolean>(false);
    const [showXAxisLabels, setShowXAxisLabels] = useState<boolean>(true);
    const [showYAxisLabels, setShowYAxisLabels] = useState<boolean>(true);
    const [gridDensity, setGridDensity] = useState<number | string>("");
    const [chartScrollSpeed, setChartScrollSpeed] = useState<number | string>("");
    const [historyPointsToShow, setHistoryPointsToShow] = useState<number | string>("");
    const [showUnits, setShowUnits] = useState<boolean>(true);
    const [decimalPlaces, setDecimalPlaces] = useState<number | string>("");

    // Responsive Layout
    const [isResponsive, setIsResponsive] = useState<boolean>(false);
    const [mobileLayoutBehavior, setMobileLayoutBehavior] = useState<string>("");

    // Theming
    const [themeId, setThemeId] = useState<number | string>("");
    const [inheritThemeStyles, setInheritThemeStyles] = useState<boolean>(true);

    // Interactive Behavior
    const [allowInteraction, setAllowInteraction] = useState<boolean>(false);
    const [onClickBehavior, setOnClickBehavior] = useState<string>("");
    const [navigationTarget, setNavigationTarget] = useState<string>("");

    // Data Handling
    const [dataRefreshIntervalSeconds, setDataRefreshIntervalSeconds] = useState<number | string>("");
    const [cacheData, setCacheData] = useState<boolean>(false);
    const [dataFilterCriteria, setDataFilterCriteria] = useState<string>("");

    // Media
    const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>("");
    const [backgroundImageId, setBackgroundImageId] = useState<string>("");
    const [imageFit, setImageFit] = useState<string>("");

    // Performance
    const [lazyLoad, setLazyLoad] = useState<boolean>(false);
    const [renderPriority, setRenderPriority] = useState<number | string>("");
    const [enableScrollbars, setEnableScrollbars] = useState<boolean>(false);
    const [minWidth, setMinWidth] = useState<number | string>("");
    const [maxWidth, setMaxWidth] = useState<number | string>("");
    const [minHeight, setMinHeight] = useState<number | string>("");
    const [maxHeight, setMaxHeight] = useState<number | string>("");

    const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
    const [snackbarMessage, setSnackbarMessage] = useState<string>("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error">("success");
    
    // Force payloads
    const [payloadJson, setPayloadJson] = useState<string>("");
    const [payloadRefreshKey, setPayloadRefreshKey] = useState<number>(0);
    const [sensorPreviewJson, setSensorPreviewJson] = useState<string>("");

    const showSnackbar = (message: string, severity: "success" | "error") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    };

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setCurrentTab(newValue);
    };

    useEffect(() => {
        const fetchLayout = async () => {
            if (!id) {
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`/api/layouts/${id}`);
                if (!response.ok) {
                    throw new Error("Failed to fetch layout");
                }
                const data = await response.json();
                setLayoutData(data);

                // Basic Info
                setDisplayName(data.displayName || "");
                setDescription(data.description || "");
                setLayoutType(data.layoutType || "LVGL_GRID");
                setCustomLayoutType(data.customLayoutType || "");
                setRows(data.rows || "");
                setColumns(data.columns || "");
                setJsonLayoutConfig(data.jsonLayoutConfig || "");
                setIncludePrefixConfig(data.includePrefixConfig !== undefined ? data.includePrefixConfig : false);
                setIncludePrefixSensor(data.includePrefixSensor !== undefined ? data.includePrefixSensor : false);
                setVersion(data.version || "");

                // Status and Metadata
                setIsDraft(data.isDraft !== undefined ? data.isDraft : true);
                setIsPublished(data.isPublished !== undefined ? data.isPublished : false);
                setIsTemplate(data.isTemplate !== undefined ? data.isTemplate : false);
                setCreatedBy(data.createdBy || "");


                // Margins and Padding - Properly handle 0 values
                setTopMargin(data.topMargin !== null && data.topMargin !== undefined ? data.topMargin : 0);
                setBottomMargin(data.bottomMargin !== null && data.bottomMargin !== undefined ? data.bottomMargin : 0);
                setLeftMargin(data.leftMargin !== null && data.leftMargin !== undefined ? data.leftMargin : 0);
                setRightMargin(data.rightMargin !== null && data.rightMargin !== undefined ? data.rightMargin : 0);
                setOuterPadding(data.outerPadding !== null && data.outerPadding !== undefined ? data.outerPadding : 0);
                setInnerPadding(data.innerPadding !== null && data.innerPadding !== undefined ? data.innerPadding : 0);

                // Background and Border Styling
                setTextColor(data.textColor || "");
                setBackgroundColor(data.backgroundColor || "");
                setBorderColor(data.borderColor || "");
                setBorderVisible(data.borderVisible !== undefined ? data.borderVisible : true);
                setBorderThickness(data.borderThickness || "");
                setRoundedCorners(data.roundedCorners !== undefined ? data.roundedCorners : true);
                setBorderRadiusSize(data.borderRadiusSize || "");
                setOpacityPercentage(data.opacityPercentage || "");
                setGradientDirection(data.gradientDirection || "");
                setGradientEndColor(data.gradientEndColor || "");

                // Alignment and Positioning
                setJustifyContent(data.justifyContent || "");
                setAlignItems(data.alignItems || "");
                setTextAlignment(data.textAlignment || "");

                // Animation
                setAnimationType(data.animationType || "");
                setAnimationDuration(data.animationDuration || "");

                // Preview Fields
                setShowPreview(data.showPreview !== undefined ? data.showPreview : true);
                setPreviewHeight(data.previewHeight || "");
                setPreviewWidth(data.previewWidth || "");
                setPreviewSensors(data.previewSensors || "");

                // Font Selections
                setTitleFontId(data.titleFontId || "");
                setSubHeadingFontId(data.subHeadingFontId || "");
                setSensorLabelsFontId(data.sensorLabelsFontId || "");
                setSensorValuesFontId(data.sensorValuesFontId || "");
                setSensorUnitsFontId(data.sensorUnitsFontId || "");
                setTextSize(data.textSize || "");
                setLabelSize(data.labelSize || "");
                setValueSize(data.valueSize || "");

                // Chart Options
                setChartOutlineVisible(data.chartOutlineVisible !== undefined ? data.chartOutlineVisible : true);
                setShowLegend(data.showLegend !== undefined ? data.showLegend : true);
                setPositionLegendInside(data.positionLegendInside !== undefined ? data.positionLegendInside : false);
                setShowXAxisLabels(data.showXAxisLabels !== undefined ? data.showXAxisLabels : true);
                setShowYAxisLabels(data.showYAxisLabels !== undefined ? data.showYAxisLabels : true);
                setGridDensity(data.gridDensity || "");
                setChartScrollSpeed(data.chartScrollSpeed || "");
                setHistoryPointsToShow(data.historyPointsToShow || "");
                setShowUnits(data.showUnits !== undefined ? data.showUnits : true);
                setDecimalPlaces(data.decimalPlaces || "");

                // Responsive Layout
                setIsResponsive(data.isResponsive !== undefined ? data.isResponsive : false);
                setMobileLayoutBehavior(data.mobileLayoutBehavior || "");

                // Theming
                setThemeId(data.themeId || "");
                setInheritThemeStyles(data.inheritThemeStyles !== undefined ? data.inheritThemeStyles : true);

                // Interactive Behavior
                setAllowInteraction(data.allowInteraction !== undefined ? data.allowInteraction : false);
                setOnClickBehavior(data.onClickBehavior || "");
                setNavigationTarget(data.navigationTarget || "");

                // Data Handling
                setDataRefreshIntervalSeconds(data.dataRefreshIntervalSeconds || "");
                setCacheData(data.cacheData !== undefined ? data.cacheData : false);
                setDataFilterCriteria(data.dataFilterCriteria || "");

                // Media
                setBackgroundImageUrl(data.backgroundImageUrl || "");
                setBackgroundImageId(data.backgroundImageId || "");
                setImageFit(data.imageFit || "");

                // Performance and Optimization
                setLazyLoad(data.lazyLoad !== undefined ? data.lazyLoad : false);
                setRenderPriority(data.renderPriority || "");
                setEnableScrollbars(data.enableScrollbars !== undefined ? data.enableScrollbars : false);
                setMinWidth(data.minWidth || "");
                setMaxWidth(data.maxWidth || "");
                setMinHeight(data.minHeight || "");
                setMaxHeight(data.maxHeight || "");

            } catch (err) {
                showSnackbar("Error fetching layout data.", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchLayout();
    }, [id]);

    // Effect to force refresh of payload when relevant fields change
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchPreviewPayload();
        }, 300);

        return () => clearTimeout(timer);
    }, [
        layoutType,
        rows,
        columns,
        topMargin,
        bottomMargin,
        leftMargin,
        rightMargin,
        outerPadding,
        innerPadding,
        backgroundColor,
        textColor,
        borderVisible,
        borderThickness,
        borderColor,
        roundedCorners,
        borderRadiusSize,
        opacityPercentage,
        gradientDirection,
        gradientEndColor,
        justifyContent,
        alignItems,
        textAlignment,
        labelSize,
        valueSize,
        showUnits,
        decimalPlaces,
        includePrefixConfig,
        includePrefixSensor,
        displayName,
        description,
        version,
        titleFontId,
        subHeadingFontId,
        sensorLabelsFontId,
        sensorValuesFontId,
        sensorUnitsFontId,
        textSize,
        chartOutlineVisible,
        showLegend,
        positionLegendInside,
        showXAxisLabels,
        showYAxisLabels,
        gridDensity,
        chartScrollSpeed,
        historyPointsToShow,
        animationType,
        animationDuration,
        isResponsive,
        mobileLayoutBehavior,
        allowInteraction,
        onClickBehavior,
        navigationTarget,
        dataRefreshIntervalSeconds,
        cacheData,
        dataFilterCriteria,
        backgroundImageUrl,
        backgroundImageId,
        imageFit,
        lazyLoad,
        renderPriority,
        enableScrollbars,
        minWidth,
        maxWidth,
        minHeight,
        maxHeight,
        previewSensors,
        id
    ]);

    const handleSave = async () => {
        try {
            const method = id ? "PUT" : "POST";
            const url = id ? `/api/layouts/${id}` : `/api/layouts`;

            // Construct the payload
            const payload = {
                // Basic info
                displayName: displayName || null,
                description: description || null,
                layoutType,
                customLayoutType: layoutType === "CUSTOM" ? customLayoutType : null,
                rows: rows ? parseInt(rows as string) : null,
                columns: columns ? parseInt(columns as string) : null,
                jsonLayoutConfig: jsonLayoutConfig || null,
                includePrefixConfig,
                includePrefixSensor,
                version: version || null,

                // Status and Metadata
                isDraft,
                isPublished,
                isTemplate,
                createdBy: createdBy || null,

                // Margins and Padding - Properly handle 0 values
                topMargin: topMargin !== null && topMargin !== undefined && topMargin !== "" ? parseInt(topMargin as string) : 0,
                bottomMargin: bottomMargin !== null && bottomMargin !== undefined && bottomMargin !== "" ? parseInt(bottomMargin as string) : 0,
                leftMargin: leftMargin !== null && leftMargin !== undefined && leftMargin !== "" ? parseInt(leftMargin as string) : 0,
                rightMargin: rightMargin !== null && rightMargin !== undefined && rightMargin !== "" ? parseInt(rightMargin as string) : 0,
                outerPadding: outerPadding !== null && outerPadding !== undefined && outerPadding !== "" ? parseInt(outerPadding as string) : 0,
                innerPadding: innerPadding !== null && innerPadding !== undefined && innerPadding !== "" ? parseInt(innerPadding as string) : 0,

                // Background and Border Styling
                textColor: textColor || null,
                backgroundColor: backgroundColor || null,
                borderColor: borderColor || null,
                borderVisible: borderVisible || false,
                borderThickness: borderThickness ? parseInt(borderThickness as string) : null,
                roundedCorners: roundedCorners || false,
                borderRadiusSize: borderRadiusSize ? parseInt(borderRadiusSize as string) : null,
                opacityPercentage: opacityPercentage ? parseInt(opacityPercentage as string) : null,
                gradientDirection: gradientDirection || null,
                gradientEndColor: gradientEndColor || null,

                // Alignment and Positioning
                justifyContent: justifyContent || null,
                alignItems: alignItems || null,
                textAlignment: textAlignment || null,

                // Animation
                animationType: animationType || null,
                animationDuration: animationDuration ? parseInt(animationDuration as string) : null,

                // Preview Fields
                showPreview,
                previewHeight: previewHeight ? parseInt(previewHeight as string) : null,
                previewWidth: previewWidth ? parseInt(previewWidth as string) : null,
                previewSensors: previewSensors ? parseInt(previewSensors as string) : null,

                // Font Selections
                titleFontId: titleFontId ? parseInt(titleFontId as string) : null,
                subHeadingFontId: subHeadingFontId ? parseInt(subHeadingFontId as string) : null,
                sensorLabelsFontId: sensorLabelsFontId ? parseInt(sensorLabelsFontId as string) : null,
                sensorValuesFontId: sensorValuesFontId ? parseInt(sensorValuesFontId as string) : null,
                sensorUnitsFontId: sensorUnitsFontId ? parseInt(sensorUnitsFontId as string) : null,
                textSize: textSize || null,
                labelSize: labelSize || null,
                valueSize: valueSize || null,

                // Chart Options
                chartOutlineVisible: chartOutlineVisible || false,
                showLegend: showLegend || false,
                positionLegendInside: positionLegendInside || false,
                showXAxisLabels: showXAxisLabels || false,
                showYAxisLabels: showYAxisLabels || false,
                gridDensity: gridDensity ? parseInt(gridDensity as string) : null,
                historyPointsToShow: historyPointsToShow ? parseInt(historyPointsToShow as string) : null,
                chartScrollSpeed: chartScrollSpeed || null,
                showUnits: showUnits || false,
                decimalPlaces: decimalPlaces || null,          

                // Responsive Layout
                isResponsive: isResponsive || false,
                mobileLayoutBehavior: mobileLayoutBehavior || null,

                // Theming
                themeId: themeId ? parseInt(themeId as string) : null,
                inheritThemeStyles: inheritThemeStyles || false,

                // Interactive Behavior
                allowInteraction: allowInteraction || false,
                onClickBehavior: onClickBehavior || null,
                navigationTarget: navigationTarget || null,

                // Data Handling
                dataRefreshIntervalSeconds: dataRefreshIntervalSeconds ? parseInt(dataRefreshIntervalSeconds as string) : null,
                cacheData: cacheData || false,
                dataFilterCriteria: dataFilterCriteria || null,

                // Media
                backgroundImageUrl: backgroundImageUrl || null,
                backgroundImageId: backgroundImageId || null,
                imageFit: imageFit || null,

                // Performance and Optimization
                lazyLoad: lazyLoad || false,
                renderPriority: renderPriority ? parseInt(renderPriority as string) : null,
                enableScrollbars: enableScrollbars || false,
                minWidth: minWidth ? parseInt(minWidth as string) : null,
                maxWidth: maxWidth ? parseInt(maxWidth as string) : null,
                minHeight: minHeight ? parseInt(minHeight as string) : null,
                maxHeight: maxHeight ? parseInt(maxHeight as string) : null,
            };

            // Validate required fields
            if (layoutType === "CUSTOM" && !customLayoutType) {
                showSnackbar("Custom Layout Type is required when CUSTOM layout is selected.", "error");
                return;
            }

            // Log the payload to console for debugging
            console.log("Payload being sent:", JSON.stringify(payload, null, 2));

            const response = await fetch(url, {
                method: method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error("Failed to save payload");
            }

            showSnackbar("Payload saved successfully.", "success");
            navigate("/payloads");
        } catch (err) {
            showSnackbar("Error saving payload.", "error");
        }
    };

    const handleBack = () => {
        navigate("/layouts");
    };

    const previewPayload = React.useMemo(() => {
        // base config
        const payload: any = {
            type: "config",
            screenId: `preview-${id || "new"}`,
            [layoutType.toLowerCase()]: {
                // basic & metadata
                display_name: displayName,
                description: description,
                version: version,
                is_draft: isDraft,
                is_published: isPublished,
                is_template: isTemplate,
                created_by: createdBy,
                include_prefix_config: includePrefixConfig,
                include_prefix_sensor: includePrefixSensor,
                json_layout_config: jsonLayoutConfig,
                // layout specifics
                rows: parseInt(rows as string) || 1,
                columns: parseInt(columns as string) || 1,
                // margins & padding
                top_margin: parseInt(topMargin as string) || 0,
                bottom_margin: parseInt(bottomMargin as string) || 0,
                left_margin: parseInt(leftMargin as string) || 0,
                right_margin: parseInt(rightMargin as string) || 0,
                outer_padding: parseInt(outerPadding as string) || 0,
                inner_padding: parseInt(innerPadding as string) || 0,
                // styling
                text_color: textColor,
                background_color: backgroundColor,
                border_color: borderColor,
                border_visible: borderVisible,
                border_thickness: parseInt(borderThickness as string) || 0,
                rounded_corners: roundedCorners,
                border_radius_size: parseInt(borderRadiusSize as string) || 0,
                opacity_percentage: parseInt(opacityPercentage as string) || 0,
                gradient_direction: gradientDirection,
                gradient_end_color: gradientEndColor,
                // text & alignment
                text_alignment: textAlignment,
                text_size: textSize,
                label_size: labelSize,
                value_size: valueSize,
                justify_content: justifyContent,
                align_items: alignItems,
                // fonts
                title_font_id: parseInt(titleFontId as string) || 0,
                sub_heading_font_id: parseInt(subHeadingFontId as string) || 0,
                sensor_labels_font_id: parseInt(sensorLabelsFontId as string) || 0,
                sensor_values_font_id: parseInt(sensorValuesFontId as string) || 0,
                sensor_units_font_id: parseInt(sensorUnitsFontId as string) || 0,
                inherit_theme_styles: inheritThemeStyles,
                // chart
                chart_outline_visible: chartOutlineVisible,
                show_legend: showLegend,
                position_legend_inside: positionLegendInside,
                show_x_axis_labels: showXAxisLabels,
                show_y_axis_labels: showYAxisLabels,
                grid_density: parseInt(gridDensity as string) || 0,
                chart_scroll_speed: parseInt(chartScrollSpeed as string) || 0,
                history_points_to_show: parseInt(historyPointsToShow as string) || 0,
                show_units: showUnits,
                decimal_places: decimalPlaces,
                // animation
                animation_type: animationType,
                animation_duration: parseInt(animationDuration as string) || 0,
                // responsive
                is_responsive: isResponsive,
                mobile_layout_behavior: mobileLayoutBehavior,
                // interaction
                allow_interaction: allowInteraction,
                on_click_behavior: onClickBehavior,
                navigation_target: navigationTarget,
                // data
                data_refresh_interval_seconds: parseInt(dataRefreshIntervalSeconds as string) || 0,
                cache_data: cacheData,
                data_filter_criteria: dataFilterCriteria,
                // media
                background_image_url: backgroundImageUrl,
                background_image_id: backgroundImageId,
                image_fit: imageFit,
                // performance
                lazy_load: lazyLoad,
                render_priority: parseInt(renderPriority as string) || 0,
                enable_scrollbars: enableScrollbars,
                min_width: parseInt(minWidth as string) || 0,
                max_width: parseInt(maxWidth as string) || 0,
                min_height: parseInt(minHeight as string) || 0,
                max_height: parseInt(maxHeight as string) || 0,
            },
            // fake layout array
            layout: Array.from({ length: parseInt(previewSensors as string) || 0 }, (_, i) => ({
                id: i + 1,
                label: `Sensor ${i + 1}`
            }))
        };

        return payload;
    }, [
        id,
        layoutType,
        displayName,
        description,
        version,
        isDraft,
        isPublished,
        isTemplate,
        createdBy,
        includePrefixConfig,
        includePrefixSensor,
        jsonLayoutConfig,
        rows,
        columns,
        topMargin,
        bottomMargin,
        leftMargin,
        rightMargin,
        outerPadding,
        innerPadding,
        textColor,
        backgroundColor,
        borderColor,
        borderVisible,
        borderThickness,
        roundedCorners,
        borderRadiusSize,
        opacityPercentage,
        gradientDirection,
        gradientEndColor,
        textAlignment,
        textSize,
        labelSize,
        valueSize,
        justifyContent,
        alignItems,
        titleFontId,
        subHeadingFontId,
        sensorLabelsFontId,
        sensorValuesFontId,
        sensorUnitsFontId,
        inheritThemeStyles,
        chartOutlineVisible,
        showLegend,
        positionLegendInside,
        showXAxisLabels,
        showYAxisLabels,
        gridDensity,
        chartScrollSpeed,
        historyPointsToShow,
        showUnits,
        decimalPlaces,
        animationType,
        animationDuration,
        isResponsive,
        mobileLayoutBehavior,
        allowInteraction,
        onClickBehavior,
        navigationTarget,
        dataRefreshIntervalSeconds,
        cacheData,
        dataFilterCriteria,
        backgroundImageUrl,
        backgroundImageId,
        imageFit,
        lazyLoad,
        renderPriority,
        enableScrollbars,
        minWidth,
        maxWidth,
        minHeight,
        maxHeight,
        previewSensors
    ]);

    const fetchPreviewPayload = async () => {
        if (!id) return;

        // Ensure previewSensors is a valid number (at least 0)
        const safePreviewSensors = previewSensors === null || previewSensors === ""
            ? 0
            : parseInt(previewSensors as string) || 0;

        try {
            // Create a clean payload object for the API call
            const apiPayload = {
                type: "config",
                screenId: `preview-${id || "new"}`,
                [layoutType.toLowerCase()]: {
                    // Include ALL the same properties as in previewPayload
                    display_name: displayName,
                    description: description,
                    version: version,
                    is_draft: isDraft,
                    is_published: isPublished,
                    is_template: isTemplate,
                    created_by: createdBy,
                    include_prefix_config: includePrefixConfig,
                    include_prefix_sensor: includePrefixSensor,
                    json_layout_config: jsonLayoutConfig,
                    rows: parseInt(rows as string) || 0,
                    columns: parseInt(columns as string) || 0,
                    top_margin: parseInt(topMargin as string) || 0,
                    bottom_margin: parseInt(bottomMargin as string) || 0,
                    left_margin: parseInt(leftMargin as string) || 0,
                    right_margin: parseInt(rightMargin as string) || 0,
                    outer_padding: parseInt(outerPadding as string) || 0,
                    inner_padding: parseInt(innerPadding as string) || 0,
                    text_color: textColor,
                    background_color: backgroundColor,
                    border_color: borderColor,
                    border_visible: borderVisible,
                    border_thickness: parseInt(borderThickness as string) || 0,
                    rounded_corners: roundedCorners,
                    border_radius_size: parseInt(borderRadiusSize as string) || 0,
                    opacity_percentage: parseInt(opacityPercentage as string) || 0,
                    gradient_direction: gradientDirection,
                    gradient_end_color: gradientEndColor,
                    text_alignment: textAlignment,
                    text_size: textSize,
                    label_size: labelSize,
                    value_size: valueSize,
                    justify_content: justifyContent,
                    align_items: alignItems,
                    title_font_id: parseInt(titleFontId as string) || 0,
                    sub_heading_font_id: parseInt(subHeadingFontId as string) || 0,
                    sensor_labels_font_id: parseInt(sensorLabelsFontId as string) || 0,
                    sensor_values_font_id: parseInt(sensorValuesFontId as string) || 0,
                    sensor_units_font_id: parseInt(sensorUnitsFontId as string) || 0,
                    inherit_theme_styles: inheritThemeStyles,
                    chart_outline_visible: chartOutlineVisible,
                    show_legend: showLegend,
                    position_legend_inside: positionLegendInside,
                    show_x_axis_labels: showXAxisLabels,
                    show_y_axis_labels: showYAxisLabels,
                    grid_density: parseInt(gridDensity as string) || 0,
                    chart_scroll_speed: parseInt(chartScrollSpeed as string) || 0,
                    history_points_to_show: parseInt(historyPointsToShow as string) || 0,
                    show_units: showUnits,
                    decimal_places: decimalPlaces,
                    animation_type: animationType,
                    animation_duration: parseInt(animationDuration as string) || 0,
                    is_responsive: isResponsive,
                    mobile_layout_behavior: mobileLayoutBehavior,
                    allow_interaction: allowInteraction,
                    on_click_behavior: onClickBehavior,
                    navigation_target: navigationTarget,
                    data_refresh_interval_seconds: parseInt(dataRefreshIntervalSeconds as string) || 0,
                    cache_data: cacheData,
                    data_filter_criteria: dataFilterCriteria,
                    background_image_url: backgroundImageUrl,
                    background_image_id: backgroundImageId,
                    image_fit: imageFit,
                    lazy_load: lazyLoad,
                    render_priority: parseInt(renderPriority as string) || 0,
                    enable_scrollbars: enableScrollbars,
                    min_width: parseInt(minWidth as string) || 0,
                    max_width: parseInt(maxWidth as string) || 0,
                    min_height: parseInt(minHeight as string) || 0,
                    max_height: parseInt(maxHeight as string) || 0,
                },
                // Ensure we have a valid layout array even if empty
                layout: Array.from({ length: safePreviewSensors }, (_, i) => ({
                    id: i + 1,
                    label: `Sensor ${i + 1}`
                }))
            };

            console.log("Sending API payload:", JSON.stringify(apiPayload));

            const response = await fetch(
                `/api/layouts/${id}/preview-payload?sensorCount=${safePreviewSensors}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(apiPayload)
                }
            );

            if (!response.ok) {
                throw new Error(`Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log("Received payload data:", data);

            // Process the config payload
            if (data.configPayload) {
                try {
                    const configValues = Object.values(data.configPayload);
                    if (configValues && configValues.length > 0) {
                        const rawConfig = configValues[0] as string;
                        const prefixConfig = rawConfig.slice(0, 8);
                        const jsonPartConfig = rawConfig.slice(8);
                        let prettyConfig = jsonPartConfig;
                        try {
                            prettyConfig = JSON.stringify(JSON.parse(jsonPartConfig), null, 2);
                        } catch (err: any) {
                            console.error("Failed to parse JSON config:", err);
                        }

                        // Update config payload state
                        setPayloadJson(`${prefixConfig}\n${prettyConfig}`);
                    } else {
                        setPayloadJson("No config payload data available");
                    }
                } catch (err: any) {
                    console.error("Error processing config payload:", err);
                    setPayloadJson(`Error processing config: ${err.message || "Unknown error"}`);
                }
            } else {
                setPayloadJson("No config payload returned");
            }

            // Process the sensor payload - with safer checks
            if (data.sensorPayload) {
                try {
                    const sensorValues = Object.values(data.sensorPayload);
                    if (sensorValues && sensorValues.length > 0) {
                        const rawSensor = sensorValues[0] as string;
                        // Only try to slice if rawSensor is a string and has content
                        if (typeof rawSensor === 'string' && rawSensor.length > 8) {
                            const prefixSensor = rawSensor.slice(0, 8);
                            const jsonPartSensor = rawSensor.slice(8);
                            let prettySensor = jsonPartSensor;
                            try {
                                prettySensor = JSON.stringify(JSON.parse(jsonPartSensor), null, 2);
                            } catch (err: any) {
                                console.error("Failed to parse JSON sensor data:", err);
                            }

                            // Update sensor payload state
                            setSensorPreviewJson(`${prefixSensor}\n${prettySensor}`);
                        } else {
                            // Handle empty string or short string
                            setSensorPreviewJson(typeof rawSensor === 'string' ? rawSensor : "Empty sensor payload");
                        }
                    } else {
                        // Empty object or array
                        setSensorPreviewJson("");
                    }
                } catch (err: any) {
                    console.error("Error processing sensor payload:", err);
                    setSensorPreviewJson("");
                }
            } else if (safePreviewSensors === 0) {
                // Expected behavior when no sensors
                setSensorPreviewJson("");
            } else {
                // No sensor payload (unexpected)
                console.warn("No sensor payload in response");
                setSensorPreviewJson("");
            }

            return data;
        } catch (err: any) {
            console.error("Error fetching preview payload:", err);
            setPayloadJson(`Error loading payload: ${err.message || 'Unknown error'}`);
            setSensorPreviewJson(`Error loading sensor data: ${err.message || 'Unknown error'}`);
        }
    };

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h5" gutterBottom>
                Configure Payload
            </Typography>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                    <CircularProgress size={24} />
                    <Typography variant="body2" sx={{ marginLeft: 2 }}>Fetching Layout Data...</Typography>
                </Box>
            ) : (
                <>
                    {/* Preview Section - Now as a dedicated component */}
                        <LayoutPreview
                            layoutType={layoutType}
                            previewHeight={previewHeight}
                            setPreviewHeight={setPreviewHeight}
                            previewWidth={previewWidth}
                            setPreviewWidth={setPreviewWidth}
                            previewSensors={previewSensors}
                            setPreviewSensors={setPreviewSensors}
                            backgroundColor={backgroundColor}
                            backgroundImageUrl={backgroundImageUrl}
                            imageFit={imageFit}
                            textColor={textColor}
                            borderVisible={borderVisible}
                            borderThickness={borderThickness}
                            borderColor={borderColor}
                            roundedCorners={roundedCorners}
                            borderRadiusSize={borderRadiusSize}
                            rows={rows}
                            columns={columns}
                            topMargin={topMargin}
                            bottomMargin={bottomMargin}
                            leftMargin={leftMargin}
                            rightMargin={rightMargin}
                            outerPadding={outerPadding}
                            innerPadding={innerPadding}
                            opacityPercentage={opacityPercentage}
                            gradientDirection={gradientDirection}
                            gradientEndColor={gradientEndColor}
                            justifyContent={justifyContent}
                            alignItems={alignItems}
                            textAlignment={textAlignment}
                            labelSize={labelSize}
                            valueSize={valueSize}
                            showUnits={showUnits}
                            payloadJson={payloadJson}
                            onRefreshPayload={fetchPreviewPayload}
                            sensorPreviewJson={sensorPreviewJson}
                            onRefreshSensorPreview={fetchPreviewPayload}
                        />

                    {/* Tabbed Configuration Interface */}
                    <Paper sx={{ marginBottom: 2 }}>
                        <Tabs
                            value={currentTab}
                            onChange={handleTabChange}
                            variant="scrollable"
                            scrollButtons="auto"
                            sx={{ borderBottom: 1, borderColor: 'divider' }}
                        >
                            <Tab icon={<SettingsIcon fontSize="small" />} label="Basic Settings" />
                            <Tab icon={<AspectRatioIcon fontSize="small" />} label="Layout & Sizing" />
                            <Tab icon={<PaletteIcon fontSize="small" />} label="Appearance" />
                            <Tab icon={<TextFieldsIcon fontSize="small" />} label="Fonts & Text" />
                            <Tab icon={<InsertChartIcon fontSize="small" />} label="Chart Options" />
                            <Tab icon={<AnimationIcon fontSize="small" />} label="Animation" />
                            <Tab icon={<PhoneAndroidIcon fontSize="small" />} label="Responsive" />
                            <Tab icon={<TouchAppIcon fontSize="small" />} label="Interaction" />
                            <Tab icon={<DataObjectIcon fontSize="small" />} label="Data" />
                            <Tab icon={<PhotoIcon fontSize="small" />} label="Media" />
                            <Tab icon={<SpeedIcon fontSize="small" />} label="Performance" />
                            <Tab icon={<DataObjectIcon fontSize="small" />} label="Custom Attributes" />
                        </Tabs>

                        {/* Basic Settings Tab */}
                            <TabPanel value={currentTab} index={0}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                        <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                            <TextField
                                                label="Display Name"
                                                fullWidth
                                                value={displayName}
                                                onChange={(e) => setDisplayName(e.target.value)}
                                                size="small"
                                                margin="dense"
                                                disabled={isTemplate}
                                            />
                                        </Box>
                                        <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                            <TextField
                                                label="Version"
                                                fullWidth
                                                value={version}
                                                onChange={(e) => setVersion(e.target.value)}
                                                size="small"
                                                margin="dense"
                                                disabled={isTemplate}
                                            />
                                        </Box>
                                    </Box>
                                    <TextField
                                        label="Description"
                                        fullWidth
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        size="small"
                                        margin="dense"
                                        multiline
                                        rows={2}
                                        disabled={isTemplate}
                                    />
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                            <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                                <FormControl fullWidth size="small" margin="dense">
                                                    <InputLabel>Layout Type</InputLabel>
                                                    <Select
                                                        value={layoutType}
                                                        onChange={e => setLayoutType(e.target.value as LayoutType)}
                                                        label="Layout Type"
                                                        disabled={isTemplate}
                                                    >
                                                        <MenuItem value="LVGL_ASTRO">LVGL_ASTRO</MenuItem>
                                                        <MenuItem value="LVGL_GRID">LVGL_GRID</MenuItem>
                                                        <MenuItem value="LVGL_RADIO">LVGL_RADIO</MenuItem>
                                                        <MenuItem value="LVGL_PLOTTER">LVGL_PLOTTER</MenuItem>
                                                        <MenuItem value="QUAD">QUAD</MenuItem>
                                                        <MenuItem value="MATRIX">MATRIX</MenuItem>
                                                        <MenuItem value="NEOPIXEL">NEOPIXEL</MenuItem>
                                                        <MenuItem value="CUSTOM">CUSTOM</MenuItem>
                                                    </Select>
                                                </FormControl>

                                                {/* CustomLayoutType text field - only visible when CUSTOM is selected */}
                                                {layoutType === "CUSTOM" && (
                                                    <TextField
                                                        label="Custom Layout Type"
                                                        fullWidth
                                                        value={customLayoutType}
                                                        onChange={(e) => setCustomLayoutType(e.target.value)}
                                                        size="small"
                                                        margin="dense"
                                                        disabled={isTemplate}
                                                        required
                                                        error={layoutType === "CUSTOM" && !customLayoutType}
                                                        helperText={layoutType === "CUSTOM" && !customLayoutType
                                                            ? "Required for CUSTOM layouts (e.g. lvgl_run)"
                                                            : "Specify the layout type to use (e.g. lvgl_run, lvgl_grid)"}
                                                        sx={{ mt: 1 }}
                                                    />
                                                )}
                                            </Box>
                                            <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                                <TextField
                                                    label="Created By"
                                                    fullWidth
                                                    value={createdBy}
                                                    onChange={(e) => setCreatedBy(e.target.value)}
                                                    size="small"
                                                    margin="dense"
                                                    disabled={isTemplate}
                                                />
                                            </Box>
                                        </Box>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={isDraft}
                                                        onChange={() => setIsDraft(!isDraft)}
                                                        size="small"
                                                        disabled={isTemplate}
                                                    />
                                                }
                                                label="Is Draft"
                                            />
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={isPublished}
                                                        onChange={() => setIsPublished(!isPublished)}
                                                        size="small"
                                                        disabled={isTemplate}
                                                    />
                                                }
                                                label="Is Published"
                                            />
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={isTemplate}
                                                        onChange={() => setIsTemplate(!isTemplate)}
                                                        size="small"
                                                        disabled={true}  // Always disabled
                                                    />
                                                }
                                                label="Is Template"
                                            />
                                        </Box>
                                    </Box>
                                </Box>
                            </TabPanel>

                        {/* Layout & Sizing Tab */}
                        <TabPanel value={currentTab} index={1}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <Typography variant="subtitle2" gutterBottom>Grid Dimensions</Typography>
                                        <Box sx={{ display: 'flex', gap: 2 }}>
                                                <TextField
                                                    label="Rows"
                                                    fullWidth
                                                    value={rows}
                                                    onChange={(e) => setRows(e.target.value)}
                                                    type="number"
                                                    size="small"
                                                    margin="dense"
                                                    disabled={isTemplate}
                                                    slotProps={{
                                                        htmlInput: { min: 0 }
                                                    }}
                                                />
                                                <TextField
                                                    label="Columns"
                                                    fullWidth
                                                    value={columns}
                                                    onChange={(e) => setColumns(e.target.value)}
                                                    type="number"
                                                    size="small"
                                                    margin="dense"
                                                    disabled={isTemplate}
                                                    slotProps={{
                                                        htmlInput: { min: 0 }
                                                    }}
                                                />
                                        </Box>
                                    </Box>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <Typography variant="subtitle2" gutterBottom>Size Constraints</Typography>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                            <Box sx={{ flex: '1 1 45%', minWidth: '100px' }}>
                                                <TextField
                                                    label="Min Width"
                                                    fullWidth
                                                    value={minWidth}
                                                    onChange={(e) => setMinWidth(e.target.value)}
                                                    type="number"
                                                    size="small"
                                                    margin="dense"
                                                    disabled={isTemplate}
                                                />
                                            </Box>
                                            <Box sx={{ flex: '1 1 45%', minWidth: '100px' }}>
                                                <TextField
                                                    label="Max Width"
                                                    fullWidth
                                                    value={maxWidth}
                                                    onChange={(e) => setMaxWidth(e.target.value)}
                                                    type="number"
                                                    size="small"
                                                    margin="dense"
                                                    disabled={isTemplate}
                                                />
                                            </Box>
                                            <Box sx={{ flex: '1 1 45%', minWidth: '100px' }}>
                                                <TextField
                                                    label="Min Height"
                                                    fullWidth
                                                    value={minHeight}
                                                    onChange={(e) => setMinHeight(e.target.value)}
                                                    type="number"
                                                    size="small"
                                                    margin="dense"
                                                    disabled={isTemplate}
                                                />
                                            </Box>
                                            <Box sx={{ flex: '1 1 45%', minWidth: '100px' }}>
                                                <TextField
                                                    label="Max Height"
                                                    fullWidth
                                                    value={maxHeight}
                                                    onChange={(e) => setMaxHeight(e.target.value)}
                                                    type="number"
                                                    size="small"
                                                    margin="dense"
                                                    disabled={isTemplate}
                                                />
                                            </Box>
                                        </Box>
                                    </Box>
                                </Box>

                                <Divider sx={{ my: 1 }} />

                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <Typography variant="subtitle2" gutterBottom>Margins</Typography>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                            <Box sx={{ flex: '1 1 45%', minWidth: '100px' }}>
                                                <TextField
                                                    label="Top Margin"
                                                    fullWidth
                                                    value={topMargin}
                                                    onChange={(e) => setTopMargin(e.target.value)}
                                                    type="number"
                                                    size="small"
                                                    margin="dense"
                                                    disabled={isTemplate}
                                                />
                                            </Box>
                                            <Box sx={{ flex: '1 1 45%', minWidth: '100px' }}>
                                                <TextField
                                                    label="Bottom Margin"
                                                    fullWidth
                                                    value={bottomMargin}
                                                    onChange={(e) => setBottomMargin(e.target.value)}
                                                    type="number"
                                                    size="small"
                                                    margin="dense"
                                                    disabled={isTemplate}
                                                />
                                            </Box>
                                            <Box sx={{ flex: '1 1 45%', minWidth: '100px' }}>
                                                <TextField
                                                    label="Left Margin"
                                                    fullWidth
                                                    value={leftMargin}
                                                    onChange={(e) => setLeftMargin(e.target.value)}
                                                    type="number"
                                                    size="small"
                                                    margin="dense"
                                                    disabled={isTemplate}
                                                />
                                            </Box>
                                            <Box sx={{ flex: '1 1 45%', minWidth: '100px' }}>
                                                <TextField
                                                    label="Right Margin"
                                                    fullWidth
                                                    value={rightMargin}
                                                    onChange={(e) => setRightMargin(e.target.value)}
                                                    type="number"
                                                    size="small"
                                                    margin="dense"
                                                    disabled={isTemplate}
                                                />
                                            </Box>
                                        </Box>
                                    </Box>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <Typography variant="subtitle2" gutterBottom>Padding</Typography>
                                        <Box sx={{ display: 'flex', gap: 2 }}>
                                            <TextField
                                                label="Outer Padding"
                                                fullWidth
                                                value={outerPadding}
                                                onChange={(e) => setOuterPadding(e.target.value)}
                                                type="number"
                                                size="small"
                                                margin="dense"
                                                helperText="Space between cells"
                                                disabled={isTemplate}
                                            />
                                            <TextField
                                                label="Inner Padding"
                                                fullWidth
                                                value={innerPadding}
                                                onChange={(e) => setInnerPadding(e.target.value)}
                                                type="number"
                                                size="small"
                                                margin="dense"
                                                helperText="Space inside cells"
                                                disabled={isTemplate}
                                            />
                                        </Box>
                                    </Box>
                                </Box>

                                <Divider sx={{ my: 1 }} />

                                <Box>
                                    <Typography variant="subtitle2" gutterBottom>Alignment & Positioning</Typography>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                        <Box sx={{ flex: '1 1 30%', minWidth: '150px' }}>
                                            <FormControl fullWidth size="small" margin="dense">
                                                <InputLabel>Justify Content</InputLabel>
                                                <Select
                                                    value={justifyContent}
                                                    onChange={(e) => setJustifyContent(e.target.value)}
                                                    label="Justify Content"
                                                    disabled={isTemplate}
                                                >
                                                    <MenuItem value="flex-start">Flex Start</MenuItem>
                                                    <MenuItem value="center">Center</MenuItem>
                                                    <MenuItem value="flex-end">Flex End</MenuItem>
                                                    <MenuItem value="space-between">Space Between</MenuItem>
                                                    <MenuItem value="space-around">Space Around</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Box>
                                        <Box sx={{ flex: '1 1 30%', minWidth: '150px' }}>
                                            <FormControl fullWidth size="small" margin="dense">
                                                <InputLabel>Align Items</InputLabel>
                                                <Select
                                                    value={alignItems}
                                                    onChange={(e) => setAlignItems(e.target.value)}
                                                    label="Align Items"
                                                    disabled={isTemplate}
                                                >
                                                    <MenuItem value="stretch">Stretch</MenuItem>
                                                    <MenuItem value="center">Center</MenuItem>
                                                    <MenuItem value="flex-start">Flex Start</MenuItem>
                                                    <MenuItem value="flex-end">Flex End</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Box>
                                        <Box sx={{ flex: '1 1 30%', minWidth: '150px' }}>
                                            <FormControl fullWidth size="small" margin="dense">
                                                <InputLabel>Text Alignment</InputLabel>
                                                <Select
                                                    value={textAlignment}
                                                    onChange={(e) => setTextAlignment(e.target.value)}
                                                    label="Text Alignment"
                                                    disabled={isTemplate}
                                                >
                                                    <MenuItem value="left">Left</MenuItem>
                                                    <MenuItem value="center">Center</MenuItem>
                                                    <MenuItem value="right">Right</MenuItem>
                                                    <MenuItem value="justified">Justified</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Box>
                                    </Box>
                                </Box>
                            </Box>
                        </TabPanel>

                        {/* Appearance Tab */}
                        <TabPanel value={currentTab} index={2}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <Typography variant="subtitle2" gutterBottom>Colors</Typography>
                                        <ColorPickerInput
                                            label="Background Color"
                                            value={backgroundColor}
                                            onChange={setBackgroundColor}
                                            placeholder="#000000"
                                            disabled={isTemplate}
                                        />
                                        <ColorPickerInput
                                            label="Text Color"
                                            value={textColor}
                                            onChange={setTextColor}
                                            placeholder="#FFFFFF"
                                            disabled={isTemplate}
                                        />
                                    </Box>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <Typography variant="subtitle2" gutterBottom>Gradient</Typography>
                                        <ColorPickerInput
                                            label="Gradient End Color"
                                            value={gradientEndColor}
                                            onChange={setGradientEndColor}
                                            placeholder="#000000"
                                            disabled={isTemplate}
                                        />
                                        <FormControl fullWidth size="small" margin="dense">
                                            <InputLabel>Gradient Direction</InputLabel>
                                            <Select
                                                value={gradientDirection}
                                                onChange={(e) => setGradientDirection(e.target.value)}
                                                label="Gradient Direction"
                                                disabled={isTemplate}
                                            >
                                                <MenuItem value="vertical">Vertical</MenuItem>
                                                <MenuItem value="horizontal">Horizontal</MenuItem>
                                                <MenuItem value="diagonal">Diagonal</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Box>
                                </Box>

                                <Divider sx={{ my: 1 }} />

                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <Typography variant="subtitle2" gutterBottom>Borders</Typography>
                                        <ColorPickerInput
                                            label="Border Color"
                                            value={borderColor}
                                            onChange={setBorderColor}
                                            placeholder="#CCCCCC"
                                            disabled={isTemplate}
                                        />
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                                            <TextField
                                                label="Border Thickness"
                                                fullWidth
                                                value={borderThickness}
                                                onChange={(e) => setBorderThickness(e.target.value)}
                                                type="number"
                                                size="small"
                                                margin="dense"
                                                disabled={isTemplate}
                                            />
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={borderVisible}
                                                        onChange={() => setBorderVisible(!borderVisible)}
                                                        size="small"
                                                        disabled={isTemplate}
                                                    />
                                                }
                                                label="Visible"
                                            />
                                        </Box>
                                    </Box>
                                        <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                            <Typography variant="subtitle2" gutterBottom>Corners & Opacity</Typography>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            checked={roundedCorners}
                                                            onChange={() => setRoundedCorners(!roundedCorners)}
                                                            size="small"
                                                            disabled={isTemplate}
                                                        />
                                                    }
                                                    label="Rounded Corners"
                                                />
                                                <TextField
                                                    label="Border Radius"
                                                    fullWidth
                                                    value={borderRadiusSize}
                                                    onChange={(e) => setBorderRadiusSize(e.target.value)}
                                                    type="number"
                                                    size="small"
                                                    margin="dense"
                                                    disabled={!roundedCorners || isTemplate}
                                                    slotProps={{
                                                        htmlInput: { min: 0 }
                                                    }}
                                                />
                                            </Box>
                                            <TextField
                                                label="Opacity (%)"
                                                fullWidth
                                                value={opacityPercentage}
                                                onChange={(e) => setOpacityPercentage(e.target.value)}
                                                type="number"
                                                size="small"
                                                margin="dense"
                                                slotProps={{
                                                    htmlInput: { min: 0, max: 100 }
                                                }}
                                                disabled={isTemplate}
                                            />
                                        </Box>
                                </Box>
                            </Box>
                        </TabPanel>

                            {/* Fonts & Text Tab */}
                            <TabPanel value={currentTab} index={3}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <Typography variant="subtitle2" gutterBottom>Text Sizes</Typography>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                        <Box sx={{ flex: '1 1 30%', minWidth: '150px' }}>
                                            <FormControl fullWidth size="small" margin="dense">
                                                <InputLabel>Text Size</InputLabel>
                                                <Select
                                                    value={textSize}
                                                    onChange={(e) => setTextSize(e.target.value)}
                                                    label="Text Size"
                                                    disabled={isTemplate}
                                                >
                                                    <MenuItem value="small">Small</MenuItem>
                                                    <MenuItem value="medium">Medium</MenuItem>
                                                    <MenuItem value="large">Large</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Box>
                                        <Box sx={{ flex: '1 1 30%', minWidth: '150px' }}>
                                            <FormControl fullWidth size="small" margin="dense">
                                                <InputLabel>Label Size</InputLabel>
                                                <Select
                                                    value={labelSize}
                                                    onChange={(e) => setLabelSize(e.target.value)}
                                                    label="Label Size"
                                                    disabled={isTemplate}
                                                >
                                                    <MenuItem value="10px">10px</MenuItem>
                                                    <MenuItem value="12px">12px</MenuItem>
                                                    <MenuItem value="14px">14px</MenuItem>
                                                    <MenuItem value="16px">16px</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Box>
                                        <Box sx={{ flex: '1 1 30%', minWidth: '150px' }}>
                                            <FormControl fullWidth size="small" margin="dense">
                                                <InputLabel>Value Size</InputLabel>
                                                <Select
                                                    value={valueSize}
                                                    onChange={(e) => setValueSize(e.target.value)}
                                                    label="Value Size"
                                                    disabled={isTemplate}
                                                >
                                                    <MenuItem value="12px">12px</MenuItem>
                                                    <MenuItem value="14px">14px</MenuItem>
                                                    <MenuItem value="16px">16px</MenuItem>
                                                    <MenuItem value="18px">18px</MenuItem>
                                                    <MenuItem value="20px">20px</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Box>
                                    </Box>

                                    <Divider sx={{ my: 1 }} />

                                    <Typography variant="subtitle2" gutterBottom>Font Selections</Typography>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                        <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                            <FormControl fullWidth size="small" margin="dense">
                                                <InputLabel>Title Font</InputLabel>
                                                <Select
                                                    value={titleFontId}
                                                    onChange={(e) => setTitleFontId(e.target.value)}
                                                    label="Title Font"
                                                    disabled={isTemplate}
                                                >
                                                    <MenuItem value={1}>Sans Serif</MenuItem>
                                                    <MenuItem value={2}>Serif</MenuItem>
                                                    <MenuItem value={3}>Monospace</MenuItem>
                                                    <MenuItem value={4}>Display</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Box>
                                        <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                            <FormControl fullWidth size="small" margin="dense">
                                                <InputLabel>Sub Heading Font</InputLabel>
                                                <Select
                                                    value={subHeadingFontId}
                                                    onChange={(e) => setSubHeadingFontId(e.target.value)}
                                                    label="Sub Heading Font"
                                                    disabled={isTemplate}
                                                >
                                                    <MenuItem value={1}>Sans Serif</MenuItem>
                                                    <MenuItem value={2}>Serif</MenuItem>
                                                    <MenuItem value={3}>Monospace</MenuItem>
                                                    <MenuItem value={4}>Display</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Box>
                                    </Box>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                        <Box sx={{ flex: '1 1 30%', minWidth: '150px' }}>
                                            <FormControl fullWidth size="small" margin="dense">
                                                <InputLabel>Sensor Labels Font</InputLabel>
                                                <Select
                                                    value={sensorLabelsFontId}
                                                    onChange={(e) => setSensorLabelsFontId(e.target.value)}
                                                    label="Sensor Labels Font"
                                                    disabled={isTemplate}
                                                >
                                                    <MenuItem value={1}>Sans Serif</MenuItem>
                                                    <MenuItem value={2}>Serif</MenuItem>
                                                    <MenuItem value={3}>Monospace</MenuItem>
                                                    <MenuItem value={4}>Display</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Box>
                                        <Box sx={{ flex: '1 1 30%', minWidth: '150px' }}>
                                            <FormControl fullWidth size="small" margin="dense">
                                                <InputLabel>Sensor Values Font</InputLabel>
                                                <Select
                                                    value={sensorValuesFontId}
                                                    onChange={(e) => setSensorValuesFontId(e.target.value)}
                                                    label="Sensor Values Font"
                                                    disabled={isTemplate}
                                                >
                                                    <MenuItem value={1}>Sans Serif</MenuItem>
                                                    <MenuItem value={2}>Serif</MenuItem>
                                                    <MenuItem value={3}>Monospace</MenuItem>
                                                    <MenuItem value={4}>Display</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Box>
                                        <Box sx={{ flex: '1 1 30%', minWidth: '150px' }}>
                                            <FormControl fullWidth size="small" margin="dense">
                                                <InputLabel>Sensor Units Font</InputLabel>
                                                <Select
                                                    value={sensorUnitsFontId}
                                                    onChange={(e) => setSensorUnitsFontId(e.target.value)}
                                                    label="Sensor Units Font"
                                                    disabled={isTemplate}
                                                >
                                                    <MenuItem value={1}>Sans Serif</MenuItem>
                                                    <MenuItem value={2}>Serif</MenuItem>
                                                    <MenuItem value={3}>Monospace</MenuItem>
                                                    <MenuItem value={4}>Display</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Box>
                                    </Box>

                                    {/* Replace the single FormControlLabel with a flex container for both controls */}
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={showUnits}
                                                    onChange={() => setShowUnits(!showUnits)}
                                                    size="small"
                                                    disabled={isTemplate}
                                                />
                                            }
                                            label="Show Units"
                                        />
                                        <Box sx={{ width: '180px' }}>
                                            <TextField
                                                label="Decimal Places"
                                                fullWidth
                                                value={decimalPlaces}
                                                onChange={(e) => setDecimalPlaces(e.target.value)}
                                                type="number"
                                                size="small"
                                                margin="dense"
                                                slotProps={{
                                                    htmlInput: { min: 0, max: 10 }
                                                }}
                                                disabled={isTemplate}
                                            />
                                        </Box>
                                    </Box>
                                </Box>
                            </TabPanel>

                        {/* Chart Options Tab */}
                        <TabPanel value={currentTab} index={4}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <Typography variant="subtitle2" gutterBottom>Chart Appearance</Typography>
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={chartOutlineVisible}
                                                    onChange={() => setChartOutlineVisible(!chartOutlineVisible)}
                                                    size="small"
                                                    disabled={isTemplate}
                                                />
                                            }
                                            label="Chart Outline Visible"
                                        />
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={showLegend}
                                                    onChange={() => setShowLegend(!showLegend)}
                                                    size="small"
                                                    disabled={isTemplate}
                                                />
                                            }
                                            label="Show Legend"
                                        />
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={positionLegendInside}
                                                    onChange={() => setPositionLegendInside(!positionLegendInside)}
                                                    size="small"
                                                    disabled={!showLegend || isTemplate}
                                                />
                                            }
                                            label="Position Legend Inside"
                                        />
                                    </Box>
                                        <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                            <Typography variant="subtitle2" gutterBottom>Axis & Grid</Typography>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={showXAxisLabels}
                                                        onChange={() => setShowXAxisLabels(!showXAxisLabels)}
                                                        size="small"
                                                        disabled={isTemplate}
                                                    />
                                                }
                                                label="Show X-Axis Labels"
                                            />
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={showYAxisLabels}
                                                        onChange={() => setShowYAxisLabels(!showYAxisLabels)}
                                                        size="small"
                                                        disabled={isTemplate}
                                                    />
                                                }
                                                label="Show Y-Axis Labels"
                                            />
                                            <TextField
                                                label="Grid Density"
                                                fullWidth
                                                value={gridDensity}
                                                onChange={(e) => setGridDensity(e.target.value)}
                                                type="number"
                                                size="small"
                                                margin="dense"
                                                slotProps={{
                                                    htmlInput: { min: 0, max: 10 }
                                                }}
                                                disabled={isTemplate}
                                            />
                                            <TextField
                                                label="Chart Scroll Speed"
                                                fullWidth
                                                value={chartScrollSpeed}
                                                onChange={(e) => setChartScrollSpeed(e.target.value)}
                                                type="number"
                                                size="small"
                                                margin="dense"
                                                helperText="Milliseconds between scroll updates (lower = faster)"
                                                slotProps={{
                                                    htmlInput: { min: 0 }
                                                }}
                                                disabled={isTemplate}
                                            />
                                        </Box>
                                </Box>

                                <Divider sx={{ my: 1 }} />

                                <TextField
                                    label="History Points to Show"
                                    fullWidth
                                    value={historyPointsToShow}
                                    onChange={(e) => setHistoryPointsToShow(e.target.value)}
                                    type="number"
                                    size="small"
                                    margin="dense"
                                    helperText="Number of data points to display in time-series charts"
                                    disabled={isTemplate}
                                />
                            </Box>
                        </TabPanel>

                        {/* Animation Tab */}
                        <TabPanel value={currentTab} index={5}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                    <FormControl fullWidth size="small" margin="dense">
                                        <InputLabel>Animation Type</InputLabel>
                                        <Select
                                            value={animationType}
                                            onChange={(e) => setAnimationType(e.target.value)}
                                            label="Animation Type"
                                            disabled={isTemplate}
                                        >
                                            <MenuItem value="none">None</MenuItem>
                                            <MenuItem value="fade">Fade</MenuItem>
                                            <MenuItem value="slide">Slide</MenuItem>
                                            <MenuItem value="zoom">Zoom</MenuItem>
                                            <MenuItem value="bounce">Bounce</MenuItem>
                                            <MenuItem value="pulse">Pulse</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Box>
                                <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                    <TextField
                                        label="Animation Duration (ms)"
                                        fullWidth
                                        value={animationDuration}
                                        onChange={(e) => setAnimationDuration(e.target.value)}
                                        type="number"
                                        size="small"
                                        margin="dense"
                                        helperText="Duration in milliseconds"
                                        disabled={(animationType === "none" || !animationType) || isTemplate}
                                    />
                                </Box>
                            </Box>
                        </TabPanel>

                        {/* Responsive Tab */}
                        <TabPanel value={currentTab} index={6}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={isResponsive}
                                            onChange={() => setIsResponsive(!isResponsive)}
                                            size="small"
                                            disabled={isTemplate}
                                        />
                                    }
                                    label="Enable Responsive Layout"
                                />
                                <FormControl fullWidth size="small" margin="dense" disabled={!isResponsive || isTemplate}>
                                    <InputLabel>Mobile Layout Behavior</InputLabel>
                                    <Select
                                        value={mobileLayoutBehavior}
                                        onChange={(e) => setMobileLayoutBehavior(e.target.value)}
                                        label="Mobile Layout Behavior"
                                    >
                                        <MenuItem value="stack">Stack</MenuItem>
                                        <MenuItem value="scroll">Scroll</MenuItem>
                                        <MenuItem value="compress">Compress</MenuItem>
                                    </Select>
                                </FormControl>
                            </Box>
                        </TabPanel>

                        {/* Interaction Tab */}
                        <TabPanel value={currentTab} index={7}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={allowInteraction}
                                            onChange={() => setAllowInteraction(!allowInteraction)}
                                            size="small"
                                            disabled={isTemplate}
                                        />
                                    }
                                    label="Allow Interaction"
                                />
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <FormControl fullWidth size="small" margin="dense" disabled={!allowInteraction || isTemplate}>
                                            <InputLabel>On Click Behavior</InputLabel>
                                            <Select
                                                value={onClickBehavior}
                                                onChange={(e) => setOnClickBehavior(e.target.value)}
                                                label="On Click Behavior"
                                            >
                                                <MenuItem value="none">None</MenuItem>
                                                <MenuItem value="expand">Expand</MenuItem>
                                                <MenuItem value="navigate">Navigate</MenuItem>
                                                <MenuItem value="popup">Popup</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Box>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <TextField
                                            label="Navigation Target"
                                            fullWidth
                                            value={navigationTarget}
                                            onChange={(e) => setNavigationTarget(e.target.value)}
                                            size="small"
                                            margin="dense"
                                            disabled={!allowInteraction || onClickBehavior !== "navigate" || isTemplate}
                                            helperText="URL or route to navigate to on click"
                                        />
                                    </Box>
                                </Box>
                            </Box>
                        </TabPanel>

                        {/* Data Tab */}
                        <TabPanel value={currentTab} index={8}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <TextField
                                            label="Data Refresh Interval (seconds)"
                                            fullWidth
                                            value={dataRefreshIntervalSeconds}
                                            onChange={(e) => setDataRefreshIntervalSeconds(e.target.value)}
                                            type="number"
                                            size="small"
                                            margin="dense"
                                            disabled={isTemplate}
                                        />
                                    </Box>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={cacheData}
                                                    onChange={() => setCacheData(!cacheData)}
                                                    size="small"
                                                    disabled={isTemplate}
                                                />
                                            }
                                            label="Cache Data"
                                        />
                                    </Box>
                                </Box>
                                <TextField
                                    label="Data Filter Criteria"
                                    fullWidth
                                    value={dataFilterCriteria}
                                    onChange={(e) => setDataFilterCriteria(e.target.value)}
                                    multiline
                                    rows={3}
                                    size="small"
                                    margin="dense"
                                    helperText="JSON or SQL-like filter expression"
                                    disabled={isTemplate}
                                />
                                
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, mt: 2 }}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={includePrefixConfig}
                                                onChange={() => setIncludePrefixConfig(!includePrefixConfig)}
                                                size="small"
                                                disabled={isTemplate}
                                            />
                                        }
                                        label="Include Prefix for Config Payloads"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={includePrefixSensor}
                                                onChange={() => setIncludePrefixSensor(!includePrefixSensor)}
                                                size="small"
                                                disabled={isTemplate}
                                            />
                                        }
                                        label="Include Prefix for Sensor Payloads"
                                    />
                                </Box>
                            </Box>
                        </TabPanel>

                        {/* Media Tab */}
                        <TabPanel value={currentTab} index={9}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <TextField
                                    label="Background Image URL"
                                    fullWidth
                                    value={backgroundImageUrl}
                                    onChange={(e) => setBackgroundImageUrl(e.target.value)}
                                    size="small"
                                    margin="dense"
                                    disabled={isTemplate}
                                />
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <TextField
                                            label="Background Image ID"
                                            fullWidth
                                            value={backgroundImageId}
                                            onChange={(e) => setBackgroundImageId(e.target.value)}
                                            size="small"
                                            margin="dense"
                                            disabled={isTemplate}
                                        />
                                    </Box>
                                    <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                        <FormControl fullWidth size="small" margin="dense">
                                            <InputLabel>Image Fit</InputLabel>
                                            <Select
                                                value={imageFit}
                                                onChange={(e) => setImageFit(e.target.value)}
                                                label="Image Fit"
                                                disabled={isTemplate}
                                            >
                                                <MenuItem value="cover">Cover</MenuItem>
                                                <MenuItem value="contain">Contain</MenuItem>
                                                <MenuItem value="fill">Fill</MenuItem>
                                                <MenuItem value="none">None</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Box>
                                </Box>
                            </Box>
                        </TabPanel>

                        {/* Performance Tab */}
                        <TabPanel value={currentTab} index={10}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                        <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={lazyLoad}
                                                        onChange={() => setLazyLoad(!lazyLoad)}
                                                        size="small"
                                                        disabled={isTemplate}
                                                    />
                                                }
                                                label="Lazy Load"
                                            />
                                        </Box>
                                        <Box sx={{ flex: '1 1 45%', minWidth: '200px' }}>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={enableScrollbars}
                                                        onChange={() => setEnableScrollbars(!enableScrollbars)}
                                                        size="small"
                                                        disabled={isTemplate}
                                                    />
                                                }
                                                label="Enable Scrollbars"
                                            />
                                        </Box>
                                    </Box>
                                    <TextField
                                        label="Render Priority"
                                        fullWidth
                                        value={renderPriority}
                                        onChange={(e) => setRenderPriority(e.target.value)}
                                        type="number"
                                        size="small"
                                        margin="dense"
                                        slotProps={{
                                            htmlInput: { min: 0, max: 10 }
                                        }}
                                        helperText="Higher priority renders first (0-10)"
                                        disabled={isTemplate}
                                    />
                                </Box>
                        </TabPanel>

                        {/* Custom Attributes Tab */}
                        <TabPanel value={currentTab} index={11}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Typography variant="h6" gutterBottom>Custom Attributes</Typography>
                                <Typography variant="body2" gutterBottom>
                                    Define custom attributes in JSON format.
                                </Typography>

                                <TextField
                                    label="JSON Layout Config"
                                    fullWidth
                                    value={jsonLayoutConfig}
                                    onChange={(e) => setJsonLayoutConfig(e.target.value)}
                                    multiline
                                    rows={10}
                                    size="small"
                                    margin="dense"
                                    disabled={isTemplate}
                                />
                            </Box>
                        </TabPanel>
                    </Paper>

                    {/* Action Buttons */}
                    <Box sx={{ display: "flex", justifyContent: "space-between", mt: 2 }}>
                        <Button variant="outlined" onClick={handleBack} size="small">
                            Back to Layouts
                        </Button>
                        <Button variant="contained" onClick={handleSave} size="small" disabled={isTemplate}>
                            Save Layout
                        </Button>
                    </Box>
                </>
            )}

            {/* Snackbar for notifications */}
            <Snackbar
                open={snackbarOpen}
                autoHideDuration={3000}
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: "100%" }}>
                    {snackbarMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ConfigureLayout;