import { default as React } from 'react';

/**
 * GIF capture settings
 */
export interface GifSettings {
    /** Duration of GIF in seconds */
    duration: number;
    /** Quality setting (5-25, higher = better quality) */
    quality: number;
    /** Target FPS for capture */
    targetFps: number;
}
/**
 * Props for the GIF settings modal
 */
export interface FrameEngine2_GifSettingsModalProps {
    /** Whether modal is open */
    open: boolean;
    /** Callback when modal should close */
    onClose: () => void;
    /** Current GIF settings */
    gifSettings: GifSettings;
    /** Callback when settings change */
    onGifSettingsChange: (settings: GifSettings) => void;
    /** Callback when user clicks "Start Capture" */
    onStartCapture: () => void;
}
/**
 * GIF Settings Modal Component
 *
 * Provides UI for configuring animated GIF capture parameters including:
 * - Target FPS (10-60)
 * - Duration (2-10 seconds)
 * - Quality (5-25)
 * - File size estimate
 *
 * **Architecture Notes:**
 * - Extracted from ConfigureFrame2.tsx to reduce component complexity (~130 lines)
 * - Follows FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md Section 4.1 (Component Size Limits)
 * - Self-contained modal with controlled state pattern
 *
 * **Usage Example:**
 * ```typescript
 * <FrameEngine2_GifSettingsModal
 *     open={showGifSettings}
 *     onClose={() => setShowGifSettings(false)}
 *     gifSettings={gifSettings}
 *     onGifSettingsChange={setGifSettings}
 *     onStartCapture={handleStartGifCapture}
 * />
 * ```
 *
 * @param props - Component props
 */
export declare const FrameEngine2_GifSettingsModal: React.FC<FrameEngine2_GifSettingsModalProps>;
export default FrameEngine2_GifSettingsModal;
//# sourceMappingURL=FrameEngine2_GifSettingsModal.d.ts.map