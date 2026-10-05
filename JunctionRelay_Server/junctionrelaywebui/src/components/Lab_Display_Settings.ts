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

// Homelab display settings. ONE price-color lens applies everywhere at once, so a
// number can never be green on one Lab page and red on another:
//
//   verdict  — "value held": green = above what you paid, red = below. Market
//              movement between observations carries NO judgment color, because a
//              market move has no single valence (a drop is good for rebuying and
//              bad for value held at the same time).
//   movement — "price watch": green = prices falling, red = rising, applied to
//              every comparison including vs-Paid.
//
// The value of record is the server settings DB (`lab_price_colors_movement`,
// boolean, via the generic /api/settings endpoints), so it follows the user across
// browsers. localStorage is only a mirror so render paths stay synchronous; pages
// call refreshPriceColorMode() on mount to sync the mirror.
export type PriceColorMode = 'verdict' | 'movement';

const PRICE_COLOR_KEY = 'lab_price_color_mode';
const SETTING_KEY = 'lab_price_colors_movement';

// Default is Price Watch / movement: nothing stored means green
// = falling, red = rising. 'verdict' is the mode you opt INTO.
export const getPriceColorMode = (): PriceColorMode =>
    localStorage.getItem(PRICE_COLOR_KEY) === 'verdict' ? 'verdict' : 'movement';

export const refreshPriceColorMode = async (): Promise<PriceColorMode> => {
    try {
        const res = await fetch('/api/settings/flags');
        if (res.ok) {
            const flags = await res.json();
            // Absent flag = the default (movement); only an explicit false means verdict.
            const mode: PriceColorMode = flags[SETTING_KEY] === false ? 'verdict' : 'movement';
            localStorage.setItem(PRICE_COLOR_KEY, mode);
            return mode;
        }
    } catch { /* offline/dev — the mirror stands */ }
    return getPriceColorMode();
};

export const setPriceColorMode = async (mode: PriceColorMode) => {
    localStorage.setItem(PRICE_COLOR_KEY, mode);
    try {
        await fetch(`/api/settings/toggle/${SETTING_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: mode === 'movement' })
        });
    } catch { /* mirror already updated; server catches up next save */ }
};

// Comparison against Paid — the owner's scoreboard. Returns an sx color token,
// or null for "no color" (zero delta).
export const vsPaidColor = (delta: number, mode: PriceColorMode): string | null => {
    if (Math.abs(delta) < 0.005) return null;
    if (mode === 'verdict') return delta > 0 ? 'success.main' : 'error.main';
    return delta > 0 ? 'error.main' : 'success.main';
};

// Market movement — this observation vs the prior one. Neutral (null) in verdict
// mode by design; judgment colors belong to vs-Paid there.
export const movementColor = (delta: number, mode: PriceColorMode): string | null => {
    if (mode === 'verdict') return null;
    if (Math.abs(delta) < 0.005) return null;
    return delta > 0 ? 'error.main' : 'success.main';
};
