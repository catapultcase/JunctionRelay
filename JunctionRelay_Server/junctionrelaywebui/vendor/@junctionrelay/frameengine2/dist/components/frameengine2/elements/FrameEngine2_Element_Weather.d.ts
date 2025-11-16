import { default as React } from 'react';
import { WeatherProperties } from '../types/FrameEngine2_ElementTypes';

/**
 * Props for the Weather element component
 */
interface WeatherElementProps {
    /** Element properties */
    properties: WeatherProperties;
    /** Element dimensions */
    width: number;
    height: number;
    /** Preview mode - enables preserveDrawingBuffer for GIF/screenshot capture */
    previewMode?: boolean;
}
declare const _default: React.NamedExoticComponent<WeatherElementProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Element_Weather.d.ts.map