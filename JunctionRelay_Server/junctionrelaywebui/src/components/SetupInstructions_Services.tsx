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

import React from "react";
import { Box, Typography } from "@mui/material";

interface SetupInstructions_ServicesProps {
    serviceType: string;
}

// Helper function to get setup instructions for each service type
export const SetupInstructions_Services: React.FC<SetupInstructions_ServicesProps> = ({ serviceType }) => {
    const getInstructions = () => {
        switch (serviceType) {
            case "MQTT Broker":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            MQTT Broker Service Setup:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>1. MQTT Broker Address:</strong><br />
                            Enter the IP address or hostname of your MQTT broker (e.g., localhost, 192.168.1.100, or broker.example.com)
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>2. MQTT Broker Port:</strong><br />
                            • Standard MQTT port: 1883 (unencrypted)<br />
                            • Secure MQTT port: 8883 (TLS/SSL)<br />
                            • WebSocket port: 9001 (for web clients)
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>3. Authentication (Optional):</strong><br />
                            • Enter username and password if your broker requires authentication<br />
                            • Leave blank for anonymous access (if allowed by broker)
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Common MQTT brokers:</strong> Mosquitto, Eclipse Mosquitto, HiveMQ, AWS IoT Core, Azure IoT Hub
                        </Typography>
                    </Box>
                );

            case "REST API":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            REST API Service Setup:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>1. API URL:</strong><br />
                            Enter the base URL of your REST API (e.g., https://api.example.com, http://localhost:3000/api)
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>2. IP Address (Optional):</strong><br />
                            If the API is hosted on a specific IP address, you can specify it here for reference
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>3. Access Token (Optional):</strong><br />
                            • API Key, Bearer Token, or other authentication token<br />
                            • Used for APIs that require authentication<br />
                            • Will be included in request headers
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Supported formats:</strong> JSON, XML responses. Common authentication: API Key, Bearer Token, Basic Auth
                        </Typography>
                    </Box>
                );

            case "Custom":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Custom Service Setup:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            Custom services allow you to define your own service parameters and configuration options.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Database connections<br />
                            • Custom protocols<br />
                            • Third-party integrations<br />
                            • Legacy system interfaces
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Fields:</strong><br />
                            • IP Address: Target system IP (optional)<br />
                            • Additional configuration can be added in the service configuration page
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            After creating the service, you can configure additional parameters in the service configuration page.
                        </Typography>
                    </Box>
                );

            default:
                return (
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            No specific setup instructions available for this service type.
                        </Typography>
                    </Box>
                );
        }
    };

    return getInstructions();
};

export default SetupInstructions_Services;