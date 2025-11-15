import { default as React } from 'react';
import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from '../types/FrameEngine2_ElementTypes';

/**
 * Props for the MediaRive element component
 */
interface MediaRiveElementProps {
    /** Element ID (for discovery callback) */
    elementId: string;
    /** Element properties */
    properties: {
        filename?: string | null;
        autoplay?: boolean;
        riveStateMachine?: string;
        riveInputs?: Record<string, any>;
        riveBindings?: Record<string, any>;
        backgroundColor?: string;
        [key: string]: any;
    };
    /** Element dimensions */
    width: number;
    height: number;
    /** Rive discovery callback */
    onRiveDiscovery?: (elementId: string, machines: DiscoveredRiveStateMachine[], bindings: DiscoveredRiveDataBinding[]) => void;
}
declare const _default: React.NamedExoticComponent<MediaRiveElementProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Element_MediaRive.d.ts.map