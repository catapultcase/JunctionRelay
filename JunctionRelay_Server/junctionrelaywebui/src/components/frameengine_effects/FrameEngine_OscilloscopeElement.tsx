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
import { colorToRgba } from './ColorUtils';

interface OscilloscopeElementProps {
    sensorTag: string;
    sensorValue?: number;
    width: number;
    height: number;
    waveformColor?: string;
    backgroundColor?: string;
    gridColor?: string;
    showGrid?: boolean;
    showBorder?: boolean;
    bufferSize?: number;
    yAxisMin?: number;
    yAxisMax?: number;
    lineWidth?: number;

    // Oscilloscope-specific effects
    mode?: 'line' | 'dots' | 'glow' | 'filled' | 'dual' | 'lissajous' | 'spectrum';
    phosphorDecay?: number; // 0-1, how long trail persists
    glowIntensity?: number; // 0-10, glow effect strength
    frequency?: number; // Base frequency for waveform
    phase?: number; // Phase offset 0-360
    amplitude?: number; // Amplitude multiplier
    harmonics?: number; // Number of harmonic overtones to add
    noiseLevel?: number; // 0-1, adds random noise
    symmetry?: number; // -1 to 1, waveform symmetry
    triggerLevel?: number; // 0-100, trigger visualization threshold
    showTrigger?: boolean;
}

