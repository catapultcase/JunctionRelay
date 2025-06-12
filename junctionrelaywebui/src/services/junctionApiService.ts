// src/services/junctionApiService.ts

// Define type interfaces for API responses

export interface JunctionUpdatePayload {
    Name: string;
    Type: string;
    Description?: string;
    MQTTBrokerId: string | number | null;
    ShowOnDashboard?: boolean;
    AutoStartOnLaunch?: boolean;
    CronExpression?: string | null;
    AllTargetsAllData?: boolean;
    AllTargetsAllScreens?: boolean;
    GatewayDestination?: string;
    SelectedPayloadAttributes?: string;
    StreamAutoTimeout?: boolean;
    StreamAutoTimeoutMs?: number;
    RetryCount?: number;
    RetryIntervalMs?: number;
    EnableTests?: boolean;
    EnableHealthCheck?: boolean;
    HealthCheckIntervalMs?: number;
    EnableNotifications?: boolean;
}
export interface JunctionData {
    id: number;
    name: string;
    type: string;
    description?: string;
    mqttBrokerId?: number | null;
    status?: string;
    showOnDashboard?: boolean;
    autoStartOnLaunch?: boolean;
    cronExpression?: string | null;
    streamAutoTimeout?: boolean;
    streamAutoTimeoutMs?: number;
    retryCount?: number;
    retryIntervalMs?: number;
    enableTests?: boolean;
    enableHealthCheck?: boolean;
    healthCheckIntervalMs?: number;
    enableNotifications?: boolean;
    // Add other properties as needed
}


export interface Link {
    id: number;
    deviceId?: number;
    collectorId?: number;
    deviceName?: string;
    collectorName?: string;
    deviceDescription?: string;
    collectorDescription?: string;
    deviceIpAddress?: string;
    collectorUrl?: string;
    role: string;
    pollRateOverride?: number;
    sendRateOverride?: number;
}

export interface JunctionLinks {
    deviceLinks: Link[];
    collectorLinks: Link[];
}

export interface SensorTarget {
    deviceId: number;
    screenId: number | null;
}

// Junction Data APIs
export const getJunctionData = async (junctionId: number): Promise<JunctionData> => {
    const res = await fetch(`/api/junctions/${junctionId}`);
    if (!res.ok) throw new Error("Failed to fetch junction data");
    return await res.json();
};

export const getJunctionLinks = async (junctionId: number): Promise<JunctionLinks> => {
    const res = await fetch(`/api/junctions/${junctionId}/links`);
    if (res.status === 404) return { deviceLinks: [], collectorLinks: [] };
    if (!res.ok) throw new Error("Failed to fetch junction links");
    return await res.json();
};

export const cloneJunction = async (junctionId: number): Promise<JunctionData> => {
    const res = await fetch(`/api/junctions/${junctionId}/clone`, {
        method: "POST",
    });
    if (!res.ok) throw new Error("Failed to clone junction");
    return await res.json();
};

