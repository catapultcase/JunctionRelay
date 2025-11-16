import { default as React } from 'react';
import { PlacedElement } from '../types/FrameEngine2_LayoutTypes';
import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from '../types/FrameEngine2_ElementTypes';

interface AssetViewProps {
    /** All elements on canvas */
    elements: PlacedElement[];
    /** Background Rive machines */
    backgroundRiveMachines: DiscoveredRiveStateMachine[];
    /** Background Rive bindings */
    backgroundRiveBindings: DiscoveredRiveDataBinding[];
    /** Element Rive discoveries */
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;
}
declare const _default: React.NamedExoticComponent<AssetViewProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Bindings_AssetView.d.ts.map