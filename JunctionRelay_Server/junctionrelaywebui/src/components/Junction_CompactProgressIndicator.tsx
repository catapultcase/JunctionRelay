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
import { Box, LinearProgress, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { JunctionStartStage, getStageDisplayName } from '../types/notifications';

interface CompactProgressIndicatorProps {
    junctionName: string;
    currentStage: JunctionStartStage;
    detailMessage: string;
    isGatewayJunction?: boolean;
    hasError?: boolean;
    isComplete?: boolean;
}

export const CompactProgressIndicator: React.FC<CompactProgressIndicatorProps> = ({
    junctionName,
    currentStage,
    detailMessage,
    isGatewayJunction = false,
    hasError = false,
    isComplete = false
}) => {
    const getProgressPercentage = (stage: JunctionStartStage, isGateway: boolean): number => {
        const totalSteps = isGateway ? 6 : 5;
        let currentStep = stage;

        // Adjust for non-gateway junctions (skip ConfiguringGateway)
        if (!isGateway && stage >= JunctionStartStage.ConfiguringGateway) {
            currentStep = stage - 1;
        }

        return (currentStep / totalSteps) * 100;
    };

    const progress = getProgressPercentage(currentStage, isGatewayJunction);

    return (
        <Box
            sx={{
                backgroundColor: (theme) => theme.palette.background.paper,
                borderRadius: 1,
                padding: 2,
                boxShadow: (theme) => theme.shadows[2],
                border: (theme) => `1px solid ${theme.palette.divider}`
            }}
        >
            {/* Title row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: 1 }}>
                {isComplete && !hasError && (
                    <CheckCircleIcon sx={{ color: 'success.main', fontSize: '1.2rem' }} />
                )}
                {hasError && (
                    <ErrorIcon sx={{ color: 'error.main', fontSize: '1.2rem' }} />
                )}
                <Typography
                    variant="body2"
                    sx={{
                        fontWeight: 700,
                        color: (theme) => {
                            if (hasError) return theme.palette.error.main;
                            if (isComplete) return theme.palette.success.main;
                            return theme.palette.text.primary;
                        }
                    }}
                >
                    {isComplete ? (hasError ? 'Failed to Start' : 'Started') : 'Starting'}: {junctionName}
                </Typography>
            </Box>

            {/* Progress bar */}
            <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                    height: 4,
                    borderRadius: 2,
                    marginBottom: 1,
                    backgroundColor: (theme) => theme.palette.action.hover,
                    '& .MuiLinearProgress-bar': {
                        borderRadius: 2,
                        backgroundColor: (theme) => {
                            if (hasError) return theme.palette.error.main;
                            if (isComplete) return theme.palette.success.main;
                            return theme.palette.text.secondary; // Neutral gray for in-progress
                        }
                    }
                }}
            />

            {/* Current stage and detail */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                    variant="caption"
                    sx={{
                        fontWeight: 600,
                        color: 'text.secondary'
                    }}
                >
                    {getStageDisplayName(currentStage)}:
                </Typography>
                <Typography
                    variant="caption"
                    sx={{
                        color: 'text.secondary',
                        fontStyle: 'italic',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {detailMessage}
                </Typography>
            </Box>
        </Box>
    );
};
