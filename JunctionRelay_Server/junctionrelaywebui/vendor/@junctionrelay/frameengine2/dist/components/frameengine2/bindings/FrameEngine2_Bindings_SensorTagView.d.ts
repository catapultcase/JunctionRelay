import { default as React } from 'react';
import { PlacedElement, FrameLayoutConfig } from '../types/FrameEngine2_LayoutTypes';
import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from '../types/FrameEngine2_ElementTypes';

interface SensorTagViewProps {
    /** All elements on canvas */
    elements: PlacedElement[];
    /** Current layout configuration */
    layout: FrameLayoutConfig;
    /** Included sensor tags for Value Generator */
    includedSensorTags: Set<string>;
    /** Background Rive machines */
    backgroundRiveMachines: DiscoveredRiveStateMachine[];
    /** Background Rive bindings */
    backgroundRiveBindings: DiscoveredRiveDataBinding[];
    /** Element Rive discoveries */
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;
    /** Callback when include toggle changes */
    onToggleIncludeSensorTag: (sensorTag: string) => void;
    /** Callback when test value changes */
    onTestValueChange: (sensorTag: string, value: string) => void;
    /** Callback when test label changes */
    onTestLabelChange: (sensorTag: string, label: string) => void;
    /** Callback when test unit changes */
    onTestUnitChange: (sensorTag: string, unit: string) => void;
    /** Callback when enabled state changes */
    onTestBindingsEnabledChange: (enabled: boolean) => void;
    /** Callback when interval changes */
    onTestBindingsIntervalChange: (interval: number) => void;
}
declare const _default: React.NamedExoticComponent<SensorTagViewProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Bindings_SensorTagView.d.ts.map