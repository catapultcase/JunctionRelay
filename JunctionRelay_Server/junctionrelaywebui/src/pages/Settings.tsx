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
    Box, Typography, Button, TableContainer, Table, TableHead, TableRow, TableCell, TableBody,
    Paper, Snackbar, Alert, CircularProgress, Switch,
    useMediaQuery, useTheme, List, ListItem, Accordion, AccordionSummary, AccordionDetails,
    Chip
} from "@mui/material";
import { AlertColor } from "@mui/material/Alert";
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TuneIcon from '@mui/icons-material/Tune';
import History from '@mui/icons-material/History';
import PeopleIcon from '@mui/icons-material/People';
import StorageIcon from '@mui/icons-material/Storage';
import MemoryIcon from '@mui/icons-material/Memory';
import TableChartIcon from '@mui/icons-material/TableChart';
import NotificationsIcon from '@mui/icons-material/Notifications';
import DashboardIcon from '@mui/icons-material/Dashboard';
import RestoreIcon from '@mui/icons-material/Restore';
import SecurityIcon from '@mui/icons-material/Security';
import BackupIcon from '@mui/icons-material/Backup';

import Settings_UserManagement from '../components/Settings_UserManagement';
import Settings_SessionManagement from '../components/Settings_SessionManagement';
import Settings_Database from '../components/Settings_Database';
import Settings_Backups from '../components/Settings_CloudBackups';
import StreamHistorySettings from '../components/StreamHistorySettings';
import DashboardSettings from '../components/Dashboard_Settings';


interface SettingItem {
    id: string;
    key: string;
    value: string;
    description?: string;
}

interface BackupInfo {
    databaseExists: boolean;
    databaseSize: number;
    keysDirectoryExists: boolean;
    keyFileCount: number;
    hasEncryptionKeys: boolean;
}

interface CloudUserInfo {
    email?: string;
    userId?: string;
    hasValidLicense: boolean;
    message?: string;
}

interface AccordionState {
    [key: string]: boolean;
}