export const FrameEngine_OscilloscopeElement: React.FC<OscilloscopeElementProps> = ({
    sensorValue,
    width,
    height,
    waveformColor = '#00ff00',
    backgroundColor = '#000000',
    gridColor = 'rgba(0, 255, 0, 0.2)',
    showGrid = true,
    showBorder = true,
    bufferSize = 200,
    yAxisMin = 0,
    yAxisMax = 100,
    lineWidth = 2,
    mode = 'glow',
    phosphorDecay = 0.95,
    glowIntensity = 3,
    frequency = 0.05,
    phase = 0,
    amplitude = 1,
    harmonics = 0,
    noiseLevel = 0,
    symmetry = 0,
    triggerLevel = 50,
    showTrigger = false,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const trailRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const animationRef = useRef<number | null>(null);
    const dataPoints = useRef<number[]>([]);
    const dataPointsY = useRef<number[]>([]); // For lissajous mode
    const currentValueY = useRef<number>(height / 2);
    const timeOffset = useRef<number>(0);
    const isMountedRef = useRef(true);

    const GRID_SIZE = 20;

    // Initialize data buffer
    useEffect(() => {
        dataPoints.current = Array(bufferSize).fill(height / 2);
        dataPointsY.current = Array(bufferSize).fill(height / 2);
    }, [bufferSize, height]);

    // Update current value when sensor changes
    useEffect(() => {
        if (sensorValue === undefined || sensorValue === null) return;

        const valueRange = yAxisMax - yAxisMin;
        const normalizedValue = (sensorValue - yAxisMin) / valueRange;
        const clampedValue = Math.max(0, Math.min(1, normalizedValue));
        currentValueY.current = height - (clampedValue * height);
    }, [sensorValue, height, yAxisMin, yAxisMax]);

    // Generate synthesized waveform with effects
    const generateWaveform = useCallback((index: number, time: number) => {
        let value = 0;
        const t = (index / bufferSize) * Math.PI * 2 * 10 + time * frequency + (phase * Math.PI / 180);

        // Base sine wave
        value = Math.sin(t) * amplitude;

        // Add harmonics
        for (let h = 1; h <= harmonics; h++) {
            value += Math.sin(t * (h + 1)) * (amplitude / (h + 1));
        }

        // Apply symmetry (distorts waveform)
        if (symmetry !== 0) {
            value = Math.sign(value) * Math.pow(Math.abs(value), 1 + symmetry);
        }

        // Add noise
        if (noiseLevel > 0) {
            value += (Math.random() - 0.5) * noiseLevel * 2;
        }

        // Normalize and scale to canvas
        value = Math.max(-1, Math.min(1, value));
        return height / 2 + (value * height * 0.4);
    }, [bufferSize, frequency, phase, amplitude, harmonics, noiseLevel, symmetry, height]);

    // Animation loop
    const animate = useCallback(() => {
        if (!isMountedRef.current) return;

        const canvas = canvasRef.current;
        const offscreen = offscreenRef.current;
        const trail = trailRef.current;

        if (!canvas || !offscreen || !trail) {
            animationRef.current = requestAnimationFrame(animate);
            return;
        }

        const ctx = canvas.getContext('2d');
        const offCtx = offscreen.getContext('2d');
        const trailCtx = trail.getContext('2d');

        if (!ctx || !offCtx || !trailCtx) {
            animationRef.current = requestAnimationFrame(animate);
            return;
        }

        timeOffset.current += 1;

        // Generate new data points
        if (mode === 'lissajous') {
            // Lissajous uses two perpendicular waveforms
            for (let i = 0; i < bufferSize; i++) {
                dataPoints.current[i] = generateWaveform(i, timeOffset.current);
                dataPointsY.current[i] = generateWaveform(i, timeOffset.current * 1.5);
            }
        } else if (mode === 'spectrum') {
            // Spectrum analyzer style - vertical bars
            for (let i = 0; i < bufferSize; i++) {
                const freq = i / bufferSize;
                const value = Math.abs(Math.sin(timeOffset.current * frequency + freq * Math.PI * 10));
                dataPoints.current[i] = height - (value * height * amplitude);
            }
        } else {
            // Normal waveform modes
            for (let i = 0; i < bufferSize; i++) {
                const baseValue = generateWaveform(i, timeOffset.current);
                // Mix with sensor value if available
                if (sensorValue !== undefined) {
                    dataPoints.current[i] = (baseValue + currentValueY.current) / 2;
                } else {
                    dataPoints.current[i] = baseValue;
                }
            }
        }

        // Clear offscreen
        offCtx.fillStyle = backgroundColor;
        offCtx.fillRect(0, 0, width, height);

        // Grid
        if (showGrid) {
            offCtx.strokeStyle = gridColor;
            offCtx.lineWidth = 1;

            for (let x = 0; x < width; x += GRID_SIZE) {
                offCtx.beginPath();
                offCtx.moveTo(x, 0);
                offCtx.lineTo(x, height);
                offCtx.stroke();
            }

            for (let y = 0; y < height; y += GRID_SIZE) {
                offCtx.beginPath();
                offCtx.moveTo(0, y);
                offCtx.lineTo(width, y);
                offCtx.stroke();
            }
        }

        // Trigger line
        if (showTrigger) {
            const triggerY = height - (triggerLevel / 100) * height;
            offCtx.strokeStyle = 'rgba(255, 100, 0, 0.5)';
            offCtx.lineWidth = 1;
            offCtx.setLineDash([5, 5]);
            offCtx.beginPath();
            offCtx.moveTo(0, triggerY);
            offCtx.lineTo(width, triggerY);
            offCtx.stroke();
            offCtx.setLineDash([]);
        }

        // Apply phosphor decay to trail
        if (phosphorDecay < 1) {
            trailCtx.fillStyle = `rgba(0, 0, 0, ${1 - phosphorDecay})`;
            trailCtx.fillRect(0, 0, width, height);
        }

        // Render waveform based on mode
        const pts = dataPoints.current;

        if (mode === 'lissajous') {
            // X-Y mode
            offCtx.strokeStyle = waveformColor;
            offCtx.lineWidth = lineWidth;
            offCtx.beginPath();

            pts.forEach((x, i) => {
                const y = dataPointsY.current[i];
                if (i === 0) {
                    offCtx.moveTo(x, y);
                } else {
                    offCtx.lineTo(x, y);
                }
            });
            offCtx.stroke();

        } else if (mode === 'dots') {
            // Dot mode
            offCtx.fillStyle = waveformColor;
            pts.forEach((y, i) => {
                const x = (i / (pts.length - 1)) * width;
                offCtx.beginPath();
                offCtx.arc(x, y, lineWidth, 0, Math.PI * 2);
                offCtx.fill();
            });

        } else if (mode === 'spectrum') {
            // Spectrum analyzer bars
            const barWidth = width / pts.length;
            offCtx.fillStyle = waveformColor;
            pts.forEach((y, i) => {
                const x = i * barWidth;
                const barHeight = height - y;
                offCtx.fillRect(x, y, barWidth - 1, barHeight);
            });

        } else if (mode === 'filled') {
            // Filled waveform
            offCtx.fillStyle = colorToRgba(waveformColor, 0.3);
            offCtx.strokeStyle = waveformColor;
            offCtx.lineWidth = lineWidth;
            offCtx.beginPath();

            offCtx.moveTo(0, height);
            pts.forEach((y, i) => {
                const x = (i / (pts.length - 1)) * width;
                offCtx.lineTo(x, y);
            });
            offCtx.lineTo(width, height);
            offCtx.closePath();
            offCtx.fill();
            offCtx.stroke();

        } else if (mode === 'dual') {
            // Dual trace - mirror waveform
            offCtx.strokeStyle = waveformColor;
            offCtx.lineWidth = lineWidth;

            // Top trace
            offCtx.beginPath();
            pts.forEach((y, i) => {
                const x = (i / (pts.length - 1)) * width;
                const adjustedY = y * 0.4 + height * 0.15;
                if (i === 0) offCtx.moveTo(x, adjustedY);
                else offCtx.lineTo(x, adjustedY);
            });
            offCtx.stroke();

            // Bottom trace (inverted)
            offCtx.beginPath();
            pts.forEach((y, i) => {
                const x = (i / (pts.length - 1)) * width;
                const adjustedY = height - (y * 0.4 + height * 0.15);
                if (i === 0) offCtx.moveTo(x, adjustedY);
                else offCtx.lineTo(x, adjustedY);
            });
            offCtx.stroke();

        } else {
            // Line or glow mode
            offCtx.strokeStyle = waveformColor;
            offCtx.lineWidth = lineWidth;
            offCtx.lineCap = 'round';
            offCtx.lineJoin = 'round';

            if (mode === 'glow') {
                // Multiple passes for glow effect
                for (let g = glowIntensity; g > 0; g--) {
                    offCtx.shadowBlur = g * 5;
                    offCtx.shadowColor = waveformColor;
                    offCtx.beginPath();
                    pts.forEach((y, i) => {
                        const x = (i / (pts.length - 1)) * width;
                        if (i === 0) offCtx.moveTo(x, y);
                        else offCtx.lineTo(x, y);
                    });
                    offCtx.stroke();
                }
                offCtx.shadowBlur = 0;
            } else {
                offCtx.beginPath();
                pts.forEach((y, i) => {
                    const x = (i / (pts.length - 1)) * width;
                    if (i === 0) offCtx.moveTo(x, y);
                    else offCtx.lineTo(x, y);
                });
                offCtx.stroke();
            }
        }

        // Border
        if (showBorder) {
            offCtx.strokeStyle = waveformColor;
            offCtx.lineWidth = 2;
            offCtx.strokeRect(1, 1, width - 2, height - 2);
        }

        // Composite trail with current frame
        if (phosphorDecay < 1) {
            trailCtx.drawImage(offscreen, 0, 0);
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(trail, 0, 0);
        } else {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(offscreen, 0, 0);
        }

        if (isMountedRef.current) {
            animationRef.current = requestAnimationFrame(animate);
        }
    }, [width, height, waveformColor, backgroundColor, gridColor, showGrid, showBorder,
        bufferSize, lineWidth, mode, phosphorDecay, glowIntensity, generateWaveform,
        sensorValue, currentValueY, triggerLevel, showTrigger]);

    // Initialize canvases and start animation
    useEffect(() => {
        const off = offscreenRef.current;
        const trail = trailRef.current;
        off.width = width;
        off.height = height;
        trail.width = width;
        trail.height = height;

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
            dataPointsY.current = [];
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