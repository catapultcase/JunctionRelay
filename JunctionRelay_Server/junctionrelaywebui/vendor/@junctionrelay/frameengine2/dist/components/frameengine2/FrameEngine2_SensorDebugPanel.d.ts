import { default as React } from 'react';
import { SensorDebugData } from './types/FrameEngine2_SensorTypes';

interface FrameEngine2_SensorDebugPanelProps {
    /** Debug data from the sensor tag manager */
    debugData: SensorDebugData;
}
/**
 * Debug panel component that visualizes sensor tag data flow
 * Displays in retro terminal style (black background, green text)
 */
declare const FrameEngine2_SensorDebugPanel: React.FC<FrameEngine2_SensorDebugPanelProps>;
export default FrameEngine2_SensorDebugPanel;
//# sourceMappingURL=FrameEngine2_SensorDebugPanel.d.ts.map