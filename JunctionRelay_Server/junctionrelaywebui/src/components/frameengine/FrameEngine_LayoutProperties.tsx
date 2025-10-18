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

import React, { useState, useCallback } from 'react';
import { LiveStateMachineTesting } from './FrameEngine_RiveLive';
import {
    type DiscoveredInput,
    type DiscoveredStateMachine,
    type DiscoveredDataBinding,
    type RiveFileInfo,
    type BackgroundImageInfo,
    type BackgroundVideoInfo
} from './FrameEngine_RiveCore';
import { useTheme } from '@mui/material/styles';

interface FrameLayoutConfig {
    displayName: string;
    description?: string;
    layoutType: string;
    width: number;
    height: number;
    orientation?: string;
    backgroundColor?: string;
    backgroundType?: string;
    backgroundImageUrl?: string | null;
    backgroundImageFit?: 'cover' | 'contain' | 'fill' | 'tile' | 'stretch' | 'none';
    backgroundOpacity?: number;
    backgroundVideoUrl?: string | null;
    backgroundVideoFit?: 'cover' | 'contain' | 'fill' | 'stretch' | 'none';
    videoLoop?: boolean;
    videoMuted?: boolean;
    videoAutoplay?: boolean;
    riveFile?: string | null;
    riveStateMachine?: string | null;
    riveInputs?: Record<string, any> | null;
    riveBindings?: Record<string, any> | null;
    rows?: number;
    columns?: number;
    isTemplate: boolean;
    isDraft?: boolean;
    isPublished?: boolean;
}

interface FrameEngine_LayoutPropertiesProps {
    layout: FrameLayoutConfig;
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;
    expandedSections: Set<string>;
    onToggleSection: (sectionId: string) => void;
    discoveredMachines?: DiscoveredStateMachine[];
    discoveredBindings?: DiscoveredDataBinding[];
}

