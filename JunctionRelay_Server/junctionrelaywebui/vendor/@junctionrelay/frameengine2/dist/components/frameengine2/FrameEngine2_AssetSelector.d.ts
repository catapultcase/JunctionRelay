import { default as React } from 'react';

/**
 * Asset types supported by the selector
 */
export type AssetType = 'image' | 'video' | 'rive';
interface FrameEngine2_AssetSelectorProps {
    /** Type of asset (image, video, or rive) */
    type: AssetType;
    /** Currently selected asset filename */
    value?: string | null;
    /** Callback when asset is selected */
    onChange: (filename: string | null) => void;
}
/**
 * Modern asset selector for FrameEngine2
 *
 * Handles:
 * - Fetching available assets from backend
 * - Uploading new assets
 * - Asset selection from dropdown
 *
 * Performance optimizations:
 * - Memoized file lists
 * - Optimized re-renders
 * - Clean API integration
 */
declare const FrameEngine2_AssetSelector: React.FC<FrameEngine2_AssetSelectorProps>;
export default FrameEngine2_AssetSelector;
//# sourceMappingURL=FrameEngine2_AssetSelector.d.ts.map