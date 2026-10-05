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

// A rack drawn to scale, in the orientation it is actually mounted in.
//
// TWO INDEPENDENT ROTATIONS, because there are two physical facts:
//   • the RACK's rotation - how the cabinet itself stands. Most stand upright; some are laid on
//     their side or wall-mounted.
//   • each PLACEMENT's rotation - how that unit is mounted INSIDE the rack. A shelf or tray put
//     in on its side sits in an otherwise ordinary upright rack.
// A pair of desktop racks standing vertically either side of a monitor is the second case: only
// the insides are turned.
//
// ⛔ RACK ROTATION PICKS A LAYOUT. It is NOT a CSS transform, and the version that used one was
// wrong in a way that had to be seen: transforms do not affect layout, so the container inherited
// the rotated bounding box, the caption collapsed into a four-line vertical column of letters,
// the labels came out sideways, and the rack rendered visibly SMALLER than its neighbours. A
// rotated picture of a vertical rack is not a picture of a horizontal rack.
//
// A SHELF, DRAWER OR TRAY CARRIES THINGS: a placement with onPlacementId sits on that carrier,
// takes no U of its own, and is drawn inside the carrier's block, side by side with whatever else
// is on it (two Sparks on one 1U shelf).
//
// 🔑 ONE SCALE FOR BOTH AXES, so a rack keeps its real size at any angle. A rack unit is 1.75
// inches by definition, so U converts to inches and everything is drawn in inches: a 3U 10-inch
// rack is 5.25 x 10 upright and 10 x 5.25 on its end - the same object, turned.

import { useMemo } from 'react';
import { Box, Typography, Tooltip, Chip } from '@mui/material';
import { useTheme } from '@mui/material/styles';

export interface ElevationPlacement {
    id: number;
    positionU?: number | null;
    heightU?: number | null;
    face: string;
    rotation?: number | null;
    status: string;
    occupantLabel?: string | null;
    occupantKind?: string | null;
    onPlacementId?: number | null;
}

interface Props {
    kind: string;
    name: string;
    heightU?: number | null;
    widthInches?: number | null;
    rotation?: number;
    placements: ElevationPlacement[];
    face: 'front' | 'rear';
    selectedId?: number | null;
    onSelect?: (id: number) => void;
}

const U_INCHES = 1.75;          // a rack unit, by definition
const PX_PER_INCH = 15;
const RAIL = 18;                // numbered rail alongside the U axis

// ⛔ NO MINIMUM SIZE. There was one - MIN_SPAN = 120px, added so a 7-inch rack's labels stayed
// legible - and it quietly broke the only promise this drawing makes. 19 inches drew true at 285px
// and 10 inches true at 150px, but 7 inches was inflated 105 -> 120: 14% too wide. Racks then could
// not be compared to each other, which was spotted by eye against the 19-inch rack. Every rack is
// drawn at PX_PER_INCH and nothing is clamped, so any two racks on screen are 1:1 with each other.

