import { useCallback, useRef } from 'react';
import html2canvas from 'html2canvas';
import { encode } from 'modern-gif';
import type { FrameLayoutConfig } from '../types/FrameEngine2_LayoutTypes';
import type { FrameEngine2_CanvasRef } from '../FrameEngine2_Canvas';

export type GifCaptureStage = 'preparing' | 'frames' | 'encoding' | 'finalizing';

interface UseGifCaptureOptions {
    layout: FrameLayoutConfig | null;
    id: string | undefined;
    previewMode: boolean;
    sidebarTab: number;
    canvasRef: React.RefObject<FrameEngine2_CanvasRef | null>;
    onPreviewToggle: () => void;
    onSetSidebarTab: (tab: number) => void;
    onSetGifCaptureInProgress: (inProgress: boolean) => void;
    onSetGifCaptureProgress: (progress: number) => void;
    onSetGifCaptureStage: (stage: GifCaptureStage) => void;
}

interface GifCaptureOptions {
    duration?: number;      // seconds to record (default: 5)
    quality?: number;       // 5-25, higher = better (default: 15)
    targetWidth?: number;   // optional resize width (default: 1280 for 720p)
    targetHeight?: number;  // optional resize height (default: 720)
    targetFps?: number;     // target frames per second (default: 30)
}

interface CaptureResult {
    success: boolean;
    error?: string;
}

/**
 * Custom hook for handling animated GIF capture
 * Captures multiple frames over time and encodes them into an animated GIF
 */
