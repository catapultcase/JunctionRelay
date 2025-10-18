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

import React, { useCallback, useMemo } from 'react';
import { FrameEngine_ECGElement } from '../frameengine_effects/FrameEngine_ECGElement';
import { FrameEngine_ClockElement } from '../frameengine_effects/FrameEngine_ClockElement';
import { FrameEngine_OscilloscopeElement } from '../frameengine_effects/FrameEngine_OscilloscopeElement';
import { FrameEngine_TunnelElement } from '../frameengine_effects/FrameEngine_TunnelElement';
import { FrameEngine_TunnelElementWebGL } from '../frameengine_effects/FrameEngine_TunnelElementWebGL';
import { FrameEngine_WeatherElement } from '../frameengine_effects/FrameEngine_WeatherElement';
import { FrameEngine_Asset_Image } from '../frameengine_effects/FrameEngine_Asset_Image';
import { FrameEngine_Asset_Video } from '../frameengine_effects/FrameEngine_Asset_Video';
import { FrameEngine_Asset_Rive } from '../frameengine_effects/FrameEngine_Asset_Rive';

const loadedFonts = new Set<string>();

// Type definitions (moved from FrameEngine_Types.ts)
export interface ElementPosition {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BaseElement {
    id: string;
    type: string;
    position: ElementPosition;
    properties: Record<string, any>;
    visible?: boolean;
    locked?: boolean;
}

export interface RendererConfig {
    isInteractive: boolean;
    showPlaceholders: boolean;
    elementPadding: number;
    enableSensorVisibility?: boolean; // Enable sensor-based visibility in runtime
}

// Specialized element interfaces that extend BaseElement
export interface SensorElement extends BaseElement {
    type: 'sensor';
    properties: {
        sensorTag?: string;
        showLabel?: boolean;
        showUnit?: boolean;
        placeholderSensorLabel?: string;
        placeholderValue?: any;
        placeholderUnit?: string;
        visibilitySensorTag?: string;
        [key: string]: any;
    };
    currentValue?: string;
    currentUnit?: string;
}

export interface TextElement extends BaseElement {
    type: 'text';
    text?: string;
    properties: {
        text?: string;
        visibilitySensorTag?: string;
        [key: string]: any;
    };
}

export interface ECGElement extends BaseElement {
    type: 'ecg';
    properties: {
        sensorTag?: string;
        visibilitySensorTag?: string;
        [key: string]: any;
    };
}

export interface ClockElement extends BaseElement {
    type: 'clock';
    properties: {
        visibilitySensorTag?: string;
        [key: string]: any;
    };
}

export interface OscilloscopeElement extends BaseElement {
    type: 'oscilloscope';
    properties: {
        sensorTag?: string;
        visibilitySensorTag?: string;
        [key: string]: any;
    };
}

export interface TunnelElement extends BaseElement {
    type: 'tunnel';
    properties: {
        sensorTag?: string;
        visibilitySensorTag?: string;
        [key: string]: any;
    };
}

export interface WeatherElement extends BaseElement {
    type: 'weather';
    properties: {
        sensorTag?: string;
        visibilitySensorTag?: string;
        [key: string]: any;
    };
}

export interface AssetImageElement extends BaseElement {
    type: 'asset-image';
    properties: {
        assetImageUrl?: string;
        imageFit?: 'cover' | 'contain' | 'fill' | 'tile' | 'stretch' | 'none';
        opacity?: number;
        visibilitySensorTag?: string;
        [key: string]: any;
    };
}

export interface AssetVideoElement extends BaseElement {
    type: 'asset-video';
    properties: {
        assetVideoUrl?: string;
        videoFit?: 'cover' | 'contain' | 'fill' | 'stretch' | 'none';
        videoLoop?: boolean;
        videoMuted?: boolean;
        videoAutoplay?: boolean;
        opacity?: number;
        visibilitySensorTag?: string;
        [key: string]: any;
    };
}

export interface AssetRiveElement extends BaseElement {
    type: 'asset-rive';
    properties: {
        assetRiveFile?: string;
        riveStateMachine?: string;
        riveInputs?: Record<string, any>;
        riveBindings?: Record<string, any>;
        riveFit?: 'cover' | 'contain' | 'none';
        opacity?: number;
        visibilitySensorTag?: string;
        [key: string]: any;
    };
}

interface ElementRendererProps {
    elements: BaseElement[];
    config: RendererConfig;
    sensorData?: Record<string, any>;
    selectedElementIds?: string[];
    onElementMouseDown?: (event: React.MouseEvent, elementId: string) => void;
    onElementMouseEnter?: (event: React.MouseEvent, elementId: string) => void;
    onElementMouseLeave?: (event: React.MouseEvent, elementId: string) => void;
    children?: React.ReactNode;
}

const loadGoogleFont = (fontFamily: string) => {
    if (!fontFamily || fontFamily.includes('system') || fontFamily.includes('sans-serif') ||
        loadedFonts.has(fontFamily) ||
        document.querySelector(`link[href*="${fontFamily.replace(/\s+/g, '+')}"]`)) {
        return;
    }

    const link = document.createElement('link');
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    loadedFonts.add(fontFamily);
};

export const FrameEngine_ElementRenderer: React.FC<ElementRendererProps> = ({
    elements,
    config,
    sensorData = {},
    selectedElementIds = [],
    onElementMouseDown,
    onElementMouseEnter,
    onElementMouseLeave,
    children
}) => {
    const isElementVisible = useCallback((element: BaseElement): boolean => {
        const visibilityTag = element.properties.visibilitySensorTag;

        if (!visibilityTag || visibilityTag.trim() === '') {
            return true;
        }

        let visibilityData = sensorData[visibilityTag];

        if (!visibilityData) {
            const matchingKey = Object.keys(sensorData).find(key =>
                key.split(',').map(tag => tag.trim()).includes(visibilityTag.trim())
            );
            if (matchingKey) {
                visibilityData = sensorData[matchingKey];
            }
        }

        if (!visibilityData) {
            return false;
        }

        const value = visibilityData.value;

        if (typeof value === 'boolean') {
            return value;
        } else if (typeof value === 'number') {
            return value !== 0;
        } else if (typeof value === 'string') {
            const lowerValue = value.toLowerCase().trim();
            return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
        }

        return false;
    }, [sensorData]);

    const getElementStyles = useCallback((element: BaseElement, isSelected: boolean): React.CSSProperties => {
        const props = element.properties;
        const isLocked = element.locked ?? false;
        const isVisualEffect = element.type === 'ecg' || element.type === 'clock' ||
            element.type === 'oscilloscope' || element.type === 'tunnel' || element.type === 'weather' ||
            element.type === 'asset-image' || element.type === 'asset-video' || element.type === 'asset-rive';

        // Determine outline - locked elements only show outline when selected
        let outlineStyle = 'none';
        let boxShadowStyle = 'none';

        if (config.isInteractive && !isLocked) {
            // Unlocked elements: show normal outline behavior
            const outlineColor = isSelected ? '#1976d2' : '#ccc';
            outlineStyle = `${isSelected ? '2px' : '1px'} solid ${outlineColor}`;
            boxShadowStyle = isSelected ? '0 0 0 2px rgba(25, 118, 210, 0.3)' : 'none';
        } else if (config.isInteractive && isLocked && isSelected) {
            // Locked + selected (from element list): show orange outline
            outlineStyle = '2px solid #ff9800';
            boxShadowStyle = '0 0 0 2px rgba(255, 152, 0, 0.3)';
        }
        // Locked but not selected: no outline at all

        return {
            position: 'absolute',
            left: element.position.x,
            top: element.position.y,
            width: element.position.width,
            height: element.position.height,
            outline: outlineStyle,
            cursor: config.isInteractive ? (isLocked ? 'default' : 'move') : 'default',
            boxShadow: boxShadowStyle,
            zIndex: 2,
            overflow: 'hidden',
            boxSizing: 'border-box',
            backgroundColor: isVisualEffect ? 'transparent' : (props.backgroundColor || 'transparent'),
            pointerEvents: isLocked ? 'none' : 'auto', // Make locked elements non-interactive
        };
    }, [config.isInteractive]);

    const getTextStyles = useCallback((element: BaseElement): React.CSSProperties => {
        const props = element.properties;
        const fontFamily = props.fontFamily || 'Inter, system-ui, -apple-system, sans-serif';

        if (fontFamily && fontFamily !== 'Inter' && !fontFamily.includes('system')) {
            loadGoogleFont(fontFamily);
        }

        const verticalAlign = props.verticalAlign || 'center';
        let justifyContent: string;
        switch (verticalAlign) {
            case 'top':
                justifyContent = 'flex-start';
                break;
            case 'bottom':
                justifyContent = 'flex-end';
                break;
            default:
                justifyContent = 'center';
                break;
        }

        return {
            fontSize: props.fontSize || 12,
            fontFamily: `"${fontFamily}", system-ui, -apple-system, sans-serif`,
            fontWeight: props.fontWeight || 'normal',
            color: props.color || '#000000',
            backgroundColor: props.backgroundColor || 'transparent',
            textAlign: (props.textAlign || 'center') as any,
            lineHeight: props.lineHeight || '1.4',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: justifyContent,
            alignItems: props.textAlign === 'left' ? 'flex-start' :
                props.textAlign === 'right' ? 'flex-end' : 'center',
            padding: `${config.elementPadding}px`,
            boxSizing: 'border-box',
            wordWrap: 'break-word',
            overflow: 'hidden',
            zIndex: 10,
            textShadow: props.textShadow ? '1px 1px 2px rgba(0,0,0,0.3)' : 'none',
            border: props.textBorder ? '1px solid currentColor' : 'none',
        };
    }, [config.elementPadding]);

    const getSensorData = useCallback((element: SensorElement | ECGElement | OscilloscopeElement | TunnelElement | WeatherElement) => {
        const sensorTag = element.properties.sensorTag;
        if (!sensorTag) return null;

        let data = sensorData[sensorTag];

        if (!data) {
            const matchingKey = Object.keys(sensorData).find(key =>
                key.split(',').map(tag => tag.trim()).includes(sensorTag)
            );
            if (matchingKey) {
                data = sensorData[matchingKey];
            }
        }

        return data;
    }, [sensorData]);

    const renderElementContent = useCallback((element: BaseElement) => {
        const textStyles = getTextStyles(element);

        switch (element.type) {
            case 'clock': {
                const props = element.properties;

                const fontFamily = props.fontFamily || 'Inter';
                if (fontFamily && fontFamily !== 'Inter' && !fontFamily.includes('system')) {
                    loadGoogleFont(fontFamily);
                }

                return (
                    <FrameEngine_ClockElement
                        width={element.position.width}
                        height={element.position.height}
                        fontSize={props.fontSize || 24}
                        fontFamily={props.fontFamily || 'Inter'}
                        fontWeight={props.fontWeight || 'normal'}
                        textColor={props.color || '#000000'}
                        backgroundColor={props.backgroundColor || 'transparent'}
                        textAlign={props.textAlign || 'center'}
                        verticalAlign={props.verticalAlign || 'center'}
                        timeFormat={props.timeFormat || '12h'}
                        showSeconds={props.showSeconds !== false}
                        showDate={props.showDate || false}
                        dateFormat={props.dateFormat || 'short'}
                        timezone={props.timezone || 'America/Chicago'}
                        textShadow={props.textShadow || false}
                        textBorder={props.textBorder || false}
                    />
                );
            }

            case 'ecg': {
                const ecgElement = element as ECGElement;
                const data = getSensorData(ecgElement);
                const sensorValue = data?.value != null ? parseFloat(data.value) : undefined;

                return (
                    <FrameEngine_ECGElement
                        sensorTag={element.properties.sensorTag || ''}
                        sensorValue={sensorValue}
                        width={element.position.width}
                        height={element.position.height}
                        waveformColor={element.properties.waveformColor || '#00ff00'}
                        backgroundColor={element.properties.backgroundColor || '#000000'}
                        gridColor={element.properties.gridColor || 'rgba(0, 255, 0, 0.2)'}
                        showGrid={element.properties.showGrid !== false}
                        showBorder={element.properties.showBorder !== false}
                        bufferSize={element.properties.bufferSize || 200}
                        yAxisMin={element.properties.yAxisMin || 0}
                        yAxisMax={element.properties.yAxisMax || 100}
                        lineWidth={element.properties.lineWidth || 2}
                        gridScrollSpeed={element.properties.gridScrollSpeed ?? 0.5}
                    />
                );
            }

            case 'oscilloscope': {
                const oscElement = element as OscilloscopeElement;
                const data = getSensorData(oscElement);
                const sensorValue = data?.value != null ? parseFloat(data.value) : undefined;

                return (
                    <FrameEngine_OscilloscopeElement
                        sensorTag={element.properties.sensorTag || ''}
                        sensorValue={sensorValue}
                        width={element.position.width}
                        height={element.position.height}
                        waveformColor={element.properties.waveformColor || '#00ff00'}
                        backgroundColor={element.properties.backgroundColor || '#000000'}
                        gridColor={element.properties.gridColor || 'rgba(0, 255, 0, 0.2)'}
                        showGrid={element.properties.showGrid !== false}
                        showBorder={element.properties.showBorder !== false}
                        bufferSize={element.properties.bufferSize || 200}
                        yAxisMin={element.properties.yAxisMin || 0}
                        yAxisMax={element.properties.yAxisMax || 100}
                        lineWidth={element.properties.lineWidth || 2}
                        mode={element.properties.mode || 'glow'}
                        phosphorDecay={element.properties.phosphorDecay ?? 0.95}
                        glowIntensity={element.properties.glowIntensity ?? 3}
                        frequency={element.properties.frequency ?? 0.05}
                        phase={element.properties.phase ?? 0}
                        amplitude={element.properties.amplitude ?? 1}
                        harmonics={element.properties.harmonics ?? 0}
                        noiseLevel={element.properties.noiseLevel ?? 0}
                        symmetry={element.properties.symmetry ?? 0}
                        triggerLevel={element.properties.triggerLevel ?? 50}
                        showTrigger={element.properties.showTrigger || false}
                    />
                );
            }

            case 'tunnel': {
                const tunnelElement = element as TunnelElement;
                const data = getSensorData(tunnelElement);
                const sensorValue = data?.value != null ? parseFloat(data.value) : undefined;

                const renderMode = element.properties.renderMode || '2d';

                if (renderMode === '3d') {
                    return (
                        <FrameEngine_TunnelElementWebGL
                            sensorTag={element.properties.sensorTag || ''}
                            sensorValue={sensorValue}
                            width={element.position.width}
                            height={element.position.height}
                            primaryColor={element.properties.primaryColor || '#ff00ff'}
                            secondaryColor={element.properties.secondaryColor || '#00ffff'}
                            backgroundColor={element.properties.backgroundColor || '#000000'}
                            tunnelType={element.properties.tunnelType || 'circular'}
                            speed={element.properties.speed ?? 1}
                            depth={element.properties.depth ?? 20}
                            ringSpacing={element.properties.ringSpacing ?? 5}
                            rotation={element.properties.rotation ?? 0.5}
                            twist={element.properties.twist ?? 0}
                            pulseSpeed={element.properties.enablePulse !== false ? (element.properties.pulseSpeed ?? 1) : 0}
                            pulseAmount={element.properties.enablePulse !== false ? (element.properties.pulseAmount ?? 0.2) : 0}
                            scanlines={element.properties.scanlines !== false}
                            scanlineIntensity={element.properties.scanlineIntensity ?? 0.3}
                            chromatic={element.properties.chromatic || false}
                            chromaticAmount={element.properties.chromaticAmount ?? 2}
                            pixelate={element.properties.pixelate || false}
                            pixelSize={element.properties.pixelSize ?? 4}
                            colorCycle={element.properties.colorCycle || false}
                            colorCycleSpeed={element.properties.colorCycleSpeed ?? 0.01}
                            perspective={element.properties.perspective ?? 1}
                            glow={element.properties.glow !== false}
                            glowIntensity={element.properties.glowIntensity ?? 10}
                            curveTargetX={element.properties.curveTargetX ?? 0}
                            curveTargetY={element.properties.curveTargetY ?? 0}
                            curveStrength={element.properties.curveStrength ?? 1}
                            banking={element.properties.banking ?? 0.5}
                            pitch={element.properties.pitch ?? 0}
                            originX={element.properties.originX ?? 0.5}
                            originY={element.properties.originY ?? 0.5}
                            depthFade={element.properties.depthFade || false}
                            fadeEnd={element.properties.fadeEnd || 'back'}
                        />
                    );
                } else {
                    return (
                        <FrameEngine_TunnelElement
                            sensorTag={element.properties.sensorTag || ''}
                            sensorValue={sensorValue}
                            width={element.position.width}
                            height={element.position.height}
                            primaryColor={element.properties.primaryColor || '#ff00ff'}
                            secondaryColor={element.properties.secondaryColor || '#00ffff'}
                            backgroundColor={element.properties.backgroundColor || '#000000'}
                            tunnelType={element.properties.tunnelType || 'circular'}
                            speed={element.properties.speed ?? 1}
                            depth={element.properties.depth ?? 20}
                            ringSpacing={element.properties.ringSpacing ?? 5}
                            rotation={element.properties.rotation ?? 0.5}
                            twist={element.properties.twist ?? 0}
                            pulseSpeed={element.properties.enablePulse !== false ? (element.properties.pulseSpeed ?? 1) : 0}
                            pulseAmount={element.properties.enablePulse !== false ? (element.properties.pulseAmount ?? 0.2) : 0}
                            scanlines={element.properties.scanlines !== false}
                            scanlineIntensity={element.properties.scanlineIntensity ?? 0.3}
                            chromatic={element.properties.chromatic || false}
                            chromaticAmount={element.properties.chromaticAmount ?? 2}
                            pixelate={element.properties.pixelate || false}
                            pixelSize={element.properties.pixelSize ?? 4}
                            colorCycle={element.properties.colorCycle || false}
                            colorCycleSpeed={element.properties.colorCycleSpeed ?? 0.01}
                            perspective={element.properties.perspective ?? 1}
                            glow={element.properties.glow !== false}
                            glowIntensity={element.properties.glowIntensity ?? 10}
                            curveTargetX={element.properties.curveTargetX ?? 0}
                            curveTargetY={element.properties.curveTargetY ?? 0}
                            curveStrength={element.properties.curveStrength ?? 1}
                            banking={element.properties.banking ?? 0.5}
                            pitch={element.properties.pitch ?? 0}
                            originX={element.properties.originX ?? 0.5}
                            originY={element.properties.originY ?? 0.5}
                            depthFade={element.properties.depthFade || false}
                            fadeEnd={element.properties.fadeEnd || 'back'}
                            lineWidth={element.properties.lineWidth ?? 2}
                        />
                    );
                }
            }

            case 'weather': {
                const weatherElement = element as WeatherElement;
                const data = getSensorData(weatherElement);
                const sensorValue = data?.value != null ? parseFloat(data.value) : undefined;

                return (
                    <FrameEngine_WeatherElement
                        sensorTag={element.properties.sensorTag || ''}
                        sensorValue={sensorValue}
                        width={element.position.width}
                        height={element.position.height}
                        weatherType={element.properties.weatherType || 'clear'}
                        timeOfDay={element.properties.timeOfDay || 'day'}
                        cloudDensity={element.properties.cloudDensity ?? 0.5}
                        animationSpeed={element.properties.animationSpeed ?? 1}
                        particleCount={element.properties.particleCount ?? 500}
                        showStars={element.properties.showStars !== false}
                        cameraAngle={element.properties.cameraAngle ?? 30}
                        backgroundColor={element.properties.backgroundColor || 'transparent'}
                    />
                );
            }

            case 'asset-image': {
                const assetImageElement = element as AssetImageElement;
                return (
                    <FrameEngine_Asset_Image
                        assetImageUrl={element.properties.assetImageUrl}
                        imageFit={element.properties.imageFit || 'cover'}
                        opacity={element.properties.opacity ?? 1}
                        width={element.position.width}
                        height={element.position.height}
                    />
                );
            }

            case 'asset-video': {
                const assetVideoElement = element as AssetVideoElement;
                return (
                    <FrameEngine_Asset_Video
                        assetVideoUrl={element.properties.assetVideoUrl}
                        videoFit={element.properties.videoFit || 'cover'}
                        videoLoop={element.properties.videoLoop ?? true}
                        videoMuted={element.properties.videoMuted ?? true}
                        videoAutoplay={element.properties.videoAutoplay ?? true}
                        opacity={element.properties.opacity ?? 1}
                        width={element.position.width}
                        height={element.position.height}
                    />
                );
            }

            case 'asset-rive': {
                const assetRiveElement = element as AssetRiveElement;
                return (
                    <FrameEngine_Asset_Rive
                        assetRiveFile={element.properties.assetRiveFile}
                        riveStateMachine={element.properties.riveStateMachine}
                        riveInputs={element.properties.riveInputs}
                        riveBindings={element.properties.riveBindings}
                        riveFit={element.properties.riveFit || 'cover'}
                        opacity={element.properties.opacity ?? 1}
                        width={element.position.width}
                        height={element.position.height}
                    />
                );
            }

            case 'sensor': {
                const sensorElement = element as SensorElement;
                const data = getSensorData(sensorElement);

                const showLabel: boolean = element.properties.showLabel === true;
                const showUnit: boolean = element.properties.showUnit !== false;

                if (!data && !config.showPlaceholders) {
                    return (
                        <div style={{ ...textStyles, color: '#888888' }}>
                            NO DATA
                        </div>
                    );
                }

                let content: string;
                if (data?.displayValue && data.displayValue.trim() !== '') {
                    content = data.displayValue;
                } else if (data) {
                    const labelText: string = showLabel ? (element.properties.placeholderSensorLabel || '') : '';
                    const valueText: string = data.value?.toString() || '--';
                    const unitText: string = showUnit ? (data.unit || '') : '';

                    content = '';
                    if (labelText) content += labelText + ' ';
                    content += valueText;
                    if (unitText) content += ' ' + unitText;
                } else {
                    const labelText: string = showLabel ? (element.properties.placeholderSensorLabel || '') : '';
                    const valueText: string = (element.properties.placeholderValue ?? '').toString().trim() || '--';
                    const unitText: string = showUnit ?
                        (element.properties.placeholderUnit ?? '').toString().trim() : '';

                    content = '';
                    if (labelText) content += labelText + ' ';
                    content += valueText;
                    if (unitText) content += ' ' + unitText;
                }

                return (
                    <div style={textStyles}>
                        {content}
                    </div>
                );
            }

            case 'text': {
                const textElement = element as TextElement;
                const content = textElement.text || element.properties.text || 'Text Element';
                return (
                    <div style={textStyles}>
                        {content}
                    </div>
                );
            }

            case 'chart':
                return (
                    <div style={textStyles}>
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                            {element.properties.title || 'Chart'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#666' }}>
                            {element.properties.chartType || 'line'} chart
                        </div>
                    </div>
                );

            case 'image': {
                const imageUrl = element.properties.imageUrl;
                const altText = element.properties.alt || 'Image';

                if (imageUrl) {
                    return (
                        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                            <img
                                src={imageUrl}
                                alt={altText}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: 'block'
                                }}
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const parent = target.parentElement;
                                    if (parent) {
                                        parent.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999; font-size: 10px;">${altText}</div>`;
                                    }
                                }}
                            />
                        </div>
                    );
                } else {
                    return (
                        <div style={{ ...textStyles, color: '#999', fontSize: '10px' }}>
                            {altText}
                        </div>
                    );
                }
            }

            case 'container':
                return (
                    <div style={{
                        ...textStyles,
                        border: '2px dashed #ccc',
                        color: '#999',
                        fontSize: '10px'
                    }}>
                        Container
                    </div>
                );

            default:
                return (
                    <div style={textStyles}>
                        {element.type}
                    </div>
                );
        }
    }, [getTextStyles, getSensorData, config.showPlaceholders]);

    const renderedElements = useMemo(() => {
        const filtered = elements.filter(element => {
            // Check element's visible property
            const isVisible = element.visible ?? true;

            // Always hide elements with visible=false, regardless of mode
            if (!isVisible) {
                return false;
            }

            // Check if sensor-based visibility is enabled (runtime mode)
            if (config.enableSensorVisibility) {
                const hasVisibilitySensor = element.properties.visibilitySensorTag &&
                    element.properties.visibilitySensorTag.trim() !== '';

                if (hasVisibilitySensor) {
                    return isElementVisible(element);
                }
            }

            // Show element (no visibility sensor or sensor visibility not enabled)
            return true;
        });

        return filtered.map((element) => {
            const isSelected = selectedElementIds.includes(element.id);
            const elementStyles = getElementStyles(element, isSelected);

            return (
                <div
                    key={element.id}
                    style={elementStyles}
                    onMouseDown={config.isInteractive && onElementMouseDown ?
                        (e) => onElementMouseDown(e, element.id) : undefined}
                    onMouseEnter={config.isInteractive && onElementMouseEnter ?
                        (e) => onElementMouseEnter(e, element.id) : undefined}
                    onMouseLeave={config.isInteractive && onElementMouseLeave ?
                        (e) => onElementMouseLeave(e, element.id) : undefined}
                >
                    {renderElementContent(element)}
                </div>
            );
        });
    }, [
        elements,
        selectedElementIds,
        getElementStyles,
        renderElementContent,
        config.isInteractive,
        config.enableSensorVisibility,
        onElementMouseDown,
        onElementMouseEnter,
        onElementMouseLeave,
        sensorData,
        isElementVisible
    ]);

    return (
        <>
            {renderedElements}
            {children}
        </>
    );
};

export default FrameEngine_ElementRenderer;