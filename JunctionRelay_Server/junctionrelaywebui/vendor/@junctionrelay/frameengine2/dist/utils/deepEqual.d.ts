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
export declare function deepEqual(obj1: any, obj2: any): boolean;
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
export declare function shallowEqual(obj1: any, obj2: any): boolean;
//# sourceMappingURL=deepEqual.d.ts.map