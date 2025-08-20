/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * JunctionRelay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with JunctionRelay. If not, see <https://www.gnu.org/licenses/>.
 */

import React from 'react';

// Define column interface
export interface DeviceColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    renderCell?: (device: any) => React.ReactNode; // Custom cell renderer
    sortable?: boolean; // Whether this column can be sorted
}

// Storage keys
export const STORAGE_KEY_DEVICES_COLUMNS = "devices_visible_columns";
export const STORAGE_KEY_DEVICES_SORT = "devices_sort_state";
export const STORAGE_KEY_REFRESH_INTERVAL = "devices_refresh_interval";
export const STORAGE_KEY_CLOUD_REFRESH_INTERVAL = "junctionrelay_cloud_refresh_interval";

// Storage keys for cloud devices default columns
export const STORAGE_KEY_CLOUD_DEVICES_COLUMNS = "cloud_devices_visible_columns";

// Type for sort direction
export type SortDirection = 'asc' | 'desc';

// Define column definitions for devices
export const defaultDeviceColumns: DeviceColumn[] = [
    { field: "actions", label: "Actions", align: "left", sortable: false },
    { field: "name", label: "Device Name", align: "left", sortable: true },
    { field: "type", label: "Type", align: "left", sortable: true },
    { field: "model", label: "Model", align: "left", sortable: true },
    { field: "ipAddress", label: "IP Address", align: "left", sortable: true },
    { field: "COMPort", label: "COM Port", align: "left", sortable: true },
    { field: "uniqueIdentifier", label: "MAC / Unique ID", align: "left", sortable: true },
    { field: "status", label: "Status", align: "left", sortable: true },
    { field: "connMode", label: "Active Connections", align: "left", sortable: true },
    { field: "firmware", label: "Firmware", align: "left", sortable: true },
    { field: "custom", label: "Custom Firmware", align: "left", sortable: true },
    { field: "heartbeatStatus", label: "Heartbeat Status", align: "left", sortable: true },
    { field: "heartbeatProtocol", label: "Heartbeat Protocol", align: "left", sortable: true },
    { field: "lastPinged", label: "Last Heartbeat", align: "left", sortable: true },
    { field: "pingLatency", label: "Heartbeat Time (ms)", align: "right", sortable: true },
    { field: "consecutiveFailures", label: "Heartbeat Failures", align: "right", sortable: true },
    { field: "syncMode", label: "Cloud Sync Mode", align: "left", sortable: true },
];

// Default visible columns for local devices
export const defaultLocalDeviceColumns = [
    "actions", "name", "type", "model", "ipAddress", "COMPort", "uniqueIdentifier",
    "status", "syncMode", "connMode", "firmware", "custom",
    "heartbeatProtocol", "heartbeatStatus", "lastPinged", "pingLatency",
    "consecutiveFailures"
];

// Default visible columns for cloud devices (when not unified)
export const defaultCloudDeviceColumns = [
    "actions", "name", "type", "uniqueIdentifier", "status",
    "syncMode", "heartbeatStatus", "lastPinged"
];

// Helper function to get heartbeat status info
export const getHeartbeatStatusInfo = (
    device: any,
    heartbeatEnabled: boolean = true
): { label: string; color: "success" | "info" | "warning" | "error" | "default"; icon?: React.ReactNode } => {
    if (!heartbeatEnabled) {
        return { label: "Disabled", color: "default" };
    }

    const heartbeatStatus = device.lastPingStatus
    const consecutiveFailures = device.consecutivePingFailures || 0;
    const lastPinged = device.lastPinged;

    // Check if last ping was too long ago (more than 5 minutes)
    const lastPingTime = lastPinged ? new Date(lastPinged) : null;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isStale = lastPingTime && lastPingTime < fiveMinutesAgo;

    if (!heartbeatStatus) {
        return { label: "Unknown", color: "default" };
    }

    const normalizedStatus = heartbeatStatus.toLowerCase().trim();

    // Handle online status with additional checks
    if (normalizedStatus === 'online') {
        if (consecutiveFailures === 0 && !isStale) {
            return {
                label: "Online",
                color: "success"
                // Note: icon will be added in the component that uses this
            };
        } else if (isStale) {
            return {
                label: "Stale",
                color: "warning"
                // Note: icon will be added in the component that uses this
            };
        } else if (consecutiveFailures > 0 && consecutiveFailures < 3) {
            return {
                label: "Unstable",
                color: "warning"
                // Note: icon will be added in the component that uses this
            };
        }
    }

    // Handle new streaming status
    if (normalizedStatus === 'online (streaming)') {
        if (consecutiveFailures === 0 && !isStale) {
            return {
                label: "Online (Streaming)",
                color: "success"
                // Note: icon will be added in the component that uses this
            };
        } else if (isStale) {
            return {
                label: "Stale (Streaming)",
                color: "warning"
                // Note: icon will be added in the component that uses this
            };
        }
    }

    // Handle other specific statuses
    switch (normalizedStatus) {
        case 'testing':
            return {
                label: "Testing",
                color: "info"
                // Note: icon will be added in the component that uses this
            };
        case 'retesting':
            return {
                label: "Retesting",
                color: "warning"
                // Note: icon will be added in the component that uses this
            };
        case 'unstable':
            return {
                label: "Unstable",
                color: "warning"
                // Note: icon will be added in the component that uses this
            };
        case 'failed':
            return {
                label: "Failed",
                color: "error"
                // Note: icon will be added in the component that uses this
            };
        case 'timeout':
            return {
                label: "Timeout",
                color: "error"
                // Note: icon will be added in the component that uses this
            };
        case 'offline':
            return {
                label: "Offline",
                color: "error"
                // Note: icon will be added in the component that uses this
            };
    }

    // Handle based on failure count if status doesn't match known patterns
    if (consecutiveFailures >= 3) {
        return {
            label: "Offline",
            color: "error"
            // Note: icon will be added in the component that uses this
        };
    } else if (consecutiveFailures > 0) {
        return {
            label: "Unstable",
            color: "warning"
            // Note: icon will be added in the component that uses this
        };
    }

    // Default case - display the status as-is with proper capitalization
    return {
        label: normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1),
        color: "default"
    };
};

