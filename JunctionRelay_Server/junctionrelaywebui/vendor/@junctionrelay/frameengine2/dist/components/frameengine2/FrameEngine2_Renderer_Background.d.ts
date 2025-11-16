import { default as React } from 'react';
import { FrameLayoutConfig } from './types/FrameEngine2_LayoutTypes';
import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from './types/FrameEngine2_ElementTypes';

interface FrameEngine2_Renderer_BackgroundProps {
    layout: FrameLayoutConfig;
    onRiveDiscovery?: (machines: DiscoveredRiveStateMachine[], bindings: DiscoveredRiveDataBinding[]) => void;
}
/**
 * Background renderer for FrameEngine2 Canvas
 *
 * Supports three background types:
 * - Image: Static image with fit modes (cover, contain, fill, etc.)
 * - Video: Looping video background with autoplay
 * - Rive: Animated Rive background with input/binding discovery and application
 *
 * Performance optimizations:
 * - All styles memoized to prevent recreation
 * - Video/Rive only rendered when actually needed
 * - Error handling to prevent crashes
 * - Error states reset when file changes (ensures new files load)
 * - Rive discovery runs asynchronously with retry logic
 */
declare const FrameEngine2_Renderer_Background: React.FC<FrameEngine2_Renderer_BackgroundProps>;
export default FrameEngine2_Renderer_Background;
//# sourceMappingURL=FrameEngine2_Renderer_Background.d.ts.map