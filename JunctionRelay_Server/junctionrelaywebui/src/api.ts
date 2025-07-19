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

// Fetch all source devices
export const getSources = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/sources`);
        if (!response.ok) {
            throw new Error(`Failed to fetch sources: ${response.statusText}`);
        }
        return response.json();
    } catch (error) {
        console.error("Error fetching sources:", error);
        throw error;
    }
};

// Add a new source device
export const addSource = async (newSource: { name: string; type: string; status: string }) => {
    try {
        const response = await fetch(`${API_BASE_URL}/sources`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newSource),
        });

        if (!response.ok) {
            throw new Error(`Failed to add source: ${response.statusText}`);
        }
        return response.json();
    } catch (error) {
        console.error("Error adding source:", error);
        throw error;
    }
};
