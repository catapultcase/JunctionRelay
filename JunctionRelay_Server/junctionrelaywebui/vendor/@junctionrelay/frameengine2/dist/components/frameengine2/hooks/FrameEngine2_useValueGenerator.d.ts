import { FrameLayoutConfig, PlacedElement } from '../types/FrameEngine2_LayoutTypes';
import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from '../types/FrameEngine2_ElementTypes';

/**
 * Parameters for useValueGenerator hook
 */
export interface UseValueGeneratorParams {
    /** Current layout configuration */
    layout: FrameLayoutConfig | null;
    /** Elements on canvas */
    elements: PlacedElement[];
    /** Callback to update layout (for saving test values) */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;
    /** Background Rive state machine discoveries */
    backgroundRiveMachines?: DiscoveredRiveStateMachine[];
    /** Background Rive data binding discoveries */
    backgroundRiveBindings?: DiscoveredRiveDataBinding[];
    /** Element Rive discoveries */
    elementRiveDiscoveries?: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;
}
/**
 * Return value from useValueGenerator hook
 */
export interface UseValueGeneratorResult {
    /** Set of sensor tags included in generation */
    includedSensorTags: Set<string>;
    /** Callback to toggle sensor tag inclusion */
    handleToggleIncludeSensorTag: (sensorTag: string) => void;
}
/**
 * Custom hook for managing the Value Generator feature.
 *
 * Responsibilities:
 * - Extracts sensor tags from elements
 * - Manages which tags are included in generation
 * - Auto-generates random test values at specified interval
 * - Runs independently of which tab is active
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - Uses refs to avoid stale closures in intervals
 * - Separates immediate generation from interval management
 * - Only restarts interval when enable state or interval value changes
 * - Optimizes Set updates to only create new Set when tags actually change
 *
 * @param params - Hook parameters
 * @returns Value generator interface
 */
export declare function useValueGenerator(params: UseValueGeneratorParams): UseValueGeneratorResult;
//# sourceMappingURL=FrameEngine2_useValueGenerator.d.ts.map