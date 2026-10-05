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

import { useState, useEffect, useCallback } from "react";
import {
    Typography,
    Box,
    Card,
    CardHeader,
    CardContent,
    Chip,
    Divider,
    IconButton,
    Tooltip,
    CircularProgress,
    Alert,
    Collapse,
    Button,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import DnsIcon from '@mui/icons-material/Dns';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import MemoryIcon from '@mui/icons-material/Memory';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import InfoIcon from '@mui/icons-material/Info';
import HubIcon from '@mui/icons-material/Hub';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import CodeIcon from '@mui/icons-material/Code';
import { usePageTitle } from "../../hooks/usePageTitle";
import { COMPONENT_TYPE_EMOJI } from "../../components/Lab_Inventory_Helpers";
import { machineEmoji, getMachineStatusInfo } from "../../components/Lab_Machines_Helpers";

interface BriefingMachine {
    id: number;
    name: string;
    kind?: string | null;
    role?: string | null;
    status: string;
    os?: string | null;
    alwaysOn: boolean;
    componentCount: number;
}

interface BriefingComponentType {
    type: string;
    count: number;
    shelved: number;
}

interface Briefing {
    machineCount: number;
    alwaysOnCount: number;
    componentCount: number;
    shelvedCount: number;
    machines: BriefingMachine[];
    componentsByType: BriefingComponentType[];
    generatedAt: string;
}

interface McpTool {
    name: string;
    description: string;
}

interface McpStatus {
    enabled: boolean;
    configured: boolean;
    locked: boolean;
    keySource: 'config' | 'database' | 'none';
    protection: 'dataprotection' | 'password' | null;
    route: string;
    transport: string;
    authRequired: boolean;
    toolCount: number;
    tools: McpTool[];
}

const StatTile = ({ icon, value, label, color }: {
    icon: React.ReactNode;
    value: number;
    label: string;
    color: string;
}) => (
    <Box sx={{ textAlign: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
            <Box sx={{ mr: 1, color, display: 'flex' }}>{icon}</Box>
            <Typography variant="h4" sx={{ color }}>{value}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {label}
        </Typography>
    </Box>
);

const STORAGE_KEY_MCP_EXPANDED = "lab_dashboard_mcp_expanded";
const STORAGE_KEY_BRIEFING_EXPANDED = "lab_dashboard_briefing_expanded";

const HomelabDashboard = () => {
    usePageTitle("Homelab Dashboard");
    const navigate = useNavigate();

    const [briefing, setBriefing] = useState<Briefing | null>(null);
    const [mcp, setMcp] = useState<McpStatus | null>(null);
    const [briefingText, setBriefingText] = useState<string>("");

    // Collapse state, persisted per card. ⚠️ Both default CLOSED: the MCP card is setup detail
    // you read once, and the briefing is a verbatim dump of what the assistant receives - useful
    // to check, noise to scroll past every visit. They sit together because they are the same
    // subject: the endpoint, and exactly what goes through it.
    const [mcpOpen, setMcpOpen] = useState<boolean>(() =>
        localStorage.getItem(STORAGE_KEY_MCP_EXPANDED) === 'true');
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_MCP_EXPANDED, String(mcpOpen));
    }, [mcpOpen]);
    const [showText, setShowText] = useState<boolean>(() =>
        localStorage.getItem(STORAGE_KEY_BRIEFING_EXPANDED) === 'true');
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_BRIEFING_EXPANDED, String(showText));
    }, [showText]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Price-colors toggle moved to the Inventory and Observations headers - the
    // dashboard neither shows priced tables nor needs the mode loaded.


    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [briefingRes, mcpRes, textRes] = await Promise.all([
                fetch('/api/lab/briefing'),
                fetch('/api/lab/mcp/status'),
                fetch('/api/lab/briefing/text'),
            ]);

            if (!briefingRes.ok) throw new Error(`Briefing request failed (${briefingRes.status})`);
            setBriefing(await briefingRes.json());

            // MCP status is supplementary — a failure here must not blank the whole page.
            if (mcpRes.ok) setMcp(await mcpRes.json());
            if (textRes.ok) setBriefingText(await textRes.text());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    if (loading && !briefing) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ padding: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Dashboard</Typography>
                <Tooltip title="Refresh">
                    <IconButton onClick={loadAll} disabled={loading}>
                        <RefreshIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Overview — the same four numbers the assistant leads its briefing with */}
            <Card sx={{ mb: 3 }}>
                <CardHeader
                    title={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <InfoIcon color="primary" />
                            <Typography variant="h6">Homelab Overview</Typography>
                        </Box>
                    }
                    sx={{ pb: 1 }}
                />
                <CardContent sx={{ pt: 0 }}>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
                        gap: 2,
                    }}>
                        <StatTile
                            icon={<DnsIcon />}
                            value={briefing?.machineCount ?? 0}
                            label={briefing?.machineCount === 1 ? 'Machine' : 'Machines'}
                            color="primary.main"
                        />
                        <StatTile
                            icon={<PowerSettingsNewIcon />}
                            value={briefing?.alwaysOnCount ?? 0}
                            label="Always-On"
                            color="success.main"
                        />
                        <StatTile
                            icon={<MemoryIcon />}
                            value={briefing?.componentCount ?? 0}
                            label={briefing?.componentCount === 1 ? 'Component' : 'Components'}
                            color="secondary.main"
                        />
                        <StatTile
                            icon={<Inventory2Icon />}
                            value={briefing?.shelvedCount ?? 0}
                            label="On the Shelf"
                            color="warning.main"
                        />
                    </Box>
                </CardContent>
            </Card>

            {/* MCP endpoint status */}
            <Card sx={{ mb: 3 }}>
                <CardHeader
                    title={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <HubIcon color={mcp?.enabled ? 'success' : 'disabled'} />
                            <Typography variant="h6">MCP Server</Typography>
                            <Chip
                                size="small"
                                icon={mcp?.enabled ? <CheckCircleIcon /> : <CancelIcon />}
                                label={mcp?.enabled ? 'Serving' : mcp?.locked ? 'Locked' : 'Not configured'}
                                color={mcp?.enabled ? 'success' : mcp?.locked ? 'warning' : 'default'}
                                variant="outlined"
                            />
                        </Box>
                    }
                    subheader="Structured access to this inventory for AI assistants"
                    action={
                        <Button size="small" onClick={() => setMcpOpen(v => !v)}>
                            {mcpOpen ? 'Hide' : 'Show'}
                        </Button>
                    }
                    sx={{ pb: 1 }}
                />
                <Collapse in={mcpOpen}>
                <CardContent sx={{ pt: 0 }}>
                    {mcp?.enabled ? (
                        <>
                            <Box sx={{
                                display: 'grid',
                                gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, auto)' },
                                gap: 2,
                                mb: 2,
                            }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">Endpoint</Typography>
                                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{mcp.route}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">Transport</Typography>
                                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{mcp.transport}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">Auth</Typography>
                                    <Typography variant="body2">{mcp.authRequired ? 'Bearer key required' : 'None'}</Typography>
                                </Box>
                            </Box>

                            <Divider sx={{ mb: 2 }} />

                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                {mcp.toolCount} {mcp.toolCount === 1 ? 'tool exposed' : 'tools exposed'}
                            </Typography>
                            {mcp.tools.map(tool => (
                                <Box key={tool.name} sx={{ mb: 1 }}>
                                    <Chip size="small" label={tool.name} sx={{ fontFamily: 'monospace', mr: 1 }} />
                                    <Typography variant="caption" color="text.secondary">{tool.description}</Typography>
                                </Box>
                            ))}
                        </>
                    ) : (
                        <Alert severity={mcp?.locked ? 'warning' : 'info'} sx={{ mb: 0 }}>
                            {mcp?.locked ? (
                                <>
                                    The key is <strong>password protected and locked</strong>, so the
                                    endpoint is not answering. Unlock it under{' '}
                                    <strong>Settings &rarr; Lab MCP Endpoint</strong>. This happens after
                                    every server restart — the password is never stored.
                                </>
                            ) : (
                                <>
                                    No key is set, so the endpoint returns nothing at all — it is
                                    indistinguishable from a route that does not exist, rather than
                                    existing unprotected. Set one under{' '}
                                    <strong>Settings &rarr; Lab MCP Endpoint</strong>. No restart needed.
                                </>
                            )}
                        </Alert>
                    )}
                </CardContent>
                </Collapse>
            </Card>

            {/* Exactly what the assistant receives — not a re-rendering that could differ.
                Sits directly under the MCP card because it is the same subject: that card is
                the endpoint, this is precisely what travels through it. */}
            <Card sx={{ mb: 3 }}>
                <CardHeader
                    title={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <CodeIcon color="action" />
                            <Typography variant="h6">Assistant Briefing</Typography>
                        </Box>
                    }
                    subheader="The exact text lab_briefing returns to an assistant"
                    action={
                        <Button size="small" onClick={() => setShowText(v => !v)}>
                            {showText ? 'Hide' : 'Show'}
                        </Button>
                    }
                    sx={{ pb: 1 }}
                />
                <Collapse in={showText}>
                    <CardContent sx={{ pt: 0 }}>
                        <Box
                            component="pre"
                            sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.8rem',
                                whiteSpace: 'pre-wrap',
                                m: 0,
                                p: 1.5,
                                bgcolor: 'action.hover',
                                borderRadius: 1,
                                overflowX: 'auto',
                            }}
                        >
                            {briefingText || '(unavailable)'}
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            {briefingText.length} characters. Assistants typically truncate tool
                            results at around 2,000.
                        </Typography>
                    </CardContent>
                </Collapse>
            </Card>

            {/* The briefing itself — the same content the assistant is handed */}
            <Card sx={{ mb: 3 }}>
                <CardHeader
                    title={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <DnsIcon color="primary" />
                            <Typography variant="h6">Machines</Typography>
                        </Box>
                    }
                    action={
                        <Button size="small" onClick={() => navigate('/homelab/machines')}>View all</Button>
                    }
                    sx={{ pb: 1 }}
                />
                <CardContent sx={{ pt: 0 }}>
                    {briefing?.machines.map(m => {
                        const statusInfo = getMachineStatusInfo(m.status);
                        const descriptors = [m.role || m.kind, m.os].filter(Boolean).join(', ');
                        return (
                            <Box
                                key={m.id}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    py: 0.75,
                                    borderBottom: '1px solid',
                                    borderColor: 'divider',
                                    '&:last-child': { borderBottom: 'none' },
                                }}
                            >
                                <Typography sx={{ fontSize: '1.1rem' }}>{machineEmoji(m)}</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 110 }}>
                                    {m.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
                                    {descriptors}
                                </Typography>
                                {m.alwaysOn && (
                                    <Chip size="small" label="always-on" color="success" variant="outlined" />
                                )}
                                {m.status?.toLowerCase() !== 'active' && (
                                    <Chip size="small" label={statusInfo.label} color={statusInfo.color} variant="outlined" />
                                )}
                                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 60, textAlign: 'right' }}>
                                    {m.componentCount} {m.componentCount === 1 ? 'part' : 'parts'}
                                </Typography>
                            </Box>
                        );
                    })}
                </CardContent>
            </Card>

            <Card sx={{ mb: 3 }}>
                <CardHeader
                    title={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <MemoryIcon color="secondary" />
                            <Typography variant="h6">Inventory by Type</Typography>
                        </Box>
                    }
                    action={
                        <Button size="small" onClick={() => navigate('/homelab/inventory')}>View all</Button>
                    }
                    sx={{ pb: 1 }}
                />
                <CardContent sx={{ pt: 0 }}>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
                        gap: 1.5,
                    }}>
                        {briefing?.componentsByType.map(t => (
                            <Box
                                key={t.type}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    p: 1,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 1,
                                }}
                            >
                                <Typography sx={{ fontSize: '1.1rem' }}>
                                    {COMPONENT_TYPE_EMOJI[t.type] || '⚙️'}
                                </Typography>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" noWrap>{t.type}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {t.count}{t.shelved > 0 ? ` · ${t.shelved} shelved` : ''}
                                    </Typography>
                                </Box>
                            </Box>
                        ))}
                    </Box>
                </CardContent>
            </Card>

        </Box>
    );
};

export default HomelabDashboard;
