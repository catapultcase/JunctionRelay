/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024-present Jonathan Mills, CatapultCase
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

import React, { useState, useEffect } from 'react';
import {
    Modal,
    Button,
    Typography,
    Box,
    CircularProgress,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    Divider,
    Paper,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
} from '@mui/material';
import { useProtocolTypes } from '../hooks/useProtocolTypes';
import {
    MODAL_SHELL_SX,
    MODAL_HEADER_SX,
    MODAL_TITLE_SX,
    MODAL_LOADING_SX,
    MODAL_CONTENT_SX,
    MODAL_LEFT_PANEL_SX,
    MODAL_GROUP_HEADER_SX,
    MODAL_LIST_ITEM_SX,
    MODAL_LIST_ITEM_ICON_SX,
    MODAL_LIST_ITEM_EMOJI_SX,
    MODAL_RIGHT_PANEL_SX,
    MODAL_FORM_AREA_SX,
    MODAL_MOBILE_DROPDOWN_SX,
    MODAL_MOBILE_GROUP_HEADER_SX,
    MODAL_TYPE_DESCRIPTION_SX,
    MODAL_ACTIONS_SX,
} from '@junctionrelay/styles';

interface PayloadConfig {
    protocolName: string;
    profile?: string;
    name: string;
    config: Record<string, unknown>;
}

interface ConfigurePayloadModalProps {
    open: boolean;
    onClose: () => void;
    onPayloadConfigured: (config: PayloadConfig) => void;
    onPayloadConfiguredAndEdit?: (config: PayloadConfig) => void;
}

