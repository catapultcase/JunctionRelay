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

interface BackgroundImageInfo {
    filename: string;
    displayName: string;
    uploadDate: string;
    fileSize: number;
}

interface AssetImagePropertiesProps {
    selectedElements: PlacedElement[];
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementDelete: (elementId: string) => void;
    expandedSections: Set<string>;
    onToggleSection: (sectionId: string) => void;
}

export const AssetImageProperties: React.FC<AssetImagePropertiesProps> = ({
    selectedElements,
    onElementUpdate,
    expandedSections,
    onToggleSection,
}) => {
    const [availableImages, setAvailableImages] = useState<BackgroundImageInfo[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    // Load available images on mount
    useEffect(() => {
        loadAvailableImages();
    }, []);

    const element = selectedElements[0];

    const loadAvailableImages = async () => {
        try {
            const response = await fetch('/api/frameengine/images');
            if (response.ok) {
                const files = await response.json();
                setAvailableImages(files);
            }
        } catch (error) {
            console.error('Error loading images:', error);
        }
    };

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!element) return;

        const file = event.target.files?.[0];
        if (!file) return;

        const validExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
        const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

        if (!validExtensions.includes(fileExt)) {
            setUploadError('Please select a valid image file (PNG, JPG, JPEG, WebP, or GIF)');
            return;
        }

        setUploading(true);
        setUploadError(null);

        try {
            const formData = new FormData();
            formData.append('backgroundImage', file);

            const response = await fetch('/api/frameengine/upload-image', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const result = await response.json();
                await loadAvailableImages();
                onElementUpdate(element.id, {
                    properties: { ...element.properties, assetImageUrl: result.filename }
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
            {/* Upload New Image */}
            <div>
                <label style={labelStyle}>Upload New Image</label>
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploading}
                    style={{
                        ...inputStyle,
                        cursor: uploading ? 'not-allowed' : 'pointer'
                    }}
                />
                {uploading && (
                    <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                        Uploading image...
                    </div>
                )}
                {uploadError && (
                    <div style={{ fontSize: '10px', color: '#c62828', marginTop: '2px' }}>
                        {uploadError}
                    </div>
                )}
            </div>

            {/* Select Existing Image */}
            {availableImages.length > 0 && (
                <div>
                    <label style={labelStyle}>Or Select Existing Image</label>
                    <select
                        value={element.properties.assetImageUrl || ''}
                        onChange={(e) => updateProperty('assetImageUrl', e.target.value)}
                        style={inputStyle}
                    >
                        <option value="">Select an image...</option>
                        {availableImages.map((file) => (
                            <option key={file.filename} value={file.filename}>
                                {file.displayName} ({Math.round(file.fileSize / 1024)}KB)
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Image Fit Mode */}
            <div>
                <label style={labelStyle}>Image Fit Mode</label>
                <select
                    value={element.properties.imageFit || 'cover'}
                    onChange={(e) => updateProperty('imageFit', e.target.value)}
                    style={inputStyle}
                >
                    <option value="cover">Cover (fill frame, may crop)</option>
                    <option value="contain">Contain (fit inside, may letterbox)</option>
                    <option value="fill">Fill (stretch to fit)</option>
                    <option value="tile">Tile (repeat pattern)</option>
                    <option value="stretch">Stretch (distort to fit)</option>
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

            {/* Image Preview */}
            {element.properties.assetImageUrl && (
                <div style={{
                    padding: '8px',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#666'
                }}>
                    <div><strong>Current Image:</strong> {element.properties.assetImageUrl}</div>
                    <div style={{ marginTop: '8px' }}>
                        <img
                            src={`/api/frameengine/images/${element.properties.assetImageUrl}/content`}
                            alt="Preview"
                            style={{
                                maxWidth: '100%',
                                maxHeight: '150px',
                                objectFit: 'contain',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                            }}
                            onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};