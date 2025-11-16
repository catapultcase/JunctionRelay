import { default as React } from 'react';
import { PlacedElement, FrameLayoutConfig } from './types/FrameEngine2_LayoutTypes';

interface FrameEngine2_Sidebar_RightProps {
    /** Current layout configuration */
    layout: FrameLayoutConfig | null;
    /** Currently selected element */
    selectedElement: PlacedElement | null;
    /** Callback to update element properties */
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void;
    /** Callback to delete element */
    onDeleteElement: (elementId: string) => void;
}
declare const _default: React.NamedExoticComponent<FrameEngine2_Sidebar_RightProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Sidebar_Right.d.ts.map