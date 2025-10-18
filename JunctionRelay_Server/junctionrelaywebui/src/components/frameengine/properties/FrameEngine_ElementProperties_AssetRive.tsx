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
import type { PlacedElement } from '../FrameEngine_Types';

interface RiveFileInfo {
    filename: string;
    displayName: string;
    uploadDate: string;
    fileSize: number;
}

interface AssetRivePropertiesProps {
    selectedElements: PlacedElement[];
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementDelete: (elementId: string) => void;
    expandedSections: Set<string>;
    onToggleSection: (sectionId: string) => void;
}

export const AssetRiveProperties: React.FC<AssetRivePropertiesProps> = ({
    selectedElements,
    onElementUpdate,
    expandedSections,
    onToggleSection,
}) => {
    const [availableRiveFiles, setAvailableRiveFiles] = useState<RiveFileInfo[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    // Load available Rive files on mount
    useEffect(() => {
        loadAvailableRiveFiles();
    }, []);

    const element = selectedElements[0];

    const loadAvailableRiveFiles = async () => {
        try {
            const response = await fetch('/api/frameengine/rive');
            if (response.ok) {
                const files = await response.json();
                setAvailableRiveFiles(files);
            }
        } catch (error) {
            console.error('Error loading Rive files:', error);
        }
    };

    const handleRiveUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!element) return;

        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.riv')) {
            setUploadError('Please select a .riv file');
            return;
        }

        setUploading(true);
        setUploadError(null);

        try {
            const formData = new FormData();
            formData.append('riveFile', file);

            const response = await fetch('/api/frameengine/upload-rive', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const result = await response.json();
                await loadAvailableRiveFiles();
                onElementUpdate(element.id, {
                    properties: {
                        ...element.properties,
                        assetRiveFile: result.filename,
                        riveStateMachine: '',
                        riveInputs: {},
                        riveBindings: {}
                    }
                });
                event.target.value = '';
            } else {
                const error = await response.json();
                setUploadError(error.message || 'Upload failed');
            }
        } catch (error) {
            setUploadError('Upload failed: ' + (error as Error).message);
        } finally {
            setUploading(false);
        }
    };

    const updateProperty = (property: string, value: any) => {
        if (!element) return;

        onElementUpdate(element.id, {
            properties: { ...element.properties, [property]: value }
        });
    };

    if (!element) return null;

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '6px 8px',
        fontSize: '12px',
        border: '1px solid #ccc',
        borderRadius: '4px',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '11px',
        fontWeight: 500,
        marginBottom: '4px',
        color: '#333',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
            {/* Upload New Rive File */}
            <div>
                <label style={labelStyle}>Upload New Rive File</label>
                <input
                    type="file"
                    accept=".riv"
                    onChange={handleRiveUpload}
                    disabled={uploading}
                    style={{
                        ...inputStyle,
                        cursor: uploading ? 'not-allowed' : 'pointer'
                    }}
                />
                {uploading && (
                    <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                        Uploading Rive file...
                    </div>
                )}
                {uploadError && (
                    <div style={{ fontSize: '10px', color: '#c62828', marginTop: '2px' }}>
                        {uploadError}
                    </div>
                )}
            </div>

            {/* Select Existing Rive File */}
            {availableRiveFiles.length > 0 && (
                <div>
                    <label style={labelStyle}>Or Select Existing File</label>
                    <select
                        value={element.properties.assetRiveFile || ''}
                        onChange={(e) => updateProperty('assetRiveFile', e.target.value)}
                        style={inputStyle}
                    >
                        <option value="">Select a Rive file...</option>
                        {availableRiveFiles.map((file) => (
                            <option key={file.filename} value={file.filename}>
                                {file.displayName} ({Math.round(file.fileSize / 1024)}KB)
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Rive Fit Mode */}
            <div>
                <label style={labelStyle}>Rive Fit Mode</label>
                <select
                    value={element.properties.riveFit || 'cover'}
                    onChange={(e) => updateProperty('riveFit', e.target.value)}
                    style={inputStyle}
                >
                    <option value="cover">Cover (fill frame)</option>
                    <option value="contain">Contain (fit inside)</option>
                    <option value="none">None (original size)</option>
                </select>
            </div>

            {/* Opacity */}
            <div>
                <label style={labelStyle}>Opacity: {(element.properties.opacity ?? 1).toFixed(2)}</label>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={element.properties.opacity ?? 1}
                    onChange={(e) => updateProperty('opacity', parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>

            {/* File Info */}
            {element.properties.assetRiveFile && (
                <div style={{
                    padding: '8px',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#666'
                }}>
                    <div><strong>Current File:</strong> {element.properties.assetRiveFile}</div>
                    <div style={{ marginTop: '4px', fontSize: '10px' }}>
                        State machines and inputs will be discovered when the animation loads
                    </div>
                </div>
            )}

            {/* Note about Rive Discovery */}
            <div style={{
                padding: '8px',
                backgroundColor: '#e3f2fd',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#1976d2'
            }}>
                <strong>Note:</strong> Rive state machines, inputs, and data bindings will be automatically discovered
                and available for configuration once the animation loads on the canvas.
            </div>
        </div>
    );
};