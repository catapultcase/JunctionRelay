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

import React, { useState } from 'react';
import {
    Box,
    Button,
    Typography,
    Snackbar,
    Alert,
    useTheme,
    useMediaQuery
} from '@mui/material';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { AlertColor } from '@mui/material/Alert';

const Settings_LocalCache: React.FC = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
        open: false,
        message: '',
        severity: 'info'
    });

    const showSnackbar = (message: string, severity: AlertColor = 'info') => {
        setSnackbar({ open: true, message, severity });
    };

    const handleCloseSnackbar = () => {
        setSnackbar({ ...snackbar, open: false });
    };

    const handleClearCache = () => {
        try {
            const itemCount = localStorage.length;
            localStorage.clear();
            showSnackbar(`Cleared ${itemCount} cached items. Refresh the page to see changes.`, 'success');
        } catch (error) {
            console.error('Error clearing browser cache:', error);
            showSnackbar('Error clearing browser cache', 'error');
        }
    };

    return (
        <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Clear all locally cached data including table settings, preferences, and view states.
            </Typography>

            <Button
                variant="outlined"
                color="warning"
                startIcon={<DeleteSweepIcon />}
                onClick={handleClearCache}
                fullWidth={isMobile}
            >
                Clear Browser Cache
            </Button>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </>
    );
};

export default Settings_LocalCache;
