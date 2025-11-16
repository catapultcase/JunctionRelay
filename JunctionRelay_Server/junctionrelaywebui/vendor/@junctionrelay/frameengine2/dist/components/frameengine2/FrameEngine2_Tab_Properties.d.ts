import { default as React } from 'react';
import { PlacedElement } from './types/FrameEngine2_LayoutTypes';

interface FrameEngine2_Tab_PropertiesProps {
    /** Selected element (null if none selected) */
    selectedElement: PlacedElement | null;
    /** Callback to update element properties */
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void;
    /** Callback to delete element */
    onDeleteElement: (elementId: string) => void;
}
/**
 * Universal properties panel orchestrator
 * Shows common sections (Element Info, Position & Size) and routes to element-specific properties
 */
declare const FrameEngine2_Tab_Properties: React.FC<FrameEngine2_Tab_PropertiesProps>;
export default FrameEngine2_Tab_Properties;
//# sourceMappingURL=FrameEngine2_Tab_Properties.d.ts.map