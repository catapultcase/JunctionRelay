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
 * Rive Animation Type Definitions
 *
 * These interfaces provide type safety for Rive animation data
 * including state machines, inputs, and data bindings.
 */

import type { Rive, StateMachineInput } from '@rive-app/canvas';

/**
 * Rive instance with optional extensions
 */
export interface RiveInstance extends Rive {
    // Add any custom Rive extensions here if needed
}

/**
 * Discovered Rive state machine with inputs
 */
export interface RiveMachine {
    name: string;
    inputs: StateMachineInput[];
}

/**
 * Discovered Rive data binding
 */
export interface RiveBinding {
    name: string;
    currentValue: any;
}
