import { default as React } from 'react';

/**
 * Props for the MediaImage element component
 */
interface MediaImageElementProps {
    /** Element properties */
    properties: {
        filename?: string | null;
        objectFit?: 'cover' | 'contain' | 'fill' | 'none';
        opacity?: number;
        [key: string]: any;
    };
    /** Element dimensions */
    width: number;
    height: number;
}
declare const _default: React.NamedExoticComponent<MediaImageElementProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Element_MediaImage.d.ts.map