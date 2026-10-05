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
    Alert, Box, Button, Chip, CircularProgress, FormControlLabel, Snackbar,
    Switch, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs,
    TextField, Typography,
} from '@mui/material';
import { AlertColor } from '@mui/material/Alert';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

// Lab/Models cloud sync — opt-in push of the ALLOWLISTED snapshot to
// JunctionRelay Cloud (a Pro feature cloud-side; everything local is free).
// Two tabs: the sync controls, and the contract — "what leaves this machine" —
// rendered straight from the backend's DTO reflection so it can never drift
// from the code that actually serializes.

interface SyncStatus {
    enabled: boolean;
    intervalMinutes: number;
    cloudAuthenticated: boolean;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastCounts: Record<string, number> | null;
}

interface SyncContract {
    schemaVersion: number;
    entities: Record<string, string[]>;
    excluded: string[];
}

const Settings_LabCloudSync: React.FC = () => {
    const [tab, setTab] = useState(0);
    const [deviceSyncEnabled, setDeviceSyncEnabled] = useState<boolean | null>(null);
    const [status, setStatus] = useState<SyncStatus | null>(null);
    const [contract, setContract] = useState<SyncContract | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
        open: false, message: '', severity: 'info'
    });

    const notify = (message: string, severity: AlertColor = 'info') =>
        setSnackbar({ open: true, message, severity });

    const loadStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/lab/cloudsync/status');
            if (res.ok) setStatus(await res.json());
        } catch { /* transient — the next poll retries */ }
    }, []);

    useEffect(() => { loadStatus(); }, [loadStatus]);

    // Device sync master switch rides the generic settings/flags pipeline.
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/settings/flags');
                if (res.ok) {
                    const flags = await res.json();
                    setDeviceSyncEnabled(flags.device_cloud_sync_enabled === true);
                }
            } catch { /* toggle renders disabled until known */ }
        })();
    }, []);

    const toggleDeviceSync = async (enabled: boolean) => {
        try {
            const res = await fetch('/api/settings/toggle/device_cloud_sync_enabled', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
            if (!res.ok) throw new Error(await res.text());
            setDeviceSyncEnabled(enabled);
            notify(enabled ? 'Device cloud sync enabled' : 'Device cloud sync disabled', 'success');
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Failed to update device sync', 'error');
        }
    };

    // The contract loads when its tab is first opened.
    useEffect(() => {
        if (tab !== 2 || contract) return;
        (async () => {
            try {
                const res = await fetch('/api/lab/cloudsync/contract');
                if (res.ok) setContract(await res.json());
            } catch { /* tab shows fallback text */ }
        })();
    }, [tab, contract]);

    const updateSettings = async (patch: Record<string, unknown>) => {
        try {
            const res = await fetch('/api/lab/cloudsync/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch)
            });
            if (!res.ok) throw new Error(await res.text());
            setStatus(await res.json());
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Failed to update settings', 'error');
        }
    };

    const syncNow = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/lab/cloudsync/now', { method: 'POST' });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error ?? 'Sync failed');
            notify('Snapshot pushed to cloud', 'success');
            await loadStatus();
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Sync failed', 'error');
            await loadStatus();
        } finally {
            setSyncing(false);
        }
    };

    if (!status) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>;
    }

    return (
        <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Mirrors your homelab and models data to JunctionRelay Cloud so the dashboard
                and the cloud MCP connector can see it (Pro). Off by default — nothing leaves
                this machine until enabled, and only allowlisted fields ever sync.
            </Typography>

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Tab label="Homelab & Models" />
                <Tab label="Devices" />
                <Tab label="What leaves this machine" />
            </Tabs>

            {tab === 0 && (
                <Box>
                    {!status.cloudAuthenticated && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Log in to JunctionRelay Cloud first (Authentication section) — sync pushes with your cloud account.
                        </Alert>
                    )}

                    <FormControlLabel
                        control={<Switch checked={status.enabled}
                            onChange={(e) => updateSettings({ enabled: e.target.checked })} />}
                        label="Sync to cloud"
                    />
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            The cloud MCP connector is read-only: it sees the synced mirror and nothing comes
                            back down. Changes are made here. The connector's API key is managed in the{' '}
                            <a href="https://cloud.junctionrelay.com/settings" target="_blank" rel="noopener noreferrer">
                                cloud dashboard
                            </a>{' '}(Settings → MCP Connector, Pro).
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1, mb: 2, flexWrap: 'wrap' }}>
                        <TextField
                            label="Interval (minutes)"
                            size="small"
                            type="number"
                            sx={{ width: 140 }}
                            value={status.intervalMinutes}
                            onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                if (!Number.isNaN(v) && v >= 1 && v <= 1440) updateSettings({ intervalMinutes: v });
                            }}
                        />
                        <Button
                            variant="contained"
                            size="small"
                            startIcon={syncing ? <CircularProgress size={16} color="inherit" /> : <CloudUploadIcon />}
                            disabled={syncing || !status.cloudAuthenticated}
                            onClick={syncNow}
                        >
                            Sync now
                        </Button>
                        {status.lastSuccessAt && (
                            <Chip size="small" color="success"
                                label={`Last synced ${new Date(status.lastSuccessAt).toLocaleString()}`} />
                        )}
                        {status.lastError && (
                            <Chip size="small" color="error" label={status.lastError} />
                        )}
                    </Box>

                    {status.lastCounts && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Last push: {Object.entries(status.lastCounts).map(([k, v]) => `${v} ${k}`).join(', ')}
                        </Typography>
                    )}
                </Box>
            )}

            {tab === 1 && (
                <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Per-device cloud sync sends device health (and, in full sync mode, device
                        state) to the cloud dashboard. Off by default — consistent with the rest
                        of cloud sync, nothing leaves this machine until enabled here.
                    </Typography>
                    <FormControlLabel
                        control={<Switch
                            checked={deviceSyncEnabled ?? false}
                            disabled={deviceSyncEnabled === null}
                            onChange={(e) => toggleDeviceSync(e.target.checked)} />}
                        label="Enable device cloud sync"
                    />
                    <Alert severity="info" sx={{ mt: 1 }}>
                        Devices are synced selectively: once enabled, go to the Devices page,
                        right-click a device and pick <strong>Cloud Sync Mode</strong> (Health
                        Only or Full Sync) per device. While this switch is off, that menu shows
                        "Cloud Sync Disabled" and no device data is sent.
                    </Alert>
                </Box>
            )}

            {tab === 2 && (
                <Box>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        Sync is a field-level allowlist: only the columns listed here are sent — the
                        list is generated from the sync code itself. Never synced:{' '}
                        {contract ? contract.excluded.join(', ') : 'IP addresses, hostnames, serial numbers, notes, spec JSON, file paths, locations, ports'}.
                    </Alert>
                    {contract ? (
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Entity</TableCell>
                                    <TableCell>Fields that sync</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {Object.entries(contract.entities).map(([entity, fields]) => (
                                    <TableRow key={entity}>
                                        <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>{entity}</TableCell>
                                        <TableCell>{fields.join(', ')}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>
                    )}
                </Box>
            )}

            <Snackbar
                open={snackbar.open}
                autoHideDuration={5000}
                onClose={() => setSnackbar(s => ({ ...s, open: false }))}
            >
                <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default Settings_LabCloudSync;
