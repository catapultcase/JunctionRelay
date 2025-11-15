import { FrameLayoutConfig, PlacedElement } from '../types/FrameEngine2_LayoutTypes';
import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from '../types/FrameEngine2_ElementTypes';

/**
 * Parameters for the useSensorTestValueSync hook
 */
export interface UseSensorTestValueSyncParams {
    /** Current layout configuration */
    layout: FrameLayoutConfig | null;
    /** Array of placed elements */
    elements: PlacedElement[];
    /** Discovered background Rive machines */
    backgroundRiveMachines: DiscoveredRiveStateMachine[];
    /** Discovered background Rive bindings */
    backgroundRiveBindings: DiscoveredRiveDataBinding[];
    /** Map of element ID to discovered Rive machines/bindings */
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;
    /** Callback to update layout configuration */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;
    /** Callback to update elements array */
    setElements: React.Dispatch<React.SetStateAction<PlacedElement[]>>;
}
/**
 * Custom hook to synchronize sensor test values to Rive inputs and bindings
 *
 * This hook monitors sensorTestValues from the Value Generator and automatically
 * updates corresponding Rive inputs/bindings in both background and element Rive files.
 *
 * **Architecture Notes:**
 * - Extracted from ConfigureFrame2.tsx to reduce component complexity (was 108 lines)
 * - Handles both background layout Rive and element-specific Rive files
 * - Batches all updates to prevent multiple render cycles
 * - Intentionally excludes layout.riveInputs/riveBindings from deps to prevent loops
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Extract effects >50 lines into custom hooks
 * - Section 1.3: Batch array updates
 * - Section 7.3: Document optimization decisions
 *
 * @param params - Configuration parameters for the sync hook
 */
export declare function useSensorTestValueSync(params: UseSensorTestValueSyncParams): void;
//# sourceMappingURL=FrameEngine2_useSensorTestValueSync.d.ts.map