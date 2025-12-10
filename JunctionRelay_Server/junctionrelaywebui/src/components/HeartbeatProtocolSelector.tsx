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


import React, { useCallback, useRef } from "react";
import {
    Box, Typography, List, ListItemButton, ListItemIcon, ListItemText,
    Paper, useTheme, useMediaQuery, ToggleButtonGroup, ToggleButton,
    FormControlLabel, Switch, TextField
} from "@mui/material";
import HttpIcon from '@mui/icons-material/Http';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import WebIcon from '@mui/icons-material/Web';
import PingIcon from '@mui/icons-material/NetworkPing';
import TerminalIcon from '@mui/icons-material/Terminal';
import WifiIcon from '@mui/icons-material/Wifi';

// Import protocol components
import HeartbeatHTTP from './HeartbeatHTTP';
import HeartbeatMQTT from './HeartbeatMQTT';
import HeartbeatWebSocket from './HeartbeatWebSocket';
import HeartbeatICMP from './HeartbeatICMP';
import HeartbeatSSH from './HeartbeatSSH';
import HeartbeatESPNOW from './HeartbeatESPNOW';

export type HeartbeatProtocol = 'HTTP' | 'MQTT' | 'WebSocket' | 'ICMP' | 'SSH' | 'ESPNOW';

interface HeartbeatProtocolSelectorProps {
    selectedProtocol: HeartbeatProtocol;
    onProtocolChange: (protocol: HeartbeatProtocol) => void;
    formData: any;
    onFormDataChange: (data: any) => void;
}

export interface HeartbeatComponentProps {
    formData: any;
    onFormDataChange: (data: any) => void;
}

