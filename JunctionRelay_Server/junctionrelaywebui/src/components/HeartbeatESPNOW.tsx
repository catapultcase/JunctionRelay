import React from "react";
import { Box, Typography, Paper, TextField, Alert } from "@mui/material";
import { HeartbeatComponentProps } from './HeartbeatProtocolSelector';

const HeartbeatESPNOW: React.FC<HeartbeatComponentProps> = ({ formData, onFormDataChange }) => {
    // Use consistent field names - match parent's expectation
    const updateField = (field: string, value: any) => {
        console.log(`[HeartbeatESPNOW] Field change: ${field} = ${value}`);
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

    // Get current values with proper fallbacks for ESP-NOW
    const currentTarget = formData.HeartbeatTarget || formData.heartbeatTarget || '';
    const currentExpected = formData.HeartbeatExpectedValue || formData.heartbeatExpectedValue || '';

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>ESP-NOW Health Check</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Monitor device health through ESP-NOW wireless communication. Uses stream activity as primary heartbeat method.
            </Typography>

            <Alert severity="info" sx={{ mb: 3 }}>
                <Typography variant="body2">
                    ESP-NOW devices rely on stream activity for heartbeat monitoring.
                    No direct ping connection is established - health is determined by recent data transmission activity.
                </Typography>
            </Alert>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                    label="ESP-NOW Channel (Optional)"
                    value={currentTarget}
                    onChange={(e) => updateField('target', e.target.value)}
                    placeholder="1"
                    size="small"
                    helperText="ESP-NOW communication channel (1-14). Leave empty for default."
                />

                <TextField
                    label="Expected MAC Format (Optional)"
                    value={currentExpected}
                    onChange={(e) => updateField('expected', e.target.value)}
                    placeholder="AA:BB:CC:DD:EE:FF"
                    size="small"
                    helperText="Expected MAC address format for validation. Leave empty to skip."
                />

                <Box sx={{ mt: 1, p: 2, bgcolor: 'rgba(25, 118, 210, 0.04)', borderRadius: 1, border: '1px solid rgba(25, 118, 210, 0.12)' }}>
                    <Typography variant="caption" color="text.secondary">
                        <strong>How ESP-NOW Heartbeat Works:</strong><br />
                        • Device communicates via ESP-NOW wireless protocol<br />
                        • Stream activity indicates device is alive and transmitting<br />
                        • No TCP/IP connection required<br />
                        • Lower power consumption than WiFi<br />
                        • Automatic mesh networking capabilities
                    </Typography>
                </Box>

                <Box sx={{ mt: 1, p: 2, bgcolor: 'rgba(255, 152, 0, 0.04)', borderRadius: 1, border: '1px solid rgba(255, 152, 0, 0.12)' }}>
                    <Typography variant="caption" color="text.secondary">
                        <strong>Requirements:</strong><br />
                        • Device must have "Use Stream as Heartbeat" enabled<br />
                        • Stream threshold should be set appropriately (recommended: 10-30 seconds for ESP-NOW)<br />
                        • Device MAC address must be configured in Unique Identifier field
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
};

export default HeartbeatESPNOW;