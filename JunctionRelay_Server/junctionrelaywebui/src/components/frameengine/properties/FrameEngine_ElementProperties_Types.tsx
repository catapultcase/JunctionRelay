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

import type { PlacedElement } from '../FrameEngine_Types';

/**
 * Base props shared by all element property panels
 */
export interface BaseElementPropertiesProps {
    selectedElements: PlacedElement[];
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementDelete: (elementId: string) => void;
    expandedSections: Set<string>;
    onToggleSection: (sectionId: string) => void;
}

/**
 * Props for individual element property panels
 */
export interface ElementPropertyPanelProps extends BaseElementPropertiesProps {
    // Individual panels inherit all base props
}

/**
 * Common input style used across all property panels
 */
export const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    fontSize: '12px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    outline: 'none'
};

/**
 * Common section header style
 */
export const sectionHeaderStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px',
    textAlign: 'left',
    backgroundColor: '#f5f5f5',
    border: 'none',
    borderBottom: '1px solid #e0e0e0',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    color: '#333',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
};