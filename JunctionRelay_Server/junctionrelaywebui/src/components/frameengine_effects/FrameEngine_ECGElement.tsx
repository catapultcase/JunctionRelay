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

import React, { useEffect, useRef, useCallback } from 'react';

interface ECGElementProps {
    sensorTag: string;
    sensorValue?: number;
    width: number;
    height: number;
    waveformColor?: string;
    backgroundColor?: string;
    gridBackgroundColor?: string;
    gridColor?: string;
    showGrid?: boolean;
    showBorder?: boolean;
    bufferSize?: number;
    yAxisMin?: number;
    yAxisMax?: number;
    lineWidth?: number;
    gridScrollSpeed?: number;
}

export const FrameEngine_ECGElement: React.FC<ECGElementProps> = ({
    sensorValue,
    width,
    height,
    waveformColor = '#00ff00',
    backgroundColor = '#000000',
    gridBackgroundColor = 'transparent',
    gridColor = 'rgba(0, 255, 0, 0.2)',
    showGrid = true,
    showBorder = true,
    bufferSize = 200,
    yAxisMin = 0,
    yAxisMax = 100,
    lineWidth = 2,
    gridScrollSpeed = 0.5,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const animationRef = useRef<number | null>(null);
    const dataPoints = useRef<number[]>([]);
    const lastScrollTime = useRef<number>(Date.now());
    const currentValueY = useRef<number>(height / 2);
    const scrollOffset = useRef<number>(0);
    const gridScrollOffset = useRef<number>(0);
    const isMountedRef = useRef(true);

    const SCROLL_INTERVAL = 30;
    const GRID_SIZE = 20;

    // Initialize data buffer
    useEffect(() => {
        dataPoints.current = Array(bufferSize).fill(height / 2);
    }, [bufferSize, height]);

    // Update current value when sensor changes
    useEffect(() => {
        if (sensorValue === undefined || sensorValue === null) return;

        const valueRange = yAxisMax - yAxisMin;
        const normalizedValue = (sensorValue - yAxisMin) / valueRange;
        const clampedValue = Math.max(0, Math.min(1, normalizedValue));
        currentValueY.current = height - (clampedValue * height);
    }, [sensorValue, height, yAxisMin, yAxisMax]);

    // Animation loop
    const animate = useCallback(() => {
        if (!isMountedRef.current) return;

        const now = Date.now();
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

        // Scroll logic - always happens
        if (now - lastScrollTime.current >= SCROLL_INTERVAL) {
            lastScrollTime.current = now;

            dataPoints.current.push(currentValueY.current);

            if (dataPoints.current.length > bufferSize) {
                dataPoints.current.shift();
            }

            scrollOffset.current = (scrollOffset.current + 1) % width;

            // Update grid scroll offset independently
            gridScrollOffset.current += gridScrollSpeed;
            if (gridScrollOffset.current >= GRID_SIZE) {
                gridScrollOffset.current -= GRID_SIZE;
            }
        }

        // Clear offscreen
        offCtx.clearRect(0, 0, width, height);

        // Background
        offCtx.fillStyle = backgroundColor;
        offCtx.fillRect(0, 0, width, height);

        // Grid background (layer between background and grid lines)
        if (showGrid && gridBackgroundColor && gridBackgroundColor !== 'transparent') {
            offCtx.fillStyle = gridBackgroundColor;
            offCtx.fillRect(0, 0, width, height);
        }

        // Grid with parallax scrolling
        if (showGrid) {
            offCtx.strokeStyle = gridColor;
            offCtx.lineWidth = 1;

            // Calculate starting position based on scroll offset
            const startX = -gridScrollOffset.current;
            const startY = 0;

            // Draw vertical lines
            for (let x = startX; x < width + GRID_SIZE; x += GRID_SIZE) {
                offCtx.beginPath();
                offCtx.moveTo(x, 0);
                offCtx.lineTo(x, height);
                offCtx.stroke();
            }

            // Draw horizontal lines (no vertical scrolling, only horizontal)
            for (let y = startY; y < height + GRID_SIZE; y += GRID_SIZE) {
                offCtx.beginPath();
                offCtx.moveTo(0, y);
                offCtx.lineTo(width, y);
                offCtx.stroke();
            }
        }

        // Waveform
        if (dataPoints.current.length > 1) {
            offCtx.strokeStyle = waveformColor;
            offCtx.lineWidth = lineWidth;
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
        if (showBorder) {
            offCtx.strokeStyle = waveformColor;
            offCtx.lineWidth = 2;
            offCtx.strokeRect(1, 1, width - 2, height - 2);
        }

        // Blit to main canvas
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(offscreen, 0, 0);

        if (isMountedRef.current) {
            animationRef.current = requestAnimationFrame(animate);
        }
    }, [width, height, waveformColor, backgroundColor, gridBackgroundColor, gridColor, showGrid, showBorder, bufferSize, lineWidth, gridScrollSpeed]);

    // Initialize offscreen and start animation
    useEffect(() => {
        const off = offscreenRef.current;
        off.width = width;
        off.height = height;

        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
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
            dataPoints.current = [];
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
                display: 'block',
            }}
        />
    );
};

export default FrameEngine_ECGElement;