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

// The price-colors mode toggle, IN the pages whose colors it changes.
//
// A display setting belongs where the display is, so this sits in the Inventory and
// Observations headers, where whoever reads the colors can see and change the setting.
//
// The explanation rides as the tooltip, switching with the mode. setPriceColorMode writes
// the settings DB, so the mode follows the server, not the browser.

import { useState } from 'react';
import { Tooltip, ToggleButton, ToggleButtonGroup } from '@mui/material';
import {
    getPriceColorMode, setPriceColorMode, type PriceColorMode,
} from './Lab_Display_Settings';

const HINTS: Record<PriceColorMode, string> = {
    verdict: 'Value held: green = above what you paid, red = below. Market moves stay neutral.',
    movement: 'Price watch: green = prices falling, red = rising — on every comparison.',
};

const LabPriceColorsToggle = ({ onChanged }: { onChanged?: () => void }) => {
    const [mode, setMode] = useState<PriceColorMode>(getPriceColorMode());

    return (
        <Tooltip title={HINTS[mode]}>
            <ToggleButtonGroup
                size="small" exclusive value={mode}
                onChange={(_, v: PriceColorMode | null) => {
                    if (!v) return;
                    setMode(v);
                    setPriceColorMode(v);   // persists to the settings DB
                    onChanged?.();
                }}
            >
                <ToggleButton value="verdict">Value held</ToggleButton>
                <ToggleButton value="movement">Price watch</ToggleButton>
            </ToggleButtonGroup>
        </Tooltip>
    );
};

export default LabPriceColorsToggle;
