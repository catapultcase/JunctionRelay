import { FrameLayoutConfig, PlacedElement } from './types/FrameEngine2_LayoutTypes';

/**
 * Raw response from GET /api/frameengine/{id}
 * Matches FrameLayoutDto from C# backend
 */
interface FrameLayoutResponse {
    id: string;
    displayName: string;
    description?: string;
    layoutType: string;
    isTemplate: boolean;
    isDraft: boolean;
    isPublished: boolean;
    width?: number;
    height?: number;
    orientation: string;
    backgroundType: string;
    backgroundColor?: string;
    backgroundImageUrl?: string;
    backgroundImageFit?: string;
    backgroundVideoUrl?: string;
    backgroundVideoFit?: string;
    videoLoop: boolean;
    videoMuted: boolean;
    videoAutoplay: boolean;
    backgroundOpacity: number;
    riveFile?: string;
    jsonFrameConfig?: string;
    jsonFrameConfigRuntime?: string;
    jsonFrameElements?: string;
    created: string;
    lastModified?: string;
    hasThumbnail: boolean;
    thumbnailPath?: string;
    thumbnailGeneratedAt?: string;
    thumbnailOverride: boolean;
}
/**
 * Get frame layout by ID
 * @param id - Layout ID from URL params
 * @returns Raw layout data from backend
 */
export declare const getFrameLayout: (id: string) => Promise<FrameLayoutResponse>;
/**
 * Update frame layout
 * @param id - Layout ID
 * @param layout - FrameEngine2 layout config
 * @param elements - Array of placed elements
 */
export declare const updateFrameLayout: (id: string, layout: FrameLayoutConfig, elements: PlacedElement[]) => Promise<void>;
/**
 * Clone frame layout
 * @param originalId - ID of the layout to clone
 * @param newName - Optional new name for the cloned layout
 * @returns ID of the cloned layout
 */
export declare const cloneFrameLayout: (originalId: string, newName?: string) => Promise<number>;
/**
 * Debounced save function
 * Returns a function that delays execution until after wait milliseconds
 */
export declare const createDebouncedSave: (wait?: number) => (id: string, layout: FrameLayoutConfig, elements: PlacedElement[]) => Promise<void>;
export {};
//# sourceMappingURL=FrameEngine2_API.d.ts.map