const Settings: React.FC = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [settings, setSettings] = useState<SettingItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
    const [includeKeys, setIncludeKeys] = useState<boolean>(true);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
    const [deleteLoading, setDeleteLoading] = useState<boolean>(false);
    const [backendFriendlyName, setBackendFriendlyName] = useState<string | null>(null);
    const [cloudUserInfo, setCloudUserInfo] = useState<CloudUserInfo | null>(null);


    // Check if Dashboard Settings is dismissed
    const [isDashboardSettingsDismissed, setIsDashboardSettingsDismissed] = useState<boolean>(() => {
        return localStorage.getItem('dashboard_settings_dismissed') === 'true';
    });

    // Accordion states with localStorage persistence
    const [accordionStates, setAccordionStates] = useState<AccordionState>(() => {
        try {
            const saved = localStorage.getItem('settings_accordion_states');
            return saved ? JSON.parse(saved) : {
                userManagement: true,
                sessionManagement: false,
                streamHistory: false,
                pushNotifications: false,
                dashboardSettings: false,
                database: false,
                cloudBackups: false,
                cache: false,
                columns: false,
                appSettings: true
            };
        } catch {
            return {
                userManagement: true,
                sessionManagement: false,
                streamHistory: false,
                pushNotifications: false,
                dashboardSettings: false,
                database: false,
                cloudBackups: false,
                cache: false,
                columns: false,
                appSettings: true
            };
        }
    });

    // Snackbar state
    const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
    const [snackbarMessage, setSnackbarMessage] = useState<string>("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");

    const showSnackbar = (message: string, severity: AlertColor = "success") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    };

    const handleAccordionChange = (section: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
        setAccordionStates(prev => ({
            ...prev,
            [section]: isExpanded
        }));
    };

    // Function to restore Dashboard Settings
    const handleRestoreDashboardSettings = () => {
        localStorage.setItem('dashboard_settings_dismissed', 'false');
        setIsDashboardSettingsDismissed(false);
        showSnackbar('Dashboard Settings restored. They will appear on the Dashboard page again.', 'success');
    };

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/settings");
            const data = await res.json();
            setSettings(data);
        } catch (err) {
            showSnackbar("Error loading settings", "error");
        } finally {
            setLoading(false);
        }
    };

    const fetchBackupInfo = async () => {
        try {
            const res = await fetch("/api/db/backup-info");
            const data = await res.json();
            setBackupInfo(data);
        } catch (err) {
            console.error("Error loading backup info:", err);
        }
    };

    const fetchCloudUserInfo = async () => {
        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            if (!cloudToken) {
                setCloudUserInfo(null);
                return;
            }

            const response = await fetch('/api/unified-auth/user-info', {
                headers: {
                    'Authorization': `Bearer ${cloudToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setCloudUserInfo(data);
            } else {
                setCloudUserInfo(null);
            }
        } catch (error) {
            console.error('Error fetching cloud user info:', error);
            setCloudUserInfo(null);
        }
    };

    const downloadBackup = async () => {
        try {
            const url = `/api/db/export-db${includeKeys ? '?includeKeys=true' : ''}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to download backup");

            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);

            const timestamp = new Date()
                .toISOString()
                .replace(/[-:]/g, "")
                .replace("T", "_")
                .slice(0, 15);

            const filename = includeKeys
                ? `junction_backup_with_keys_${timestamp}.zip`
                : `junction_backup_${timestamp}.db`;

            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(downloadUrl);

            const message = includeKeys
                ? "Complete backup package downloaded (database + encryption keys)"
                : "Database backup downloaded (database only)";
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
    };

    // Save accordion states to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('settings_accordion_states', JSON.stringify(accordionStates));
        } catch {
            // Ignore localStorage errors
        }
    }, [accordionStates]);

    // Listen for changes to dashboard settings dismissed state
    useEffect(() => {
        const handleStorageChange = () => {
            setIsDashboardSettingsDismissed(localStorage.getItem('dashboard_settings_dismissed') === 'true');
        };

        // Listen for localStorage changes from other tabs/windows
        window.addEventListener('storage', handleStorageChange);

        // Also listen for our custom event when changed in same tab
        const handleLocalChange = () => {
            setIsDashboardSettingsDismissed(localStorage.getItem('dashboard_settings_dismissed') === 'true');
        };

        window.addEventListener('dashboard-settings-dismissed-changed', handleLocalChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('dashboard-settings-dismissed-changed', handleLocalChange);
        };
    }, []);

    // Bottom action bar event listeners
    useEffect(() => {
        const handleBottomActionBackup = () => {
            downloadBackup();
        };

        const handleBottomActionClearCache = async () => {
            try {
                const response = await fetch("/api/cache/clear", { method: "DELETE" });
                if (response.ok) {
                    const result = await response.json();
                    showSnackbar(`Cache cleared successfully. ${result.filesDeleted || 0} files removed.`, "success");
                } else {
                    throw new Error("Failed to clear cache");
                }
            } catch (error) {
                console.error("Error clearing cache:", error);
                showSnackbar("Error clearing cache", "error");
            }
        };

        const handleBottomActionResetColumns = () => {
            try {
                const keys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) keys.push(key);
                }

                const columnKeys = keys.filter(key =>
                    key.includes('columns') ||
                    key.includes('_sensors_') ||
                    key.includes('junction') ||
                    key.includes('collector') ||
                    key.includes('devices_visible_columns') ||
                    key.includes('devices_sort_state') ||
                    key.includes('devices_refresh_interval') ||
                    key.includes('dashboard_visible_junction_cols') ||
                    key.includes('junction_sort_state') ||
                    key.includes('_unified') ||
                    key.includes('_jr') ||
                    key.includes('_other')
                );

                let resetCount = 0;
                columnKeys.forEach(key => {
                    localStorage.removeItem(key);
                    resetCount++;
                });

                showSnackbar(`Reset ${resetCount} settings. Refresh to see changes.`, "success");
            } catch (error) {
                console.error("Error resetting column preferences:", error);
                showSnackbar("Error resetting column preferences", "error");
            }
        };

        // Add event listeners
        window.addEventListener('bottom-action-backup', handleBottomActionBackup);
        window.addEventListener('bottom-action-clear-cache', handleBottomActionClearCache);
        window.addEventListener('bottom-action-reset-columns', handleBottomActionResetColumns);

        // Cleanup
        return () => {
            window.removeEventListener('bottom-action-backup', handleBottomActionBackup);
            window.removeEventListener('bottom-action-clear-cache', handleBottomActionClearCache);
            window.removeEventListener('bottom-action-reset-columns', handleBottomActionResetColumns);
        };
    }, [includeKeys]); // Remove downloadBackup from dependencies since it's not stable

    useEffect(() => {
        fetchSettings();
        fetchBackupInfo();
        fetchCloudUserInfo();
    }, []);

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const isBooleanValue = (value: string): boolean => {
        return value.toLowerCase() === 'true' || value.toLowerCase() === 'false';
    };

    const handleToggle = async (item: SettingItem) => {
        try {
            const newValue = item.value.toLowerCase() === 'true' ? 'false' : 'true';
            const response = await fetch(`/api/settings/${item.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...item, value: newValue })
            });

            if (response.ok) {
                fetchSettings();
                showSnackbar("Setting updated");

                // Dispatch events for components to listen for setting changes
                const settingKey = item.key;

                window.dispatchEvent(new CustomEvent('settings-changed', {
                    detail: {
                        key: settingKey,
                        value: newValue,
                        setting: { ...item, value: newValue }
                    }
                }));

                const flagKeys = ['mobile_navigation_on_desktop', 'top_bar_show_current_version'];
                if (flagKeys.includes(settingKey)) {
                    window.dispatchEvent(new CustomEvent('flags-changed', {
                        detail: {
                            [settingKey]: newValue,
                            key: settingKey,
                            value: newValue
                        }
                    }));
                }
            } else {
                throw new Error("Failed to save setting");
            }
        } catch {
            showSnackbar("Error saving setting", "error");
        }
    };

    const handleAlignmentToggle = async (item: SettingItem) => {
        try {
            const newValue = item.value.toLowerCase() === 'left' ? 'right' : 'left';
            const response = await fetch(`/api/settings/${item.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...item, value: newValue })
            });

            if (response.ok) {
                fetchSettings();
                showSnackbar(`${item.key} alignment set to ${newValue}`);

                window.dispatchEvent(new CustomEvent('settings-changed', {
                    detail: {
                        key: item.key,
                        value: newValue,
                        setting: { ...item, value: newValue }
                    }
                }));

                window.dispatchEvent(new CustomEvent('flags-changed', {
                    detail: {
                        [item.key]: newValue,
                        key: item.key,
                        value: newValue
                    }
                }));
            } else {
                throw new Error("Failed to save setting");
            }
        } catch {
            showSnackbar("Error saving setting", "error");
        }
    };

    // Render mobile-optimized settings list
    const renderMobileSettingsList = () => (
        <List disablePadding>
            {settings.map((setting, index) => {
                const isReadOnly = setting.key === 'authentication_mode';
                const isBoolean = isBooleanValue(setting.value);
                const isAlignment = setting.key === 'device_actions_alignment' || setting.key === 'junction_actions_alignment';
                const isLast = index === settings.length - 1;

                return (
                    <ListItem
                        key={setting.id}
                        sx={{
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            borderBottom: isLast ? 'none' : '1px solid',
                            borderColor: 'divider',
                            py: 2,
                            px: 0
                        }}
                    >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', mb: 1 }}>
                            <Box sx={{ flex: 1, mr: 2 }}>
                                <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                                    {setting.key}
                                </Typography>
                                {setting.description && (
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                        {setting.description}
                                    </Typography>
                                )}
                            </Box>

                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                {isReadOnly ? (
                                    <Chip label="Read Only" size="small" variant="outlined" />
                                ) : isBoolean ? (
                                    <Switch
                                        checked={setting.value.toLowerCase() === 'true'}
                                        onChange={() => handleToggle(setting)}
                                        color="primary"
                                        size="small"
                                    />
                                ) : isAlignment ? (
                                    <Switch
                                        checked={setting.value.toLowerCase() === 'right'}
                                        onChange={() => handleAlignmentToggle(setting)}
                                        size="small"
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': {
                                                color: 'grey.300',
                                            },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                                backgroundColor: 'grey.400',
                                            }
                                        }}
                                    />
                                ) : null}

                                <Chip
                                    label={setting.value}
                                    size="small"
                                    sx={{
                                        fontFamily: 'monospace',
                                        backgroundColor: isBoolean
                                            ? (setting.value.toLowerCase() === 'true' ? 'success.light' : 'grey.200')
                                            : 'grey.100'
                                    }}
                                />
                            </Box>
                        </Box>
                    </ListItem>
                );
            })}
        </List>
    );

    // Render desktop table
    const renderDesktopSettingsTable = () => (
        <TableContainer component={Paper}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Key</TableCell>
                        <TableCell>Control</TableCell>
                        <TableCell>Value</TableCell>
                        <TableCell>Description</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {settings.map(setting => {
                        const isReadOnly = setting.key === 'authentication_mode';
                        const isBoolean = isBooleanValue(setting.value);
                        const isAlignment = setting.key === 'device_actions_alignment' || setting.key === 'junction_actions_alignment';

                        return (
                            <TableRow key={setting.id}>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                    {setting.key}
                                </TableCell>

                                <TableCell>
                                    {isReadOnly ? (
                                        <Typography variant="body2" color="text.disabled">
                                            Read Only
                                        </Typography>
                                    ) : isBoolean ? (
                                        <Switch
                                            checked={setting.value.toLowerCase() === 'true'}
                                            onChange={() => handleToggle(setting)}
                                            color="primary"
                                            size="small"
                                        />
                                    ) : isAlignment ? (
                                        <Switch
                                            checked={setting.value.toLowerCase() === 'right'}
                                            onChange={() => handleAlignmentToggle(setting)}
                                            size="small"
                                            sx={{
                                                '& .MuiSwitch-switchBase.Mui-checked': {
                                                    color: 'grey.300',
                                                },
                                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                                    backgroundColor: 'grey.400',
                                                }
                                            }}
                                        />
                                    ) : (
                                        <Typography variant="body2" color="text.disabled">
                                            —
                                        </Typography>
                                    )}
                                </TableCell>

                                <TableCell>
                                    {isBoolean ? (
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontFamily: 'monospace',
                                                color: setting.value.toLowerCase() === 'true' ? 'success.main' : 'text.secondary',
                                                fontWeight: 'medium'
                                            }}
                                        >
                                            {setting.value}
                                        </Typography>
                                    ) : isAlignment ? (
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontFamily: 'monospace',
                                                color: 'text.secondary',
                                                fontWeight: 'medium'
                                            }}
                                        >
                                            {setting.value}
                                        </Typography>
                                    ) : (
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontFamily: 'monospace',
                                                bgcolor: 'rgba(0, 0, 0, 0.04)',
                                                px: 1,
                                                py: 0.5,
                                                borderRadius: 1,
                                                display: 'inline-block'
                                            }}
                                        >
                                            {setting.value}
                                        </Typography>
                                    )}
                                </TableCell>

                                <TableCell sx={{ color: 'text.secondary' }}>
                                    {setting.description || "—"}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );

    return (
        <Box sx={{ padding: isMobile ? 1 : 2, pb: isMobile ? 10 : 2 }}>
            <Typography variant="h5" gutterBottom sx={{ px: isMobile ? 1 : 0 }}>
                Settings
            </Typography>

            {/* Unified Accordion Layout for Both Mobile and Desktop */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>

                {/* User Management */}
                <Accordion
                    expanded={accordionStates.userManagement}
                    onChange={handleAccordionChange('userManagement')}
                    elevation={isMobile ? 1 : 2}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <PeopleIcon sx={{ mr: 1 }} />
                            <Typography variant="h6">User Management</Typography>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: isMobile ? 1 : 3 }}>
                        <Settings_UserManagement showSnackbar={showSnackbar} />
                    </AccordionDetails>
                </Accordion>

                {/* Session Management */}
                <Accordion
                    expanded={accordionStates.sessionManagement}
                    onChange={handleAccordionChange('sessionManagement')}
                    elevation={isMobile ? 1 : 2}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <SecurityIcon sx={{ mr: 1 }} />
                            <Typography variant="h6">Session Management</Typography>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: isMobile ? 1 : 3 }}>
                        <Settings_SessionManagement
                            showSnackbar={showSnackbar}
                            isMobile={isMobile}
                        />
                    </AccordionDetails>
                </Accordion>

                {/* Database & Backend */}
                <Accordion
                    expanded={accordionStates.database}
                    onChange={handleAccordionChange('database')}
                    elevation={isMobile ? 1 : 2}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <StorageIcon sx={{ mr: 1 }} />
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="h6">Local Backups</Typography>
                                {backendFriendlyName && (
                                    <Chip
                                        label={backendFriendlyName}
                                        size="small"
                                        color="primary"
                                        sx={{ fontFamily: 'monospace' }}
                                    />
                                )}
                            </Box>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: isMobile ? 1 : 3 }}>
                        <Settings_Database
                            showSnackbar={showSnackbar}
                            isMobile={isMobile}
                            setFriendlyName={setBackendFriendlyName}
                        />
                    </AccordionDetails>
                </Accordion>

                {/* Cloud Backups */}
                <Accordion
                    expanded={accordionStates.cloudBackups}
                    onChange={handleAccordionChange('cloudBackups')}
                    elevation={isMobile ? 1 : 2}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <BackupIcon sx={{ mr: 1 }} />
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="h6">Cloud Backups</Typography>
                                <Chip
                                    label={
                                        cloudUserInfo?.hasValidLicense
                                            ? "Pro Feature Unlocked"
                                            : "Requires Pro License"
                                    }
                                    size="small"
                                    color={
                                        cloudUserInfo?.hasValidLicense
                                            ? "success" // ✅ green
                                            : "primary" // ✅ blue
                                    }
                                    sx={{ fontFamily: 'monospace' }}
                                />
                            </Box>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: isMobile ? 1 : 3 }}>
                        <Settings_Backups
                            showSnackbar={showSnackbar}
                            isMobile={isMobile}
                            cloudUserInfo={cloudUserInfo}
                        />
                    </AccordionDetails>
                </Accordion>



                {/* Stream History Settings */}
                <Accordion
                    expanded={accordionStates.streamHistory}
                    onChange={handleAccordionChange('streamHistory')}
                    elevation={isMobile ? 1 : 2}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <History sx={{ mr: 1 }} />
                            <Typography variant="h6">Stream History</Typography>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 0 }}>
                        <StreamHistorySettings showSnackbar={showSnackbar} />
                    </AccordionDetails>
                </Accordion>

                {/* Dashboard Settings - Always show but indicate if dismissed */}
                <Accordion
                    expanded={accordionStates.dashboardSettings}
                    onChange={handleAccordionChange('dashboardSettings')}
                    elevation={isMobile ? 1 : 2}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <DashboardIcon sx={{ mr: 1 }} />
                            <Typography variant="h6">Dashboard Settings</Typography>
                            {isDashboardSettingsDismissed && (
                                <Chip
                                    size="small"
                                    label="Hidden on Dashboard"
                                    color="warning"
                                    sx={{ ml: 1 }}
                                />
                            )}
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: isMobile ? 1 : 3 }}>
                        {isDashboardSettingsDismissed && (
                            <Box sx={{ mb: 3 }}>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    The Dashboard Settings panel has been dismissed from the Dashboard page.
                                    You can restore it or configure settings here.
                                </Typography>
                                <Button
                                    variant="outlined"
                                    startIcon={<RestoreIcon />}
                                    onClick={handleRestoreDashboardSettings}
                                    size="small"
                                    fullWidth={isMobile}
                                >
                                    Restore to Dashboard
                                </Button>
                            </Box>
                        )}

                        {/* Always show the Dashboard Settings component here, even if dismissed */}
                        <DashboardSettings
                            enabled={true} // Always enabled in Settings page
                            defaultExpanded={true}
                            storageKey="settings_dashboard_settings_expanded"
                            showDismissButton={false} // No dismiss button in Settings page
                            showAsCard={false} // Render as Paper, not Card in Settings
                            showSnackbar={showSnackbar}
                        />
                    </AccordionDetails>
                </Accordion>

                {/* Cache Management */}
                <Accordion
                    expanded={accordionStates.cache}
                    onChange={handleAccordionChange('cache')}
                    elevation={isMobile ? 1 : 2}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <MemoryIcon sx={{ mr: 1 }} />
                            <Typography variant="h6">Firmware Cache</Typography>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: isMobile ? 1 : 3 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Clear cached firmware release information to force fresh downloads.
                        </Typography>

                        <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 1 }}>
                            <Button
                                variant="outlined"
                                color="warning"
                                startIcon={<DeleteSweepIcon />}
                                onClick={async () => {
                                    try {
                                        const response = await fetch("/api/cache/clear", { method: "DELETE" });
                                        if (response.ok) {
                                            const result = await response.json();
                                            showSnackbar(`Cache cleared successfully. ${result.filesDeleted || 0} files removed.`, "success");
                                        } else {
                                            throw new Error("Failed to clear cache");
                                        }
                                    } catch (error) {
                                        console.error("Error clearing cache:", error);
                                        showSnackbar("Error clearing cache", "error");
                                    }
                                }}
                                size="small"
                                fullWidth={isMobile}
                            >
                                Clear Cache
                            </Button>

                            <Button
                                variant="outlined"
                                onClick={async () => {
                                    try {
                                        const response = await fetch("/api/cache/status");
                                        if (response.ok) {
                                            const result = await response.json();
                                            const cacheInfo = result.cacheFiles || [];
                                            if (cacheInfo.length === 0) {
                                                showSnackbar("No cache files found", "info");
                                            } else {
                                                showSnackbar(`Found ${cacheInfo.length} cache files`, "info");
                                            }
                                        } else {
                                            throw new Error("Failed to get cache status");
                                        }
                                    } catch (error) {
                                        console.error("Error getting cache status:", error);
                                        showSnackbar("Error getting cache status", "error");
                                    }
                                }}
                                size="small"
                                fullWidth={isMobile}
                            >
                                View Status
                            </Button>
                        </Box>
                    </AccordionDetails>
                </Accordion>

                {/* Column Settings */}
                <Accordion
                    expanded={accordionStates.columns}
                    onChange={handleAccordionChange('columns')}
                    elevation={isMobile ? 1 : 2}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <TableChartIcon sx={{ mr: 1 }} />
                            <Typography variant="h6">Table Columns</Typography>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: isMobile ? 1 : 3 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Reset table column preferences and visibility settings.
                        </Typography>

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Button
                                variant="outlined"
                                color="warning"
                                startIcon={<SettingsBackupRestoreIcon />}
                                onClick={() => {
                                    try {
                                        const keys = [];
                                        for (let i = 0; i < localStorage.length; i++) {
                                            const key = localStorage.key(i);
                                            if (key) keys.push(key);
                                        }

                                        const columnKeys = keys.filter(key =>
                                            key.includes('columns') ||
                                            key.includes('_sensors_') ||
                                            key.includes('junction') ||
                                            key.includes('collector') ||
                                            key.includes('devices_visible_columns') ||
                                            key.includes('devices_sort_state') ||
                                            key.includes('devices_refresh_interval') ||
                                            key.includes('dashboard_visible_junction_cols') ||
                                            key.includes('junction_sort_state') ||
                                            key.includes('_unified') ||
                                            key.includes('_jr') ||
                                            key.includes('_other')
                                        );

                                        let resetCount = 0;
                                        columnKeys.forEach(key => {
                                            localStorage.removeItem(key);
                                            resetCount++;
                                        });

                                        showSnackbar(`Reset ${resetCount} settings. Refresh to see changes.`, "success");
                                    } catch (error) {
                                        console.error("Error resetting column preferences:", error);
                                        showSnackbar("Error resetting column preferences", "error");
                                    }
                                }}
                                size="small"
                                fullWidth={isMobile}
                            >
                                Reset All Columns
                            </Button>

                            <Box sx={{
                                display: 'flex',
                                flexDirection: isMobile ? 'column' : 'row',
                                flexWrap: 'wrap',
                                gap: 1
                            }}>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => {
                                        localStorage.removeItem('junction_sensors_columns');
                                        showSnackbar("Reset Junction columns", "success");
                                    }}
                                    sx={{ flex: isMobile ? 'none' : '1 1 calc(50% - 4px)' }}
                                    fullWidth={isMobile}
                                >
                                    Junctions
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => {
                                        localStorage.removeItem('dashboard_visible_junction_cols');
                                        showSnackbar("Reset Dashboard columns", "success");
                                    }}
                                    sx={{ flex: isMobile ? 'none' : '1 1 calc(50% - 4px)' }}
                                    fullWidth={isMobile}
                                >
                                    Dashboard
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => {
                                        localStorage.removeItem('devices_visible_columns_jr');
                                        localStorage.removeItem('devices_visible_columns_other');
                                        showSnackbar("Reset Device columns", "success");
                                    }}
                                    sx={{ flex: isMobile ? 'none' : '1 1 calc(50% - 4px)' }}
                                    fullWidth={isMobile}
                                >
                                    Devices
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => {
                                        const keys = [];
                                        for (let i = 0; i < localStorage.length; i++) {
                                            const key = localStorage.key(i);
                                            if (key && key.includes('collector') && key.includes('columns')) {
                                                keys.push(key);
                                            }
                                        }
                                        keys.forEach(key => localStorage.removeItem(key));
                                        showSnackbar("Reset Collector columns", "success");
                                    }}
                                    sx={{ flex: isMobile ? 'none' : '1 1 calc(50% - 4px)' }}
                                    fullWidth={isMobile}
                                >
                                    Collectors
                                </Button>
                            </Box>
                        </Box>
                    </AccordionDetails>
                </Accordion>

                {/* Application Settings */}
                <Accordion
                    expanded={accordionStates.appSettings}
                    onChange={handleAccordionChange('appSettings')}
                    elevation={isMobile ? 1 : 2}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <TuneIcon sx={{ mr: 1 }} />
                            <Typography variant="h6">Application Settings</Typography>
                            <Chip
                                size="small"
                                label={`${settings.length} settings`}
                                sx={{ ml: 1 }}
                            />
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: isMobile ? 1 : 3 }}>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                                <CircularProgress />
                            </Box>
                        ) : isMobile ? (
                            renderMobileSettingsList()
                        ) : (
                            renderDesktopSettingsTable()
                        )}
                    </AccordionDetails>
                </Accordion>
            </Box>

            <Snackbar
                open={snackbarOpen}
                autoHideDuration={6000}
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: "100%" }}>
                    {snackbarMessage}
                </Alert>
            </Snackbar>

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
                            This will permanently delete all data and require an application restart.
                            This action cannot be undone.
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
        </Box>
    );
};

export default Settings;