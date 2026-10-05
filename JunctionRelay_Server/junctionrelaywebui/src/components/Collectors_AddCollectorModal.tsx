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
    Button,
    Typography,
    Box,
    CircularProgress,
    Modal,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    SelectChangeEvent,
    Alert,
    Divider,
    Paper,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Collapse,
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useCollectorTypes } from '../hooks/useCollectorTypes';
import { CollectorMetadata, SetupStep } from '../types/CollectorMetadata';
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
    MODAL_INSTRUCTIONS_PANEL_SX,
    MODAL_INSTRUCTIONS_TOGGLE_SX,
    MODAL_INSTRUCTIONS_CONTENT_SX,
    MODAL_ACTIONS_SX,
} from '@junctionrelay/styles';
import { errorMessage } from '../utils/errors';
import type { Service } from '../types/entities';

// The add-collector form; serviceId is '' until a service is picked
interface NewCollectorForm {
    name: string;
    url: string;
    accessToken: string;
    collectorType: string;
    serviceId: number | '';
    externalAccessToken: boolean;
    pollRate?: number;
    sendRate?: number;
}

const EMPTY_COLLECTOR_FORM: NewCollectorForm = {
    name: "",
    url: "",
    accessToken: "",
    collectorType: "",
    serviceId: "",
    externalAccessToken: false
};

// Helper function to extract base URL from Sonarr iCal feed URL
const extractSonarrBaseUrl = (icalFeedUrl: string): string => {
    if (!icalFeedUrl) return "";
    try {
        const url = new URL(icalFeedUrl);
        return `${url.protocol}//${url.host}`;
    } catch {
        return "";
    }
};

// Inline setup instructions from metadata
const MetadataSetupInstructions: React.FC<{ metadata: CollectorMetadata }> = ({ metadata }) => {
    if (!metadata.setupInstructions.length && !metadata.setupNote) {
        return (
            <Typography variant="body2" color="text.secondary">
                No specific setup instructions available for this collector type.
            </Typography>
        );
    }
    return (
        <Box>
            {metadata.setupInstructions.map((step: SetupStep, i: number) => (
                <Typography key={i} variant="body2" sx={{ mb: 1.5 }}>
                    <strong>{step.title}:</strong> {step.body}
                </Typography>
            ))}
            {metadata.setupNote && (
                <Typography variant="body2" color="text.secondary">
                    <strong>Note:</strong> {metadata.setupNote}
                </Typography>
            )}
        </Box>
    );
};

