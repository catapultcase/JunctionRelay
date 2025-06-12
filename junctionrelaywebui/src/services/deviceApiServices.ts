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

export interface DevicePreferences {
    connMode: string;
    wifiSSID: string;
    wifiPassword: string;
    mqttBroker: string;
    mqttUsername: string;
    mqttPassword: string;
    rotation: number;
    swapBlueGreen?: boolean;
    restart?: boolean;  // Add restart flag
    externalNeoPixelsData1?: string | number;  // Changed to allow string or number
    externalNeoPixelsData2?: string | number;  // Changed to allow string or number
}

/**
 * Fetches device preferences from a specific device via backend proxy
 * @param deviceIp The IP address of the device
 * @returns Device preferences object
 */
export const getDevicePreferences = async (deviceIp: string): Promise<DevicePreferences> => {
    try {
        // Use backend proxy endpoint instead of direct device access
        const response = await fetch(`/api/devices/preferences?ip=${encodeURIComponent(deviceIp)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch preferences: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching device preferences:', error);
        throw error;
    }
};

/**
 * Saves updated device preferences to a specific device via backend proxy
 * @param deviceIp The IP address of the device
 * @param preferences The device preferences to save
 * @param reboot Whether to reboot the device after saving preferences
 * @returns Response data from the API
 */
export const saveDevicePreferences = async (deviceIp: string, preferences: DevicePreferences, reboot: boolean = false): Promise<any> => {
    try {
        // Create payload object with both device IP and preferences
        const payload = {
            ip: deviceIp,
            preferences: {
                connMode: preferences.connMode,
                wifiSSID: preferences.wifiSSID,
                wifiPassword: preferences.wifiPassword,
                mqttBroker: preferences.mqttBroker,
                mqttUsername: preferences.mqttUsername || "",
                mqttPassword: preferences.mqttPassword || "",
                rotation: preferences.rotation,
                swapBlueGreen: preferences.swapBlueGreen,
                externalNeoPixelsData1: preferences.externalNeoPixelsData1,  // Now accepts string or number
                externalNeoPixelsData2: preferences.externalNeoPixelsData2,  // Now accepts string or number
                restart: reboot
            }
        };

        // Use backend proxy endpoint
        const response = await fetch(`/api/devices/set-preferences`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Failed to save preferences: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error saving device preferences:', error);
        throw error;
    }
};

/**
 * Reboots a device by setting the restart flag in preferences
 * @param deviceIp The IP address of the device
 */
export const rebootDevice = async (deviceIp: string): Promise<void> => {
    try {
        // First get current preferences
        const currentPrefs = await getDevicePreferences(deviceIp);
        // Then save them back with restart flag
        await saveDevicePreferences(deviceIp, currentPrefs, true);
    } catch (error) {
        console.error('Error rebooting device:', error);
        throw error;
    }
};
