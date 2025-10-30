import { useCallback, useRef } from 'react';
import html2canvas from 'html2canvas';
import type { FrameLayoutConfig } from '../types/FrameEngine2_LayoutTypes';
import type { FrameEngine2_CanvasRef } from '../FrameEngine2_Canvas';

interface UseScreenshotCaptureOptions {
    layout: FrameLayoutConfig | null;
    id: string | undefined;
    previewMode: boolean;
    sidebarTab: number;
    canvasRef: React.RefObject<FrameEngine2_CanvasRef | null>;
    onPreviewToggle: () => void;
    onSetSidebarTab: (tab: number) => void;
    onSetScreenshotInProgress: (inProgress: boolean) => void;
    onSetThumbnailLoading: (loading: boolean) => void;
    onSetThumbnailUrl: (url: string) => void;
}

interface CaptureResult {
    success: boolean;
    error?: string;
}

/**
 * Custom hook for handling screenshot and thumbnail capture logic
 * Extracted from ConfigureFrame2 to reduce complexity and improve maintainability
 */
export function useScreenshotCapture(options: UseScreenshotCaptureOptions) {
    const {
        layout,
        id,
        previewMode,
        sidebarTab,
        canvasRef,
        onPreviewToggle,
        onSetSidebarTab,
        onSetScreenshotInProgress,
        onSetThumbnailLoading,
        onSetThumbnailUrl
    } = options;

    const originalTabBeforeCapture = useRef<number | null>(null);

    /**
     * Prepare for capture: enter preview mode, reset view, show modal
     */
    const prepareForCapture = useCallback(async (forThumbnail: boolean): Promise<boolean> => {
        if (!layout || !canvasRef.current) {
            console.error('[useScreenshotCapture] Cannot capture: No layout or canvas ref');
            return false;
        }

        const originalPreviewMode = previewMode;

        // Store current tab if entering preview mode
        if (!originalPreviewMode) {
            originalTabBeforeCapture.current = sidebarTab;
        }

        // Show modal
        onSetScreenshotInProgress(true);
        if (forThumbnail) {
            onSetThumbnailLoading(true);
        }

        // Small delay to ensure modal is visible
        await new Promise(resolve => setTimeout(resolve, 100));

        // Reset view (zoom to 1.0 and center canvas)
        canvasRef.current.resetView();
        await new Promise(resolve => setTimeout(resolve, 300));

        // Enable preview mode if not already enabled
        if (!originalPreviewMode) {
            onPreviewToggle();
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Additional delay to ensure canvas is fully rendered
        await new Promise(resolve => setTimeout(resolve, 400));

        return true;
    }, [layout, canvasRef, previewMode, sidebarTab, onSetScreenshotInProgress, onSetThumbnailLoading, onPreviewToggle]);

    /**
     * Restore state after capture: exit preview mode, restore tab, hide modal
     */
    const restoreAfterCapture = useCallback((forThumbnail: boolean, wasInPreviewMode: boolean) => {
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

        onSetScreenshotInProgress(false);
        if (forThumbnail) {
            onSetThumbnailLoading(false);
        }
    }, [onPreviewToggle, onSetSidebarTab, onSetScreenshotInProgress, onSetThumbnailLoading]);

    /**
     * Capture canvas element using html2canvas
     */
    const captureCanvas = useCallback(async (): Promise<HTMLCanvasElement | null> => {
        const canvasElement = document.querySelector('[data-canvas-container="true"]') as HTMLElement;

        if (!canvasElement) {
            console.error('[useScreenshotCapture] Could not find canvas element');
            return null;
        }

        try {
            const canvas = await html2canvas(canvasElement, {
                useCORS: true,
                allowTaint: true,
                background: layout?.backgroundColor || '#FFFFFF'
            });
            return canvas;
        } catch (err) {
            console.error('[useScreenshotCapture] Failed to capture canvas:', err);
            return null;
        }
    }, [layout]);

    /**
     * Process canvas for thumbnail: crop to 16:9 and resize to 640x360
     */
    const processThumbnail = useCallback((sourceCanvas: HTMLCanvasElement): HTMLCanvasElement | null => {
        try {
            const thumbnailWidth = 640;
            const thumbnailHeight = 360;
            const targetAspectRatio = 16 / 9;

            // Calculate crop dimensions to achieve 16:9 from source canvas
            const sourceAspectRatio = sourceCanvas.width / sourceCanvas.height;
            let sourceX = 0;
            let sourceY = 0;
            let sourceWidth = sourceCanvas.width;
            let sourceHeight = sourceCanvas.height;

            if (sourceAspectRatio > targetAspectRatio) {
                // Source is wider than 16:9, crop width (center crop horizontally)
                sourceWidth = Math.round(sourceCanvas.height * targetAspectRatio);
                sourceX = Math.round((sourceCanvas.width - sourceWidth) / 2);
            } else if (sourceAspectRatio < targetAspectRatio) {
                // Source is taller than 16:9, crop height (center crop vertically)
                sourceHeight = Math.round(sourceCanvas.width / targetAspectRatio);
                sourceY = Math.round((sourceCanvas.height - sourceHeight) / 2);
            }

            const thumbnailCanvas = document.createElement('canvas');
            thumbnailCanvas.width = thumbnailWidth;
            thumbnailCanvas.height = thumbnailHeight;
            const ctx = thumbnailCanvas.getContext('2d');

            if (!ctx) {
                console.error('[useScreenshotCapture] Failed to get canvas context');
                return null;
            }

            // Use high-quality image smoothing for better resize quality
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(sourceCanvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, thumbnailWidth, thumbnailHeight);

            return thumbnailCanvas;
        } catch (err) {
            console.error('[useScreenshotCapture] Failed to process thumbnail:', err);
            return null;
        }
    }, []);

    /**
     * Capture screenshot and download as PNG
     */
    const captureScreenshot = useCallback(async (): Promise<CaptureResult> => {
        const wasInPreviewMode = previewMode;

        try {
            const prepared = await prepareForCapture(false);
            if (!prepared) {
                restoreAfterCapture(false, wasInPreviewMode);
                return { success: false, error: 'Failed to prepare for capture' };
            }

            const canvas = await captureCanvas();
            if (!canvas) {
                alert('Could not find canvas element. Please try again.');
                restoreAfterCapture(false, wasInPreviewMode);
                return { success: false, error: 'Canvas not found' };
            }

            // Convert canvas to blob and download
            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        console.error('[useScreenshotCapture] Failed to convert canvas to blob');
                        alert('Failed to generate screenshot. Please try again.');
                        restoreAfterCapture(false, wasInPreviewMode);
                        resolve({ success: false, error: 'Failed to convert to blob' });
                        return;
                    }

                    // Download the screenshot
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `screenshot-${layout?.displayName || id}.png`;
                    a.click();
                    URL.revokeObjectURL(url);

                    console.log('[useScreenshotCapture] Screenshot downloaded successfully');
                    restoreAfterCapture(false, wasInPreviewMode);
                    resolve({ success: true });
                }, 'image/png', 0.95);
            });
        } catch (err) {
            console.error('[useScreenshotCapture] Failed to take screenshot:', err);
            alert(`Failed to take screenshot: ${err instanceof Error ? err.message : 'Unknown error'}`);
            restoreAfterCapture(false, wasInPreviewMode);
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    }, [previewMode, layout, id, prepareForCapture, captureCanvas, restoreAfterCapture]);

    /**
     * Capture thumbnail and upload to server
     */
    const captureThumbnail = useCallback(async (): Promise<CaptureResult> => {
        if (!id) {
            console.error('[useScreenshotCapture] Cannot capture thumbnail: No layout ID');
            return { success: false, error: 'No layout ID' };
        }

        const wasInPreviewMode = previewMode;

        try {
            const prepared = await prepareForCapture(true);
            if (!prepared) {
                restoreAfterCapture(true, wasInPreviewMode);
                return { success: false, error: 'Failed to prepare for capture' };
            }

            const canvas = await captureCanvas();
            if (!canvas) {
                alert('Canvas element not found. Please try again.');
                restoreAfterCapture(true, wasInPreviewMode);
                return { success: false, error: 'Canvas not found' };
            }

            // Process thumbnail (crop to 16:9 and resize)
            const thumbnailCanvas = processThumbnail(canvas);
            if (!thumbnailCanvas) {
                alert('Failed to process thumbnail. Please try again.');
                restoreAfterCapture(true, wasInPreviewMode);
                return { success: false, error: 'Failed to process thumbnail' };
            }

            // Convert to JPEG blob and upload
            return new Promise((resolve) => {
                thumbnailCanvas.toBlob(async (blob) => {
                    if (!blob) {
                        console.error('[useScreenshotCapture] Failed to convert canvas to blob');
                        alert('Failed to convert canvas to blob. Please try again.');
                        restoreAfterCapture(true, wasInPreviewMode);
                        resolve({ success: false, error: 'Failed to convert to blob' });
                        return;
                    }

                    try {
                        // Upload to server
                        const formData = new FormData();
                        formData.append('thumbnail', blob, 'thumbnail.jpg');

                        const response = await fetch(`/api/frameengine/${id}/thumbnail-upload`, {
                            method: 'POST',
                            body: formData
                        });

                        if (!response.ok) {
                            throw new Error(`Upload failed: ${response.statusText}`);
                        }

                        // Refresh thumbnail display
                        onSetThumbnailUrl(`/api/frameengine/${id}/thumbnail?t=${Date.now()}`);

                        console.log('[useScreenshotCapture] Thumbnail captured and uploaded successfully');
                        restoreAfterCapture(true, wasInPreviewMode);
                        resolve({ success: true });
                    } catch (err) {
                        console.error('[useScreenshotCapture] Failed to upload thumbnail:', err);
                        alert('Failed to upload thumbnail. Please try again.');
                        restoreAfterCapture(true, wasInPreviewMode);
                        resolve({ success: false, error: err instanceof Error ? err.message : 'Upload failed' });
                    }
                }, 'image/jpeg', 0.95);
            });
        } catch (err) {
            console.error('[useScreenshotCapture] Failed to capture thumbnail:', err);
            alert(`Failed to capture thumbnail: ${err instanceof Error ? err.message : 'Unknown error'}`);
            restoreAfterCapture(true, wasInPreviewMode);
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    }, [id, previewMode, prepareForCapture, captureCanvas, processThumbnail, onSetThumbnailUrl, restoreAfterCapture]);

    return {
        captureScreenshot,
        captureThumbnail
    };
}
