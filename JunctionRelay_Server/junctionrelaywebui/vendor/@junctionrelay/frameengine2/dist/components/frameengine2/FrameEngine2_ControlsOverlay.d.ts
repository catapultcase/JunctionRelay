import { default as React } from 'react';
import { PlacedElement, GridSettings } from './types/FrameEngine2_LayoutTypes';

interface ViewportTransform {
    translateX: number;
    translateY: number;
    scale: number;
}
interface FrameEngine2_ControlsOverlayProps {
    /** The currently selected element ID */
    selectedElementId: string | null;
    /** The currently selected element data */
    selectedElement: PlacedElement | null;
    /** Viewport transform for coordinate conversion */
    viewport: ViewportTransform;
    /** Container ref for positioning context */
    containerRef: React.RefObject<HTMLDivElement | null>;
    /** Callback when element is updated */
    onUpdateElement?: (elementId: string, updates: Partial<PlacedElement>) => void;
    /** Grid settings for snapping */
    grid?: GridSettings;
    /** Layout mode for determining snapping behavior */
    layoutMode?: 'composite' | 'pixel';
    /** Callback when element is clicked */
    onClick?: (elementId: string) => void;
}
declare const _default: React.NamedExoticComponent<FrameEngine2_ControlsOverlayProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_ControlsOverlay.d.ts.map