const LabRackElevation = ({
    kind, name, heightU, widthInches, rotation = 0, placements, face, selectedId, onSelect,
}: Props) => {
    const theme = useTheme();
    const dark = theme.palette.mode === 'dark';

    const frame = dark ? '#4a5058' : '#b9bec6';
    const slotEmpty = dark ? '#23272c' : '#f4f5f7';
    const slotLine = dark ? '#2f343a' : '#e4e6ea';
    const railText = theme.palette.text.secondary;

    // 'both' occupies the U on either face, so it shows on whichever one is displayed.
    const visible = useMemo(
        () => placements.filter(p => p.face === face || p.face === 'both'),
        [placements, face]);

    const positioned = visible.filter(p => p.positionU != null);
    // what sits on a shelf/drawer/tray, by carrier; a carrier that is not drawn leaves them floating
    const carried = (id: number) => visible.filter(p => p.onPlacementId === id);
    const drawnIds = new Set(positioned.map(p => p.id));
    const floating = visible.filter(p => p.positionU == null && !(p.onPlacementId != null && drawnIds.has(p.onPlacementId)));

    if (kind !== 'Rack') {
        return (
            <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1, width: 200 }}>
                <Typography variant="caption" color="text.secondary">
                    No drawing for a {kind.toLowerCase()} yet — {visible.length} item
                    {visible.length === 1 ? '' : 's'} placed. Racks draw to scale; other kinds need
                    their own shape rather than a U grid.
                </Typography>
            </Box>
        );
    }

    if (!heightU) {
        return (
            <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1, width: 200 }}>
                <Typography variant="caption" color="text.secondary">
                    Set this rack's height in U and it will draw here.
                </Typography>
            </Box>
        );
    }

    const uPx = U_INCHES * PX_PER_INCH;                        // along the U axis
    const spanPx = (widthInches ?? 19) * PX_PER_INCH;          // across the rails
    const uAxisPx = Math.round(heightU * uPx);

    // ⛔ WHICH AXIS THE U LIVE ON is the whole question, and TWO things decide it.
    //
    //   • the RACK laid on its end (rotation 90/270) turns the whole cabinet, U axis included;
    //   • units MOUNTED TURNED means the rails run across, so the U march left-to-right while
    //     the cabinet still stands upright - each unit a vertical slab, side by side. That is
    //     a desktop rack stood vertically beside a monitor, insides rotated.
    //
    // 🔑 They COMPOSE. A turned unit in a rack that is itself on its end puts the U back on the
    // vertical - two turns cancel. Hence the XOR rather than either flag winning.
    //
    // ⚠️ The first version treated unit rotation as a label effect and left the U vertical, which
    // drew a 2U band across the rack with its name squeezed into an unreadable column. The report
    // was exact: "the Us are on the wrong axis".
    const rackTurned = rotation === 90 || rotation === 270;
    const unitsTurned = positioned.some(p => p.rotation === 90 || p.rotation === 270);
    const horizontal = rackTurned !== unitsTurned;
    const inverted = rotation === 180;

    // ⛔ THE RAILS ARE THE DRAWING. There was a version that also carried a case - outer
    // width and height on the space, rails inset inside it - so that two spaces describing
    // the same physical box in different modes could come out the same size. It was the wrong
    // trade: it wanted measurements the app has no business asking for, to reconcile two
    // numbers that are already true. A 5U/7-inch rack and a 3U/10-inch rack ARE different
    // rectangles, and drawing them differently is the drawing being honest.
    const frameW = Math.round(horizontal ? uAxisPx : spanPx);
    const frameH = Math.round(horizontal ? spanPx : uAxisPx);

    // Offset of a U along its axis, in px from the frame's start.
    // Upright: U1 at the BOTTOM. Horizontal: U1 at the LEFT. Inverted: U1 at the top.
    const offsetOf = (u: number) =>
        horizontal || inverted ? Math.round((u - 1) * uPx) : Math.round((heightU - u) * uPx);

    // The U a block is DRAWN from: whichever end of its span comes first along the axis.
    const anchorU = (p: ElevationPlacement) =>
        horizontal || inverted ? p.positionU! : p.positionU! + (p.heightU ?? 1) - 1;

    const units = Array.from({ length: heightU }, (_, i) => i + 1);

    return (
        <Box>
            {/* ⚠️ OUTSIDE the frame and always horizontal. When this lived inside a rotated box it
                inherited the narrowed width and wrapped into a vertical column of letters. */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                {name} — {face} — {heightU}U{widthInches ? ` · ${widthInches}"` : ''}
                {rotation ? ` · rack ${rotation}°` : ''}{unitsTurned ? ' · units 90°' : ''}
            </Typography>

            <Box sx={{
                position: 'relative',
                width: frameW + (horizontal ? 0 : RAIL),
                height: frameH + (horizontal ? RAIL : 0),
            }}>
                <Box sx={{
                    position: 'absolute', left: horizontal ? 0 : RAIL, top: 0,
                    width: frameW, height: frameH,
                    border: `2px solid ${frame}`, borderRadius: 1,
                    bgcolor: slotEmpty, overflow: 'hidden',
                }}>
                    {units.map(u => (
                        <Box key={`slot-${u}`} sx={{
                            position: 'absolute',
                            ...(horizontal
                                ? { left: offsetOf(u), top: 0, width: uPx, height: '100%', borderRight: `1px solid ${slotLine}` }
                                : { top: offsetOf(u), left: 0, height: uPx, width: '100%', borderBottom: `1px solid ${slotLine}` }),
                        }} />
                    ))}

                    {positioned.map(p => {
                        const span = p.heightU ?? 1;
                        const off = offsetOf(anchorU(p));
                        const len = Math.round(span * uPx) - 3;
                        const installed = p.status === 'installed';
                        const onIt = carried(p.id);

                        return (
                            <Tooltip key={p.id} title={`${p.occupantLabel ?? 'placement'} — U${p.positionU}${
                                span > 1 ? `–U${p.positionU! + span - 1}` : ''} — ${p.status}${
                                p.rotation ? ` — mounted ${p.rotation}°` : ''}${
                                onIt.length ? ` — holds ${onIt.map(c => c.occupantLabel ?? 'placement').join(', ')}` : ''}`}>
                                <Box
                                    onClick={() => onSelect?.(p.id)}
                                    sx={{
                                        position: 'absolute',
                                        ...(horizontal
                                            ? { left: off + 1, top: 2, width: len, bottom: 2 }
                                            : { top: off + 1, left: 2, height: len, right: 2 }),
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        px: 0.5, borderRadius: 0.5,
                                        cursor: onSelect ? 'pointer' : 'default',
                                        fontSize: 11, lineHeight: 1.1, overflow: 'hidden',
                                        // Planned is hollow: a rack on paper must not read as built.
                                        bgcolor: installed ? (dark ? '#1e4620' : '#c8e6c9') : 'transparent',
                                        border: installed
                                            ? `1px solid ${dark ? '#2e7d32' : '#81c784'}`
                                            : `1px dashed ${dark ? '#7a6a3a' : '#c8a951'}`,
                                        color: theme.palette.text.primary,
                                        outline: selectedId === p.id ? `2px solid ${theme.palette.primary.main}` : 'none',
                                    }}
                                >
                                    {onIt.length === 0 ? (
                                    <Box sx={{
                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                        fontWeight: 500, whiteSpace: 'nowrap',
                                        // A block in a horizontal-U rack is a tall narrow slab, so
                                        // its name runs down it; in an upright rack it runs across.
                                        ...(horizontal
                                            ? { writingMode: 'vertical-rl', textOrientation: 'mixed', maxHeight: '100%' }
                                            : { maxWidth: '100%' }),
                                    }}>
                                        {p.occupantLabel ?? '—'}
                                    </Box>
                                    ) : (
                                    // the carrier's block holds its items side by side, across the rails
                                    <Box sx={{ display: 'flex', flexDirection: horizontal ? 'column' : 'row', gap: '3px', width: '100%', height: '100%', py: horizontal ? 0 : '2px', px: horizontal ? '2px' : 0 }}>
                                        {onIt.map(c => (
                                            <Tooltip key={c.id} title={`${c.occupantLabel ?? 'placement'} — on ${p.occupantLabel ?? 'the shelf'} — ${c.status}`}>
                                                <Box onClick={e => { e.stopPropagation(); onSelect?.(c.id); }} sx={{
                                                    flex: 1, minWidth: 0, minHeight: 0, borderRadius: 0.5,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                                                    bgcolor: c.status === 'installed' ? (dark ? '#2b5a2e' : '#a5d6a7') : (dark ? '#2a2620' : '#fffaf0'),
                                                    border: c.status === 'installed' ? `1px solid ${dark ? '#43a047' : '#66bb6a'}` : `1px dashed ${dark ? '#7a6a3a' : '#c8a951'}`,
                                                    outline: selectedId === c.id ? `2px solid ${theme.palette.primary.main}` : 'none',
                                                }}>
                                                    <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500,
                                                        ...(horizontal ? { writingMode: 'vertical-rl', textOrientation: 'mixed', maxHeight: '100%' } : { maxWidth: '100%' }) }}>
                                                        {c.occupantLabel ?? '—'}
                                                    </Box>
                                                </Box>
                                            </Tooltip>
                                        ))}
                                    </Box>
                                    )}
                                </Box>
                            </Tooltip>
                        );
                    })}
                </Box>

                {/* The numbered rail, alongside whichever axis the U run on. */}
                {units.map(u => (
                    <Box key={`rail-${u}`} sx={{
                        position: 'absolute', fontSize: 9, color: railText,
                        fontVariantNumeric: 'tabular-nums', textAlign: 'center',
                        ...(horizontal
                            ? { left: offsetOf(u), top: frameH + 2, width: uPx }
                            : {
                                top: offsetOf(u), left: 0, height: uPx, width: RAIL,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }),
                    }}>
                        {u}
                    </Box>
                ))}
            </Box>

            {/* ⛔ Not decoration: 17 of 18 real placements had no position, so without this the
                drawing would silently omit almost everything and look like an empty rack. */}
            {floating.length > 0 && (
                <Box sx={{
                    mt: 1, p: 1, border: 1, borderStyle: 'dashed', borderColor: 'warning.main',
                    borderRadius: 1, maxWidth: Math.max(frameW + RAIL, 200),
                }}>
                    <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 0.5 }}>
                        {floating.length} not positioned — in this space, but not at a U
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {floating.map(p => (
                            <Chip key={p.id} size="small" variant="outlined"
                                label={`${p.occupantLabel ?? '—'}${p.heightU && p.heightU > 1 ? ` (${p.heightU}U)` : ''}`}
                                onClick={onSelect ? () => onSelect(p.id) : undefined}
                                sx={{ maxWidth: '100%' }} />
                        ))}
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default LabRackElevation;
