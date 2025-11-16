import { default as React } from 'react';
import { PlacedElement, GridSettings } from './types/FrameEngine2_LayoutTypes';
import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from './types/FrameEngine2_ElementTypes';

interface FrameEngine2_Renderer_ElementsProps {
    /** Element to render */
    element: PlacedElement;
    /** Whether this element is currently selected */
    isSelected?: boolean;
    /** Callback when element is clicked */
    onClick?: (elementId: string) => void;
    /** Callback when element is updated (e.g., dragged) */
    onUpdateElement?: (elementId: string, updates: Partial<PlacedElement>) => void;
    /** Resolved sensor values (Live > Test hierarchy already applied) */
    resolvedValues: Record<string, any>;
    /** Whether to show placeholders when no data */
    showPlaceholders?: boolean;
    /** Element padding in pixels */
    elementPadding?: number;
    /** Grid settings for snapping */
    grid?: GridSettings;
    /** Layout mode for determining snapping behavior ('composite' or 'pixel') */
    layoutMode?: 'composite' | 'pixel';
    /** Preview mode - disables selection and editing */
    previewMode?: boolean;
    /** Callback for Rive discovery (MediaRive elements only) */
    onRiveDiscovery?: (elementId: string, machines: DiscoveredRiveStateMachine[], bindings: DiscoveredRiveDataBinding[]) => void;
}
declare const _default: React.NamedExoticComponent<FrameEngine2_Renderer_ElementsProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Renderer_Elements.d.ts.map