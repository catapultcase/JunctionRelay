import type { Collector, Device, JunctionCollectorLink, JunctionDeviceLink, JunctionSensorTarget } from './entities';
import type { JunctionLinks } from '../services/junctionApiService';

/** A device or collector as a junction source or target, or as a candidate to add as one. */
export interface SourceOrTarget {
    linkId?: number;
    id: number;
    type: "device" | "collector";
    name: string;
    description: string;
    ipAddress?: string;
    url?: string;
    role?: string;
    pollRateOverride?: number;
    sendRateOverride?: number;
    defaultPollRate?: number;
    defaultSendRate?: number;
}

const fromDeviceLink = (d: JunctionDeviceLink): SourceOrTarget => ({
    linkId: d.id,
    id: d.deviceId,
    name: d.deviceName ?? "",
    description: d.deviceDescription ?? "",
    role: d.role,
    type: "device",
    pollRateOverride: d.pollRateOverride ?? undefined,
    sendRateOverride: d.sendRateOverride ?? undefined,
    defaultPollRate: d.devicePollRate ?? undefined,
    defaultSendRate: d.deviceSendRate ?? undefined,
});

const fromCollectorLink = (c: JunctionCollectorLink): SourceOrTarget => ({
    linkId: c.id,
    id: c.collectorId,
    name: c.collectorName ?? "",
    description: c.collectorDescription ?? "",
    role: c.role,
    type: "collector",
    pollRateOverride: c.pollRateOverride ?? undefined,
    sendRateOverride: c.sendRateOverride ?? undefined,
    defaultPollRate: c.collectorPollRate ?? undefined,
    defaultSendRate: c.collectorSendRate ?? undefined,
});

/** A junction's links as source/target rows, devices and collectors kept apart. */
export const toSourcesAndTargets = (links: JunctionLinks) => ({
    deviceLinks: (links.deviceLinks || []).map(fromDeviceLink),
    collectorLinks: (links.collectorLinks || []).map(fromCollectorLink),
});

/** Rate overrides keyed by link id (0 = no override). */
export const ratesByLink = (rows: SourceOrTarget[], rate: "pollRateOverride" | "sendRateOverride"): { [linkId: number]: number } =>
    Object.fromEntries(rows.map(r => [r.linkId ?? r.id, r[rate] ?? 0]));

/** Which devices, and which of their screens, each sensor is sent to. */
export type SensorTargetsBySensor = { [sensorId: number]: { deviceId: number; screenIds: number[] }[] };

/** The server's targets-grouped rows (one per sensor, device and screen) folded into one entry per device. */
export const groupSensorTargets = (rowsBySensor: Record<string, JunctionSensorTarget[]>): SensorTargetsBySensor =>
    Object.fromEntries(Object.entries(rowsBySensor).map(([sensorId, rows]) => {
        const screensByDevice = new Map<number, number[]>();
        for (const row of rows) {
            const screens = screensByDevice.get(row.deviceId) ?? [];
            if (row.screenId != null) screens.push(row.screenId);
            screensByDevice.set(row.deviceId, screens);
        }
        return [Number(sensorId), Array.from(screensByDevice, ([deviceId, screenIds]) => ({ deviceId, screenIds }))];
    }));

/** A device not yet linked, as a row the user can add as a source or target. */
export const deviceCandidate = (device: Device): SourceOrTarget => ({
    id: device.id,
    type: "device",
    name: device.name,
    description: device.type,
    ipAddress: device.ipAddress ?? undefined,
    pollRateOverride: device.pollRate ?? undefined,
    sendRateOverride: device.sendRate ?? undefined,
});

/** A collector not yet linked, as a row the user can add as a source or target. */
export const collectorCandidate = (collector: Collector): SourceOrTarget => ({
    id: collector.id,
    type: "collector",
    name: collector.name,
    description: collector.collectorType,
    url: collector.url ?? undefined,
    pollRateOverride: collector.pollRate ?? undefined,
    sendRateOverride: collector.sendRate ?? undefined,
});
