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
    IconButton,
    Divider,
} from "@mui/material";
// Icon imports
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import MinimizeIcon from '@mui/icons-material/Minimize';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SetupInstructions_Collectors from '../components/SetupInstructions_Collectors';

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

// AddCollector Modal Component
const AddCollectorModal: React.FC<{
    open: boolean,
    onClose: () => void,
    onCollectorAdded: () => void,
    onCollectorAddedAndConfigure: (collectorId: number) => void
}> = ({ open, onClose, onCollectorAdded, onCollectorAddedAndConfigure }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);
    const [setupInstructionsMinimized, setSetupInstructionsMinimized] = useState<boolean>(false);
    const [collector, setCollector] = useState<any>({
        name: "",
        url: "",
        accessToken: "",
        collectorType: "",
        serviceId: "",
        externalAccessToken: false
    });
    const [encryptionPassword, setEncryptionPassword] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [services, setServices] = useState<any[]>([]);

    // Collector type options for dropdown
    const collectorTypes = [
        { value: "", name: "Select Collector Type", desc: "Choose a collector type to begin" },
        { value: "Cloudflare", name: "Cloudflare", desc: "CDN & DNS analytics" },
        { value: "Github", name: "GitHub Repository", desc: "Repository statistics" },
        { value: "HomeAssistant", name: "Home Assistant", desc: "Smart home automation" },
        { value: "Host", name: "Host Device", desc: "System monitoring" },
        { value: "LibreHardwareMonitor", name: "Libre Hardware Monitor", desc: "Hardware sensors" },
        { value: "MQTT", name: "MQTT Service", desc: "Message broker data" },
        { value: "NeoPixelColor", name: "NeoPixel Color", desc: "LED strip monitoring" },
        { value: "RateTester", name: "Rate Tester", desc: "Performance testing" },
        { value: "Render", name: "Render", desc: "Cloud platform metrics" },
        { value: "SonarrCalendar", name: "Sonarr Calendar", desc: "TV show schedule" },
        { value: "Stripe", name: "Stripe", desc: "Payment processing" },
        { value: "UptimeKuma", name: "Uptime Kuma", desc: "Service monitoring" }
    ];

    // Reset form when modal opens/closes
    useEffect(() => {
        if (open) {
            // Reset to initial state when modal opens
            setCollector({
                name: "",
                url: "",
                accessToken: "",
                collectorType: "",
                serviceId: "",
                externalAccessToken: false
            });
            setEncryptionPassword("");
            setError("");
            setServices([]);
        }
    }, [open]);

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<any>) => {
        const { name, value } = e.target;
        setCollector({ ...collector, [name]: value });
    };

    // Handle Sonarr iCal URL change - auto-populate URL field with base URL
    const handleSonarrAccessTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const icalUrl = e.target.value;
        const baseUrl = extractSonarrBaseUrl(icalUrl);

        setCollector({
            ...collector,
            accessToken: icalUrl,
            url: baseUrl  // Auto-populate URL field with extracted base URL
        });
    };

    // Handle form submission
    const handleAddCollector = async (configureAfter: boolean = false) => {
        setLoading(true);
        setError("");
        setConfigureAfterAdd(configureAfter);

        // Basic validation
        if (!collector.name || !collector.collectorType) {
            setError("Name and Type are required!");
            setLoading(false);
            return;
        }

        // URL validation for collectors that need it (excluding SonarrCalendar now)
        if (
            (collector.collectorType === "Cloudflare" ||
                collector.collectorType === "Github" ||
                collector.collectorType === "HomeAssistant" ||
                collector.collectorType === "LibreHardwareMonitor" ||
                collector.collectorType === "Render" ||
                collector.collectorType === "Stripe" ||
                collector.collectorType === "UptimeKuma") &&
            !collector.url
        ) {
            setError("URL is required for this collector type.");
            setLoading(false);
            return;
        }

        // Access Token validation for collectors that need it (now including SonarrCalendar)
        if ((collector.collectorType === "Cloudflare" ||
            collector.collectorType === "Github" ||
            collector.collectorType === "HomeAssistant" ||
            collector.collectorType === "Render" ||
            collector.collectorType === "SonarrCalendar" ||
            collector.collectorType === "Stripe") && !collector.accessToken) {
            setError("Access Token is required for this collector type.");
            setLoading(false);
            return;
        }

        // URL pattern validation (only for collectors that still use URL field)
        const urlPattern = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
        if (
            (collector.collectorType === "Cloudflare" ||
                collector.collectorType === "Github" ||
                collector.collectorType === "HomeAssistant" ||
                collector.collectorType === "LibreHardwareMonitor" ||
                collector.collectorType === "Render" ||
                collector.collectorType === "Stripe" ||
                collector.collectorType === "UptimeKuma") &&
            collector.url &&
            !urlPattern.test(collector.url)
        ) {
            setError("Please enter a valid URL.");
            setLoading(false);
            return;
        }

        // Sonarr iCal URL validation
        if (collector.collectorType === "SonarrCalendar") {
            if (!collector.accessToken) {
                setError("Sonarr iCal Feed URL is required.");
                setLoading(false);
                return;
            }
            // Validate that it looks like a Sonarr iCal URL
            if (!collector.accessToken.includes('/feed/v3/calendar/') || !collector.accessToken.includes('apikey=')) {
                setError("Please enter a valid Sonarr iCal Feed URL (should contain '/feed/v3/calendar/' and 'apikey=').");
                setLoading(false);
                return;
            }
        }

        if (collector.collectorType === "MQTT" && !collector.serviceId) {
            setError("Service ID is required for MQTT collectors.");
            setLoading(false);
            return;
        }

        // Validate encryption password if external encryption is selected
        if (collector.externalAccessToken && !encryptionPassword.trim()) {
            setError("Encryption password is required when using external password encryption.");
            setLoading(false);
            return;
        }

        // Ensure serviceId is null for non-MQTT collectors
        if (collector.collectorType !== "MQTT") {
            collector.serviceId = null;  // Set to null if not MQTT
        }

        // Send the request
        try {
            const requestBody = {
                ...collector,
                status: "Active"
            };

            // If using external encryption, include the encryption password in a way the backend expects
            if (collector.externalAccessToken && encryptionPassword) {
                requestBody.encryptionPassword = encryptionPassword;
            }

            const response = await fetch("/api/collectors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            // First check if the response is ok
            if (response.ok) {
                const result = await response.json();
                // If we want to configure after adding, use the new callback
                if (configureAfter && result && result.id) {
                    onCollectorAddedAndConfigure(result.id);
                } else {
                    onCollectorAdded(); // Otherwise just refresh the collectors list
                }
                onClose(); // Close the modal in both cases
                return;
            }

            // If we get a 500 Internal Server Error and it's likely a unique constraint violation
            if (response.status === 500) {
                // For Internal Server Error, we'll assume it's likely a duplicate collector name
                setError("A collector with this name already exists. Collector names must be unique.");
                setLoading(false);
                return;
            }

            // For other status codes, try to parse the response
            let errorMessage = "Error adding collector";
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (parseError) {
                // If response is not valid JSON, use the status text
                errorMessage = response.statusText || errorMessage;

                // Try to get the response text if JSON parsing failed
                try {
                    const responseText = await response.text();
                    console.log("Error response text:", responseText);

                    // Check for specific text patterns that might indicate a unique constraint violation
                    if (
                        responseText.includes("unique") ||
                        responseText.includes("duplicate") ||
                        responseText.toLowerCase().includes("already exists") ||
                        responseText.includes("constraint")
                    ) {
                        errorMessage = "A collector with this name already exists. Collector names must be unique.";
                    }
                } catch (textError) {
                    // If all else fails, use our friendly default error
                    console.error("Error getting response text:", textError);
                }
            }

            throw new Error(errorMessage);
        } catch (err: any) {
            // If the error message contains any indication of a unique constraint
            if (
                err.message.includes("unique") ||
                err.message.includes("duplicate") ||
                err.message.toLowerCase().includes("already exists") ||
                err.message.includes("constraint") ||
                err.message.includes("Internal Server Error")
            ) {
                setError("A collector with this name already exists. Collector names must be unique.");
            } else {
                setError(err.message);
            }
            console.error("Error adding collector:", err);
        } finally {
            setLoading(false);
        }
    };

    // Fetch services for the picklist when MQTT is selected
    const fetchServices = async () => {
        try {
            const servicesResponse = await fetch(`/api/services`);
            if (!servicesResponse.ok) {
                throw new Error("Failed to fetch services");
            }
            const servicesData = await servicesResponse.json();
            setServices(servicesData);
        } catch (err) {
            setError("Error fetching services.");
            console.error(err);
        }
    };

    // Set default values based on selected collector type
    useEffect(() => {
        if (collector.collectorType === "MQTT") {
            fetchServices(); // Fetch services when MQTT is selected
        }

        if (collector.collectorType === "Cloudflare") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Cloudflare",
                url: "https://dash.cloudflare.com/account_id/zone_id",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 60000,
            }));
        } else if (collector.collectorType === "Github") {
            setCollector((prev: any) => ({
                ...prev,
                name: "GitHub Repository",
                url: "https://github.com/owner/repo",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 60000,
            }));
        } else if (collector.collectorType === "HomeAssistant") {
            setCollector((prev: any) => ({
                ...prev,
                name: "HomeAssistant",
                url: "http://10.168.1.17:8123",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 5000,
            }));
        } else if (collector.collectorType === "Host") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Host Device",
                url: "localhost",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 1000,
            }));
        } else if (collector.collectorType === "LibreHardwareMonitor") {
            setCollector((prev: any) => ({
                ...prev,
                name: "LibreHardwareMonitor",
                url: "http://localhost:8085",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 1000,
            }));
        } else if (collector.collectorType === "NeoPixelColor") {
            setCollector((prev: any) => ({
                ...prev,
                name: "NeoPixel Color",
                url: "",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 3000,
            }));
        } else if (collector.collectorType === "RateTester") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Rate Tester",
                url: "",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 1000,
                sendRate: 1000
            }));
        } else if (collector.collectorType === "Render") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Render Service",
                url: "https://dashboard.render.com/web/srv-abc123def456",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 60000,
            }));
        } else if (collector.collectorType === "Stripe") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Stripe",
                url: "https://api.stripe.com",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 60000,
            }));
        } else if (collector.collectorType === "SonarrCalendar") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Sonarr Calendar",
                url: "",  // Will be auto-populated from iCal URL
                accessToken: "",  // This will hold the full iCal feed URL
                externalAccessToken: false,
                pollRate: 3600000,
            }));
        } else if (collector.collectorType === "UptimeKuma") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Uptime Kuma",
                url: "http://localhost:3001/metrics",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 3000,
            }));
        } else {
            setCollector((prev: any) => ({
                ...prev,
                name: "",
                url: "",
                accessToken: "",
                externalAccessToken: false
            }));
        }

        // Reset encryption password when collector type changes
        setEncryptionPassword("");
    }, [collector.collectorType]);

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: { xs: 'auto', sm: '90%', md: '80%' },
                maxWidth: { xs: '95vw', md: 900 },
                minWidth: { xs: 320, sm: 400 },
                height: 'auto',
                maxHeight: { xs: '90vh', md: '80vh' },
                bgcolor: 'background.paper',
                p: 0,
                boxShadow: 24,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <Typography variant="h6" sx={{
                    p: { xs: 2, md: 3 },
                    pb: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    fontSize: { xs: '1.1rem', md: '1.25rem' }
                }}>
                    Add Collector
                </Typography>

                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
                        <CircularProgress size={40} />
                    </Box>
                ) : (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', md: 'row' },
                        flex: 1,
                        overflow: 'hidden',
                        minHeight: 0
                    }}>
                        {/* Left side - Collector types list (Desktop only) */}
                        <Box sx={{
                            width: { md: 280 },
                            borderRight: { md: '1px solid' },
                            borderColor: 'divider',
                            overflowY: 'auto',
                            bgcolor: 'action.hover',
                            display: { xs: 'none', md: 'block' }
                        }}>
                            <Typography variant="subtitle2" sx={{ p: 2, pb: 1, fontWeight: 'bold', color: 'text.secondary' }}>
                                Select Collector Type
                            </Typography>
                            {collectorTypes.slice(1).map((collectorType) => (
                                <Box
                                    key={collectorType.value}
                                    onClick={() => setCollector({ ...collector, collectorType: collectorType.value })}
                                    sx={{
                                        p: 2,
                                        mx: 1,
                                        mb: 1,
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        bgcolor: collector.collectorType === collectorType.value ? 'primary.main' : 'transparent',
                                        color: collector.collectorType === collectorType.value ? 'primary.contrastText' : 'text.primary',
                                        '&:hover': {
                                            bgcolor: collector.collectorType === collectorType.value ? 'primary.dark' : 'action.hover'
                                        },
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Typography variant="body2" fontWeight={collector.collectorType === collectorType.value ? 'bold' : 'medium'}>
                                        {collectorType.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        opacity: collector.collectorType === collectorType.value ? 0.9 : 0.7,
                                        display: 'block'
                                    }}>
                                        {collectorType.desc}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>

                        {/* Configuration form */}
                        <Box sx={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            order: { xs: 1, md: 2 }
                        }}>
                            <Box sx={{
                                p: { xs: 2, md: 3 },
                                overflowY: 'auto',
                                flex: 1
                            }}>
                                {error && (
                                    <Alert severity="error" sx={{ mb: 2 }}>
                                        {error}
                                    </Alert>
                                )}

                                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {/* Collector Type Dropdown - Mobile only */}
                                    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
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
                                                {collectorTypes.map((type) => (
                                                    <MenuItem key={type.value} value={type.value} disabled={type.value === ""}>
                                                        <Box>
                                                            <Typography variant="body2" fontWeight="medium">
                                                                {type.name}
                                                            </Typography>
                                                            {type.value !== "" && (
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {type.desc}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>

                                    {/* Only show form fields if collector type is selected */}
                                    {collector.collectorType && (
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

                                            {/* URL field for collectors that need it (excluding SonarrCalendar) */}
                                            {(collector.collectorType === "Cloudflare" ||
                                                collector.collectorType === "Github" ||
                                                collector.collectorType === "HomeAssistant" ||
                                                collector.collectorType === "LibreHardwareMonitor" ||
                                                collector.collectorType === "Render" ||
                                                collector.collectorType === "Stripe" ||
                                                collector.collectorType === "UptimeKuma") && (
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label={
                                                            collector.collectorType === "Github" ? "GitHub Repository URL" :
                                                                collector.collectorType === "Cloudflare" ? "Cloudflare Zone URL" :
                                                                    collector.collectorType === "Render" ? "Render Service URL" :
                                                                        collector.collectorType === "Stripe" ? "Stripe API Base URL" :
                                                                            "URL"
                                                        }
                                                        name="url"
                                                        value={collector.url}
                                                        onChange={handleChange}
                                                        required
                                                        placeholder={
                                                            collector.collectorType === "Github" ? "https://github.com/owner/repo" :
                                                                collector.collectorType === "Cloudflare" ? "https://dash.cloudflare.com/account_id/zone_id" :
                                                                    collector.collectorType === "Render" ? "https://dashboard.render.com/web/srv-abc123" :
                                                                        collector.collectorType === "Stripe" ? "https://api.stripe.com" :
                                                                            ""
                                                        }
                                                    />
                                                )}

                                            {/* Sonarr iCal Feed URL - Special handling */}
                                            {collector.collectorType === "SonarrCalendar" && (
                                                <>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="Sonarr iCal Feed URL (with API Key)"
                                                        name="accessToken"
                                                        value={collector.accessToken}
                                                        onChange={handleSonarrAccessTokenChange}
                                                        required
                                                        type="password"
                                                        placeholder="http://your-sonarr:8989/feed/v3/calendar/Sonarr.ics?apikey=..."
                                                        helperText="This URL contains your API key and will be stored securely"
                                                    />

                                                    {/* Show extracted base URL */}
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

                                            {/* Access Token for other collectors that need it */}
                                            {(collector.collectorType === "Cloudflare" ||
                                                collector.collectorType === "Github" ||
                                                collector.collectorType === "HomeAssistant" ||
                                                collector.collectorType === "Render" ||
                                                collector.collectorType === "Stripe") && (
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label={
                                                            collector.collectorType === "Github" ? "GitHub Personal Access Token" :
                                                                collector.collectorType === "Cloudflare" ? "Cloudflare API Token" :
                                                                    collector.collectorType === "Render" ? "Render API Key" :
                                                                        collector.collectorType === "Stripe" ? "Stripe Secret Key" :
                                                                            "Access Token"
                                                        }
                                                        name="accessToken"
                                                        value={collector.accessToken}
                                                        onChange={handleChange}
                                                        required
                                                        type="password"
                                                        placeholder={
                                                            collector.collectorType === "Github" ? "ghp_..." :
                                                                collector.collectorType === "Cloudflare" ? "cf_api_token..." :
                                                                    collector.collectorType === "Render" ? "rnd_..." :
                                                                        collector.collectorType === "Stripe" ? "sk_..." :
                                                                            ""
                                                        }
                                                    />
                                                )}

                                            {/* MQTT Service Dropdown */}
                                            {collector.collectorType === "MQTT" && (
                                                <FormControl fullWidth size="small">
                                                    <InputLabel id="service-select-label">Select Service</InputLabel>
                                                    <Select
                                                        labelId="service-select-label"
                                                        value={collector.serviceId}
                                                        onChange={handleChange}
                                                        name="serviceId"
                                                        required
                                                        label="Select Service"
                                                    >
                                                        {services.length > 0 ? (
                                                            services.map((service: any) => (
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

                                {/* Security Options Section - Show for collectors that require access tokens (now includes Sonarr) */}
                                {collector.collectorType && (
                                    collector.collectorType === "Cloudflare" ||
                                    collector.collectorType === "Github" ||
                                    collector.collectorType === "HomeAssistant" ||
                                    collector.collectorType === "Render" ||
                                    collector.collectorType === "SonarrCalendar" ||
                                    collector.collectorType === "Stripe"
                                ) && (
                                        <Box sx={{ mt: 3 }}>
                                            <Divider sx={{ mb: 2 }} />
                                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                                                {collector.collectorType === "SonarrCalendar" ? "iCal Feed URL Security" : "Access Token Security"}
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

                                            {/* Encryption Password field - only show if external encryption is selected */}
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

                                            {/* Help text - Hide on mobile */}
                                            <Box sx={{
                                                mt: 2,
                                                p: 2,
                                                bgcolor: 'action.hover',
                                                borderRadius: 1,
                                                display: { xs: 'none', md: 'block' }
                                            }}>
                                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                                    <strong>Local DB:</strong> {collector.collectorType === "SonarrCalendar" ? "iCal Feed URL" : "AccessToken"} will be encrypted but the encryption keys exist in the application directory.
                                                    This is usually sufficient if you have secured your local network/docker environment and if the {collector.collectorType === "SonarrCalendar" ? "API key" : "AccessToken"} is not high value.
                                                    The application will decrypt automatically on app start so you do not need to re-enter the {collector.collectorType === "SonarrCalendar" ? "URL" : "token"}.
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>External Password:</strong> {collector.collectorType === "SonarrCalendar" ? "iCal Feed URL" : "AccessToken"} will be encrypted using a password that is not saved in the DB -
                                                    this provides maximum security for your {collector.collectorType === "SonarrCalendar" ? "API key" : "AccessToken"}, but means you must enter the password on application start
                                                    for each collector that is encrypted via this method before it can be used. If you lose your password,
                                                    you will not be able to recover the collector and you will need to recreate it.
                                                </Typography>
                                            </Box>
                                        </Box>
                                    )}
                            </Box>

                            {/* Instructions - responsive height - Hide on mobile */}
                            {collector.collectorType && (
                                <Box sx={{
                                    display: { xs: 'none', md: 'block' },
                                    borderTop: '1px solid',
                                    borderColor: 'divider'
                                }}>
                                    {/* Always Visible Header */}
                                    <Box sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        p: 2,
                                        bgcolor: 'action.hover',
                                        cursor: 'pointer',
                                        '&:hover': {
                                            bgcolor: 'action.selected'
                                        }
                                    }}
                                        onClick={() => setSetupInstructionsMinimized(!setupInstructionsMinimized)}
                                    >
                                        <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                                            Setup Instructions
                                        </Typography>
                                        <IconButton size="small" sx={{ p: 0 }}>
                                            {setupInstructionsMinimized ? <ExpandMoreIcon /> : <MinimizeIcon />}
                                        </IconButton>
                                    </Box>

                                    {/* Collapsible Content */}
                                    {!setupInstructionsMinimized && (
                                        <Box sx={{
                                            maxHeight: '300px',
                                            p: 3,
                                            overflowY: 'auto',
                                            bgcolor: 'background.default'
                                        }}>
                                            <SetupInstructions_Collectors collectorType={collector.collectorType} />
                                        </Box>
                                    )}
                                </Box>
                            )}

                            {/* Action buttons - responsive layout */}
                            <Box sx={{
                                p: { xs: 2, md: 3 },
                                borderTop: '1px solid',
                                borderColor: 'divider',
                                display: "flex",
                                flexDirection: { xs: 'column', sm: 'row' },
                                gap: { xs: 1, sm: 2 },
                                flexShrink: 0
                            }}>
                                <Button
                                    variant="contained"
                                    onClick={() => handleAddCollector(false)}
                                    size="small"
                                    startIcon={<AddIcon />}
                                    disabled={loading || !collector.collectorType}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    {loading && !configureAfterAdd ? "Adding..." : "Add Collector"}
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={() => handleAddCollector(true)}
                                    size="small"
                                    color="secondary"
                                    startIcon={<EditIcon />}
                                    disabled={loading || !collector.collectorType}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    {loading && configureAfterAdd ? "Adding..." : "Add & Configure"}
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={onClose}
                                    size="small"
                                    disabled={loading}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    Cancel
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