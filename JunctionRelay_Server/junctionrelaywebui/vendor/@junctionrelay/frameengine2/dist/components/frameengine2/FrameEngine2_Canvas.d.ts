import { default as React } from 'react';
import { FrameLayoutConfig, PlacedElement } from './types/FrameEngine2_LayoutTypes';
import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from './types/FrameEngine2_ElementTypes';

/** Ref handle for imperative methods */
export interface FrameEngine2_CanvasRef {
    resetView: () => void;
}
interface FrameEngine2_CanvasProps {
    /** Layout configuration */
    layout: FrameLayoutConfig;
    /** Elements placed on the canvas */
    elements: PlacedElement[];
    /** Callback to update layout configuration */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;
    /** Callback to add a new element */
    onAddElement: (element: PlacedElement) => void;
    /** Callback to update an element (supports both direct and functional updates) */
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement> | ((current: PlacedElement) => Partial<PlacedElement>)) => void;
    /** Currently selected element ID */
    selectedElementId: string | null;
    /** Callback when an element is selected */
    onSelectElement: (elementId: string | null) => void;
    /** Optional callback when zoom level changes */
    onZoomChange?: (zoom: number) => void;
    /** Preview mode - hides canvas options */
    previewMode?: boolean;
    /** Optional callback when background Rive discoveries change */
    onBackgroundRiveDiscovery?: (machines: DiscoveredRiveStateMachine[], bindings: DiscoveredRiveDataBinding[]) => void;
    /** Optional callback when element Rive discoveries change */
    onElementRiveDiscovery?: (discoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>) => void;
}
declare const _default: React.NamedExoticComponent<FrameEngine2_CanvasProps & React.RefAttributes<FrameEngine2_CanvasRef>>;
export default _default;
//# sourceMappingURL=FrameEngine2_Canvas.d.ts.map