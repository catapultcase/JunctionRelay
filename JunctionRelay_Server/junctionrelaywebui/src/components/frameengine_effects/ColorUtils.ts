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

/**
 * Converts any CSS color string to rgba format with specified alpha
 * Supports hex, rgb, rgba, hsl, hsla, and named colors
 *
 * @param color - Any valid CSS color string (hex, rgb, rgba, hsl, hsla, named)
 * @param alpha - Alpha value (0-1)
 * @returns rgba color string, e.g., "rgba(255, 0, 0, 0.5)"
 */
export function colorToRgba(color: string, alpha: number): string {
    // Handle transparent
    if (color === 'transparent') {
        return `rgba(0, 0, 0, ${alpha})`;
    }

    // Create a temporary canvas to parse the color using the browser's native color parser
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        // Fallback if canvas context not available
        return `rgba(0, 0, 0, ${alpha})`;
    }

    // Set the fillStyle to our color - browser will parse it
    ctx.fillStyle = color;

    // Get the computed color (always returns rgb or rgba)
    const computedColor = ctx.fillStyle;

    // If it's already rgb/rgba, extract the values and apply our alpha
    const rgbaMatch = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);

    if (rgbaMatch) {
        const [, r, g, b] = rgbaMatch;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // If it's a hex color (shouldn't happen but just in case)
    const hexMatch = computedColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);

    if (hexMatch) {
        const [, r, g, b] = hexMatch;
        return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
    }

    // Fallback
    return `rgba(0, 0, 0, ${alpha})`;
}
