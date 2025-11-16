import { default as React } from 'react';
import { Alignment9Way } from '../types/FrameEngine2_ElementTypes';

/**
 * Props for the Text element component
 */
interface TextElementProps {
    /** Element properties */
    properties: {
        text?: string;
        fontSize?: number;
        fontFamily?: string;
        fontType?: 'google' | 'pixel';
        fontWeight?: string;
        color?: string;
        backgroundColor?: string;
        textAlign?: 'left' | 'center' | 'right';
        verticalAlign?: 'top' | 'center' | 'bottom';
        alignment?: Alignment9Way;
        [key: string]: any;
    };
    /** Element padding in pixels */
    elementPadding?: number;
    /** Element dimensions */
    width: number;
    height: number;
}
declare const _default: React.NamedExoticComponent<TextElementProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Element_Text.d.ts.map