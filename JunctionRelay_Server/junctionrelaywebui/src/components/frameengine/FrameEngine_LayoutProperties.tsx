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
    type RiveFileInfo
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
    backgroundImageData?: Uint8Array | null;
    backgroundOpacity?: number;
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

    // Load available Rive files on component mount
    React.useEffect(() => {
        loadAvailableRiveFiles();
    }, []);

    // Load available Rive files from backend
    const loadAvailableRiveFiles = async () => {
        try {
            const response = await fetch('/api/frameengine/rive-files');
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
                            <option value="rive">Rive Component</option>
                        </select>
                    </div>

                    {/* ALWAYS show background color - works as fallback/underlay for all background types */}
                    <div>
                        <label style={labelStyle}>
                            Background Color {layout.backgroundType === 'rive' && '(Behind Rive)'}
                            {layout.backgroundType === 'image' && '(Behind Image)'}
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
                        <div>
                            <label style={labelStyle}>
                                Image URL
                            </label>
                            <input
                                type="text"
                                value={layout.backgroundImageUrl || ''}
                                onChange={(e) => onLayoutUpdate({ backgroundImageUrl: e.target.value })}
                                style={inputStyle}
                                placeholder="https://example.com/image.jpg"
                            />
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