// Helper function to format relative time
export const formatRelativeTime = (dateString: string | null): string => {
    if (!dateString) return "Never";

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
};

// Helper function to get a readable status description and color
export const getDeviceStatusInfo = (
    status: string
): { label: string; color: "success" | "info" | "warning" | "error" | "default" } => {
    // Handle null/undefined status
    if (!status) {
        return { label: "Unknown", color: "default" };
    }

    // Convert to lowercase for case-insensitive matching
    const normalizedStatus = status.toString().toLowerCase().trim();

    // Status mapping - completely case insensitive
    const statusMap: Record<string, { label: string; color: "success" | "info" | "warning" | "error" | "default" }> = {
        // Success statuses (green)
        'active': { label: "Active", color: "success" },
        'online': { label: "Online", color: "success" },
        'new_device': { label: "Active", color: "success" },
        'connected': { label: "Connected", color: "success" },

        // Info statuses (blue)
        'device_exists': { label: "Exists", color: "info" },
        'exists': { label: "Exists", color: "info" },

        // Warning statuses (orange)
        'needs_resync': { label: "Needs Resync", color: "warning" },
        'ip_in_use': { label: "Needs Resync", color: "warning" },
        'warning': { label: "Warning", color: "warning" },

        // Error statuses (red)
        'conflicting_records': { label: "Error", color: "error" },
        'error': { label: "Error", color: "error" },
        'failed': { label: "Error", color: "error" },

        // Default/offline statuses (gray/red)
        'offline': { label: "Offline", color: "error" },
        'disconnected': { label: "Offline", color: "error" },
        'unknown': { label: "Unknown", color: "default" }
    };

    const statusInfo = statusMap[normalizedStatus];

    if (statusInfo) {
        return statusInfo;
    }

    // If no match found, return the original status with default styling
    const displayLabel = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    return { label: displayLabel, color: "default" };
};

// Helper function to get device type info
export const getDeviceTypeInfo = (device: any): { label: string; color: "primary" | "secondary" | "default" | "info"; icon: React.ReactNode } => {
    // Check for Cloud Device type first (before other checks)
    if (device.type === "Cloud Device") {
        return {
            label: "Cloud Device",
            color: "info",
            icon: null // Will be added in the component
        };
    }

    if (device.isGateway) {
        return {
            label: "Gateway",
            color: "primary",
            icon: null // Will be added in the component
        };
    }

    if (device.gatewayId && !device.isGateway) {
        return {
            label: "Child",
            color: "secondary",
            icon: null // Will be added in the component
        };
    }

    return {
        label: "Standalone",
        color: "default",
        icon: null // Will be added in the component
    };
};

export const getSyncModeInfo = (
    device: any
): { label: string; color: "primary" | "secondary" | "default" } => {
    const raw = device.syncMode;

    if (!raw || typeof raw !== "string") {
        return { label: "Disabled", color: "default" };
    }

    const mode = raw.trim().toLowerCase();

    switch (mode) {
        case "cloud_health":
            return { label: "Health Only", color: "primary" };
        case "cloud_sync":
            return { label: "Full Sync", color: "secondary" };
        case "local_health":
            return { label: "Health Only", color: "primary" };
        case "local_sync":
            return { label: "Full Sync", color: "secondary" };
        case "disabled":
        default:
            return { label: "Disabled", color: "default" };
    }
};

// Simplified ConnMode display helper - now uses only stored database values
export const getEnhancedConnModeDisplay = (device: any): Array<{ label: string; color: "default" | "primary" | "secondary" | "success" | "warning" | "info" | "error" }> => {
    // Use the stored ConnMode from the database (updated by background service)
    if (!device.connMode) {
        return [{ label: "Unknown", color: "default" }];
    }

    // Handle comma-separated connection modes from background service
    // Examples: "WiFi,MQTT", "Ethernet", "WiFi,Ethernet,MQTT"
    const connectionModes = device.connMode.split(',').map((mode: string) => mode.trim()).filter((mode: string) => mode);

    if (connectionModes.length === 0) {
        return [{ label: "Unknown", color: "default" }];
    }

    // Convert each connection mode to a chip
    return connectionModes.map((mode: string) => ({
        label: mode,
        color: "primary" as const // All active connections show as primary (blue)
    }));
};