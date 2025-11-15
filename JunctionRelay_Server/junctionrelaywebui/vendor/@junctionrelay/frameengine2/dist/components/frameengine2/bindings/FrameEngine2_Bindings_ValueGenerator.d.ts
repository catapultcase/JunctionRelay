import { default as React } from 'react';

interface ValueGeneratorProps {
    /** Whether test bindings are enabled */
    testBindingsEnabled: boolean;
    /** Test bindings interval in milliseconds */
    testBindingsInterval: number;
    /** Callback when enabled state changes */
    onEnabledChange: (enabled: boolean) => void;
    /** Callback when interval changes */
    onIntervalChange: (interval: number) => void;
}
declare const _default: React.NamedExoticComponent<ValueGeneratorProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Bindings_ValueGenerator.d.ts.map