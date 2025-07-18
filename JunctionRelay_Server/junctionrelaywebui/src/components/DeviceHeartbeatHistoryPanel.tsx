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

import React from 'react';
import { Box, Typography } from '@mui/material';
import History from '@mui/icons-material/History';

interface DeviceHeartbeatHistoryPanelProps {
    deviceId: string;
}

const DeviceHeartbeatHistoryPanel: React.FC<DeviceHeartbeatHistoryPanelProps> = ({ deviceId }) => {
    return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
            <History sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
                Heartbeat History
            </Typography>
            <Typography variant="body2" color="text.secondary">
                This will show historical heartbeat data for device {deviceId}.
                Similar to Stream History with charts, logs, and filtering capabilities.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                Coming soon - real-time heartbeat monitoring and historical analysis
            </Typography>
        </Box>
    );
};

export default DeviceHeartbeatHistoryPanel;