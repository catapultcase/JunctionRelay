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

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    MenuItem,
    Box,
    Typography,
    Chip,
    IconButton,
    Tooltip,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    CircularProgress,
    Divider,
} from "@mui/material";
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import DescriptionIcon from '@mui/icons-material/Description';
import { type LabComponentFull, componentDisplayName } from './Lab_Inventory_Helpers';
import { errorMessage } from '../utils/errors';

export interface LabAttachment {
    id: number;
    componentId?: number | null;
    machineId?: number | null;
    kind: string;
    fileName: string;
    contentType?: string | null;
    sizeBytes?: number | null;
    notes?: string | null;
    createdAt: string;
}

const ATTACHMENT_KINDS = ['Invoice', 'Manual', 'Photo', 'Other'];

const formatSize = (bytes?: number | null) => {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface LabComponentAttachmentsDialogProps {
    open: boolean;
    onClose: () => void;
    component: LabComponentFull | null;
    onChanged: () => void;     // parent refreshes counts
    onError: (message: string) => void;
}

const LabComponentAttachmentsDialog: React.FC<LabComponentAttachmentsDialogProps> = ({
    open, onClose, component, onChanged, onError,
}) => {
    const [attachments, setAttachments] = useState<LabAttachment[]>([]);
    // An integrated part has no invoice of its own - it is on the thing that was bought.
    const [inherited, setInherited] = useState<LabAttachment[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [kind, setKind] = useState('Invoice');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchAttachments = useCallback(async () => {
        if (!component) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/lab/attachments?componentId=${component.id}`);
            if (response.ok) setAttachments(await response.json());
        } catch { /* non-fatal */ }
        finally { setLoading(false); }
    }, [component]);

    useEffect(() => {
        if (open) fetchAttachments();
    }, [open, fetchAttachments]);

    useEffect(() => {
        const sourceId = component?.invoiceSourceComponentId;
        if (!open || !sourceId) { setInherited([]); return; }
        fetch(`/api/lab/attachments?componentId=${sourceId}`)
            .then(r => (r.ok ? r.json() : []))
            .then(setInherited)
            .catch(() => setInherited([]));
    }, [open, component?.invoiceSourceComponentId]);

    const handleUpload = async (files: FileList | null) => {
        if (!files || files.length === 0 || !component) return;
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                const form = new FormData();
                form.append('file', file);
                form.append('componentId', String(component.id));
                form.append('kind', kind);
                const response = await fetch('/api/lab/attachments', { method: 'POST', body: form });
                if (!response.ok) throw new Error(await response.text());
            }
            fetchAttachments();
            onChanged();
        } catch (err) {
            onError(`Failed to upload: ${errorMessage(err)}`);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (attachment: LabAttachment) => {
        if (!window.confirm(`Delete "${attachment.fileName}"?`)) return;
        try {
            const response = await fetch(`/api/lab/attachments/${attachment.id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error(await response.text());
            fetchAttachments();
            onChanged();
        } catch (err) {
            onError(`Failed to delete: ${errorMessage(err)}`);
        }
    };

    if (!component) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Attachments — {componentDisplayName(component)}</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, mt: 1 }}>
                    <TextField
                        label="Kind" size="small" select sx={{ minWidth: 130 }}
                        value={kind}
                        onChange={(e) => setKind(e.target.value)}
                    >
                        {ATTACHMENT_KINDS.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                    </TextField>
                    <Button
                        variant="contained" size="small" component="label"
                        startIcon={uploading ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
                        disabled={uploading}
                    >
                        Upload
                        <input
                            ref={fileInputRef}
                            type="file" hidden multiple
                            onChange={(e) => handleUpload(e.target.files)}
                        />
                    </Button>
                </Box>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : attachments.length > 0 ? (
                    <List dense disablePadding>
                        {attachments.map((a) => (
                            <ListItem
                                key={a.id}
                                disableGutters
                                secondaryAction={
                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                        <Tooltip title="Download">
                                            <IconButton
                                                size="small"
                                                onClick={() => window.open(`/api/lab/attachments/${a.id}/download`, '_blank')}
                                            >
                                                <DownloadIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                            <IconButton size="small" color="error" onClick={() => handleDelete(a)}>
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                }
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                    <DescriptionIcon fontSize="small" />
                                </ListItemIcon>
                                <ListItemText
                                    primary={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {/* The name opens the file inline (browser's PDF viewer) in a
                                                new tab; the Download button still saves it. */}
                                            <Typography
                                                variant="body2" fontWeight="medium"
                                                sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                                onClick={() => window.open(`/api/lab/attachments/${a.id}/download?inline=true`, '_blank')}
                                            >
                                                {a.fileName}
                                            </Typography>
                                            <Chip label={a.kind} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
                                        </Box>
                                    }
                                    secondary={`${formatSize(a.sizeBytes)} · ${new Date(a.createdAt).toLocaleDateString()}`}
                                />
                            </ListItem>
                        ))}
                    </List>
                ) : inherited.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No attachments yet — upload an invoice, manual, or photo.
                    </Typography>
                ) : null}

                {inherited.length > 0 && (
                    <Box sx={{ mt: attachments.length > 0 ? 2 : 0 }}>
                        <Divider sx={{ mb: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                                From {component.invoiceSourceName || 'the parent part'} — the purchase this came in
                            </Typography>
                        </Divider>
                        <List dense disablePadding>
                            {inherited.map((a) => (
                                <ListItem
                                    key={`inherited-${a.id}`}
                                    disableGutters
                                    secondaryAction={
                                        <Tooltip title="Download">
                                            <IconButton
                                                size="small"
                                                onClick={() => window.open(`/api/lab/attachments/${a.id}/download`, '_blank')}
                                            >
                                                <DownloadIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    }
                                >
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        <DescriptionIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography
                                                    variant="body2"
                                                    sx={{ cursor: 'pointer', color: 'text.secondary', '&:hover': { textDecoration: 'underline' } }}
                                                    onClick={() => window.open(`/api/lab/attachments/${a.id}/download?inline=true`, '_blank')}
                                                >
                                                    {a.fileName}
                                                </Typography>
                                                <Chip label={a.kind} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.7rem' }} />
                                            </Box>
                                        }
                                        secondary={`${formatSize(a.sizeBytes)} · ${new Date(a.createdAt).toLocaleDateString()} · belongs to the parent`}
                                    />
                                </ListItem>
                            ))}
                        </List>
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default LabComponentAttachmentsDialog;
