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

interface BackgroundVideoInfo {
    filename: string;
    displayName: string;
    uploadDate: string;
    fileSize: number;
    duration?: number;
}

interface AssetVideoPropertiesProps {
    selectedElements: PlacedElement[];
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementDelete: (elementId: string) => void;
    expandedSections: Set<string>;
    onToggleSection: (sectionId: string) => void;
}

export const AssetVideoProperties: React.FC<AssetVideoPropertiesProps> = ({
    selectedElements,
    onElementUpdate,
    expandedSections,
    onToggleSection,
}) => {
    const [availableVideos, setAvailableVideos] = useState<BackgroundVideoInfo[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    // Load available videos on mount
    useEffect(() => {
        loadAvailableVideos();
    }, []);

    const element = selectedElements[0];

    const loadAvailableVideos = async () => {
        try {
            const response = await fetch('/api/frameengine/videos');
            if (response.ok) {
                const files = await response.json();
                setAvailableVideos(files);
            }
        } catch (error) {
            console.error('Error loading videos:', error);
        }
    };

    const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!element) return;

        const file = event.target.files?.[0];
        if (!file) return;

        const validExtensions = ['.mp4', '.webm', '.ogg'];
        const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

        if (!validExtensions.includes(fileExt)) {
            setUploadError('Please select a valid video file (MP4, WebM, or OGG)');
            return;
        }

        setUploading(true);
        setUploadError(null);

        try {
            const formData = new FormData();
            formData.append('backgroundVideo', file);

            const response = await fetch('/api/frameengine/upload-video', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const result = await response.json();
                await loadAvailableVideos();
                onElementUpdate(element.id, {
                    properties: {
                        ...element.properties,
                        assetVideoUrl: result.filename,
                        videoLoop: true,
                        videoMuted: true,
                        videoAutoplay: true
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
            {/* Upload New Video */}
            <div>
                <label style={labelStyle}>Upload New Video</label>
                <input
                    type="file"
                    accept="video/mp4,video/webm,video/ogg"
                    onChange={handleVideoUpload}
                    disabled={uploading}
                    style={{
                        ...inputStyle,
                        cursor: uploading ? 'not-allowed' : 'pointer'
                    }}
                />
                {uploading && (
                    <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                        Uploading video...
                    </div>
                )}
                {uploadError && (
                    <div style={{ fontSize: '10px', color: '#c62828', marginTop: '2px' }}>
                        {uploadError}
                    </div>
                )}
            </div>

            {/* Select Existing Video */}
            {availableVideos.length > 0 && (
                <div>
                    <label style={labelStyle}>Or Select Existing Video</label>
                    <select
                        value={element.properties.assetVideoUrl || ''}
                        onChange={(e) => updateProperty('assetVideoUrl', e.target.value)}
                        style={inputStyle}
                    >
                        <option value="">Select a video...</option>
                        {availableVideos.map((file) => (
                            <option key={file.filename} value={file.filename}>
                                {file.displayName} ({Math.round(file.fileSize / 1024)}KB)
                                {file.duration && ` - ${Math.round(file.duration)}s`}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Video Fit Mode */}
            <div>
                <label style={labelStyle}>Video Fit Mode</label>
                <select
                    value={element.properties.videoFit || 'cover'}
                    onChange={(e) => updateProperty('videoFit', e.target.value)}
                    style={inputStyle}
                >
                    <option value="cover">Cover (fill frame, may crop)</option>
                    <option value="contain">Contain (fit inside, may letterbox)</option>
                    <option value="fill">Fill (stretch to fit)</option>
                    <option value="stretch">Stretch (distort to fit)</option>
                    <option value="none">None (original size)</option>
                </select>
            </div>

            {/* Playback Options */}
            <div>
                <label style={labelStyle}>Video Playback Options</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <input
                            type="checkbox"
                            checked={element.properties.videoLoop ?? true}
                            onChange={(e) => updateProperty('videoLoop', e.target.checked)}
                        />
                        Loop video
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <input
                            type="checkbox"
                            checked={element.properties.videoMuted ?? true}
                            onChange={(e) => updateProperty('videoMuted', e.target.checked)}
                        />
                        Mute audio
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <input
                            type="checkbox"
                            checked={element.properties.videoAutoplay ?? true}
                            onChange={(e) => updateProperty('videoAutoplay', e.target.checked)}
                        />
                        Autoplay
                    </label>
                </div>
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

            {/* Video Preview */}
            {element.properties.assetVideoUrl && (
                <div style={{
                    padding: '8px',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#666'
                }}>
                    <div><strong>Current Video:</strong> {element.properties.assetVideoUrl}</div>
                    <div style={{ marginTop: '8px' }}>
                        <video
                            src={`/api/frameengine/videos/${element.properties.assetVideoUrl}/content`}
                            controls
                            muted
                            loop
                            style={{
                                maxWidth: '100%',
                                maxHeight: '150px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                backgroundColor: '#000'
                            }}
                            onError={(e) => {
                                const target = e.target as HTMLVideoElement;
                                target.style.display = 'none';
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};