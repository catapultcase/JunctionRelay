import React from "react";
import { Box, Typography, Paper, TextField } from "@mui/material";
import { HeartbeatComponentProps } from './HeartbeatProtocolSelector';

const HeartbeatMQTT: React.FC<HeartbeatComponentProps> = ({ formData, onFormDataChange }) => {
    // Use consistent field names - match parent's expectation
    const updateField = (field: string, value: any) => {
        console.log(`[HeartbeatMQTT] Field change: ${field} = ${value}`);

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
    const currentTarget = formData.HeartbeatTarget || formData.heartbeatTarget || 'junctionrelay/data';
    const currentExpected = formData.HeartbeatExpectedValue || formData.heartbeatExpectedValue || 'online';

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>MQTT Health Monitor</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Monitor device health through MQTT messages. Device publishes to the configured topic.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                    label="MQTT Topic"
                    value={currentTarget}
                    onChange={(e) => updateField('target', e.target.value)}
                    placeholder="junctionrelay/data"
                    size="small"
                    helperText="Topic where device publishes health status"
                />
                <TextField
                    label="Expected Message Contains"
                    value={currentExpected}
                    onChange={(e) => updateField('expected', e.target.value)}
                    placeholder="online"
                    size="small"
                    helperText="Text that should be present in MQTT messages"
                />

                <Box sx={{ mt: 1, p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        <strong>Example Message:</strong><br />
                        {`{"type":"sensor","status":"online","mac":"00:11:22:33:44:55","uptime":12345}`}
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
};

export default HeartbeatMQTT;