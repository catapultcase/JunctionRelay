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
import { Box, Typography, Paper, TextField } from "@mui/material";
import { HeartbeatComponentProps } from './HeartbeatProtocolSelector';

const HeartbeatHTTP: React.FC<HeartbeatComponentProps> = ({ formData, onFormDataChange }) => {
    // Use consistent field names - match parent's expectation
    const updateField = (field: string, value: any) => {
        console.log(`[HeartbeatHTTP] Field change: ${field} = ${value}`);

        // Use PascalCase field names consistently
        const updates: any = {};
        if (field === 'target') {
            updates.HeartbeatTarget = value;
            updates.heartbeatTarget = value; // Keep both for compatibility
        } else if (field === 'expected') {
            updates.HeartbeatExpectedValue = value;
            updates.heartbeatExpectedValue = value; // Keep both for compatibility
        } else {
            updates[field] = value;
        }

        onFormDataChange(updates);
    };

    // Get current values with proper fallbacks
    const currentTarget = formData.HeartbeatTarget || formData.heartbeatTarget || '/api/health/heartbeat';
    const currentExpected = formData.HeartbeatExpectedValue || formData.heartbeatExpectedValue || 'OK';

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>HTTP Health Check</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Monitor device health through HTTP requests. Uses your device's built-in health endpoint.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                    label="Health Endpoint"
                    value={currentTarget}
                    onChange={(e) => updateField('target', e.target.value)}
                    placeholder="/api/health/heartbeat"
                    size="small"
                    helperText="Path to health check endpoint"
                />
                <TextField
                    label="Expected Response Contains"
                    value={currentExpected}
                    onChange={(e) => updateField('expected', e.target.value)}
                    placeholder="OK"
                    size="small"
                    helperText="Text that should be present in response"
                />

                <Box sx={{ mt: 1, p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        <strong>Example Response:</strong><br />
                        {`{"status":"OK","mac":"00:11:22:33:44:55","firmware":"1.0.0","uptime":12345,"free_heap":45678}`}
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
};

export default HeartbeatHTTP;