export const updateJunction = async (id: number, payload: JunctionUpdatePayload): Promise<any> => {
    try {
        const response = await fetch(`/api/junctions/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Error updating junction: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating junction:', error);
        throw error;
    }
};

// Export a junction as JSON (download as file)
export const exportJunction = async (junctionId: number) => {
    try {
        // Make GET request to export the junction as JSON
        const response = await fetch(`/api/junctions/export/${junctionId}`);

        if (!response.ok) {
            throw new Error(`Failed to export junction: ${response.statusText}`);
        }

        // Return the response as a blob (binary data)
        return await response.blob(); // Use `blob()` to handle binary file data
    } catch (error) {
        console.error("Error exporting junction:", error);
        throw new Error("Failed to export junction");
    }
};

// Import a junction from JSON (POST request to backend)
export const importJunction = async (junctionData: any) => {
    try {
        const response = await fetch("/api/junctions/import", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",  // Ensure the correct content type
            },
            body: JSON.stringify(junctionData),  // Send the parsed JSON data
        });

        if (!response.ok) {
            throw new Error(`Failed to import junction: ${response.statusText}`);
        }

        // Return the response (e.g., success message and new junction data)
        return await response.json();
    } catch (error) {
        console.error("Error importing junction:", error);
        throw new Error("Failed to import junction");
    }
};


export const updateJunctionSortOrders = async (updates: { junctionId: number, sortOrder: number }[]) => {
    try {
        // Ensure correct format with a wrapper object
        const payload = { updates: updates };

        console.log("Sending sort order updates in batch:", payload);

        const response = await fetch(`/api/junctions/sort-order`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Failed to update junction sort orders: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("API Error updating sort orders:", error);
        throw error;
    }
};


// Device & Collector APIs
export const getAllDevices = async () => {
    const res = await fetch("/api/devices");
    if (!res.ok) throw new Error("Failed to fetch devices");
    return await res.json();
};

export const getAllCollectors = async () => {
    const res = await fetch("/api/collectors");
    if (!res.ok) throw new Error("Failed to fetch collectors");
    return await res.json();
};

export const addDeviceLink = async (
    junctionId: number,
    deviceId: number,
    role: string,
    rates?: { pollRateOverride?: number; sendRateOverride?: number }
) => {
    const payload: any = { deviceId, role };

    // Only add rate properties if they're provided
    if (rates?.pollRateOverride !== undefined) {
        payload.pollRateOverride = rates.pollRateOverride;
    }
    if (rates?.sendRateOverride !== undefined) {
        payload.sendRateOverride = rates.sendRateOverride;
    }

    console.log(`Adding device link with payload:`, payload);

    const res = await fetch(`/api/junctions/${junctionId}/links/device-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        console.error(`Failed to add device link. Status: ${res.status}`, await res.text());
        throw new Error("Failed to add device link");
    }

    console.log(`Device link added successfully`);
};

export const addCollectorLink = async (
    junctionId: number,
    collectorId: number,
    role: string,
    rates?: { pollRateOverride?: number; sendRateOverride?: number }
) => {
    const payload: any = { collectorId, role };

    // Only add rate properties if they're provided
    if (rates?.pollRateOverride !== undefined) {
        payload.pollRateOverride = rates.pollRateOverride;
    }
    if (rates?.sendRateOverride !== undefined) {
        payload.sendRateOverride = rates.sendRateOverride;
    }

    console.log(`Adding collector link with payload:`, payload);

    const res = await fetch(`/api/junctions/${junctionId}/links/collector-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        console.error(`Failed to add collector link. Status: ${res.status}`, await res.text());
        throw new Error("Failed to add collector link");
    }

    console.log(`Collector link added successfully`);
};

export const removeDeviceLink = async (junctionId: number, linkId: number) => {
    const res = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to remove device link");
};

export const removeCollectorLink = async (junctionId: number, linkId: number) => {
    const res = await fetch(`/api/junctions/${junctionId}/links/collector-links/${linkId}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to remove collector link");
};

export const updateLinkRates = async (
    junctionId: number,
    linkId: number,
    type: "device" | "collector",
    rates: { pollRateOverride?: number; sendRateOverride?: number }
) => {
    const path = type === "device"
        ? `/api/junctions/${junctionId}/links/device-links/${linkId}/update`
        : `/api/junctions/${junctionId}/links/collector-links/${linkId}/update`;

    const response = await fetch(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rates),
    });

    if (!response.ok) {
        throw new Error(`Failed to update ${type} rate`);
    }
};

// Sensor APIs
export const getAvailableSensors = async (junctionId: number) => {
    const res = await fetch(`/api/junctions/${junctionId}/links/available-sensors`);
    if (!res.ok) throw new Error("Failed to fetch available sensors");
    return await res.json();
};

