import React, { useState, useEffect } from 'react';
import {
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Box,
    Typography,
    Alert,
    Paper,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    IconButton,
    Tooltip,
    TableContainer,
    Chip,
    Checkbox,
    FormControlLabel,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Switch
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SensorsIcon from '@mui/icons-material/Sensors';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';

interface CustomSensor {
    Id: number;
    name: string;
    sensorType: string;
    deviceName: string;
    value: string;
    unit?: string;
    category?: string;
    externalId?: string;
    lastUpdated?: string;
    IsSelected?: boolean;
    isSelected?: boolean;
    sensorOrder?: number;
    sensorTag?: string;
    IsCustomJunctionSensor?: boolean;
    IsEventSensor?: boolean;
    decimalPlaces?: number;
}

interface Junction_CustomSensorCreatorProps {
    junctionId: number;
    availableSensors: CustomSensor[];
    onSensorsRefresh: () => void;
    showSnackbar: (message: string, severity?: "success" | "info" | "warning" | "error") => void;
    sensorTargets: { [sensorId: number]: { deviceId: number, screenIds: number[] }[] };
    targets: any[];
    removeSensorTarget: (junctionId: number, sensorId: number, deviceId: number) => Promise<void>;
    assignSensorTarget: (junctionId: number, sensorId: number, deviceId: number, screenId: number | null) => Promise<void>;
    setCurrentSensor: React.Dispatch<React.SetStateAction<any>>;
    setCurrentTargetDevice: React.Dispatch<React.SetStateAction<any>>;
    setScreenSelectionModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setSensorTargets: React.Dispatch<React.SetStateAction<{ [sensorId: number]: { deviceId: number, screenIds: number[] }[] }>>;
    allDataAllTargets?: boolean;
    allTargetsAllScreens?: boolean;
    deviceScreensMap?: { [deviceId: number]: any[] };
    onScreenAssignmentUpdate?: (sensorId: number, deviceId: number, screenIds: number[]) => Promise<void>;
}

const SENSOR_TYPES = [
    "Text",
    "Number",
    "Boolean",
    "Color"
];

const Junction_CustomSensorCreator: React.FC<Junction_CustomSensorCreatorProps> = ({
    junctionId,
    availableSensors,
    onSensorsRefresh,
    showSnackbar,
    sensorTargets,
    targets,
    removeSensorTarget,
    assignSensorTarget,
    setCurrentSensor,
    setCurrentTargetDevice,
    setScreenSelectionModalOpen,
    setSensorTargets,
    allDataAllTargets = false,
    allTargetsAllScreens = false,
    deviceScreensMap,
    onScreenAssignmentUpdate
}) => {
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState(false);
    const [deleting, setDeleting] = useState<number | null>(null);
    const [error, setError] = useState('');

    const [sensorName, setSensorName] = useState('');
    const [sensorTag, setSensorTag] = useState('');
    const [sensorType, setSensorType] = useState('Text');
    const [defaultValue, setDefaultValue] = useState('');
    const [unit, setUnit] = useState('');
    const [decimalPlaces, setDecimalPlaces] = useState(2);

    const [editingSensor, setEditingSensor] = useState<CustomSensor | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editOrder, setEditOrder] = useState('');
    const [editSensorTag, setEditSensorTag] = useState('');
    const [editUnit, setEditUnit] = useState('');
    const [editDecimalPlaces, setEditDecimalPlaces] = useState(2);
    const [editSensorType, setEditSensorType] = useState('Text');

    const handleCreateOpen = () => {
        setCreateDialogOpen(true);
        setError('');
        setSensorName('');
        setSensorTag('');
        setSensorType('Text');
        setDefaultValue('');
        setUnit('');
        setDecimalPlaces(2);
    };

    const handleCreateClose = () => {
        setCreateDialogOpen(false);
        setError('');
        setSensorName('');
        setSensorTag('');
        setSensorType('Text');
        setDefaultValue('');
        setUnit('');
        setDecimalPlaces(2);
    };

    const handleEditOpen = (sensor: CustomSensor) => {
        setEditingSensor(sensor);
        setEditValue(sensor.value || '');
        setEditOrder(sensor.sensorOrder?.toString() || '0');
        setEditSensorTag(sensor.sensorTag || '');
        setEditUnit(sensor.unit || '');
        setEditDecimalPlaces(sensor.decimalPlaces || 2);
        setEditSensorType(sensor.sensorType || 'Text');
        setEditDialogOpen(true);
        setError('');
    };

    const handleEditClose = () => {
        setEditDialogOpen(false);
        setEditingSensor(null);
        setEditValue('');
        setEditOrder('');
        setEditSensorTag('');
        setEditUnit('');
        setEditDecimalPlaces(2);
        setEditSensorType('Text');
        setError('');
    };

    const handleCreate = async () => {
        if (!sensorName.trim() || !sensorTag.trim()) {
            setError('Name and Sensor Tag are required');
            return;
        }

        setCreating(true);
        setError('');

        try {
            let valueToSave = defaultValue.trim() || '';
            if (sensorType === 'Boolean') {
                if (defaultValue === 'true' || defaultValue === '1') {
                    valueToSave = '1';
                } else {
                    valueToSave = '0';
                }
            }

            const sensorData = {
                Name: sensorName.trim(),
                SensorType: sensorType,
                DeviceName: 'Custom Junction Device',
                Value: valueToSave,
                Unit: unit.trim(),
                DecimalPlaces: decimalPlaces,
                Category: 'Custom',
                ExternalId: `custom_${sensorTag.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
                ComponentName: 'Custom Component',
                SensorTag: sensorTag.trim(),
                IsMissing: false,
                IsStale: false,
                SensorOrder: 0,
                IsCustomJunctionSensor: true,
                IsEventSensor: false
            };

            const response = await fetch(`/api/sensors/junction-sensors/${junctionId}/custom`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(sensorData),
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Failed to create custom sensor: ${response.status} ${errorData}`);
            }

            const createdSensor = await response.json();

            showSnackbar(`Custom sensor "${sensorName}" created successfully`, "success");
            handleCreateClose();
            onSensorsRefresh();
        } catch (error) {
            console.error('Error creating custom sensor:', error);
            setError(error instanceof Error ? error.message : 'Failed to create custom sensor');
            showSnackbar('Failed to create custom sensor', "error");
        } finally {
            setCreating(false);
        }
    };

    const handleEdit = async () => {
        if (!editingSensor || !editSensorTag.trim()) {
            setError('Sensor tag is required');
            return;
        }

        setEditing(true);
        setError('');

        try {
            let valueToSave = editValue.trim();
            if (editSensorType === 'Boolean') {
                if (editValue === 'true' || editValue === '1') {
                    valueToSave = '1';
                } else {
                    valueToSave = '0';
                }
            }

            const updatedSensor = {
                ...editingSensor,
                value: valueToSave,
                sensorOrder: parseInt(editOrder) || 0,
                sensorTag: editSensorTag.trim(),
                unit: editUnit.trim(),
                decimalPlaces: editDecimalPlaces,
                sensorType: editSensorType,
                IsCustomJunctionSensor: true,
                IsEventSensor: editingSensor.IsEventSensor || false
            };

            const response = await fetch(`/api/sensors/junction-sensors/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedSensor),
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Failed to update custom sensor: ${response.status} ${errorData}`);
            }

            showSnackbar(`Custom sensor "${editSensorTag}" updated successfully`, "success");
            handleEditClose();
            onSensorsRefresh();
        } catch (error) {
            console.error('Error updating custom sensor:', error);
            setError(error instanceof Error ? error.message : 'Failed to update custom sensor');
            showSnackbar('Failed to update custom sensor', "error");
        } finally {
            setEditing(false);
        }
    };

    const handleDelete = async (sensor: CustomSensor) => {
        if (!window.confirm(`Are you sure you want to delete the custom sensor "${sensor.name}"?`)) {
            return;
        }

        setDeleting(sensor.Id);

        try {
            const response = await fetch(`/api/sensors/junction-sensors/${junctionId}/custom/${sensor.Id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error(`Failed to delete custom sensor: ${response.status}`);
            }

            showSnackbar(`Custom sensor "${sensor.name}" deleted successfully`, "success");
            onSensorsRefresh();
        } catch (error) {
            console.error('Error deleting custom sensor:', error);
            showSnackbar('Failed to delete custom sensor', "error");
        } finally {
            setDeleting(null);
        }
    };

    const formatValueDisplay = (value: any, sensorType: string) => {
        if (value === null || value === undefined) return '—';

        switch (sensorType) {
            case 'Boolean':
                const boolValue = value === '1' || value === 'true';
                return boolValue ? 'true' : 'false';
            case 'Color':
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                            sx={{
                                width: 20,
                                height: 20,
                                backgroundColor: value,
                                border: '1px solid #ccc',
                                borderRadius: '4px'
                            }}
                        />
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {value}
                        </Typography>
                    </Box>
                );
            default:
                return String(value);
        }
    };

    return (
        <Paper elevation={2} sx={{ p: 3, borderRadius: 2, mb: 3 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
                    <SensorsIcon sx={{ mr: 1 }} />
                    Custom Static Sensors
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleCreateOpen}
                    size="small"
                >
                    Add Custom Static Sensor
                </Button>
            </Box>

            {availableSensors.length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                <TableCell sx={{ fontWeight: 'bold' }}>Select</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Edit</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Order</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Sensor Tag</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Value</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Unit</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Targets</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Delete</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {availableSensors.map((sensor) => (
                                <TableRow key={sensor.Id} hover>
                                    <TableCell>
                                        <Checkbox
                                            checked={sensor.IsSelected || sensor.isSelected || false}
                                            onChange={async () => {
                                                try {
                                                    const newIsSelected = !(sensor.IsSelected || sensor.isSelected || false);

                                                    const updatedSensor = {
                                                        ...sensor,
                                                        IsSelected: newIsSelected,
                                                        isSelected: newIsSelected
                                                    };

                                                    const response = await fetch(`/api/sensors/junction-sensors/update`, {
                                                        method: 'PUT',
                                                        headers: {
                                                            'Content-Type': 'application/json',
                                                        },
                                                        body: JSON.stringify(updatedSensor),
                                                    });

                                                    if (!response.ok) {
                                                        throw new Error(`Failed to update sensor selection: ${response.status}`);
                                                    }

                                                    showSnackbar(`Sensor "${sensor.sensorTag || sensor.name}" ${newIsSelected ? 'selected' : 'deselected'}`, "success");
                                                    onSensorsRefresh();
                                                } catch (error) {
                                                    console.error('Error updating sensor selection:', error);
                                                    showSnackbar('Failed to update sensor selection', "error");
                                                }
                                            }}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip title="Edit Sensor">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleEditOpen(sensor)}
                                            >
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell>{sensor.sensorOrder || 0}</TableCell>
                                    <TableCell>{sensor.sensorTag || '—'}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={sensor.sensorType || 'Text'}
                                            size="small"
                                            color="primary"
                                        />
                                    </TableCell>
                                    <TableCell>{formatValueDisplay(sensor.value, sensor.sensorType)}</TableCell>
                                    <TableCell>{sensor.unit || '—'}</TableCell>
                                    <TableCell>
                                        <Box>
                                            {targets
                                                .filter(t => t.type === "device")
                                                .map((device) => {
                                                    const assignedTargets = sensorTargets[sensor.Id] || [];
                                                    const isChecked = assignedTargets.some(t => t.deviceId === device.id);
                                                    const targetData = assignedTargets.find(t => t.deviceId === device.id);
                                                    const assignedScreenCount = targetData?.screenIds.length || 0;

                                                    return (
                                                        <Box key={`devchk-${sensor.Id}-${device.id}`} sx={{ mb: 1 }}>
                                                            <FormControlLabel
                                                                control={
                                                                    <Checkbox
                                                                        checked={isChecked}
                                                                        disabled={allDataAllTargets}
                                                                        onChange={async () => {
                                                                            try {
                                                                                if (isChecked) {
                                                                                    await removeSensorTarget(junctionId, sensor.Id, device.id);
                                                                                    const newList = assignedTargets.filter(t => t.deviceId !== device.id);
                                                                                    setSensorTargets(prev => ({
                                                                                        ...prev,
                                                                                        [sensor.Id]: newList
                                                                                    }));
                                                                                } else {
                                                                                    await assignSensorTarget(junctionId, sensor.Id, device.id, null);
                                                                                    const newList = [...assignedTargets, { deviceId: device.id, screenIds: [] }];
                                                                                    setSensorTargets(prev => ({
                                                                                        ...prev,
                                                                                        [sensor.Id]: newList
                                                                                    }));

                                                                                    if (allTargetsAllScreens && (sensor.IsSelected || sensor.isSelected) && deviceScreensMap && onScreenAssignmentUpdate) {
                                                                                        const deviceScreens = deviceScreensMap[device.id] || [];
                                                                                        const allScreenIds = deviceScreens.map(screen => screen.id);

                                                                                        if (allScreenIds.length > 0) {
                                                                                            try {
                                                                                                await onScreenAssignmentUpdate(sensor.Id, device.id, allScreenIds);
                                                                                            } catch (error) {
                                                                                                console.error(`Error auto-assigning screens for sensor ${sensor.Id} to device ${device.id}:`, error);
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                }
                                                                            } catch (error) {
                                                                                console.error("Error updating sensor target:", error);
                                                                                showSnackbar("Failed to update sensor target", "error");
                                                                            }
                                                                        }}
                                                                        size="small"
                                                                    />
                                                                }
                                                                label={
                                                                    <Typography variant="body2">
                                                                        {device.name}
                                                                    </Typography>
                                                                }
                                                            />

                                                            {isChecked && (
                                                                <Box sx={{ display: 'flex', alignItems: 'center', ml: 4 }}>
                                                                    <Button
                                                                        size="small"
                                                                        variant="outlined"
                                                                        disabled={allTargetsAllScreens}
                                                                        onClick={() => {
                                                                            setCurrentSensor(sensor);
                                                                            setCurrentTargetDevice(device);
                                                                            setScreenSelectionModalOpen(true);
                                                                        }}
                                                                        sx={{ ml: 1 }}
                                                                    >
                                                                        {assignedScreenCount > 0 ? (
                                                                            <>
                                                                                <Chip
                                                                                    size="small"
                                                                                    label={assignedScreenCount}
                                                                                    color="primary"
                                                                                    sx={{ mr: 1, height: 20 }}
                                                                                />
                                                                                {assignedScreenCount === 1
                                                                                    ? "Screen Selected"
                                                                                    : "Screens Selected"}
                                                                            </>
                                                                        ) : (
                                                                            "Assign Screens"
                                                                        )}
                                                                    </Button>
                                                                </Box>
                                                            )}
                                                        </Box>
                                                    );
                                                })}
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip title="Delete Sensor">
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={() => handleDelete(sensor)}
                                                disabled={deleting === sensor.Id}
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                        No custom sensors created yet. Click "Add Custom Static Sensor" to create your first one.
                    </Typography>
                </Box>
            )}

            <Dialog
                open={createDialogOpen}
                onClose={handleCreateClose}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Add Custom Static Sensor</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        {error && (
                            <Alert severity="error" sx={{ mb: 2 }}>
                                {error}
                            </Alert>
                        )}

                        <TextField
                            label="Name"
                            value={sensorName}
                            onChange={(e) => setSensorName(e.target.value)}
                            fullWidth
                            required
                            size="small"
                        />

                        <TextField
                            label="Sensor Tag"
                            value={sensorTag}
                            onChange={(e) => setSensorTag(e.target.value)}
                            fullWidth
                            required
                            size="small"
                            helperText="Unique identifier for this sensor"
                        />

                        <FormControl size="small" fullWidth>
                            <InputLabel>Sensor Type</InputLabel>
                            <Select
                                value={sensorType}
                                label="Sensor Type"
                                onChange={(e) => setSensorType(e.target.value)}
                            >
                                {SENSOR_TYPES.map((type) => (
                                    <MenuItem key={type} value={type}>
                                        {type}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        {sensorType === 'Color' ? (
                            <Box>
                                <Typography variant="caption" color="textSecondary" sx={{ mb: 0.5, display: 'block' }}>
                                    Color Value
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <input
                                        type="color"
                                        value={defaultValue || '#ffffff'}
                                        onChange={(e) => setDefaultValue(e.target.value)}
                                        style={{
                                            width: '50px',
                                            height: '40px',
                                            padding: '2px',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    />
                                    <TextField
                                        value={defaultValue || '#ffffff'}
                                        onChange={(e) => setDefaultValue(e.target.value)}
                                        placeholder="#ffffff"
                                        size="small"
                                        fullWidth
                                        inputProps={{
                                            style: {
                                                fontFamily: 'monospace',
                                                fontSize: '12px'
                                            }
                                        }}
                                    />
                                </Box>
                            </Box>
                        ) : sensorType === 'Boolean' ? (
                            <Box>
                                <Typography variant="caption" color="textSecondary" sx={{ mb: 0.5, display: 'block' }}>
                                    Boolean Value
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2">False</Typography>
                                    <Switch
                                        checked={defaultValue === '1' || defaultValue === 'true'}
                                        onChange={(e) => setDefaultValue(e.target.checked ? '1' : '0')}
                                        color="primary"
                                    />
                                    <Typography variant="body2">True</Typography>
                                </Box>
                            </Box>
                        ) : (
                            <TextField
                                label="Value"
                                value={defaultValue}
                                onChange={(e) => setDefaultValue(e.target.value)}
                                fullWidth
                                size="small"
                                type={sensorType === 'Number' ? 'number' : 'text'}
                                helperText="Enter the sensor value"
                            />
                        )}

                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Unit"
                                value={unit}
                                onChange={(e) => setUnit(e.target.value)}
                                size="small"
                                sx={{ flex: 1 }}
                                helperText="e.g., °C, %, m/s"
                            />

                            <TextField
                                label="Decimal Places"
                                type="number"
                                value={decimalPlaces}
                                onChange={(e) => setDecimalPlaces(parseInt(e.target.value) || 0)}
                                size="small"
                                sx={{ width: 120 }}
                                inputProps={{ min: 0, max: 10 }}
                                disabled={sensorType !== 'Number'}
                            />
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={handleCreateClose}
                        startIcon={<CancelIcon />}
                        disabled={creating}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        variant="contained"
                        startIcon={<SaveIcon />}
                        disabled={creating || !sensorName.trim() || !sensorTag.trim()}
                    >
                        {creating ? 'Creating...' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={editDialogOpen}
                onClose={handleEditClose}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Edit Custom Static Sensor</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        {error && (
                            <Alert severity="error" sx={{ mb: 2 }}>
                                {error}
                            </Alert>
                        )}

                        <TextField
                            label="Order"
                            type="number"
                            fullWidth
                            value={editOrder}
                            onChange={(e) => setEditOrder(e.target.value)}
                            size="small"
                            helperText="Display order for the sensor"
                        />

                        <TextField
                            label="Sensor Tag"
                            fullWidth
                            value={editSensorTag}
                            onChange={(e) => setEditSensorTag(e.target.value)}
                            size="small"
                            required
                            helperText="Unique identifier tag for the sensor"
                        />

                        <FormControl size="small" fullWidth>
                            <InputLabel>Sensor Type</InputLabel>
                            <Select
                                value={editSensorType}
                                label="Sensor Type"
                                onChange={(e) => setEditSensorType(e.target.value)}
                            >
                                {SENSOR_TYPES.map((type) => (
                                    <MenuItem key={type} value={type}>
                                        {type}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        {editSensorType === 'Color' ? (
                            <Box>
                                <Typography variant="caption" color="textSecondary" sx={{ mb: 0.5, display: 'block' }}>
                                    Color Value
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <input
                                        type="color"
                                        value={editValue || '#ffffff'}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        style={{
                                            width: '50px',
                                            height: '40px',
                                            padding: '2px',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    />
                                    <TextField
                                        value={editValue || '#ffffff'}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        placeholder="#ffffff"
                                        size="small"
                                        fullWidth
                                        inputProps={{
                                            style: {
                                                fontFamily: 'monospace',
                                                fontSize: '12px'
                                            }
                                        }}
                                    />
                                </Box>
                            </Box>
                        ) : editSensorType === 'Boolean' ? (
                            <Box>
                                <Typography variant="caption" color="textSecondary" sx={{ mb: 0.5, display: 'block' }}>
                                    Boolean Value
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2">False</Typography>
                                    <Switch
                                        checked={editValue === '1' || editValue === 'true'}
                                        onChange={(e) => setEditValue(e.target.checked ? '1' : '0')}
                                        color="primary"
                                    />
                                    <Typography variant="body2">True</Typography>
                                </Box>
                            </Box>
                        ) : (
                            <TextField
                                label="Value"
                                fullWidth
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                size="small"
                                type={editSensorType === 'Number' ? 'number' : 'text'}
                                helperText="Update the current value of the sensor"
                            />
                        )}

                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Unit"
                                value={editUnit}
                                onChange={(e) => setEditUnit(e.target.value)}
                                size="small"
                                sx={{ flex: 1 }}
                                helperText="e.g., °C, %, m/s"
                            />

                            <TextField
                                label="Decimal Places"
                                type="number"
                                value={editDecimalPlaces}
                                onChange={(e) => setEditDecimalPlaces(parseInt(e.target.value) || 0)}
                                size="small"
                                sx={{ width: 120 }}
                                inputProps={{ min: 0, max: 10 }}
                                disabled={editSensorType !== 'Number'}
                            />
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={handleEditClose}
                        startIcon={<CancelIcon />}
                        disabled={editing}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleEdit}
                        variant="contained"
                        startIcon={<SaveIcon />}
                        disabled={editing || !editSensorTag.trim()}
                    >
                        {editing ? 'Updating...' : 'Update'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};

export default Junction_CustomSensorCreator;