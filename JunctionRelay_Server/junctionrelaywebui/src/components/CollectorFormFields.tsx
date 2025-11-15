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

import React from 'react';
import {
    Box,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Typography,
    RadioGroup,
    FormControlLabel,
    Radio
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';

interface Collector {
    id: number;
    name: string;
    collectorType: string;
    url?: string;
    accessToken?: string;
    externalAccessToken?: boolean;
    serviceId?: number;
    pollRate: number;
    sendRate?: number;
    description?: string;
}

interface Service {
    id: number;
    name: string;
    serviceType?: string;
}

interface CollectorFormFieldsProps {
    collector: Collector;
    services: Service[];
    editMode: boolean;
    isLocked: boolean;
    updateField: (field: string, value: any) => void;
    accessTokenDisplay: string;
    accessTokenHelperText: string;
    accessTokenChanged: boolean;
    encryptionPassword: string;
    setEncryptionPassword: (password: string) => void;
    originalCollector: Collector | null;
    originalEncryptionMethod: boolean;
}

/**
 * CollectorFormFields Component
 *
 * Renders form fields for collector configuration (URL, access token, service selection, poll rate, etc.)
 * Extracted from ConfigureCollector per architecture guidelines (component size limits).
 */
const CollectorFormFields: React.FC<CollectorFormFieldsProps> = ({
    collector,
    services,
    editMode,
    isLocked,
    updateField,
    accessTokenDisplay,
    accessTokenHelperText,
    accessTokenChanged,
    encryptionPassword,
    setEncryptionPassword,
    originalCollector,
    originalEncryptionMethod
}) => {
    const needsUrl = ["Cloudflare", "GenericAPI", "Github", "HomeAssistant", "LibreHardwareMonitor", "Render", "SonarrCalendar", "Stripe", "UptimeKuma"].includes(collector.collectorType);
    const needsAccessToken = ["Cloudflare", "GenericAPI", "Github", "HomeAssistant", "Render", "Stripe", "SonarrCalendar", "iCal", "Unraid"].includes(collector.collectorType);
    const needsService = collector.collectorType === "MQTT";

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
                label="Collector Name"
                value={collector.name || ''}
                onChange={(e) => updateField('name', e.target.value)}
                disabled={!editMode || isLocked}
                size="small"
                required
            />

            {needsUrl && (
                <TextField
                    label={
                        collector.collectorType === "Github" ? "GitHub Repository URL" :
                            collector.collectorType === "Cloudflare" ? "Cloudflare Zone URL" :
                                collector.collectorType === "Render" ? "Render Service URL" :
                                    collector.collectorType === "SonarrCalendar" ? "Sonarr Base URL" :
                                        collector.collectorType === "Stripe" ? "Stripe API Base URL" :
                                            collector.collectorType === "Unraid" ? "Unraid IP Address" :
                                                "URL"
                    }
                    value={collector.url || ''}
                    onChange={(e) => updateField('url', e.target.value)}
                    disabled={!editMode || isLocked}
                    size="small"
                    required
                    placeholder={
                        collector.collectorType === "Github" ? "https://github.com/owner/repo" :
                            collector.collectorType === "Cloudflare" ? "https://dash.cloudflare.com/account_id/zone_id" :
                                collector.collectorType === "Render" ? "https://dashboard.render.com/web/srv-abc123" :
                                    collector.collectorType === "SonarrCalendar" ? "http://your-sonarr:8989" :
                                        collector.collectorType === "Stripe" ? "https://api.stripe.com" :
                                            collector.collectorType === "Unraid" ? "https://your-unraid-ip" :
                                                ""
                    }
                />
            )}

            {needsAccessToken && (
                <Box>
                    <TextField
                        label={
                            collector.collectorType === "Github" ? "GitHub Personal Access Token" :
                                collector.collectorType === "Cloudflare" ? "Cloudflare API Token" :
                                    collector.collectorType === "Render" ? "Render API Key" :
                                        collector.collectorType === "SonarrCalendar" ? "Sonarr iCal Feed URL" :
                                            collector.collectorType === "iCal" ? "iCal Feed URL" :
                                                collector.collectorType === "Stripe" ? "Stripe Secret Key" :
                                                    collector.collectorType === "Unraid" ? "Unraid API Key" :
                                                        "Access Token"
                        }
                        type="password"
                        value={accessTokenDisplay}
                        onChange={(e) => updateField('accessToken', e.target.value)}
                        disabled={!editMode || isLocked}
                        size="small"
                        required
                        helperText={editMode ? accessTokenHelperText : ""}
                        placeholder={
                            originalCollector?.accessToken && !accessTokenChanged
                                ? "Enter new token to change existing"
                                : collector.collectorType === "Github" ? "ghp_..." :
                                    collector.collectorType === "Cloudflare" ? "cf_api_token..." :
                                        collector.collectorType === "Render" ? "rnd_..." :
                                            collector.collectorType === "SonarrCalendar" ? "http://sonarr:8989/feed/v3/calendar/Sonarr.ics?apikey=..." :
                                                collector.collectorType === "iCal" ? "https://calendar.google.com/calendar/ical/..." :
                                                    collector.collectorType === "Stripe" ? "sk_..." :
                                                        collector.collectorType === "Unraid" ? "your-api-key" :
                                                            ""
                        }
                    />

                    {/* Show encryption method selection when editing and token is being changed */}
                    {editMode && accessTokenChanged && (
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>
                                How should this token be stored?
                            </Typography>
                            <FormControl component="fieldset">
                                <RadioGroup
                                    value={collector.externalAccessToken ? "password" : "database"}
                                    onChange={(e) => updateField('externalAccessToken', e.target.value === "password")}
                                >
                                    <FormControlLabel
                                        value="database"
                                        control={<Radio size="small" />}
                                        label={
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                    Database Encryption (Recommended)
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Automatically encrypted. No password required on startup.
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                    <FormControlLabel
                                        value="password"
                                        control={<Radio size="small" />}
                                        label={
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                    Password-Based Encryption
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Maximum security. Requires password entry on each app start.
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                </RadioGroup>
                            </FormControl>

                            {/* Encryption Password field - only show if password encryption is selected */}
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

                    {/* Show current encryption method when not changing token */}
                    {editMode && !accessTokenChanged && originalCollector?.accessToken && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'medium', display: 'flex', alignItems: 'center' }}>
                                <SecurityIcon sx={{ mr: 1, fontSize: 14 }} />
                                Current: {originalEncryptionMethod ? "Password-Based" : "Database"} Encryption
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                {originalEncryptionMethod
                                    ? "Enter a new token above to change encryption method"
                                    : "Enter a new token above to change encryption method"}
                            </Typography>
                        </Box>
                    )}
                </Box>
            )}

            {needsService && (
                <FormControl size="small" disabled={!editMode || isLocked}>
                    <InputLabel id="service-select-label">Associated Service</InputLabel>
                    <Select
                        labelId="service-select-label"
                        value={collector.serviceId || ''}
                        onChange={(e) => updateField('serviceId', e.target.value)}
                        label="Associated Service"
                    >
                        <MenuItem value="">
                            <em>None</em>
                        </MenuItem>
                        {services.map((svc) => (
                            <MenuItem key={svc.id} value={svc.id}>{svc.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            )}

            <TextField
                label="Poll Rate (ms)"
                type="number"
                value={collector.pollRate || 5000}
                onChange={(e) => updateField('pollRate', parseInt(e.target.value) || 5000)}
                disabled={!editMode || isLocked}
                size="small"
                helperText="How often to poll for new data (milliseconds)"
            />

            {collector.collectorType === "RateTester" && (
                <TextField
                    label="Send Rate (ms)"
                    type="number"
                    value={collector.sendRate || 1000}
                    onChange={(e) => updateField('sendRate', parseInt(e.target.value) || 1000)}
                    disabled={!editMode || isLocked}
                    size="small"
                    helperText="How often to send test data (milliseconds)"
                />
            )}

            {/* Description field - allow editing */}
            <TextField
                label="Description (Optional)"
                value={collector.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                disabled={!editMode || isLocked}
                size="small"
                multiline
                rows={2}
                placeholder="Optional description for this collector"
            />
        </Box>
    );
};

export default CollectorFormFields;
