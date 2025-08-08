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

import React, { useState, useEffect } from "react";
import {
    Box, Typography, Button, FormControlLabel, Checkbox,
    CircularProgress, Paper, Chip, Divider
} from "@mui/material";
import { AlertColor } from "@mui/material/Alert";
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoIcon from '@mui/icons-material/Info';
import ComputerIcon from '@mui/icons-material/Computer';
import EditIcon from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';

interface BackendInfo {
    databaseExists: boolean;
    databaseSize: number;
    keysDirectoryExists: boolean;
    keyFileCount: number;
    hasEncryptionKeys: boolean;
}

interface BackendIdentity {
    backendId: string;
    friendlyName: string;
}

interface CloudUserInfo {
    email?: string;
    userId?: string;
    hasValidLicense: boolean;
    message?: string;
}

interface SettingsDatabaseProps {
    showSnackbar: (message: string, severity?: AlertColor) => void;
    isMobile?: boolean;
    setFriendlyName?: (name: string) => void;
}

const Settings_Database: React.FC<SettingsDatabaseProps> = ({
    showSnackbar,
    isMobile = false,
    setFriendlyName
}) => {
    const [backupInfo, setBackupInfo] = useState<BackendInfo | null>(null);
    const [backendIdentity, setBackendIdentity] = useState<BackendIdentity | null>(null);
    const [includeKeys, setIncludeKeys] = useState<boolean>(true);
    const [includeIdentity, setIncludeIdentity] = useState<boolean>(true);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
    const [deleteLoading, setDeleteLoading] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    const [cloudUserInfo, setCloudUserInfo] = useState<CloudUserInfo | null>(null);
    const [isEditingName, setIsEditingName] = useState(false);
    const [pendingFriendlyName, setPendingFriendlyName] = useState<string | null>(null);
    const [savingName, setSavingName] = useState(false);

    const fetchBackupInfo = async () => {
        try {
            const res = await fetch("/api/db/backup-info");
            const data = await res.json();
            setBackupInfo(data);
        } catch (err) {
            console.error("Error loading backup info:", err);
        }
    };

    const fetchBackendIdentity = async () => {
        try {
            const res = await fetch("/api/db/backend-identity");
            if (res.ok) {
                const data = await res.json();
                setBackendIdentity(data);
                if (setFriendlyName) setFriendlyName(data.friendlyName);
            }
        } catch (err) {
            console.error("Error loading backend identity:", err);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([
                fetchBackupInfo(),
                fetchBackendIdentity()
            ]);
            setLoading(false);
        };
        loadData();
    }, []);

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const downloadBackup = async () => {
        try {
            const params = new URLSearchParams();
            if (includeKeys) params.append('includeKeys', 'true');
            if (includeIdentity) params.append('includeIdentity', 'true');

            const url = `/api/db/export-db${params.toString() ? '?' + params.toString() : ''}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to download backup");

            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);

            const timestamp = new Date()
                .toISOString()
                .replace(/[-:]/g, "")
                .replace("T", "_")
                .slice(0, 15);

            const filename = includeKeys || includeIdentity
                ? `junction_backup_complete_${timestamp}.zip`
                : `junction_backup_${timestamp}.db`;

            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(downloadUrl);

            let message = "Data only backup downloaded";
            if (includeKeys && includeIdentity) {
                message = "Complete backup downloaded";
            } else if (includeKeys) {
                message = "Data and secrets backup downloaded";
            } else if (includeIdentity) {
                message = "Data and identity backup downloaded";
            }

            showSnackbar(message);
        } catch {
            showSnackbar("Error downloading backup", "error");
        }
    };

    const handleDeleteDatabase = async () => {
        try {
            setDeleteLoading(true);
            const response = await fetch("/api/db/delete-database", { method: "DELETE" });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to schedule database deletion");
            }

            localStorage.clear();
            showSnackbar("Database deletion scheduled. Application restart required to complete the reset.", "warning");
            setDeleteConfirmOpen(false);
        } catch (error: any) {
            showSnackbar(error.message || "Error scheduling database deletion", "error");
        } finally {
            setDeleteLoading(false);
        }

        // Logout

        console.log("[CLOUD_AUTH] Logging out from cloud...");
        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');

            const response = await fetch("/api/cloud-auth/logout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${cloudToken}`
                },
            });

            if (response.ok) {
                console.log("[CLOUD_AUTH] Successfully logged out from cloud");
                localStorage.removeItem('cloud_proxy_token');
                localStorage.removeItem('junctionrelay_cloud_user');
                setCloudUserInfo(null);
                // showSnackbar("Logged out from JunctionRelay Cloud", "success");
            } else {
                throw new Error("Failed to logout from cloud");
            }
        } catch (error: any) {
            console.error("[CLOUD_AUTH] Error during cloud logout:", error);
            // Still clear local state even if server logout fails
            localStorage.removeItem('cloud_proxy_token');
            localStorage.removeItem('junctionrelay_cloud_user');
            setCloudUserInfo(null);
            // showSnackbar("Logged out locally from JunctionRelay Cloud", "warning");
        }
    };

    // Get backup type description
    const getBackupDescription = () => {
        if (!includeKeys && !includeIdentity) return "Data only";
        if (includeKeys && includeIdentity) return "Complete backup";
        if (includeKeys) return "Data and secrets";
        if (includeIdentity) return "Data and identity";
        return "Unknown";
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <>
            {/* Backend Identity and Database Status - Side by Side on Desktop */}
            {(backendIdentity || backupInfo) && (
                <Box sx={{ mb: 3 }}>
                    <Box sx={{
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        gap: 2
                    }}>
                        {/* Backend Identity Section */}
                        {backendIdentity && (
                            <Box sx={{ flex: backupInfo ? 1 : 'auto', minWidth: 0 }}>
                                <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                                    <ComputerIcon sx={{ mr: 1, fontSize: 16 }} />
                                    Backend Identity
                                </Typography>
                                <Box sx={{
                                    p: 2,
                                    bgcolor: 'rgba(0, 0, 0, 0.02)',
                                    borderRadius: 1,
                                    border: '1px solid rgba(0, 0, 0, 0.05)',
                                    height: 'fit-content'
                                }}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 'medium', minWidth: '50px' }}>
                                                Name:
                                            </Typography>

                                            {isEditingName ? (
                                                <>
                                                    <input
                                                        value={pendingFriendlyName ?? backendIdentity.friendlyName}
                                                        onChange={(e) => setPendingFriendlyName(e.target.value)}
                                                        style={{
                                                            fontFamily: 'monospace',
                                                            fontSize: '0.75rem',
                                                            padding: '2px 4px',
                                                            border: '1px solid #ccc',
                                                            borderRadius: 4,
                                                            minWidth: 120
                                                        }}
                                                    />
                                                    <Button
                                                        variant="contained"
                                                        size="small"
                                                        onClick={async () => {
                                                            try {
                                                                setSavingName(true);
                                                                const response = await fetch("/api/db/backend-identity/set-name", {
                                                                    method: "POST",
                                                                    headers: { "Content-Type": "application/json" },
                                                                    body: JSON.stringify({ friendlyName: pendingFriendlyName }),
                                                                });

                                                                if (!response.ok) {
                                                                    const errorData = await response.json();
                                                                    throw new Error(errorData.error || "Failed to update name");
                                                                }

                                                                const data = await response.json();
                                                                setBackendIdentity(data);
                                                                if (setFriendlyName) setFriendlyName(data.friendlyName);
                                                                showSnackbar("Friendly name updated", "success");
                                                                setIsEditingName(false);
                                                                setPendingFriendlyName(null);
                                                            } catch (err: any) {
                                                                showSnackbar(err.message || "Error saving name", "error");
                                                            } finally {
                                                                setSavingName(false);
                                                            }
                                                        }}
                                                        disabled={savingName || !pendingFriendlyName?.trim()}
                                                    >
                                                        Save
                                                    </Button>
                                                    <Button
                                                        variant="text"
                                                        size="small"
                                                        onClick={() => {
                                                            setIsEditingName(false);
                                                            setPendingFriendlyName(null);
                                                        }}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Chip
                                                        label={backendIdentity.friendlyName}
                                                        size="small"
                                                        color="primary"
                                                        sx={{ fontFamily: 'monospace' }}
                                                    />
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => setIsEditingName(true)}
                                                            sx={{ padding: 0 }}
                                                        >
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                </>
                                            )}
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 'medium', minWidth: '50px' }}>
                                                ID:
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{
                                                fontFamily: 'monospace',
                                                fontSize: '0.75rem',
                                                wordBreak: 'break-all',
                                                lineHeight: 1.2
                                            }}>
                                                {backendIdentity.backendId}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Box>
                            </Box>
                        )}

                        {/* Database Status Section */}
                        {backupInfo && (
                            <Box sx={{ flex: backendIdentity ? 1 : 'auto', minWidth: 0 }}>
                                <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                                    <InfoIcon sx={{ mr: 1, fontSize: 16 }} />
                                    Database Status
                                </Typography>
                                <Box sx={{
                                    p: 2,
                                    bgcolor: 'rgba(0, 0, 0, 0.02)',
                                    borderRadius: 1,
                                    border: '1px solid rgba(0, 0, 0, 0.05)',
                                    height: 'fit-content'
                                }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                        Database: {backupInfo.databaseExists ? `${formatFileSize(backupInfo.databaseSize)}` : 'Not found'}<br />
                                        Keys: {backupInfo.hasEncryptionKeys ? `${backupInfo.keyFileCount} files` : 'None'}<br />
                                        Encryption: {backupInfo.hasEncryptionKeys ? 'Active' : 'Inactive'}
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                    </Box>
                </Box>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Backup Controls */}
            <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Backup Options
                </Typography>

                <FormControlLabel
                    control={
                        <Checkbox
                            checked={includeKeys}
                            onChange={(e) => setIncludeKeys(e.target.checked)}
                            color="primary"
                        />
                    }
                    label="Include encryption keys"
                    sx={{ display: 'block', mb: 1 }}
                />

                <FormControlLabel
                    control={
                        <Checkbox
                            checked={includeIdentity}
                            onChange={(e) => setIncludeIdentity(e.target.checked)}
                            color="primary"
                        />
                    }
                    label="Include backend identity"
                    sx={{ display: 'block', mb: 1 }}
                />

                <Box sx={{
                    p: 1.5,
                    bgcolor: 'rgba(0, 0, 0, 0.02)',
                    borderRadius: 1,
                    border: '1px solid rgba(0, 0, 0, 0.05)'
                }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                        <strong>{getBackupDescription()}</strong>
                        {includeKeys && includeIdentity && " - Restore to a new system, recovering the same backend identity and encrypted secrets"}
                        {includeKeys && !includeIdentity && " - Includes encrypted secrets, but no backend identity - a new identity will be generated"}
                        {!includeKeys && includeIdentity && " - Includes backend identity, but no encrypted secrets - you'll need to re-enter passwords for collectors"}
                        {!includeKeys && !includeIdentity && " - Includes no backend identity or encrypted secrets"}
                    </Typography>
                </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 1, flexWrap: 'wrap' }}>
                <Button
                    variant="outlined"
                    startIcon={<SaveIcon />}
                    onClick={downloadBackup}
                    size="small"
                    fullWidth={isMobile}
                >
                    Download {getBackupDescription()}
                </Button>

                <label htmlFor="upload-db-settings">
                    <input
                        id="upload-db-settings"
                        type="file"
                        accept=".db,.zip"
                        style={{ display: "none" }}
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            const formData = new FormData();
                            formData.append("file", file);

                            try {
                                const res = await fetch("/api/db/import-db", {
                                    method: "POST",
                                    body: formData,
                                });

                                if (!res.ok) {
                                    const errorData = await res.json();
                                    throw new Error(errorData.error || "Failed to import database");
                                }

                                const result = await res.json();
                                showSnackbar(result.message);
                                fetchBackupInfo();
                            } catch (error: any) {
                                showSnackbar(error.message || "Error importing database", "error");
                            }
                        }}
                    />
                    <Button
                        variant="contained"
                        component="span"
                        size="small"
                        fullWidth={isMobile}
                    >
                        Upload Database
                    </Button>
                </label>

                <Button
                    variant="contained"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setDeleteConfirmOpen(true)}
                    size="small"
                    fullWidth={isMobile}
                >
                    Delete Database
                </Button>
            </Box>

            <Box sx={{
                mt: 2,
                p: 2,
                bgcolor: 'rgba(255, 244, 229, 0.8)',
                border: '1px solid rgba(255, 193, 7, 0.5)',
                borderRadius: 1
            }}>
                <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <InfoIcon sx={{ mr: 1, fontSize: 18 }} />
                    After Restoring a Backup
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    If using cloud authetnication, it is expected that backend's cloud authentication will fail after uploading a database backup.
                    This happens because existing session tokens become invalid for the restored backend identity.
                    <br /><br />
                    <strong>To restore access:</strong> simply log out and back in through the User Management panel above.
                </Typography>
            </Box>

            {/* Delete Database Confirmation Dialog */}
            {deleteConfirmOpen && (
                <Box
                    sx={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999
                    }}
                    onClick={() => setDeleteConfirmOpen(false)}
                >
                    <Paper
                        sx={{ p: 3, maxWidth: 400, mx: 2 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Typography variant="h6" gutterBottom>
                            Confirm Database Deletion
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            This will permanently delete all data and reset the backend identity.
                            A new backend ID will be generated on restart. This action cannot be undone.
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                            <Button
                                onClick={() => setDeleteConfirmOpen(false)}
                                disabled={deleteLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleDeleteDatabase}
                                color="error"
                                variant="contained"
                                disabled={deleteLoading}
                                startIcon={deleteLoading ? <CircularProgress size={16} /> : <DeleteIcon />}
                            >
                                {deleteLoading ? 'Deleting...' : 'Delete Database'}
                            </Button>
                        </Box>
                    </Paper>
                </Box>
            )}
        </>
    );
};

export default Settings_Database;