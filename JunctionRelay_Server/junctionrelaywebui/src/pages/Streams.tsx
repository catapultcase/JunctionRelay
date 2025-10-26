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
import ImageIcon from '@mui/icons-material/Image';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CodeIcon from '@mui/icons-material/Code';
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
    deviceMac?: string;
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

    // Frame data properties
    hasLastFrame?: boolean;
    lastFrameSize?: number;
    lastFrameTime?: string;
    lastFrameLayoutType?: string;

    // Existing compressed payload fields
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

        // NEW: Frame-specific health fields
        isFrameMode?: boolean;
        payloadType?: string;
        framesSent?: number;
        payloadsSent?: number;
        currentFrameLayoutType?: string;
        averageFrameSize?: number;
        maxFrameSize?: number;
        minFrameSize?: number;
        averageFrameRenderTime?: number;
        maxFrameRenderTime?: number;
        minFrameRenderTime?: number;
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

    // Debug logging - console only
    useEffect(() => {
        // console.log('[STREAMS DEBUG] WebSocket state:', {
        //     connectionStatus,
        //     isConnected,
        //     streamsCount: activeStreams?.length || 0,
        //     lastUpdate: lastUpdate > 0 ? new Date(lastUpdate).toISOString() : 'never'
        // });
    }, [connectionStatus, isConnected, activeStreams, lastUpdate]);

    // Removed debug logging - use browser console when needed

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
                console.log('[STREAMS DEBUG] Selected stream not found, switching to first available:', firstStream);
            }
        }
    }, [activeStreams, selectedStreamKey]);

    // Auto-select first stream if none selected and we have streams
    useEffect(() => {
        if (!selectedStreamKey && activeStreams.length > 0) {
            const firstStream = activeStreams[0];
            setSelectedStreamKey(firstStream.streamKey);
            setSelectedStream(firstStream);
            console.log('[STREAMS DEBUG] Auto-selected first stream:', firstStream);
        }
    }, [activeStreams, selectedStreamKey]);

    const showSnackbar = useCallback((msg: string, severity: typeof snackbarSeverity = 'success') => {
        setSnackMessage(msg);
        setSnackbarSeverity(severity);
    }, []);

    const handleManualRefresh = useCallback(() => {
        console.log('[STREAMS DEBUG] Manual refresh triggered, isConnected:', isConnected);
        if (isConnected) {
            sendMessage({ type: 'request-streams' });
            showSnackbar('Streams data refreshed', 'success');
        } else {
            showSnackbar('WebSocket not connected', 'warning');
        }
    }, [isConnected, sendMessage, showSnackbar]);

    const handleStreamSelect = (event: SelectChangeEvent<string | number>) => {
        const streamKey = event.target.value;
        console.log('[STREAMS DEBUG] Stream selection changed:', { from: selectedStreamKey, to: streamKey });
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
        if (safeProtocol.includes('websocket')) return '#ff9800'; // Orange
        if (safeProtocol.includes('virtual')) return '#00bcd4'; // Cyan
        return '#607d8b'; // Gray
    };

    const getStreamTypeColor = (streamType: string) => {
        switch (streamType) {
            case 'Blit': return '#e91e63'; // Pink
            case 'Reconstruction': return '#3f51b5'; // Indigo
            case 'Puppet': return '#9c27b0'; // Purple
            case 'Payload': return '#607d8b'; // Blue Gray
            default: return '#757575'; // Gray
        }
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
            // If compressed hex is available, show that
            if (compressedHex && compressedHex !== '[Compression disabled]') {
                return compressedPrefix + compressedHex;
            }
            // Otherwise, convert the JSON payload to hex
            if (!json) return 'No payload available';
            const encoder = new TextEncoder();
            const bytes = encoder.encode(json);
            const hexString = Array.from(bytes)
                .map(byte => byte.toString(16).padStart(2, '0'))
                .join(' ');
            return prefix + hexString;
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
        const uncompressedSize = json ? json.length : 0;

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
                    {!compressionStats && uncompressedSize > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            Size: {uncompressedSize} bytes
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

        // Determine stream type based on 3 fundamental architectures:
        // 1. Blit: Server renders frames, sends binary RGB565 data
        // 2. Reconstruction: Device renders from JSON config (reconstruction/composite mode)
        // 3. Payload: Standard JSON-only payloads
        // Special: Virtual streams are internal rendering engines (show different UI)
        let streamType = 'Payload';

        // Virtual streams are special - they're internal Puppeteer rendering engines
        if (protocol === 'Virtual' || stream.deviceMac === 'Virtual') {
            streamType = 'Puppet';
        }
        // Check if this is a blit mode stream (server renders, sends binary frames)
        else if (stream.lastFrameLayoutType === 'BLIT_MODE' ||
            stream.configPayloadPrefix === 'BLIT_CONFIG') {
            streamType = 'Blit';
        }
        // Check if this is reconstruction mode (device renders from JSON config)
        else if (stream.health?.isFrameMode ||
                 stream.lastFrameLayoutType === 'COMPOSITE_MODE' ||
                 stream.configPayloadJson?.includes('"type":"rive_config"')) {
            streamType = 'Reconstruction';
        }
        // Otherwise it's a standard JSON payload stream (default)

        return { protocol, streamType, device, screen };
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

    // Helper function to get screenId from streamKey
    const getScreenIdFromStream = (stream: StreamData): number | undefined => {
        // Try to extract screenId from the stream data
        if (typeof stream.streamKey === 'number') {
            return stream.streamKey;
        }

        // If streamKey is a string, try to parse it
        if (typeof stream.streamKey === 'string') {
            const parsed = parseInt(stream.streamKey);
            if (!isNaN(parsed)) {
                return parsed;
            }
        }

        return undefined;
    };

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
        const screenId = getScreenIdFromStream(selectedStream);

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

                        {/* Virtual Rendering Engine Metrics - Special UI for Virtual streams */}
                        {(selectedStream.protocol === 'Virtual' || selectedStream.deviceMac === 'Virtual') && selectedStream.health && (
                            <Box sx={{ mt: 2 }}>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CodeIcon fontSize="small" />
                                    Virtual Rendering Engine
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                                    Internal frame renderer for Blit mode streams. Captures screenshots of composite layouts.
                                </Typography>
                                <Box sx={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    gap: 2,
                                    flexWrap: 'wrap'
                                }}>
                                    {selectedStream.health.framesSent != null && (
                                        <MetricItem label="Frames Captured">
                                            <Typography variant="body2" fontWeight="medium">
                                                {selectedStream.health.framesSent}
                                            </Typography>
                                        </MetricItem>
                                    )}
                                    {selectedStream.health.averageFrameSize != null && selectedStream.health.averageFrameSize > 0 && (
                                        <MetricItem label="Avg Frame Size">
                                            <Typography variant="body2" fontWeight="medium">
                                                {(selectedStream.health.averageFrameSize / 1024).toFixed(1)} KB
                                            </Typography>
                                        </MetricItem>
                                    )}
                                    {selectedStream.health.averageFrameRenderTime != null && selectedStream.health.averageFrameRenderTime > 0 && (
                                        <MetricItem label="Avg Render Time">
                                            <Typography variant="body2" fontWeight="medium">
                                                {selectedStream.health.averageFrameRenderTime.toFixed(1)}ms
                                            </Typography>
                                        </MetricItem>
                                    )}
                                    {selectedStream.lastFrameLayoutType && (
                                        <MetricItem label="Layout Type">
                                            <Typography variant="body2" fontWeight="medium">
                                                {selectedStream.lastFrameLayoutType}
                                            </Typography>
                                        </MetricItem>
                                    )}
                                    {selectedStream.health.payloadsSent != null && (
                                        <MetricItem label="Payloads Sent">
                                            <Typography variant="body2" fontWeight="medium">
                                                {selectedStream.health.payloadsSent}
                                            </Typography>
                                        </MetricItem>
                                    )}
                                </Box>
                            </Box>
                        )}

                        {/* Frame-specific metrics - For non-Virtual frame mode streams */}
                        {selectedStream.health?.isFrameMode && selectedStream.health &&
                         selectedStream.protocol !== 'Virtual' && selectedStream.deviceMac !== 'Virtual' && (
                            <Box sx={{ mt: 2 }}>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                                    Frame Metrics
                                </Typography>
                                <Box sx={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    gap: 2,
                                    flexWrap: 'wrap'
                                }}>
                                    {selectedStream.health.framesSent != null && (
                                        <MetricItem label="Frames Sent">
                                            <Typography variant="body2" fontWeight="medium">
                                                {selectedStream.health.framesSent}
                                            </Typography>
                                        </MetricItem>
                                    )}
                                    {selectedStream.health.averageFrameSize != null && (
                                        <MetricItem label="Avg Frame Size">
                                            <Typography variant="body2" fontWeight="medium">
                                                {(selectedStream.health.averageFrameSize / 1024).toFixed(1)} KB
                                            </Typography>
                                        </MetricItem>
                                    )}
                                    {selectedStream.health.averageFrameRenderTime != null && (
                                        <MetricItem label="Avg Render Time">
                                            <Typography variant="body2" fontWeight="medium">
                                                {selectedStream.health.averageFrameRenderTime.toFixed(1)}ms
                                            </Typography>
                                        </MetricItem>
                                    )}
                                    {selectedStream.health.currentFrameLayoutType && (
                                        <MetricItem label="Frame Layout">
                                            <Typography variant="body2" fontWeight="medium">
                                                {selectedStream.health.currentFrameLayoutType}
                                            </Typography>
                                        </MetricItem>
                                    )}
                                </Box>
                            </Box>
                        )}

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

                {/* Last Frame Sent Card - Only show for Blit mode (server-rendered frames) */}
                {selectedStream.hasLastFrame && screenId &&
                 (selectedStream.lastFrameLayoutType === 'BLIT_MODE' ||
                  selectedStream.configPayloadPrefix === 'BLIT_CONFIG') && (
                    <Card>
                        <CardContent>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} sx={{ flexWrap: 'wrap', gap: 1 }}>
                                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <ImageIcon fontSize="small" />
                                    Last Frame Sent
                                </Typography>
                                <Box display="flex" gap={1} flexWrap="wrap">
                                    {/*{selectedStream.lastFrameLayoutType && (*/}
                                    {/*    <Chip*/}
                                    {/*        label={selectedStream.lastFrameLayoutType}*/}
                                    {/*        size="small"*/}
                                    {/*        color="primary"*/}
                                    {/*        variant="outlined"*/}
                                    {/*    />*/}
                                    {/*)}*/}
                                    <Chip
                                        label={`${selectedStream.lastFrameSize ? (selectedStream.lastFrameSize / 1024).toFixed(1) : '0'} KB`}
                                        size="small"
                                        color="info"
                                        variant="outlined"
                                    />
                                </Box>
                            </Box>

                            <Box sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 2,
                                p: 2,
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1,
                                backgroundColor: 'background.paper'
                            }}>
                                <Box sx={{
                                    position: 'relative',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    minHeight: 200,
                                    width: '100%'
                                }}>
                                    <img
                                        src={`/api/streamhistory/stream/${screenId}/last-frame?t=${Date.now()}`}
                                        alt="Last sent frame"
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: '500px',
                                            border: '1px solid #ddd',
                                            borderRadius: '4px',
                                            objectFit: 'contain',
                                            backgroundColor: '#f5f5f5'
                                        }}
                                        onError={(e) => {
                                            const target = e.currentTarget as HTMLImageElement;
                                            target.style.display = 'none';
                                            console.error('[STREAMS DEBUG] Frame image load error:', { screenId, src: target.src });
                                            // Show error message in the container
                                            const container = target.parentElement;
                                            if (container && !container.querySelector('.error-message')) {
                                                const errorDiv = document.createElement('div');
                                                errorDiv.className = 'error-message';
                                                errorDiv.style.cssText = 'color: #666; text-align: center; padding: 20px;';
                                                errorDiv.innerHTML = `
                                                    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="#999">
                                                            <path d="M21,19V5c0,-1.1 -0.9,-2 -2,-2H5c-1.1,0 -2,0.9 -2,2v14c0,1.1 0.9,2 2,2h14c1.1,0 2,-0.9 2,-2zM8.5,13.5l2.5,3.01L14.5,12l4.5,6H5l3.5,-4.5z"/>
                                                        </svg>
                                                        <span>Failed to load frame image</span>
                                                        <small>URL: /api/streamhistory/stream/${screenId}/last-frame</small>
                                                    </div>
                                                `;
                                                container.appendChild(errorDiv);
                                            }
                                        }}
                                        onLoad={(e) => {
                                            const target = e.currentTarget as HTMLImageElement;
                                            target.style.display = 'block';
                                            console.log('[STREAMS DEBUG] Frame image loaded successfully:', { screenId, src: target.src });
                                            // Remove any error message
                                            const container = target.parentElement;
                                            const errorMsg = container?.querySelector('.error-message');
                                            if (errorMsg) {
                                                errorMsg.remove();
                                            }
                                        }}
                                    />
                                </Box>

                                <Box sx={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    gap: 2,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexWrap: 'wrap',
                                    textAlign: 'center'
                                }}>
                                    <Typography variant="caption" color="text.secondary">
                                        Size: {selectedStream.lastFrameSize ? `${(selectedStream.lastFrameSize / 1024).toFixed(1)} KB` : 'Unknown'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Generated: {selectedStream.lastFrameTime
                                            ? new Date(selectedStream.lastFrameTime).toLocaleString()
                                            : 'Unknown'
                                        }
                                    </Typography>
                                    {selectedStream.lastFrameLayoutType && (
                                        <Typography variant="caption" color="text.secondary">
                                            Layout: {selectedStream.lastFrameLayoutType}
                                        </Typography>
                                    )}
                                </Box>

                                <Box sx={{
                                    display: 'flex',
                                    gap: 1,
                                    flexWrap: 'wrap',
                                    justifyContent: 'center',
                                    mt: 1
                                }}>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={<RefreshIcon />}
                                        onClick={() => {
                                            console.log('[STREAMS DEBUG] Refreshing frame image for screenId:', screenId);
                                            // Force refresh the image by updating the timestamp
                                            const img = document.querySelector(`img[src*="/api/streamhistory/stream/${screenId}/last-frame"]`) as HTMLImageElement;
                                            if (img) {
                                                const newSrc = `/api/streamhistory/stream/${screenId}/last-frame?t=${Date.now()}`;
                                                img.src = newSrc;

                                                // Remove any existing error message
                                                const container = img.parentElement;
                                                const errorMsg = container?.querySelector('.error-message');
                                                if (errorMsg) {
                                                    errorMsg.remove();
                                                }
                                                img.style.display = 'block';
                                            }
                                        }}
                                    >
                                        Refresh Frame
                                    </Button>

                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={<DownloadIcon />}
                                        onClick={() => {
                                            console.log('[STREAMS DEBUG] Downloading frame for screenId:', screenId);
                                            // Download the current frame
                                            const link = document.createElement('a');
                                            link.href = `/api/streamhistory/stream/${screenId}/last-frame?t=${Date.now()}`;
                                            link.download = `frame_${screenId}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
                                            document.body.appendChild(link);
                                            link.click();
                                            document.body.removeChild(link);
                                        }}
                                    >
                                        Download
                                    </Button>

                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={<OpenInNewIcon />}
                                        color="secondary"
                                        onClick={() => {
                                            console.log('[STREAMS DEBUG] Opening frame in new window for screenId:', screenId);
                                            // Open frame in new window for full size viewing
                                            window.open(`/api/streamhistory/stream/${screenId}/last-frame?t=${Date.now()}`, '_blank');
                                        }}
                                    >
                                        View Full Size
                                    </Button>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                )}

                {/* Payload Data */}
                {!selectedStream.hasLastFrame && (
                <Card>
                    <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} sx={{ flexWrap: 'wrap', gap: 1 }}>
                            <Box display="flex" alignItems="center" gap={1}>
                                <Typography variant="h6">Payload Data</Typography>
                                {compressionEnabled && (
                                    <Chip
                                        icon={<CompressIcon fontSize="small" />}
                                        label="GZIP Compression Enabled"
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
                                <Button
                                    variant={payloadFormat === 'hex' ? 'contained' : 'outlined'}
                                    size="small"
                                    onClick={() => setPayloadFormat('hex')}
                                    color="primary"
                                >
                                    HEX
                                </Button>
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
                )}
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
                                renderValue={(value) => {
                                    const stream = activeStreams.find(s => s.streamKey === value);
                                    if (!stream) return 'Select Stream';
                                    const displayInfo = getStreamDisplayName(stream);
                                    return (
                                        <Box display="flex" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
                                            <Chip
                                                label={displayInfo.protocol}
                                                size="small"
                                                sx={{
                                                    height: 20,
                                                    fontSize: '0.7rem',
                                                    backgroundColor: getProtocolColor(stream.protocol),
                                                    color: 'white',
                                                    fontWeight: 600,
                                                    flexShrink: 0
                                                }}
                                            />
                                            <Chip
                                                label={displayInfo.streamType}
                                                size="small"
                                                sx={{
                                                    height: 20,
                                                    fontSize: '0.7rem',
                                                    backgroundColor: getStreamTypeColor(displayInfo.streamType),
                                                    color: 'white',
                                                    fontWeight: 600,
                                                    flexShrink: 0
                                                }}
                                            />
                                            <Typography sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.875rem' }}>
                                                {displayInfo.device} - {displayInfo.screen}
                                            </Typography>
                                        </Box>
                                    );
                                }}
                            >
                                {activeStreams.map((stream) => {
                                    const displayInfo = getStreamDisplayName(stream);
                                    return (
                                        <MenuItem key={stream.streamKey} value={stream.streamKey}>
                                            <Box display="flex" alignItems="center" gap={0.75} width="100%" sx={{ minWidth: 0 }}>
                                                {/* Protocol Chip */}
                                                <Chip
                                                    label={displayInfo.protocol}
                                                    size="small"
                                                    sx={{
                                                        height: 20,
                                                        fontSize: '0.7rem',
                                                        backgroundColor: getProtocolColor(stream.protocol),
                                                        color: 'white',
                                                        fontWeight: 600,
                                                        flexShrink: 0
                                                    }}
                                                />
                                                {/* Type Chip */}
                                                <Chip
                                                    label={displayInfo.streamType}
                                                    size="small"
                                                    sx={{
                                                        height: 20,
                                                        fontSize: '0.7rem',
                                                        backgroundColor: getStreamTypeColor(displayInfo.streamType),
                                                        color: 'white',
                                                        fontWeight: 600,
                                                        flexShrink: 0
                                                    }}
                                                />
                                                {/* Stream Name */}
                                                <Typography sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.875rem' }}>
                                                    {displayInfo.device} - {displayInfo.screen}
                                                </Typography>
                                                {/* Status Chip */}
                                                {renderStatusChip(stream.status)}
                                            </Box>
                                        </MenuItem>
                                    );
                                })}
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
                                getScreenIdFromStream(selectedStream) || 0
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