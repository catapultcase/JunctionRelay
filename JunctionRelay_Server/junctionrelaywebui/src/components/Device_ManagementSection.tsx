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
    Button,
    Typography,
    Box,
    CircularProgress,
} from "@mui/material";

// Icon imports
import UpdateIcon from '@mui/icons-material/Update';
import CloudIcon from '@mui/icons-material/Cloud';
import ComputerIcon from '@mui/icons-material/Computer';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScreenshotMonitorIcon from '@mui/icons-material/ScreenshotMonitor';

interface Device_ManagementSectionProps {
    isMobile: boolean;
    scanning: boolean;
    buttonColor: "primary" | "secondary";
    setScanModalOpen: (open: boolean) => void;
    setAddCustomDeviceModalOpen: (open: boolean) => void;
    setAddVirtualScreenModalOpen: (open: boolean) => void;
    checkForUpdates: () => Promise<void>;
    isUnifiedMode: boolean;
    setAddCloudDeviceModalOpen: (open: boolean) => void;
    handleRefreshCloudDevices: () => Promise<void>;
    refreshingCloudDevices: boolean;
}

const Device_ManagementSection: React.FC<Device_ManagementSectionProps> = ({
    isMobile,
    scanning,
    buttonColor,
    setScanModalOpen,
    setAddCustomDeviceModalOpen,
    setAddVirtualScreenModalOpen,
    checkForUpdates,
    isUnifiedMode,
    setAddCloudDeviceModalOpen,
    handleRefreshCloudDevices,
    refreshingCloudDevices
}) => {
    // Hide on mobile since bottom action bar handles it
    if (isMobile) {
        return null;
    }

    return (
        <>
            {/* Device Management Header */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                <Typography variant="h6">Device Management</Typography>
            </Box>

            {/* First Row - Core Device Management */}
            <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: 'wrap' }}>
                {/* Scan for Devices Button */}
                <Button
                    variant="contained"
                    color={buttonColor}
                    onClick={() => setScanModalOpen(true)}
                    disabled={scanning}
                    startIcon={<SearchIcon />}
                    size="small"
                >
                    {scanning ? "Scanning..." : "Scan for Devices"}
                </Button>

                {/* Add Custom Local Device Button */}
                <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setAddCustomDeviceModalOpen(true)}
                    startIcon={<ComputerIcon />}
                    size="small"
                    data-testid="add-custom-local-device-button"
                >
                    Add Custom Local Device
                </Button>

                {/* Create Virtual Screen Button */}
                <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => setAddVirtualScreenModalOpen(true)}
                    startIcon={<ScreenshotMonitorIcon />}
                    size="small"
                    data-testid="add-virtual-screen-button"
                >
                    Create Virtual Screen
                </Button>

                {/* Check for Firmware Updates Button */}
                <Button
                    variant="outlined"
                    startIcon={<UpdateIcon />}
                    onClick={checkForUpdates}
                    size="small"
                >
                    Check for Firmware Updates
                </Button>
            </Box>

            {/* Second Row - Cloud Device Management */}
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                {/*<Button*/}
                {/*    variant="contained"*/}
                {/*    onClick={() => setAddCloudDeviceModalOpen(true)}*/}
                {/*    startIcon={<CloudIcon />}*/}
                {/*    size="small"*/}
                {/*    data-testid="add-cloud-device-button"*/}
                {/*    sx={{*/}
                {/*        backgroundColor: '#1976d2',*/}
                {/*        color: 'white',*/}
                {/*        '&:hover': {*/}
                {/*            backgroundColor: '#1565c0',*/}
                {/*        },*/}
                {/*        '&:focus': {*/}
                {/*            backgroundColor: '#1565c0',*/}
                {/*        }*/}
                {/*    }}*/}
                {/*>*/}
                {/*    Add Cloud Device*/}
                {/*</Button>*/}

                <Button
                    variant="outlined"
                    onClick={handleRefreshCloudDevices}
                    disabled={refreshingCloudDevices}
                    startIcon={refreshingCloudDevices ? <CircularProgress size={16} /> : <RefreshIcon />}
                    size="small"
                    sx={{
                        borderColor: '#1976d2',
                        color: '#1976d2',
                        '&:hover': {
                            borderColor: '#1565c0',
                            backgroundColor: 'rgba(25, 118, 210, 0.04)',
                        },
                        '&:focus': {
                            borderColor: '#1565c0',
                        }
                    }}
                >
                    {refreshingCloudDevices ? "Refreshing..." : "Refresh Cloud Devices"}
                </Button>
            </Box>
        </>
    );
};

export default Device_ManagementSection;