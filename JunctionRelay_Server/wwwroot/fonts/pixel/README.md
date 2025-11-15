# Pixel Fonts for FrameEngine2

This directory contains pixel-perfect bitmap fonts for use in JunctionRelay's FrameEngine2 text elements.

## Required Font Files

Download the following fonts and place them in this directory:

### 1. Tom Thumb (MIT License)
- **Source**: https://robey.lag.net/2010/01/23/tiny-monospace-font.html
- **Files needed**: `TomThumb.ttf` and `TomThumb.woff2`
- **Description**: Ultra-tiny 4x6 pixel font, perfect for tiny displays
- **License**: MIT

### 2. Pixel Operator (Free License)
- **Source**: https://www.dafont.com/pixel-operator.font
- **Files needed**: `PixelOperator.ttf`, `PixelOperator-Bold.ttf`, and WOFF2 versions
- **Description**: Clean 8x8 pixel font with excellent readability
- **License**: Free for personal and commercial use

### 3. Press Start 2P (SIL OFL)
- **Source**: https://fonts.google.com/specimen/Press+Start+2P
- **Files needed**: `PressStart2P.ttf` and `PressStart2P.woff2`
- **Description**: Classic arcade/NES style font
- **License**: SIL Open Font License 1.1

### 4. Spleen (BSD 2-Clause)
- **Source**: https://github.com/fcambus/spleen
- **Files needed**:
  - `spleen-8x16.ttf` / `spleen-8x16.woff2`
  - `spleen-12x24.ttf` / `spleen-12x24.woff2`
- **Description**: Monospaced bitmap font in multiple sizes
- **License**: BSD 2-Clause

### 5. Terminus (SIL OFL)
- **Source**: https://terminus-font.sourceforge.net/
- **Files needed**: `Terminus.ttf`, `Terminus-Bold.ttf`, and WOFF2 versions
- **Description**: Terminal font for code and technical displays
- **License**: SIL Open Font License 1.1

### 6. Creep (MIT License)
- **Source**: https://github.com/romeovs/creep
- **Files needed**: `creep.ttf` and `creep.woff2`
- **Description**: Tiny 4x6 bitmap font
- **License**: MIT

### 7. Scientifica (SIL OFL)
- **Source**: https://github.com/nerdypepper/scientifica
- **Files needed**: `scientifica.ttf` and `scientifica.woff2`
- **Description**: Clean 6x11 bitmap for programming
- **License**: SIL Open Font License 1.1

### 8. Picopixel (Apache 2.0)
- **Source**: https://github.com/sebastiankg/picopixel
- **Files needed**: `Picopixel.ttf` and `Picopixel.woff2`
- **Description**: Ultra-compact pixel font
- **License**: Apache 2.0

## Font Format Notes

- **WOFF2**: Preferred format for web use (smaller file size, better compression)
- **TTF**: Fallback format for broader compatibility

## Converting Fonts

If only TTF files are available, you can convert them to WOFF2 using:
- Online: https://cloudconvert.com/ttf-to-woff2
- CLI: `woff2_compress font.ttf` (requires woff2 tools)

## License Compliance

All font licenses have been added to:
`D:\Dev\JunctionRelay_Dev\LICENSES-THIRD-PARTY.txt`

## Usage in FrameEngine2

These fonts are automatically loaded by `FrameEngine2_FontLoader.ts` when a text element uses `fontType: 'pixel'`.

The CSS file `pixelfonts.css` is injected into the document head when the first pixel font is used.