export const FrameEngine_LayoutProperties: React.FC<FrameEngine_LayoutPropertiesProps> = ({
    layout,
    onLayoutUpdate,
    expandedSections,
    onToggleSection,
    discoveredMachines = [],
    discoveredBindings = [],
}) => {
    const theme = useTheme();

    // Rive-related state
    const [availableRiveFiles, setAvailableRiveFiles] = useState<RiveFileInfo[]>([]);
    const [riveUploadLoading, setRiveUploadLoading] = useState(false);
    const [riveLoadingError, setRiveLoadingError] = useState<string | null>(null);

    // Background image-related state
    const [availableBackgroundImages, setAvailableBackgroundImages] = useState<BackgroundImageInfo[]>([]);
    const [bgImageUploadLoading, setBgImageUploadLoading] = useState(false);
    const [bgImageLoadingError, setBgImageLoadingError] = useState<string | null>(null);

    // Background video-related state
    const [availableBackgroundVideos, setAvailableBackgroundVideos] = useState<BackgroundVideoInfo[]>([]);
    const [bgVideoUploadLoading, setBgVideoUploadLoading] = useState(false);
    const [bgVideoLoadingError, setBgVideoLoadingError] = useState<string | null>(null);

    // Load available files on component mount
    React.useEffect(() => {
        loadAvailableRiveFiles();
        loadAvailableBackgroundImages();
        loadAvailableBackgroundVideos();
    }, []);

    // Load available Rive files from backend
    const loadAvailableRiveFiles = async () => {
        try {
            const response = await fetch('/api/frameengine/rive');
            if (response.ok) {
                const files = await response.json();
                setAvailableRiveFiles(files);
            } else {
                console.error('Failed to load Rive files');
            }
        } catch (error) {
            console.error('Error loading Rive files:', error);
        }
    };

    // Load available background images from backend
    const loadAvailableBackgroundImages = async () => {
        try {
            const response = await fetch('/api/frameengine/images');
            if (response.ok) {
                const files = await response.json();
                setAvailableBackgroundImages(files);
            } else {
                console.error('Failed to load background images');
            }
        } catch (error) {
            console.error('Error loading background images:', error);
        }
    };

    // Load available background videos from backend
    const loadAvailableBackgroundVideos = async () => {
        try {
            const response = await fetch('/api/frameengine/videos');
            if (response.ok) {
                const files = await response.json();
                setAvailableBackgroundVideos(files);
            } else {
                console.error('Failed to load background videos');
            }
        } catch (error) {
            console.error('Error loading background videos:', error);
        }
    };

    // Handle Rive file upload
    const handleRiveFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.riv')) {
            setRiveLoadingError('Please select a .riv file');
            return;
        }

        setRiveUploadLoading(true);
        setRiveLoadingError(null);

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
                onLayoutUpdate({
                    backgroundType: 'rive',
                    riveFile: result.filename,
                    riveStateMachine: null,
                    riveInputs: {},
                    riveBindings: {}
                });
                event.target.value = '';
            } else {
                const error = await response.json();
                setRiveLoadingError(error.message || 'Upload failed');
            }
        } catch (error) {
            setRiveLoadingError('Upload failed: ' + (error as Error).message);
        } finally {
            setRiveUploadLoading(false);
        }
    };

    // Handle background image upload
    const handleBackgroundImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const validExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
        const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

        if (!validExtensions.includes(fileExt)) {
            setBgImageLoadingError('Please select a valid image file (PNG, JPG, JPEG, WebP, or GIF)');
            return;
        }

        setBgImageUploadLoading(true);
        setBgImageLoadingError(null);

        try {
            const formData = new FormData();
            formData.append('backgroundImage', file);

            const response = await fetch('/api/frameengine/upload-image', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const result = await response.json();
                await loadAvailableBackgroundImages();
                onLayoutUpdate({
                    backgroundType: 'image',
                    backgroundImageUrl: result.filename
                });
                event.target.value = '';
            } else {
                const error = await response.json();
                setBgImageLoadingError(error.message || 'Upload failed');
            }
        } catch (error) {
            setBgImageLoadingError('Upload failed: ' + (error as Error).message);
        } finally {
            setBgImageUploadLoading(false);
        }
    };

    // Handle background video upload
    const handleBackgroundVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const validExtensions = ['.mp4', '.webm', '.ogg'];
        const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

        if (!validExtensions.includes(fileExt)) {
            setBgVideoLoadingError('Please select a valid video file (MP4, WebM, or OGG)');
            return;
        }

        setBgVideoUploadLoading(true);
        setBgVideoLoadingError(null);

        try {
            const formData = new FormData();
            formData.append('backgroundVideo', file);

            const response = await fetch('/api/frameengine/upload-video', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const result = await response.json();
                await loadAvailableBackgroundVideos();
                onLayoutUpdate({
                    backgroundType: 'video',
                    backgroundVideoUrl: result.filename,
                    videoLoop: true,
                    videoMuted: true,
                    videoAutoplay: true
                });
                event.target.value = '';
            } else {
                const error = await response.json();
                setBgVideoLoadingError(error.message || 'Upload failed');
            }
        } catch (error) {
            setBgVideoLoadingError('Upload failed: ' + (error as Error).message);
        } finally {
            setBgVideoUploadLoading(false);
        }
    };

    // Handle Rive input value change - applies to the correct state machine automatically
    const handleRiveInputChange = (stateMachineName: string, inputName: string, value: any) => {
        const currentInputs = layout.riveInputs || {};
        const inputKey = `${stateMachineName}.${inputName}`;
        onLayoutUpdate({ riveInputs: { ...currentInputs, [inputKey]: value } });
    };

    // Handle Rive data binding value change
    const handleRiveBindingChange = (bindingName: string, value: any) => {
        const currentBindings = layout.riveBindings || {};
        onLayoutUpdate({ riveBindings: { ...currentBindings, [bindingName]: value } });
    };

    // Handle orientation swap
    const swapOrientation = useCallback(() => {
        onLayoutUpdate({
            width: layout.height,
            height: layout.width,
            orientation: layout.orientation === 'landscape' ? 'portrait' : 'landscape',
        });
    }, [layout.width, layout.height, layout.orientation, onLayoutUpdate]);

    // Common styles using theme
    const sectionHeaderStyle = {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px',
        textAlign: 'left' as const,
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
        border: 'none',
        borderBottom: `1px solid ${theme.palette.divider}`,
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 500,
        color: theme.palette.text.primary,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px'
    };

    const inputStyle = {
        width: '100%',
        padding: '4px 8px',
        fontSize: '12px',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '4px',
        outline: 'none',
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
    };

    const buttonStyle = {
        width: '100%',
        padding: '6px 12px',
        fontSize: '12px',
        backgroundColor: theme.palette.primary.light,
        color: theme.palette.primary.main,
        border: `1px solid ${theme.palette.primary.main}`,
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'background-color 0.2s'
    };

    const labelStyle = {
        display: 'block',
        fontSize: '12px',
        fontWeight: 500,
        color: theme.palette.text.primary,
        marginBottom: '4px'
    };

    const helperTextStyle = {
        fontSize: '10px',
        color: theme.palette.text.secondary,
        marginTop: '2px'
    };

    // Render section header
    const renderSectionHeader = (id: string, title: string) => (
        <button
            onClick={() => onToggleSection(id)}
            style={sectionHeaderStyle}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.palette.mode === 'dark'
                    ? theme.palette.grey[700]
                    : theme.palette.grey[200];
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme.palette.mode === 'dark'
                    ? theme.palette.grey[800]
                    : theme.palette.grey[100];
            }}
        >
            <span>{title}</span>
            <span style={{ color: theme.palette.text.secondary }}>
                {expandedSections.has(id) ? '−' : '+'}
            </span>
        </button>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {/* Basic Properties */}
            {renderSectionHeader('basic', 'Basic Properties')}
            {expandedSections.has('basic') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: theme.palette.background.paper }}>
                    <div>
                        <label style={labelStyle}>
                            Layout Name
                        </label>
                        <input
                            type="text"
                            value={layout.displayName}
                            onChange={(e) => onLayoutUpdate({ displayName: e.target.value })}
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={labelStyle}>
                            Description
                        </label>
                        <textarea
                            value={layout.description || ''}
                            onChange={(e) => onLayoutUpdate({ description: e.target.value })}
                            rows={2}
                            style={inputStyle}
                        />
                    </div>
                </div>
            )}

            {/* Dimensions */}
            {renderSectionHeader('dimensions', 'Dimensions')}
            {expandedSections.has('dimensions') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: theme.palette.background.paper }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label style={labelStyle}>
                                Width
                            </label>
                            <input
                                type="number"
                                value={layout.width}
                                onChange={(e) => onLayoutUpdate({ width: parseInt(e.target.value) || 0 })}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>
                                Height
                            </label>
                            <input
                                type="number"
                                value={layout.height}
                                onChange={(e) => onLayoutUpdate({ height: parseInt(e.target.value) || 0 })}
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    <button
                        onClick={swapOrientation}
                        style={buttonStyle}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme.palette.mode === 'dark'
                                ? theme.palette.primary.dark
                                : '#bbdefb';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = theme.palette.primary.light;
                        }}
                    >
                        🔄 Swap Orientation ({layout.orientation})
                    </button>
                </div>
            )}

            {/* Background */}
            {renderSectionHeader('background', 'Background')}
            {expandedSections.has('background') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: theme.palette.background.paper }}>
                    <div>
                        <label style={labelStyle}>
                            Background Type
                        </label>
                        <select
                            value={layout.backgroundType || 'color'}
                            onChange={(e) => onLayoutUpdate({ backgroundType: e.target.value })}
                            style={inputStyle}
                        >
                            <option value="none">None</option>
                            <option value="color">Solid Color</option>
                            <option value="image">Image</option>
                            <option value="video">Video</option>
                            <option value="rive">Rive Component</option>
                        </select>
                    </div>

                    {/* ALWAYS show background color - works as fallback/underlay for all background types */}
                    <div>
                        <label style={labelStyle}>
                            Background Color {layout.backgroundType === 'rive' && '(Behind Rive)'}
                            {layout.backgroundType === 'image' && '(Behind Image)'}
                            {layout.backgroundType === 'video' && '(Behind Video)'}
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="color"
                                value={layout.backgroundColor || '#FFFFFF'}
                                onChange={(e) => onLayoutUpdate({ backgroundColor: e.target.value })}
                                style={{ width: '48px', height: '32px', border: `1px solid ${theme.palette.divider}`, borderRadius: '4px' }}
                            />
                            <input
                                type="text"
                                value={layout.backgroundColor || '#FFFFFF'}
                                onChange={(e) => onLayoutUpdate({ backgroundColor: e.target.value })}
                                style={{ ...inputStyle, flex: 1 }}
                                placeholder="#FFFFFF"
                            />
                        </div>
                    </div>

                    {layout.backgroundType === 'image' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={labelStyle}>
                                    Upload New Background Image
                                </label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleBackgroundImageUpload}
                                    disabled={bgImageUploadLoading}
                                    style={{
                                        ...inputStyle,
                                        padding: '6px 8px',
                                        cursor: bgImageUploadLoading ? 'not-allowed' : 'pointer'
                                    }}
                                />
                                {bgImageUploadLoading && (
                                    <div style={{ ...helperTextStyle, color: theme.palette.text.secondary }}>
                                        Uploading background image...
                                    </div>
                                )}
                                {bgImageLoadingError && (
                                    <div style={{ ...helperTextStyle, color: theme.palette.error.main }}>
                                        {bgImageLoadingError}
                                    </div>
                                )}
                            </div>

                            {availableBackgroundImages.length > 0 && (
                                <div>
                                    <label style={labelStyle}>
                                        Or Select Existing Image
                                    </label>
                                    <select
                                        value={layout.backgroundImageUrl || ''}
                                        onChange={(e) => onLayoutUpdate({
                                            backgroundImageUrl: e.target.value || null
                                        })}
                                        style={inputStyle}
                                    >
                                        <option value="">Select a background image...</option>
                                        {availableBackgroundImages.map((file) => (
                                            <option key={file.filename} value={file.filename}>
                                                {file.displayName} ({Math.round(file.fileSize / 1024)}KB)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Image Fit Mode */}
                            {layout.backgroundImageUrl && (
                                <div>
                                    <label style={labelStyle}>
                                        Image Fit Mode
                                    </label>
                                    <select
                                        value={layout.backgroundImageFit || 'cover'}
                                        onChange={(e) => onLayoutUpdate({
                                            backgroundImageFit: e.target.value as any
                                        })}
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
                            )}

                            {/* Image Preview */}
                            {layout.backgroundImageUrl && (
                                <div style={{
                                    padding: '8px',
                                    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    color: theme.palette.text.secondary
                                }}>
                                    <div><strong>Current Image:</strong> {layout.backgroundImageUrl}</div>
                                    <div style={{ marginTop: '8px' }}>
                                        <img
                                            src={`/api/frameengine/images/${layout.backgroundImageUrl}/content`}
                                            alt="Background preview"
                                            style={{
                                                maxWidth: '100%',
                                                maxHeight: '150px',
                                                objectFit: 'contain',
                                                border: `1px solid ${theme.palette.divider}`,
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
                    )}

                    {layout.backgroundType === 'video' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={labelStyle}>
                                    Upload New Background Video
                                </label>
                                <input
                                    type="file"
                                    accept="video/mp4,video/webm,video/ogg"
                                    onChange={handleBackgroundVideoUpload}
                                    disabled={bgVideoUploadLoading}
                                    style={{
                                        ...inputStyle,
                                        padding: '6px 8px',
                                        cursor: bgVideoUploadLoading ? 'not-allowed' : 'pointer'
                                    }}
                                />
                                {bgVideoUploadLoading && (
                                    <div style={{ ...helperTextStyle, color: theme.palette.text.secondary }}>
                                        Uploading background video...
                                    </div>
                                )}
                                {bgVideoLoadingError && (
                                    <div style={{ ...helperTextStyle, color: theme.palette.error.main }}>
                                        {bgVideoLoadingError}
                                    </div>
                                )}
                            </div>

                            {availableBackgroundVideos.length > 0 && (
                                <div>
                                    <label style={labelStyle}>
                                        Or Select Existing Video
                                    </label>
                                    <select
                                        value={layout.backgroundVideoUrl || ''}
                                        onChange={(e) => onLayoutUpdate({
                                            backgroundVideoUrl: e.target.value || null
                                        })}
                                        style={inputStyle}
                                    >
                                        <option value="">Select a background video...</option>
                                        {availableBackgroundVideos.map((file) => (
                                            <option key={file.filename} value={file.filename}>
                                                {file.displayName} ({Math.round(file.fileSize / 1024)}KB)
                                                {file.duration && ` - ${Math.round(file.duration)}s`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Video Fit Mode */}
                            {layout.backgroundVideoUrl && (
                                <div>
                                    <label style={labelStyle}>
                                        Video Fit Mode
                                    </label>
                                    <select
                                        value={layout.backgroundVideoFit || 'cover'}
                                        onChange={(e) => onLayoutUpdate({
                                            backgroundVideoFit: e.target.value as any
                                        })}
                                        style={inputStyle}
                                    >
                                        <option value="cover">Cover (fill frame, may crop)</option>
                                        <option value="contain">Contain (fit inside, may letterbox)</option>
                                        <option value="fill">Fill (stretch to fit)</option>
                                        <option value="stretch">Stretch (distort to fit)</option>
                                        <option value="none">None (original size)</option>
                                    </select>
                                </div>
                            )}

                            {/* Video Playback Controls */}
                            {layout.backgroundVideoUrl && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={labelStyle}>
                                        Video Playback Options
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="checkbox"
                                            id="videoLoop"
                                            checked={layout.videoLoop ?? true}
                                            onChange={(e) => onLayoutUpdate({ videoLoop: e.target.checked })}
                                        />
                                        <label htmlFor="videoLoop" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
                                            Loop video
                                        </label>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="checkbox"
                                            id="videoMuted"
                                            checked={layout.videoMuted ?? true}
                                            onChange={(e) => onLayoutUpdate({ videoMuted: e.target.checked })}
                                        />
                                        <label htmlFor="videoMuted" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
                                            Mute audio
                                        </label>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="checkbox"
                                            id="videoAutoplay"
                                            checked={layout.videoAutoplay ?? true}
                                            onChange={(e) => onLayoutUpdate({ videoAutoplay: e.target.checked })}
                                        />
                                        <label htmlFor="videoAutoplay" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
                                            Autoplay
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Video Preview */}
                            {layout.backgroundVideoUrl && (
                                <div style={{
                                    padding: '8px',
                                    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    color: theme.palette.text.secondary
                                }}>
                                    <div><strong>Current Video:</strong> {layout.backgroundVideoUrl}</div>
                                    <div style={{ marginTop: '8px' }}>
                                        <video
                                            src={`/api/frameengine/videos/${layout.backgroundVideoUrl}/content`}
                                            controls
                                            muted
                                            loop
                                            style={{
                                                maxWidth: '100%',
                                                maxHeight: '150px',
                                                border: `1px solid ${theme.palette.divider}`,
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
                    )}

                    {layout.backgroundType === 'rive' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={labelStyle}>
                                    Upload New Rive File
                                </label>
                                <input
                                    type="file"
                                    accept=".riv"
                                    onChange={handleRiveFileUpload}
                                    disabled={riveUploadLoading}
                                    style={{
                                        ...inputStyle,
                                        padding: '6px 8px',
                                        cursor: riveUploadLoading ? 'not-allowed' : 'pointer'
                                    }}
                                />
                                {riveUploadLoading && (
                                    <div style={{ ...helperTextStyle, color: theme.palette.text.secondary }}>
                                        Uploading Rive file...
                                    </div>
                                )}
                                {riveLoadingError && (
                                    <div style={{ ...helperTextStyle, color: theme.palette.error.main }}>
                                        {riveLoadingError}
                                    </div>
                                )}
                            </div>

                            {availableRiveFiles.length > 0 && (
                                <div>
                                    <label style={labelStyle}>
                                        Or Select Existing File
                                    </label>
                                    <select
                                        value={layout.riveFile || ''}
                                        onChange={(e) => onLayoutUpdate({
                                            riveFile: e.target.value || null,
                                            riveStateMachine: null,
                                            riveInputs: {},
                                            riveBindings: {},
                                        })}
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

                            {/* File Status Info */}
                            {layout.riveFile && (
                                <div style={{
                                    padding: '8px',
                                    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    color: theme.palette.text.secondary
                                }}>
                                    <div><strong>File:</strong> {layout.riveFile}</div>
                                    <div><strong>State Machines:</strong> {discoveredMachines.length}</div>
                                    <div><strong>Total Inputs:</strong> {discoveredMachines.reduce((sum: number, m: DiscoveredStateMachine) => sum + m.inputs.length, 0)}</div>
                                    <div><strong>Data Bindings:</strong> {discoveredBindings.length}</div>
                                </div>
                            )}

                            {/* Live State Machine Testing - applies to all state machines automatically */}
                            {layout.riveFile && (discoveredMachines.length > 0 || discoveredBindings.length > 0) && (
                                <LiveStateMachineTesting
                                    discoveredMachines={discoveredMachines}
                                    discoveredBindings={discoveredBindings}
                                    riveFile={layout.riveFile}
                                    layout={layout}
                                    onInputChange={handleRiveInputChange}
                                    onBindingChange={handleRiveBindingChange}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};