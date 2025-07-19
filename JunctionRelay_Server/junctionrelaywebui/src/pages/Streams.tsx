/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024 present Jonathan Mills, CatapultCase
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

import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, TextField, Button, Chip, Alert, Snackbar,
    FormControl, InputLabel, Select, MenuItem, SelectChangeEvent, Divider,
    Card, CardContent, Tabs, Tab, useMediaQuery, useTheme
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DataObjectIcon from '@mui/icons-material/DataObject';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import StreamIcon from '@mui/icons-material/Stream';
import History from '@mui/icons-material/History';
import CompressIcon from '@mui/icons-material/Compress';
import { useDashboardWebSocket } from '../hooks/useDashboardWebSocket';

// Import the StreamHistory component
import StreamHistory from '../components/StreamHistory';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`stream-tabpanel-${index}`}
            aria-labelledby={`stream-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ pt: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

function a11yProps(index: number) {
    return {
        id: `stream-tab-${index}`,
        'aria-controls': `stream-tabpanel-${index}`,
    };
}

interface StreamData {
    streamKey: string | number;
    protocol?: string;
    deviceName?: string;
    screenName?: string;
    status?: string;
    sensorsCount?: number;
    rate?: number;
    latency?: number;
    lastSentTime?: string;
    configPayloadPrefix?: string;
    configPayloadJson?: string;
    configPayloadPrefixes?: string[];
    configPayloadsJson?: string[];
    lastSentPayloadPrefix?: string;
    lastSentPayloadJson?: string;
    // New compressed payload fields
    compressedConfigPayloadPrefix?: string;
    compressedLastSentPayloadPrefix?: string;
    configPayloadCompressed?: string;
    lastSentPayloadCompressed?: string;
    health?: {
        connectionState?: string;
        successRate?: number;
        lastErrorMessage?: string;
        errorType?: string;
        consecutiveFailures?: number;
        consecutiveSuccesses?: number;
        httpStatusCode?: number;
        averageLatency?: number;
        maxLatency?: number;
        minLatency?: number;
        lastSuccessTime?: string;
        lastFailureTime?: string;
        poolRecreationCount?: number;
        // MQTT-specific fields
        connectionRecreated?: boolean;
        acknowledgmentTimeouts?: number;
        publishFailures?: number;
        connectionRecreationCount?: number;
        topicLatencies?: { [topic: string]: number };
        // HTTP-specific fields
        keepAlivePoolRecreated?: boolean;
    };
}

const Streams: React.FC = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Stream selection state with localStorage
    const [selectedStreamKey, setSelectedStreamKey] = useState<string | number>(() => {
        try {
            return localStorage.getItem('streams_selected_stream_key') || '';
        } catch {
            return '';
        }
    });
    const [selectedStream, setSelectedStream] = useState<StreamData | null>(null);

    // Stream-specific tabs with localStorage
    const [streamTab, setStreamTab] = useState(() => {
        try {
            const saved = localStorage.getItem('streams_current_tab');
            return saved ? parseInt(saved, 10) : 0;
        } catch {
            return 0;
        }
    });

    // Display options
    const [payloadFormat, setPayloadFormat] = useState<'raw' | 'pretty' | 'hex'>(() => {
        try {
            const saved = localStorage.getItem('streams_payload_format');
            return (saved === 'raw' || saved === 'pretty' || saved === 'hex') ? saved : 'pretty';
        } catch {
            return 'pretty';
        }
    });
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'info' | 'warning' | 'error'>('success');

    const {
        streams: activeStreams,
        connectionStatus,
        isConnected,
        lastUpdate,
        sendMessage,
        reconnect
    } = useDashboardWebSocket({
        enabled: true,
        defaultPollRate: 250
    });

    // Save preferences to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('streams_payload_format', payloadFormat);
        } catch {
            // Ignore localStorage errors
        }
    }, [payloadFormat]);

    useEffect(() => {
        try {
            localStorage.setItem('streams_current_tab', streamTab.toString());
        } catch {
            // Ignore localStorage errors
        }
    }, [streamTab]);

    useEffect(() => {
        try {
            if (selectedStreamKey) {
                localStorage.setItem('streams_selected_stream_key', selectedStreamKey.toString());
            }
        } catch {
            // Ignore localStorage errors
        }
    }, [selectedStreamKey]);

    // Update selected stream when activeStreams changes
    useEffect(() => {
        if (selectedStreamKey && activeStreams.length > 0) {
            const updated = activeStreams.find(s => s.streamKey === selectedStreamKey);
            if (updated) {
                setSelectedStream(updated);
            } else {
                // Selected stream no longer exists, pick the first available
                const firstStream = activeStreams[0];
                setSelectedStreamKey(firstStream.streamKey);
                setSelectedStream(firstStream);
            }
        }
    }, [activeStreams, selectedStreamKey]);

    // Auto-select first stream if none selected and we have streams
    useEffect(() => {
        if (!selectedStreamKey && activeStreams.length > 0) {
            const firstStream = activeStreams[0];
            setSelectedStreamKey(firstStream.streamKey);
            setSelectedStream(firstStream);
        }
    }, [activeStreams, selectedStreamKey]);

    const showSnackbar = useCallback((msg: string, severity: typeof snackbarSeverity = 'success') => {
        setSnackMessage(msg);
        setSnackbarSeverity(severity);
    }, []);

    const handleManualRefresh = useCallback(() => {
        if (isConnected) {
            sendMessage({ type: 'request-streams' });
            showSnackbar('Streams data refreshed', 'success');
        } else {
            showSnackbar('WebSocket not connected', 'warning');
        }
    }, [isConnected, sendMessage, showSnackbar]);

    const handleStreamSelect = (event: SelectChangeEvent<string | number>) => {
        const streamKey = event.target.value;
        setSelectedStreamKey(streamKey);
        const stream = activeStreams.find(s => s.streamKey === streamKey);
        setSelectedStream(stream || null);
        // Don't reset tab - keep user on current tab when switching streams
    };

    const handleStreamTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setStreamTab(newValue);
    };

    // Helper function to check if compression is enabled
    const isCompressionEnabled = (stream: StreamData): boolean => {
        // Check if we have compressed payload data that looks like hex
        const hasCompressedConfig = stream.configPayloadCompressed && 
                                  stream.configPayloadCompressed !== '[Compression disabled]' &&
                                  stream.configPayloadCompressed.trim() !== '' &&
                                  stream.configPayloadCompressed.trim() !== '{}';
        
        const hasCompressedLastSent = stream.lastSentPayloadCompressed && 
                                    stream.lastSentPayloadCompressed !== '[Compression disabled]' &&
                                    stream.lastSentPayloadCompressed.trim() !== '' &&
                                    stream.lastSentPayloadCompressed.trim() !== '{}';
        
        // Also check if we have compressed prefixes (which indicate compression was used)
        const hasCompressedPrefixes = stream.compressedConfigPayloadPrefix || 
                                    stream.compressedLastSentPayloadPrefix;
        
        return !!(hasCompressedConfig || hasCompressedLastSent || hasCompressedPrefixes);
    };

    // Helper function to calculate compression stats
    const getCompressionStats = (uncompressedJson: string, compressedHex: string) => {
        if (!uncompressedJson || !compressedHex || compressedHex === '[Compression disabled]') {
            return null;
        }
        
        const uncompressedBytes = new TextEncoder().encode(uncompressedJson).length;
        const compressedBytes = Math.ceil(compressedHex.replace(/\s/g, '').length / 2); // hex pairs to bytes
        const savings = ((uncompressedBytes - compressedBytes) / uncompressedBytes * 100);
        
        return {
            uncompressedBytes,
            compressedBytes,
            savings: Math.max(0, savings) // ensure non-negative
        };
    };

    // Helper functions
    const renderStatusChip = (status?: string) => {
        const safeStatus = status || 'Unknown';
        const color = safeStatus.toLowerCase() === 'active' ? 'success' :
            safeStatus.toLowerCase() === 'idle' ? 'warning' :
                safeStatus.toLowerCase() === 'error' ? 'error' : 'default';

        return (
            <Chip
                label={safeStatus}
                color={color}
                size="small"
                variant="outlined"
            />
        );
    };

    const getProtocolColor = (protocol?: string) => {
        const safeProtocol = protocol?.toLowerCase() || '';
        if (safeProtocol.includes('http')) return '#2196f3'; // Blue
        if (safeProtocol.includes('mqtt')) return '#9c27b0'; // Purple  
        if (safeProtocol.includes('com')) return '#4caf50'; // Green
        return '#607d8b'; // Gray
    };

    const getHealthColor = (health?: StreamData['health']) => {
        if (!health) return '#607d8b';

        switch (health.connectionState) {
            case 'good': return '#4caf50'; // Green
            case 'poor': return '#ff9800'; // Orange
            case 'disconnected': return '#f44336'; // Red
            default: return '#607d8b'; // Gray
        }
    };

    const formatPayload = (prefix = '', json = '', format = 'pretty', compressedHex = '', compressedPrefix = '') => {
        if (format === 'hex') {
            if (!compressedHex || compressedHex === '[Compression disabled]') {
                return 'Compression not available';
            }
            return compressedPrefix + compressedHex;
        }
        
        if (!json) return 'No payload available';
        try {
            return prefix + (format === 'pretty' ? JSON.stringify(JSON.parse(json), null, 2) : json);
        } catch {
            return prefix + json;
        }
    };

    const renderPayloadField = (
        label: string, 
        prefix: string = '', 
        json: string = '', 
        compressedHex: string = '', 
        compressedPrefix: string = '',
        showCompressionStats: boolean = false
    ) => {
        const compressionStats = showCompressionStats ? getCompressionStats(json, compressedHex) : null;
        
        return (
            <Box mb={2}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontSize: '1rem', fontWeight: 'bold', color: 'text.primary' }}>
                        {label}
                    </Typography>
                    {compressionStats && payloadFormat !== 'hex' && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            Compressed: {compressionStats.uncompressedBytes} to {compressionStats.compressedBytes} bytes
                            ({compressionStats.savings.toFixed(1)}% reduction)
                        </Typography>
                    )}
                    {payloadFormat === 'hex' && compressedHex && compressedHex !== '[Compression disabled]' && compressionStats && (
                        <Typography variant="caption" color="primary.main" sx={{ fontWeight: 'bold' }}>
                            Binary rendered as HEX for UI only. Compressed: {compressionStats.uncompressedBytes} to {compressionStats.compressedBytes} bytes
                            ({compressionStats.savings.toFixed(1)}% reduction)
                        </Typography>
                    )}
                </Box>
                <TextField
                    fullWidth
                    multiline
                    minRows={6}
                    maxRows={12}
                    value={formatPayload(prefix, json, payloadFormat, compressedHex, compressedPrefix)}
                    size="small"
                    disabled
                    variant="outlined"
                    sx={{
                        mb: 3,
                        '& .MuiInputBase-root': {
                            backgroundColor: payloadFormat === 'hex' ? 'action.hover' : 'background.paper',
                            resize: 'both',
                            overflow: 'auto',
                        },
                        '& .MuiInputBase-input': {
                            fontSize: '13px !important',
                            fontFamily: '"Consolas", "Monaco", "Courier New", monospace !important',
                            color: payloadFormat === 'hex' ? 'primary.main !important' : 'text.primary !important',
                            lineHeight: 1.4,
                            padding: '12px !important'
                        },
                        '& .MuiOutlinedInput-root': {
                            '& fieldset': {
                                borderColor: payloadFormat === 'hex' ? 'primary.main' : 'divider',
                            },
                            '&:hover fieldset': {
                                borderColor: payloadFormat === 'hex' ? 'primary.dark' : 'text.secondary',
                            },
                        }
                    }}
                />
            </Box>
        );
    };

    const getStreamDisplayName = (stream: StreamData) => {
        const device = stream.deviceName || 'Unknown Device';
        const screen = stream.screenName || 'Unknown Screen';
        const protocol = stream.protocol || 'Unknown';
        return `${device} - ${screen} (${protocol})`;
    };

    // Responsive metric item component
    const MetricItem = ({ label, children }: { label: string; children: React.ReactNode }) => (
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {label}
            </Typography>
            {children}
        </Box>
    );

    // Stream Details Content
    const renderStreamDetailsContent = () => {
        if (!selectedStream) {
            return (
                <Card>
                    <CardContent sx={{ textAlign: 'center', py: 4 }}>
                        <Typography variant="body1" color="text.secondary">
                            {activeStreams.length === 0
                                ? 'No active streams available. Start a junction to see stream data.'
                                : 'Select a stream from the dropdown above to view detailed information.'
                            }
                        </Typography>
                    </CardContent>
                </Card>
            );
        }

        const compressionEnabled = isCompressionEnabled(selectedStream);

        return (
            <Box display="flex" flexDirection="column" gap={3}>
                {/* Stream Overview */}
                <Card>
                    <CardContent>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <DataObjectIcon fontSize="small" /> Stream Details
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                            {selectedStream.protocol || 'Unknown'} - {selectedStream.deviceName || 'Unknown Device'} ({selectedStream.screenName || 'Unknown Screen'})
                        </Typography>

                        {/* Mobile-friendly metrics layout */}
                        <Box sx={{
                            display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            gap: 2,
                            flexWrap: 'wrap'
                        }}>
                            <Box sx={{
                                display: 'flex',
                                flexDirection: isMobile ? 'column' : 'row',
                                gap: isMobile ? 1 : 2,
                                flex: 1,
                                minWidth: 0
                            }}>
                                <MetricItem label="Protocol">
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <Box
                                            sx={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: '50%',
                                                backgroundColor: getProtocolColor(selectedStream.protocol)
                                            }}
                                        />
                                        <Typography variant="body2">{selectedStream.protocol || 'Unknown'}</Typography>
                                    </Box>
                                </MetricItem>

                                <MetricItem label="Device">
                                    <Typography variant="body2">{selectedStream.deviceName || 'Unknown Device'}</Typography>
                                </MetricItem>

                                <MetricItem label="Screen">
                                    <Typography variant="body2">{selectedStream.screenName || 'Unknown Screen'}</Typography>
                                </MetricItem>
                            </Box>

                            <Box sx={{
                                display: 'flex',
                                flexDirection: isMobile ? 'column' : 'row',
                                gap: isMobile ? 1 : 2,
                                flex: 1,
                                minWidth: 0
                            }}>
                                <MetricItem label="Status">
                                    <Box>{renderStatusChip(selectedStream.status)}</Box>
                                </MetricItem>

                                <MetricItem label="Sensors">
                                    <Typography variant="body2">{selectedStream.sensorsCount || 0}</Typography>
                                </MetricItem>

                                <MetricItem label="Rate">
                                    <Typography variant="body2">
                                        {selectedStream.rate ? (
                                            selectedStream.rate < 1000
                                                ? `${selectedStream.rate}ms`
                                                : `${(selectedStream.rate / 1000).toFixed(1)}s`
                                        ) : 'Unknown'}
                                    </Typography>
                                </MetricItem>
                            </Box>
                        </Box>

                        <Box sx={{ mt: 2 }}>
                            <MetricItem label="Last Sent">
                                <Typography variant="body2">
                                    {selectedStream.lastSentTime
                                        ? new Date(selectedStream.lastSentTime).toLocaleString()
                                        : 'Never'
                                    }
                                </Typography>
                            </MetricItem>
                        </Box>

                        {/* Health Metrics */}
                        {selectedStream.health && (
                            <Box mt={3}>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                                    Health Metrics
                                </Typography>

                                {/* Main health metrics */}
                                <Box sx={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    gap: 2,
                                    flexWrap: 'wrap',
                                    mb: 2
                                }}>
                                    <Box sx={{
                                        display: 'flex',
                                        flexDirection: isMobile ? 'column' : 'row',
                                        gap: isMobile ? 1 : 2,
                                        flex: 1,
                                        minWidth: 0
                                    }}>
                                        <MetricItem label="Connection">
                                            <Box display="flex" alignItems="center" gap={1}>
                                                <Box
                                                    sx={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: '50%',
                                                        backgroundColor: getHealthColor(selectedStream.health)
                                                    }}
                                                />
                                                <Typography variant="body2" fontWeight="medium">
                                                    {selectedStream.health.connectionState || 'Unknown'}
                                                </Typography>
                                            </Box>
                                        </MetricItem>

                                        <MetricItem label="Success Rate">
                                            <Typography variant="body2" fontWeight="medium">
                                                {typeof selectedStream.health.successRate === 'number'
                                                    ? `${selectedStream.health.successRate.toFixed(1)}%`
                                                    : 'N/A'}
                                            </Typography>
                                        </MetricItem>
                                    </Box>

                                    <Box sx={{
                                        display: 'flex',
                                        flexDirection: isMobile ? 'column' : 'row',
                                        gap: isMobile ? 1 : 2,
                                        flex: 1,
                                        minWidth: 0
                                    }}>
                                        <MetricItem label="Avg Latency">
                                            <Typography variant="body2" fontWeight="medium">
                                                {typeof selectedStream.health.averageLatency === 'number'
                                                    ? `${selectedStream.health.averageLatency.toFixed(1)}ms`
                                                    : 'N/A'}
                                            </Typography>
                                        </MetricItem>

                                        <MetricItem label="Consecutive Successes">
                                            <Typography variant="body2" fontWeight="medium">
                                                {selectedStream.health.consecutiveSuccesses ?? 'N/A'}
                                            </Typography>
                                        </MetricItem>
                                    </Box>
                                </Box>

                                {/* Additional metrics (only show if they have meaningful values) */}
                                <Box sx={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    gap: 2,
                                    flexWrap: 'wrap'
                                }}>
                                    {selectedStream.health.consecutiveFailures != null && selectedStream.health.consecutiveFailures > 0 && (
                                        <MetricItem label="Failures">
                                            <Typography variant="body2" fontWeight="medium" color="error">
                                                {selectedStream.health.consecutiveFailures}
                                            </Typography>
                                        </MetricItem>
                                    )}

                                    {selectedStream.health.acknowledgmentTimeouts != null && selectedStream.health.acknowledgmentTimeouts > 0 && (
                                        <MetricItem label="ACK Timeouts">
                                            <Typography variant="body2" fontWeight="medium" color="warning.main">
                                                {selectedStream.health.acknowledgmentTimeouts}
                                            </Typography>
                                        </MetricItem>
                                    )}

                                    {selectedStream.health.httpStatusCode != null && selectedStream.health.httpStatusCode !== 200 && (
                                        <MetricItem label="HTTP Status">
                                            <Typography variant="body2" fontWeight="medium" color="warning.main">
                                                {selectedStream.health.httpStatusCode}
                                            </Typography>
                                        </MetricItem>
                                    )}
                                </Box>

                                {/* Error information */}
                                {selectedStream.health.lastErrorMessage && (
                                    <Box sx={{ mt: 2 }}>
                                        <MetricItem label="Last Error">
                                            <Typography variant="body2" color="error.main">
                                                {selectedStream.health.lastErrorMessage}
                                            </Typography>
                                        </MetricItem>
                                    </Box>
                                )}
                            </Box>
                        )}
                    </CardContent>
                </Card>

                {/* Payload Data */}
                <Card>
                    <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} sx={{ flexWrap: 'wrap', gap: 1 }}>
                            <Box display="flex" alignItems="center" gap={1}>
                                <Typography variant="h6">Payload Data</Typography>
                                {compressionEnabled && (
                                    <Chip
                                        icon={<CompressIcon fontSize="small" />}
                                        label="GZIP Compression Enabled (HEX display)"
                                        size="small"
                                        color="primary"
                                        variant="outlined"
                                    />
                                )}
                            </Box>
                            <Box display="flex" gap={1}>
                                <Button
                                    variant={payloadFormat === 'raw' ? 'contained' : 'outlined'}
                                    size="small"
                                    onClick={() => setPayloadFormat('raw')}
                                >
                                    Raw
                                </Button>
                                <Button
                                    variant={payloadFormat === 'pretty' ? 'contained' : 'outlined'}
                                    size="small"
                                    onClick={() => setPayloadFormat('pretty')}
                                >
                                    Pretty
                                </Button>
                                {compressionEnabled && (
                                    <Button
                                        variant={payloadFormat === 'hex' ? 'contained' : 'outlined'}
                                        size="small"
                                        onClick={() => setPayloadFormat('hex')}
                                        color="primary"
                                    >
                                        HEX
                                    </Button>
                                )}
                            </Box>
                        </Box>

                        {selectedStream.protocol === 'MQTT' ? (
                            <Box>
                                {/* MQTT Config Payloads - Stack on mobile, side by side on desktop */}
                                <Box sx={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    gap: 2
                                }}>
                                    {/* MQTT Config Payload - First */}
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle2" gutterBottom sx={{ fontSize: '1rem', fontWeight: 'bold', color: 'text.primary' }}>
                                            MQTT Config Payload
                                        </Typography>
                                        <TextField
                                            fullWidth
                                            multiline
                                            minRows={6}
                                            maxRows={12}
                                            value={(() => {
                                                try {
                                                    const prefix = selectedStream.configPayloadPrefixes?.[1] || '';
                                                    const json = selectedStream.configPayloadsJson?.[1];

                                                    if (!json) return 'No payload available';

                                                    if (payloadFormat === "pretty") {
                                                        return prefix + JSON.stringify(JSON.parse(json), null, 2);
                                                    } else {
                                                        return prefix + json;
                                                    }
                                                } catch (error) {
                                                    return (selectedStream.configPayloadPrefixes?.[1] || '') +
                                                        (selectedStream.configPayloadsJson?.[1] || 'No payload available');
                                                }
                                            })()}
                                            size="small"
                                            disabled
                                            variant="outlined"
                                            sx={{
                                                mb: 3,
                                                '& .MuiInputBase-root': {
                                                    backgroundColor: 'background.paper',
                                                    resize: 'both',
                                                    overflow: 'auto',
                                                },
                                                '& .MuiInputBase-input': {
                                                    fontSize: '13px !important',
                                                    fontFamily: '"Consolas", "Monaco", "Courier New", monospace !important',
                                                    color: 'text.primary !important',
                                                    lineHeight: 1.4,
                                                    padding: '12px !important'
                                                },
                                                '& .MuiOutlinedInput-root': {
                                                    '& fieldset': {
                                                        borderColor: 'divider',
                                                    },
                                                    '&:hover fieldset': {
                                                        borderColor: 'text.secondary',
                                                    },
                                                }
                                            }}
                                        />
                                    </Box>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle2" gutterBottom sx={{ fontSize: '1rem', fontWeight: 'bold', color: 'text.primary' }}>
                                            Standard Config Payload
                                        </Typography>
                                        <TextField
                                            fullWidth
                                            multiline
                                            minRows={6}
                                            maxRows={12}
                                            value={(() => {
                                                try {
                                                    const prefix = selectedStream.configPayloadPrefixes?.[0] || '';
                                                    const json = selectedStream.configPayloadsJson?.[0];
                                                    if (!json) return 'No payload available';
                                                    if (payloadFormat === "pretty") {
                                                        return prefix + JSON.stringify(JSON.parse(json), null, 2);
                                                    } else {
                                                        return prefix + json;
                                                    }
                                                } catch (error) {
                                                    return (selectedStream.configPayloadPrefixes?.[0] || '') +
                                                        (selectedStream.configPayloadsJson?.[0] || 'No payload available');
                                                }
                                            })()}
                                            size="small"
                                            disabled
                                            variant="outlined"
                                            sx={{
                                                mb: 3,
                                                '& .MuiInputBase-root': {
                                                    backgroundColor: 'background.paper',
                                                    resize: 'both',
                                                    overflow: 'auto',
                                                },
                                                '& .MuiInputBase-input': {
                                                    fontSize: '13px !important',
                                                    fontFamily: '"Consolas", "Monaco", "Courier New", monospace !important',
                                                    color: 'text.primary !important',
                                                    lineHeight: 1.4,
                                                    padding: '12px !important'
                                                },
                                                '& .MuiOutlinedInput-root': {
                                                    '& fieldset': {
                                                        borderColor: 'divider',
                                                    },
                                                    '&:hover fieldset': {
                                                        borderColor: 'text.secondary',
                                                    },
                                                }
                                            }}
                                        />
                                    </Box>
                                </Box>
                            </Box>
                        ) : (
                            renderPayloadField(
                                'Config Payload',
                                selectedStream.configPayloadPrefix,
                                selectedStream.configPayloadJson,
                                selectedStream.configPayloadCompressed,
                                selectedStream.compressedConfigPayloadPrefix,
                                compressionEnabled
                            )
                        )}

                        {renderPayloadField(
                            'Last Payload Sent',
                            selectedStream.lastSentPayloadPrefix,
                            selectedStream.lastSentPayloadJson,
                            selectedStream.lastSentPayloadCompressed,
                            selectedStream.compressedLastSentPayloadPrefix,
                            compressionEnabled
                        )}
                    </CardContent>
                </Card>
            </Box>
        );
    };

    return (
        <Box sx={{ p: 2, maxWidth: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <Box sx={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'stretch' : 'center',
                mb: 3,
                gap: 2
            }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    Stream Monitor
                </Typography>
                <Box display="flex" alignItems="center" gap={2} sx={{ flexWrap: 'wrap' }}>
                    <Chip
                        icon={isConnected ? <WifiIcon /> : <WifiOffIcon />}
                        label={isConnected ? 'Connected' : connectionStatus}
                        color={isConnected ? 'success' : 'error'}
                        size="small"
                    />
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={handleManualRefresh}
                        size="small"
                        disabled={!isConnected}
                    >
                        Refresh
                    </Button>
                    {!isConnected && (
                        <Button variant="contained" onClick={reconnect} size="small">
                            Reconnect
                        </Button>
                    )}
                </Box>
            </Box>

            {/* Stream Selector */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Box sx={{
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        alignItems: isMobile ? 'stretch' : 'center',
                        gap: 2,
                        mb: 2
                    }}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DataObjectIcon /> Active Streams ({activeStreams.length})
                        </Typography>
                        {lastUpdate > 0 && (
                            <Typography variant="caption" color="text.secondary">
                                Last updated: {new Date(lastUpdate).toLocaleTimeString()}
                            </Typography>
                        )}
                    </Box>

                    {activeStreams.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                            {isConnected ? 'No active streams found.' : 'Connecting to real-time data...'}
                        </Typography>
                    ) : (
                        <FormControl fullWidth size="small">
                            <InputLabel>Select Stream</InputLabel>
                            <Select
                                value={selectedStreamKey}
                                label="Select Stream"
                                onChange={handleStreamSelect}
                            >
                                {activeStreams.map((stream) => (
                                    <MenuItem key={stream.streamKey} value={stream.streamKey}>
                                        <Box display="flex" alignItems="center" gap={1} width="100%" sx={{ minWidth: 0 }}>
                                            <Box
                                                sx={{
                                                    width: 12,
                                                    height: 12,
                                                    borderRadius: '50%',
                                                    backgroundColor: getProtocolColor(stream.protocol),
                                                    flexShrink: 0
                                                }}
                                            />
                                            <Typography sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {getStreamDisplayName(stream)}
                                            </Typography>
                                            {renderStatusChip(stream.status)}
                                        </Box>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                </CardContent>
            </Card>

            {/* Stream-Specific Tabs (only show if a stream is selected) */}
            {selectedStream && (
                <>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                        <Tabs
                            value={streamTab}
                            onChange={handleStreamTabChange}
                            aria-label="stream tabs"
                            variant={isMobile ? "fullWidth" : "standard"}
                            sx={{
                                '& .MuiTab-root': {
                                    minWidth: isMobile ? 'auto' : 120,
                                    fontSize: isMobile ? '0.875rem' : '1rem'
                                }
                            }}
                        >
                            <Tab
                                label={
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <DataObjectIcon fontSize="small" />
                                        {isMobile ? 'Details' : 'Details'}
                                    </Box>
                                }
                                {...a11yProps(0)}
                            />
                            <Tab
                                label={
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <History fontSize="small" />
                                        {isMobile ? 'History' : 'History'}
                                    </Box>
                                }
                                {...a11yProps(1)}
                            />
                        </Tabs>
                    </Box>

                    {/* Tab Panels */}
                    <TabPanel value={streamTab} index={0}>
                        {renderStreamDetailsContent()}
                    </TabPanel>

                    <TabPanel value={streamTab} index={1}>
                        {/* Pass the selected stream's screen ID to StreamHistory */}
                        <StreamHistory
                            streamId={
                                // You'll need to map from streamKey to screenId based on your data structure
                                // This assumes streamKey corresponds to screenId, adjust as needed
                                typeof selectedStream.streamKey === 'number'
                                    ? selectedStream.streamKey
                                    : parseInt(selectedStream.streamKey.toString()) || 0
                            }
                        />
                    </TabPanel>
                </>
            )}

            {/* Empty State when no stream selected */}
            {!selectedStream && (
                <Card>
                    <CardContent sx={{ textAlign: 'center', py: 4 }}>
                        <Typography variant="body1" color="text.secondary">
                            {activeStreams.length === 0
                                ? 'No active streams available. Start a junction to see stream data.'
                                : 'Select a stream from the dropdown above to view detailed information.'
                            }
                        </Typography>
                    </CardContent>
                </Card>
            )}

            {/* Snackbar for notifications */}
            <Snackbar
                open={Boolean(snackMessage)}
                autoHideDuration={5000}
                onClose={() => setSnackMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={() => setSnackMessage(null)} severity={snackbarSeverity} sx={{ width: '100%' }}>
                    {snackMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default Streams;