export function useGifCapture(options: UseGifCaptureOptions) {
    const {
        layout,
        id,
        previewMode,
        sidebarTab,
        canvasRef,
        onPreviewToggle,
        onSetSidebarTab,
        onSetGifCaptureInProgress,
        onSetGifCaptureProgress,
        onSetGifCaptureStage
    } = options;

    const originalTabBeforeCapture = useRef<number | null>(null);

    /**
     * Prepare for capture: enter preview mode, reset view, show modal
     */
    const prepareForCapture = useCallback(async (): Promise<boolean> => {
        if (!layout || !canvasRef.current) {
            console.error('[useGifCapture] Cannot capture: No layout or canvas ref');
            return false;
        }

        const wasInPreviewMode = previewMode;

        // Store current tab if entering preview mode
        if (!wasInPreviewMode) {
            originalTabBeforeCapture.current = sidebarTab;
        }

        // Show modal
        onSetGifCaptureInProgress(true);
        onSetGifCaptureProgress(0);
        onSetGifCaptureStage('preparing');

        // Small delay to ensure modal is visible
        await new Promise(resolve => setTimeout(resolve, 100));

        // Reset view (zoom to 1.0 and center canvas)
        canvasRef.current.resetView();
        await new Promise(resolve => setTimeout(resolve, 300));

        // Enable preview mode if not already enabled
        if (!wasInPreviewMode) {
            onPreviewToggle();
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Additional delay to ensure canvas is fully rendered
        await new Promise(resolve => setTimeout(resolve, 400));

        return true;
    }, [layout, canvasRef, previewMode, sidebarTab, onSetGifCaptureInProgress, onSetGifCaptureProgress, onSetGifCaptureStage, onPreviewToggle]);

    /**
     * Restore state after capture: exit preview mode, restore tab, hide modal
     */
    const restoreAfterCapture = useCallback((wasInPreviewMode: boolean) => {
        if (!wasInPreviewMode) {
            setTimeout(() => {
                onPreviewToggle();
                // Restore original tab after exiting preview mode
                if (originalTabBeforeCapture.current !== null) {
                    setTimeout(() => {
                        onSetSidebarTab(originalTabBeforeCapture.current!);
                        originalTabBeforeCapture.current = null;
                    }, 100);
                }
            }, 100);
        }

        onSetGifCaptureInProgress(false);
        onSetGifCaptureProgress(0);
    }, [onPreviewToggle, onSetSidebarTab, onSetGifCaptureInProgress, onSetGifCaptureProgress]);

    /**
     * Capture single canvas frame as ImageData
     */
    const captureFrame = useCallback(async (targetWidth?: number, targetHeight?: number): Promise<ImageData | null> => {
        const canvasElement = document.querySelector('[data-canvas-container="true"]') as HTMLElement;

        if (!canvasElement) {
            console.error('[useGifCapture] Could not find canvas element');
            return null;
        }

        try {
            const canvas = await html2canvas(canvasElement, {
                useCORS: true,
                allowTaint: true,
                background: layout?.backgroundColor || '#FFFFFF'
            });

            // Optionally resize for smaller file sizes
            let finalCanvas = canvas;
            if (targetWidth && targetHeight && (canvas.width !== targetWidth || canvas.height !== targetHeight)) {
                const resizeCanvas = document.createElement('canvas');
                resizeCanvas.width = targetWidth;
                resizeCanvas.height = targetHeight;
                const ctx = resizeCanvas.getContext('2d');
                if (ctx) {
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
                    finalCanvas = resizeCanvas;
                }
            }

            const ctx = finalCanvas.getContext('2d');
            if (!ctx) return null;

            return ctx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
        } catch (err) {
            console.error('[useGifCapture] Failed to capture frame:', err);
            return null;
        }
    }, [layout]);

    /**
     * Capture animated GIF
     */
    const captureGif = useCallback(async (gifOptions: GifCaptureOptions = {}): Promise<CaptureResult> => {
        const {
            duration = 5,
            quality = 15,
            targetWidth = 1280,
            targetHeight = 720,
            targetFps = 30
        } = gifOptions;

        const wasInPreviewMode = previewMode;

        try {
            // Prepare for capture
            const prepared = await prepareForCapture();
            if (!prepared) {
                restoreAfterCapture(wasInPreviewMode);
                return { success: false, error: 'Failed to prepare for capture' };
            }

            console.log(`[useGifCapture] Starting GIF capture: ${duration} seconds @ ${targetFps} FPS`);

            const frames: ImageData[] = [];
            const startTime = performance.now();
            const durationMs = duration * 1000;
            const targetFrameTime = 1000 / targetFps; // Time per frame in milliseconds

            // Stage 1: Capture frames for the specified duration (0-60% progress)
            onSetGifCaptureStage('frames');

            let frameCount = 0;
            let nextFrameTime = startTime;

            while (performance.now() - startTime < durationMs) {
                const frameStartTime = performance.now();
                const frameData = await captureFrame(targetWidth, targetHeight);

                if (!frameData) {
                    console.error(`[useGifCapture] Failed to capture frame ${frameCount + 1}`);
                    continue;
                }

                frames.push(frameData);
                frameCount++;

                // Update progress based on elapsed time (0-60% for frame capture)
                const elapsedTime = performance.now() - startTime;
                const timeProgress = Math.min((elapsedTime / durationMs) * 60, 60);
                onSetGifCaptureProgress(timeProgress);

                console.log(`[useGifCapture] Captured frame ${frameCount} (${Math.round(elapsedTime)}ms elapsed)`);

                // Calculate next frame time and wait if needed
                nextFrameTime += targetFrameTime;
                const waitTime = nextFrameTime - performance.now();
                if (waitTime > 0 && performance.now() - startTime < durationMs) {
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }

            const actualDuration = (performance.now() - startTime) / 1000;
            console.log(`[useGifCapture] Captured ${frames.length} frames in ${actualDuration.toFixed(2)}s (${(frames.length / actualDuration).toFixed(1)} FPS)`);

            // Calculate delay per frame based on target FPS
            const frameDelayCs = Math.round(100 / targetFps);

            if (frames.length === 0) {
                alert('Failed to capture any frames. Please try again.');
                restoreAfterCapture(wasInPreviewMode);
                return { success: false, error: 'No frames captured' };
            }

            console.log(`[useGifCapture] Captured ${frames.length} frames, starting encoding...`);

            // Stage 2: Encode GIF (60-95% progress)
            onSetGifCaptureStage('encoding');
            onSetGifCaptureProgress(65);

            // Give React time to re-render the UI before blocking on encoding
            await new Promise(resolve => setTimeout(resolve, 100));

            // Ensure all frames have the same dimensions
            const width = frames[0].width;
            const height = frames[0].height;

            // Convert ImageData frames to UnencodedFrame format
            const encodingFrames = frames.map(frameData => ({
                data: frameData.data, // Uint8ClampedArray
                delay: frameDelayCs // Delay per frame in centiseconds (GIF format standard)
            }));

            const gifData = await encode({
                width,
                height,
                frames: encodingFrames,
                maxColors: Math.min(256, Math.max(2, 256 - (30 - quality) * 8)), // Invert quality: 25(Best)→216 colors, 15(Good)→136 colors, 5(Fast)→56 colors
                format: 'arrayBuffer'
                // Note: workerUrl not used (requires Vite-specific import syntax)
                // Encoding runs on main thread, but indeterminate progress shows it's working
            });

            onSetGifCaptureProgress(95);
            console.log(`[useGifCapture] GIF encoded: ${gifData.byteLength} bytes`);

            // Stage 3: Download (95-100% progress)
            onSetGifCaptureStage('finalizing');

            const blob = new Blob([gifData], { type: 'image/gif' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `animated-preview-${layout?.displayName || id || 'layout'}.gif`;
            a.click();
            URL.revokeObjectURL(url);

            onSetGifCaptureProgress(100);
            console.log(`[useGifCapture] GIF downloaded successfully (${(gifData.byteLength / 1024 / 1024).toFixed(2)} MB)`);

            // Small delay to show 100% before closing
            await new Promise(resolve => setTimeout(resolve, 500));

            // Restore state
            restoreAfterCapture(wasInPreviewMode);

            return { success: true };

        } catch (err) {
            console.error('[useGifCapture] Failed to capture GIF:', err);
            alert(`Failed to capture GIF: ${err instanceof Error ? err.message : 'Unknown error'}`);
            restoreAfterCapture(wasInPreviewMode);
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    }, [previewMode, layout, id, prepareForCapture, captureFrame, restoreAfterCapture, onSetGifCaptureStage, onSetGifCaptureProgress]);

    return {
        captureGif
    };
}
