import { default as React } from 'react';

/**
 * Props for the MediaVideo element component
 */
interface MediaVideoElementProps {
    /** Element properties */
    properties: {
        filename?: string | null;
        objectFit?: 'cover' | 'contain' | 'fill' | 'none';
        opacity?: number;
        loop?: boolean;
        muted?: boolean;
        autoplay?: boolean;
        [key: string]: any;
    };
    /** Element dimensions */
    width: number;
    height: number;
}
declare const _default: React.NamedExoticComponent<MediaVideoElementProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_Element_MediaVideo.d.ts.map