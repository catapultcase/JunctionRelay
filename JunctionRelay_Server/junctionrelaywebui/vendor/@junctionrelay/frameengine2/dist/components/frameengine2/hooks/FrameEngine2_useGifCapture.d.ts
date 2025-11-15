import { FrameLayoutConfig } from '../types/FrameEngine2_LayoutTypes';
import { FrameEngine2_CanvasRef } from '../FrameEngine2_Canvas';

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
    duration?: number;
    quality?: number;
    targetWidth?: number;
    targetHeight?: number;
    targetFps?: number;
}
interface CaptureResult {
    success: boolean;
    error?: string;
}
/**
 * Custom hook for handling animated GIF capture
 * Captures multiple frames over time and encodes them into an animated GIF
 */
export declare function useGifCapture(options: UseGifCaptureOptions): {
    captureGif: (gifOptions?: GifCaptureOptions) => Promise<CaptureResult>;
};
export {};
//# sourceMappingURL=FrameEngine2_useGifCapture.d.ts.map