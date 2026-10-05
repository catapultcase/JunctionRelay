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

// The search box that sits above a component/machine picklist.
//
// Extracted at its third use (Spaces' two dialogs and Install-from-Shelf). Any picker over
// 200 components needs it, and three copies of the same adornment wiring would drift.
// Follows ui-style-guide.md §Search Bar Pattern: size small, search adornment, clear button
// when non-empty, never fullWidth, flex row with gap 1 and mb 2.

import { Box, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

interface Props {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    matchCount?: number;      // shown only while a query is active
    sx?: object;
}

const LabPickerSearch = ({ value, onChange, placeholder = 'Search...', matchCount, sx }: Props) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, ...sx }}>
        <TextField
            size="small"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            InputProps={{
                startAdornment: (
                    <InputAdornment position="start">
                        <SearchIcon />
                    </InputAdornment>
                ),
                endAdornment: value ? (
                    <InputAdornment position="end">
                        <IconButton size="small" onClick={() => onChange('')} edge="end">
                            <ClearIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </InputAdornment>
                ) : null,
            }}
        />
        {value && matchCount !== undefined && (
            <Typography variant="caption" color="text.secondary">
                {matchCount} match{matchCount === 1 ? '' : 'es'}
            </Typography>
        )}
    </Box>
);

export default LabPickerSearch;
