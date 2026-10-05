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

import React from "react";
import {
    Typography,
    Box,
    CircularProgress,
    Paper,
    Alert,
} from "@mui/material";

// Import components
import ScanResultsTable from './Devices_ScanResultsTable';
import type { DeviceInfo } from '../types/entities';
import type { ScannedDevice, ViewMode } from '../types/devices';

// Scan type enum
type ScanType = 'junctionrelay' | 'full' | 'com';

interface GroupedScanResults {
    newDevices: ScannedDevice[];
    existingDevices: ScannedDevice[];
}

interface Device_ScanResultsProps {
    scanning: boolean;
    status: string;
    scanViewModeNotice: string | null;
    setScanViewModeNotice: (notice: string | null) => void;
    scanResults: ScannedDevice[];
    groupedScanResults: GroupedScanResults;
    scanNewViewMode: ViewMode;
    setScanNewViewMode: (mode: ViewMode) => void;
    scanExistingViewMode: ViewMode;
    setScanExistingViewMode: (mode: ViewMode) => void;
    deviceDetails: Record<string, DeviceInfo>;
    loadingDetails: Set<string>;
    hasScanned: boolean;
    scanType: ScanType;
    onSelect: (device: ScannedDevice) => void;
    handleResync: (macAddress?: string, newIpAddress?: string) => void;
    resyncingDevices: { [macIp: string]: boolean };
    resyncedDevices: Set<string>;
}

const Device_ScanResults: React.FC<Device_ScanResultsProps> = ({
    scanning,
    status,
    scanViewModeNotice,
    setScanViewModeNotice,
    scanResults,
    groupedScanResults,
    scanNewViewMode,
    setScanNewViewMode,
    scanExistingViewMode,
    setScanExistingViewMode,
    deviceDetails,
    loadingDetails,
    hasScanned,
    scanType,
    onSelect,
    handleResync,
    resyncingDevices,
    resyncedDevices,
}) => {
    return (
        <>
            {/* Scan Status */}
            {(scanning || status) && (
                <Paper sx={{ mb: 3, p: 2, borderRadius: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                    {scanning && <CircularProgress size={24} />}
                    <Typography variant="h6" sx={{ m: 0 }}>{status}</Typography>
                </Paper>
            )}

            {/* View Mode Notice */}
            {scanViewModeNotice && (
                <Alert severity="info" sx={{ mb: 2 }} onClose={() => setScanViewModeNotice(null)}>
                    {scanViewModeNotice}
                </Alert>
            )}

            {/* Scan Results Tables */}
            {scanResults.length > 0 && (
                <Box sx={{ mb: 4 }}>
                    {groupedScanResults.newDevices.length > 0 && (
                        <ScanResultsTable
                            devices={groupedScanResults.newDevices}
                            title={`New Devices (${groupedScanResults.newDevices.length})`}
                            viewMode={scanNewViewMode}
                            onViewModeChange={setScanNewViewMode}
                            deviceDetails={deviceDetails}
                            loadingDetails={loadingDetails}
                            onSelect={onSelect}
                        />
                    )}

                    {groupedScanResults.existingDevices.length > 0 && (
                        <ScanResultsTable
                            devices={groupedScanResults.existingDevices}
                            title={`Existing Devices (${groupedScanResults.existingDevices.length})`}
                            viewMode={scanExistingViewMode}
                            onViewModeChange={setScanExistingViewMode}
                            deviceDetails={deviceDetails}
                            loadingDetails={loadingDetails}
                            onResync={handleResync}
                            resyncingDevices={resyncingDevices}
                            resyncedDevices={resyncedDevices}
                            onSelect={onSelect}
                        />
                    )}
                </Box>
            )}

            {/* No Devices Message - Only show after scanning */}
            {scanResults.length === 0 && !scanning && hasScanned && (
                <Paper sx={{ p: 3, textAlign: 'center', mb: 4 }}>
                    <Typography variant="h6" color="textSecondary">No devices found</Typography>
                    <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                        {scanType === 'full'
                            ? 'No network devices were discovered during the scan'
                            : scanType === 'com'
                            ? 'No COM port devices were found'
                            : 'No JunctionRelay devices were found on your network'
                        }
                    </Typography>
                </Paper>
            )}
        </>
    );
};

export default Device_ScanResults;