const Payloads_ConfigurePayloadModal: React.FC<ConfigurePayloadModalProps> = ({
    open,
    onClose,
    onPayloadConfigured,
    onPayloadConfiguredAndEdit,
}) => {
    const { protocolGroups, protocolTypesByName, loading: typesLoading } = useProtocolTypes();

    const [selectedProtocol, setSelectedProtocol] = useState('');
    const [name, setName] = useState('');
    const [selectedProfile, setSelectedProfile] = useState('');
    const [configValues, setConfigValues] = useState<Record<string, unknown>>({});

    const metadata = selectedProtocol ? protocolTypesByName.get(selectedProtocol) : undefined;

    // Reset form when modal opens/closes
    useEffect(() => {
        if (open) {
            setSelectedProtocol('');
            setName('');
            setSelectedProfile('');
            setConfigValues({});
        }
    }, [open]);

    // Update defaults when protocol changes
    useEffect(() => {
        if (!metadata) return;

        setName(metadata.displayName || '');

        if (metadata.profiles && metadata.profiles.length > 0) {
            setSelectedProfile(metadata.profiles[0]);
        } else {
            setSelectedProfile('');
        }

        if (metadata.configurable && metadata.defaults) {
            const defaults: Record<string, unknown> = {};
            for (const key of metadata.configurable) {
                defaults[key] = metadata.defaults[key] ?? '';
            }
            setConfigValues(defaults);
        } else {
            setConfigValues({});
        }
    }, [selectedProtocol, metadata]);

    const handleProtocolSelect = (protocolName: string) => {
        setSelectedProtocol(protocolName);
    };

    const buildConfig = (): PayloadConfig => ({
        protocolName: selectedProtocol,
        profile: selectedProfile || undefined,
        name: name.trim(),
        config: configValues,
    });

    const handleSubmit = (andEdit: boolean = false) => {
        if (!metadata || !name.trim()) return;

        const config = buildConfig();
        if (andEdit && onPayloadConfiguredAndEdit) {
            onPayloadConfiguredAndEdit(config);
        } else {
            onPayloadConfigured(config);
        }

        onClose();
    };

    const isSubmitDisabled = !selectedProtocol || !name.trim();

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={MODAL_SHELL_SX}>
                {/* Header */}
                <Box sx={MODAL_HEADER_SX}>
                    <Typography variant="h6" sx={MODAL_TITLE_SX}>
                        Configure Payload
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Select a protocol and configure your payload
                    </Typography>
                </Box>

                {typesLoading ? (
                    <Box sx={MODAL_LOADING_SX}>
                        <CircularProgress size={40} />
                    </Box>
                ) : (
                    <Box sx={MODAL_CONTENT_SX}>
                        {/* Left side - Protocol types list (Desktop only) */}
                        <Paper
                            variant="outlined"
                            sx={MODAL_LEFT_PANEL_SX}
                        >
                            <List dense disablePadding>
                                {protocolGroups.map((group, groupIndex) => (
                                    <React.Fragment key={group.name}>
                                        {groupIndex > 0 && <Divider />}
                                        <Typography
                                            variant="caption"
                                            sx={MODAL_GROUP_HEADER_SX}
                                        >
                                            {group.name}
                                        </Typography>
                                        {group.types.map((pt) => (
                                            <ListItemButton
                                                key={pt.protocolName}
                                                selected={selectedProtocol === pt.protocolName}
                                                onClick={() => handleProtocolSelect(pt.protocolName)}
                                                sx={MODAL_LIST_ITEM_SX}
                                            >
                                                <ListItemIcon sx={MODAL_LIST_ITEM_ICON_SX}>
                                                    <Typography sx={MODAL_LIST_ITEM_EMOJI_SX}>{pt.emoji}</Typography>
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={pt.displayName}
                                                    primaryTypographyProps={{ variant: 'body2', fontSize: '0.85rem' }}
                                                />
                                            </ListItemButton>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </List>
                        </Paper>

                        {/* Configuration form */}
                        <Box sx={MODAL_RIGHT_PANEL_SX}>
                            <Box sx={MODAL_FORM_AREA_SX}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {/* Protocol Type Dropdown - Mobile only */}
                                    <Box sx={MODAL_MOBILE_DROPDOWN_SX}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="protocol-type-label">Protocol *</InputLabel>
                                            <Select
                                                labelId="protocol-type-label"
                                                value={selectedProtocol}
                                                onChange={(e) => handleProtocolSelect(e.target.value)}
                                                label="Protocol *"
                                            >
                                                {protocolGroups.map((group) => [
                                                    <MenuItem
                                                        key={`header-${group.name}`}
                                                        disabled
                                                        sx={MODAL_MOBILE_GROUP_HEADER_SX}
                                                    >
                                                        {group.name}
                                                    </MenuItem>,
                                                    ...group.types.map((pt) => (
                                                        <MenuItem key={pt.protocolName} value={pt.protocolName}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <span>{pt.emoji}</span>
                                                                {pt.displayName}
                                                            </Box>
                                                        </MenuItem>
                                                    )),
                                                ])}
                                            </Select>
                                        </FormControl>
                                    </Box>

                                    {/* Protocol description */}
                                    {metadata && (
                                        <Alert severity="info" sx={MODAL_TYPE_DESCRIPTION_SX}>
                                            {metadata.description}
                                        </Alert>
                                    )}

                                    {/* Form fields when protocol is selected */}
                                    {selectedProtocol && metadata && (
                                        <>
                                            {/* Payload Name */}
                                            <TextField
                                                label="Payload Name"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                size="small"
                                                fullWidth
                                                required
                                                helperText="A unique name for this payload"
                                            />

                                            {/* Profile Select - only when profiles exist */}
                                            {metadata.profiles && metadata.profiles.length > 0 && (
                                                <FormControl fullWidth size="small">
                                                    <InputLabel id="profile-label">Profile</InputLabel>
                                                    <Select
                                                        labelId="profile-label"
                                                        value={selectedProfile}
                                                        onChange={(e) => setSelectedProfile(e.target.value)}
                                                        label="Profile"
                                                    >
                                                        {metadata.profiles.map((profile) => (
                                                            <MenuItem key={profile} value={profile}>
                                                                {profile}
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                            )}

                                            {/* Configurable fields */}
                                            {metadata.configurable && metadata.configurable.map((key) => (
                                                <TextField
                                                    key={key}
                                                    label={key}
                                                    value={configValues[key] ?? ''}
                                                    onChange={(e) =>
                                                        setConfigValues((prev) => ({ ...prev, [key]: e.target.value }))
                                                    }
                                                    size="small"
                                                    fullWidth
                                                    helperText={metadata.defaults?.[key] !== undefined ? `Default: ${String(metadata.defaults[key])}` : undefined}
                                                />
                                            ))}

                                            {/* Output info */}
                                            {(metadata.outputContentType || metadata.outputDescription) && (
                                                <Box sx={{ mt: 1 }}>
                                                    {metadata.outputContentType && (
                                                        <Typography variant="caption" color="text.secondary" display="block">
                                                            Output: {metadata.outputContentType}
                                                        </Typography>
                                                    )}
                                                    {metadata.outputDescription && (
                                                        <Typography variant="caption" color="text.secondary" display="block">
                                                            {metadata.outputDescription}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            )}
                                        </>
                                    )}
                                </Box>
                            </Box>

                            {/* Action buttons - right-aligned */}
                            <Box sx={MODAL_ACTIONS_SX}>
                                <Button
                                    variant="outlined"
                                    onClick={onClose}
                                    size="small"
                                    sx={{ order: { xs: 3, sm: 1 } }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={() => handleSubmit(false)}
                                    size="small"
                                    disabled={isSubmitDisabled}
                                    sx={{ order: { xs: 2, sm: 2 } }}
                                >
                                    Create Payload
                                </Button>
                                {onPayloadConfiguredAndEdit && (
                                    <Button
                                        variant="contained"
                                        color="secondary"
                                        onClick={() => handleSubmit(true)}
                                        size="small"
                                        disabled={isSubmitDisabled}
                                        sx={{ order: { xs: 1, sm: 3 } }}
                                    >
                                        Create & Configure Payload
                                    </Button>
                                )}
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>
        </Modal>
    );
};

export default Payloads_ConfigurePayloadModal;
