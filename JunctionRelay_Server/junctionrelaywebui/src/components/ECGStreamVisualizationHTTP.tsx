import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTheme } from '@mui/material/styles';
import { Typography } from '@mui/material';

interface ECGStreamVisualizationProps {
    stream: {
        streamKey: string;
        protocol: string;
        deviceName: string;
        screenName: string;
        status?: string;
        sensorsCount: number;
        rate: number;
        latency?: number;
        lastSentTime: string;
        health?: {
            connectionState: string;
            successRate: number;
            lastErrorMessage: string;
            errorType: string;
            consecutiveFailures: number;
            consecutiveSuccesses: number;
            // HTTP-specific properties
            keepAlivePoolRecreated?: boolean;
            httpStatusCode?: number;
            poolRecreationCount?: number;
            // Common properties
            averageLatency: number;
            maxLatency: number;
            minLatency: number;
            lastSuccessTime: string;
            lastFailureTime: string;
        };
    };
    width?: number;
    height?: number;
}

interface VisualizationSettings {
    bufferSize: number;
    scrollInterval: number;
    showLatencyMetrics: boolean;
    autoHideInactive: boolean;
    inactiveThreshold: number;
    enableTileFlashing: boolean;
}

const ECGStreamVisualizationHTTP: React.FC<ECGStreamVisualizationProps> = ({
    stream,
    width = 400,
    height = 120,
}) => {
    const theme = useTheme();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const animationRef = useRef<number | null>(null);

    // ——— Mirror props/state into refs ———
    const streamRef = useRef(stream);
    useEffect(() => { streamRef.current = stream; }, [stream]);

    const [isActive, setIsActive] = useState(false);
    const isActiveRef = useRef(isActive);
    useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

    const [settings, setSettings] = useState<VisualizationSettings>(() => {
        const saved = localStorage.getItem('dashboard_visualization_settings');
        return saved ? JSON.parse(saved) : {
            bufferSize: 400,
            scrollInterval: 30,
            showLatencyMetrics: true,
            autoHideInactive: true,
            inactiveThreshold: 30,
            enableTileFlashing: false,
        };
    });
    const settingsRef = useRef(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    const dataPoints = useRef<number[]>([]);
    const dataBuffer = useRef<number[]>([]);
    const lastScrollTime = useRef<number>(Date.now());
    const lastSentTimeRef = useRef<string>('');
    const isPageVisible = useRef<boolean>(true);

    const lastActivityRef = useRef<number>(Date.now());
    const [shouldHide, setShouldHide] = useState(false);

    // Animation throttling for performance
    const lastAnimationTime = useRef<number>(0);
    const ANIMATION_THROTTLE = 16; // ~60fps

    const transmissionPattern = [
        0, 0, 0.1, 0.3, 0.2, 0, 0.4, 0.9, 1.0, 0.7,
        -0.1, 0, 0.1, 0.2, 0.1, 0, 0,
    ];

    // Enhanced error handling for canvas operations
    const safeGetContext = useCallback((canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.warn('Canvas 2D context not available');
                return null;
            }
            return ctx;
        } catch (error) {
            console.warn('Canvas context error:', error);
            return null;
        }
    }, []);

    // Listen for settings changes and page visibility
    useEffect(() => {
        const handleSettingsChange = (event: CustomEvent) => {
            setSettings(event.detail);
        };

        const handleVisibilityChange = () => {
            const wasVisible = isPageVisible.current;
            isPageVisible.current = !document.hidden;

            // Clear buffer when page becomes visible to prevent stale data
            if (!wasVisible && !document.hidden) {
                dataBuffer.current = [];
            }
        };

        window.addEventListener('dashboard-settings-changed', handleSettingsChange as any);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('dashboard-settings-changed', handleSettingsChange as any);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // Update activity tracking
    useEffect(() => {
        if (
            stream.lastSentTime !== lastSentTimeRef.current &&
            stream.lastSentTime
        ) {
            lastActivityRef.current = Date.now();
            setShouldHide(false);
        }
    }, [stream.lastSentTime]);

    // Auto-hide logic
    useEffect(() => {
        if (!settings.autoHideInactive) {
            setShouldHide(false);
            return;
        }
        const checkInactivity = () => {
            const elapsed = Date.now() - lastActivityRef.current;
            setShouldHide(elapsed > settings.inactiveThreshold * 1000);
        };
        const iv = setInterval(checkInactivity, 1000);
        return () => clearInterval(iv);
    }, [settings.autoHideInactive, settings.inactiveThreshold]);

    // Update buffer size when settings change
    useEffect(() => {
        const newLength = Math.min(settings.bufferSize, width);
        const curr = dataPoints.current.length;
        const baselineY = height / 2;
        if (curr < newLength) {
            const extra = Array(newLength - curr).fill(baselineY);
            dataPoints.current = [...extra, ...dataPoints.current];
        } else if (curr > newLength) {
            dataPoints.current = dataPoints.current.slice(curr - newLength);
        }
    }, [settings.bufferSize, width, height]);

    // HTTP-only protocol color
    const getProtocolColor = useCallback((protocol: string) => {
        const normalizedProtocol = protocol?.toLowerCase() || '';
        if (normalizedProtocol.includes('http')) {
            return '#2196f3'; // Blue for HTTP/HTTPS
        }
        if (normalizedProtocol.includes('mqtt')) {
            return '#9c27b0'; // Purple for MQTT  
        }
        if (normalizedProtocol.includes('com')) {
            return '#4caf50'; // Green for COM
        }
        return '#607d8b'; // Default gray for unknown protocols
    }, []);

    const getHealthColor = useCallback(() => {
        const health = streamRef.current.health;
        const protocol = streamRef.current.protocol;
        if (!health) return getProtocolColor(protocol);

        switch (health.connectionState) {
            case 'good': return getProtocolColor(protocol);
            case 'poor': return '#ff9800'; // Orange for poor connection
            case 'disconnected': return '#f44336'; // Red for disconnected
            default: return getProtocolColor(protocol);
        }
    }, [getProtocolColor]);

    const getHealthDisplayText = useCallback(() => {
        const health = streamRef.current.health;
        if (!health) return '';

        // For HTTP, prefer actual latency over average when available
        const rawLatency = streamRef.current.latency;
        const useRawLatency = rawLatency != null && rawLatency > 0;
        const latency = useRawLatency ? rawLatency : Math.round(health.averageLatency);
        const label = useRawLatency ? '' : 'avg';

        const prefix = health.connectionState === 'poor' ? '⚠ Latency: '
            : health.connectionState === 'disconnected' ? ''
                : 'Latency: ';

        switch (health.connectionState) {
            case 'good':
                return latency > 0 ? `${prefix}${latency}ms ${label}`.trim() : '';
            case 'poor':
                return latency > 0
                    ? `${prefix}${latency}ms ${label}`.trim()
                    : `⚠ POOR`;
            case 'disconnected':
                return '❌ DISCONNECTED';
            default:
                return latency > 0 ? `${prefix}${latency}ms ${label}`.trim() : '';
        }
    }, []);

    const getConnectionDisplayText = useCallback(() => {
        const health = streamRef.current.health;
        if (!health) return '';

        const successRate = Math.round(health.successRate);
        const avgLatency = Math.round(health.averageLatency);

        switch (health.connectionState) {
            case 'good':
                return `Healthy (avg ${avgLatency}ms, ${successRate}%)`;
            case 'poor':
                if (successRate >= 98 && avgLatency > 100) {
                    return `Slow (avg ${avgLatency}ms, ${successRate}%)`;
                } else if (successRate < 98 && avgLatency <= 100) {
                    return `Unstable (avg ${avgLatency}ms, ${successRate}%)`;
                } else {
                    return `Poor (avg ${avgLatency}ms, ${successRate}%)`;
                }
            case 'disconnected':
                return `Disconnected (avg ${avgLatency}ms, ${successRate}%)`;
            default:
                return `Unknown (avg ${avgLatency}ms, ${successRate}%)`;
        }
    }, []);

    const getHealthTooltip = useCallback(() => {
        const health = streamRef.current.health;
        if (!health) return '';

        const parts = [
            `Success Rate: ${health.successRate.toFixed(1)}%`,
            health.consecutiveFailures > 0 && `Consecutive Failures: ${health.consecutiveFailures}`,
            health.lastErrorMessage && `Last Error: ${health.lastErrorMessage}`,
            // HTTP-specific fields
            health.keepAlivePoolRecreated && health.poolRecreationCount && `Pool Recreated: ${health.poolRecreationCount} times`,
            health.httpStatusCode && health.httpStatusCode !== 200 && `HTTP Status: ${health.httpStatusCode}`,
        ].filter(Boolean);

        return parts.join('\n');
    }, []);

    // Trigger pulse when actual data changes (lastSentTime)
    useEffect(() => {
        if (stream.lastSentTime !== lastSentTimeRef.current && stream.lastSentTime) {
            lastSentTimeRef.current = stream.lastSentTime;
            // Safe check for status
            if (stream.status?.toLowerCase() === 'active') {
                triggerPulse();
            }
        }
    }, [stream.lastSentTime, stream.status, height]);

    const triggerPulse = useCallback(() => {
        if (!isPageVisible.current) return;

        setIsActive(true);
        const baselineY = height / 2;
        const amplitude = height * 0.3;
        const health = stream.health;

        // Modify pulse based on connection health
        let patternLength: number;
        let pulseDuration: number;
        let usePattern = transmissionPattern;

        if (health?.connectionState === 'disconnected') {
            // For disconnected: create a "stuck at peak" pattern
            usePattern = [0, 0.5, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]; // Stays at peak
            patternLength = usePattern.length;
            pulseDuration = 2000; // Longer duration for stuck pulse
        } else if (health?.connectionState === 'poor') {
            // For poor connection: irregular, jagged pattern
            usePattern = [0, 0.2, 0.8, 0.3, 0.9, 1.0, 0.4, 0.7, 0.1, 0.5, 0, 0]; // Jagged
            patternLength = usePattern.length;
            pulseDuration = Math.max(800, stream.latency || 500);
        } else {
            // Normal pulse - use actual latency for HTTP when available
            if (stream.latency && stream.latency > 0) {
                patternLength = Math.max(3, Math.min(transmissionPattern.length, Math.floor(stream.latency / settingsRef.current.scrollInterval)));
                pulseDuration = stream.latency;
            } else {
                patternLength = Math.min(transmissionPattern.length, Math.floor(stream.rate / settingsRef.current.scrollInterval));
                pulseDuration = Math.max(3, patternLength) * settingsRef.current.scrollInterval + 20;
            }
        }

        if (patternLength < 3 && health?.connectionState !== 'disconnected' && health?.connectionState !== 'poor') {
            const fastPattern = [0, 1.0, 0];
            fastPattern.forEach((p) => {
                dataBuffer.current.push(baselineY - p * amplitude);
            });
        } else {
            let scaledPattern = usePattern.slice(0, patternLength);
            if (!scaledPattern.includes(1.0) && scaledPattern.length > 1 && health?.connectionState !== 'disconnected' && health?.connectionState !== 'poor') {
                scaledPattern[Math.floor(scaledPattern.length / 2)] = 1.0;
            }
            scaledPattern.forEach((p) => {
                dataBuffer.current.push(baselineY - p * amplitude);
            });
        }

        setTimeout(() => setIsActive(false), pulseDuration);
    }, [height, stream.health, stream.latency, stream.rate]);

    // Optimized animation loop with throttling
    const animate = useCallback(() => {
        const now = Date.now();

        // Throttle animation when page is not visible
        if (!isPageVisible.current) {
            animationRef.current = requestAnimationFrame(animate);
            return;
        }

        // Throttle to ~60fps
        if (now - lastAnimationTime.current < ANIMATION_THROTTLE) {
            animationRef.current = requestAnimationFrame(animate);
            return;
        }
        lastAnimationTime.current = now;

        const canvas = canvasRef.current;
        const offscreen = offscreenRef.current;

        if (!canvas || !offscreen) {
            // Retry after a delay if canvas not ready
            setTimeout(() => {
                if (canvasRef.current && offscreenRef.current) {
                    animationRef.current = requestAnimationFrame(animate);
                }
            }, 100);
            return;
        }

        const ctx = safeGetContext(canvas);
        const offCtx = safeGetContext(offscreen);

        if (!ctx || !offCtx) {
            animationRef.current = requestAnimationFrame(animate);
            return;
        }

        // Scroll logic
        if (now - lastScrollTime.current >= settingsRef.current.scrollInterval) {
            lastScrollTime.current = now;
            if (dataPoints.current.length === 0) {
                dataPoints.current = Array(Math.min(settingsRef.current.bufferSize, width)).fill(height / 2);
            }
            dataPoints.current.shift();
            const baseY = height / 2;
            let next: number;
            if (dataBuffer.current.length) {
                next = dataBuffer.current.shift()!;
            } else {
                const hc = streamRef.current.health?.connectionState;
                if (hc === 'poor') {
                    next = baseY + (Math.random() - 0.5) * 8;
                } else if (hc === 'disconnected') {
                    next = baseY;
                } else {
                    next = baseY + (Math.random() - 0.5) * 1.5;
                }
            }
            dataPoints.current.push(next);
        }

        // Draw grid
        offCtx.clearRect(0, 0, width, height);
        const hc = streamRef.current.health?.connectionState;
        const gridColor = hc === 'poor'
            ? 'rgba(255,152,0,0.08)'
            : hc === 'disconnected'
                ? 'rgba(244,67,54,0.08)'
                : 'rgba(33,150,243,0.1)';
        offCtx.strokeStyle = gridColor;
        offCtx.lineWidth = 1;
        for (let x = 0; x < width; x += 20) {
            offCtx.beginPath();
            offCtx.moveTo(x, 0);
            offCtx.lineTo(x, height);
            offCtx.stroke();
        }
        for (let y = 0; y < height; y += 20) {
            offCtx.beginPath();
            offCtx.moveTo(0, y);
            offCtx.lineTo(width, y);
            offCtx.stroke();
        }

        // Baseline
        const yOffset = 20;
        offCtx.strokeStyle = gridColor.replace(/0\.\d/, '0.3');
        offCtx.beginPath();
        offCtx.moveTo(0, height / 2 + yOffset);
        offCtx.lineTo(width, height / 2 + yOffset);
        offCtx.stroke();

        // Waveform
        if (dataPoints.current.length > 1) {
            const healthColor = getHealthColor();

            offCtx.setLineDash([]);
            offCtx.shadowBlur = 0;

            let strokeColor = healthColor;

            if (streamRef.current.health?.connectionState === 'disconnected') {
                offCtx.setLineDash([5, 5]);
            }

            offCtx.strokeStyle = strokeColor;
            offCtx.lineWidth = 2;
            offCtx.lineCap = 'round';
            offCtx.lineJoin = 'round';

            offCtx.beginPath();
            const pts = dataPoints.current;
            const startX = width - pts.length;
            const yOffset = 20;
            pts.forEach((y, i) => {
                const adjustedY = y + yOffset;
                i === 0 ? offCtx.moveTo(startX + i, adjustedY) : offCtx.lineTo(startX + i, adjustedY);
            });
            offCtx.stroke();
            offCtx.setLineDash([]);
        }

        // Blit to main canvas
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(offscreen, 0, 0);

        animationRef.current = requestAnimationFrame(animate);
    }, [width, height, getHealthColor, safeGetContext]);

    // Initialize animation & offscreen with proper cleanup
    useEffect(() => {
        try {
            const off = offscreenRef.current;
            off.width = width;
            off.height = height;
            dataPoints.current = Array(Math.min(settingsRef.current.bufferSize, width)).fill(height / 2);

            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            animationRef.current = requestAnimationFrame(animate);
        } catch (error) {
            console.warn('Animation initialization error:', error);
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, [width, height, animate]);

    // Memory cleanup on unmount
    useEffect(() => {
        return () => {
            // Clear large buffers to prevent memory leaks
            dataPoints.current = [];
            dataBuffer.current = [];

            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, []);

    const timeSince = useCallback(() => {
        if (!stream.lastSentTime) return 'Never';
        const diff = Date.now() - new Date(stream.lastSentTime).getTime();
        if (diff < 1000) return 'Just now';
        if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
        return `${Math.floor(diff / 60000)}m ago`;
    }, [stream.lastSentTime]);

    const statusColor = (stream.status?.toLowerCase() === 'active') ? '#4caf50' : '#9e9e9e';

    if (shouldHide) {
        return (
            <div
                style={{
                    border: `1px dashed ${theme.palette.divider}`,
                    borderRadius: 8,
                    padding: 16,
                    background: theme.palette.action.hover,
                    marginBottom: 16,
                    textAlign: 'center',
                    opacity: 0.5,
                }}
            >
                <Typography variant="body2" color="text.secondary">
                    {stream.deviceName} - Hidden (inactive for{' '}
                    {Math.floor((Date.now() - lastActivityRef.current) / 1000)}
                    s)
                </Typography>
            </div>
        );
    }

    return (
        <div
            style={{
                border: `2px solid ${getHealthColor()}`,
                borderRadius: 8,
                padding: 16,
                background: theme.palette.background.paper,
                transition: 'border-color 0.5s ease',
                marginBottom: 16,
                minWidth: 0,
                overflow: 'hidden',
            }}
            title={getHealthTooltip()}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                }}
            >
                <div>
                    <strong style={{ fontSize: '0.9rem' }}>{stream.deviceName}</strong>
                    <br />
                    <small style={{ color: '#666' }}>
                        {stream.sensorsCount} {stream.sensorsCount === 1 ? 'sensor' : 'sensors'}
                    </small>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            color: '#fff',
                            backgroundColor: getProtocolColor(stream.protocol),
                            marginRight: 4,
                        }}
                    >
                        {stream.protocol}
                    </span>
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            color: '#fff',
                            backgroundColor: statusColor,
                        }}
                    >
                        {stream.status}
                    </span>
                </div>
            </div>

            {/* Canvas */}
            <div
                style={{
                    position: 'relative',
                    background: '#000',
                    borderRadius: 4,
                    marginBottom: 8,
                }}
            >
                <canvas
                    ref={canvasRef}
                    width={width}
                    height={height}
                    style={{
                        width: '100%',
                        height: `${height}px`,
                        borderRadius: 4,
                        minWidth: 0,
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        color: 'rgba(255,255,255,0.8)',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                    }}
                >
                    {stream.screenName}
                </div>
                <div
                    style={{
                        position: 'absolute',
                        bottom: 8,
                        right: 8,
                        color: 'rgba(255,255,255,0.8)',
                        fontSize: '0.75rem',
                    }}
                >
                    {timeSince()}
                </div>
                <div
                    style={{
                        position: 'absolute',
                        bottom: 8,
                        left: 8,
                        color: 'rgba(255,255,255,0.8)',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        pointerEvents: 'none',
                    }}
                >
                    {getConnectionDisplayText()}
                </div>
                {settings.showLatencyMetrics && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            color: getHealthColor(),
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                        }}
                    >
                        {getHealthDisplayText()}
                    </div>
                )}
            </div>

            {/* Stream Metrics */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <span
                    style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: 8,
                        fontSize: '0.65rem',
                        background:
                            theme.palette.mode === 'dark'
                                ? 'rgba(33,150,243,0.1)'
                                : '#e3f2fd',
                        border: `1px solid ${theme.palette.primary.main}`,
                        color: theme.palette.text.primary,
                    }}
                >
                    Protocol: {stream.protocol}
                </span>
                <span
                    style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: 8,
                        fontSize: '0.65rem',
                        background:
                            theme.palette.mode === 'dark'
                                ? 'rgba(33,150,243,0.1)'
                                : '#e3f2fd',
                        border: `1px solid ${theme.palette.primary.main}`,
                        color: theme.palette.text.primary,
                    }}
                >
                    Rate:{' '}
                    {stream.rate < 1000
                        ? `${stream.rate}ms`
                        : `${(stream.rate / 1000).toFixed(1)}s`}
                </span>

                {stream.health && (
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: 8,
                            fontSize: '0.65rem',
                            background:
                                stream.health.connectionState === 'good'
                                    ? theme.palette.mode === 'dark'
                                        ? 'rgba(76,175,80,0.1)'
                                        : '#e8f5e8'
                                    : stream.health.connectionState === 'poor'
                                        ? theme.palette.mode === 'dark'
                                            ? 'rgba(255,152,0,0.1)'
                                            : '#fff3e0'
                                        : theme.palette.mode === 'dark'
                                            ? 'rgba(244,67,54,0.1)'
                                            : '#ffebee',
                            border: `1px solid ${getHealthColor()}`,
                            color: theme.palette.text.primary,
                        }}
                        title={getHealthTooltip()}
                    >
                        {stream.health.connectionState === 'good'
                            ? '✓ Connected'
                            : stream.health.connectionState === 'poor'
                                ? `⚠ Poor (${Math.round(stream.health.successRate)}%)`
                                : '❌ Disconnected'}
                    </span>
                )}

                {stream.health?.errorType &&
                    stream.health.connectionState !== 'good' && (
                        <span
                            style={{
                                display: 'inline-block',
                                padding: '2px 6px',
                                borderRadius: 8,
                                fontSize: '0.65rem',
                                background:
                                    theme.palette.mode === 'dark'
                                        ? 'rgba(244,67,54,0.1)'
                                        : '#ffebee',
                                border: `1px solid #f44336`,
                                color: theme.palette.text.primary,
                            }}
                            title={stream.health.lastErrorMessage}
                        >
                            {stream.health.errorType.replace(/_/g, ' ')}
                        </span>
                    )}
            </div>
        </div>
    );
};

export default ECGStreamVisualizationHTTP;