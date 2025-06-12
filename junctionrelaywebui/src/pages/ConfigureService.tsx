/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    Typography,
    Box,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    CircularProgress,
    Button,
    Snackbar,
    Alert,
    Card,
    CardContent,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Select,
    MenuItem,
    FormControl,
    InputLabel
} from "@mui/material";

interface Protocol {
    id: number;
    name: string;
    selected: boolean;
}

interface Subscription {
    topic: string;
    qos: number;
}

const ConfigureService: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState<boolean>(true);
    const [serviceData, setServiceData] = useState<any>(null);
    const [newSensors, setNewSensors] = useState<any[]>([]); // To store new sensors
    const [error, setError] = useState<string>("");
    const [status, setStatus] = useState<string>("Loading...");
    const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
    const [snackbarMessage, setSnackbarMessage] = useState<string>("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error">("success");
    const [comPorts, setComPorts] = useState<string[]>([]);
    const [selectedComPort, setSelectedComPort] = useState<string>("");
    const [serviceScreens, setServiceScreens] = useState<any[]>([]);
    const [layoutTemplates, setLayoutTemplates] = useState<any[]>([]);
    const [showAddSubscriptionModal, setShowAddSubscriptionModal] = useState(false);
    const [newTopic, setNewTopic] = useState("");
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [newTopicQoS, setNewTopicQoS] = useState<number>(0);


    const showSnackbar = (message: string, severity: "success" | "error") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                setStatus("Fetching Service...");
                const serviceResponse = await fetch(`/api/services/${id}`);
                if (!serviceResponse.ok) throw new Error("Failed to fetch service");
                const service = await serviceResponse.json();

                // Debugging: Log the service data fetched from the API
                console.log("Service data fetched:", service);

                const portsResponse = await fetch("/api/Controller_Com_Ports/com-ports");
                if (!portsResponse.ok) throw new Error("Failed to fetch COM ports");
                const ports = await portsResponse.json();

                setServiceData(service);
                setComPorts(ports);
                setSelectedComPort(service.SelectedPort || "");
                await fetchSubscriptions();

                // Debugging: Log the service data once it's set in the state
                console.log("Updated service data state:", serviceData);

                setStatus("Service info loaded.");
            } catch (err: any) {
                console.error(err);
                setError(err.message);
                setStatus("Failed to load service info.");
            } finally {
                setLoading(false);
            }
        };


        if (id) {
            fetchData();
        } else {
            setError("Service ID not provided.");
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (serviceData && comPorts.length > 0) {
            if (serviceData.SelectedPort && comPorts.includes(serviceData.SelectedPort)) {
                setSelectedComPort(serviceData.SelectedPort);
            } else {
                setSelectedComPort("");
            }
        }
    }, [serviceData, comPorts]);

    const handleDeleteService = async () => {
        try {
            const response = await fetch(`/api/services/${id}`, {
                method: "DELETE",
            });
            if (!response.ok) throw new Error("Failed to delete service");

            showSnackbar("Service deleted successfully.", "success");
            navigate("/services"); // Redirect to services list after deletion
        } catch (err: any) {
            console.error("Service service error:", err);
            showSnackbar("Failed to delete service.", "error");
        }
    };

    const handleResync = async () => {
        if (!serviceData?.ipAddress) {
            showSnackbar("Service IP not available for resync.", "error");
            return;
        }

        try {
            const [infoRes, capRes] = await Promise.all([
                fetch(`/api/devices/info?ip=${encodeURIComponent(serviceData.ipAddress)}`),
                fetch(`/api/devices/capabilities?ip=${encodeURIComponent(serviceData.ipAddress)}`)
            ]);

            if (!infoRes.ok || !capRes.ok) throw new Error("Resync failed.");

            const infoJson = await infoRes.json();
            const capJson = await capRes.json();

            const parsedInfo = infoJson.deviceInfo;
            const parsedCap = capJson.capabilities;

            const updatedService = { ...serviceData, ...parsedInfo, ...parsedCap };

            const putResponse = await fetch(`/api/services/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedService),
            });

            if (!putResponse.ok) throw new Error("Failed to update service in database.");

            setServiceData(updatedService);
            showSnackbar("Resync successful and saved!", "success");
        } catch (err: any) {
            console.error("Resync error:", err);
            showSnackbar("Resync failed. See console for details.", "error");
        }
    };

    const handleRefreshSensors = async () => {
        try {
            if (!serviceData) {
                showSnackbar("Service data is not loaded.", "error");
                return;
            }

            showSnackbar("Sensors refreshed.", "success");
        } catch (err) {
            console.error("Refresh sensors error:", err);
            showSnackbar("Failed to refresh sensors.", "error");
        }
    };

    const handleAddToDatabase = async (sensorId: string) => {
        try {
            const sensor = newSensors.find((sensor) => sensor.externalId === sensorId);
            if (!sensor) {
                showSnackbar("Sensor not found.", "error");
                return;
            }

            const payload = {
                ...sensor,
                serviceId: id,
            };

            const response = await fetch(`/api/sensors/services/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) throw new Error("Failed to add sensor to database.");

            showSnackbar(`Sensor with ID ${sensorId} added to database.`, "success");
        } catch (err: any) {
            console.error("Error adding sensor to database:", err);
            showSnackbar("Failed to add sensor to database.", "error");
        }
    };

    const handleSave = async () => {
        try {
            const { sensors, ...serviceDataWithoutSensors } = serviceData;
            serviceDataWithoutSensors.SelectedPort = selectedComPort;

            const response = await fetch(`/api/services/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(serviceDataWithoutSensors),
            });

            if (!response.ok) throw new Error("Failed to save changes.");
            showSnackbar("Changes saved successfully!", "success");
        } catch (err: any) {
            console.error("Save error:", err);
            showSnackbar("Failed to save changes.", "error");
        }
    };

    const handleAddCustomSubscription = async () => {
        try {
            const res = await fetch(`/api/services/subscribe/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic: newTopic, qos: newTopicQoS })
            });

            if (!res.ok) throw new Error("Failed to add subscription");
            showSnackbar("Subscription added!", "success");
            setNewTopic("");
            setNewTopicQoS(0);
            setShowAddSubscriptionModal(false);
            await fetchSubscriptions();
        } catch (err: any) {
            showSnackbar("Failed to subscribe", "error");
        }
    };

    const handleRemoveSubscription = async (topic: string) => {
        try {
            const res = await fetch(`/api/services/unsubscribe/${id}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ topic }),
            });

            if (!res.ok) throw new Error("Unsubscribe failed");

            showSnackbar("Unsubscribed successfully", "success");
            await fetchSubscriptions();  

        } catch (err) {
            console.error("Unsubscribe error:", err);
            showSnackbar("Unsubscribe failed", "error");
        }
    };

    const fetchSubscriptions = async () => {
        try {
            const res = await fetch(`/api/services/subscriptions/${id}`);
            if (!res.ok) throw new Error("Failed to fetch subscriptions");
            const data = await res.json();

            const subscriptions: Subscription[] = (data.subscriptions || []).map((sub: any) => {
                let parsedQoS: number;

                if (typeof sub.qos === "string") {
                    parsedQoS = parseInt(sub.qos, 10);
                } else if (typeof sub.qos === "number") {
                    parsedQoS = sub.qos;
                } else {
                    parsedQoS = 0;  // fallback default
                }

                return {
                    topic: sub.topic,
                    qos: isNaN(parsedQoS) ? 0 : parsedQoS, // protect against NaN
                };
            });

            setSubscriptions(subscriptions);
        } catch (err) {
            console.error("Error fetching subscriptions:", err);
            showSnackbar("Failed to load subscriptions", "error");
        }
    };

    // Optional stub
    const handleEditSubscription = (topic: string) => {
        showSnackbar(`Edit not implemented for topic: ${topic}`, "error");
    };

    const handleConnect = async () => {
        try {
            const res = await fetch(`/api/services/connect-to-mqtt/${id}`, { method: "POST" });
            if (!res.ok) throw new Error("Failed to connect");
            showSnackbar("Connected to MQTT broker.", "success");
        } catch (err) {
            showSnackbar("Connect failed.", "error");
            console.error(err);
        }
    };

    const handleDisconnect = async () => {
        try {
            const res = await fetch(`/api/services/disconnect-from-mqtt/${id}`, { method: "POST" });
            if (!res.ok) throw new Error("Failed to disconnect");
            showSnackbar("Disconnected from MQTT broker.", "success");
        } catch (err) {
            showSnackbar("Disconnect failed.", "error");
            console.error(err);
        }
    };

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h4" gutterBottom>
                Configure Service
            </Typography>

            {loading ? (
                <Box>
                    <CircularProgress />
                    <Typography>{status}</Typography>
                </Box>
            ) : error ? (
                <Typography color="error">{error}</Typography>
            ) : (
                <Box>
                    {/* Buttons Row */}
                    <Box sx={{ display: "flex", marginBottom: 2 }}>
                        <Box sx={{ display: "flex", gap: 2 }}>
                                    <Button variant="contained" color="success" onClick={handleConnect}>
                                        Connect
                                    </Button>
                                    <Button variant="contained" color="error" onClick={handleDisconnect}>
                                        Disconnect
                                    </Button>
                                    <Button variant="outlined" onClick={handleResync}>
                                        Resync
                                    </Button>    
                                    <Button variant="outlined" onClick={handleRefreshSensors}>
                                        Refresh Sensors
                                    </Button>
                                    <Button variant="contained" onClick={handleSave}>
                                        Save Changes
                                    </Button>
                                    <Button variant="contained" onClick={() => navigate("/services")}>
                                        Back to Services
                            </Button>
                        </Box>

                        {serviceData.type !== "Host Service" && (
                            <Box sx={{ ml: "auto" }}>
                                <Button
                                    variant="outlined"
                                    onClick={handleDeleteService}
                                    sx={{ color: 'red', borderColor: 'red' }}
                                >
                                    Delete Service
                                </Button>
                            </Box>
                        )}
                            </Box>

                            
                    {/* Delta Sensors Card */}
                    {newSensors.length > 0 && (
                        <Card sx={{ marginBottom: 2 }}>
                            <CardContent>
                                <Typography variant="h6">Delta Sensors</Typography>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Sensor</TableCell>
                                            <TableCell>Units</TableCell>
                                            <TableCell>Action</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {newSensors.map((sensor) => (
                                            <TableRow key={sensor.externalId}>
                                                <TableCell>{sensor.name}</TableCell>
                                                <TableCell>{sensor.unit || "N/A"}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="contained"
                                                        onClick={() => handleAddToDatabase(sensor.externalId)}  // Pass only sensor.externalId
                                                    >
                                                        Add to Database?
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}

                            {/* Service Info and Capabilities Cards */}
                            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                                {/* LEFT COLUMN */}
                                <Box sx={{ flex: 1, minWidth: "300px" }}>
                                    {/* Service Info Card */}
                                    <Card sx={{ marginBottom: 2 }}>
                                        <CardContent>
                                            <Typography variant="h6">Service Info</Typography>
                                            <Table>
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell>Field</TableCell>
                                                        <TableCell>Value</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    <TableRow>
                                                        <TableCell>Service Name</TableCell>
                                                        <TableCell>
                                                            <input
                                                                type="text"
                                                                value={serviceData.name}
                                                                onChange={(e) => setServiceData({ ...serviceData, name: e.target.value })}
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>Type</TableCell>
                                                        <TableCell>{serviceData.type}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>IP Address</TableCell>
                                                        <TableCell>{serviceData.ipAddress}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>Default Poll Rate</TableCell>
                                                        <TableCell>{serviceData.pollRate}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>Default Send Rate</TableCell>
                                                        <TableCell>{serviceData.sendRate}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>MQTT Broker Address</TableCell>
                                                        <TableCell>{serviceData.mqttBrokerAddress}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>MQTT Broker Port</TableCell>
                                                        <TableCell>{serviceData.mqttBrokerPort}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>MQTT Username</TableCell>
                                                        <TableCell>{serviceData.mqttUsername}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>MQTT Password</TableCell>
                                                        <TableCell>{serviceData.mqttPassword}</TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                </Box>
                            </Box>

                            <Box sx={{ marginBottom: 2 }}>
                                <Button variant="outlined" onClick={() => setShowAddSubscriptionModal(true)}>
                                    Add Subscription
                                </Button>
                            </Box>

                            <Card sx={{ marginBottom: 2 }}>
                                <CardContent>
                                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <Typography variant="h6">Subscriptions</Typography>
                                    </Box>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Topic</TableCell>
                                                <TableCell>QoS Level</TableCell>
                                                <TableCell>Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {subscriptions.map((sub: { topic: string; qos: number }) => (
                                                <TableRow key={sub.topic}>
                                                    <TableCell>{sub.topic}</TableCell>
                                                    <TableCell>
                                                        {sub.qos} - {["At Most Once", "At Least Once", "Exactly Once"][sub.qos] ?? "Unknown QoS"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button onClick={() => handleEditSubscription(sub.topic)}>Edit</Button>
                                                        <Button color="error" onClick={() => handleRemoveSubscription(sub.topic)}>Remove</Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>

                    {/* Service Sensors Card */}
                    <Card sx={{ marginBottom: 2 }}>
                        <CardContent>
                            <Typography variant="h6">Service Sensors</Typography>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Sensor</TableCell>
                                        <TableCell>Value</TableCell>
                                        <TableCell>Units</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {serviceData.sensors?.map((sensor: any) => (
                                        <TableRow key={sensor.id}>
                                            <TableCell>{sensor.name}</TableCell>
                                            <TableCell>{sensor.value}</TableCell>
                                            <TableCell>{sensor.unit || "N/A"}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                            </Card>
                </Box>
            )}

            <Snackbar
                open={snackbarOpen}
                autoHideDuration={3000}
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: "100%" }}>
                    {snackbarMessage}
                </Alert>
            </Snackbar>

            <Dialog open={showAddSubscriptionModal} onClose={() => setShowAddSubscriptionModal(false)}>
                <DialogTitle>Add Subscription</DialogTitle>
                <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <TextField
                        label="MQTT Topic"
                        fullWidth
                        value={newTopic}
                        onChange={(e) => setNewTopic(e.target.value)}
                    />
                    <FormControl fullWidth>
                        <InputLabel id="qos-label">QoS Level</InputLabel>
                        <Select
                            labelId="qos-label"
                            value={newTopicQoS}
                            label="QoS Level"
                            onChange={(e) => setNewTopicQoS(Number(e.target.value))}
                        >
                            <MenuItem value={0}>0 - At most once</MenuItem>
                            <MenuItem value={1}>1 - At least once</MenuItem>
                            <MenuItem value={2}>2 - Exactly once</MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowAddSubscriptionModal(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleAddCustomSubscription}>Subscribe</Button>
                </DialogActions>
            </Dialog>


        </Box>
    );
};

export default ConfigureService;
