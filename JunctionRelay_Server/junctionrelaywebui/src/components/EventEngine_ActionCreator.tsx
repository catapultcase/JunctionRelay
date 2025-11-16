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

import React, { useState, useEffect } from "react";
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Box, Paper, Typography, FormControl, InputLabel,
    Select, MenuItem, Alert, RadioGroup, FormControlLabel, Radio,
    SelectChangeEvent
} from "@mui/material";

// Icons
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import BoltIcon from '@mui/icons-material/Bolt';

interface EventAction {
    actionType: string;
    actionTargetSensorId: number | null;
    actionTargetSensorName?: string;
    actionTransform: string;
    actionStaticValue?: string;
    actionMqttTopic?: string;
    actionMqttPayload?: string;
    actionMqttServiceId?: number | null;
    actionMqttServiceName?: string;
    actionHttpUrl?: string;
    actionHttpMethod?: string;
    actionHttpPayload?: string;
}

interface Sensor {
    id: number;
    name: string;
    value: string;
    unit: string;
    deviceName?: string;
    componentName?: string;
    category?: string;
    isEventSensor?: boolean;
}

interface MqttService {
    id: number;
    name: string;
}

interface EventEngine_ActionCreatorProps {
    open: boolean;
    onClose: () => void;
    onAddAction: () => void;
    sensors: Sensor[];
    mqttServices: MqttService[];
    currentAction: EventAction;
    onUpdateAction: (action: EventAction) => void;
}

const PREDEFINED_STATIC_VALUES = ['true', 'false', '1', '0'];

