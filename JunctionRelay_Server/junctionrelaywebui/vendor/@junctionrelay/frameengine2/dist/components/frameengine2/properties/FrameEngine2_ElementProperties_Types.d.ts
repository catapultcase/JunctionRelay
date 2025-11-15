import { PlacedElement } from '../types/FrameEngine2_LayoutTypes';

/**
 * Props for element-specific property panels
 * Each element type has its own properties component that receives these props
 */
export interface ElementPropertyPanelProps {
    /** Currently selected element */
    selectedElement: PlacedElement;
    /** Callback to update element properties */
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void;
    /** Callback to delete element */
    onDeleteElement: (elementId: string) => void;
}
//# sourceMappingURL=FrameEngine2_ElementProperties_Types.d.ts.map