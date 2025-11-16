import { default as React } from 'react';
import { PlacedElement } from './types/FrameEngine2_LayoutTypes';

interface FrameEngine2_Tab_ElementProps {
    /** Currently selected element */
    selectedElement: PlacedElement | null;
    /** All elements (for list and z-index management) */
    elements: PlacedElement[];
    /** Callback to select an element */
    onSelectElement: (elementId: string | null) => void;
    /** Callback to update element properties */
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void;
}
/**
 * Element tab content for left sidebar
 * Shows list of all elements in z-order (front to back)
 */
declare const FrameEngine2_Tab_Element: React.FC<FrameEngine2_Tab_ElementProps>;
export default FrameEngine2_Tab_Element;
//# sourceMappingURL=FrameEngine2_Tab_Element.d.ts.map