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

import React, { useCallback, useMemo } from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';
import type { PlacedElement } from './types/FrameEngine2_LayoutTypes';
import { SensorProperties } from './properties/FrameEngine2_ElementProperties_Sensor';
import { TextProperties } from './properties/FrameEngine2_ElementProperties_Text';
import { TimeDateProperties } from './properties/FrameEngine2_ElementProperties_TimeDate';
import { GaugeProperties } from './properties/FrameEngine2_ElementProperties_Gauge';
import { MediaImageProperties } from './properties/FrameEngine2_ElementProperties_MediaImage';
import { MediaVideoProperties } from './properties/FrameEngine2_ElementProperties_MediaVideo';
import { MediaRiveProperties } from './properties/FrameEngine2_ElementProperties_MediaRive';
import { FrameEngine2_ElementProperties_ECG } from './properties/FrameEngine2_ElementProperties_ECG';

interface FrameEngine2_Tab_PropertiesProps {
    /** Selected element (null if none selected) */
    selectedElement: PlacedElement | null;

    /** Callback to update element properties */
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void;

    /** Callback to delete element */
    onDeleteElement: (elementId: string) => void;
}

/**
 * Universal properties panel orchestrator
 * Shows common sections (Element Info, Position & Size) and routes to element-specific properties
 */
const FrameEngine2_Tab_Properties: React.FC<FrameEngine2_Tab_PropertiesProps> = React.memo(({
    selectedElement,
    onUpdateElement,
    onDeleteElement
}) => {
    // Update transform properties (position, size & rotation)
    const updateTransformProperty = useCallback((property: keyof Pick<PlacedElement, 'x' | 'y' | 'width' | 'height' | 'rotation'>, value: number) => {
        if (!selectedElement) return;
        onUpdateElement(selectedElement.id, { [property]: value });
    }, [selectedElement, onUpdateElement]);

    // Delete handler
    const handleDelete = useCallback(() => {
        if (!selectedElement) return;
        onDeleteElement(selectedElement.id);
    }, [selectedElement, onDeleteElement]);

    // Render element-specific properties based on type
    const renderElementSpecificProperties = useMemo(() => {
        if (!selectedElement) return null;

        const props = {
            selectedElement,
            onUpdateElement,
            onDeleteElement
        };

        switch (selectedElement.type) {
            case 'sensor':
                return <SensorProperties {...props} />;
            case 'text':
                return <TextProperties {...props} />;
            case 'timedate':
                return <TimeDateProperties {...props} />;
            case 'gauge':
                return <GaugeProperties {...props} />;
            case 'media-image':
                return <MediaImageProperties {...props} />;
            case 'media-video':
                return <MediaVideoProperties {...props} />;
            case 'media-rive':
                return <MediaRiveProperties {...props} />;
            case 'ecg':
                return <FrameEngine2_ElementProperties_ECG {...props} />;
            default:
                return (
                    <Box>
                        <Typography variant="caption" color="text.secondary">
                            No properties available for this element type
                        </Typography>
                    </Box>
                );
        }
    }, [selectedElement, onUpdateElement, onDeleteElement]);

    // If nothing selected, show empty state
    if (!selectedElement) {
        return (
            <Box sx={{ p: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                    No element selected
                </Typography>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                p: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                overflowY: 'auto',
                height: '100%'
            }}
        >
            {/* Element Info Section */}
            <Box>
                <Typography variant="subtitle2" fontWeight="bold" mb={1}>
                    Element Info
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                    Type: <strong>{selectedElement.type}</strong>
                </Typography>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    mt={0.5}
                    sx={{
                        fontFamily: 'monospace',
                        fontSize: '10px',
                        wordBreak: 'break-all',
                        lineHeight: 1.4
                    }}
                >
                    ID: {selectedElement.id}
                </Typography>
            </Box>

            {/* Position & Size Section (Common to all elements) */}
            <Box>
                <Typography variant="subtitle2" fontWeight="bold" mb={1}>
                    Position & Size
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Box sx={{ mb: 1 }}>
                        <TextField
                            label="X"
                            type="number"
                            size="small"
                            fullWidth
                            value={selectedElement.x ?? 0}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                    updateTransformProperty('x', 0);
                                } else {
                                    const parsed = parseInt(val);
                                    updateTransformProperty('x', isNaN(parsed) ? 0 : parsed);
                                }
                            }}
                            sx={{ '& input': { fontFamily: 'monospace' } }}
                        />
                    </Box>
                    <Box sx={{ mb: 1 }}>
                        <TextField
                            label="Y"
                            type="number"
                            size="small"
                            fullWidth
                            value={selectedElement.y ?? 0}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                    updateTransformProperty('y', 0);
                                } else {
                                    const parsed = parseInt(val);
                                    updateTransformProperty('y', isNaN(parsed) ? 0 : parsed);
                                }
                            }}
                            sx={{ '& input': { fontFamily: 'monospace' } }}
                        />
                    </Box>
                    <Box sx={{ mb: 1 }}>
                        <TextField
                            label="Width"
                            type="number"
                            size="small"
                            fullWidth
                            value={selectedElement.width ?? 100}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                    updateTransformProperty('width', 100);
                                } else {
                                    const parsed = parseInt(val);
                                    updateTransformProperty('width', isNaN(parsed) ? 100 : parsed);
                                }
                            }}
                            sx={{ '& input': { fontFamily: 'monospace' } }}
                        />
                    </Box>
                    <Box sx={{ mb: 1 }}>
                        <TextField
                            label="Height"
                            type="number"
                            size="small"
                            fullWidth
                            value={selectedElement.height ?? 100}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                    updateTransformProperty('height', 100);
                                } else {
                                    const parsed = parseInt(val);
                                    updateTransformProperty('height', isNaN(parsed) ? 100 : parsed);
                                }
                            }}
                            sx={{ '& input': { fontFamily: 'monospace' } }}
                        />
                    </Box>
                    <Box sx={{ mb: 1, gridColumn: '1 / -1' }}>
                        <TextField
                            label="Rotation (degrees)"
                            type="number"
                            size="small"
                            fullWidth
                            value={selectedElement.rotation ?? 0}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                    updateTransformProperty('rotation', 0);
                                } else {
                                    const parsed = parseFloat(val);
                                    updateTransformProperty('rotation', isNaN(parsed) ? 0 : parsed);
                                }
                            }}
                            sx={{ '& input': { fontFamily: 'monospace' } }}
                            inputProps={{
                                step: 1,
                                min: 0,
                                max: 360
                            }}
                        />
                    </Box>
                </Box>
            </Box>

            {/* Element-Specific Properties */}
            {renderElementSpecificProperties}

            {/* Delete Button */}
            <Box sx={{ mt: 'auto', pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Button
                    variant="contained"
                    color="error"
                    fullWidth
                    onClick={handleDelete}
                >
                    Delete Element
                </Button>
            </Box>
        </Box>
    );
});

FrameEngine2_Tab_Properties.displayName = 'FrameEngine2_Tab_Properties';

export default FrameEngine2_Tab_Properties;
