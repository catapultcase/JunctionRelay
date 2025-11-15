import { FrameLayoutConfig } from '../types/FrameEngine2_LayoutTypes';
import { FrameEngine2_CanvasRef } from '../FrameEngine2_Canvas';

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
export declare function useScreenshotCapture(options: UseScreenshotCaptureOptions): {
    captureScreenshot: () => Promise<CaptureResult>;
    captureThumbnail: () => Promise<CaptureResult>;
};
export {};
//# sourceMappingURL=FrameEngine2_useScreenshotCapture.d.ts.map