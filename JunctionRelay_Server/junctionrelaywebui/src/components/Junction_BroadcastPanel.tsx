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

import { useState, useEffect, useCallback } from "react";
import {
    Typography, Box, Card, CardContent,
    TextField, Alert, Tooltip,
    CircularProgress, InputAdornment
} from "@mui/material";
import InfoIcon from '@mui/icons-material/Info';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import type { Junction } from '../types/entities';

type PortStatus = 'idle' | 'checking' | 'available' | 'in_use_by_this_junction' | 'in_use_by_junction' | 'in_use_by_system' | 'invalid';

interface JunctionBroadcastPanelProps {
    junctionData: Partial<Junction>;
    onJunctionDataChange: (updatedData: Partial<Junction>, field: string, immediate?: boolean) => void;
}

const Junction_BroadcastPanel: React.FC<JunctionBroadcastPanelProps> = ({
    junctionData,
    onJunctionDataChange
}) => {
    const [portStatus, setPortStatus] = useState<PortStatus>('idle');
    const [portStatusMessage, setPortStatusMessage] = useState<string>('');

    const checkPortAvailability = useCallback(async (port: number, junctionId?: number) => {
        if (port < 1024 || port > 65535) {
            setPortStatus('invalid');
            setPortStatusMessage('Port must be between 1024 and 65535');
            return;
        }

        setPortStatus('checking');
        setPortStatusMessage('Checking port availability...');

        try {
            const url = junctionId
                ? `/api/broadcast/check-port/${port}?excludeJunctionId=${junctionId}`
                : `/api/broadcast/check-port/${port}`;
            const response = await fetch(url);
            const result = await response.json();

            setPortStatus(result.status as PortStatus);
            setPortStatusMessage(result.message || '');
        } catch (error) {
            console.error('Error checking port:', error);
            setPortStatus('idle');
            setPortStatusMessage('Failed to check port');
        }
    }, []);

    useEffect(() => {
        const port = junctionData?.broadcastPort;
        if (port) {
            const timeoutId = setTimeout(() => {
                checkPortAvailability(port, junctionData.id);
            }, 500);
            return () => clearTimeout(timeoutId);
        }
    }, [junctionData?.broadcastPort, junctionData?.id, checkPortAvailability]);

    return (
        <Card>
            <CardContent sx={{ pb: 1 }}>
                <Typography variant="subtitle1" gutterBottom>Broadcast Configuration</Typography>

                <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2 }}>
                    <Typography variant="body2">
                        <strong>Broadcast Junction:</strong> Server broadcasts sensor data on the configured port.
                        Devices connect to this port to receive sensor updates.
                        Enter the Server's IP and this port in your client device settings.
                    </Typography>
                </Alert>

                <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }} gap={2}>
                    <TextField
                        label="Broadcast Port"
                        type="number"
                        value={junctionData.broadcastPort || 9084}
                        onChange={(e) => onJunctionDataChange({
                            ...junctionData,
                            broadcastPort: parseInt(e.target.value) || 9084
                        }, 'broadcastPort', true)}
                        size="small"
                        fullWidth
                        helperText={portStatusMessage || "Port XSD devices connect to (default: 9084)"}
                        error={portStatus === 'invalid' || portStatus === 'in_use_by_system'}
                        inputProps={{ min: 1024, max: 65535 }}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    {portStatus === 'checking' && (
                                        <Tooltip title="Checking port availability...">
                                            <CircularProgress size={20} />
                                        </Tooltip>
                                    )}
                                    {portStatus === 'available' && (
                                        <Tooltip title="Port is available">
                                            <CheckCircleIcon color="success" />
                                        </Tooltip>
                                    )}
                                    {portStatus === 'in_use_by_this_junction' && (
                                        <Tooltip title="Junction is running on this port">
                                            <CheckCircleIcon color="success" />
                                        </Tooltip>
                                    )}
                                    {portStatus === 'in_use_by_junction' && (
                                        <Tooltip title={portStatusMessage}>
                                            <WarningIcon color="warning" />
                                        </Tooltip>
                                    )}
                                    {portStatus === 'in_use_by_system' && (
                                        <Tooltip title="Port is in use by another application">
                                            <ErrorIcon color="error" />
                                        </Tooltip>
                                    )}
                                    {portStatus === 'invalid' && (
                                        <Tooltip title="Invalid port">
                                            <ErrorIcon color="error" />
                                        </Tooltip>
                                    )}
                                </InputAdornment>
                            )
                        }}
                    />
                    <TextField
                        label="Broadcast Rate (ms)"
                        type="number"
                        value={junctionData.broadcastRate || 1000}
                        onChange={(e) => onJunctionDataChange({
                            ...junctionData,
                            broadcastRate: parseInt(e.target.value) || 1000
                        }, 'broadcastRate', true)}
                        size="small"
                        fullWidth
                        helperText="Sensor broadcast interval in milliseconds (default: 1000)"
                        inputProps={{ min: 100, max: 60000 }}
                    />
                </Box>
            </CardContent>
        </Card>
    );
};

export default Junction_BroadcastPanel;
