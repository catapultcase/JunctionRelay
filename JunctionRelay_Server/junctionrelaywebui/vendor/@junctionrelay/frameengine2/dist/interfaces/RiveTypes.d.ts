import { Rive, StateMachineInput } from '@rive-app/canvas';

/**
 * Rive instance with optional extensions
 */
export interface RiveInstance extends Rive {
}
/**
 * Discovered Rive state machine with inputs
 */
export interface RiveMachine {
    name: string;
    inputs: StateMachineInput[];
}
/**
 * Discovered Rive data binding
 */
export interface RiveBinding {
    name: string;
    currentValue: any;
}
//# sourceMappingURL=RiveTypes.d.ts.map