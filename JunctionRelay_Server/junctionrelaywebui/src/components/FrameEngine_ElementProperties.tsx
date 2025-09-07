import React, { useCallback } from 'react';
import { googleFonts } from './GoogleFonts';

interface PlacedElement {
    id: string;
    type: 'sensor' | 'text' | 'chart' | 'image' | 'container';
    x: number;
    y: number;
    width: number;
    height: number;
    properties: Record<string, any>;
    sensorId?: string;
    visible?: boolean;
    zIndex?: number;
}

interface FrameEngine_ElementPropertiesProps {
    selectedElements: PlacedElement[];
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementDelete: (elementId: string) => void;
    expandedSections: Set<string>;
    onToggleSection: (sectionId: string) => void;
}

export const FrameEngine_ElementProperties: React.FC<FrameEngine_ElementPropertiesProps> = ({
    selectedElements,
    onElementUpdate,
    onElementDelete,
    expandedSections,
    onToggleSection,
}) => {
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

    // Render sensor-specific properties
    const renderSensorProperties = () => (
        <>
            {renderSectionHeader('sensor', 'Sensor Settings')}
            {expandedSections.has('sensor') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Sensor Tag
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('sensorTag')}
                            onChange={(e) => updateElementProperty('sensorTag', e.target.value)}
                            style={inputStyle}
                            placeholder="e.g., temperature-01, humidity-main"
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Placeholder Sensor Label
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('placeholderSensorLabel')}
                            onChange={(e) => updateElementProperty('placeholderSensorLabel', e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Placeholder Value
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('placeholderValue')}
                            onChange={(e) => updateElementProperty('placeholderValue', e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Placeholder Unit
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('placeholderUnit')}
                            onChange={(e) => updateElementProperty('placeholderUnit', e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <label htmlFor="showLabel" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                id="showLabel"
                                checked={getCommonPropertyValue('showLabel') || false}
                                onChange={(e) => updateElementProperty('showLabel', e.target.checked)}
                            />
                            Show Label
                        </label>

                        <label htmlFor="showUnit" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                id="showUnit"
                                checked={getCommonPropertyValue('showUnit') || false}
                                onChange={(e) => updateElementProperty('showUnit', e.target.checked)}
                            />
                            Show Unit
                        </label>
                    </div>
                </div>
            )}

            {/* Sensor Typography Section */}
            {renderSectionHeader('sensorTypography', 'Sensor Typography')}
            {expandedSections.has('sensorTypography') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Font Family
                        </label>
                        <select
                            value={getCommonPropertyValue('fontFamily') || 'Inter'}
                            onChange={(e) => updateElementProperty('fontFamily', e.target.value)}
                            style={inputStyle}
                        >
                            {googleFonts.map(font => (
                                <option key={font} value={font}>{font}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                Font Size
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('fontSize') || 12}
                                onChange={(e) => updateElementProperty('fontSize', parseInt(e.target.value) || 12)}
                                style={inputStyle}
                                min="8"
                                max="72"
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
                                <option value="100">Thin (100)</option>
                                <option value="200">Extra Light (200)</option>
                                <option value="300">Light (300)</option>
                                <option value="normal">Normal (400)</option>
                                <option value="500">Medium (500)</option>
                                <option value="600">Semi Bold (600)</option>
                                <option value="bold">Bold (700)</option>
                                <option value="800">Extra Bold (800)</option>
                                <option value="900">Black (900)</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                Text Align
                            </label>
                            <select
                                value={getCommonPropertyValue('textAlign') || 'left'}
                                onChange={(e) => updateElementProperty('textAlign', e.target.value)}
                                style={inputStyle}
                            >
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                Line Height
                            </label>
                            <select
                                value={getCommonPropertyValue('lineHeight') || '1.4'}
                                onChange={(e) => updateElementProperty('lineHeight', e.target.value)}
                                style={inputStyle}
                            >
                                <option value="1">Tight (1.0)</option>
                                <option value="1.2">Snug (1.2)</option>
                                <option value="1.4">Normal (1.4)</option>
                                <option value="1.6">Relaxed (1.6)</option>
                                <option value="2">Loose (2.0)</option>
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
                                value={getCommonPropertyValue('textColor') || '#000000'}
                                onChange={(e) => updateElementProperty('textColor', e.target.value)}
                                style={{ width: '48px', height: '32px', border: '1px solid #ccc', borderRadius: '4px' }}
                            />
                            <input
                                type="text"
                                value={getCommonPropertyValue('textColor') || '#000000'}
                                onChange={(e) => updateElementProperty('textColor', e.target.value)}
                                style={{ ...inputStyle, flex: 1 }}
                                placeholder="#000000"
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Background Color
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="color"
                                value={getCommonPropertyValue('backgroundColor') || '#e3f2fd'}
                                onChange={(e) => updateElementProperty('backgroundColor', e.target.value)}
                                style={{ width: '48px', height: '32px', border: '1px solid #ccc', borderRadius: '4px' }}
                            />
                            <input
                                type="text"
                                value={getCommonPropertyValue('backgroundColor') || '#e3f2fd'}
                                onChange={(e) => updateElementProperty('backgroundColor', e.target.value)}
                                style={{ ...inputStyle, flex: 1 }}
                                placeholder="#e3f2fd"
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="checkbox"
                            id="sensorTextShadow"
                            checked={getCommonPropertyValue('textShadow') || false}
                            onChange={(e) => updateElementProperty('textShadow', e.target.checked)}
                        />
                        <label htmlFor="sensorTextShadow" style={{ fontSize: '12px', color: '#333' }}>
                            Text Shadow
                        </label>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="checkbox"
                            id="sensorTextBorder"
                            checked={getCommonPropertyValue('textBorder') || false}
                            onChange={(e) => updateElementProperty('textBorder', e.target.checked)}
                        />
                        <label htmlFor="sensorTextBorder" style={{ fontSize: '12px', color: '#333' }}>
                            Text Outline
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

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Font Family
                        </label>
                        <select
                            value={getCommonPropertyValue('fontFamily') || 'Inter'}
                            onChange={(e) => updateElementProperty('fontFamily', e.target.value)}
                            style={inputStyle}
                        >
                            {googleFonts.map(font => (
                                <option key={font} value={font}>{font}</option>
                            ))}
                        </select>
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
                                min="8"
                                max="72"
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
                                <option value="100">Thin (100)</option>
                                <option value="200">Extra Light (200)</option>
                                <option value="300">Light (300)</option>
                                <option value="normal">Normal (400)</option>
                                <option value="500">Medium (500)</option>
                                <option value="600">Semi Bold (600)</option>
                                <option value="bold">Bold (700)</option>
                                <option value="800">Extra Bold (800)</option>
                                <option value="900">Black (900)</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                Text Align
                            </label>
                            <select
                                value={getCommonPropertyValue('textAlign') || 'left'}
                                onChange={(e) => updateElementProperty('textAlign', e.target.value)}
                                style={inputStyle}
                            >
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                                <option value="justify">Justify</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                Line Height
                            </label>
                            <select
                                value={getCommonPropertyValue('lineHeight') || '1.4'}
                                onChange={(e) => updateElementProperty('lineHeight', e.target.value)}
                                style={inputStyle}
                            >
                                <option value="1">Tight (1.0)</option>
                                <option value="1.2">Snug (1.2)</option>
                                <option value="1.4">Normal (1.4)</option>
                                <option value="1.6">Relaxed (1.6)</option>
                                <option value="2">Loose (2.0)</option>
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
                                placeholder="#000000"
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Background Color
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="color"
                                value={getCommonPropertyValue('backgroundColor') || 'transparent'}
                                onChange={(e) => updateElementProperty('backgroundColor', e.target.value)}
                                style={{ width: '48px', height: '32px', border: '1px solid #ccc', borderRadius: '4px' }}
                            />
                            <input
                                type="text"
                                value={getCommonPropertyValue('backgroundColor') || 'transparent'}
                                onChange={(e) => updateElementProperty('backgroundColor', e.target.value)}
                                style={{ ...inputStyle, flex: 1 }}
                                placeholder="transparent"
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="checkbox"
                            id="textShadow"
                            checked={getCommonPropertyValue('textShadow') || false}
                            onChange={(e) => updateElementProperty('textShadow', e.target.checked)}
                        />
                        <label htmlFor="textShadow" style={{ fontSize: '12px', color: '#333' }}>
                            Text Shadow
                        </label>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="checkbox"
                            id="textBorder"
                            checked={getCommonPropertyValue('textBorder') || false}
                            onChange={(e) => updateElementProperty('textBorder', e.target.checked)}
                        />
                        <label htmlFor="textBorder" style={{ fontSize: '12px', color: '#333' }}>
                            Text Outline
                        </label>
                    </div>
                </div>
            )}
        </>
    );

    if (selectedElements.length === 0) {
        return (
            <div style={{
                padding: '16px',
                textAlign: 'center',
                color: '#999',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
            }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>👆</div>
                <div style={{ fontSize: '12px' }}>Select an element to edit its properties</div>
            </div>
        );
    }

    const multipleSelected = selectedElements.length > 1;
    const firstElement = selectedElements[0];

    return (
        <div style={{
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Element Info Header - Fixed */}
            <div style={{
                padding: '12px',
                backgroundColor: '#e3f2fd',
                borderBottom: '1px solid #bbdefb',
                flexShrink: 0
            }}>
                <div style={{ fontSize: '12px', fontWeight: 500, color: '#1976d2' }}>
                    {multipleSelected ? `${selectedElements.length} elements selected` : `${firstElement.type} element`}
                </div>
                {!multipleSelected && (
                    <div style={{ fontSize: '12px', color: '#1976d2', marginTop: '4px' }}>
                        ID: {firstElement.id.split('_')[1]}
                    </div>
                )}
            </div>

            {/* Scrollable Content */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '1px'
            }}>
                {/* Position & Size */}
                {renderSectionHeader('position', 'Position & Size')}
                {expandedSections.has('position') && (
                    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>X Position</label>
                                <input
                                    type="number"
                                    value={multipleSelected ? '' : firstElement.x}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value)) {
                                            const roundedValue = Math.round(value * 100) / 100;
                                            updateElementTransform({ x: roundedValue });
                                        }
                                    }}
                                    style={inputStyle}
                                    placeholder={multipleSelected ? 'Mixed' : ''}
                                    step="0.01"
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>Y Position</label>
                                <input
                                    type="number"
                                    value={multipleSelected ? '' : firstElement.y}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value)) {
                                            const roundedValue = Math.round(value * 100) / 100;
                                            updateElementTransform({ y: roundedValue });
                                        }
                                    }}
                                    style={inputStyle}
                                    placeholder={multipleSelected ? 'Mixed' : ''}
                                    step="0.01"
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>Width</label>
                                <input
                                    type="number"
                                    value={multipleSelected ? '' : firstElement.width}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value) && value > 0) {
                                            const roundedValue = Math.round(value * 100) / 100;
                                            updateElementTransform({ width: roundedValue });
                                        }
                                    }}
                                    style={inputStyle}
                                    placeholder={multipleSelected ? 'Mixed' : ''}
                                    step="0.01"
                                    min="0.01"
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>Height</label>
                                <input
                                    type="number"
                                    value={multipleSelected ? '' : firstElement.height}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value) && value > 0) {
                                            const roundedValue = Math.round(value * 100) / 100;
                                            updateElementTransform({ height: roundedValue });
                                        }
                                    }}
                                    style={inputStyle}
                                    placeholder={multipleSelected ? 'Mixed' : ''}
                                    step="0.01"
                                    min="0.01"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Element-specific properties */}
                {firstElement.type === 'sensor' && renderSensorProperties()}
                {firstElement.type === 'text' && renderTextProperties()}

                {/* Actions - Fixed at bottom */}
                <div style={{ padding: '12px', borderTop: '1px solid #e0e0e0', marginTop: 'auto' }}>
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
        </div>
    );
};