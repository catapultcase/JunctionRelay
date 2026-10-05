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

export interface CollectorFieldRequirements {
    requiresUrl: boolean;
    requiresAccessToken: boolean;
    urlLabel?: string;
    urlPlaceholder?: string;
    accessTokenLabel?: string;
    accessTokenPlaceholder?: string;
    urlValidationPattern?: string;
    accessTokenValidationPattern?: string;
}

export interface CollectorDefaults {
    name?: string;
    url?: string;
    pollRate?: number;
    sendRate?: number;
}

export interface SetupStep {
    title: string;
    body: string;
}

export interface CollectorMetadata {
    collectorName: string;
    displayName: string;
    description: string;
    category: string;
    emoji: string;
    fields: CollectorFieldRequirements;
    defaults: CollectorDefaults;
    setupInstructions: SetupStep[];
    setupNote?: string;
    supportsPersistentSession: boolean;
    requiresService: boolean;
    requiredServiceType?: string;
}

export interface CollectorGroup {
    name: string;
    types: CollectorMetadata[];
}