export const updateSensorSelection = async (sensor: any, isSelected: boolean) => {
    const path = sensor.junctionCollectorLinkId
        ? "collector-select"
        : sensor.junctionDeviceLinkId
            ? "device-select"
            : null;

    if (!path) {
        throw new Error("Sensor is missing both device and collector link IDs.");
    }

    const res = await fetch(`/api/sensors/junction-sensors/${sensor.Id}/${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSelected),
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to update sensor selection:", errorText);
        throw new Error("Failed to update sensor selection");
    }
};

export const updateSensorProperty = async (sensor: any, property: string, value: any) => {
    const response = await fetch(`/api/sensors/junction-sensors/update`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sensor, [property]: value }),
    });

    if (!response.ok) {
        throw new Error(`Failed to update sensor ${property}`);
    }
};

// Screen/Target APIs
export const assignSensorTarget = async (junctionId: number, sensorId: number, deviceId: number, screenId: number | null) => {
    const response = await fetch(`/api/sensors/junction-sensors/${junctionId}/${sensorId}/assign-target`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            SensorId: sensorId,
            DeviceId: deviceId,
            ScreenId: screenId,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to assign sensor target: ${errorText}`);
        throw new Error(`Failed to assign sensor target: ${response.status} ${response.statusText}`);
    }

    return await response.json();
};

export const assignScreenToTarget = async (junctionId: number, sensorId: number, deviceId: number, screenId: number) => {
    const response = await fetch(`/api/sensors/junction-sensors/${junctionId}/${sensorId}/assign-screen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            DeviceId: deviceId,
            ScreenId: screenId
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to assign screen: ${errorText}`);
        throw new Error(`Failed to assign screen: ${response.status} ${response.statusText}`);
    }

    return await response.json();
};

export const removeSensorTarget = async (junctionId: number, sensorId: number, deviceId: number) => {
    const response = await fetch(`/api/sensors/junction-sensors/${junctionId}/${sensorId}/remove-target/${deviceId}`, {
        method: "DELETE"
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to remove sensor target: ${errorText}`);
        throw new Error(`Failed to remove sensor target: ${response.status} ${response.statusText}`);
    }
};

export const removeSensorScreen = async (junctionId: number, sensorId: number, deviceId: number, screenId: number) => {
    const response = await fetch(`/api/sensors/junction-sensors/${junctionId}/${sensorId}/remove-screen`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            DeviceId: deviceId,
            ScreenId: screenId
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to remove sensor screen: ${errorText}`);
        throw new Error(`Failed to remove sensor screen: ${response.status} ${response.statusText}`);
    }
};

// Junction Control APIs
export const startJunction = async (junctionId: number) => {
    const response = await fetch(`/api/connections/start/${junctionId}`, { method: "POST" });
    if (!response.ok) {
        throw new Error("Failed to start junction");
    }
};

export const stopJunction = async (junctionId: number) => {
    const response = await fetch(`/api/connections/stop/${junctionId}`, { method: "POST" });
    if (!response.ok) {
        throw new Error("Failed to stop junction");
    }
};

export const connectToMQTTBroker = async (brokerId: string) => {
    const response = await fetch(`/api/services/connect-to-mqtt/${brokerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
        throw new Error("Failed to connect to MQTT Broker");
    }
};

// Data APIs
export const getJunctionStatus = async () => {
    const response = await fetch("/api/connections/running");
    if (!response.ok) {
        throw new Error("Failed to fetch running status");
    }
    return await response.json();
};

export const getSensorData = async (junctionId: number) => {
    const res = await fetch(`/api/connections/sensors/junction/${junctionId}`);

    if (res.status === 404) {
        return [];
    }

    if (!res.ok) {
        throw new Error("Failed to fetch sensor data");
    }

    return await res.json();
};

// Helper for time formatting
export const getTimeAgoInSeconds = (timestamp: string): string => {
    const now = new Date();
    const lastUpdated = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
    
    if (diffInSeconds < 60) {
        return `${diffInSeconds} second${diffInSeconds !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
};