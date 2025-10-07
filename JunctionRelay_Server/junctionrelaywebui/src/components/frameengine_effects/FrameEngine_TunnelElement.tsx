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

interface TunnelElementProps {
    sensorTag: string;
    sensorValue?: number;
    width: number;
    height: number;
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;

    // Tunnel parameters
    tunnelType?: 'circular' | 'square' | 'hexagon' | 'star' | 'spiral';
    speed?: number; // 0.1-10, tunnel movement speed
    depth?: number; // 5-50, number of rings/segments
    ringSpacing?: number; // 1-20, space between rings
    rotation?: number; // -5 to 5, rotation speed
    twist?: number; // 0-10, tunnel twist amount
    pulseSpeed?: number; // 0-5, pulsing effect speed
    pulseAmount?: number; // 0-1, how much to pulse
    scanlines?: boolean; // Retro scanline effect
    scanlineIntensity?: number; // 0-1
    chromatic?: boolean; // Chromatic aberration
    chromaticAmount?: number; // 0-10
    pixelate?: boolean; // Pixelation effect
    pixelSize?: number; // 1-20
    colorCycle?: boolean; // Cycle colors over time
    colorCycleSpeed?: number; // 0.001-0.1
    perspective?: number; // 0.5-2, perspective distortion
    glow?: boolean; // Add glow effect
    glowIntensity?: number; // 0-20
    lineWidth?: number; // 1-10, base line thickness

    // 3D curve parameters
    curveTargetX?: number; // -1 to 1, horizontal curve direction (-1 = left, 1 = right)
    curveTargetY?: number; // -1 to 1, vertical curve direction (-1 = up, 1 = down)
    curveStrength?: number; // 0-2, how much the tunnel curves
    banking?: number; // 0-1, how much the tunnel banks/rolls into curves
    pitch?: number; // -1 to 1, vertical tilt of tunnel (-1 = looking down, 1 = looking up)
    originX?: number; // 0-1, horizontal position of tunnel center (0 = left, 0.5 = center, 1 = right)
    originY?: number; // 0-1, vertical position of tunnel center (0 = top, 0.5 = center, 1 = bottom)

    // Depth fade parameters
    depthFade?: boolean; // Enable depth fade effect
    fadeEnd?: 'front' | 'back'; // Which end to fade
}

