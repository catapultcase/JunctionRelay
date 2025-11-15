import { default as React } from 'react';

/**
 * Props for the TimeDate element component
 */
interface TimeDateElementProps {
    /** Element properties */
    properties: {
        displayMode?: 'time' | 'date' | 'both';
        timeFormat?: '12h' | '24h';
        dateFormat?: 'short' | 'long' | 'numeric';
        timezone?: string;
        showSeconds?: boolean;
        fontSize?: number;
        fontFamily?: string;
        fontWeight?: string;
        textColor?: string;
        backgroundColor?: string;
        textAlign?: 'left' | 'center' | 'right';
        verticalAlign?: 'top' | 'center' | 'bottom';
        [key: string]: any;
    };
    /** Element padding in pixels */
    elementPadding?: number;
    /** Element dimensions */
    width: number;
    height: number;
}
declare const _default: React.NamedExoticComponent<TimeDateElementProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Element_TimeDate.d.ts.map