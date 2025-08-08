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

import React, { useState, useEffect, useCallback } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    CircularProgress,
    Alert,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    FormControlLabel,
    Checkbox,
    Chip,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Paper,
    useTheme,
    useMediaQuery
} from '@mui/material';

// Icons
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoIcon from '@mui/icons-material/Info';
import DevicesIcon from '@mui/icons-material/Devices';
import SensorsIcon from '@mui/icons-material/Sensors';
import MemoryIcon from '@mui/icons-material/Memory';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import SyncIcon from '@mui/icons-material/Sync';

interface Device_SyncModalProps {
    open: boolean;
    onClose: () => void;
    deviceId: string;
    deviceName: string;
    onSuccess: () => void;
    showSnackbar: (message: string, severity: 'success' | 'error' | 'warning' | 'info') => void;
}

interface SyncAnalysis {
    deviceId: number;
    deviceName: string;
    canProceedAutomatically: boolean;
    analyzedAt: string;
    deviceInfo: {
        hasChanges: boolean;
        changes: { [key: string]: FieldChange };
    };
    screens: {
        toAdd: any[];
        toUpdate: ScreenUpdatePlan[];
        toDelete: ScreenDeletePlan[];
        hasChanges: boolean;
    };
    i2CDevices: {
        toAdd: any[];
        toUpdate: I2CUpdatePlan[];
        toDelete: I2CDeletePlan[];
        hasChanges: boolean;
    };
    sensors: {
        toAdd: any[];
        toUpdate: SensorUpdatePlan[];
        toDelete: SensorDeletePlan[];
        hasChanges: boolean;
    };
    blockingIssues: string[];
    warnings: string[];
}

interface FieldChange {
    fieldName: string;
    oldValue: any;
    newValue: any;
    isSignificant: boolean;
}

interface ScreenUpdatePlan {
    screenId: number;
    screenKey: string;
    currentDisplayName: string;
    changes: { [key: string]: FieldChange };
    usedIn: string[];
    hasDependencies: boolean;
}

interface ScreenDeletePlan {
    screenId: number;
    screenKey: string;
    displayName: string;
    usedIn: string[];
    blockingReason?: string;
    isBlocked: boolean;
}

interface I2CUpdatePlan {
    i2CDeviceId: number;
    deviceType: string;
    changes: { [key: string]: FieldChange };
    usedIn: string[];
    hasDependencies: boolean;
}

interface I2CDeletePlan {
    i2CDeviceId: number;
    deviceType: string;
    i2CAddress: string;
    usedIn: string[];
    blockingReason?: string;
    isBlocked: boolean;
}

interface SensorUpdatePlan {
    sensorId: number;
    externalId: string;
    sensorName: string;
    changes: { [key: string]: FieldChange };
    usedIn: string[];
    hasDependencies: boolean;
}

interface SensorDeletePlan {
    sensorId: number;
    externalId: string;
    sensorName: string;
    usedIn: string[];
    blockingReason?: string;
    isBlocked: boolean;
}

interface SyncApprovals {
    approveDeviceInfoChanges: boolean;
    approvedScreenUpdates: number[];
    approvedScreenDeletions: number[];
    approvedI2CDeviceUpdates: number[];
    approvedI2CDeviceDeletions: number[];
    approvedSensorUpdates: number[];
    approvedSensorDeletions: number[];
}