const EventEngine_ActionCreator: React.FC<EventEngine_ActionCreatorProps> = ({
    open,
    onClose,
    onAddAction,
    sensors,
    mqttServices,
    currentAction,
    onUpdateAction
}) => {
    // Determine initial value mode and static value type from currentAction
    const getInitialValueMode = (): 'transform' | 'static' => {
        return currentAction.actionTransform === 'static' || currentAction.actionStaticValue ? 'static' : 'transform';
    };

    const getInitialStaticValueType = (): string => {
        if (!currentAction.actionStaticValue) return 'true';
        return PREDEFINED_STATIC_VALUES.includes(currentAction.actionStaticValue)
            ? currentAction.actionStaticValue
            : 'custom';
    };

    const getInitialCustomValue = (): string => {
        if (!currentAction.actionStaticValue) return '';
        return PREDEFINED_STATIC_VALUES.includes(currentAction.actionStaticValue)
            ? ''
            : currentAction.actionStaticValue;
    };

    const [valueMode, setValueMode] = useState<'transform' | 'static'>(getInitialValueMode());
    const [staticValueType, setStaticValueType] = useState<string>(getInitialStaticValueType());
    const [customStaticValue, setCustomStaticValue] = useState<string>(getInitialCustomValue());

    // Reset local state when dialog opens with new action
    useEffect(() => {
        if (open) {
            setValueMode(getInitialValueMode());
            setStaticValueType(getInitialStaticValueType());
            setCustomStaticValue(getInitialCustomValue());
        }
    }, [open, currentAction]);

    const updateField = (field: keyof EventAction, value: any) => {
        onUpdateAction({ ...currentAction, [field]: value });
    };

    const handleValueModeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const mode = e.target.value as 'transform' | 'static';
        setValueMode(mode);

        if (mode === 'static') {
            const staticVal = staticValueType === 'custom'
                ? customStaticValue
                : staticValueType;

            onUpdateAction({
                ...currentAction,
                actionTransform: 'static',
                actionStaticValue: staticVal || 'true'
            });
        } else {
            onUpdateAction({
                ...currentAction,
                actionTransform: currentAction.actionTransform === 'static' ? 'passthrough' : currentAction.actionTransform,
                actionStaticValue: ''
            });
        }
    };

    const handleStaticValueTypeChange = (e: SelectChangeEvent<string>) => {
        const type = e.target.value;
        setStaticValueType(type);

        if (type === 'custom') {
            updateField('actionStaticValue', customStaticValue || '');
        } else {
            updateField('actionStaticValue', type);
        }
    };

    const handleCustomValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setCustomStaticValue(value);
        updateField('actionStaticValue', value);
    };

    const handleAdd = () => {
        if (currentAction.actionType === 'update_event_sensor') {
            if (!currentAction.actionTargetSensorId) {
                alert('Please select a target sensor');
                return;
            }
        } else if (currentAction.actionType === 'mqtt_publish') {
            if (!currentAction.actionMqttServiceId) {
                alert('Please select an MQTT service');
                return;
            }
            if (!currentAction.actionMqttTopic) {
                alert('Please provide an MQTT topic');
                return;
            }
        } else if (currentAction.actionType === 'http_request') {
            if (!currentAction.actionHttpUrl) {
                alert('Please provide an HTTP URL');
                return;
            }
        }

        onAddAction();
    };

    const getSensor = (sensorId: number | null) => {
        if (!sensorId) return null;
        return sensors.find(s => s.id === sensorId);
    };

    const getMqttService = (serviceId: number | null) => {
        if (!serviceId) return null;
        return mqttServices.find(s => s.id === serviceId);
    };

    const getActionDescription = () => {
        switch (currentAction.actionType) {
            case 'update_event_sensor':
                return 'Updates a sensor value when the event is triggered. Useful for controlling devices or setting flags.';
            case 'mqtt_publish':
                return 'Publishes a message to an MQTT topic when the event is triggered. Great for integrations with other systems.';
            case 'http_request':
                return 'Makes an HTTP request when the event is triggered. Perfect for webhooks and API integrations.';
            default:
                return '';
        }
    };

    const getCurrentStaticValue = () => {
        if (staticValueType === 'custom') {
            return customStaticValue || '(empty)';
        }
        return staticValueType;
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BoltIcon color="primary" />
                    <Typography variant="h6">Add Action</Typography>
                </Box>
            </DialogTitle>

            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    <FormControl fullWidth required>
                        <InputLabel>Action Type</InputLabel>
                        <Select
                            value={currentAction.actionType}
                            onChange={(e) => updateField('actionType', e.target.value)}
                            label="Action Type"
                        >
                            <MenuItem value="update_event_sensor">Update Event Sensor</MenuItem>
                            <MenuItem value="mqtt_publish">MQTT Publish</MenuItem>
                        </Select>
                    </FormControl>

                    <Alert severity="info">
                        {getActionDescription()}
                    </Alert>

                    {currentAction.actionType === 'update_event_sensor' && (
                        <Paper sx={{ p: 2, backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                            <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                                Sensor Update Configuration
                            </Typography>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                                <FormControl fullWidth required>
                                    <InputLabel>Target Event Sensor</InputLabel>
                                    <Select
                                        value={currentAction.actionTargetSensorId || ''}
                                        onChange={(e) => updateField('actionTargetSensorId', Number(e.target.value))}
                                        label="Target Event Sensor"
                                        error={!currentAction.actionTargetSensorId}
                                    >
                                        <MenuItem value="">
                                            <em>Select a sensor</em>
                                        </MenuItem>
                                        {sensors.filter(s => s.isEventSensor).map((sensor) => (
                                            <MenuItem key={sensor.id} value={sensor.id}>
                                                {sensor.name} ({sensor.value} {sensor.unit})
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                <FormControl component="fieldset">
                                    <Typography variant="subtitle2" gutterBottom>
                                        Value Source
                                    </Typography>
                                    <RadioGroup
                                        row
                                        value={valueMode}
                                        onChange={handleValueModeChange}
                                    >
                                        <FormControlLabel
                                            value="transform"
                                            control={<Radio />}
                                            label="Transform Trigger Value"
                                        />
                                        <FormControlLabel
                                            value="static"
                                            control={<Radio />}
                                            label="Set Static Value"
                                        />
                                    </RadioGroup>
                                </FormControl>

                                {valueMode === 'transform' && (
                                    <FormControl fullWidth>
                                        <InputLabel>Transform</InputLabel>
                                        <Select
                                            value={currentAction.actionTransform === 'static' ? 'passthrough' : currentAction.actionTransform}
                                            onChange={(e) => updateField('actionTransform', e.target.value)}
                                            label="Transform"
                                        >
                                            <MenuItem value="passthrough">Pass Through</MenuItem>
                                            <MenuItem value="encoder_to_hsv_color">Encoder to HSV Color</MenuItem>
                                            <MenuItem value="encoder_to_brightness">Encoder to Brightness</MenuItem>
                                        </Select>
                                    </FormControl>
                                )}

                                {valueMode === 'static' && (
                                    <>
                                        <FormControl fullWidth>
                                            <InputLabel>Static Value</InputLabel>
                                            <Select
                                                value={staticValueType}
                                                onChange={handleStaticValueTypeChange}
                                                label="Static Value"
                                            >
                                                <MenuItem value="true">True</MenuItem>
                                                <MenuItem value="false">False</MenuItem>
                                                <MenuItem value="1">1</MenuItem>
                                                <MenuItem value="0">0</MenuItem>
                                                <MenuItem value="custom">Custom Value...</MenuItem>
                                            </Select>
                                        </FormControl>

                                        {staticValueType === 'custom' && (
                                            <TextField
                                                label="Custom Static Value"
                                                fullWidth
                                                value={customStaticValue}
                                                onChange={handleCustomValueChange}
                                                helperText="Enter any value (text, number, etc.)"
                                                placeholder="Enter custom value"
                                            />
                                        )}
                                    </>
                                )}

                                <Alert severity="info" sx={{ mt: 1 }}>
                                    {valueMode === 'transform'
                                        ? 'The trigger sensor value will be transformed and written to the target sensor.'
                                        : `The target sensor will be set to "${getCurrentStaticValue()}" when the event triggers.`}
                                </Alert>
                            </Box>
                        </Paper>
                    )}

                    {currentAction.actionType === 'mqtt_publish' && (
                        <Paper sx={{ p: 2, backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                            <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                                MQTT Publish Configuration
                            </Typography>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                                <FormControl fullWidth required>
                                    <InputLabel>MQTT Service</InputLabel>
                                    <Select
                                        value={currentAction.actionMqttServiceId || ''}
                                        onChange={(e) => updateField('actionMqttServiceId', Number(e.target.value))}
                                        label="MQTT Service"
                                        error={!currentAction.actionMqttServiceId}
                                    >
                                        <MenuItem value="">
                                            <em>Select a service</em>
                                        </MenuItem>
                                        {mqttServices.map((service) => (
                                            <MenuItem key={service.id} value={service.id}>
                                                {service.name}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                <TextField
                                    label="MQTT Topic"
                                    fullWidth
                                    required
                                    value={currentAction.actionMqttTopic || ''}
                                    onChange={(e) => updateField('actionMqttTopic', e.target.value)}
                                    error={!currentAction.actionMqttTopic}
                                    helperText="The MQTT topic to publish to"
                                />

                                <TextField
                                    label="MQTT Payload"
                                    fullWidth
                                    multiline
                                    rows={4}
                                    value={currentAction.actionMqttPayload || ''}
                                    onChange={(e) => updateField('actionMqttPayload', e.target.value)}
                                    helperText="Use {sensor_value} and {timestamp} as placeholders"
                                    placeholder='{"value": "{sensor_value}", "timestamp": "{timestamp}"}'
                                />
                            </Box>
                        </Paper>
                    )}

                    {currentAction.actionType === 'http_request' && (
                        <Paper sx={{ p: 2, backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                            <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                                HTTP Request Configuration
                            </Typography>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                                <TextField
                                    label="HTTP URL"
                                    fullWidth
                                    required
                                    value={currentAction.actionHttpUrl || ''}
                                    onChange={(e) => updateField('actionHttpUrl', e.target.value)}
                                    error={!currentAction.actionHttpUrl}
                                    helperText="The full URL to send the request to"
                                    placeholder="https://example.com/webhook"
                                />

                                <FormControl fullWidth>
                                    <InputLabel>HTTP Method</InputLabel>
                                    <Select
                                        value={currentAction.actionHttpMethod || 'POST'}
                                        onChange={(e) => updateField('actionHttpMethod', e.target.value)}
                                        label="HTTP Method"
                                    >
                                        <MenuItem value="GET">GET</MenuItem>
                                        <MenuItem value="POST">POST</MenuItem>
                                        <MenuItem value="PUT">PUT</MenuItem>
                                        <MenuItem value="PATCH">PATCH</MenuItem>
                                    </Select>
                                </FormControl>

                                <TextField
                                    label="HTTP Payload"
                                    fullWidth
                                    multiline
                                    rows={4}
                                    value={currentAction.actionHttpPayload || ''}
                                    onChange={(e) => updateField('actionHttpPayload', e.target.value)}
                                    helperText="Use {sensor_value} and {timestamp} as placeholders"
                                    placeholder='{"value": "{sensor_value}", "timestamp": "{timestamp}"}'
                                />
                            </Box>
                        </Paper>
                    )}

                    <Paper sx={{ p: 2, bgcolor: 'success.lighter' }}>
                        <Typography variant="subtitle2" gutterBottom>
                            Action Summary
                        </Typography>
                        <Typography variant="body2">
                            {currentAction.actionType === 'update_event_sensor' && currentAction.actionTargetSensorId && (
                                <>
                                    Will update <strong>{getSensor(currentAction.actionTargetSensorId)?.name || 'selected sensor'}</strong>
                                    {valueMode === 'static' ? (
                                        <> to static value <strong>{getCurrentStaticValue()}</strong>.</>
                                    ) : (
                                        <> with transformed trigger value using <strong>{currentAction.actionTransform}</strong> transform.</>
                                    )}
                                </>
                            )}
                            {currentAction.actionType === 'mqtt_publish' && currentAction.actionMqttServiceId && currentAction.actionMqttTopic && (
                                <>
                                    Will publish to <strong>{currentAction.actionMqttTopic}</strong> on
                                    <strong> {getMqttService(currentAction.actionMqttServiceId)?.name || 'selected service'}</strong>.
                                </>
                            )}
                            {currentAction.actionType === 'http_request' && currentAction.actionHttpUrl && (
                                <>
                                    Will send <strong>{currentAction.actionHttpMethod}</strong> request to
                                    <strong> {currentAction.actionHttpUrl}</strong>.
                                </>
                            )}
                            {currentAction.actionType === 'update_event_sensor' && !currentAction.actionTargetSensorId && (
                                'Please configure the action to see a summary.'
                            )}
                            {currentAction.actionType === 'mqtt_publish' && (!currentAction.actionMqttServiceId || !currentAction.actionMqttTopic) && (
                                'Please configure the action to see a summary.'
                            )}
                            {currentAction.actionType === 'http_request' && !currentAction.actionHttpUrl && (
                                'Please configure the action to see a summary.'
                            )}
                        </Typography>
                    </Paper>
                </Box>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} startIcon={<CloseIcon />}>
                    Close
                </Button>
                <Button
                    onClick={handleAdd}
                    variant="contained"
                    color="primary"
                    startIcon={<AddIcon />}
                >
                    Add Action
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default EventEngine_ActionCreator;