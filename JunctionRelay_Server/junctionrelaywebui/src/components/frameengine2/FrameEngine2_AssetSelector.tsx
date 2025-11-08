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

/* eslint-disable react/jsx-pascal-case */
// Note: Component names use underscore naming convention for namespace organization (FrameEngine2_*)
// This is a deliberate architectural choice and does not violate PascalCase - the components ARE PascalCase

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    CircularProgress,
    Alert,
    Typography,
    SelectChangeEvent
} from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';

/**
 * Asset types supported by the selector
 */
export type AssetType = 'image' | 'video' | 'rive';

/**
 * File info returned from backend
 */
interface AssetFileInfo {
    filename: string;
    displayName: string;
    fileSize: number;
    duration?: number; // For videos
}

interface FrameEngine2_AssetSelectorProps {
    /** Type of asset (image, video, or rive) */
    type: AssetType;

    /** Currently selected asset filename */
    value?: string | null;

    /** Callback when asset is selected */
    onChange: (filename: string | null) => void;
}

/**
 * Modern asset selector for FrameEngine2
 *
 * Handles:
 * - Fetching available assets from backend
 * - Uploading new assets
 * - Asset selection from dropdown
 *
 * Performance optimizations:
 * - Memoized file lists
 * - Optimized re-renders
 * - Clean API integration
 */
const FrameEngine2_AssetSelector: React.FC<FrameEngine2_AssetSelectorProps> = ({
    type,
    value,
    onChange
}) => {
    // State
    const [availableFiles, setAvailableFiles] = useState<AssetFileInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * API endpoints and config based on asset type
     * OPTIMIZED: No functions in config object to prevent re-render loops
     */
    const config = useMemo(() => {
        switch (type) {
            case 'image':
                return {
                    listEndpoint: '/api/frameengine/images',
                    uploadEndpoint: '/api/frameengine/upload-image',
                    accept: 'image/png,image/jpeg,image/webp,image/gif',
                    extensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
                    label: 'Background Image',
                    uploadLabel: 'Upload New Image'
                };
            case 'video':
                return {
                    listEndpoint: '/api/frameengine/videos',
                    uploadEndpoint: '/api/frameengine/upload-video',
                    accept: 'video/mp4,video/webm,video/ogg',
                    extensions: ['.mp4', '.webm', '.ogg'],
                    label: 'Background Video',
                    uploadLabel: 'Upload New Video'
                };
            case 'rive':
                return {
                    listEndpoint: '/api/frameengine/rive',
                    uploadEndpoint: '/api/frameengine/upload-rive',
                    accept: '.riv',
                    extensions: ['.riv'],
                    label: 'Rive File',
                    uploadLabel: 'Upload New Rive'
                };
        }
    }, [type]);

    /**
     * Load available assets from backend
     * OPTIMIZED: Depends on type only, not config object
     */
    const loadAssets = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(config.listEndpoint);
            if (response.ok) {
                const files = await response.json();
                setAvailableFiles(files);
            } else {
                setError(`Failed to load ${type}s`);
            }
        } catch (err) {
            setError(`Error loading ${type}s: ${(err as Error).message}`);
        } finally {
            setLoading(false);
        }
    }, [type, config.listEndpoint]);

    /**
     * Load assets on mount
     */
    useEffect(() => {
        loadAssets();
    }, [loadAssets]);

    /**
     * Handle file upload
     */
    const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file extension
        const isValidExtension = config.extensions.some(ext =>
            file.name.toLowerCase().endsWith(ext)
        );

        if (!isValidExtension) {
            setError(`Please select a valid file: ${config.extensions.join(', ')}`);
            return;
        }

        setUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            const fieldName = type === 'image' ? 'backgroundImage' :
                             type === 'video' ? 'backgroundVideo' : 'riveFile';
            formData.append(fieldName, file);

            const response = await fetch(config.uploadEndpoint, {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const result = await response.json();
                await loadAssets(); // Reload asset list
                onChange(result.filename); // Select the newly uploaded file
                event.target.value = ''; // Clear input
            } else {
                const errorData = await response.json();
                setError(errorData.message || 'Upload failed');
            }
        } catch (err) {
            setError(`Upload failed: ${(err as Error).message}`);
        } finally {
            setUploading(false);
        }
    }, [config, type, onChange, loadAssets]);

    /**
     * Handle asset selection from dropdown
     */
    const handleSelect = useCallback((event: SelectChangeEvent<string>) => {
        const newValue = event.target.value;
        onChange(newValue === '' ? null : newValue);
    }, [onChange]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* Upload Button */}
            <Button
                component="label"
                variant="outlined"
                size="small"
                startIcon={uploading ? <CircularProgress size={16} /> : <UploadIcon />}
                disabled={uploading}
                fullWidth
            >
                {uploading ? 'Uploading...' : config.uploadLabel}
                <input
                    type="file"
                    hidden
                    accept={config.accept}
                    onChange={handleUpload}
                    disabled={uploading}
                />
            </Button>

            {/* Asset Selection Dropdown */}
            {availableFiles.length > 0 && (
                <FormControl size="small" fullWidth>
                    <InputLabel>{config.label}</InputLabel>
                    <Select
                        value={value || ''}
                        label={config.label}
                        onChange={handleSelect}
                        disabled={loading}
                    >
                        <MenuItem value="">
                            <em>None</em>
                        </MenuItem>
                        {availableFiles.map((file) => (
                            <MenuItem key={file.filename} value={file.filename}>
                                {file.displayName} ({Math.round(file.fileSize / 1024)}KB)
                                {file.duration && ` - ${Math.round(file.duration)}s`}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            )}

            {/* Loading State */}
            {loading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="text.secondary">
                        Loading {type}s...
                    </Typography>
                </Box>
            )}

            {/* Error Display */}
            {error && (
                <Alert severity="error" sx={{ py: 0.5 }}>
                    {error}
                </Alert>
            )}
        </Box>
    );
};

export default FrameEngine2_AssetSelector;
