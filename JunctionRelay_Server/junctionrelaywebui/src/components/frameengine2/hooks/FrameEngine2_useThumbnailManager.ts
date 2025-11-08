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

import { useState, useEffect, useCallback } from 'react';

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
export function useThumbnailManager(params: UseThumbnailManagerParams): ThumbnailManager {
    const { layoutId, onSetScreenshotInProgress } = params;

    // Thumbnail state
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [thumbnailLoading, setThumbnailLoading] = useState<boolean>(false);

    /**
     * Load thumbnail on mount
     * Checks if thumbnail exists for this layout and loads it
     */
    useEffect(() => {
        if (!layoutId) return;

        const loadThumbnail = async () => {
            try {
                // Check if thumbnail exists (HEAD request is lightweight)
                const response = await fetch(`/api/frameengine/${layoutId}/thumbnail`, { method: 'HEAD' });
                if (response.ok) {
                    // Add timestamp to prevent caching issues
                    setThumbnailUrl(`/api/frameengine/${layoutId}/thumbnail?t=${Date.now()}`);
                }
            } catch (err) {
                // No thumbnail exists, that's okay - not an error condition
                console.log('[FrameEngine2] No thumbnail found');
            }
        };

        loadThumbnail();
    }, [layoutId]);

    /**
     * Handle thumbnail upload from file
     * Uploads a custom thumbnail image file to the server
     */
    const handleUploadThumbnail = useCallback(async (file: File) => {
        if (!layoutId) return;

        try {
            // Show progress modal overlay
            onSetScreenshotInProgress(true);
            setThumbnailLoading(true);

            // Small delay to ensure modal is visible before blocking operation
            await new Promise(resolve => setTimeout(resolve, 100));

            // Prepare form data with thumbnail file
            const formData = new FormData();
            formData.append('thumbnail', file);

            // Upload to server
            const response = await fetch(`/api/frameengine/${layoutId}/thumbnail-upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            // Refresh thumbnail display with new image (timestamp prevents caching)
            setThumbnailUrl(`/api/frameengine/${layoutId}/thumbnail?t=${Date.now()}`);

            console.log('[FrameEngine2] Custom thumbnail uploaded successfully');
        } catch (err) {
            console.error('[FrameEngine2] Failed to upload custom thumbnail:', err);
            alert('Failed to upload thumbnail. Please try again.');
        } finally {
            // Clean up progress indicators
            onSetScreenshotInProgress(false);
            setThumbnailLoading(false);
        }
    }, [layoutId, onSetScreenshotInProgress]);

    return {
        thumbnailUrl,
        thumbnailLoading,
        handleUploadThumbnail,
        setThumbnailLoading,
        setThumbnailUrl
    };
}
