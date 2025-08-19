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

const API_BASE_URL = "/api";

// Helper function to dispatch notification events
const dispatchNotification = (type: 'success' | 'error' | 'warning' | 'info', message: string, title?: string, category: 'api' | 'cloud' | 'system' = 'api') => {
    window.dispatchEvent(new CustomEvent('notification-show', {
        detail: {
            type,
            message,
            title,
            category
        }
    }));
};

// Fetch all source devices
export const getSources = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/sources`);
        if (!response.ok) {
            const errorMessage = `Failed to fetch sources: ${response.statusText}`;
            dispatchNotification('error', errorMessage, 'API Error');
            throw new Error(errorMessage);
        }
        return response.json();
    } catch (error) {
        console.error("Error fetching sources:", error);
        if (error instanceof Error) {
            // Only dispatch notification if we haven't already done so above
            if (!error.message.includes('Failed to fetch sources:')) {
                dispatchNotification('error', `Network error while fetching sources: ${error.message}`, 'Connection Error');
            }
        } else {
            dispatchNotification('error', 'Unknown error while fetching sources', 'API Error');
        }
        throw error;
    }
};

// Add a new source device
export const addSource = async (newSource: { name: string; type: string; status: string }) => {
    try {
        dispatchNotification('info', `Adding source device: ${newSource.name}`, 'Creating Device');

        const response = await fetch(`${API_BASE_URL}/sources`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newSource),
        });

        if (!response.ok) {
            const errorMessage = `Failed to add source: ${response.statusText}`;
            dispatchNotification('error', errorMessage, 'Device Creation Failed');
            throw new Error(errorMessage);
        }

        const result = await response.json();
        dispatchNotification('success', `Source device "${newSource.name}" created successfully`, 'Device Created');
        return result;
    } catch (error) {
        console.error("Error adding source:", error);
        if (error instanceof Error) {
            // Only dispatch notification if we haven't already done so above
            if (!error.message.includes('Failed to add source:')) {
                dispatchNotification('error', `Network error while creating source: ${error.message}`, 'Connection Error');
            }
        } else {
            dispatchNotification('error', 'Unknown error while creating source device', 'API Error');
        }
        throw error;
    }
};

// Cloud sync functions
export const sendHealthReport = async () => {
    try {
        dispatchNotification('info', 'Sending health report to cloud...', 'Cloud Sync', 'cloud');

        const response = await fetch(`${API_BASE_URL}/cloud/health-report`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
            const errorMessage = `Failed to send health report: ${response.statusText}`;
            dispatchNotification('error', errorMessage, 'Cloud Sync Failed', 'cloud');
            throw new Error(errorMessage);
        }

        const result = await response.json();
        // Note: Success notification might come from WebSocket, but we can show immediate feedback
        dispatchNotification('success', 'Health report sent successfully', 'Cloud Sync Complete', 'cloud');
        return result;
    } catch (error) {
        console.error("Error sending health report:", error);
        if (error instanceof Error) {
            if (!error.message.includes('Failed to send health report:')) {
                dispatchNotification('error', `Network error while sending health report: ${error.message}`, 'Connection Error', 'cloud');
            }
        } else {
            dispatchNotification('error', 'Unknown error while sending health report', 'Cloud Sync Error', 'cloud');
        }
        throw error;
    }
};

// Generic API error handler with notifications
export const handleApiError = (error: any, operation: string, category: 'api' | 'cloud' | 'system' = 'api') => {
    console.error(`Error in ${operation}:`, error);

    if (error instanceof Error) {
        if (error.message.includes('fetch')) {
            dispatchNotification('error', `Network error during ${operation}`, 'Connection Error', category);
        } else {
            dispatchNotification('error', error.message, 'API Error', category);
        }
    } else {
        dispatchNotification('error', `Unknown error during ${operation}`, 'API Error', category);
    }
};

// Generic success notification helper
export const notifySuccess = (message: string, title?: string, category: 'api' | 'cloud' | 'system' = 'api') => {
    dispatchNotification('success', message, title, category);
};

// Generic info notification helper
export const notifyInfo = (message: string, title?: string, category: 'api' | 'cloud' | 'system' = 'api') => {
    dispatchNotification('info', message, title, category);
};

// Generic warning notification helper
export const notifyWarning = (message: string, title?: string, category: 'api' | 'cloud' | 'system' = 'api') => {
    dispatchNotification('warning', message, title, category);
};