const Device_SyncModal: React.FC<Device_SyncModalProps> = ({
    open,
    onClose,
    deviceId,
    deviceName,
    onSuccess,
    showSnackbar
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [loading, setLoading] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [analysis, setAnalysis] = useState<SyncAnalysis | null>(null);
    const [error, setError] = useState<string>('');
    const [approvals, setApprovals] = useState<SyncApprovals>({
        approveDeviceInfoChanges: true,
        approvedScreenUpdates: [],
        approvedScreenDeletions: [],
        approvedI2CDeviceUpdates: [],
        approvedI2CDeviceDeletions: [],
        approvedSensorUpdates: [],
        approvedSensorDeletions: []
    });

    // Auto-approve safe changes when analysis loads
    useEffect(() => {
        if (analysis) {
            setApprovals({
                approveDeviceInfoChanges: analysis.deviceInfo.hasChanges,
                approvedScreenUpdates: analysis.screens.toUpdate
                    .filter(item => !item.hasDependencies)
                    .map(item => item.screenId),
                approvedScreenDeletions: analysis.screens.toDelete
                    .filter(item => !item.isBlocked)
                    .map(item => item.screenId),
                approvedI2CDeviceUpdates: analysis.i2CDevices.toUpdate
                    .filter(item => !item.hasDependencies)
                    .map(item => item.i2CDeviceId),
                approvedI2CDeviceDeletions: analysis.i2CDevices.toDelete
                    .filter(item => !item.isBlocked)
                    .map(item => item.i2CDeviceId),
                approvedSensorUpdates: analysis.sensors.toUpdate
                    .filter(item => !item.hasDependencies)
                    .map(item => item.sensorId),
                approvedSensorDeletions: analysis.sensors.toDelete
                    .filter(item => !item.isBlocked)
                    .map(item => item.sensorId)
            });
        }
    }, [analysis]);

    // Analyze device sync when modal opens
    useEffect(() => {
        if (open && deviceId) {
            analyzeSync();
        }
    }, [open, deviceId]);

    const analyzeSync = async () => {
        setLoading(true);
        setError('');
        setAnalysis(null);

        try {
            const response = await fetch(`/api/devices/${deviceId}/analyze-sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            if (!response.ok) {
                throw new Error(`Analysis failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Analysis failed');
            }

            setAnalysis(result.analysis);
        } catch (err: any) {
            console.error('Sync analysis error:', err);
            setError(err.message || 'Failed to analyze device sync');
        } finally {
            setLoading(false);
        }
    };

    const executeSync = async () => {
        if (!analysis) return;

        setExecuting(true);
        setError('');

        try {
            const response = await fetch(`/api/devices/${deviceId}/execute-full-sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    deviceId: parseInt(deviceId),
                    approvals: approvals
                })
            });

            if (!response.ok) {
                throw new Error(`Sync execution failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Sync execution failed');
            }

            const summary = result.summary;
            const totalChanges = summary.totalItemsProcessed;

            showSnackbar(
                `Device sync completed successfully! ${totalChanges} item${totalChanges !== 1 ? 's' : ''} processed.`,
                'success'
            );

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Sync execution error:', err);
            setError(err.message || 'Failed to execute device sync');
        } finally {
            setExecuting(false);
        }
    };

    const handleClose = () => {
        if (!executing) {
            onClose();
        }
    };

    const toggleApproval = (category: keyof SyncApprovals, id?: number) => {
        setApprovals(prev => {
            if (category === 'approveDeviceInfoChanges') {
                return { ...prev, [category]: !prev[category] };
            } else if (id !== undefined) {
                const currentArray = prev[category] as number[];
                const isApproved = currentArray.includes(id);
                return {
                    ...prev,
                    [category]: isApproved
                        ? currentArray.filter(i => i !== id)
                        : [...currentArray, id]
                };
            }
            return prev;
        });
    };

    const renderFieldChanges = (changes: { [key: string]: FieldChange }) => {
        return Object.entries(changes).map(([key, change]) => (
            <Box key={key} sx={{ mt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                    <strong>{change.fieldName}:</strong> {String(change.oldValue)} → {String(change.newValue)}
                </Typography>
            </Box>
        ));
    };

    const renderDependencies = (usedIn: string[]) => {
        if (usedIn.length === 0) return null;

        return (
            <Box sx={{ mt: 1 }}>
                <Typography variant="body2" color="warning.main" sx={{ fontWeight: 'medium' }}>
                    Used in:
                </Typography>
                {usedIn.map((dependency, index) => (
                    <Typography key={index} variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                        • {dependency}
                    </Typography>
                ))}
            </Box>
        );
    };

    const getTotalApprovedChanges = () => {
        if (!analysis) return 0;

        return (
            (approvals.approveDeviceInfoChanges && analysis.deviceInfo.hasChanges ? 1 : 0) +
            analysis.screens.toAdd.length +
            approvals.approvedScreenUpdates.length +
            approvals.approvedScreenDeletions.length +
            analysis.i2CDevices.toAdd.length +
            approvals.approvedI2CDeviceUpdates.length +
            approvals.approvedI2CDeviceDeletions.length +
            analysis.sensors.toAdd.length +
            approvals.approvedSensorUpdates.length +
            approvals.approvedSensorDeletions.length
        );
    };

    const hasAnyChanges = () => {
        if (!analysis) return false;
        return analysis.deviceInfo.hasChanges ||
            analysis.screens.hasChanges ||
            analysis.i2CDevices.hasChanges ||
            analysis.sensors.hasChanges;
    };

    const hasBlockingIssues = () => {
        return analysis && analysis.blockingIssues.length > 0;
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            fullScreen={isMobile}
        >
            <DialogTitle>
                <Box display="flex" alignItems="center" gap={1}>
                    <SyncIcon />
                    <Typography variant="h6">
                        Device Sync Analysis - {deviceName}
                    </Typography>
                </Box>
            </DialogTitle>

            <DialogContent>
                {loading && (
                    <Box display="flex" flexDirection="column" alignItems="center" p={4}>
                        <CircularProgress size={50} />
                        <Typography variant="body1" sx={{ mt: 2 }}>
                            Analyzing device configuration...
                        </Typography>
                    </Box>
                )}

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {analysis && (
                    <Box>
                        {/* Summary */}
                        <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
                            <Typography variant="h6" gutterBottom>
                                Sync Summary
                            </Typography>
                            <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                                <Chip
                                    icon={analysis.canProceedAutomatically ? <CheckCircleIcon /> : <WarningIcon />}
                                    label={analysis.canProceedAutomatically ? 'Ready to sync' : 'Manual review required'}
                                    color={analysis.canProceedAutomatically ? 'success' : 'warning'}
                                />
                                <Typography variant="body2">
                                    {getTotalApprovedChanges()} of {
                                        (analysis.deviceInfo.hasChanges ? 1 : 0) +
                                        analysis.screens.toAdd.length +
                                        analysis.screens.toUpdate.length +
                                        analysis.screens.toDelete.length +
                                        analysis.i2CDevices.toAdd.length +
                                        analysis.i2CDevices.toUpdate.length +
                                        analysis.i2CDevices.toDelete.length +
                                        analysis.sensors.toAdd.length +
                                        analysis.sensors.toUpdate.length +
                                        analysis.sensors.toDelete.length
                                    } changes approved
                                </Typography>
                            </Box>

                            {hasBlockingIssues() && (
                                <Alert severity="warning" sx={{ mt: 2 }}>
                                    <Typography variant="subtitle2" gutterBottom>
                                        Blocking Issues:
                                    </Typography>
                                    {analysis.blockingIssues.map((issue, index) => (
                                        <Typography key={index} variant="body2">
                                            • {issue}
                                        </Typography>
                                    ))}
                                </Alert>
                            )}
                        </Paper>

                        {/* Device Info Changes */}
                        {analysis.deviceInfo.hasChanges && (
                            <Accordion defaultExpanded>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <InfoIcon />
                                        <Typography variant="h6">Device Information</Typography>
                                        <Chip label="1 change" size="small" color="primary" />
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={approvals.approveDeviceInfoChanges}
                                                onChange={() => toggleApproval('approveDeviceInfoChanges')}
                                            />
                                        }
                                        label="Update device information"
                                    />
                                    {renderFieldChanges(analysis.deviceInfo.changes)}
                                </AccordionDetails>
                            </Accordion>
                        )}

                        {/* Screens Changes */}
                        {analysis.screens.hasChanges && (
                            <Accordion defaultExpanded>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <DevicesIcon />
                                        <Typography variant="h6">Screens</Typography>
                                        <Chip
                                            label={`${analysis.screens.toAdd.length + analysis.screens.toUpdate.length + analysis.screens.toDelete.length} changes`}
                                            size="small"
                                            color="primary"
                                        />
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails>
                                    {/* New Screens */}
                                    {analysis.screens.toAdd.map((screen, index) => (
                                        <Paper key={`add-${index}`} elevation={1} sx={{ p: 2, mb: 2 }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                                                <AddIcon color="success" />
                                                <Typography variant="subtitle1">
                                                    Add: {screen.displayName || screen.screenKey}
                                                </Typography>
                                                <Chip label="Auto-approved" size="small" color="success" />
                                            </Box>
                                            <Typography variant="body2" color="text.secondary">
                                                Screen Key: {screen.screenKey} | Type: {screen.screenType}
                                            </Typography>
                                        </Paper>
                                    ))}

                                    {/* Screen Updates */}
                                    {analysis.screens.toUpdate.map((screen) => (
                                        <Paper key={`update-${screen.screenId}`} elevation={1} sx={{ p: 2, mb: 2 }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                                                <EditIcon color="primary" />
                                                <Typography variant="subtitle1">
                                                    Update: {screen.currentDisplayName || screen.screenKey}
                                                </Typography>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={approvals.approvedScreenUpdates.includes(screen.screenId)}
                                                            onChange={() => toggleApproval('approvedScreenUpdates', screen.screenId)}
                                                            disabled={screen.hasDependencies}
                                                        />
                                                    }
                                                    label="Approve"
                                                />
                                                {screen.hasDependencies && (
                                                    <Chip label="Has dependencies" size="small" color="warning" />
                                                )}
                                            </Box>
                                            {renderFieldChanges(screen.changes)}
                                            {renderDependencies(screen.usedIn)}
                                        </Paper>
                                    ))}

                                    {/* Screen Deletions */}
                                    {analysis.screens.toDelete.map((screen) => (
                                        <Paper key={`delete-${screen.screenId}`} elevation={1} sx={{ p: 2, mb: 2 }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                                                <DeleteIcon color={screen.isBlocked ? "disabled" : "error"} />
                                                <Typography variant="subtitle1">
                                                    Delete: {screen.displayName || screen.screenKey}
                                                </Typography>
                                                {screen.isBlocked ? (
                                                    <Chip icon={<BlockIcon />} label="Blocked" size="small" color="error" />
                                                ) : (
                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox
                                                                checked={approvals.approvedScreenDeletions.includes(screen.screenId)}
                                                                onChange={() => toggleApproval('approvedScreenDeletions', screen.screenId)}
                                                            />
                                                        }
                                                        label="Approve deletion"
                                                    />
                                                )}
                                            </Box>
                                            {screen.isBlocked && (
                                                <Alert severity="warning" sx={{ mt: 1 }}>
                                                    {screen.blockingReason}
                                                    <br />
                                                    <Typography variant="body2" sx={{ mt: 1 }}>
                                                        Remove this screen from all junctions first, then try again.
                                                    </Typography>
                                                </Alert>
                                            )}
                                            {renderDependencies(screen.usedIn)}
                                        </Paper>
                                    ))}
                                </AccordionDetails>
                            </Accordion>
                        )}

                        {/* I2C Devices Changes */}
                        {analysis.i2CDevices.hasChanges && (
                            <Accordion>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <MemoryIcon />
                                        <Typography variant="h6">I2C Devices</Typography>
                                        <Chip
                                            label={`${analysis.i2CDevices.toAdd.length + analysis.i2CDevices.toUpdate.length + analysis.i2CDevices.toDelete.length} changes`}
                                            size="small"
                                            color="primary"
                                        />
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails>
                                    {/* Similar structure for I2C devices */}
                                    {analysis.i2CDevices.toAdd.map((device, index) => (
                                        <Paper key={`add-i2c-${index}`} elevation={1} sx={{ p: 2, mb: 2 }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                                                <AddIcon color="success" />
                                                <Typography variant="subtitle1">
                                                    Add: {device.deviceType} ({device.i2CAddress})
                                                </Typography>
                                                <Chip label="Auto-approved" size="small" color="success" />
                                            </Box>
                                        </Paper>
                                    ))}
                                    {/* Add similar blocks for updates and deletions */}
                                </AccordionDetails>
                            </Accordion>
                        )}

                        {/* Sensors Changes */}
                        {analysis.sensors.hasChanges && (
                            <Accordion>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <SensorsIcon />
                                        <Typography variant="h6">Sensors</Typography>
                                        <Chip
                                            label={`${analysis.sensors.toAdd.length + analysis.sensors.toUpdate.length + analysis.sensors.toDelete.length} changes`}
                                            size="small"
                                            color="primary"
                                        />
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails>
                                    {/* Similar structure for sensors */}
                                    {analysis.sensors.toAdd.map((sensor, index) => (
                                        <Paper key={`add-sensor-${index}`} elevation={1} sx={{ p: 2, mb: 2 }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                                                <AddIcon color="success" />
                                                <Typography variant="subtitle1">
                                                    Add: {sensor.name} ({sensor.externalId})
                                                </Typography>
                                                <Chip label="Auto-approved" size="small" color="success" />
                                            </Box>
                                        </Paper>
                                    ))}
                                    {/* Add similar blocks for updates and deletions */}
                                </AccordionDetails>
                            </Accordion>
                        )}

                        {/* No Changes Message - Only show if no blocking issues and no changes */}
                        {!hasBlockingIssues() && !hasAnyChanges() && (
                            <Paper elevation={1} sx={{ p: 3, textAlign: 'center' }}>
                                <CheckCircleIcon color="success" sx={{ fontSize: 48, mb: 2 }} />
                                <Typography variant="h6" gutterBottom>
                                    Device is perfectly synchronized
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    No changes are needed. The device configuration matches the database.
                                </Typography>
                            </Paper>
                        )}
                    </Box>
                )}
            </DialogContent>

            <DialogActions>
                {executing ? (
                    <Button onClick={handleClose} disabled>
                        Cancel
                    </Button>
                ) : (
                    <Button onClick={handleClose}>
                        Close
                    </Button>
                )}
                {analysis && getTotalApprovedChanges() > 0 && !hasBlockingIssues() && (
                    <Button
                        variant="contained"
                        onClick={executeSync}
                        disabled={executing}
                        startIcon={executing ? <CircularProgress size={16} /> : <SyncIcon />}
                    >
                        {executing ? 'Syncing...' : `Sync ${getTotalApprovedChanges()} Change${getTotalApprovedChanges() !== 1 ? 's' : ''}`}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default Device_SyncModal;