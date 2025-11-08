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

/**
 * Deep equality comparison utility
 *
 * Replaces JSON.stringify comparisons with a more performant deep equality check.
 * This is optimized for the FrameEngine2 use case where we compare relatively
 * small objects (Rive inputs, bindings, element properties).
 *
 * Performance benefits over JSON.stringify:
 * - Faster for small/medium objects (no string serialization overhead)
 * - Short-circuits on first difference (JSON.stringify always serializes everything)
 * - Handles special values correctly (undefined, NaN, functions)
 *
 * @param obj1 - First object to compare
 * @param obj2 - Second object to compare
 * @returns true if deeply equal, false otherwise
 */
export function deepEqual(obj1: any, obj2: any): boolean {
    // Handle primitive types and referential equality
    if (obj1 === obj2) {
        return true;
    }

    // Handle null/undefined
    if (obj1 == null || obj2 == null) {
        return obj1 === obj2;
    }

    // Handle NaN (NaN !== NaN in JavaScript)
    if (typeof obj1 === 'number' && typeof obj2 === 'number') {
        if (isNaN(obj1) && isNaN(obj2)) {
            return true;
        }
    }

    // Type check
    if (typeof obj1 !== typeof obj2) {
        return false;
    }

    // Handle primitives after type check
    if (typeof obj1 !== 'object') {
        return obj1 === obj2;
    }

    // Handle Arrays
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) {
            return false;
        }
        for (let i = 0; i < obj1.length; i++) {
            if (!deepEqual(obj1[i], obj2[i])) {
                return false;
            }
        }
        return true;
    }

    // Handle Array vs Object mismatch
    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
        return false;
    }

    // Handle Objects
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    // Quick length check
    if (keys1.length !== keys2.length) {
        return false;
    }

    // Check all keys exist and values are equal
    for (const key of keys1) {
        if (!Object.prototype.hasOwnProperty.call(obj2, key)) {
            return false;
        }
        if (!deepEqual(obj1[key], obj2[key])) {
            return false;
        }
    }

    return true;
}

/**
 * Shallow equality comparison for objects
 *
 * More performant than deepEqual when you know the object is only 1 level deep.
 * Used for comparing simple key-value objects where values are primitives.
 *
 * @param obj1 - First object to compare
 * @param obj2 - Second object to compare
 * @returns true if shallowly equal, false otherwise
 */
export function shallowEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) {
        return true;
    }

    if (obj1 == null || obj2 == null) {
        return obj1 === obj2;
    }

    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
        return obj1 === obj2;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
        return false;
    }

    for (const key of keys1) {
        if (obj1[key] !== obj2[key]) {
            return false;
        }
    }

    return true;
}