const HeartbeatProtocolSelector: React.FC<HeartbeatProtocolSelectorProps> = ({
    selectedProtocol,
    onProtocolChange,
    formData,
    onFormDataChange
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Ref to track if we're in unmount phase to prevent stale saves
    const isUnmountingRef = useRef(false);

    const protocols = [
        {
            protocol: 'HTTP' as HeartbeatProtocol,
            label: 'HTTP/HTTPS',
            icon: <HttpIcon />,
            description: 'REST API health checks'
        },
        {
            protocol: 'MQTT' as HeartbeatProtocol,
            label: 'MQTT',
            icon: <NetworkCheckIcon />,
            description: 'MQTT health messages'
        },
        {
            protocol: 'WebSocket' as HeartbeatProtocol,
            label: 'WebSocket',
            icon: <WebIcon />,
            description: 'Real-time connection'
        },
        {
            protocol: 'ICMP' as HeartbeatProtocol,
            label: 'ICMP Ping',
            icon: <PingIcon />,
            description: 'Simple network ping'
        },
        {
            protocol: 'SSH' as HeartbeatProtocol,
            label: 'SSH',
            icon: <TerminalIcon />,
            description: 'Linux system commands'
        },
        {
            protocol: 'ESPNOW' as HeartbeatProtocol,
            label: 'ESP-NOW',
            icon: <WifiIcon />,
            description: 'ESP-NOW wireless protocol'
        }
    ];

    // Handle stream as heartbeat toggle
    const handleStreamAsHeartbeatChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (isUnmountingRef.current) return;

        const enabled = event.target.checked;
        onFormDataChange({
            useStreamAsHeartbeat: enabled,
            UseStreamAsHeartbeat: enabled
        });
    }, [onFormDataChange]);

    // Handle stream heartbeat threshold change
    const handleStreamHeartbeatThresholdChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (isUnmountingRef.current) return;

        const value = parseInt(event.target.value) || 3000;
        onFormDataChange({
            streamHeartbeatThresholdMs: value,
            StreamHeartbeatThresholdMs: value
        });
    }, [onFormDataChange]);

    // Handle protocol change - simplified to prevent cascading saves
    const handleProtocolChange = useCallback((newProtocol: HeartbeatProtocol) => {
        console.log(`[HeartbeatProtocolSelector] Protocol change: ${selectedProtocol} -> ${newProtocol}`);

        if (isUnmountingRef.current) {
            console.log(`[HeartbeatProtocolSelector] Ignoring protocol change during unmount`);
            return;
        }

        // Define default values for each protocol
        const protocolDefaults: Record<HeartbeatProtocol, { target: string; expected: string }> = {
            'HTTP': { target: '/api/health/heartbeat', expected: 'OK' },
            'WebSocket': { target: '81', expected: 'ok' },
            'MQTT': { target: 'junctionrelay/data', expected: 'online' },
            'SSH': { target: 'uptime', expected: 'up' },
            'ICMP': { target: '', expected: '' },
            'ESPNOW': { target: '', expected: '' }
        };

        const defaults = protocolDefaults[newProtocol] || { target: '', expected: '' };

        console.log(`[HeartbeatProtocolSelector] Setting defaults for ${newProtocol}:`, defaults);

        // Update protocol AND reset target/expected values to protocol defaults
        const updates: any = {
            heartbeatProtocol: newProtocol,
            HeartbeatProtocol: newProtocol,
            heartbeatTarget: defaults.target,
            HeartbeatTarget: defaults.target,
            heartbeatExpectedValue: defaults.expected,
            HeartbeatExpectedValue: defaults.expected
        };

        // Send all updates at once
        onFormDataChange(updates);

        // Call parent protocol change handler
        onProtocolChange(newProtocol);
    }, [selectedProtocol, onProtocolChange, onFormDataChange]);

    // Handle changes from child components - pass through to parent
    const handleProtocolConfigChange = useCallback((updates: any) => {
        console.log(`[HeartbeatProtocolSelector] Child component update:`, updates);

        if (isUnmountingRef.current) {
            console.log(`[HeartbeatProtocolSelector] Ignoring config change during unmount`);
            return;
        }

        // Pass updates directly to parent without modification
        onFormDataChange(updates);
    }, [onFormDataChange]);

    // Create props for the current protocol component
    const getCurrentProtocolProps = useCallback((): HeartbeatComponentProps => {
        // Pass the current formData and change handler directly
        return {
            formData: formData,
            onFormDataChange: handleProtocolConfigChange
        };
    }, [formData, handleProtocolConfigChange]);

    const renderProtocolComponent = useCallback(() => {
        const commonProps = getCurrentProtocolProps();

        switch (selectedProtocol) {
            case 'HTTP':
                return <HeartbeatHTTP {...commonProps} />;
            case 'MQTT':
                return <HeartbeatMQTT {...commonProps} />;
            case 'WebSocket':
                return <HeartbeatWebSocket {...commonProps} />;
            case 'ICMP':
                return <HeartbeatICMP {...commonProps} />;
            case 'SSH':
                return <HeartbeatSSH {...commonProps} />;
            case 'ESPNOW':
                return <HeartbeatESPNOW {...commonProps} />;
            default:
                return <HeartbeatHTTP {...commonProps} />;
        }
    }, [selectedProtocol, getCurrentProtocolProps]);

    // Mark as unmounting when component is being destroyed
    React.useEffect(() => {
        return () => {
            isUnmountingRef.current = true;
        };
    }, []);

    // Get current values with fallbacks
    const useStreamAsHeartbeat = formData?.useStreamAsHeartbeat ?? formData?.UseStreamAsHeartbeat ?? true;
    const streamHeartbeatThresholdMs = formData?.streamHeartbeatThresholdMs ?? formData?.StreamHeartbeatThresholdMs ?? 3000;

    // Render stream heartbeat controls section
    const renderStreamHeartbeatControls = () => (
        <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
                Stream-Based Heartbeat
            </Typography>

            <FormControlLabel
                control={
                    <Switch
                        checked={useStreamAsHeartbeat}
                        onChange={handleStreamAsHeartbeatChange}
                        color="primary"
                    />
                }
                label="Consider Active Stream as Heartbeat"
                sx={{ mb: 1 }}
            />

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, ml: 4 }}>
                If enabled, a recent payload sent to this device will be considered a successful heartbeat.
                Uses the most recent successful stream from any screen with the lowest latency.
            </Typography>

            {/* Stream threshold input - only show if stream heartbeat is enabled */}
            {useStreamAsHeartbeat && (
                <Box sx={{ ml: 4, mb: 2 }}>
                    <TextField
                        label="Stream Heartbeat Threshold (ms)"
                        type="number"
                        value={streamHeartbeatThresholdMs}
                        onChange={handleStreamHeartbeatThresholdChange}
                        size="small"
                        slotProps={{
                            htmlInput: { min: 1000, max: 300000, step: 1000 }
                        }}
                        helperText="Time window to consider recent stream activity (1000-300000ms)"
                        sx={{ width: 280 }}
                    />
                </Box>
            )}
        </Paper>
    );

    // Mobile layout
    const renderMobileLayout = () => (
        <Box sx={{ mb: 2 }}>
            {renderStreamHeartbeatControls()}

            <ToggleButtonGroup
                value={selectedProtocol}
                exclusive
                onChange={(event, newProtocol) => {
                    if (newProtocol !== null) {
                        handleProtocolChange(newProtocol);
                    }
                }}
                orientation="vertical"
                fullWidth
                sx={{ gap: 1, mb: 2 }}
            >
                {protocols.map((protocol) => (
                    <ToggleButton
                        key={protocol.protocol}
                        value={protocol.protocol}
                        sx={{
                            py: 1.5,
                            display: 'flex',
                            justifyContent: 'flex-start',
                            alignItems: 'center',
                            gap: 2,
                            textAlign: 'left',
                            '&.Mui-selected': {
                                backgroundColor: 'primary.main',
                                color: 'primary.contrastText',
                            }
                        }}
                    >
                        {protocol.icon}
                        <Box sx={{ textAlign: 'left', flex: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                {protocol.label}
                            </Typography>
                            <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                {protocol.description}
                            </Typography>
                        </Box>
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>
            {renderProtocolComponent()}
        </Box>
    );

    // Desktop layout
    const renderDesktopLayout = () => (
        <Box>
            {renderStreamHeartbeatControls()}

            <Box sx={{ display: 'flex', gap: 2 }}>
                <Paper sx={{ width: 250, p: 0 }}>
                    <List sx={{ p: 0 }}>
                        {protocols.map((protocol, index) => (
                            <ListItemButton
                                key={protocol.protocol}
                                selected={selectedProtocol === protocol.protocol}
                                onClick={() => handleProtocolChange(protocol.protocol)}
                                sx={{
                                    borderBottom: index < protocols.length - 1 ? '1px solid' : 'none',
                                    borderColor: 'divider',
                                    py: 1.5,
                                    '&.Mui-selected': {
                                        backgroundColor: 'primary.main',
                                        color: 'primary.contrastText',
                                        '& .MuiListItemIcon-root': { color: 'inherit' }
                                    }
                                }}
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                    {protocol.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={protocol.label}
                                    secondary={
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                color: selectedProtocol === protocol.protocol
                                                    ? 'rgba(255,255,255,0.7)'
                                                    : 'text.secondary'
                                            }}
                                        >
                                            {protocol.description}
                                        </Typography>
                                    }
                                />
                            </ListItemButton>
                        ))}
                    </List>
                </Paper>
                <Box sx={{ flex: 1 }}>
                    {renderProtocolComponent()}
                </Box>
            </Box>
        </Box>
    );

    return isMobile ? renderMobileLayout() : renderDesktopLayout();
};

export default HeartbeatProtocolSelector;