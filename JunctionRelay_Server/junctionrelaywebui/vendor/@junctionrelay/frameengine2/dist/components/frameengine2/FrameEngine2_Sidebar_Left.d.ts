import { default as React } from 'react';
import { FrameLayoutConfig, PlacedElement } from './types/FrameEngine2_LayoutTypes';
import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from './types/FrameEngine2_ElementTypes';

interface FrameEngine2_Sidebar_LeftProps {
    /** Current layout configuration */
    layout: FrameLayoutConfig;
    /** Callback to update layout configuration */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;
    /** All elements (for z-index management) */
    elements: PlacedElement[];
    /** Currently selected element */
    selectedElement: PlacedElement | null;
    /** Callback to select an element */
    onSelectElement: (elementId: string | null) => void;
    /** Callback to update element properties */
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void;
    /** Included sensor tags for Value Generator */
    includedSensorTags: Set<string>;
    /** Callback to toggle sensor tag inclusion */
    onToggleIncludeSensorTag: (sensorTag: string) => void;
    /** Preview mode - locks sidebar to Bindings tab */
    previewMode?: boolean;
    /** Thumbnail URL (if exists) */
    thumbnailUrl: string | null;
    /** Thumbnail loading state */
    thumbnailLoading: boolean;
    /** Callback to capture thumbnail from canvas */
    onCaptureThumbnail: () => void;
    /** Callback to upload custom thumbnail */
    onUploadThumbnail: (file: File) => void;
    /** Current tab index (controlled by parent) */
    currentTab: number;
    /** Callback when tab changes */
    onTabChange: (tab: number) => void;
    /** Background Rive discoveries (from Canvas) */
    backgroundRiveMachines?: DiscoveredRiveStateMachine[];
    backgroundRiveBindings?: DiscoveredRiveDataBinding[];
    /** Element Rive discoveries (from Canvas) */
    elementRiveDiscoveries?: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;
}
declare const _default: React.NamedExoticComponent<FrameEngine2_Sidebar_LeftProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Sidebar_Left.d.ts.map