import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from '../types/FrameEngine2_ElementTypes';

/**
 * Return type for the useRiveDiscoveryManager hook
 */
export interface RiveDiscoveryManager {
    /** Discovered Rive machines from background layout */
    backgroundRiveMachines: DiscoveredRiveStateMachine[];
    /** Discovered Rive bindings from background layout */
    backgroundRiveBindings: DiscoveredRiveDataBinding[];
    /** Map of element ID to discovered Rive machines/bindings */
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;
    /** Callback to handle background Rive discovery */
    handleBackgroundRiveDiscovery: (machines: DiscoveredRiveStateMachine[], bindings: DiscoveredRiveDataBinding[]) => void;
    /** Callback to handle element Rive discovery */
    handleElementRiveDiscovery: (discoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>) => void;
}
/**
 * Custom hook to manage Rive discovery state and handlers
 *
 * This hook centralizes all Rive discovery-related state management for both
 * background layout Rive files and element-specific Rive files. It provides
 * stable callbacks for discovery handlers to prevent unnecessary re-renders.
 *
 * **Architecture Notes:**
 * - Extracted from ConfigureFrame2.tsx to reduce component complexity
 * - Centralizes Rive discovery logic in a single, reusable hook
 * - Provides stable callbacks with empty dependency arrays
 * - Used by both Canvas and other components that need discovery state
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Extract hooks to reduce component complexity
 * - Section 2.2: Stable callback references with useCallback
 * - Section 7.3: Document optimization decisions
 *
 * **Usage Example:**
 * ```typescript
 * const {
 *     backgroundRiveMachines,
 *     backgroundRiveBindings,
 *     elementRiveDiscoveries,
 *     handleBackgroundRiveDiscovery,
 *     handleElementRiveDiscovery
 * } = useRiveDiscoveryManager();
 *
 * <Canvas
 *     onBackgroundRiveDiscovery={handleBackgroundRiveDiscovery}
 *     onElementRiveDiscovery={handleElementRiveDiscovery}
 * />
 * ```
 *
 * @returns RiveDiscoveryManager object containing state and handlers
 */
export declare function useRiveDiscoveryManager(): RiveDiscoveryManager;
//# sourceMappingURL=FrameEngine2_useRiveDiscoveryManager.d.ts.map