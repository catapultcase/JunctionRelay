import { default as React } from 'react';

/**
 * Props for the PixelDraw element component
 */
interface PixelDrawElementProps {
    /** Element properties */
    properties: {
        pixelSize?: number;
        gridColor?: string;
        showGrid?: boolean;
        backgroundColor?: string;
        pixels?: Record<string, string>;
        [key: string]: any;
    };
    /** Element padding in pixels */
    elementPadding?: number;
    /** Element dimensions */
    width: number;
    height: number;
    /** Callback to update element properties */
    onUpdateProperties?: (updates: any) => void;
}
declare const _default: React.NamedExoticComponent<PixelDrawElementProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Element_PixelDraw.d.ts.map