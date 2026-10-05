// src/services/junctionApiService.ts
import type { Collector, Device, Junction, JunctionCollectorLink, JunctionDeviceLink, Sensor } from '../types/entities';

// Define type interfaces for API responses

export interface JunctionLinks {
    deviceLinks: JunctionDeviceLink[];
    collectorLinks: JunctionCollectorLink[];
}

export interface SensorTarget {
    deviceId: number;
    screenId: number | null;
}

// Junction Data APIs
export const getJunctionData = async (junctionId: number): Promise<Junction> => {
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

// The server binds the Junction model (case-insensitive), so a payload is any subset of its fields.
export const updateJunction = async (id: number, payload: Partial<Junction>): Promise<void> => {
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
    } catch (error) {
        console.error('Error updating junction:', error);
        throw error;
    }
};

// Device & Collector APIs
export const getAllDevices = async (): Promise<Device[]> => {
    const res = await fetch("/api/devices");
    if (!res.ok) throw new Error("Failed to fetch devices");
    return await res.json();
};

export const getAllCollectors = async (): Promise<Collector[]> => {
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
    // Rates are optional; JSON.stringify leaves out the ones not given.
    const payload = { deviceId, role, ...rates };

    const res = await fetch(`/api/junctions/${junctionId}/links/device-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        console.error(`Failed to add device link. Status: ${res.status}`, await res.text());
        throw new Error("Failed to add device link");
    }

};

export const addCollectorLink = async (
    junctionId: number,
    collectorId: number,
    role: string,
    rates?: { pollRateOverride?: number; sendRateOverride?: number }
) => {
    // Rates are optional; JSON.stringify leaves out the ones not given.
    const payload = { collectorId, role, ...rates };

    const res = await fetch(`/api/junctions/${junctionId}/links/collector-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        console.error(`Failed to add collector link. Status: ${res.status}`, await res.text());
        throw new Error("Failed to add collector link");
    }

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
export const getAvailableSensors = async (junctionId: number): Promise<Sensor[]> => {
    const res = await fetch(`/api/junctions/${junctionId}/links/available-sensors`);
    if (!res.ok) throw new Error("Failed to fetch available sensors");
    return await res.json();
};

export const updateSensorSelection = async (sensor: Sensor, isSelected: boolean) => {
    const path = sensor.junctionCollectorLinkId
        ? "collector-select"
        : sensor.junctionDeviceLinkId
            ? "device-select"
            : null;

    if (!path) {
        throw new Error("Sensor is missing both device and collector link IDs.");
    }

    const res = await fetch(`/api/sensors/junction-sensors/${sensor.id}/${path}`, {
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

export const bulkUpdateSensorSelection = async (sensorIds: number[], isSelected: boolean) => {
    const res = await fetch('/api/sensors/junction-sensors/bulk-select', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensorIds, isSelected }),
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error('Failed to bulk update sensor selection:', errorText);
        throw new Error('Failed to bulk update sensor selection');
    }

    return await res.json();
};

export const updateSensorProperty = async <K extends keyof Sensor>(sensor: Sensor, property: K, value: Sensor[K]) => {
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
export interface RunningJunction {
    id: number;
    status: string;
}

export const getJunctionStatus = async (): Promise<RunningJunction[]> => {
    const response = await fetch("/api/connections/running");
    if (!response.ok) {
        throw new Error("Failed to fetch running status");
    }
    return await response.json();
};
