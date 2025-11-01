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
 * Common Google Fonts used in FrameEngine2
 * Preloading these fonts improves performance and prevents layout shifts
 */
const COMMON_FONTS = [
    'Inter',
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Poppins',
    'Oswald',
    'Raleway'
];

/**
 * Track loaded fonts to prevent duplicate loads
 */
const loadedFonts = new Set<string>();

/**
 * Load a single Google Font
 * @param fontFamily The font family name (e.g., 'Inter', 'Open Sans')
 */
export const loadGoogleFont = (fontFamily: string): void => {
    // Check if font is already loaded
    if (loadedFonts.has(fontFamily)) {
        return;
    }

    const linkId = `google-font-${fontFamily.replace(/\s+/g, '-')}`;
    if (document.getElementById(linkId)) {
        loadedFonts.add(fontFamily);
        return;
    }

    // Create link element to load the font
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@400;700&display=swap`;
    document.head.appendChild(link);

    loadedFonts.add(fontFamily);
};

/**
 * Preload common Google Fonts used in FrameEngine2
 * Call this once when the FrameEngine page loads
 */
export const preloadCommonFonts = (): void => {
    COMMON_FONTS.forEach(font => {
        loadGoogleFont(font);
    });
};

/**
 * Check if a font is already loaded
 * @param fontFamily The font family name
 * @returns True if the font is loaded
 */
export const isFontLoaded = (fontFamily: string): boolean => {
    return loadedFonts.has(fontFamily);
};
