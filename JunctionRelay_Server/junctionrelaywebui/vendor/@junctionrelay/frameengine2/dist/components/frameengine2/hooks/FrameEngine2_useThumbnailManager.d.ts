/**
 * Parameters for the useThumbnailManager hook
 */
export interface UseThumbnailManagerParams {
    /** Layout ID for API requests */
    layoutId: string | undefined;
    /** Callback to set screenshot progress state (used during upload) */
    onSetScreenshotInProgress: (inProgress: boolean) => void;
}
/**
 * Return type for the useThumbnailManager hook
 */
export interface ThumbnailManager {
    /** Current thumbnail URL (null if no thumbnail exists) */
    thumbnailUrl: string | null;
    /** Whether thumbnail is currently loading */
    thumbnailLoading: boolean;
    /** Handler for uploading custom thumbnail from file */
    handleUploadThumbnail: (file: File) => Promise<void>;
    /** Internal setter for thumbnail loading state (used by useScreenshotCapture) */
    setThumbnailLoading: (loading: boolean) => void;
    /** Internal setter for thumbnail URL (used by useScreenshotCapture) */
    setThumbnailUrl: (url: string) => void;
}
/**
 * Custom hook to manage layout thumbnail loading and uploading
 *
 * This hook handles:
 * - Loading existing thumbnail on mount
 * - Uploading custom thumbnail files
 * - Managing thumbnail URL and loading states
 *
 * **Architecture Notes:**
 * - Extracted from ConfigureFrame2.tsx to reduce component complexity
 * - Handles async thumbnail operations
 * - Integrates with screenshot progress modal via callback
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Extract hooks to reduce component complexity
 * - Section 7.3: Document optimization decisions
 *
 * **Usage Example:**
 * ```typescript
 * const {
 *     thumbnailUrl,
 *     thumbnailLoading,
 *     handleUploadThumbnail
 * } = useThumbnailManager({
 *     layoutId: id,
 *     onSetScreenshotInProgress: setScreenshotInProgress
 * });
 *
 * <Toolbar
 *     thumbnailUrl={thumbnailUrl}
 *     thumbnailLoading={thumbnailLoading}
 *     onUploadThumbnail={handleUploadThumbnail}
 * />
 * ```
 *
 * @param params - Configuration parameters for the thumbnail manager
 * @returns ThumbnailManager object containing state and handlers
 */
export declare function useThumbnailManager(params: UseThumbnailManagerParams): ThumbnailManager;
//# sourceMappingURL=FrameEngine2_useThumbnailManager.d.ts.map