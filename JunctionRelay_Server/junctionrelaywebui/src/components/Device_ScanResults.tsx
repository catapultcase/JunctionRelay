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
import { NavigateFunction } from "react-router-dom";

// Import components
import DevicesTable from './Devices_DevicesTable';

// Scan type enum
type ScanType = 'junctionrelay' | 'full' | 'com';

interface GroupedScanResults {
    newDevices: any[];
    existingDevices: any[];
}

interface Device_ScanResultsProps {
    scanning: boolean;
    status: string;
    scanViewModeNotice: string | null;
    setScanViewModeNotice: (notice: string | null) => void;
    scanResults: any[];
    groupedScanResults: GroupedScanResults;
    scanNewViewMode: string;
    setScanNewViewMode: (mode: string) => void;
    scanExistingViewMode: string;
    setScanExistingViewMode: (mode: string) => void;
    deviceDetails: Record<string, any>;
    loadingDetails: Set<string>;
    hasScanned: boolean;
    scanType: ScanType;
    handleDelete: (e: React.MouseEvent, deviceId: number) => void;
    handleUpdateDevice: (deviceId: number, e: React.MouseEvent) => void;
    navigate: NavigateFunction;
    handleSyncModeChange: (deviceId: number, mode: string) => void;
    handleCardClick: (device: any) => void;
    handleResync: (macAddress?: string, newIpAddress?: string) => void;
    resyncingDevices: { [macIp: string]: boolean };
    resyncedDevices: Set<string>;
    fetchDevices: (checkUpdates?: boolean) => void;
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
    handleDelete,
    handleUpdateDevice,
    navigate,
    handleSyncModeChange,
    handleCardClick,
    handleResync,
    resyncingDevices,
    resyncedDevices,
    fetchDevices
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
                    {/* New Devices Table */}
                    {groupedScanResults.newDevices.length > 0 && (
                        <DevicesTable
                            devices={groupedScanResults.newDevices}
                            title={`New Devices (${groupedScanResults.newDevices.length})`}
                            updateStatuses={{}}
                            updatingDevices={new Set()}
                            onDelete={handleDelete}
                            onUpdate={handleUpdateDevice}
                            navigate={navigate}
                            storageKeySuffix="_scan_new"
                            onDevicesChange={() => fetchDevices(false)}
                            isCloudDevicesTable={false}
                            onSyncModeChange={handleSyncModeChange}
                            isScanResults={true}
                            scanViewMode={scanNewViewMode}
                            onScanViewModeChange={setScanNewViewMode}
                            handleCardClick={handleCardClick}
                            deviceDetails={deviceDetails}
                            loadingDetails={loadingDetails}
                        />
                    )}

                    {/* Existing Devices Table */}
                    {groupedScanResults.existingDevices.length > 0 && (
                        <DevicesTable
                            devices={groupedScanResults.existingDevices}
                            title={`Existing Devices (${groupedScanResults.existingDevices.length})`}
                            updateStatuses={{}}
                            updatingDevices={new Set()}
                            onDelete={handleDelete}
                            onUpdate={handleUpdateDevice}
                            navigate={navigate}
                            storageKeySuffix="_scan_existing"
                            onDevicesChange={() => fetchDevices(false)}
                            isCloudDevicesTable={false}
                            onSyncModeChange={handleSyncModeChange}
                            isScanResults={true}
                            scanViewMode={scanExistingViewMode}
                            onScanViewModeChange={setScanExistingViewMode}
                            onResync={handleResync}
                            resyncingDevices={resyncingDevices}
                            resyncedDevices={resyncedDevices}
                            loadingDetails={loadingDetails}
                            deviceDetails={deviceDetails}
                            handleCardClick={handleCardClick}
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