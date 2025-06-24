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
import { Box, Typography, Paper } from "@mui/material";
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { AuthComponentProps } from "./Settings_UserManagement";

const Settings_AuthNone: React.FC<AuthComponentProps> = ({ authStatus }) => {
    return (
        <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
                No Authentication (Offline Mode)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Open local access with no login required. Anyone with local network access can view and modify settings. This mode avoids online functionality and keeps everything local.
            </Typography>

            <Box sx={{
                p: 2,
                bgcolor: 'rgba(25, 118, 210, 0.08)',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'rgba(25, 118, 210, 0.23)',
                mb: 3
            }}>
                <Typography variant="body2" color="primary.main" sx={{ fontWeight: 'medium', display: 'flex', alignItems: 'center', mb: 1 }}>
                    <WifiOffIcon sx={{ mr: 1, fontSize: 18 }} />
                    Offline-First Design
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    This mode prioritizes local operation and avoids external API calls, version checks, and cloud services. Perfect for air-gapped or privacy-focused environments.
                </Typography>
            </Box>

            <Typography variant="subtitle2" gutterBottom>
                This mode is suitable for:
            </Typography>
            <Box component="ul" sx={{ margin: '8px 0', paddingLeft: '20px', color: 'text.secondary' }}>
                <li>Air-gapped networks and isolated environments</li>
                <li>Privacy-focused installations</li>
                <li>Home networks with trusted users only</li>
                <li>Testing and development environments</li>
                <li>Single-user installations</li>
                <li>Scenarios where online functionality is not desired</li>
            </Box>
        </Paper>
    );
};

export default Settings_AuthNone;