import { default as React } from 'react';
import { PlacedElement, FrameLayoutConfig } from './types/FrameEngine2_LayoutTypes';
import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from './types/FrameEngine2_ElementTypes';

interface FrameEngine2_Tab_BindingsProps {
    /** All elements on canvas */
    elements: PlacedElement[];
    /** Current layout configuration (contains sensorTestValues) */
    layout: FrameLayoutConfig;
    /** Callback to update layout configuration (for sensorTestValues) */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;
    /** Included sensor tags for Value Generator (managed in parent) */
    includedSensorTags: Set<string>;
    /** Callback to toggle sensor tag inclusion (managed in parent) */
    onToggleIncludeSensorTag: (sensorTag: string) => void;
    /** Background Rive discoveries */
    backgroundRiveMachines?: DiscoveredRiveStateMachine[];
    backgroundRiveBindings?: DiscoveredRiveDataBinding[];
    /** Element Rive discoveries */
    elementRiveDiscoveries?: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;
    /** Callback to update element properties (for Rive inputs) */
    onUpdateElement?: (elementId: string, updates: Partial<PlacedElement>) => void;
}
/**
 * Bindings tab content for left sidebar
 * Shows SensorTag bindings with test value inputs and Value Generator controls
 * Two views: Asset View (grouped by element) and SensorTag View (deduplicated with include toggles)
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Component <500 lines (refactored from 961 lines to ~250 lines)
 * - Section 2.2: Stable callback references with useCallback
 * - Section 7.3: Document optimization decisions
 *
 * **Architecture:**
 * - Main orchestrator component that delegates rendering to specialized views
 * - All handlers remain in this component for access to parent callbacks
 * - View components are presentational and receive data/handlers as props
 */
declare const FrameEngine2_Tab_Bindings: React.FC<FrameEngine2_Tab_BindingsProps>;
export default FrameEngine2_Tab_Bindings;
//# sourceMappingURL=FrameEngine2_Tab_Bindings.d.ts.map