import { default as React } from 'react';
import { FrameLayoutConfig } from './types/FrameEngine2_LayoutTypes';

interface FrameEngine2_Tab_LayoutProps {
    /** Current layout configuration */
    layout: FrameLayoutConfig;
    /** Callback to update layout configuration */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;
    /** Thumbnail URL (if exists) */
    thumbnailUrl: string | null;
    /** Thumbnail loading state */
    thumbnailLoading: boolean;
    /** Callback to capture thumbnail from canvas */
    onCaptureThumbnail: () => void;
    /** Callback to upload custom thumbnail */
    onUploadThumbnail: (file: File) => void;
}
declare const _default: React.NamedExoticComponent<FrameEngine2_Tab_LayoutProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Tab_Layout.d.ts.map