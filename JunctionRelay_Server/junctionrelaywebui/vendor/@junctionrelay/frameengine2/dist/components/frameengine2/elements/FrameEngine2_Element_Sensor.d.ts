import { default as React } from 'react';
import { Alignment9Way } from '../types/FrameEngine2_ElementTypes';

/**
 * Props for the Sensor element component
 */
interface SensorElementProps {
    /** Element properties */
    properties: {
        sensorTag?: string;
        showLabel?: boolean;
        showUnit?: boolean;
        placeholderSensorLabel?: string;
        placeholderValue?: string | number;
        placeholderUnit?: string;
        fontSize?: number;
        fontFamily?: string;
        fontType?: 'google' | 'pixel';
        fontWeight?: string;
        textColor?: string;
        backgroundColor?: string;
        textAlign?: 'left' | 'center' | 'right';
        verticalAlign?: 'top' | 'center' | 'bottom';
        alignment?: Alignment9Way;
        [key: string]: any;
    };
    /** Resolved sensor values (Live > Test > Placeholder hierarchy already applied) */
    resolvedValues: Record<string, any>;
    /** Whether to show placeholders when no data */
    showPlaceholders?: boolean;
    /** Element padding in pixels */
    elementPadding?: number;
    /** Element dimensions */
    width: number;
    height: number;
}
declare const _default: React.NamedExoticComponent<SensorElementProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Element_Sensor.d.ts.map