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
import {
    Box,
    Typography,
    Paper,
    Alert,
    Divider
} from "@mui/material";
import {
    Cable as CableIcon
} from "@mui/icons-material";

const Junction_Setup_COM_Advice: React.FC = () => {
    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CableIcon />
                COM Junction Setup Guidance
            </Typography>

            <Alert severity="info" sx={{ mb: 3 }}>
                <strong>Protocol Selection:</strong> Choose Native USB CDC for ESP32-S3 devices (high performance)
                or UART Bridge for legacy compatibility.
            </Alert>

            <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'medium' }}>
                    Native USB CDC (Recommended for ESP32-S3)
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    • Supports large payloads up to 400+ bytes<br />
                    • Fast intervals down to 50ms<br />
                    • Requires "USB CDC On Boot: Enabled" in Arduino IDE<br />
                    • Tested stable: 175-byte payloads at 100ms intervals
                </Typography>
            </Box>

            <Divider sx={{ mb: 3 }} />

            <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'medium' }}>
                    UART Bridge (Legacy/Compatibility)
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    • Maximum 100-byte payloads<br />
                    • Minimum 300ms intervals for stability<br />
                    • Use only for older devices<br />
                    • Limited performance capabilities
                </Typography>
            </Box>

            <Alert severity="warning" sx={{ mb: 3 }}>
                <strong>Performance Guidelines:</strong> Test thoroughly when using high payload sizes or fast intervals.
                Native USB may crash below 30ms intervals with large payloads.
            </Alert>

            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                    <strong>Recommended Starting Points:</strong><br />
                    • Native USB: 175 bytes, 100ms interval<br />
                    • UART Bridge: 75 bytes, 300ms interval<br />
                    • Always test your specific configuration under load
                </Typography>
            </Box>
        </Paper>
    );
};

export default Junction_Setup_COM_Advice;