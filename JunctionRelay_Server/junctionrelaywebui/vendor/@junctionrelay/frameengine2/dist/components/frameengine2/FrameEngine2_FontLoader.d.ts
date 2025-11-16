/**
 * Load a single Google Font
 * @param fontFamily The font family name (e.g., 'Inter', 'Open Sans')
 */
export declare const loadGoogleFont: (fontFamily: string) => void;
/**
 * Preload common Google Fonts used in FrameEngine2
 * Call this once when the FrameEngine page loads
 */
export declare const preloadCommonFonts: () => void;
/**
 * Check if a font is already loaded
 * @param fontFamily The font family name
 * @returns True if the font is loaded
 */
export declare const isFontLoaded: (fontFamily: string) => boolean;
/**
 * Available pixel fonts for FrameEngine2
 * Simplified list - only easily downloadable fonts without conversion needed
 */
export declare const PIXEL_FONTS: readonly ["Tom Thumb", "Press Start 2P", "Pixel Operator"];
/**
 * Load pixel fonts CSS file
 * This loads the @font-face declarations for all pixel fonts
 * Only needs to be called once - subsequent calls are no-ops
 */
export declare const loadPixelFonts: () => void;
/**
 * Check if a font family is a pixel font
 * @param fontFamily The font family name
 * @returns True if the font is a pixel font
 */
export declare const isPixelFont: (fontFamily: string) => boolean;
//# sourceMappingURL=FrameEngine2_FontLoader.d.ts.map