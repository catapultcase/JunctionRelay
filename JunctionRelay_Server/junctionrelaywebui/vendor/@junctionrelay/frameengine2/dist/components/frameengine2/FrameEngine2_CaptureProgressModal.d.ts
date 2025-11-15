import { default as React } from 'react';

/**
 * GIF capture stage identifier
 */
export type GifCaptureStage = 'preparing' | 'frames' | 'encoding' | 'finalizing';
/**
 * Props for the capture progress modal
 */
export interface FrameEngine2_CaptureProgressModalProps {
    /** Whether modal is open (true if screenshot or GIF capture in progress) */
    open: boolean;
    /** Whether GIF capture is in progress (vs screenshot capture) */
    gifCaptureInProgress: boolean;
    /** Current GIF capture stage */
    gifCaptureStage: GifCaptureStage;
    /** GIF capture progress (0-100 for frames, or undefined for encoding/finalizing) */
    gifCaptureProgress: number;
    /** GIF duration in seconds (for progress display) */
    gifDuration: number;
}
/**
 * Capture Progress Modal Component
 *
 * Displays progress during screenshot or GIF capture operations with:
 * - Spinner for screenshot capture
 * - Progress bar for GIF frame capture
 * - Indeterminate spinner for GIF encoding/finalizing
 * - Stage-specific messages
 *
 * **Architecture Notes:**
 * - Extracted from ConfigureFrame2.tsx to reduce component complexity (~65 lines)
 * - Follows FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md Section 4.1 (Component Size Limits)
 * - Self-contained modal with controlled state pattern
 *
 * **Usage Example:**
 * ```typescript
 * <FrameEngine2_CaptureProgressModal
 *     open={screenshotInProgress || gifCaptureInProgress}
 *     gifCaptureInProgress={gifCaptureInProgress}
 *     gifCaptureStage={gifCaptureStage}
 *     gifCaptureProgress={gifCaptureProgress}
 *     gifDuration={gifSettings.duration}
 * />
 * ```
 *
 * @param props - Component props
 */
export declare const FrameEngine2_CaptureProgressModal: React.FC<FrameEngine2_CaptureProgressModalProps>;
export default FrameEngine2_CaptureProgressModal;
//# sourceMappingURL=FrameEngine2_CaptureProgressModal.d.ts.map