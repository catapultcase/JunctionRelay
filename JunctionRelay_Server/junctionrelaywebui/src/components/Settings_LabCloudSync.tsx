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
    Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, FormControlLabel, Link, Paper, Snackbar,
    Switch, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { AlertColor } from '@mui/material/Alert';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { errorMessage } from '../utils/errors';

// Cloud Sync & Cloud MCP - what this server shares with JunctionRelay Cloud (a Pro feature cloud-side;
// everything local is free). Each category is shared or not, and inside a shared category each broad
// feature is opted into on its own; every feature lists exactly the fields it sends, read from the sync
// code (GET api/lab/cloudsync/contract). Nothing is shared until switched on here. Devices have their own
// switch and a per-device choice on the Devices page.

interface HomelabShare { enabled: boolean; movements: boolean; purchases: boolean; spaces: boolean; attachments: boolean }
interface ModelsShare { enabled: boolean; serving: boolean; scores: boolean; benchmarks: boolean }
interface Share { homelab: HomelabShare; models: ModelsShare }
interface SyncStatus {
    share: Share;
    intervalMinutes: number;
    cloudAuthenticated: boolean;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastCounts: Record<string, number> | null;
}
interface Feature { key: string; label: string; description: string; fields: Record<string, string[]> }
interface Category { key: string; label: string; features: Feature[]; neverShared: string[] }
interface ShareContract { schemaVersion: number; categories: Category[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStatus = (v: unknown): v is SyncStatus => isObj(v) && isObj(v.share) && typeof v.intervalMinutes === 'number';
const isContract = (v: unknown): v is ShareContract => isObj(v) && Array.isArray(v.categories);

type CategoryKey = 'homelab' | 'models';

const Settings_LabCloudSync: React.FC = () => {
    const [tab, setTab] = useState(0);
    const [deviceSyncEnabled, setDeviceSyncEnabled] = useState<boolean | null>(null);
    const [status, setStatus] = useState<SyncStatus | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);
    const [contract, setContract] = useState<ShareContract | null>(null);
    const [contractError, setContractError] = useState<string | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
        open: false, message: '', severity: 'info'
    });
    const notify = (message: string, severity: AlertColor = 'info') => setSnackbar({ open: true, message, severity });

    const loadStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/lab/cloudsync/status');
            if (!res.ok) throw new Error(await res.text());
            const body: unknown = await res.json();
            if (!isStatus(body)) throw new Error('Unexpected status reply');
            setStatus(body); setStatusError(null);
        } catch (e) { setStatusError(errorMessage(e)); }
    }, []);
    useEffect(() => { loadStatus(); }, [loadStatus]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/lab/cloudsync/contract');
                if (!res.ok) throw new Error(await res.text());
                const body: unknown = await res.json();
                if (!isContract(body)) throw new Error('Unexpected contract reply');
                setContract(body);
            } catch (e) { setContractError(errorMessage(e)); }
        })();
    }, []);

    // Device sync master switch rides the generic settings/flags pipeline.
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/settings/flags');
                if (res.ok) {
                    const flags: unknown = await res.json();
                    setDeviceSyncEnabled(isObj(flags) && flags.device_cloud_sync_enabled === true);
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

    const saveShare = async (share: Share) => {
        if (!status) return;
        const before = status;
        setStatus({ ...status, share });
        try {
            const res = await fetch('/api/lab/cloudsync/share', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(share)
            });
            if (!res.ok) throw new Error(await res.text());
            const body: unknown = await res.json();
            if (isObj(body) && typeof body.pushed === 'string') notify(body.pushed, 'success');
            await loadStatus();
        } catch (e) {
            setStatus(before);
            notify(errorMessage(e), 'error');
        }
    };

    const setPushInterval = async (minutes: number) => {
        try {
            const res = await fetch('/api/lab/cloudsync/settings', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intervalMinutes: minutes })
            });
            if (!res.ok) throw new Error(await res.text());
            const body: unknown = await res.json();
            if (isStatus(body)) setStatus(body);
        } catch (e) { notify(errorMessage(e), 'error'); }
    };

    const syncNow = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/lab/cloudsync/now', { method: 'POST' });
            const body: unknown = await res.json();
            if (!res.ok) throw new Error(isObj(body) && typeof body.error === 'string' ? body.error : 'Sync failed');
            notify('Pushed to the cloud', 'success');
        } catch (e) {
            notify(errorMessage(e), 'error');
        } finally {
            setSyncing(false);
            await loadStatus();
        }
    };

    if (!status) {
        return statusError
            ? <Alert severity="error">Cloud sync status could not be read: {statusError}</Alert>
            : <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>;
    }
    const share = status.share;
    const anyShared = share.homelab.enabled || share.models.enabled;

    // whether a feature is on, and how to flip it
    const featureOn = (cat: CategoryKey, key: string): boolean => {
        if (key === 'base') return share[cat].enabled;
        if (cat === 'homelab') {
            const h = share.homelab;
            return key === 'movements' ? h.movements : key === 'purchases' ? h.purchases : key === 'spaces' ? h.spaces : key === 'attachments' ? h.attachments : false;
        }
        return key === 'serving' ? share.models.serving : key === 'scores' ? share.models.scores : key === 'benchmarks' ? share.models.benchmarks : false;
    };
    const setFeature = (cat: CategoryKey, key: string, on: boolean) => {
        if (cat === 'homelab') {
            const h = { ...share.homelab };
            if (key === 'movements') h.movements = on;
            if (key === 'purchases') h.purchases = on;
            if (key === 'spaces') h.spaces = on;
            if (key === 'attachments') h.attachments = on;
            saveShare({ ...share, homelab: h });
        } else {
            const m = { ...share.models };
            if (key === 'serving') m.serving = on;
            if (key === 'scores') m.scores = on;
            if (key === 'benchmarks') m.benchmarks = on;
            saveShare({ ...share, models: m });
        }
    };
    const setCategory = (cat: CategoryKey, on: boolean) =>
        saveShare(cat === 'homelab' ? { ...share, homelab: { ...share.homelab, enabled: on } } : { ...share, models: { ...share.models, enabled: on } });

    const categoryPanel = (cat: CategoryKey) => {
        const c = contract?.categories.find(x => x.key === cat);
        const on = share[cat].enabled;
        return (
            <Box>
                <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <FormControlLabel sx={{ m: 0 }}
                        control={<Switch checked={on} onChange={e => setCategory(cat, e.target.checked)} />}
                        label={<Typography sx={{ fontWeight: 700 }}>Share {c?.label ?? cat} with JunctionRelay Cloud</Typography>} />
                    <Typography variant="body2" color="text.secondary">
                        {on ? 'Shared. Tick the extra things below you also want to share.' : 'Not shared. Nothing in this category leaves this machine.'}
                    </Typography>
                </Paper>
                {contractError && <Alert severity="error" sx={{ mb: 2 }}>The list of shared fields could not be read: {contractError}</Alert>}
                {!c && !contractError && <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>}
                {c && c.features.map(f => {
                    const base = f.key === 'base';
                    const checked = featureOn(cat, f.key);
                    const id = `${cat}.${f.key}`;
                    return (
                        <Box key={id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1, opacity: on ? 1 : 0.5 }}>
                            <Checkbox size="small" checked={checked} disabled={!on || base} onChange={e => setFeature(cat, f.key, e.target.checked)} sx={{ mt: -0.5 }} />
                            <Box sx={{ flex: 1 }}>
                                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                                    {f.label}{base && <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 400 }}> - always included when {c.label} is shared</Typography>}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {f.description}{' '}
                                    <Link component="button" type="button" variant="body2" onClick={() => setOpen(open === id ? null : id)}>
                                        {open === id ? 'Hide the exact fields' : 'Show the exact fields'}
                                    </Link>
                                </Typography>
                                <Collapse in={open === id}>
                                    <Box sx={{ mt: 0.5, pl: 1, borderLeft: 2, borderColor: 'divider' }}>
                                        {Object.entries(f.fields).map(([entity, fields]) => (
                                            <Typography key={entity} sx={{ fontSize: 12 }}>
                                                <b>{entity}:</b> <Box component="span" sx={{ fontFamily: 'monospace' }}>{fields.join(', ')}</Box>
                                            </Typography>
                                        ))}
                                    </Box>
                                </Collapse>
                            </Box>
                        </Box>
                    );
                })}
                {c && (
                    <Alert severity="info" sx={{ mt: 1.5 }}>
                        Never shared from {c.label}, whatever you tick: {c.neverShared.join(', ')}. If a private IP address was typed into a shared field, it is removed before anything leaves.
                    </Alert>
                )}
            </Box>
        );
    };

    return (
        <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Choose what this server shares with JunctionRelay Cloud: the cloud dashboard shows it, and the Cloud MCP
                connector lets an AI assistant read it (read-only - nothing comes back down; changes are made here).
                Nothing is shared until you switch a category on. The connector&apos;s API key is managed in the{' '}
                <Link href="https://cloud.junctionrelay.com/settings" target="_blank" rel="noopener noreferrer">cloud dashboard</Link> (Settings → MCP Connector, Pro).
            </Typography>

            {!status.cloudAuthenticated && (
                <Alert severity="info" sx={{ mb: 2 }}>Log in to JunctionRelay Cloud first (Authentication section) - sharing uses your cloud account.</Alert>
            )}

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
                <TextField label="Push every (minutes)" size="small" type="number" sx={{ width: 170 }} value={status.intervalMinutes}
                    onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v) && v >= 1 && v <= 1440) setPushInterval(v);
                    }} />
                <Button variant="contained" size="small" disabled={syncing || !status.cloudAuthenticated || !anyShared} onClick={syncNow}
                    startIcon={syncing ? <CircularProgress size={16} color="inherit" /> : <CloudUploadIcon />}>
                    Push now
                </Button>
                {status.lastSuccessAt && <Chip size="small" color="success" label={`Last pushed ${new Date(status.lastSuccessAt).toLocaleString()}`} />}
                {status.lastError && <Chip size="small" color="error" label={status.lastError} />}
                {status.lastCounts && (
                    <Typography variant="caption" color="text.secondary">
                        Last push: {Object.entries(status.lastCounts).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing'}
                    </Typography>
                )}
            </Box>

            <Tabs value={tab} onChange={(_, v) => typeof v === 'number' && setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Tab label={`Homelab${share.homelab.enabled ? ' · shared' : ''}`} />
                <Tab label={`Models${share.models.enabled ? ' · shared' : ''}`} />
                <Tab label={`Devices${deviceSyncEnabled ? ' · shared' : ''}`} />
            </Tabs>

            {tab === 0 && categoryPanel('homelab')}
            {tab === 1 && categoryPanel('models')}
            {tab === 2 && (
                <Box>
                    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <FormControlLabel sx={{ m: 0 }}
                            control={<Switch checked={deviceSyncEnabled ?? false} disabled={deviceSyncEnabled === null}
                                onChange={e => toggleDeviceSync(e.target.checked)} />}
                            label={<Typography sx={{ fontWeight: 700 }}>Share devices with JunctionRelay Cloud</Typography>} />
                        <Typography variant="body2" color="text.secondary">
                            {deviceSyncEnabled ? 'Shared - per device, as chosen on the Devices page.' : 'Not shared. No device data leaves this machine.'}
                        </Typography>
                    </Paper>
                    <Typography variant="body2" color="text.secondary">
                        Each device is opted in on its own: on the Devices page, right-click a device and pick <strong>Cloud Sync Mode</strong>.
                        <b> Health Only</b> sends whether it is up and its health; <b>Full Sync</b> also sends its state. A device left at the default
                        sends nothing.
                    </Typography>
                </Box>
            )}

            <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
                <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
            </Snackbar>
        </Box>
    );
};

export default Settings_LabCloudSync;
