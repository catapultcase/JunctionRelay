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
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Typography,
    Box,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface Collector {
    id: number;
    name: string;
    collectorType: string;
    status: string;
    securityStatus?: string;
    lastFetchErrorMessage?: string;
    lastTested?: string;
    externalAccessToken?: boolean;
    lastFetchTime?: string;
    lastFetchLostSensors?: number;
    lastFetchSuccessful?: boolean;
}

interface Issue {
    id: number;
    type: 'error' | 'warning';
    title: string;
    description: string;
    timestamp: string;
    collectorId: number;
}

interface CollectorsWarningsCardProps {
    collectors: Collector[];
}

const Collectors_WarningsCard: React.FC<CollectorsWarningsCardProps> = ({ collectors }) => {
    const [expanded, setExpanded] = useState(() => {
        try { const saved = localStorage.getItem('collectors_issues_expanded'); return saved !== null ? JSON.parse(saved) : true; }
        catch { return true; }
    });

    // Build issues list (similar to backend logic)
    const issues: Issue[] = [];
    let issueId = 1;

    // Get locked collector IDs using SecurityStatus from backend
    const lockedCollectorIds = collectors
        .filter(c => c.securityStatus === 'Locked')
        .map(c => c.id);

    // Add errors - collectors with Status="Error" and error messages (exclude EventEngine and locked collectors)
    collectors
        .filter(c =>
            c.collectorType !== 'EventEngine' &&
            c.status === 'Error' &&
            c.lastFetchErrorMessage &&
            !lockedCollectorIds.includes(c.id)
        )
        .forEach(collector => {
            issues.push({
                id: issueId++,
                type: 'error',
                title: `${collector.name} has errors`,
                description: collector.lastFetchErrorMessage || 'Unknown error',
                timestamp: collector.lastTested || new Date().toISOString(),
                collectorId: collector.id
            });
        });

    // Add warnings - locked collectors (exclude EventEngine)
    collectors
        .filter(c =>
            c.collectorType !== 'EventEngine' &&
            lockedCollectorIds.includes(c.id)
        )
        .forEach(collector => {
            issues.push({
                id: issueId++,
                type: 'warning',
                title: `${collector.name} is locked`,
                description: 'Collector requires password to unlock',
                timestamp: new Date().toISOString(),
                collectorId: collector.id
            });
        });

    // Add warnings - collectors that have never fetched (exclude EventEngine, locked collectors, and Tested)
    collectors
        .filter(c =>
            c.collectorType !== 'EventEngine' &&
            !c.lastFetchTime &&
            c.status !== 'Tested' &&
            !lockedCollectorIds.includes(c.id)
        )
        .forEach(collector => {
            issues.push({
                id: issueId++,
                type: 'warning',
                title: `${collector.name} not fetched`,
                description: 'Collector has never fetched data',
                timestamp: new Date().toISOString(),
                collectorId: collector.id
            });
        });

    // Add warnings - collectors with lost sensors (as long as it still fetches at least 1)
    collectors
        .filter(c => (c.lastFetchLostSensors ?? 0) > 0)
        .forEach(collector => {
            const lostCount = collector.lastFetchLostSensors ?? 0;
            issues.push({
                id: issueId++,
                type: 'warning',
                title: `${collector.name} lost ${lostCount} sensor${lostCount === 1 ? '' : 's'}`,
                description: `${lostCount} sensor${lostCount === 1 ? '' : 's'} no longer detected`,
                timestamp: collector.lastFetchTime || new Date().toISOString(),
                collectorId: collector.id
            });
        });

    // Count by type
    const warningCount = issues.filter(i => i.type === 'warning').length;
    const errorCount = issues.filter(i => i.type === 'error').length;

    if (issues.length === 0) {
        return null; // Don't show the accordion if there are no issues
    }

    const formatTime = (timestamp?: string) => {
        if (!timestamp) return 'Never tested';
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    };

    const openCollectorEdit = (collectorId: number) => {
        // Trigger edit by finding the collector's edit button and clicking it
        const editButton = document.querySelector(`[data-collector-id="${collectorId}"][data-action="edit"]`) as HTMLElement;
        if (editButton) {
            editButton.click();
        }
    };

    return (
        <Accordion expanded={expanded} onChange={() => setExpanded((prev: boolean) => { const next = !prev; localStorage.setItem('collectors_issues_expanded', JSON.stringify(next)); return next; })} sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                    <WarningIcon color="primary" />
                    <Typography variant="h6" sx={{ fontSize: '1rem' }}>
                        Current Issues
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        {errorCount > 0 && (
                            <Chip
                                icon={<ErrorIcon />}
                                label={`${errorCount} Error${errorCount !== 1 ? 's' : ''}`}
                                size="small"
                                color="error"
                                variant="outlined"
                            />
                        )}
                        {warningCount > 0 && (
                            <Chip
                                icon={<WarningIcon />}
                                label={`${warningCount} Warning${warningCount !== 1 ? 's' : ''}`}
                                size="small"
                                color="warning"
                                variant="outlined"
                            />
                        )}
                    </Box>
                </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell>Collector</TableCell>
                                <TableCell>Severity</TableCell>
                                <TableCell>Issue</TableCell>
                                <TableCell>Description</TableCell>
                                <TableCell>Time</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {issues.map((issue) => {
                                const collector = collectors.find(c => c.id === issue.collectorId);
                                if (!collector) return null;

                                return (
                                    <TableRow
                                        key={issue.id}
                                        hover
                                        sx={{ cursor: 'pointer' }}
                                        onClick={() => openCollectorEdit(collector.id)}
                                    >
                                        <TableCell>
                                            <Box>
                                                <Typography variant="body2" fontWeight="bold">
                                                    {collector.name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {collector.collectorType}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                icon={issue.type === 'error' ? <ErrorIcon /> : <WarningIcon />}
                                                label={issue.type}
                                                color={issue.type === 'error' ? 'error' : 'warning'}
                                                size="small"
                                                sx={{ textTransform: 'capitalize' }}
                                            />
                                        </TableCell>
                                        <TableCell>{issue.title}</TableCell>
                                        <TableCell>{issue.description}</TableCell>
                                        <TableCell>
                                            <Typography variant="caption">
                                                {formatTime(issue.timestamp)}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </AccordionDetails>
        </Accordion>
    );
};

export default Collectors_WarningsCard;
