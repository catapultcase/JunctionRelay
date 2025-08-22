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

interface SetupInstructions_JunctionsProps {
    junctionType: string;
}

// Helper function to get setup instructions for each junction type
export const SetupInstructions_Junctions: React.FC<SetupInstructions_JunctionsProps> = ({ junctionType }) => {
    const getInstructions = () => {
        switch (junctionType) {
            case "COM Junction":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            COM Junction Overview:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Provides serial port (COM/UART) communication for connecting to devices via USB, RS232, RS485, or other serial protocols.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Common Use Cases:</strong><br />
                            • Arduino and microcontroller communication<br />
                            • Industrial equipment with serial interfaces<br />
                            • Legacy devices requiring RS232/RS485<br />
                            • Custom hardware with UART communication
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            After creation, you'll configure the COM port, baud rate, data bits, stop bits, and parity settings in the junction settings.
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Note:</strong> Ensure your device is connected and drivers are installed before configuring the COM port settings.
                        </Typography>
                    </Box>
                );

            case "HTTP Junction":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            HTTP Junction Overview:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Creates HTTP REST API endpoints for receiving data from web applications, IoT devices, or other HTTP clients.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Common Use Cases:</strong><br />
                            • Web dashboard data submission<br />
                            • IoT device data collection via HTTP POST<br />
                            • Webhook receivers for third-party services<br />
                            • RESTful API integration
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            After creation, you'll configure the HTTP endpoint path, accepted methods (GET/POST), authentication, and data format expectations.
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Security:</strong> Configure authentication tokens and IP restrictions as needed to secure your endpoints.
                        </Typography>
                    </Box>
                );

            case "MQTT Junction":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            MQTT Junction Overview:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Connects to MQTT brokers for publish/subscribe messaging, ideal for IoT device communication and distributed systems.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Common Use Cases:</strong><br />
                            • Home Assistant integration<br />
                            • IoT sensor networks<br />
                            • Smart home device communication<br />
                            • Distributed system messaging
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            After creation, you'll configure the MQTT broker connection, topics to subscribe to, QoS levels, and authentication credentials.
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Prerequisites:</strong> Ensure you have access to an MQTT broker (Mosquitto, HiveMQ, AWS IoT, etc.) and know the connection details.
                        </Typography>
                    </Box>
                );

            case "WebSocket Junction":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            WebSocket Junction Overview:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Provides real-time bidirectional communication channels, perfect for live data streaming and interactive applications.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Common Use Cases:</strong><br />
                            • Real-time dashboard updates<br />
                            • Live sensor data streaming<br />
                            • Interactive device control<br />
                            • Low-latency communication requirements
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            After creation, you'll configure the WebSocket endpoint, connection protocols, authentication, and message formats.
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Performance:</strong> WebSockets provide the lowest latency option for real-time communication compared to HTTP polling.
                        </Typography>
                    </Box>
                );

            case "Virtual Junction":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Virtual Junction Overview:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Internal-only junction for data processing, transformation, and routing without external communication interfaces.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Common Use Cases:</strong><br />
                            • Data aggregation and calculation<br />
                            • Internal data transformation<br />
                            • Logic processing and rule engines<br />
                            • Data routing between other junctions<br />
                            • Time-based data generation
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            After creation, you'll configure internal processing rules, data transformation logic, and connections to other junctions for data flow.
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Benefits:</strong> No external dependencies, perfect for internal data processing, calculations, and system logic implementation.
                        </Typography>
                    </Box>
                );

            case "Gateway Junction (COM to ESP:NOW)":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Gateway Junction (COM to ESP:NOW) Overview:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Bridges serial communication to ESP:NOW wireless protocol, enabling wireless sensor networks through ESP32/ESP8266 devices.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Common Use Cases:</strong><br />
                            • Wireless sensor networks<br />
                            • Converting wired sensors to wireless<br />
                            • ESP32-based IoT device communication<br />
                            • Low-power wireless data collection
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Requirements:</strong><br />
                            • Gateway device with ESP:NOW capability<br />
                            • ESP32/ESP8266 target devices<br />
                            • Proper ESP:NOW network configuration
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Configuration:</strong> You've selected the gateway device above. After creation, configure the ESP:NOW network parameters and target device addresses.
                        </Typography>
                    </Box>
                );

            case "Gateway Junction (HTTP to ESP:NOW)":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Gateway Junction (HTTP to ESP:NOW) Overview:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Converts HTTP requests to ESP:NOW wireless messages, allowing web applications to communicate with ESP32/ESP8266 devices.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Common Use Cases:</strong><br />
                            • Web-based device control<br />
                            • RESTful API to wireless device bridge<br />
                            • Cloud-to-device communication<br />
                            • HTTP webhook to ESP:NOW conversion
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Requirements:</strong><br />
                            • Gateway device with both network and ESP:NOW capability<br />
                            • ESP32/ESP8266 target devices<br />
                            • Network connectivity for HTTP reception
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Configuration:</strong> You've selected the gateway device above. After creation, configure HTTP endpoints and ESP:NOW target mappings.
                        </Typography>
                    </Box>
                );

            case "Gateway Junction (WebSocket to ESP:NOW)":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Gateway Junction (WebSocket to ESP:NOW) Overview:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Provides real-time WebSocket to ESP:NOW bridge, enabling low-latency communication between web applications and wireless devices.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Common Use Cases:</strong><br />
                            • Real-time device control interfaces<br />
                            • Live sensor data streaming to web<br />
                            • Interactive IoT applications<br />
                            • Bidirectional real-time communication
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Requirements:</strong><br />
                            • Gateway device with network and ESP:NOW capability<br />
                            • ESP32/ESP8266 devices supporting bidirectional ESP:NOW<br />
                            • WebSocket-capable client applications
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Configuration:</strong> You've selected the gateway device above. After creation, configure WebSocket parameters and ESP:NOW device mappings.
                        </Typography>
                    </Box>
                );

            default:
                return (
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            Select a junction type to see detailed setup information and use cases.
                        </Typography>
                    </Box>
                );
        }
    };

    return getInstructions();
};

export default SetupInstructions_Junctions;