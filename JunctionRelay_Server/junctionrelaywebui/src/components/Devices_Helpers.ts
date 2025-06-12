/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
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

// Interface for hierarchical device structure
export interface HierarchicalDevice {
    device: any;
    children: any[];
    isChild: boolean;
    level: number;
}

// Storage keys
export const STORAGE_KEY_DEVICES_COLUMNS = "devices_visible_columns";
export const STORAGE_KEY_DEVICES_SORT = "devices_sort_state";
export const STORAGE_KEY_REFRESH_INTERVAL = "devices_refresh_interval";

// Type for sort direction
export type SortDirection = 'asc' | 'desc';

// Define column definitions for regular devices
export const defaultDeviceColumns: DeviceColumn[] = [
    { field: "name", label: "Device Name", align: "left", sortable: true },
    { field: "model", label: "Model", align: "left", sortable: true },
    { field: "ipAddress", label: "IP Address", align: "left", sortable: true },
    { field: "uniqueIdentifier", label: "MAC / Unique ID", align: "left", sortable: true },
    { field: "status", label: "Status", align: "left", sortable: true },
    { field: "connMode", label: "Active Connections", align: "left", sortable: true },
    { field: "firmware", label: "Firmware", align: "left", sortable: true },
    { field: "custom", label: "Custom Firmware", align: "left", sortable: true },
    { field: "heartbeatStatus", label: "Heartbeat", align: "left", sortable: true },
    { field: "heartbeatProtocol", label: "Heartbeat Protocol", align: "left", sortable: true },
    { field: "lastPinged", label: "Last Successful Heartbeat", align: "left", sortable: true },
    { field: "pingLatency", label: "Heartbeat Time (ms)", align: "right", sortable: true },
    { field: "consecutiveFailures", label: "Heartbeat Failures", align: "right", sortable: true },
    { field: "actions", label: "Actions", align: "right", sortable: false },
];

// Gateway-specific column definitions
export const gatewayDeviceColumns: DeviceColumn[] = [
    { field: "name", label: "Device Name", align: "left", sortable: true },
    { field: "model", label: "Model", align: "left", sortable: true },
    { field: "ipAddress", label: "IP Address", align: "left", sortable: true },
    { field: "uniqueIdentifier", label: "MAC / Unique ID", align: "left", sortable: true },
    { field: "status", label: "Status", align: "left", sortable: true },
    { field: "connMode", label: "Active Connections", align: "left", sortable: true },
    { field: "firmware", label: "Firmware", align: "left", sortable: true },
    { field: "custom", label: "Custom Firmware", align: "left", sortable: true },
    { field: "heartbeatStatus", label: "Heartbeat", align: "left", sortable: true },
    { field: "heartbeatProtocol", label: "Heartbeat Protocol", align: "left", sortable: true },
    { field: "lastPinged", label: "Last Successful Heartbeat", align: "left", sortable: true },
    { field: "pingLatency", label: "Heartbeat Time (ms)", align: "right", sortable: true },
    { field: "consecutiveFailures", label: "Heartbeat Failures", align: "right", sortable: true },
    { field: "actions", label: "Actions", align: "right", sortable: false },
];

// Helper function to get heartbeat status info
export const getHeartbeatStatusInfo = (
    device: any,
    heartbeatEnabled: boolean = true
): { label: string; color: "success" | "info" | "warning" | "error" | "default"; icon?: React.ReactNode } => {
    if (!heartbeatEnabled) {
        return { label: "Disabled", color: "default" };
    }

    // Use lastPingStatus if available, otherwise fall back to overall device status
    const heartbeatStatus = device.lastPingStatus || device.status;
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

// Enhanced ConnMode display helper
export const getEnhancedConnModeDisplay = (device: any, connectionStatus?: any) => {
    // If we have real-time connection status, use it for enhanced display
    if (connectionStatus) {
        const { espNow, wifiUp, ethernetUp, mqttUp } = connectionStatus;

        // Determine the primary connection method and additional capabilities
        let primaryConnection = "";
        let additionalFeatures: string[] = [];
        let color: "default" | "primary" | "secondary" | "success" | "warning" | "info" | "error" = "default";

        // Primary network connection
        if (ethernetUp && wifiUp) {
            primaryConnection = "Eth+WiFi";
            color = "success";
        } else if (ethernetUp) {
            primaryConnection = "Ethernet";
            color = "success";
        } else if (wifiUp) {
            primaryConnection = "WiFi";
            color = "primary";
        } else {
            primaryConnection = "Offline";
            color = "error";
        }

        // Additional capabilities
        if (espNow) {
            additionalFeatures.push("ESP-NOW");
        }
        if (mqttUp) {
            additionalFeatures.push("MQTT");
        }

        // Build the display label
        let label = primaryConnection;
        if (additionalFeatures.length > 0) {
            label += `+${additionalFeatures.join("+")}`;
        }

        // Special case for gateway mode
        if (device.connMode?.toLowerCase() === 'gateway') {
            if (ethernetUp && espNow) {
                label = "Eth/ESP-NOW";
                color = "success";
            } else if (ethernetUp) {
                label = "Eth Gateway";
                color = "primary";
            } else if (espNow) {
                label = "ESP-NOW Hub";
                color = "warning";
            } else {
                label = "Gateway (Offline)";
                color = "error";
            }
        }

        return { label, color };
    }

    // Fallback to basic connMode from database (for manually entered devices or when endpoint unavailable)
    if (!device.connMode) {
        return { label: "—", color: "default" as const };
    }

    // Simple color coding for database connMode values - no capability checking
    let connModeColor: "default" | "primary" | "secondary" | "success" | "warning" | "info" | "error" = "default";
    switch (device.connMode.toUpperCase()) {
        case 'WIFI':
            connModeColor = "primary";
            break;
        case 'ETHERNET':
            connModeColor = "success";
            break;
        case 'GATEWAY':
            connModeColor = "info";
            break;
        case 'AP':
        case 'ACCESSPOINT':
            connModeColor = "warning";
            break;
        case 'ESPNOW':
            connModeColor = "info";
            break;
        case 'BLUETOOTH':
        case 'BLE':
            connModeColor = "secondary";
            break;
        default:
            connModeColor = "default";
    }

    // Return the simple database value without any enhancement
    return { label: device.connMode, color: connModeColor };
};