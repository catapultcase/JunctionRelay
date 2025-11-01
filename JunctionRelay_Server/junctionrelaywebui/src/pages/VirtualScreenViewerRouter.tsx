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

import React, { useState, useEffect } from 'react';
import { Box, CircularProgress } from '@mui/material';
import VirtualScreenViewer from './VirtualScreenViewer';
import VirtualScreenViewer2 from './VirtualScreenViewer2';

const VirtualScreenViewerRouter: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [useVirtualScreenViewer2, setUseVirtualScreenViewer2] = useState(false);

    useEffect(() => {
        const fetchSetting = async () => {
            try {
                const res = await fetch('/api/settings');
                const data = await res.json();
                const setting = data.find((s: any) => s.key === 'use_virtualscreenviewer2');
                setUseVirtualScreenViewer2(setting?.value?.toLowerCase() === 'true');
            } catch (err) {
                console.error('Error loading use_virtualscreenviewer2 setting:', err);
                // Default to false on error
                setUseVirtualScreenViewer2(false);
            } finally {
                setLoading(false);
            }
        };

        fetchSetting();
    }, []);

    if (loading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                    width: '100vw',
                    backgroundColor: '#000'
                }}
            >
                <CircularProgress />
            </Box>
        );
    }

    return useVirtualScreenViewer2 ? <VirtualScreenViewer2 /> : <VirtualScreenViewer />;
};

export default VirtualScreenViewerRouter;
