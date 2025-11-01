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

/* eslint-disable react/jsx-pascal-case */
// Note: Component names use underscore naming convention for namespace organization (FrameEngine2_*)
// This is a deliberate architectural choice and does not violate PascalCase - the components ARE PascalCase

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import type { ECGProperties } from '../types/FrameEngine2_ElementTypes';

interface FrameEngine2_Element_ECGProps {
    properties: ECGProperties;
    resolvedValues: Record<string, any>;
    showPlaceholders?: boolean;
    elementPadding?: number;
    width: number;
    height: number;
}

/**
 * ECG/Waveform Element - Optimized for FrameEngine2
 *
 * PERFORMANCE OPTIMIZATIONS vs V1:
 * 1. Visual props stored in refs - color changes don't restart animation
 * 2. Animation loop only depends on width/height (structural changes)
 * 3. Component memoized - prevents unnecessary re-renders
 * 4. Separate critical (size) from cosmetic (colors) prop changes
 * 5. Proper cleanup and ref management
 */
const FrameEngine2_Element_ECG: React.FC<FrameEngine2_Element_ECGProps> = ({
    properties,
    resolvedValues,
    width,
    height
}) => {
    // Canvas refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenRef = useRef<HTMLCanvasElement | null>(null);

    // Animation refs
    const animationRef = useRef<number | null>(null);
    const isMountedRef = useRef(true);

    // Data refs
    const dataPoints = useRef<number[]>([]);
    const currentValueY = useRef<number>(height / 2);

    // Timing refs
    const lastScrollTime = useRef<number>(Date.now());
    const scrollOffset = useRef<number>(0);
    const gridScrollOffset = useRef<number>(0);

    // OPTIMIZATION: Store visual props in refs to avoid animation restart on color changes
    const propsRef = useRef({
        waveformColor: properties.waveformColor,
        backgroundColor: properties.backgroundColor,
        gridBackgroundColor: properties.gridBackgroundColor,
        gridColor: properties.gridColor,
        showGrid: properties.showGrid,
        showBorder: properties.showBorder,
        lineWidth: properties.lineWidth,
        gridScrollSpeed: properties.gridScrollSpeed,
        bufferSize: properties.bufferSize,
        yAxisMin: properties.yAxisMin,
        yAxisMax: properties.yAxisMax
    });

    // Constants
    const SCROLL_INTERVAL = 30;
    const GRID_SIZE = 20;

    // Initialize offscreen canvas once
    if (!offscreenRef.current) {
        offscreenRef.current = document.createElement('canvas');
    }

    // Update props ref when properties change (doesn't restart animation)
    useEffect(() => {
        propsRef.current = {
            waveformColor: properties.waveformColor,
            backgroundColor: properties.backgroundColor,
            gridBackgroundColor: properties.gridBackgroundColor,
            gridColor: properties.gridColor,
            showGrid: properties.showGrid,
            showBorder: properties.showBorder,
            lineWidth: properties.lineWidth,
            gridScrollSpeed: properties.gridScrollSpeed,
            bufferSize: properties.bufferSize,
            yAxisMin: properties.yAxisMin,
            yAxisMax: properties.yAxisMax
        };
    }, [properties]);

    // Get sensor value from resolved values
    const sensorValue = useMemo(() => {
        if (!properties.sensorTag || !resolvedValues[properties.sensorTag]) {
            return undefined;
        }
        const value = resolvedValues[properties.sensorTag].value;
        return typeof value === 'number' ? value : parseFloat(value);
    }, [properties.sensorTag, resolvedValues]);

    // Update current value when sensor changes (doesn't restart animation)
    useEffect(() => {
        if (sensorValue === undefined || sensorValue === null || isNaN(sensorValue)) {
            return;
        }

        const props = propsRef.current;
        const valueRange = props.yAxisMax - props.yAxisMin;
        const normalizedValue = (sensorValue - props.yAxisMin) / valueRange;
        const clampedValue = Math.max(0, Math.min(1, normalizedValue));
        currentValueY.current = height - (clampedValue * height);
    }, [sensorValue, height]);

    // OPTIMIZATION: Stable animation loop - only depends on width/height (structural changes)
    const animate = useCallback(() => {
        if (!isMountedRef.current) return;

        const canvas = canvasRef.current;
        const offscreen = offscreenRef.current;

        if (!canvas || !offscreen) {
            animationRef.current = requestAnimationFrame(animate);
            return;
        }

        const ctx = canvas.getContext('2d');
        const offCtx = offscreen.getContext('2d');

        if (!ctx || !offCtx) {
            animationRef.current = requestAnimationFrame(animate);
            return;
        }

        // Read current props from ref (not from closure)
        const props = propsRef.current;
        const now = Date.now();

        // Scroll logic
        if (now - lastScrollTime.current >= SCROLL_INTERVAL) {
            lastScrollTime.current = now;

            dataPoints.current.push(currentValueY.current);

            if (dataPoints.current.length > props.bufferSize) {
                dataPoints.current.shift();
            }

            scrollOffset.current = (scrollOffset.current + 1) % width;

            // Update grid scroll offset
            gridScrollOffset.current += props.gridScrollSpeed;
            if (gridScrollOffset.current >= GRID_SIZE) {
                gridScrollOffset.current -= GRID_SIZE;
            }
        }

        // Clear offscreen
        offCtx.clearRect(0, 0, width, height);

        // Background
        offCtx.fillStyle = props.backgroundColor;
        offCtx.fillRect(0, 0, width, height);

        // Grid background layer
        if (props.showGrid && props.gridBackgroundColor && props.gridBackgroundColor !== 'transparent') {
            offCtx.fillStyle = props.gridBackgroundColor;
            offCtx.fillRect(0, 0, width, height);
        }

        // Grid with parallax scrolling
        if (props.showGrid) {
            offCtx.strokeStyle = props.gridColor;
            offCtx.lineWidth = 1;

            const startX = -gridScrollOffset.current;

            // Vertical lines
            for (let x = startX; x < width + GRID_SIZE; x += GRID_SIZE) {
                offCtx.beginPath();
                offCtx.moveTo(x, 0);
                offCtx.lineTo(x, height);
                offCtx.stroke();
            }

            // Horizontal lines
            for (let y = 0; y < height + GRID_SIZE; y += GRID_SIZE) {
                offCtx.beginPath();
                offCtx.moveTo(0, y);
                offCtx.lineTo(width, y);
                offCtx.stroke();
            }
        }

        // Waveform
        if (dataPoints.current.length > 1) {
            offCtx.strokeStyle = props.waveformColor;
            offCtx.lineWidth = props.lineWidth;
            offCtx.lineCap = 'round';
            offCtx.lineJoin = 'round';

            offCtx.beginPath();
            const pts = dataPoints.current;

            pts.forEach((y, i) => {
                const x = (i / (pts.length - 1)) * width;
                if (i === 0) {
                    offCtx.moveTo(x, y);
                } else {
                    offCtx.lineTo(x, y);
                }
            });

            offCtx.stroke();
        }

        // Border
        if (props.showBorder) {
            offCtx.strokeStyle = props.waveformColor;
            offCtx.lineWidth = 2;
            offCtx.strokeRect(1, 1, width - 2, height - 2);
        }

        // Blit to main canvas
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(offscreen, 0, 0);

        if (isMountedRef.current) {
            animationRef.current = requestAnimationFrame(animate);
        }
    }, [width, height]); // ONLY width/height - visual props read from ref

    // Initialize buffer size when it changes
    useEffect(() => {
        const targetSize = propsRef.current.bufferSize;

        // OPTIMIZATION: Don't clear buffer, just resize it smoothly
        if (dataPoints.current.length === 0) {
            // First initialization
            dataPoints.current = Array(targetSize).fill(height / 2);
        } else if (dataPoints.current.length < targetSize) {
            // Expanding - fill with last value
            const lastValue = dataPoints.current[dataPoints.current.length - 1] || height / 2;
            while (dataPoints.current.length < targetSize) {
                dataPoints.current.unshift(lastValue);
            }
        } else if (dataPoints.current.length > targetSize) {
            // Shrinking - remove oldest points
            dataPoints.current = dataPoints.current.slice(-targetSize);
        }
    }, [properties.bufferSize, height]);

    // Initialize offscreen canvas and start animation (only on size changes)
    useEffect(() => {
        const offscreen = offscreenRef.current;
        if (!offscreen) return;

        offscreen.width = width;
        offscreen.height = height;

        // Cancel previous animation
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        // Start animation
        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [width, height, animate]);

    // Cleanup on unmount
    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{
                width: '100%',
                height: '100%',
                display: 'block'
            }}
        />
    );
};

// OPTIMIZATION: Memoize component to prevent unnecessary re-renders
export default React.memo(FrameEngine2_Element_ECG);
