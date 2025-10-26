/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { ElementType } from '../components/frameengine/FrameEngine_Types';

/**
 * Get default properties for a given element type
 */
export const getDefaultElementProperties = (elementType: ElementType): Record<string, any> => {
    switch (elementType) {
        case 'sensor':
            return {
                sensorTag: 'New Sensor',
                placeholderSensorLabel: 'New Sensor Label',
                placeholderValue: '',
                placeholderUnit: '',
                fontSize: 12,
                fontFamily: 'Inter',
                fontWeight: 'normal',
                textColor: '#000000',
                backgroundColor: 'transparent',
                textAlign: 'left',
                verticalAlign: 'center',
                showUnit: true,
                showLabel: true
            };

        case 'text':
            return {
                text: 'Text Label',
                fontSize: 14,
                fontFamily: 'Inter',
                fontWeight: 'normal',
                color: '#000000',
                backgroundColor: 'transparent',
                textAlign: 'left',
                verticalAlign: 'center'
            };

        case 'clock':
            return {
                fontSize: 24,
                fontFamily: 'Inter',
                fontWeight: 'normal',
                color: '#000000',
                backgroundColor: 'transparent',
                textAlign: 'center',
                verticalAlign: 'center',
                timeFormat: '12h',
                showSeconds: true,
                showDate: false,
                dateFormat: 'short',
                timezone: 'America/Chicago',
                textShadow: false,
                textBorder: false
            };

        case 'ecg':
            return {
                sensorTag: '',
                waveformColor: '#00ff00',
                backgroundColor: '#000000',
                gridColor: 'rgba(0, 255, 0, 0.2)',
                showGrid: true,
                showBorder: true,
                bufferSize: 200,
                yAxisMin: 0,
                yAxisMax: 100,
                lineWidth: 2,
                gridScrollSpeed: 0.5
            };

        case 'gauge':
            return {
                sensorTag: '',
                gaugeType: 'semicircle',
                minValue: 0,
                maxValue: 100,
                valueLabel: '',
                showLabels: true,
                showTicks: true,
                pointerType: 'needle',
                pointerColor: '#464A4F',
                pointerLength: 0.7,
                pointerWidth: 15,
                pointerElastic: true,
                pointerAnimationDelay: 0,
                arcColors: [
                    { limit: 33, color: '#5BE12C' },
                    { limit: 66, color: '#F5CD19' },
                    { limit: 100, color: '#EA4228' }
                ],
                arcPadding: 0.02,
                arcWidth: 0.2,
                cornerRadius: 5,
                valueLabelColor: '#333',
                tickLabelColor: '#666'
            };

        case 'oscilloscope':
            return {
                sensorTag: '',
                waveformColor: '#00ff00',
                backgroundColor: '#000000',
                gridColor: 'rgba(0, 255, 0, 0.2)',
                showGrid: true,
                showBorder: true,
                bufferSize: 200,
                yAxisMin: 0,
                yAxisMax: 100,
                lineWidth: 2,
                mode: 'glow',
                phosphorDecay: 0.95,
                glowIntensity: 3,
                frequency: 0.05,
                phase: 0,
                amplitude: 1,
                harmonics: 0,
                noiseLevel: 0,
                symmetry: 0,
                triggerLevel: 50,
                showTrigger: false
            };

        case 'tunnel':
            return {
                sensorTag: '',
                primaryColor: '#ff00ff',
                secondaryColor: '#00ffff',
                backgroundColor: '#000000',
                tunnelType: 'circular',
                speed: 1,
                depth: 20,
                ringSpacing: 5,
                rotation: 0.5,
                twist: 0,
                pulseSpeed: 1,
                pulseAmount: 0.2,
                scanlines: true,
                scanlineIntensity: 0.3,
                chromatic: false,
                chromaticAmount: 2,
                pixelate: false,
                pixelSize: 4,
                colorCycle: false,
                colorCycleSpeed: 0.01,
                perspective: 1,
                glow: true,
                glowIntensity: 10,
                renderMode: '2d',
                curveTargetX: 0,
                curveTargetY: 0,
                curveStrength: 1,
                banking: 0.5,
                pitch: 0,
                originX: 0.5,
                originY: 0.5,
                depthFade: false,
                fadeEnd: 'back'
            };

        case 'weather':
            return {
                sensorTag: '',
                weatherType: 'clear',
                timeOfDay: 'day',
                cloudDensity: 0.5,
                animationSpeed: 1,
                particleCount: 500,
                showStars: true,
                cameraAngle: 30,
                backgroundColor: 'transparent'
            };

        case 'asset-image':
            return {
                assetImageUrl: '',
                imageFit: 'cover',
                opacity: 1
            };

        case 'asset-video':
            return {
                assetVideoUrl: '',
                videoFit: 'cover',
                videoLoop: true,
                videoMuted: true,
                videoAutoplay: true,
                opacity: 1
            };

        case 'asset-rive':
            return {
                assetRiveFile: '',
                riveStateMachine: '',
                riveInputs: {},
                riveBindings: {},
                riveFit: 'cover',
                opacity: 1
            };

        case 'chart':
            return {
                chartType: 'line',
                title: 'Chart',
                showLegend: true,
                fontSize: 12,
                fontFamily: 'Inter'
            };

        case 'image':
            return {
                imageUrl: '',
                alt: 'Image'
            };

        case 'container':
            return {
                title: 'Container'
            };

        default:
            return {};
    }
};