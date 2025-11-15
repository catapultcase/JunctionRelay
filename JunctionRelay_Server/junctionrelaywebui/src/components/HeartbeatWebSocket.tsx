import React from "react";
import { Box, Typography, Paper, TextField } from "@mui/material";
import { HeartbeatComponentProps } from './HeartbeatProtocolSelector';

const HeartbeatWebSocket: React.FC<HeartbeatComponentProps> = ({ formData, onFormDataChange }) => {
    const updateField = (field: string, value: any) => {
        console.log(`[HeartbeatWebSocket] Field change: ${field} = ${value}`);
        const updates: any = {};
        if (field === 'target') {
            updates.HeartbeatTarget = value;
            updates.heartbeatTarget = value;
        } else if (field === 'expected') {
            updates.HeartbeatExpectedValue = value;
            updates.heartbeatExpectedValue = value;
        } else {
            updates[field] = value;
        }
        onFormDataChange(updates);
    };

    // Extract current values with defaults
    const currentTarget = formData.HeartbeatTarget || formData.heartbeatTarget || '81';
    const currentExpected = formData.HeartbeatExpectedValue || formData.heartbeatExpectedValue || 'ok';

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>WebSocket Heartbeat</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Monitor device health through WebSocket connection with MAC address verification for security.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                    label="WebSocket Target"
                    value={currentTarget}
                    onChange={(e) => updateField('target', e.target.value)}
                    placeholder="81"
                    size="small"
                    helperText="Port number (81), full URL (ws://ip:81/), or path (/ws)"
                />

                <TextField
                    label="Expected Status Value"
                    value={currentExpected}
                    onChange={(e) => updateField('expected', e.target.value)}
                    placeholder="ok"
                    size="small"
                    helperText="Expected value in heartbeat response status field (leave 'ok' for MAC verification)"
                />

                <Box sx={{ mt: 1, p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        <strong>Enhanced WebSocket Heartbeat Protocol:</strong><br />
                        • Sends "heartbeat" message to device<br />
                        • Expects JSON response with MAC address verification<br />
                        • Includes diagnostic data (uptime, memory, firmware)<br />
                        <br />
                        <strong>Response Format:</strong><br />
                        {`{`}<br />
                        &nbsp;&nbsp;"type": "heartbeat-response",<br />
                        &nbsp;&nbsp;"status": "ok",<br />
                        &nbsp;&nbsp;"mac": "DC:54:75:EB:BD:60",<br />
                        &nbsp;&nbsp;"ip": "192.168.1.100",<br />
                        &nbsp;&nbsp;"uptime": 12345,<br />
                        &nbsp;&nbsp;"freeHeap": 45678<br />
                        {`}`}<br />
                        <br />
                        <strong>Security:</strong> MAC address must match device UniqueIdentifier<br />
                        <strong>Library:</strong> WebSocketsServer on ESP32 (port 81 default)
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
};

export default HeartbeatWebSocket;