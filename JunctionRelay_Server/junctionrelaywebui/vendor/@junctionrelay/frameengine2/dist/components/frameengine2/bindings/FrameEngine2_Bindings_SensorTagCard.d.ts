import { default as React } from 'react';
import { PlacedElement } from '../types/FrameEngine2_LayoutTypes';
import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from '../types/FrameEngine2_ElementTypes';
import { RiveInputType } from './FrameEngine2_Bindings_Types';

interface SensorTagCardProps {
    /** The sensor tag name */
    sensorTag: string;
    /** Whether this tag is included in value generation */
    isIncluded: boolean;
    /** Input type for rendering appropriate control */
    inputType: RiveInputType;
    /** Current test value */
    testValue: string;
    /** Current test label */
    testLabel: string;
    /** Current test unit */
    testUnit: string;
    /** All elements on canvas */
    elements: PlacedElement[];
    /** Background Rive machines */
    backgroundRiveMachines: DiscoveredRiveStateMachine[];
    /** Element Rive discoveries */
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;
    /** Callback when include toggle changes */
    onToggleInclude: (sensorTag: string) => void;
    /** Callback when test value changes */
    onTestValueChange: (sensorTag: string, value: string) => void;
    /** Callback when test label changes */
    onTestLabelChange: (sensorTag: string, label: string) => void;
    /** Callback when test unit changes */
    onTestUnitChange: (sensorTag: string, unit: string) => void;
}
declare const _default: React.NamedExoticComponent<SensorTagCardProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Bindings_SensorTagCard.d.ts.map