// AddCollector Modal Component
const AddCollectorModal: React.FC<{
    open: boolean,
    onClose: () => void,
    onCollectorAdded: () => void,
    onCollectorAddedAndConfigure: (collectorId: number) => void
}> = ({ open, onClose, onCollectorAdded, onCollectorAddedAndConfigure }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);
    const [showInstructions, setShowInstructions] = useState<boolean>(true);
    const [sshUseKeyAuth, setSshUseKeyAuth] = useState<boolean>(false);
    const [collector, setCollector] = useState<NewCollectorForm>(EMPTY_COLLECTOR_FORM);
    const [encryptionPassword, setEncryptionPassword] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [services, setServices] = useState<Pick<Service, 'id' | 'name'>[]>([]);

    const { collectorGroups, collectorTypesByName } = useCollectorTypes();

    // Current metadata for the selected collector type
    const metadata = collector.collectorType ? collectorTypesByName.get(collector.collectorType) : undefined;

    // Flatten for mobile dropdown

    // Reset form when modal opens/closes
    useEffect(() => {
        if (open) {
            setCollector(EMPTY_COLLECTOR_FORM);
            setEncryptionPassword("");
            setError("");
            setServices([]);
            setSshUseKeyAuth(false);
        }
    }, [open]);

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
        const { name, value } = e.target;
        if (name === 'name' || name === 'url' || name === 'accessToken' || name === 'collectorType') {
            setCollector({ ...collector, [name]: value });
        }
    };

    // Handle Sonarr iCal URL change - auto-populate URL field with base URL
    const handleSonarrAccessTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const icalUrl = e.target.value;
        const baseUrl = extractSonarrBaseUrl(icalUrl);
        setCollector({
            ...collector,
            accessToken: icalUrl,
            url: baseUrl
        });
    };

    // Handle form submission
    const handleAddCollector = async (configureAfter: boolean = false) => {
        setLoading(true);
        setError("");
        setConfigureAfterAdd(configureAfter);

        if (!collector.name || !collector.collectorType) {
            setError("Name and Type are required!");
            setLoading(false);
            return;
        }

        // Metadata-driven validation
        if (metadata) {
            // URL validation (skip for SSH_Linux which has its own URL handling)
            if (metadata.fields.requiresUrl && collector.collectorType !== "SSH_Linux" && !collector.url) {
                setError("URL is required for this collector type.");
                setLoading(false);
                return;
            }

            // Access token validation
            if (metadata.fields.requiresAccessToken && !collector.accessToken) {
                const label = metadata.fields.accessTokenLabel || "Access Token";
                setError(`${label} is required for this collector type.`);
                setLoading(false);
                return;
            }

            // URL pattern validation
            if (metadata.fields.requiresUrl && collector.url && collector.collectorType !== "SSH_Linux") {
                const urlPattern = metadata.fields.urlValidationPattern
                    ? new RegExp(metadata.fields.urlValidationPattern, 'i')
                    : /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
                if (!urlPattern.test(collector.url)) {
                    setError("Please enter a valid URL.");
                    setLoading(false);
                    return;
                }
            }

            // Access token pattern validation
            if (metadata.fields.accessTokenValidationPattern && collector.accessToken) {
                const tokenPattern = new RegExp(metadata.fields.accessTokenValidationPattern);
                if (!tokenPattern.test(collector.accessToken)) {
                    setError(`Invalid ${metadata.fields.accessTokenLabel || "access token"} format.`);
                    setLoading(false);
                    return;
                }
            }

            // Service requirement
            if (metadata.requiresService && !collector.serviceId) {
                setError(`Service is required for ${metadata.displayName} collectors.`);
                setLoading(false);
                return;
            }
        }

        // SSH_Linux specific validation
        if (collector.collectorType === "SSH_Linux") {
            if (!collector.url) {
                setError("SSH connection URL is required (format: ssh://username@host:port).");
                setLoading(false);
                return;
            }
            if (!collector.accessToken) {
                setError(sshUseKeyAuth ? "SSH Private Key is required." : "SSH Password is required.");
                setLoading(false);
                return;
            }
            const sshUrlPattern = /^ssh:\/\/.+@.+/i;
            if (!sshUrlPattern.test(collector.url)) {
                setError("SSH URL must be in format: ssh://username@host:port (e.g., ssh://root@192.168.1.100:22)");
                setLoading(false);
                return;
            }
        }

        // Sonarr iCal URL validation
        if (collector.collectorType === "SonarrCalendar" && collector.accessToken) {
            if (!collector.accessToken.includes('/feed/v3/calendar/') || !collector.accessToken.includes('apikey=')) {
                setError("Please enter a valid Sonarr iCal Feed URL (should contain '/feed/v3/calendar/' and 'apikey=').");
                setLoading(false);
                return;
            }
        }

        // iCal URL validation
        if (collector.collectorType === "iCal" && collector.accessToken) {
            const urlPattern = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
            if (!urlPattern.test(collector.accessToken)) {
                setError("Please enter a valid iCal Feed URL.");
                setLoading(false);
                return;
            }
        }

        // Validate encryption password if external encryption is selected
        if (collector.externalAccessToken && !encryptionPassword.trim()) {
            setError("Encryption password is required when using external password encryption.");
            setLoading(false);
            return;
        }

        // Send the request
        try {
            const requestBody: Omit<NewCollectorForm, 'serviceId'> & { serviceId: number | null; status: string; encryptionPassword?: string } = {
                ...collector,
                // serviceId is null for non-service collectors (and never the empty-select '')
                serviceId: metadata?.requiresService && collector.serviceId !== '' ? collector.serviceId : null,
                status: "Active"
            };

            if (collector.externalAccessToken && encryptionPassword) {
                requestBody.encryptionPassword = encryptionPassword;
            }

            const response = await fetch("/api/collectors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            if (response.ok) {
                const result = await response.json();
                if (configureAfter && result && result.id) {
                    onCollectorAddedAndConfigure(result.id);
                } else {
                    onCollectorAdded();
                }
                onClose();
                return;
            }

            if (response.status === 500) {
                setError("A collector with this name already exists. Collector names must be unique.");
                setLoading(false);
                return;
            }

            let errorMessage = "Error adding collector";
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (parseError) {
                errorMessage = response.statusText || errorMessage;
                try {
                    const responseText = await response.text();
                    if (
                        responseText.includes("unique") ||
                        responseText.includes("duplicate") ||
                        responseText.toLowerCase().includes("already exists") ||
                        responseText.includes("constraint")
                    ) {
                        errorMessage = "A collector with this name already exists. Collector names must be unique.";
                    }
                } catch (textError) {
                    console.error("Error getting response text:", textError);
                }
            }

            throw new Error(errorMessage);
        } catch (err) {
            if (
                errorMessage(err).includes("unique") ||
                errorMessage(err).includes("duplicate") ||
                errorMessage(err).toLowerCase().includes("already exists") ||
                errorMessage(err).includes("constraint") ||
                errorMessage(err).includes("Internal Server Error")
            ) {
                setError("A collector with this name already exists. Collector names must be unique.");
            } else {
                setError(errorMessage(err));
            }
            console.error("Error adding collector:", err);
        } finally {
            setLoading(false);
        }
    };

    // Fetch services for the picklist when a service-requiring type is selected
    const fetchServices = async () => {
        try {
            const servicesResponse = await fetch(`/api/services`);
            if (!servicesResponse.ok) throw new Error("Failed to fetch services");
            const servicesData = await servicesResponse.json();
            setServices(servicesData);
        } catch (err) {
            setError("Error fetching services.");
            console.error(err);
        }
    };

    // Set default values based on selected collector type (metadata-driven)
    useEffect(() => {
        if (!collector.collectorType) return;

        const meta = collectorTypesByName.get(collector.collectorType);
        if (meta?.requiresService) {
            fetchServices();
        }

        if (meta) {
            setCollector((prev) => ({
                ...prev,
                name: meta.defaults.name || "",
                url: meta.defaults.url || "",
                accessToken: "",
                externalAccessToken: false,
                pollRate: meta.defaults.pollRate || 5000,
                ...(meta.defaults.sendRate ? { sendRate: meta.defaults.sendRate } : {})
            }));
        } else {
            setCollector((prev) => ({
                ...prev,
                name: "",
                url: "",
                accessToken: "",
                externalAccessToken: false
            }));
        }

        if (collector.collectorType === "SSH_Linux") {
            setSshUseKeyAuth(false);
        }

        setEncryptionPassword("");
    }, [collector.collectorType, collectorTypesByName]);

    // Handle type selection from left panel
    const handleTypeSelect = (typeValue: string) => {
        setCollector({ ...collector, collectorType: typeValue });
    };

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={MODAL_SHELL_SX}>
                <Box sx={MODAL_HEADER_SX}>
                    <Typography variant="h6" sx={MODAL_TITLE_SX}>
                        Configure Collector
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Connect to external data sources and services
                    </Typography>
                </Box>

                {loading ? (
                    <Box sx={MODAL_LOADING_SX}>
                        <CircularProgress size={40} />
                    </Box>
                ) : (
                    <Box sx={MODAL_CONTENT_SX}>
                        {/* Left side - Collector types list (Desktop only) */}
                        <Paper
                            variant="outlined"
                            sx={MODAL_LEFT_PANEL_SX}
                        >
                            <List dense disablePadding>
                                {collectorGroups.map((group, groupIndex) => (
                                    <React.Fragment key={group.name}>
                                        {groupIndex > 0 && <Divider />}
                                        <Typography
                                            variant="caption"
                                            sx={MODAL_GROUP_HEADER_SX}
                                        >
                                            {group.name}
                                        </Typography>
                                        {group.types.map((ct) => (
                                            <ListItemButton
                                                key={ct.collectorName}
                                                selected={collector.collectorType === ct.collectorName}
                                                onClick={() => handleTypeSelect(ct.collectorName)}
                                                sx={MODAL_LIST_ITEM_SX}
                                            >
                                                <ListItemIcon sx={MODAL_LIST_ITEM_ICON_SX}>
                                                    <Typography sx={MODAL_LIST_ITEM_EMOJI_SX}>{ct.emoji}</Typography>
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={ct.displayName}
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
                                {error && (
                                    <Alert severity="error" sx={{ mb: 2 }}>
                                        {error}
                                    </Alert>
                                )}

                                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {/* Collector Type Dropdown - Mobile only */}
                                    <Box sx={MODAL_MOBILE_DROPDOWN_SX}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="collector-type-label">Collector Type *</InputLabel>
                                            <Select
                                                labelId="collector-type-label"
                                                value={collector.collectorType}
                                                onChange={handleChange}
                                                name="collectorType"
                                                required
                                                label="Collector Type *"
                                            >
                                                {collectorGroups.map((group) => [
                                                    <MenuItem key={`header-${group.name}`} disabled sx={MODAL_MOBILE_GROUP_HEADER_SX}>
                                                        {group.name}
                                                    </MenuItem>,
                                                    ...group.types.map((ct) => (
                                                        <MenuItem key={ct.collectorName} value={ct.collectorName}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <span>{ct.emoji}</span>
                                                                {ct.displayName}
                                                            </Box>
                                                        </MenuItem>
                                                    ))
                                                ])}
                                            </Select>
                                        </FormControl>
                                    </Box>

                                    {/* Type description */}
                                    {metadata && (
                                        <Alert severity="info" sx={MODAL_TYPE_DESCRIPTION_SX}>
                                            {metadata.description}
                                        </Alert>
                                    )}

                                    {/* Only show form fields if collector type is selected */}
                                    {collector.collectorType && metadata && (
                                        <>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Collector Name"
                                                name="name"
                                                value={collector.name}
                                                onChange={handleChange}
                                                required
                                                error={!!error && error.includes("name")}
                                                helperText={error && error.includes("name") ? "Name must be unique" : ""}
                                            />

                                            {/* URL field — driven by metadata (excluding SSH_Linux, SonarrCalendar, iCal) */}
                                            {metadata.fields.requiresUrl &&
                                                collector.collectorType !== "SSH_Linux" && (
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label={metadata.fields.urlLabel || "URL"}
                                                        name="url"
                                                        value={collector.url}
                                                        onChange={handleChange}
                                                        required
                                                        placeholder={metadata.fields.urlPlaceholder || ""}
                                                    />
                                                )}

                                            {/* SSH_Linux specific fields */}
                                            {collector.collectorType === "SSH_Linux" && (
                                                <>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="SSH Connection"
                                                        name="url"
                                                        value={collector.url}
                                                        onChange={handleChange}
                                                        required
                                                        placeholder="ssh://username@192.168.1.100:22"
                                                        helperText="Format: ssh://username@host:port (default port 22)"
                                                    />

                                                    <FormControl component="fieldset">
                                                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                                                            Authentication Method
                                                        </Typography>
                                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                                <input
                                                                    type="radio"
                                                                    id="ssh-password-auth"
                                                                    name="ssh-auth-method"
                                                                    checked={!sshUseKeyAuth}
                                                                    onChange={() => {
                                                                        setSshUseKeyAuth(false);
                                                                        setCollector({ ...collector, accessToken: "" });
                                                                    }}
                                                                    style={{ marginRight: '8px' }}
                                                                />
                                                                <label htmlFor="ssh-password-auth" style={{ cursor: 'pointer' }}>
                                                                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                                        Password Authentication
                                                                    </Typography>
                                                                </label>
                                                            </Box>
                                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                                <input
                                                                    type="radio"
                                                                    id="ssh-key-auth"
                                                                    name="ssh-auth-method"
                                                                    checked={sshUseKeyAuth}
                                                                    onChange={() => {
                                                                        setSshUseKeyAuth(true);
                                                                        setCollector({ ...collector, accessToken: "" });
                                                                    }}
                                                                    style={{ marginRight: '8px' }}
                                                                />
                                                                <label htmlFor="ssh-key-auth" style={{ cursor: 'pointer' }}>
                                                                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                                        Private Key Authentication
                                                                    </Typography>
                                                                </label>
                                                            </Box>
                                                        </Box>
                                                    </FormControl>

                                                    {!sshUseKeyAuth ? (
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="SSH Password"
                                                            name="accessToken"
                                                            value={collector.accessToken.startsWith("PASS:") ? collector.accessToken.substring(5) : collector.accessToken}
                                                            onChange={(e) => {
                                                                setCollector({ ...collector, accessToken: "PASS:" + e.target.value });
                                                            }}
                                                            required
                                                            type="password"
                                                            placeholder="Enter SSH password"
                                                            helperText="Password for SSH authentication"
                                                        />
                                                    ) : (
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="SSH Private Key"
                                                            name="accessToken"
                                                            value={collector.accessToken.startsWith("KEY:") ? collector.accessToken.substring(4) : collector.accessToken}
                                                            onChange={(e) => {
                                                                setCollector({ ...collector, accessToken: "KEY:" + e.target.value });
                                                            }}
                                                            required
                                                            multiline
                                                            rows={6}
                                                            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                                                            helperText="Paste your private key (RSA, ED25519, etc.)"
                                                        />
                                                    )}

                                                    <Alert severity="info" sx={{ mt: 1 }}>
                                                        <Typography variant="body2">
                                                            <strong>Note:</strong> JunctionRelay must have SSH access to the target device.
                                                            Ensure the device is configured in the Devices section with heartbeat enabled (Protocol: SSH).
                                                        </Typography>
                                                    </Alert>
                                                </>
                                            )}

                                            {/* Sonarr iCal Feed URL - Special handling */}
                                            {collector.collectorType === "SonarrCalendar" && (
                                                <>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label={metadata.fields.accessTokenLabel || "Sonarr iCal Feed URL"}
                                                        name="accessToken"
                                                        value={collector.accessToken}
                                                        onChange={handleSonarrAccessTokenChange}
                                                        required
                                                        type="password"
                                                        placeholder={metadata.fields.accessTokenPlaceholder || ""}
                                                        helperText="This URL contains your API key and will be stored securely"
                                                    />
                                                    {collector.url && (
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="Sonarr Base URL (Auto-extracted)"
                                                            value={collector.url}
                                                            disabled
                                                            helperText="Base URL extracted from your iCal feed URL for display purposes"
                                                        />
                                                    )}
                                                </>
                                            )}

                                            {/* iCal Feed URL */}
                                            {collector.collectorType === "iCal" && (
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    label={metadata.fields.accessTokenLabel || "iCal Feed URL"}
                                                    name="accessToken"
                                                    value={collector.accessToken}
                                                    onChange={handleChange}
                                                    required
                                                    placeholder={metadata.fields.accessTokenPlaceholder || ""}
                                                    helperText="Public iCal feed URL from Google Calendar, Outlook, Apple Calendar, or any iCal-compatible service"
                                                />
                                            )}

                                            {/* Access Token for standard collectors — driven by metadata */}
                                            {metadata.fields.requiresAccessToken &&
                                                collector.collectorType !== "SSH_Linux" &&
                                                collector.collectorType !== "SonarrCalendar" &&
                                                collector.collectorType !== "iCal" && (
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label={metadata.fields.accessTokenLabel || "Access Token"}
                                                        name="accessToken"
                                                        value={collector.accessToken}
                                                        onChange={handleChange}
                                                        required
                                                        type="password"
                                                        placeholder={metadata.fields.accessTokenPlaceholder || ""}
                                                    />
                                                )}

                                            {/* Service Dropdown — driven by metadata.requiresService */}
                                            {metadata.requiresService && (
                                                <FormControl fullWidth size="small">
                                                    <InputLabel id="service-select-label">Select Service</InputLabel>
                                                    <Select
                                                        labelId="service-select-label"
                                                        value={collector.serviceId}
                                                        onChange={(e) => setCollector({ ...collector, serviceId: e.target.value === '' ? '' : Number(e.target.value) })}
                                                        name="serviceId"
                                                        required
                                                        label="Select Service"
                                                    >
                                                        {services.length > 0 ? (
                                                            services.map((service) => (
                                                                <MenuItem key={service.id} value={service.id}>
                                                                    {service.name}
                                                                </MenuItem>
                                                            ))
                                                        ) : (
                                                            <MenuItem disabled>No services available</MenuItem>
                                                        )}
                                                    </Select>
                                                </FormControl>
                                            )}
                                        </>
                                    )}
                                </Box>

                                {/* Security Options Section — show for collectors with access tokens */}
                                {metadata && (metadata.fields.requiresAccessToken || collector.collectorType === "SSH_Linux") && (
                                    <Box sx={{ mt: 3 }}>
                                        <Divider sx={{ mb: 2 }} />
                                        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                                            {collector.collectorType === "SonarrCalendar" ? "iCal Feed URL Security" :
                                                collector.collectorType === "iCal" ? "iCal Feed URL Security" :
                                                    collector.collectorType === "SSH_Linux" ? "SSH Credentials Security" : "Access Token Security"}
                                        </Typography>

                                        <FormControl component="fieldset">
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                    <input
                                                        type="radio"
                                                        id="local-encryption"
                                                        name="encryption-method"
                                                        checked={!collector.externalAccessToken}
                                                        onChange={() => setCollector({ ...collector, externalAccessToken: false })}
                                                        style={{ marginRight: '8px' }}
                                                    />
                                                    <label htmlFor="local-encryption" style={{ cursor: 'pointer' }}>
                                                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                            Save to local DB (Default)
                                                        </Typography>
                                                    </label>
                                                </Box>
                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                    <input
                                                        type="radio"
                                                        id="external-encryption"
                                                        name="encryption-method"
                                                        checked={collector.externalAccessToken}
                                                        onChange={() => setCollector({ ...collector, externalAccessToken: true })}
                                                        style={{ marginRight: '8px' }}
                                                    />
                                                    <label htmlFor="external-encryption" style={{ cursor: 'pointer' }}>
                                                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                            Encrypt with external password
                                                        </Typography>
                                                    </label>
                                                </Box>
                                            </Box>
                                        </FormControl>

                                        {collector.externalAccessToken && (
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Encryption Password"
                                                type="password"
                                                value={encryptionPassword}
                                                onChange={(e) => setEncryptionPassword(e.target.value)}
                                                required
                                                sx={{ mt: 2 }}
                                                placeholder="Enter a strong password for encryption"
                                                helperText="This password will be required each time the application starts"
                                            />
                                        )}
                                    </Box>
                                )}
                            </Box>

                            {/* Instructions - responsive height - Hide on mobile */}
                            {collector.collectorType && metadata && (
                                <Paper
                                    variant="outlined"
                                    sx={MODAL_INSTRUCTIONS_PANEL_SX}
                                >
                                    <Box
                                        sx={MODAL_INSTRUCTIONS_TOGGLE_SX}
                                        onClick={() => setShowInstructions(!showInstructions)}
                                    >
                                        <Typography variant="subtitle2">Setup Instructions</Typography>
                                        {showInstructions ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    </Box>
                                    <Collapse in={showInstructions}>
                                        <Divider />
                                        <Box sx={MODAL_INSTRUCTIONS_CONTENT_SX}>
                                            <MetadataSetupInstructions metadata={metadata} />
                                        </Box>
                                    </Collapse>
                                </Paper>
                            )}

                            {/* Action buttons - right-aligned */}
                            <Box sx={MODAL_ACTIONS_SX}>
                                <Button
                                    variant="outlined"
                                    onClick={onClose}
                                    size="small"
                                    disabled={loading}
                                    sx={{ order: { xs: 3, sm: 1 } }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={() => handleAddCollector(false)}
                                    size="small"
                                    startIcon={<AddIcon />}
                                    disabled={loading || !collector.collectorType}
                                    sx={{ order: { xs: 2, sm: 2 } }}
                                >
                                    {loading && !configureAfterAdd ? "Creating..." : "Create Collector"}
                                </Button>
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    onClick={() => handleAddCollector(true)}
                                    size="small"
                                    startIcon={<EditIcon />}
                                    disabled={loading || !collector.collectorType}
                                    sx={{ order: { xs: 1, sm: 3 } }}
                                >
                                    {loading && configureAfterAdd ? "Creating..." : "Create & Configure Collector"}
                                </Button>
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>
        </Modal>
    );
};

export default AddCollectorModal;
