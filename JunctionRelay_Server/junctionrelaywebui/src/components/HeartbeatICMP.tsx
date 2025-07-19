import React from "react";
import { Typography, Paper, Alert } from "@mui/material";
import { HeartbeatComponentProps } from './HeartbeatProtocolSelector';

const HeartbeatICMP: React.FC<HeartbeatComponentProps> = ({ formData, onFormDataChange }) => {
    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>ICMP Ping Monitor</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Simple network connectivity check using ICMP ping.
            </Typography>

            <Alert severity="info" sx={{ mt: 2 }}>
                ICMP ping only verifies network connectivity. No additional configuration needed.
                Uses device IP address automatically.
            </Alert>
        </Paper>
    );
};

export default HeartbeatICMP;