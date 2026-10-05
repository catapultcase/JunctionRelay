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

import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    TextField,
    Button,
    Chip,
    Alert,
    Divider,
    CircularProgress,
    Snackbar,
    FormControlLabel,
    Checkbox,
    Tooltip,
} from '@mui/material';
import { AlertColor } from '@mui/material/Alert';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import CancelIcon from '@mui/icons-material/Cancel';

interface McpTool {
    name: string;
    description: string;
}

interface McpStatus {
    enabled: boolean;
    configured: boolean;
    locked: boolean;
    keySource: 'database' | 'none';
    protection: 'dataprotection' | 'password' | null;
    route: string;
    transport: string;
    authRequired: boolean;
    serverAuthOpen: boolean;
    toolCount: number;
    tools: McpTool[];
}

const Settings_LabMcp: React.FC = () => {
    const [status, setStatus] = useState<McpStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [key, setKey] = useState('');
    const [usePassword, setUsePassword] = useState(false);
    const [password, setPassword] = useState('');
    const [unlockPassword, setUnlockPassword] = useState('');

    const [snack, setSnack] = useState<string | null>(null);
    const [snackSeverity, setSnackSeverity] = useState<AlertColor>('success');

    const notify = (msg: string, severity: AlertColor = 'success') => {
        setSnackSeverity(severity);
        setSnack(msg);
    };

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/lab/mcp/status');
            if (res.ok) setStatus(await res.json());
        } catch {
            /* status is supplementary - a failure here must not blank the card */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const post = async (path: string, body: unknown, ok: string) => {
        setBusy(true);
        try {
            const res = await fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                notify(await res.text() || `Request failed (${res.status})`, 'error');
                return false;
            }
            setStatus(await res.json());
            notify(ok);
            return true;
        } catch (err) {
            notify(err instanceof Error ? err.message : String(err), 'error');
            return false;
        } finally {
            setBusy(false);
        }
    };

    // The server rejects weak keys (24+ chars, 8+ distinct). Rather than make the
    // operator invent something that clears that bar, offer one. Shown in the clear so
    // it can be copied into the assistant's config — it is about to be typed into
    // another app anyway, and it is only ever displayed before being saved.
    const handleGenerate = async () => {
        try {
            const res = await fetch('/api/lab/mcp/key/suggest');
            if (!res.ok) throw new Error('Could not generate a key');
            const { key: generated } = await res.json();
            setKey(generated);
        } catch {
            setKey('');
        }
    };

    const handleSave = async () => {
        if (!key.trim()) { notify('Enter a key first.', 'warning'); return; }
        if (usePassword && !password) { notify('Enter a password, or untick password protection.', 'warning'); return; }

        const done = await post('/api/lab/mcp/key',
            { key: key.trim(), password: usePassword ? password : null },
            'MCP key saved.');
        if (done) { setKey(''); setPassword(''); setUsePassword(false); }
    };

    const handleUnlock = async () => {
        if (!unlockPassword) { notify('Enter the password.', 'warning'); return; }
        const done = await post('/api/lab/mcp/key/unlock', { password: unlockPassword }, 'Unlocked.');
        if (done) setUnlockPassword('');
    };

    const handleClear = async () => {
        setBusy(true);
        try {
            const res = await fetch('/api/lab/mcp/key', { method: 'DELETE' });
            if (!res.ok) { notify(await res.text() || `Request failed (${res.status})`, 'error'); return; }
            setStatus(await res.json());
            notify('MCP key cleared. The endpoint no longer responds.');
        } catch (err) {
            notify(err instanceof Error ? err.message : String(err), 'error');
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box>;
    }

    return (
        <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Gives AI assistants structured access to your Lab inventory over MCP. The key is
                required on every request and is stored encrypted &mdash; it is never displayed again
                once saved.
            </Typography>

            {/* Current state */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Chip
                    size="small"
                    icon={status?.enabled ? <CheckCircleIcon /> : <CancelIcon />}
                    label={status?.enabled ? 'Serving' : status?.locked ? 'Locked' : 'Not configured'}
                    color={status?.enabled ? 'success' : status?.locked ? 'warning' : 'default'}
                    variant="outlined"
                />
                {status?.configured && (
                    <Chip
                        size="small"
                        icon={status.protection === 'password' ? <LockIcon /> : <LockOpenIcon />}
                        label={status.protection === 'password' ? 'Password protected' : 'Encrypted at rest'}
                        variant="outlined"
                    />
                )}
                <Chip size="small" label={status?.route ?? '/mcp'} sx={{ fontFamily: 'monospace' }} variant="outlined" />
                {status?.enabled && (
                    <Chip size="small" label={`${status.toolCount} ${status.toolCount === 1 ? 'tool' : 'tools'}`} variant="outlined" />
                )}
            </Box>

            {status?.serverAuthOpen && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Server auth mode is <strong>none</strong>, so the whole JunctionRelay API is
                    already open on your network &mdash; this key is not the weakest link. Noted for
                    awareness only; it does not restrict anything here.
                </Alert>
            )}

            {status?.locked && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    <strong>The key is password protected and locked.</strong> The endpoint returns
                    nothing until it is unlocked, so assistants will report the lab tools as
                    unavailable. This happens after every server restart &mdash; the password is never
                    stored.
                </Alert>
            )}

            {/* Unlock */}
            {status?.locked && (
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2 }}>
                    <TextField
                        size="small" type="password" label="Password" value={unlockPassword}
                        onChange={(e) => setUnlockPassword(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
                        sx={{ maxWidth: 280 }} disabled={busy}
                    />
                    <Button variant="contained" onClick={handleUnlock} disabled={busy}>Unlock</Button>
                </Box>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Set / replace */}
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {status?.configured ? 'Replace key' : 'Set key'}
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 520 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <TextField
                        size="small" type="text" label="MCP key" value={key}
                        onChange={(e) => setKey(e.target.value)}
                        disabled={busy}
                        sx={{ flex: 1 }}
                        helperText="At least 24 characters. This key is the only thing protecting the MCP endpoint, which is often reachable from the internet — generate one rather than inventing it."
                    />
                    <Button variant="outlined" onClick={handleGenerate} disabled={busy} sx={{ mt: 0.5 }}>
                        Generate
                    </Button>
                </Box>

                <Tooltip title="Encrypts the key with a password only you know. The server cannot use the key after a restart until you unlock it here.">
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={usePassword}
                                onChange={(e) => setUsePassword(e.target.checked)}
                                disabled={busy}
                            />
                        }
                        label="Protect with a password"
                    />
                </Tooltip>

                {usePassword && (
                    <>
                        <TextField
                            size="small" type="password" label="Password" value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={busy}
                        />
                        <Alert severity="warning">
                            The password is <strong>never stored</strong>. If you lose it the key cannot
                            be recovered &mdash; you would set a new one. The endpoint will also be locked
                            after every restart until you unlock it.
                        </Alert>
                    </>
                )}

                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" onClick={handleSave} disabled={busy}>
                        {status?.configured ? 'Replace' : 'Save'}
                    </Button>
                    {status?.configured && (
                        <Button variant="outlined" color="error" onClick={handleClear} disabled={busy}>
                            Clear
                        </Button>
                    )}
                </Box>
            </Box>

            {/* Tools actually being served */}
            {status?.enabled && status.tools.length > 0 && (
                <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Exposed tools</Typography>
                    {status.tools.map((t) => (
                        <Box key={t.name} sx={{ mb: 1 }}>
                            <Chip size="small" label={t.name} sx={{ fontFamily: 'monospace', mr: 1 }} />
                            <Typography variant="caption" color="text.secondary">{t.description}</Typography>
                        </Box>
                    ))}
                </>
            )}

            <Snackbar
                open={!!snack} autoHideDuration={5000} onClose={() => setSnack(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snackSeverity} onClose={() => setSnack(null)}>{snack}</Alert>
            </Snackbar>
        </Box>
    );
};

export default Settings_LabMcp;
