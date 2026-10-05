import type { Device } from './entities';

/** Where a scanned device stands against the devices already registered. */
export type ScanStatus = "NEW_DEVICE" | "IP_IN_USE" | "DEVICE_EXISTS" | "NEEDS_RESYNC" | "CONFLICTING_RECORDS" | "ERROR";

/** One device found by a network or COM-port scan (GET /api/devices/scan, its stream, and the COM scan). */
export interface ScannedDevice {
    instance: string;
    ipAddress: string;            // a COM scan puts the port name here
    macAddress: string;
    status: ScanStatus;
    isJunctionRelayDevice: boolean;
    discoveryMethod: string;
    matchingDeviceCount: number;
    needsResync?: boolean;
    currentIpInDb?: string | null;
    // COM scans only
    baudRate?: number;
    portName?: string;
    type?: string;
    deviceModel?: string | null;
    firmwareVersion?: string | null;
    customFirmware?: unknown;
    error?: string;
}


/** A row of the devices table: a registered device, or a device a scan found. */
export type DeviceRow = Device | ScannedDevice;

export const isScannedDevice = (row: DeviceRow): row is ScannedDevice => 'instance' in row;

/** How the devices page lays devices out. */
export type ViewMode = 'table' | 'standard' | 'mini';

/** A device with the devices nested under it (a gateway's peers), for the tree the devices page draws. */
export interface HierarchicalDevice {
    device: Device;
    children: HierarchicalDevice[];
    level: number;
}

/** A stored view mode, or 'table' when it is missing or not one. */
export const toViewMode = (value: string | null): ViewMode => value === 'standard' || value === 'mini' ? value : 'table';

/** True when a parsed scan-stream message is a device (not a status line). */
export const isScanStreamDevice = (data: unknown): data is ScannedDevice =>
    typeof data === 'object' && data !== null && 'status' in data && 'ipAddress' in data && typeof data.ipAddress === 'string';