export const FrameEngine_TunnelElement: React.FC<TunnelElementProps> = ({
    width,
    height,
    primaryColor = '#ff00ff',
    secondaryColor = '#00ffff',
    backgroundColor = '#000000',
    tunnelType = 'circular',
    speed = 1,
    depth = 20,
    ringSpacing = 5,
    rotation = 0.5,
    twist = 0,
    pulseSpeed = 1,
    pulseAmount = 0.2,
    scanlines = true,
    scanlineIntensity = 0.3,
    chromatic = false,
    chromaticAmount = 2,
    pixelate = false,
    pixelSize = 4,
    colorCycle = false,
    colorCycleSpeed = 0.01,
    perspective = 1,
    glow = true,
    glowIntensity = 10,
    lineWidth = 2,
    curveTargetX = 0,
    curveTargetY = 0,
    curveStrength = 1,
    banking = 0.5,
    pitch = 0,
    originX = 0.5,
    originY = 0.5,
    depthFade = false,
    fadeEnd = 'back',
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const animationRef = useRef<number | null>(null);
    const timeRef = useRef<number>(0);
    const isMountedRef = useRef(true);

    // Parse color to RGB
    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 0, b: 255 };
    };

    // Interpolate between two colors
    const lerpColor = (color1: string, color2: string, t: number) => {
        const c1 = hexToRgb(color1);
        const c2 = hexToRgb(color2);
        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);
        return `rgb(${r},${g},${b})`;
    };

    // Hue shift color
    const hueShift = (color: string, shift: number) => {
        const rgb = hexToRgb(color);
        const r = rgb.r / 255;
        const g = rgb.g / 255;
        const b = rgb.b / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        const s = max === 0 ? 0 : (max - min) / max;
        const v = max;

        if (max !== min) {
            if (max === r) h = (g - b) / (max - min);
            else if (max === g) h = 2 + (b - r) / (max - min);
            else h = 4 + (r - g) / (max - min);
            h *= 60;
            if (h < 0) h += 360;
        }

        h = (h + shift) % 360;

        const c = v * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = v - c;

        let r1 = 0, g1 = 0, b1 = 0;
        if (h < 60) { r1 = c; g1 = x; b1 = 0; }
        else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
        else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
        else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
        else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
        else { r1 = c; g1 = 0; b1 = x; }

        return `rgb(${Math.round((r1 + m) * 255)},${Math.round((g1 + m) * 255)},${Math.round((b1 + m) * 255)})`;
    };

    // Draw different tunnel shapes
    const drawShape = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, type: string) => {
        ctx.beginPath();

        if (type === 'circular') {
            ctx.arc(x, y, size, 0, Math.PI * 2);
        } else if (type === 'square') {
            const half = size;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.rect(-half, -half, half * 2, half * 2);
            ctx.restore();
        } else if (type === 'hexagon') {
            const sides = 6;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            for (let i = 0; i <= sides; i++) {
                const a = (i / sides) * Math.PI * 2;
                const px = Math.cos(a) * size;
                const py = Math.sin(a) * size;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.restore();
        } else if (type === 'star') {
            const points = 5;
            const outerRadius = size;
            const innerRadius = size * 0.5;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            for (let i = 0; i < points * 2; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
                const px = Math.cos(a) * radius;
                const py = Math.sin(a) * radius;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.restore();
        } else if (type === 'spiral') {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            const turns = 3;
            const points = 100;
            for (let i = 0; i <= points; i++) {
                const t = i / points;
                const a = t * Math.PI * 2 * turns;
                const r = size * t;
                const px = Math.cos(a) * r;
                const py = Math.sin(a) * r;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.restore();
        }
    };

    // Main animation loop
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

        timeRef.current += 0.016 * speed;

        // Clear with background (handle transparency)
        if (backgroundColor === 'transparent') {
            offCtx.clearRect(0, 0, width, height);
        } else {
            offCtx.fillStyle = backgroundColor;
            offCtx.fillRect(0, 0, width, height);
        }

        const centerX = width * originX;
        const centerY = height * originY;

        // Pulse effect
        const pulse = 1 + Math.sin(timeRef.current * pulseSpeed) * pulseAmount;

        // Color cycling
        let color1 = primaryColor;
        let color2 = secondaryColor;
        if (colorCycle) {
            const hueShiftAmount = (timeRef.current * colorCycleSpeed * 360) % 360;
            color1 = hueShift(primaryColor, hueShiftAmount);
            color2 = hueShift(secondaryColor, hueShiftAmount);
        }

        // Seamless looping offset
        const scrollOffset = timeRef.current % ringSpacing;

        // Draw tunnel rings from back to front
        // We draw extra rings beyond depth to ensure seamless looping
        for (let i = depth + Math.ceil(ringSpacing); i >= -Math.ceil(ringSpacing); i--) {
            const ringZ = i - scrollOffset;

            if (ringZ <= 0) continue;

            // Calculate depth factor (0 at back, 1 at front)
            // Normalize based on visible depth for consistent appearance
            const depthFactor = Math.min(1, Math.max(0, 1 - (ringZ / depth)));

            // Calculate 3D curve offset
            const curveOffsetX = curveTargetX * curveStrength * depthFactor * (width / 4);
            const curveOffsetY = (curveTargetY + pitch) * curveStrength * depthFactor * (height / 4);

            // Calculate size with perspective
            const scale = (width / 2) / (ringZ * perspective);
            const size = scale * pulse;

            // Skip if ring is too small to see
            if (size < 0.5) continue;

            // Calculate position with curve
            const posX = centerX + curveOffsetX;
            const posY = centerY + curveOffsetY;

            // Calculate rotation angle with banking
            const baseAngle = (timeRef.current * rotation);
            const twistOffset = (twist * (depth - ringZ)) / depth;
            const bankAngle = -curveTargetX * banking * depthFactor * Math.PI / 4;
            const angle = baseAngle + twistOffset + bankAngle;

            // Calculate color based on normalized depth
            const colorT = depthFactor;
            const color = lerpColor(color1, color2, colorT);

            // Calculate alpha based on depth
            let alpha = Math.max(0.3, 1 - colorT * 0.7);

            // Apply depth fade if enabled
            if (depthFade) {
                const fadeAlpha = fadeEnd === 'back' ? depthFactor : (1 - depthFactor);
                alpha *= fadeAlpha;
            }

            // Set up drawing
            if (glow) {
                offCtx.shadowBlur = glowIntensity * (1 - colorT);
                offCtx.shadowColor = color;
            }

            offCtx.strokeStyle = color;
            offCtx.globalAlpha = alpha;
            offCtx.lineWidth = Math.max(1, lineWidth * (1 - colorT * 0.5));

            // Draw the shape
            drawShape(offCtx, posX, posY, size, angle, tunnelType);
            offCtx.stroke();

            // Draw connecting lines for more structure
            if (tunnelType !== 'spiral') {
                const nextRingZ = ringZ + ringSpacing;
                if (nextRingZ > 0 && nextRingZ <= depth + ringSpacing) {
                    const nextDepthFactor = Math.min(1, Math.max(0, 1 - (nextRingZ / depth)));
                    const nextCurveOffsetX = curveTargetX * curveStrength * nextDepthFactor * (width / 4);
                    const nextCurveOffsetY = (curveTargetY + pitch) * curveStrength * nextDepthFactor * (height / 4);

                    const nextScale = (width / 2) / (nextRingZ * perspective);
                    const nextSize = nextScale * pulse;

                    if (nextSize >= 0.5) {
                        const nextPosX = centerX + nextCurveOffsetX;
                        const nextPosY = centerY + nextCurveOffsetY;
                        const nextBankAngle = -curveTargetX * banking * nextDepthFactor * Math.PI / 4;
                        const nextAngle = baseAngle + (twist * (depth - nextRingZ)) / depth + nextBankAngle;

                        // Draw radial lines
                        const segments = tunnelType === 'circular' ? 8 : (tunnelType === 'hexagon' ? 6 : 4);
                        for (let s = 0; s < segments; s++) {
                            const a = (s / segments) * Math.PI * 2 + angle;
                            const x1 = posX + Math.cos(a) * size;
                            const y1 = posY + Math.sin(a) * size;
                            const x2 = nextPosX + Math.cos(a + (nextAngle - angle)) * nextSize;
                            const y2 = nextPosY + Math.sin(a + (nextAngle - angle)) * nextSize;

                            offCtx.beginPath();
                            offCtx.moveTo(x1, y1);
                            offCtx.lineTo(x2, y2);
                            offCtx.stroke();
                        }
                    }
                }
            }
        }

        offCtx.globalAlpha = 1;
        offCtx.shadowBlur = 0;

        // Apply chromatic aberration
        if (chromatic) {
            const imageData = offCtx.getImageData(0, 0, width, height);
            const data = imageData.data;
            const shift = chromaticAmount;

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;

                    // Shift red channel
                    const xr = Math.min(width - 1, x + shift);
                    const idxR = (y * width + xr) * 4;
                    data[idx] = data[idxR];

                    // Shift blue channel
                    const xb = Math.max(0, x - shift);
                    const idxB = (y * width + xb) * 4;
                    data[idx + 2] = data[idxB + 2];
                }
            }
            offCtx.putImageData(imageData, 0, 0);
        }

        // Apply scanlines
        if (scanlines) {
            offCtx.fillStyle = `rgba(0, 0, 0, ${scanlineIntensity})`;
            for (let y = 0; y < height; y += 2) {
                offCtx.fillRect(0, y, width, 1);
            }
        }

        // Copy to main canvas
        if (backgroundColor === 'transparent') {
            ctx.clearRect(0, 0, width, height);
        } else {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);
        }

        if (pixelate) {
            // Pixelation effect
            const pixW = Math.floor(width / pixelSize);
            const pixH = Math.floor(height / pixelSize);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(offscreen, 0, 0, pixW, pixH);
            ctx.drawImage(canvas, 0, 0, pixW, pixH, 0, 0, width, height);
        } else {
            ctx.drawImage(offscreen, 0, 0);
        }

        if (isMountedRef.current) {
            animationRef.current = requestAnimationFrame(animate);
        }
    }, [width, height, primaryColor, secondaryColor, backgroundColor, tunnelType, speed,
        depth, ringSpacing, rotation, twist, pulseSpeed, pulseAmount, scanlines,
        scanlineIntensity, chromatic, chromaticAmount, pixelate, pixelSize, colorCycle,
        colorCycleSpeed, perspective, glow, glowIntensity, curveTargetX, curveTargetY,
        curveStrength, banking, pitch, originX, originY, depthFade, fadeEnd, lineWidth]);

    // Initialize and start animation
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