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

import React, { useCallback } from 'react';
import { Paper, Typography, FormControlLabel, Switch, TextField } from '@mui/material';

interface ValueGeneratorProps {
    /** Whether test bindings are enabled */
    testBindingsEnabled: boolean;

    /** Test bindings interval in milliseconds */
    testBindingsInterval: number;

    /** Callback when enabled state changes */
    onEnabledChange: (enabled: boolean) => void;

    /** Callback when interval changes */
    onIntervalChange: (interval: number) => void;
}

/**
 * Value Generator Card Component
 *
 * Displays controls for enabling/disabling automated value generation
 * and configuring the generation interval.
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Component <500 lines (currently ~120 lines)
 * - Section 2.2: Stable callback references with useCallback
 * - Section 6.2: Component-level memoization with React.memo
 */
const ValueGenerator: React.FC<ValueGeneratorProps> = ({
    testBindingsEnabled,
    testBindingsInterval,
    onEnabledChange,
    onIntervalChange
}) => {
    /**
     * Handle interval change with validation
     * OPTIMIZATION: Memoized callback to prevent re-creation
     */
    const handleIntervalChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newInterval = Math.max(100, parseInt(e.target.value) || 5000);
        onIntervalChange(newInterval);
    }, [onIntervalChange]);

    return (
        <Paper
            elevation={0}
            sx={{
                p: 1.5,
                border: 1,
                borderColor: testBindingsEnabled ? 'primary.main' : 'divider',
                bgcolor: testBindingsEnabled ? 'action.selected' : 'background.paper'
            }}
        >
            <Typography variant="caption" fontWeight="bold" display="block" mb={1}>
                Value Generator
            </Typography>

            <FormControlLabel
                control={
                    <Switch
                        checked={testBindingsEnabled}
                        onChange={(e) => onEnabledChange(e.target.checked)}
                        size="small"
                    />
                }
                label={
                    <Typography variant="caption">
                        {testBindingsEnabled ? 'Enabled' : 'Disabled'}
                    </Typography>
                }
                sx={{ mb: 1, ml: 0 }}
            />

            <TextField
                label="Interval (ms)"
                type="number"
                value={testBindingsInterval}
                onChange={handleIntervalChange}
                disabled={testBindingsEnabled}
                size="small"
                fullWidth
                inputProps={{ min: 100, step: 100 }}
                sx={{
                    '& input': { fontFamily: 'monospace', fontSize: '12px' }
                }}
                helperText={testBindingsEnabled ? 'Disable to change interval' : 'Random values updated at this interval'}
            />
        </Paper>
    );
};

export default React.memo(ValueGenerator);
