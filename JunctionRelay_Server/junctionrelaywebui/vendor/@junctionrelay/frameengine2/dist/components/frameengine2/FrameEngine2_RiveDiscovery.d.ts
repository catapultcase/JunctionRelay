import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from './types/FrameEngine2_ElementTypes';
import { RiveInstance } from '../../interfaces/RiveTypes';

export interface RiveDiscoveryResult {
    machines: DiscoveredRiveStateMachine[];
    bindings: DiscoveredRiveDataBinding[];
}
/**
 * Discovers Rive state machine inputs and view model data bindings
 *
 * Uses brute-force accessor testing - the ONLY reliable method for Rive binding detection.
 * Based on working POC: rive-test/src/SensorTest.tsx
 *
 * @param rive - The Rive instance from useRive hook
 * @param maxAttempts - Maximum number of retry attempts (default: 3)
 * @returns Promise that resolves with discovered machines and bindings
 */
export declare function discoverRiveInputsAndBindings(rive: RiveInstance | null, maxAttempts?: number): Promise<RiveDiscoveryResult>;
/**
 * Applies input values to discovered state machine inputs
 *
 * @param machines - Discovered state machines with input refs
 * @param inputValues - Record of input name -> value to apply
 */
export declare function applyRiveInputs(machines: DiscoveredRiveStateMachine[], inputValues: Record<string, any>): void;
/**
 * Applies binding values to discovered data bindings
 *
 * @param bindings - Discovered data bindings with refs
 * @param bindingValues - Record of binding name -> value to apply
 */
export declare function applyRiveBindings(bindings: DiscoveredRiveDataBinding[], bindingValues: Record<string, any>): void;
//# sourceMappingURL=FrameEngine2_RiveDiscovery.d.ts.map