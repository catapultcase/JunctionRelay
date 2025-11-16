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

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    Box,
    Button,
    Card,
    CardContent,
    CircularProgress,
    Typography,
    TextField,
    Divider,
    Paper,
    Chip,
    Alert,
    Snackbar,
    Switch,
    FormControlLabel,
    IconButton,
} from "@mui/material";

// Import sub-components
import EventEngine_TriggerCreator from "../components/EventEngine_TriggerCreator";
import EventEngine_ActionCreator from "../components/EventEngine_ActionCreator";
import EventEngine_SensorSelector from "../components/EventEngine_SensorSelector";

// Icons
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RuleIcon from '@mui/icons-material/Rule';
import SensorsIcon from '@mui/icons-material/Sensors';
import EditIcon from '@mui/icons-material/Edit';

const ConfigureEventRule = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [eventRule, setEventRule] = useState<any>(null);
    const [error, setError] = useState("");

    // Dialog states
    const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
    const [actionDialogOpen, setActionDialogOpen] = useState(false);
    const [sensorSelectorOpen, setSensorSelectorOpen] = useState(false);
    const [sensorSelectorContext, setSensorSelectorContext] = useState<{
        type: 'trigger' | 'action';
        index: number;
    } | null>(null);

    // Track if we're editing an existing action or adding a new one
    const [editingActionIndex, setEditingActionIndex] = useState<number | null>(null);

    // Current action being configured in the dialog
    const [currentAction, setCurrentAction] = useState<any>({
        actionType: 'update_event_sensor',
        actionTargetSensorId: null,
        actionTransform: 'passthrough',
        actionStaticValue: '',
        actionMqttTopic: '',
        actionMqttPayload: '',
        actionMqttServiceId: null,
        actionHttpUrl: '',
        actionHttpMethod: 'POST',
        actionHttpPayload: ''
    });

    // Data states
    const [sensors, setSensors] = useState<any[]>([]);
    const [mqttServices, setMqttServices] = useState<any[]>([]);

    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "info" | "warning">("success");

    const showSnackbar = (message: string, severity: "success" | "error" | "info" | "warning" = "success") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    };

    const updateEventRuleFieldWithSave = async (field: string, value: any) => {
        const updatedRule = { ...eventRule, [field]: value };
        setEventRule(updatedRule);
        await updateEventRule(updatedRule);
    };

    const updateEventRule = async (ruleToUpdate: any, showNotification: boolean = true) => {
        setSaving(true);
        try {
            const response = await fetch(`/api/eventrules/${id}`, {
                method: 'PUT',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(ruleToUpdate),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to update event rule: ${errorText}`);
            }

            const savedRule = await response.json();
            setEventRule(savedRule);
            if (showNotification) {
                showSnackbar("Changes saved", "success");
            }
        } catch (err: any) {
            showSnackbar(`Error saving: ${err.message}`, "error");
            console.error("Error updating event rule:", err);
        } finally {
            setSaving(false);
        }
    };

    const fetchEventRule = useCallback(async () => {
        try {
            const response = await fetch(`/api/eventrules/${id}`);
            if (!response.ok) throw new Error('Failed to fetch event rule');
            const data = await response.json();
            setEventRule(data);
        } catch (err) {
            setError("Error fetching event rule data.");
            console.error("Error fetching event rule:", err);
        }
    }, [id]);

    const fetchSensors = useCallback(async () => {
        try {
            const response = await fetch('/api/sensors');
            if (!response.ok) throw new Error('Failed to fetch sensors');
            const data = await response.json();
            setSensors(data);
        } catch (err) {
            console.error("Error fetching sensors:", err);
        }
    }, []);

    const fetchMqttServices = useCallback(async () => {
        try {
            const response = await fetch('/api/services?type=MQTT');
            if (!response.ok) throw new Error('Failed to fetch MQTT services');
            const data = await response.json();
            setMqttServices(data);
        } catch (err) {
            console.error("Error fetching MQTT services:", err);
        }
    }, []);

    useEffect(() => {
        const load = async () => {
            await Promise.all([
                fetchEventRule(),
                fetchSensors(),
                fetchMqttServices()
            ]);
            setLoading(false);
        };

        load();
    }, [id, fetchEventRule, fetchSensors, fetchMqttServices]);

    const handleBack = () => navigate("/eventengine");

    const handleDeleteEventRule = async () => {
        if (window.confirm(`Are you sure you want to delete the event rule "${eventRule?.name}"? This action cannot be undone.`)) {
            try {
                setLoading(true);
                const response = await fetch(`/api/eventrules/${id}`, {
                    method: "DELETE"
                });

                if (response.ok) {
                    showSnackbar("Event rule deleted successfully", "success");
                    setTimeout(() => {
                        navigate("/eventengine");
                    }, 1500);
                } else {
                    throw new Error(`Failed to delete event rule`);
                }
            } catch (err: any) {
                showSnackbar(`Error deleting event rule: ${err.message}`, "error");
                setLoading(false);
            }
        }
    };

    const handleTestEventRule = () => {
        showSnackbar("Testing event rule...", "info");
        // TODO: Implement test functionality
    };

    // Handler for updating triggers from TriggerCreator
    const handleUpdateTriggers = async (triggers: any[], logic: string) => {
        const updatedRule = {
            ...eventRule,
            triggers,
            triggerLogic: logic
        };
        setEventRule(updatedRule);
        await updateEventRule(updatedRule, false); // Don't show notification for bulk updates in dialog
    };

    // Handler for deleting a single trigger
    const handleDeleteTrigger = async (index: number) => {
        if (window.confirm('Are you sure you want to delete this trigger?')) {
            const triggers = eventRule.triggers.filter((_: any, i: number) => i !== index);
            // Re-order remaining triggers
            triggers.forEach((trigger: any, i: number) => {
                trigger.triggerOrder = i;
            });
            const updatedRule = {
                ...eventRule,
                triggers
            };
            setEventRule(updatedRule);
            await updateEventRule(updatedRule);
            showSnackbar("Trigger deleted", "success");
        }
    };

    // Handler for updating action from ActionCreator
    const handleUpdateAction = (action: any) => {
        setCurrentAction(action);
    };

    // Open action dialog for adding a new action
    const handleOpenAddAction = () => {
        setEditingActionIndex(null);
        setCurrentAction({
            actionType: 'update_event_sensor',
            actionTargetSensorId: null,
            actionTransform: 'passthrough',
            actionStaticValue: '',
            actionMqttTopic: '',
            actionMqttPayload: '',
            actionMqttServiceId: null,
            actionHttpUrl: '',
            actionHttpMethod: 'POST',
            actionHttpPayload: ''
        });
        setActionDialogOpen(true);
    };

    // Open action dialog for editing an existing action
    const handleOpenEditAction = (index: number) => {
        setEditingActionIndex(index);
        setCurrentAction({ ...eventRule.actions[index] });
        setActionDialogOpen(true);
    };

    // Handler for saving action (add or update)
    const handleSaveAction = async () => {
        const actions = [...(eventRule.actions || [])];

        if (editingActionIndex !== null) {
            // Update existing action
            actions[editingActionIndex] = currentAction;
        } else {
            // Add new action
            actions.push(currentAction);
        }

        const updatedRule = {
            ...eventRule,
            actions
        };
        setEventRule(updatedRule);

        setActionDialogOpen(false);
        setEditingActionIndex(null);

        await updateEventRule(updatedRule);
        showSnackbar(editingActionIndex !== null ? "Action updated" : "Action added", "success");
    };

    // Handler for deleting an action
    const handleDeleteAction = async (index: number) => {
        if (window.confirm('Are you sure you want to delete this action?')) {
            const actions = eventRule.actions.filter((_: any, i: number) => i !== index);
            const updatedRule = {
                ...eventRule,
                actions
            };
            setEventRule(updatedRule);
            await updateEventRule(updatedRule);
            showSnackbar("Action deleted", "success");
        }
    };

    // Handler for opening sensor selector
    const handleOpenSensorSelector = (triggerIndex: number) => {
        setSensorSelectorContext({ type: 'trigger', index: triggerIndex });
        setSensorSelectorOpen(true);
    };

    // Handler for selecting sensor
    const handleSelectSensor = async (sensorId: number) => {
        if (!sensorSelectorContext) return;

        if (sensorSelectorContext.type === 'trigger') {
            const triggers = [...(eventRule.triggers || [])];
            const trigger = triggers[sensorSelectorContext.index];
            if (trigger) {
                const sensor = sensors.find(s => s.id === sensorId);
                trigger.triggerSensorId = sensorId;
                trigger.triggerSensorName = sensor?.name;

                const updatedRule = { ...eventRule, triggers };
                setEventRule(updatedRule);

                // Save the changes
                await updateEventRule(updatedRule, false); // Silent save in dialog
            }
        }

        setSensorSelectorOpen(false);
        setSensorSelectorContext(null);
    };

    // Toggle enabled state
    const handleToggleEnabled = async (checked: boolean) => {
        const updatedRule = { ...eventRule, enabled: checked };
        setEventRule(updatedRule);
        await updateEventRule(updatedRule);
    };

    // Bottom action bar event listeners
    useEffect(() => {
        const handleBottomActionBack = () => handleBack();
        const handleBottomActionTestEventRule = () => handleTestEventRule();
        const handleBottomActionDelete = () => handleDeleteEventRule();

        window.addEventListener('bottom-action-back', handleBottomActionBack);
        window.addEventListener('bottom-action-test-eventrule', handleBottomActionTestEventRule);
        window.addEventListener('bottom-action-delete', handleBottomActionDelete);

        return () => {
            window.removeEventListener('bottom-action-back', handleBottomActionBack);
            window.removeEventListener('bottom-action-test-eventrule', handleBottomActionTestEventRule);
            window.removeEventListener('bottom-action-delete', handleBottomActionDelete);
        };
    }, [eventRule]);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Loading...</Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: 2 }}>
                <Typography color="error">{error}</Typography>
                <Button variant="outlined" onClick={handleBack} sx={{ mt: 2 }}>
                    Back to Event Engine
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 1, md: 2 } }}>
            {/* Header */}
            <Box sx={{
                display: "flex",
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: "space-between",
                alignItems: { xs: 'stretch', sm: 'center' },
                mb: 3,
                gap: 2
            }}>
                <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', md: '2rem' } }}>
                    Configure Event Rule
                </Typography>

                <Box sx={{
                    display: "flex",
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 1
                }}>
                    <Button
                        variant="outlined"
                        startIcon={<ArrowBackIcon />}
                        onClick={handleBack}
                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                    >
                        Back to Event Engine
                    </Button>

                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={handleDeleteEventRule}
                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                    >
                        Delete Rule
                    </Button>
                </Box>
            </Box>

            {/* Rule Information Card */}
            <Card elevation={2} sx={{ mb: 3 }}>
                <CardContent>
                    <Box sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        justifyContent: 'space-between',
                        alignItems: { xs: 'stretch', sm: 'center' },
                        mb: 2,
                        gap: 2
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <RuleIcon />
                            <Typography variant="h6">
                                {eventRule?.name || 'Event Rule'}
                            </Typography>
                            {eventRule?.enabled !== undefined && (
                                <Chip
                                    label={eventRule.enabled ? "Enabled" : "Disabled"}
                                    color={eventRule.enabled ? "success" : "default"}
                                    size="small"
                                />
                            )}
                        </Box>

                        {/* Show saving indicator */}
                        {saving && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CircularProgress size={20} />
                                <Typography variant="body2" color="text.secondary">
                                    Saving...
                                </Typography>
                            </Box>
                        )}
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Rule Settings Section */}
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                            Rule Settings
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <TextField
                                label="Rule Name"
                                value={eventRule?.name || ''}
                                onChange={(e) => updateEventRuleFieldWithSave('name', e.target.value)}
                                size="small"
                                required
                                fullWidth
                            />

                            <TextField
                                label="Description (Optional)"
                                value={eventRule?.description || ''}
                                onChange={(e) => updateEventRuleFieldWithSave('description', e.target.value)}
                                size="small"
                                multiline
                                rows={2}
                                fullWidth
                                placeholder="Describe what this event rule does"
                            />
                        </Box>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Rule Enabled Toggle */}
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                            Rule Status
                        </Typography>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={eventRule?.enabled ?? false}
                                    onChange={(e) => handleToggleEnabled(e.target.checked)}
                                />
                            }
                            label={
                                <Box>
                                    <Typography variant="body2">
                                        Rule {eventRule?.enabled ? 'Enabled' : 'Disabled'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {eventRule?.enabled
                                            ? 'This rule is actively monitoring triggers'
                                            : 'This rule will not fire until enabled'
                                        }
                                    </Typography>
                                </Box>
                            }
                        />
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Triggers Section */}
                    <Box sx={{ mb: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
                                Triggers ({eventRule?.triggerLogic || 'ANY'} logic)
                            </Typography>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<SensorsIcon />}
                                onClick={() => setTriggerDialogOpen(true)}
                            >
                                Configure Triggers
                            </Button>
                        </Box>

                        <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
                            {eventRule?.triggers?.length > 0 ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {eventRule.triggers.map((trigger: any, index: number) => {
                                        const sensor = sensors.find(s => s.id === trigger.triggerSensorId);
                                        const conditionMap: { [key: string]: string } = {
                                            'equals': '==',
                                            'not_equals': '!=',
                                            'greater_than': '>',
                                            'less_than': '<',
                                            'greater_than_or_equal': '>=',
                                            'less_than_or_equal': '<=',
                                            'contains': 'contains',
                                            'changed': 'changes'
                                        };
                                        const conditionText = conditionMap[trigger.triggerCondition] || trigger.triggerCondition;

                                        return (
                                            <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    • {sensor?.name || 'Unknown sensor'} {conditionText} {trigger.triggerCondition !== 'changed' ? trigger.triggerValue : ''}
                                                    {trigger.triggerDebounceMs > 0 && ` (debounce: ${trigger.triggerDebounceMs}ms)`}
                                                </Typography>
                                                <Box>
                                                    <IconButton size="small" onClick={() => setTriggerDialogOpen(true)}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                    <IconButton size="small" color="error" onClick={() => handleDeleteTrigger(index)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            </Box>
                                        );
                                    })}
                                </Box>
                            ) : (
                                <Typography variant="body2" color="text.secondary" align="center">
                                    No triggers configured yet
                                </Typography>
                            )}
                        </Paper>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Actions Section */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
                                Actions
                            </Typography>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={handleOpenAddAction}
                            >
                                Add Action
                            </Button>
                        </Box>

                        <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
                            {eventRule?.actions?.length > 0 ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {eventRule.actions.map((action: any, index: number) => {
                                        let actionText = '';

                                        if (action.actionType === 'update_event_sensor') {
                                            const targetSensor = sensors.find(s => s.id === action.actionTargetSensorId);
                                            const sensorName = targetSensor?.name || 'Unknown sensor';

                                            if (action.actionTransform === 'static') {
                                                actionText = `Set ${sensorName} to "${action.actionStaticValue}"`;
                                            } else {
                                                const transformMap: { [key: string]: string } = {
                                                    'passthrough': 'trigger value',
                                                    'encoder_to_hsv_color': 'HSV color from encoder',
                                                    'encoder_to_brightness': 'brightness from encoder'
                                                };
                                                const transformText = transformMap[action.actionTransform] || action.actionTransform;
                                                actionText = `Update ${sensorName} with ${transformText}`;
                                            }
                                        } else if (action.actionType === 'mqtt_publish') {
                                            const mqttService = mqttServices.find(s => s.id === action.actionMqttServiceId);
                                            actionText = `Publish to MQTT topic "${action.actionMqttTopic}" on ${mqttService?.name || 'Unknown service'}`;
                                        } else if (action.actionType === 'http_request') {
                                            actionText = `Send ${action.actionHttpMethod} request to ${action.actionHttpUrl}`;
                                        }

                                        return (
                                            <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    • {actionText}
                                                </Typography>
                                                <Box>
                                                    <IconButton size="small" onClick={() => handleOpenEditAction(index)}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                    <IconButton size="small" color="error" onClick={() => handleDeleteAction(index)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            </Box>
                                        );
                                    })}
                                </Box>
                            ) : (
                                <Typography variant="body2" color="text.secondary" align="center">
                                    No actions configured yet
                                </Typography>
                            )}
                        </Paper>
                    </Box>
                </CardContent>
            </Card>

            {/* Info Alert */}
            <Alert severity="info" sx={{ mb: 3 }}>
                Event rules monitor sensor values and execute actions when trigger conditions are met.
                Configure triggers to define when the rule should fire, and actions to specify what should happen.
            </Alert>

            {/* Snackbar */}
            <Snackbar
                open={snackbarOpen}
                autoHideDuration={3000}
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert severity={snackbarSeverity} onClose={() => setSnackbarOpen(false)}>
                    {snackbarMessage}
                </Alert>
            </Snackbar>

            {/* Trigger Creator Dialog */}
            <EventEngine_TriggerCreator
                open={triggerDialogOpen}
                onClose={() => setTriggerDialogOpen(false)}
                triggers={eventRule?.triggers || []}
                triggerLogic={eventRule?.triggerLogic || 'ANY'}
                sensors={sensors}
                onOpenSensorSelector={handleOpenSensorSelector}
                onUpdateTriggers={handleUpdateTriggers}
            />

            {/* Action Creator Dialog */}
            <EventEngine_ActionCreator
                open={actionDialogOpen}
                onClose={() => {
                    setActionDialogOpen(false);
                    setEditingActionIndex(null);
                }}
                onAddAction={handleSaveAction}
                sensors={sensors}
                mqttServices={mqttServices}
                currentAction={currentAction}
                onUpdateAction={handleUpdateAction}
            />

            {/* Sensor Selector Dialog */}
            <EventEngine_SensorSelector
                open={sensorSelectorOpen}
                onClose={() => {
                    setSensorSelectorOpen(false);
                    setSensorSelectorContext(null);
                }}
                onSelect={handleSelectSensor}
                sensors={sensors}
                selectedSensorId={
                    sensorSelectorContext?.type === 'trigger' && sensorSelectorContext?.index !== undefined
                        ? eventRule?.triggers?.[sensorSelectorContext.index]?.triggerSensorId
                        : null
                }
                title="Select Trigger Sensor"
                filterEventSensors={false}
            />
        </Box>
    );
};

export default ConfigureEventRule;