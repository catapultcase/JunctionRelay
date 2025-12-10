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

import React from 'react';
import { Box, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';

interface Collector {
    lastFetchTime?: string;
    lastFetchTotalSensors?: number;
    lastFetchNewSensors?: number;
    lastFetchLostSensors?: number;
    lastFetchSuccessful?: boolean;
    lastFetchErrorMessage?: string;
    lastTested?: string;
    testFrequency?: number;
}

interface LastFetchStats {
    totalFetched: number;
    totalStored: number;
    newSensors: number;
    lostSensors: number;
    fetchSuccessful: boolean;
    lastFetchTime: Date | null;
}

interface SensorFetchStatsProps {
    lastFetchStats: LastFetchStats;
    collector: Collector | null;
    storedSensorsCount: number;
}

/**
 * SensorFetchStats Component
 *
 * Displays statistics from last sensor fetch including success/error status, counts, and timestamps.
 * Extracted from ConfigureCollector per architecture guidelines (component size limits).
 */
const SensorFetchStats: React.FC<SensorFetchStatsProps> = ({
    lastFetchStats,
    collector,
    storedSensorsCount
}) => {
    const hasPersistedStats = collector?.lastFetchTime;
    const hasRecentFetchStats = lastFetchStats.lastFetchTime;

    const statsToShow = hasRecentFetchStats ? lastFetchStats : {
        totalFetched: collector?.lastFetchTotalSensors || 0,
        totalStored: storedSensorsCount,
        newSensors: collector?.lastFetchNewSensors || 0,
        lostSensors: collector?.lastFetchLostSensors || 0,
        fetchSuccessful: collector?.lastFetchSuccessful ?? false,
        lastFetchTime: collector?.lastFetchTime ? new Date(collector.lastFetchTime) : null
    };

    const { totalFetched, totalStored, newSensors, lostSensors, fetchSuccessful, lastFetchTime } = statsToShow;

    return (
        <Box sx={{
            p: 2,
            bgcolor: lastFetchTime ? (fetchSuccessful ? 'action.hover' : 'error.light') : 'grey.50',
            borderRadius: 1,
            border: '1px solid',
            borderColor: lastFetchTime ? (fetchSuccessful ? 'divider' : 'error.main') : 'grey.300'
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                {lastFetchTime ? (
                    fetchSuccessful ? (
                        <CheckCircleIcon sx={{ mr: 1, color: 'primary.main', fontSize: 20 }} />
                    ) : (
                        <ErrorIcon sx={{ mr: 1, color: 'error.main', fontSize: 20 }} />
                    )
                ) : (
                    <InfoIcon sx={{ mr: 1, color: 'grey.500', fontSize: 20 }} />
                )}
                <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
                    {lastFetchTime ?
                        `Last Fetch: ${lastFetchTime.toLocaleTimeString()} on ${lastFetchTime.toLocaleDateString()}` :
                        'No fetch performed yet'
                    }
                </Typography>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 2 }}>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6" color={lastFetchTime ? (fetchSuccessful ? 'primary.main' : 'error.main') : 'grey.500'}>
                        {totalFetched}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Total Fetched
                    </Typography>
                </Box>

                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6" color="primary.main">
                        {totalStored}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        In Database
                    </Typography>
                </Box>

                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6" color={newSensors > 0 ? 'warning.main' : 'text.secondary'}>
                        {newSensors}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        New Available
                    </Typography>
                </Box>

                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6" color={lostSensors > 0 ? 'error.main' : 'text.secondary'}>
                        {lostSensors}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Lost Sensors
                    </Typography>
                </Box>

                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">
                        {collector?.testFrequency ? `${collector.testFrequency}ms` : 'Not Set'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Test Frequency
                    </Typography>
                </Box>
            </Box>

            {/* Show last tested info */}
            {collector?.lastTested && (
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
                    <InfoIcon sx={{ mr: 1, color: 'info.main', fontSize: 16 }} />
                    <Typography variant="caption" color="info.main">
                        Last tested: {new Date(collector.lastTested + 'Z').toLocaleString()}
                    </Typography>
                </Box>
            )}

            {/* Show success message for completed fetch */}
            {lastFetchTime && fetchSuccessful && newSensors === 0 && lostSensors === 0 && totalFetched > 0 && (
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
                    <InfoIcon sx={{ mr: 1, color: 'info.main', fontSize: 16 }} />
                    <Typography variant="caption" color="info.main">
                        All sensors from collector are already stored in database
                    </Typography>
                </Box>
            )}

            {/* Show warning if lost sensors detected */}
            {lastFetchTime && fetchSuccessful && lostSensors > 0 && (
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
                    <ErrorIcon sx={{ mr: 1, color: 'error.main', fontSize: 16 }} />
                    <Typography variant="caption" color="error.main">
                        Warning: {lostSensors} sensors are no longer available from the collector
                    </Typography>
                </Box>
            )}

            {/* Show error message if last fetch failed */}
            {lastFetchTime && !fetchSuccessful && collector?.lastFetchErrorMessage && (
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'flex-start' }}>
                    <ErrorIcon sx={{ mr: 1, color: 'error.main', fontSize: 16, mt: 0.1 }} />
                    <Typography variant="caption" color="error.main">
                        Last error: {collector.lastFetchErrorMessage}
                    </Typography>
                </Box>
            )}

            {/* Show message when no fetch has been performed */}
            {!lastFetchTime && (
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
                    <InfoIcon sx={{ mr: 1, color: 'grey.500', fontSize: 16 }} />
                    <Typography variant="caption" color="grey.600">
                        Click "Fetch New Sensors" to retrieve sensors from this collector
                    </Typography>
                </Box>
            )}
        </Box>
    );
};

export default SensorFetchStats;
