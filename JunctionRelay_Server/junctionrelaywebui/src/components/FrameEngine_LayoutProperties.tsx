import React, { useState, useCallback } from 'react';
import { LiveStateMachineTesting } from './FrameEngine_RiveComponents';

// Types for Rive discovery
interface DiscoveredInput {
    name: string;
    type: 'number' | 'boolean' | 'trigger' | 'unknown';
    currentValue?: any;
    ref?: any;
}

interface DiscoveredStateMachine {
    name: string;
    inputNames: string[];
    inputs: DiscoveredInput[];
}

interface RiveFileInfo {
    filename: string;
    displayName: string;
    uploadDate: string;
    fileSize: number;
}

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
}

export const FrameEngine_LayoutProperties: React.FC<FrameEngine_LayoutPropertiesProps> = ({
    layout,
    onLayoutUpdate,
    expandedSections,
    onToggleSection,
    discoveredMachines = [],
}) => {
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
                    riveInputs: {}
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

    // Get layout type options
    const layoutTypeOptions = [
        { value: 'PRE_RENDERED_IMAGE', label: 'Pre-Rendered Image' },
        { value: 'COMPOSITE_MODE', label: 'Composite Mode' }
    ];

    // Handle orientation swap
    const swapOrientation = useCallback(() => {
        onLayoutUpdate({
            width: layout.height,
            height: layout.width,
            orientation: layout.orientation === 'landscape' ? 'portrait' : 'landscape',
        });
    }, [layout.width, layout.height, layout.orientation, onLayoutUpdate]);

    // Common styles
    const sectionHeaderStyle = {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px',
        textAlign: 'left' as const,
        backgroundColor: '#f5f5f5',
        border: 'none',
        borderBottom: '1px solid #e0e0e0',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 500,
        color: '#333',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px'
    };

    const inputStyle = {
        width: '100%',
        padding: '4px 8px',
        fontSize: '12px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        outline: 'none'
    };

    const buttonStyle = {
        width: '100%',
        padding: '6px 12px',
        fontSize: '12px',
        backgroundColor: '#e3f2fd',
        color: '#1976d2',
        border: '1px solid #1976d2',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'background-color 0.2s'
    };

    // Render section header
    const renderSectionHeader = (id: string, title: string) => (
        <button
            onClick={() => onToggleSection(id)}
            style={sectionHeaderStyle}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eeeeee'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
        >
            <span>{title}</span>
            <span style={{ color: '#666' }}>
                {expandedSections.has(id) ? '−' : '+'}
            </span>
        </button>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {/* Basic Properties */}
            {renderSectionHeader('basic', 'Basic Properties')}
            {expandedSections.has('basic') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
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
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Description
                        </label>
                        <textarea
                            value={layout.description || ''}
                            onChange={(e) => onLayoutUpdate({ description: e.target.value })}
                            rows={2}
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Layout Type
                        </label>
                        <select
                            value={layout.layoutType}
                            onChange={(e) => onLayoutUpdate({ layoutType: e.target.value })}
                            style={inputStyle}
                        >
                            {layoutTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* Dimensions */}
            {renderSectionHeader('dimensions', 'Dimensions')}
            {expandedSections.has('dimensions') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
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
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
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
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#bbdefb'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#e3f2fd'}
                    >
                        🔄 Swap Orientation ({layout.orientation})
                    </button>
                </div>
            )}

            {/* Background */}
            {renderSectionHeader('background', 'Background')}
            {expandedSections.has('background') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
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

                    {layout.backgroundType === 'color' && (
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                Background Color
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="color"
                                    value={layout.backgroundColor || '#FFFFFF'}
                                    onChange={(e) => onLayoutUpdate({ backgroundColor: e.target.value })}
                                    style={{ width: '48px', height: '32px', border: '1px solid #ccc', borderRadius: '4px' }}
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
                    )}

                    {layout.backgroundType === 'image' && (
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
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
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
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
                                    <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                        Uploading Rive file...
                                    </div>
                                )}
                                {riveLoadingError && (
                                    <div style={{ fontSize: '11px', color: '#d32f2f', marginTop: '4px' }}>
                                        {riveLoadingError}
                                    </div>
                                )}
                            </div>

                            {availableRiveFiles.length > 0 && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                        Or Select Existing File
                                    </label>
                                    <select
                                        value={layout.riveFile || ''}
                                        onChange={(e) => onLayoutUpdate({
                                            riveFile: e.target.value || null,
                                            riveStateMachine: null,
                                            riveInputs: {},
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
                                    backgroundColor: '#f8f9fa',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    color: '#666'
                                }}>
                                    <div><strong>File:</strong> {layout.riveFile}</div>
                                    <div><strong>State Machines:</strong> {discoveredMachines.length}</div>
                                    <div><strong>Total Inputs:</strong> {discoveredMachines.reduce((sum: number, m: DiscoveredStateMachine) => sum + m.inputs.length, 0)}</div>
                                </div>
                            )}

                            {/* Live State Machine Testing - applies to all state machines automatically */}
                            {layout.riveFile && discoveredMachines.length > 0 && (
                                <LiveStateMachineTesting
                                    discoveredMachines={discoveredMachines}
                                    riveFile={layout.riveFile}
                                    layout={layout}
                                    onInputChange={handleRiveInputChange}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};