/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import React, {  } from "react";
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Box, Paper, Typography, FormControl, InputLabel,
    Select, MenuItem, List, IconButton, Divider, Chip, Alert
} from "@mui/material";

// Icons
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import SensorsIcon from '@mui/icons-material/Sensors';
import type { Sensor } from '../types/entities';
import type { RuleTrigger } from '../types/events';

interface EventEngine_TriggerCreatorProps {
    open: boolean;
    onClose: () => void;
    triggers: RuleTrigger[];
    triggerLogic: string;
    sensors: Sensor[];
    onOpenSensorSelector: (triggerIndex: number) => void;
    onUpdateTriggers: (triggers: RuleTrigger[], logic: string) => void;
}

const EventEngine_TriggerCreator: React.FC<EventEngine_TriggerCreatorProps> = ({
    open,
    onClose,
    triggers,
    triggerLogic,
    sensors,
    onOpenSensorSelector,
    onUpdateTriggers
}) => {
    const handleAddTrigger = () => {
        const newTriggers = [
            ...triggers,
            {
                id: 0,
                eventRuleId: 0,
                isActive: true,
                triggerOrder: triggers.length,
                triggerType: 'Sensor',
                triggerSensorId: null,
                triggerCondition: 'equals',
                triggerValue: '',
                triggerDebounceMs: 0,
            }
        ];
        onUpdateTriggers(newTriggers, triggerLogic);
    };

    const handleRemoveTrigger = (index: number) => {
        const newTriggers = triggers.filter((_, i) => i !== index);
        // Re-order remaining triggers
        newTriggers.forEach((trigger, i) => {
            trigger.triggerOrder = i;
        });
        onUpdateTriggers(newTriggers, triggerLogic);
    };

    const handleUpdateTrigger = <K extends keyof RuleTrigger>(index: number, field: K, value: RuleTrigger[K]) => {
        const newTriggers = [...triggers];
        newTriggers[index] = {
            ...newTriggers[index],
            [field]: value
        };
        onUpdateTriggers(newTriggers, triggerLogic);
    };

    const handleUpdateLogic = (logic: string) => {
        onUpdateTriggers(triggers, logic);
    };

    const getSensor = (sensorId: number | null | undefined) => {
        if (!sensorId) return null;
        return sensors.find(s => s.id === sensorId);
    };


    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">Configure Triggers</Typography>
                    <FormControl sx={{ minWidth: 150 }} size="small">
                        <InputLabel>Trigger Logic</InputLabel>
                        <Select
                            value={triggerLogic}
                            onChange={(e) => handleUpdateLogic(e.target.value)}
                            label="Trigger Logic"
                        >
                            <MenuItem value="ANY">ANY (OR)</MenuItem>
                            <MenuItem value="ALL">ALL (AND)</MenuItem>
                        </Select>
                    </FormControl>
                </Box>
            </DialogTitle>

            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    {/* Info Alert */}
                    <Alert severity="info">
                        {triggerLogic === 'ANY'
                            ? 'The event will fire when ANY trigger condition is met (OR logic)'
                            : 'The event will fire only when ALL trigger conditions are met (AND logic)'
                        }
                    </Alert>

                    {/* Triggers List */}
                    {triggers.length === 0 ? (
                        <Paper sx={{ p: 3, textAlign: 'center' }}>
                            <Typography color="textSecondary" gutterBottom>
                                No triggers configured
                            </Typography>
                            <Button
                                variant="contained"
                                onClick={handleAddTrigger}
                                startIcon={<AddIcon />}
                                sx={{ mt: 2 }}
                            >
                                Add First Trigger
                            </Button>
                        </Paper>
                    ) : (
                        <List sx={{ maxHeight: 500, overflow: 'auto' }}>
                            {triggers.map((trigger, index) => {
                                const sensor = getSensor(trigger.triggerSensorId);

                                return (
                                    <Paper key={index} sx={{ p: 2, mb: 2, backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                Trigger {index + 1}
                                            </Typography>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleRemoveTrigger(index)}
                                                color="error"
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </Box>

                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            {/* Sensor Selection */}
                                            <Box>
                                                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                                                    Trigger Sensor *
                                                </Typography>
                                                <Button
                                                    variant="outlined"
                                                    fullWidth
                                                    startIcon={<SensorsIcon />}
                                                    onClick={() => {
                                                        onOpenSensorSelector(index);
                                                    }}
                                                    sx={{
                                                        justifyContent: 'flex-start',
                                                        textAlign: 'left',
                                                        border: !trigger.triggerSensorId ? '2px solid' : undefined,
                                                        borderColor: !trigger.triggerSensorId ? 'error.main' : undefined
                                                    }}
                                                >
                                                    {sensor ? (
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                                            <Typography sx={{ flex: 1 }}>{sensor.name}</Typography>
                                                            <Chip
                                                                label={`${sensor.value} ${sensor.unit}`}
                                                                size="small"
                                                                color="primary"
                                                            />
                                                        </Box>
                                                    ) : (
                                                        <Typography color="text.secondary">
                                                            Click to select sensor
                                                        </Typography>
                                                    )}
                                                </Button>
                                            </Box>

                                            {/* Condition Selection */}
                                            <FormControl fullWidth required>
                                                <InputLabel>Condition</InputLabel>
                                                <Select
                                                    value={trigger.triggerCondition}
                                                    onChange={(e) => handleUpdateTrigger(index, 'triggerCondition', e.target.value)}
                                                    label="Condition"
                                                >
                                                    <MenuItem value="equals">Equals (==)</MenuItem>
                                                    <MenuItem value="not_equals">Not Equals (!=)</MenuItem>
                                                    <MenuItem value="greater_than">Greater Than (&gt;)</MenuItem>
                                                    <MenuItem value="less_than">Less Than (&lt;)</MenuItem>
                                                    <MenuItem value="greater_than_or_equal">Greater Than or Equal (&gt;=)</MenuItem>
                                                    <MenuItem value="less_than_or_equal">Less Than or Equal (&lt;=)</MenuItem>
                                                    <MenuItem value="contains">Contains</MenuItem>
                                                    <MenuItem value="changed">Any Change</MenuItem>
                                                </Select>
                                            </FormControl>

                                            {/* Trigger Value - Only show if condition is not "changed" */}
                                            {trigger.triggerCondition !== 'changed' && (
                                                <TextField
                                                    label="Trigger Value"
                                                    fullWidth
                                                    required
                                                    value={trigger.triggerValue}
                                                    onChange={(e) => handleUpdateTrigger(index, 'triggerValue', e.target.value)}
                                                    helperText={`The value to compare ${sensor?.name || 'the sensor'} against`}
                                                    error={!trigger.triggerValue}
                                                />
                                            )}

                                            {/* Debounce */}
                                            <TextField
                                                label="Debounce (milliseconds)"
                                                fullWidth
                                                type="number"
                                                value={trigger.triggerDebounceMs}
                                                onChange={(e) => handleUpdateTrigger(index, 'triggerDebounceMs', Number(e.target.value))}
                                                helperText="Minimum time between triggers (prevents rapid firing)"
                                                inputProps={{ min: 0, step: 100 }}
                                            />
                                        </Box>

                                        {index < triggers.length - 1 && (
                                            <Divider sx={{ mt: 2 }}>
                                                <Chip
                                                    label={triggerLogic}
                                                    size="small"
                                                    color={triggerLogic === 'ALL' ? 'secondary' : 'default'}
                                                />
                                            </Divider>
                                        )}
                                    </Paper>
                                );
                            })}
                        </List>
                    )}

                    {/* Add Trigger Button */}
                    {triggers.length > 0 && (
                        <Button
                            variant="outlined"
                            onClick={handleAddTrigger}
                            startIcon={<AddIcon />}
                            fullWidth
                        >
                            Add Another Trigger
                        </Button>
                    )}

                    {/* Summary */}
                    {triggers.length > 0 && (
                        <Paper sx={{ p: 2, bgcolor: 'info.lighter' }}>
                            <Typography variant="subtitle2" gutterBottom>
                                Summary
                            </Typography>
                            <Typography variant="body2">
                                This event has {triggers.length} trigger{triggers.length !== 1 ? 's' : ''}.
                                {triggers.length > 1 && (
                                    <> It will fire when <strong>{triggerLogic === 'ANY' ? 'any one' : 'all'}</strong> of them {triggerLogic === 'ANY' ? 'is' : 'are'} met.</>
                                )}
                            </Typography>
                        </Paper>
                    )}
                </Box>
            </DialogContent>

            <DialogActions>
                <Button
                    onClick={() => {
                        onClose();
                    }}
                    startIcon={<CloseIcon />}
                >
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default EventEngine_TriggerCreator;