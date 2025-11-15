import { default as React } from 'react';
import { VirtualDisplayDataProvider } from '../interfaces/VirtualDisplayDataProvider';
import { DeviceData } from '../interfaces/DeviceData';

interface VirtualScreenViewer2Props {
    deviceId?: string;
    containerHeight?: number;
    deviceData?: DeviceData;
    isStandalone?: boolean;
    showControls?: boolean;
    onFullscreenClick?: () => void;
}
interface VirtualScreenViewer2ComponentProps extends VirtualScreenViewer2Props {
    dataProvider: VirtualDisplayDataProvider;
}
/**
 * VirtualScreenViewer2 - Live frame renderer using FrameEngine2
 *
 * This component renders virtual screens in real-time using FrameEngine2 components.
 * It connects to a WebSocket data provider to receive configuration and sensor data.
 *
 * Performance optimizations:
 * - Memoized layout configuration
 * - Memoized sensor data mapping
 * - Ref-based interval management for smooth updates
 * - Proper cleanup on unmount
 */
export declare const VirtualScreenViewer2Component: React.FC<VirtualScreenViewer2ComponentProps>;
/**
 * VirtualScreenViewer2 - Main export with WebSocket provider
 */
declare const VirtualScreenViewer2: React.FC<VirtualScreenViewer2Props>;
export default VirtualScreenViewer2;
//# sourceMappingURL=VirtualScreenViewer2.d.ts.map