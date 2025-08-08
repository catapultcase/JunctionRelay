import React, { useState, useCallback, useEffect } from 'react';

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
    backgroundOpacity?: number;
    rows?: number;
    columns?: number;
    isTemplate: boolean;
    isDraft?: boolean;
    isPublished?: boolean;
}

interface PlacedElement {
    id: string;
    type: 'sensor' | 'text' | 'chart' | 'image' | 'container';
    x: number;
    y: number;
    width: number;
    height: number;
    properties: Record<string, any>;
    sensorId?: string;
}

interface AvailableSensor {
    id: string;
    name: string;
    value: string;
    unit: string;
    type: 'environmental' | 'system' | 'custom';
    isOnline: boolean;
}

interface PropertiesPanelProps {
    layout: FrameLayoutConfig;
    selectedElements: PlacedElement[];
    availableSensors: AvailableSensor[];
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementDelete: (elementId: string) => void;
}

const FrameEngine_PropertiesPanel: React.FC<PropertiesPanelProps> = ({
    layout,
    selectedElements,
    availableSensors,
    onLayoutUpdate,
    onElementUpdate,
    onElementDelete,
}) => {
    const [activeSection, setActiveSection] = useState<'layout' | 'element'>('layout');
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set(['basic', 'position', 'appearance', 'dimensions', 'background'])
    );

    // Switch to element properties when elements are selected
    useEffect(() => {
        if (selectedElements.length > 0) {
            setActiveSection('element');
        }
    }, [selectedElements.length]);

    // Toggle section expansion
    const toggleSection = useCallback((sectionId: string) => {
        setExpandedSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sectionId)) {
                newSet.delete(sectionId);
            } else {
                newSet.add(sectionId);
            }
            return newSet;
        });
    }, []);

    // Get layout type options
    const layoutTypeOptions = [
        { value: 'FRAME_SENSOR_GRID', label: 'Sensor Grid' },
        { value: 'FRAME_DASHBOARD', label: 'Dashboard' },
        { value: 'FRAME_CALENDAR', label: 'Calendar' },
        { value: 'FRAME_CHART', label: 'Chart' },
        { value: 'FRAME_QUAD', label: 'Quad Layout' },
        { value: 'FRAME_IMAGE', label: 'Image Frame' },
        { value: 'FRAME_CUSTOM', label: 'Custom' },
    ];

    // Get dimension presets
    const dimensionPresets = [
        { name: 'E-Paper 5.79"', width: 792, height: 272 },
        { name: 'E-Paper 7.5"', width: 880, height: 528 },
        { name: 'Small LCD', width: 320, height: 240 },
        { name: 'Medium LCD', width: 480, height: 320 },
        { name: 'HD Display', width: 1280, height: 720 },
        { name: 'Full HD', width: 1920, height: 1080 },
    ];

    // Handle orientation swap
    const swapOrientation = useCallback(() => {
        onLayoutUpdate({
            width: layout.height,
            height: layout.width,
            orientation: layout.orientation === 'landscape' ? 'portrait' : 'landscape',
        });
    }, [layout.width, layout.height, layout.orientation, onLayoutUpdate]);

    // Apply dimension preset
    const applyPreset = useCallback((preset: { width: number; height: number }) => {
        onLayoutUpdate({
            width: preset.width,
            height: preset.height,
        });
    }, [onLayoutUpdate]);

    // Update element property
    const updateElementProperty = useCallback((property: string, value: any) => {
        selectedElements.forEach(element => {
            onElementUpdate(element.id, {
                properties: { ...element.properties, [property]: value }
            });
        });
    }, [selectedElements, onElementUpdate]);

    // Update element position/size
    const updateElementTransform = useCallback((updates: Partial<Pick<PlacedElement, 'x' | 'y' | 'width' | 'height'>>) => {
        selectedElements.forEach(element => {
            onElementUpdate(element.id, updates);
        });
    }, [selectedElements, onElementUpdate]);

    // Delete selected elements
    const deleteSelectedElements = useCallback(() => {
        selectedElements.forEach(element => {
            onElementDelete(element.id);
        });
    }, [selectedElements, onElementDelete]);

    // Get common property value across selected elements
    const getCommonPropertyValue = useCallback((property: string): any => {
        if (selectedElements.length === 0) return '';

        const firstValue = selectedElements[0].properties[property];
        const allSame = selectedElements.every(el => el.properties[property] === firstValue);

        return allSame ? firstValue : '';
    }, [selectedElements]);

    // Common styles
    const panelStyle = {
        width: '320px',
        backgroundColor: '#fff',
        borderRight: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column' as const,
        flex: 1 
    };

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
            onClick={() => toggleSection(id)}
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

    // Render layout properties
    const renderLayoutProperties = () => (
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

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Presets
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {dimensionPresets.map((preset, index) => (
                                <button
                                    key={index}
                                    onClick={() => applyPreset(preset)}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '8px',
                                        fontSize: '12px',
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '4px',
                                        backgroundColor: '#fff',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                                >
                                    <div style={{ fontWeight: 500 }}>{preset.name}</div>
                                    <div style={{ color: '#666' }}>{preset.width}×{preset.height}</div>
                                </button>
                            ))}
                        </div>
                    </div>
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
                </div>
            )}
        </div>
    );

    // Render element properties
    const renderElementProperties = () => {
        if (selectedElements.length === 0) {
            return (
                <div style={{ padding: '16px', textAlign: 'center', color: '#999' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>👆</div>
                    <div style={{ fontSize: '12px' }}>Select an element to edit its properties</div>
                </div>
            );
        }

        const multipleSelected = selectedElements.length > 1;
        const firstElement = selectedElements[0];

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {/* Element Info */}
                <div style={{ padding: '12px', backgroundColor: '#e3f2fd', borderBottom: '1px solid #bbdefb' }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: '#1976d2' }}>
                        {multipleSelected ? `${selectedElements.length} elements selected` : `${firstElement.type} element`}
                    </div>
                    {!multipleSelected && (
                        <div style={{ fontSize: '12px', color: '#1976d2', marginTop: '4px' }}>
                            ID: {firstElement.id.split('_')[1]}
                        </div>
                    )}
                </div>

                {/* Position & Size */}
                {renderSectionHeader('position', 'Position & Size')}
                {expandedSections.has('position') && (
                    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>X</label>
                                <input
                                    type="number"
                                    value={multipleSelected ? '' : firstElement.x}
                                    onChange={(e) => updateElementTransform({ x: parseInt(e.target.value) || 0 })}
                                    style={inputStyle}
                                    placeholder={multipleSelected ? 'Mixed' : ''}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>Y</label>
                                <input
                                    type="number"
                                    value={multipleSelected ? '' : firstElement.y}
                                    onChange={(e) => updateElementTransform({ y: parseInt(e.target.value) || 0 })}
                                    style={inputStyle}
                                    placeholder={multipleSelected ? 'Mixed' : ''}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>Width</label>
                                <input
                                    type="number"
                                    value={multipleSelected ? '' : firstElement.width}
                                    onChange={(e) => updateElementTransform({ width: parseInt(e.target.value) || 20 })}
                                    style={inputStyle}
                                    placeholder={multipleSelected ? 'Mixed' : ''}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>Height</label>
                                <input
                                    type="number"
                                    value={multipleSelected ? '' : firstElement.height}
                                    onChange={(e) => updateElementTransform({ height: parseInt(e.target.value) || 20 })}
                                    style={inputStyle}
                                    placeholder={multipleSelected ? 'Mixed' : ''}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Element-specific properties */}
                {firstElement.type === 'sensor' && renderSensorProperties()}
                {firstElement.type === 'text' && renderTextProperties()}

                {/* Actions */}
                <div style={{ padding: '12px', borderTop: '1px solid #e0e0e0' }}>
                    <button
                        onClick={deleteSelectedElements}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            fontSize: '12px',
                            backgroundColor: '#ffebee',
                            color: '#c62828',
                            border: '1px solid #c62828',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffcdd2'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffebee'}
                    >
                        🗑️ Delete Selected ({selectedElements.length})
                    </button>
                </div>
            </div>
        );
    };

    // Render sensor-specific properties
    const renderSensorProperties = () => (
        <>
            {renderSectionHeader('sensor', 'Sensor Settings')}
            {expandedSections.has('sensor') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Sensor Source
                        </label>
                        <select
                            value={getCommonPropertyValue('sensorId') || ''}
                            onChange={(e) => {
                                const sensor = availableSensors.find(s => s.id === e.target.value);
                                if (sensor) {
                                    updateElementProperty('sensorId', sensor.id);
                                    updateElementProperty('sensorName', sensor.name);
                                    updateElementProperty('unit', sensor.unit);
                                }
                            }}
                            style={inputStyle}
                        >
                            <option value="">Select sensor...</option>
                            {availableSensors.map((sensor) => (
                                <option key={sensor.id} value={sensor.id}>
                                    {sensor.name} ({sensor.value} {sensor.unit})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Display Name
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('sensorName')}
                            onChange={(e) => updateElementProperty('sensorName', e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Unit
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('unit')}
                            onChange={(e) => updateElementProperty('unit', e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <input
                            type="checkbox"
                            id="showUnit"
                            checked={getCommonPropertyValue('showUnit') || false}
                            onChange={(e) => updateElementProperty('showUnit', e.target.checked)}
                            style={{ marginRight: '8px' }}
                        />
                        <label htmlFor="showUnit" style={{ fontSize: '12px', color: '#333' }}>
                            Show unit
                        </label>
                    </div>
                </div>
            )}
        </>
    );

    // Render text-specific properties
    const renderTextProperties = () => (
        <>
            {renderSectionHeader('text', 'Text Settings')}
            {expandedSections.has('text') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Text Content
                        </label>
                        <textarea
                            value={getCommonPropertyValue('text')}
                            onChange={(e) => updateElementProperty('text', e.target.value)}
                            rows={2}
                            style={inputStyle}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                Font Size
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('fontSize') || 14}
                                onChange={(e) => updateElementProperty('fontSize', parseInt(e.target.value) || 14)}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                Font Weight
                            </label>
                            <select
                                value={getCommonPropertyValue('fontWeight') || 'normal'}
                                onChange={(e) => updateElementProperty('fontWeight', e.target.value)}
                                style={inputStyle}
                            >
                                <option value="normal">Normal</option>
                                <option value="bold">Bold</option>
                                <option value="lighter">Light</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Text Color
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="color"
                                value={getCommonPropertyValue('color') || '#000000'}
                                onChange={(e) => updateElementProperty('color', e.target.value)}
                                style={{ width: '48px', height: '32px', border: '1px solid #ccc', borderRadius: '4px' }}
                            />
                            <input
                                type="text"
                                value={getCommonPropertyValue('color') || '#000000'}
                                onChange={(e) => updateElementProperty('color', e.target.value)}
                                style={{ ...inputStyle, flex: 1 }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    return (
        <div style={panelStyle}>
            {/* Header */}
            <div style={{ padding: '16px', borderBottom: '1px solid #e0e0e0' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#333', margin: 0 }}>Properties</h3>
                <div style={{ display: 'flex', marginTop: '8px' }}>
                    <button
                        onClick={() => setActiveSection('layout')}
                        style={{
                            flex: 1,
                            padding: '4px 12px',
                            fontSize: '12px',
                            borderTopLeftRadius: '4px',
                            borderBottomLeftRadius: '4px',
                            border: '1px solid #ccc',
                            backgroundColor: activeSection === 'layout' ? '#e3f2fd' : '#f5f5f5',
                            color: activeSection === 'layout' ? '#1976d2' : '#666',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (activeSection !== 'layout') {
                                e.currentTarget.style.backgroundColor = '#eeeeee';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (activeSection !== 'layout') {
                                e.currentTarget.style.backgroundColor = '#f5f5f5';
                            }
                        }}
                    >
                        Layout
                    </button>
                    <button
                        onClick={() => setActiveSection('element')}
                        style={{
                            flex: 1,
                            padding: '4px 12px',
                            fontSize: '12px',
                            borderTopRightRadius: '4px',
                            borderBottomRightRadius: '4px',
                            borderTop: '1px solid #ccc',
                            borderRight: '1px solid #ccc',
                            borderBottom: '1px solid #ccc',
                            backgroundColor: activeSection === 'element' ? '#e3f2fd' : '#f5f5f5',
                            color: activeSection === 'element' ? '#1976d2' : '#666',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (activeSection !== 'element') {
                                e.currentTarget.style.backgroundColor = '#eeeeee';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (activeSection !== 'element') {
                                e.currentTarget.style.backgroundColor = '#f5f5f5';
                            }
                        }}
                    >
                        Element {selectedElements.length > 0 && `(${selectedElements.length})`}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeSection === 'layout' ? renderLayoutProperties() : renderElementProperties()}
            </div>
        </div>
    );
};

export default FrameEngine_PropertiesPanel;