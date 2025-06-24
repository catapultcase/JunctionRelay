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

import { useEffect, useState, MouseEvent } from "react";
import {
    Typography,
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Button,
    TextField,
    Drawer,
    Divider,
    Checkbox,
    ListItemText,
    Popover,
    List,
    ListItem,
    IconButton,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

// Import components
import JunctionsTable from "../components/JunctionsTable";

// Fetch helpers
const getDevices = async () => {
    const r = await fetch("/api/devices");
    if (!r.ok) throw new Error("Error fetching devices");
    return r.json();
};
const getCollectors = async () => {
    const r = await fetch("/api/collectors");
    if (!r.ok) throw new Error("Error fetching collectors");
    return r.json();
};
const getJunctions = async () => {
    const r = await fetch("/api/junctions");
    if (!r.ok) throw new Error("Error fetching junctions");
    return r.json();
};

// Helper to update junction sortOrder
const updateJunctionSortOrders = async (updates: { junctionId: number, sortOrder: number }[]) => {
    const r = await fetch(`/api/junctions/sort-order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
    });
    if (!r.ok) throw new Error("Failed to update junction sort orders");
    return r.json();
};

// Storage keys
const STORAGE_KEYS = {
    junction: "dashboard_visible_junction_cols",
    collector: "dashboard_visible_collector_cols",
    stream: "dashboard_visible_stream_cols",
};

interface JunctionColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    sortable?: boolean;
}

// Utility to move an item up/down in the visible list
const moveCol = (
    field: string,
    list: string[],
    setList: (a: string[]) => void,
    direction: "up" | "down"
) => {
    const i = list.indexOf(field);
    if (i < 0) return;
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    const copy = [...list];
    copy.splice(i, 1);
    copy.splice(j, 0, field);
    setList(copy);
};

const Dashboard: React.FC = () => {
    const [junctions, setJunctions] = useState<any[]>([]);
    const additionalColumns: JunctionColumn[] = [];
    const [collectors, setCollectors] = useState<any[]>([]);
    const [activeStreams, setActiveStreams] = useState<any[]>([]);
    const [activePollers, setActivePollers] = useState<any[]>([]);
    const [selectedPoller, setSelectedPoller] = useState<any | null>(null);
    const [selectedStream, setSelectedStream] = useState<any | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [payloadFormat, setPayloadFormat] = useState<"raw" | "pretty">("pretty");
    const dashboardJunctions = junctions.filter(junction => junction.showOnDashboard);
    const navigate = useNavigate();

    // Column definitions
    const collectorCols = [
        { field: "sourceName", label: "Collector Name" },
        { field: "sourceType", label: "Type" },
        { field: "status", label: "Status" },
        { field: "sensorCount", label: "# Sensors" },
        { field: "junctionCount", label: "# Junctions" },
        { field: "rate", label: "Poll Rate (ms)" },
        { field: "lastPollTime", label: "Last Polled" },
    ];
    const streamCols = [
        { field: "protocol", label: "Protocol" },
        { field: "deviceName", label: "Device Name" },
        { field: "screenName", label: "Screen" },
        { field: "status", label: "Status" },
        { field: "sensorsCount", label: "Sensors" },
        { field: "rate", label: "Send Rate (ms)" },
        { field: "latency", label: "Latency (ms)" },
        { field: "lastSentTime", label: "Last Sent" },
    ];

    // Visible & ordered keys from localStorage or default
    const [visibleCollectorCols, setVisibleCollectorCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.collector);
        return stored ? JSON.parse(stored) : collectorCols.map((c) => c.field);
    });
    const [visibleStreamCols, setVisibleStreamCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.stream);
        return stored ? JSON.parse(stored) : streamCols.map((c) => c.field);
    });

    // Persist on change
    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.collector, JSON.stringify(visibleCollectorCols));
    }, [visibleCollectorCols]);
    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.stream, JSON.stringify(visibleStreamCols));
    }, [visibleStreamCols]);

    // Popover anchors
    const [anchorCollectorCols, setAnchorCollectorCols] = useState<HTMLElement | null>(null);
    const [anchorStreamCols, setAnchorStreamCols] = useState<HTMLElement | null>(null);

    // Data refresh helpers - with improved comparison logic
    const refreshJunctionsStatus = () =>
        fetch("/api/connections/running")
            .then((r) => r.json())
            .then((data: { id: number; status: string }[]) =>
                setJunctions((prev) => {
                    // Create a new junctions array with updated statuses
                    const updated = prev.map((j) => {
                        const upd = data.find((r) => r.id === j.id);
                        // Only update if there's a status change
                        return upd && upd.status !== j.status ? { ...j, status: upd.status } : j;
                    });

                    // Only trigger state update if something actually changed
                    if (JSON.stringify(updated) !== JSON.stringify(prev)) {
                        return updated;
                    }
                    return prev; // No changes, return previous state to avoid re-render
                })
            )
            .catch(console.error);
    const refreshActiveStreams = () =>
        fetch("/api/connections/streams")
            .then((r) => r.json())
            .then((d) => setActiveStreams(d.activeStreams || []))
            .catch(console.error);
    const refreshActivePollers = () =>
        fetch("/api/collectors/pollers")
            .then((r) => r.json())
            .then((d) => setActivePollers(d.activePollers || []))
            .catch(console.error);

    // Keep selectedPoller up to date
    useEffect(() => {
        if (!selectedPoller) return;
        const updatedPoller = activePollers.find(p => p.sourceKey === selectedPoller.sourceKey);

        // Only update if we found a match AND something changed
        if (updatedPoller && JSON.stringify(updatedPoller) !== JSON.stringify(selectedPoller)) {
            setSelectedPoller(updatedPoller);
        }
    }, [activePollers, selectedPoller]);

    // Initial load + polling
    useEffect(() => {
        const init = async () => {
            try {
                await getDevices();
                const cols = await getCollectors();
                setCollectors(cols);

                // Get both junctions and running status before updating state
                const jcts = await getJunctions();
                const run = await fetch("/api/connections/running").then((r) => r.json());

                // Merge data before setting state - only set state once
                // Add sortOrder if not present
                const mergedJunctions = jcts.map((j: any, index: number) => {
                    const u = run.find((x: any) => x.id === j.id);
                    // If sortOrder is not defined, use the index as default value
                    const sortOrder = j.sortOrder !== undefined ? j.sortOrder : index;
                    return u ? { ...j, status: u.status, sortOrder } : { ...j, sortOrder };
                });

                // Sort by sortOrder before setting state
                mergedJunctions.sort((a: any, b: any) => a.sortOrder - b.sortOrder);

                // Update state only once with the properly merged data
                setJunctions(mergedJunctions);

                const streams = await fetch("/api/connections/streams").then((r) => r.json());
                setActiveStreams(streams.activeStreams || []);
                const pollRes = await fetch("/api/collectors/pollers").then((r) => r.json());
                setActivePollers(pollRes.activePollers || []);
            } catch (e) {
                console.error("Init error:", e);
            }
        };
        init();
        const id = setInterval(() => {
            refreshJunctionsStatus();
            refreshActiveStreams();
            refreshActivePollers();
        }, 1000);
        return () => clearInterval(id);
    }, []);

    // Keep selectedStream up to date
    useEffect(() => {
        if (!drawerOpen || !selectedStream) return;
        const updatedStream = activeStreams.find(
            s => s.streamKey === selectedStream.streamKey && s.protocol === selectedStream.protocol
        );

        // Only update if we found a match AND something changed
        if (updatedStream && JSON.stringify(updatedStream) !== JSON.stringify(selectedStream)) {
            setSelectedStream(updatedStream);
        }
    }, [drawerOpen, activeStreams, selectedStream]);

    // Toggle for detailed connections view
    const [detailedConnections, setDetailedConnections] = useState<boolean>(() => {
        // Get value from localStorage, default to true if not found
        const savedValue = localStorage.getItem('dashboard_detailed_connections');
        return savedValue !== null ? savedValue === 'true' : true;
    });

    // Save preference when it changes
    useEffect(() => {
        localStorage.setItem('dashboard_detailed_connections', detailedConnections.toString());
    }, [detailedConnections]);

    // Handle updating junction sort order
    const handleUpdateSortOrders = async (updates: { junctionId: number, sortOrder: number }[]) => {
        try {
            // If there are no updates, return early
            if (!updates || updates.length === 0) return;

            // Log what we're updating
            console.log("Updating sort orders for", updates.length, "junctions");

            // Update the local state for immediate UI feedback
            setJunctions(prevJunctions => {
                const junctionMap = new Map(prevJunctions.map(j => [j.id, j]));

                updates.forEach(update => {
                    if (junctionMap.has(update.junctionId)) {
                        const junction = junctionMap.get(update.junctionId);
                        junctionMap.set(update.junctionId, {
                            ...junction,
                            sortOrder: update.sortOrder
                        });
                    }
                });

                return Array.from(junctionMap.values())
                    .sort((a, b) => a.sortOrder - b.sortOrder);
            });

            // Add error handling around the API call
            try {
                // Call the API in a single batch
                await updateJunctionSortOrders(updates);
            } catch (apiError) {
                // Log but don't crash the UI
                console.warn("Backend sort order update failed:", apiError);
            }
        } catch (error) {
            console.error("Failed to process sort orders:", error);
        }
    };

    // Refresh junctions data (for after add/clone/delete operations from JunctionsTable)
    const refreshJunctions = async () => {
        try {
            const response = await fetch("/api/junctions");
            if (!response.ok) {
                throw new Error("Failed to fetch junctions");
            }
            const junctions = await response.json();

            // Add sortOrder if missing and sort the junctions
            const junctionsWithSortOrder = junctions.map((j: any, index: number) => {
                return { ...j, sortOrder: j.sortOrder !== undefined ? j.sortOrder : index };
            }).sort((a: any, b: any) => a.sortOrder - b.sortOrder);

            // Merge with current status data
            const runningResponse = await fetch("/api/connections/running");
            if (runningResponse.ok) {
                const runningData = await runningResponse.json();
                const updatedJunctions = junctionsWithSortOrder.map((j: any) => {
                    const running = runningData.find((r: any) => r.id === j.id);
                    return running ? { ...j, status: running.status } : j;
                });

                // Add smart comparison to prevent unnecessary updates
                setJunctions(prev => {
                    if (JSON.stringify(updatedJunctions) !== JSON.stringify(prev)) {
                        return updatedJunctions;
                    }
                    return prev; // No changes, return previous state to avoid re-render
                });
            } else {
                // Add smart comparison here too
                setJunctions(prev => {
                    if (JSON.stringify(junctionsWithSortOrder) !== JSON.stringify(prev)) {
                        return junctionsWithSortOrder;
                    }
                    return prev;
                });
            }
        } catch (err: any) {
            console.error("Error refreshing junctions:", err);
        }
    };

    // Cell renderers...   
    const getCollectorCell = (field: string, item: any) => {
        switch (field) {
            case "sourceName":
                return item.sourceName;
            case "sourceType": {
                // LOOK UP the true type by matching sourceKey
                const coll = collectors.find((c) => c.sourceKey === item.sourceKey);
                return coll?.type ?? item.sourceType;
            }
            case "status":
                return renderStatusWithCircle(item.status);
            case "sensorCount":
                return item.sensorCount;
            case "junctionCount":
                return item.junctionCount;
            case "rate":
                return item.rate;
            case "lastPollTime":
                return new Date(item.lastPollTime).toLocaleString();
            default:
                return null;
        }
    };

    const getStreamCell = (field: string, item: any) => {
        switch (field) {
            case "protocol":
                return item.protocol;
            case "deviceName":
                return item.deviceName;
            case "screenName":
                return item.screenName;
            case "status":
                return renderStatusWithCircle(item.status);
            case "sensorsCount":
                return item.sensorsCount;
            case "rate":
                return item.rate;
            case "latency":
                return item.protocol === "MQTT" ? "N/A" : item.latency ?? "N/A";
            case "lastSentTime":
                return new Date(item.lastSentTime).toLocaleString();
            default:
                return null;
        }
    };

    const renderStatusWithCircle = (status: string) => {
        let color = "gray";
        if (status === "Running" || status === "Active") color = "green";
        else if (status === "Idle") color = "yellow";
        else if (status === "Error") color = "red";
        return (
            <Box display="flex" alignItems="center" sx={{ whiteSpace: "nowrap" }}>
                <Box
                    component="span"
                    sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color, mr: 1 }}
                />
                {status}
            </Box>
        );
    };

    const handleStartJunction = async (jid: number) => {
        await fetch(`/api/connections/start/${jid}`, { method: "POST" });
        setJunctions((js) => js.map((j) => (j.id === jid ? { ...j, status: "Running" } : j)));
    };
    const handleStopJunction = async (jid: number) => {
        await fetch(`/api/connections/stop/${jid}`, { method: "POST" });
        setJunctions((js) => js.map((j) => (j.id === jid ? { ...j, status: "Idle" } : j)));
    };

    const handleRowClick = (stream: any) => {
        setSelectedStream(stream);
        setDrawerOpen(true);
    };
    const handleCloseDrawer = () => {
        setDrawerOpen(false);
        setSelectedStream(null);
    };

    const handleCloneJunction = async (junctionId: number) => {
        try {
            const response = await fetch(`/api/junctions/${junctionId}/clone`, {
                method: "POST"
            });

            if (!response.ok) {
                throw new Error("Failed to clone junction");
            }

            await refreshJunctions(); // Refresh junctions after cloning
        } catch (e) {
            console.error("Error cloning junction:", e);
        }
    };

    const handleDeleteJunction = async (junctionId: number) => {
        try {
            // Remove the window.confirm from here since it's already in JunctionsTable
            await fetch(`/api/junctions/${junctionId}`, { method: "DELETE" });
            await refreshJunctions(); // Refresh junctions after deleting
        } catch (e) {
            console.error("Error deleting junction:", e);
        }
    };

    // Popover open/close
    const openCollectorPopover = (e: MouseEvent<HTMLElement>) => setAnchorCollectorCols(e.currentTarget);
    const closeCollectorPopover = () => setAnchorCollectorCols(null);
    const openStreamPopover = (e: MouseEvent<HTMLElement>) => setAnchorStreamCols(e.currentTarget);
    const closeStreamPopover = () => setAnchorStreamCols(null);

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h5" gutterBottom>
                Dashboard
            </Typography>

            {/* Junctions Table - now includes its own Add Junction button with all new junction types */}
            <JunctionsTable
                junctions={junctions}
                filteredJunctions={dashboardJunctions}
                additionalColumns={additionalColumns}
                onStartJunction={handleStartJunction}
                onStopJunction={handleStopJunction}
                onCloneJunction={handleCloneJunction}
                onDeleteJunction={handleDeleteJunction}
                onUpdateSortOrders={handleUpdateSortOrders}
                onJunctionAdded={refreshJunctions}
                detailedConnections={detailedConnections}
                setDetailedConnections={setDetailedConnections}
                localStorageKey="dashboard_visible_junction_cols"
                showAddButton={true}
                showImportButton={false}
            />

            {/* Active Collectors Table */}
            <Box display="flex" alignItems="center" mb={1}>
                <Typography variant="h5">Active Collectors</Typography>
                <Button
                    onClick={openCollectorPopover}
                    size="small"
                    variant="outlined"
                    sx={{
                        ml: "auto",
                        minWidth: 'auto',
                        textTransform: 'none',
                        fontWeight: 500,
                        fontSize: '0.875rem',
                        padding: '4px 10px',
                    }}
                >
                    Columns
                </Button>
                <Popover
                    open={Boolean(anchorCollectorCols)}
                    anchorEl={anchorCollectorCols}
                    onClose={closeCollectorPopover}
                >
                    <List dense>
                        {visibleCollectorCols.map((field, idx) => (
                            <ListItem key={field}>
                                <Checkbox
                                    checked
                                    onChange={(e) => {
                                        const next = e.target.checked
                                            ? visibleCollectorCols
                                            : visibleCollectorCols.filter((f) => f !== field);
                                        setVisibleCollectorCols(next);
                                    }}
                                />
                                <ListItemText primary={collectorCols.find((c) => c.field === field)!.label} />
                                <IconButton
                                    size="small"
                                    disabled={idx === 0}
                                    onClick={() => moveCol(field, visibleCollectorCols, setVisibleCollectorCols, "up")}
                                >
                                    <ArrowUpwardIcon fontSize="inherit" />
                                </IconButton>
                                <IconButton
                                    size="small"
                                    disabled={idx === visibleCollectorCols.length - 1}
                                    onClick={() => moveCol(field, visibleCollectorCols, setVisibleCollectorCols, "down")}
                                >
                                    <ArrowDownwardIcon fontSize="inherit" />
                                </IconButton>
                            </ListItem>
                        ))}
                        {collectorCols
                            .filter((c) => !visibleCollectorCols.includes(c.field))
                            .map(({ field, label }) => (
                                <ListItem key={field}>
                                    <Checkbox
                                        onChange={(e) => {
                                            const next = e.target.checked
                                                ? [...visibleCollectorCols, field]
                                                : visibleCollectorCols;
                                            setVisibleCollectorCols(next);
                                        }}
                                    />
                                    <ListItemText primary={label} />
                                </ListItem>
                            ))}
                    </List>
                </Popover>
            </Box>
            {activePollers.length ? (
                <TableContainer component={Paper} sx={{ mb: 3 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                {visibleCollectorCols.map((field) => (
                                    <TableCell key={field}>
                                        {collectorCols.find((c) => c.field === field)!.label}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {activePollers.map((p, idx) => (
                                <TableRow
                                    key={idx}
                                    hover
                                    onClick={() => setSelectedPoller(p)}
                                    sx={{ cursor: "pointer" }}
                                >
                                    {visibleCollectorCols.map((f) => (
                                        <TableCell key={f}>{getCollectorCell(f, p)}</TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : (
                <Typography color="textSecondary" sx={{ textAlign: 'center', py: 3 }}>No active pollers running.</Typography>
            )}

            {/* Global Sensors for Selected Collector */}
            {selectedPoller && (
                <Box mt={2} p={2} component={Paper}>
                    <Typography variant="h6">Sensors for: {selectedPoller.sourceName}</Typography>
                    <Button
                        size="small"
                        onClick={() => setSelectedPoller(null)}
                        sx={{ float: "right", mt: "-40px" }}
                    >
                        Close
                    </Button>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                <TableCell>ID</TableCell>
                                <TableCell>Name</TableCell>
                                <TableCell>Value</TableCell>
                                <TableCell>Unit</TableCell>
                                <TableCell>External Id</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {selectedPoller.polledSensors.map((s: any, i: number) => (
                                <TableRow key={i}>
                                    <TableCell>{s.originalId}</TableCell>
                                    <TableCell>{s.name}</TableCell>
                                    <TableCell>{s.value}</TableCell>
                                    <TableCell>{s.unit}</TableCell>
                                    <TableCell>{s.externalId}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
            )}

            {/* Active Streams Table */}
            <Box display="flex" alignItems="center" mb={1}>
                <Typography variant="h5">Active Streams</Typography>
                <Button
                    onClick={openStreamPopover}
                    size="small"
                    variant="outlined"
                    sx={{
                        ml: "auto",
                        minWidth: 'auto',
                        textTransform: 'none',
                        fontWeight: 500,
                        fontSize: '0.875rem',
                        padding: '4px 10px',
                    }}
                >
                    Columns
                </Button>
                <Popover
                    open={Boolean(anchorStreamCols)}
                    anchorEl={anchorStreamCols}
                    onClose={closeStreamPopover}
                >
                    <List dense>
                        {visibleStreamCols.map((field, idx) => (
                            <ListItem key={field}>
                                <Checkbox
                                    checked
                                    onChange={(e) => {
                                        const next = e.target.checked
                                            ? visibleStreamCols
                                            : visibleStreamCols.filter((f) => f !== field);
                                        setVisibleStreamCols(next);
                                    }}
                                />
                                <ListItemText primary={streamCols.find((c) => c.field === field)!.label} />
                                <IconButton
                                    size="small"
                                    disabled={idx === 0}
                                    onClick={() => moveCol(field, visibleStreamCols, setVisibleStreamCols, "up")}
                                >
                                    <ArrowUpwardIcon fontSize="inherit" />
                                </IconButton>
                                <IconButton
                                    size="small"
                                    disabled={idx === visibleStreamCols.length - 1}
                                    onClick={() => moveCol(field, visibleStreamCols, setVisibleStreamCols, "down")}
                                >
                                    <ArrowDownwardIcon fontSize="inherit" />
                                </IconButton>
                            </ListItem>
                        ))}
                        {streamCols
                            .filter((c) => !visibleStreamCols.includes(c.field))
                            .map(({ field, label }) => (
                                <ListItem key={field}>
                                    <Checkbox
                                        onChange={(e) => {
                                            const next = e.target.checked
                                                ? [...visibleStreamCols, field]
                                                : visibleStreamCols;
                                            setVisibleStreamCols(next);
                                        }}
                                    />
                                    <ListItemText primary={label} />
                                </ListItem>
                            ))}
                    </List>
                </Popover>
            </Box>
            {activeStreams.length ? (
                <TableContainer component={Paper} sx={{ mb: 3 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                {visibleStreamCols.map((field) => (
                                    <TableCell key={field}>{streamCols.find((c) => c.field === field)!.label}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {activeStreams.map((s, i) => (
                                <TableRow key={i} hover onClick={() => handleRowClick(s)} sx={{ cursor: "pointer" }}>
                                    {visibleStreamCols.map((f) => (
                                        <TableCell key={f}>{getStreamCell(f, s)}</TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : (
                <Typography color="textSecondary" sx={{ textAlign: 'center', py: 3 }}>No active streams running.</Typography>
            )}

            {/* Stream Details Drawer */}
            <Drawer
                anchor="right"
                open={drawerOpen}
                onClose={handleCloseDrawer}
                sx={{
                    "& .MuiDrawer-paper": {
                        width: "40vw",
                        transition: "transform 0.3s ease, width 0.3s ease",
                    },
                }}
            >
                <Box sx={{ p: 2 }}>
                    {selectedStream && (
                        <>
                            <Typography variant="h6">
                                Stream Details: {selectedStream.deviceName}
                            </Typography>
                            <Divider sx={{ mb: 2 }} />

                            <Box display="flex" gap={2} mb={2}>
                                <Button
                                    variant={payloadFormat === "raw" ? "contained" : "outlined"}
                                    onClick={() => setPayloadFormat("raw")}
                                    size="small"
                                >
                                    Raw
                                </Button>
                                <Button
                                    variant={payloadFormat === "pretty" ? "contained" : "outlined"}
                                    onClick={() => setPayloadFormat("pretty")}
                                    size="small"
                                >
                                    Pretty
                                </Button>
                            </Box>

                            {selectedStream.protocol === "MQTT" ? (
                                <>
                                    {/* --- Standard Config Payload --- */}
                                    <Typography variant="subtitle1">
                                        Standard Config Payload
                                    </Typography>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={8}
                                        value={
                                            payloadFormat === "pretty"
                                                ? (selectedStream.configPayloadPrefixes?.[0] || '') +
                                                (selectedStream.configPayloadsJson?.[0]
                                                    ? JSON.stringify(JSON.parse(selectedStream.configPayloadsJson[0]), null, 2)
                                                    : selectedStream.configPayloadsJson?.[0] || 'No payload available')
                                                : (selectedStream.configPayloadPrefixes?.[0] || '') +
                                                (selectedStream.configPayloadsJson?.[0] || 'No payload available')
                                        }
                                        sx={{ mb: 2 }}
                                        size="small"
                                        disabled
                                        variant="filled"
                                    />

                                    {/* --- MQTT Config Payload --- */}
                                    <Typography variant="subtitle1">
                                        MQTT Config Payload
                                    </Typography>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={8}
                                        value={
                                            payloadFormat === "pretty"
                                                ? (selectedStream.configPayloadPrefixes?.[1] || '') +
                                                (selectedStream.configPayloadsJson?.[1]
                                                    ? JSON.stringify(JSON.parse(selectedStream.configPayloadsJson[1]), null, 2)
                                                    : selectedStream.configPayloadsJson?.[1] || 'No payload available')
                                                : (selectedStream.configPayloadPrefixes?.[1] || '') +
                                                (selectedStream.configPayloadsJson?.[1] || 'No payload available')
                                        }
                                        sx={{ mb: 3 }}
                                        size="small"
                                        disabled
                                        variant="filled"
                                    />
                                </>
                            ) : (
                                <>
                                    {/* --- HTTP Config Payload --- */}
                                    <Typography variant="subtitle1">Config Payload</Typography>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={12}
                                        value={
                                            payloadFormat === "pretty"
                                                ? (selectedStream.configPayloadPrefix || '') +
                                                (selectedStream.configPayloadJson
                                                    ? JSON.stringify(JSON.parse(selectedStream.configPayloadJson), null, 2)
                                                    : selectedStream.configPayloadJson || 'No payload available')
                                                : (selectedStream.configPayloadPrefix || '') +
                                                (selectedStream.configPayloadJson || 'No payload available')
                                        }
                                        sx={{ mb: 3 }}
                                        size="small"
                                        disabled
                                        variant="filled"
                                    />
                                </>
                            )}

                            {/* --- Last Payload Sent --- */}
                            <Typography variant="subtitle1">Last Payload Sent</Typography>
                            <TextField
                                fullWidth
                                multiline
                                rows={12}
                                value={
                                    payloadFormat === "pretty"
                                        ? (selectedStream.lastSentPayloadPrefix || '') +
                                        (selectedStream.lastSentPayloadJson
                                            ? JSON.stringify(JSON.parse(selectedStream.lastSentPayloadJson), null, 2)
                                            : selectedStream.lastSentPayloadJson || 'No payload available')
                                        : (selectedStream.lastSentPayloadPrefix || '') +
                                        (selectedStream.lastSentPayloadJson || 'No payload available')
                                }
                                sx={{ mb: 3 }}
                                size="small"
                                disabled
                                variant="filled"
                            />
                        </>
                    )}
                </Box>
            </Drawer>
        </Box>
    );
};

export default Dashboard;