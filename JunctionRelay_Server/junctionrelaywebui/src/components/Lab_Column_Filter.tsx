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

import React, { useMemo, useState } from "react";
import {
    Box, Checkbox, Divider, IconButton, InputAdornment, List, ListItemButton,
    ListItemIcon, ListItemText, Popover, TextField, Tooltip, Typography, Button,
} from "@mui/material";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import SearchIcon from "@mui/icons-material/Search";

// ---------------------------------------------------------------------------
// Filtering by column header.
//
// A free-text box asks the reader to guess the syntax - is it comma-separated,
// does it take a wildcard, does it match the whole cell or part of it - and gives
// no feedback when the guess is wrong: an empty table looks the same as a typo.
// Picking from the values that are actually IN the column answers all of that by
// construction. Multiple selections are ticks, not punctuation; the search box
// inside the popover narrows the choices rather than being the filter itself, so
// there is no syntax to learn and nothing to spell correctly.
// ---------------------------------------------------------------------------

// field -> the set of cell values kept. Absent or empty = column not filtered.
export type ColumnFilters = Record<string, string[]>;

export const BLANK = "(blank)";

/** Distinct, sorted cell values for one column - blanks folded into one entry. */
export const distinctValues = <T,>(rows: T[], text: (row: T) => string): string[] => {
    const seen = new Set<string>();
    for (const r of rows) seen.add(text(r).trim() || BLANK);
    const blank = seen.delete(BLANK);
    const out = Array.from(seen).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    return blank ? [...out, BLANK] : out;
};

/** True when a row survives every active filter. */
export const passesFilters = <T,>(
    row: T, filters: ColumnFilters, text: (row: T, field: string) => string,
): boolean =>
    Object.entries(filters).every(([field, picked]) =>
        !picked?.length || picked.includes(text(row, field).trim() || BLANK));

export const activeFilterCount = (filters: ColumnFilters): number =>
    Object.values(filters).filter(v => v?.length).length;

interface ColumnFilterButtonProps {
    label: string;                 // the column's own label, for the popover title
    values: string[];              // every value present in the column
    selected: string[];            // currently kept values
    onChange: (next: string[]) => void;
    // Optional grouping (e.g. a release-date filter by month and year): values that share a
    // group sit under one header whose checkbox ticks
    // or clears the whole group - a year over its months. Values keep the order given.
    groupOf?: (value: string) => string | null;
    // Optional display text for a value (the value itself is what gets matched).
    labelOf?: (value: string) => string;
}

export const ColumnFilterButton: React.FC<ColumnFilterButtonProps> = ({ label, values, selected, onChange, groupOf, labelOf }) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [search, setSearch] = useState("");

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? values.filter(v => v.toLowerCase().includes(q)
            || (labelOf ? labelOf(v).toLowerCase().includes(q) : false)
            || (groupOf ? (groupOf(v) ?? "").toLowerCase().includes(q) : false)) : values;
    }, [values, search, labelOf, groupOf]);

    const active = selected.length > 0;
    const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
    const toggleGroup = (members: string[]) => {
        const all = members.every(m => selected.includes(m));
        onChange(all ? selected.filter(s => !members.includes(s))
                     : [...selected, ...members.filter(m => !selected.includes(m))]);
    };
    const textOf = (v: string) => labelOf ? labelOf(v) : v;

    return (
        <>
            <Tooltip title={active ? `${label}: ${selected.length} selected` : `Filter by ${label}`}>
                <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}
                    sx={{
                        ml: 0.25, p: 0.25,
                        color: active ? 'primary.main' : 'action.disabled',
                        // Unfiltered columns keep the icon quiet until the row is hovered,
                        // so a header of filter icons does not shout over the labels.
                        opacity: active ? 1 : 0.45,
                        '&:hover': { opacity: 1 },
                    }}
                >
                    {active ? <FilterAltIcon sx={{ fontSize: 16 }} /> : <FilterAltOutlinedIcon sx={{ fontSize: 16 }} />}
                </IconButton>
            </Tooltip>

            <Popover
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={() => { setAnchor(null); setSearch(""); }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                slotProps={{ paper: { sx: { width: 260 } } }}
            >
                <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                        {label}
                    </Typography>
                    {values.length > 8 && (
                        <TextField
                            size="small" fullWidth autoFocus placeholder="Find a value…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            sx={{ mt: 1 }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ fontSize: 16 }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                    )}
                </Box>
                <Divider />
                <List dense sx={{ maxHeight: 280, overflowY: 'auto', py: 0 }}>
                    {shown.map((v, i) => {
                        const g = groupOf ? groupOf(v) : null;
                        const startsGroup = g != null && (i === 0 || groupOf!(shown[i - 1]) !== g);
                        const members = startsGroup ? shown.filter(x => groupOf!(x) === g) : [];
                        const picked = members.filter(m => selected.includes(m)).length;
                        return (
                        <React.Fragment key={v}>
                        {startsGroup && (
                            <ListItemButton onClick={() => toggleGroup(members)} sx={{ py: 0.25, bgcolor: 'action.hover' }}>
                                <ListItemIcon sx={{ minWidth: 32 }}>
                                    <Checkbox edge="start" size="small" disableRipple
                                        checked={picked === members.length}
                                        indeterminate={picked > 0 && picked < members.length} />
                                </ListItemIcon>
                                <ListItemText primary={g} primaryTypographyProps={{ variant: 'body2', sx: { fontWeight: 700 } }} />
                            </ListItemButton>
                        )}
                        <ListItemButton onClick={() => toggle(v)} sx={{ py: 0.25, pl: g != null ? 4 : undefined }}>
                            <ListItemIcon sx={{ minWidth: 32 }}>
                                <Checkbox edge="start" size="small" disableRipple checked={selected.includes(v)} />
                            </ListItemIcon>
                            <ListItemText
                                primary={textOf(v)}
                                primaryTypographyProps={{
                                    variant: 'body2',
                                    sx: v === BLANK ? { fontStyle: 'italic', color: 'text.secondary' } : undefined,
                                }}
                            />
                        </ListItemButton>
                        </React.Fragment>
                        );
                    })}
                    {shown.length === 0 && (
                        <Box sx={{ px: 2, py: 1.5 }}>
                            <Typography variant="body2" color="text.secondary">No matching values</Typography>
                        </Box>
                    )}
                </List>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1, py: 0.5 }}>
                    <Button size="small" disabled={!active} onClick={() => onChange([])}>Clear</Button>
                    <Button size="small" onClick={() => onChange(shown)}>
                        {search ? 'Select shown' : 'Select all'}
                    </Button>
                </Box>
            </Popover>
        </>
    );
};

export default ColumnFilterButton;
