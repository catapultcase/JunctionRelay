import React, { useState, useCallback } from 'react';

interface FrameLayoutConfig {
    id?: number;
    displayName: string;
    description?: string;
    layoutType: string;
    width: number;
    height: number;
    isTemplate: boolean;
    isDraft?: boolean;
    isPublished?: boolean;
    created?: string;
    lastModified?: string;
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

interface ToolbarProps {
    layout: FrameLayoutConfig;
    elements: PlacedElement[];
    selectedElements: string[];
    isDirty: boolean;
    isLoading: boolean;
    isEditing: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onSave: () => Promise<void>;
    onUndo: () => void;
    onRedo: () => void;
    onPreview: () => Promise<void>;
    onExport: (format: 'png' | 'json' | 'pdf') => Promise<void>;
    onClone: () => Promise<void>;
    onPublish: () => Promise<void>;
    onTemplateApply: (templateId: number) => Promise<void>;
}

const FrameEngine_Toolbar: React.FC<ToolbarProps> = ({
    layout,
    elements,
    selectedElements,
    isDirty,
    isLoading,
    isEditing,
    canUndo,
    canRedo,
    onSave,
    onUndo,
    onRedo,
    onPreview,
    onExport,
    onClone,
    onPublish,
    onTemplateApply,
}) => {
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showTemplateMenu, setShowTemplateMenu] = useState(false);
    const [loadingAction, setLoadingAction] = useState<string | null>(null);

    const availableTemplates = [
        { id: 1, displayName: 'Basic Sensor Grid', layoutType: 'FRAME_SENSOR_GRID', description: 'Simple 2x2 sensor grid' },
        { id: 2, displayName: 'TV Guide Calendar', layoutType: 'FRAME_CALENDAR', description: 'Calendar with episode listings' },
        { id: 3, displayName: 'System Dashboard', layoutType: 'FRAME_DASHBOARD', description: 'Multi-widget dashboard' },
        { id: 4, displayName: 'Chart Display', layoutType: 'FRAME_CHART', description: 'Data visualization frame' },
    ];

    // Handle action with loading state
    const handleAction = useCallback(async (actionName: string, action: () => Promise<void>) => {
        try {
            setLoadingAction(actionName);
            await action();
        } catch (error) {
            console.error(`${actionName} failed:`, error);
        } finally {
            setLoadingAction(null);
        }
    }, []);

    const handleSave = useCallback(() => {
        handleAction('save', onSave);
    }, [handleAction, onSave]);

    const handleExport = useCallback((format: 'png' | 'json' | 'pdf') => {
        setShowExportMenu(false);
        handleAction(`export-${format}`, () => onExport(format));
    }, [handleAction, onExport]);

    const handleApplyTemplate = useCallback((templateId: number) => {
        setShowTemplateMenu(false);
        handleAction('apply-template', () => onTemplateApply(templateId));
    }, [handleAction, onTemplateApply]);

    const handleClone = useCallback(() => {
        handleAction('clone', onClone);
    }, [handleAction, onClone]);

    const handlePublish = useCallback(() => {
        handleAction('publish', onPublish);
    }, [handleAction, onPublish]);

    const handlePreview = useCallback(() => {
        handleAction('preview', onPreview);
    }, [handleAction, onPreview]);

    // Keyboard shortcuts
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 's':
                        e.preventDefault();
                        if (isDirty) handleSave();
                        break;
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey && canRedo) {
                            onRedo();
                        } else if (canUndo) {
                            onUndo();
                        }
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isDirty, canUndo, canRedo, handleSave, onUndo, onRedo]);

    const buttonStyle = {
        padding: '6px 12px',
        margin: '0 2px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        background: '#fff',
        cursor: 'pointer',
        fontSize: '14px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
    };

    const primaryButtonStyle = {
        ...buttonStyle,
        background: '#1976d2',
        color: 'white',
        border: '1px solid #1976d2'
    };

    const disabledButtonStyle = {
        ...buttonStyle,
        background: '#f5f5f5',
        color: '#999',
        cursor: 'not-allowed'
    };

    return (
        <>
            <div style={{
                height: '56px',
                backgroundColor: '#fff',
                borderBottom: '1px solid #e0e0e0',
                padding: '0 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                {/* Left Section - File Operations */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || isLoading}
                        style={isDirty && !isLoading ? primaryButtonStyle : disabledButtonStyle}
                        title="Save Layout (Ctrl+S)"
                    >
                        {loadingAction === 'save' ? '⏳' : '💾'} Save
                    </button>

                    <div style={{ width: '1px', height: '24px', backgroundColor: '#ddd', margin: '0 8px' }} />

                    {/* Undo/Redo */}
                    <button
                        onClick={onUndo}
                        disabled={!canUndo || isLoading}
                        style={canUndo && !isLoading ? buttonStyle : disabledButtonStyle}
                        title="Undo (Ctrl+Z)"
                    >
                        ↶
                    </button>

                    <button
                        onClick={onRedo}
                        disabled={!canRedo || isLoading}
                        style={canRedo && !isLoading ? buttonStyle : disabledButtonStyle}
                        title="Redo (Ctrl+Shift+Z)"
                    >
                        ↷
                    </button>
                </div>

                {/* Center Section - Layout Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
                    <div style={{ color: '#666' }}>
                        <span style={{ fontWeight: 500 }}>{layout.displayName}</span>
                        {isDirty && <span style={{ color: '#ff9800', marginLeft: '4px' }}>●</span>}
                    </div>
                    <div style={{ color: '#999' }}>
                        {layout.width}×{layout.height}
                    </div>
                    <div style={{ color: '#999' }}>
                        {elements.length} elements
                    </div>
                    {selectedElements.length > 0 && (
                        <div style={{ color: '#1976d2' }}>
                            {selectedElements.length} selected
                        </div>
                    )}
                </div>

                {/* Right Section - Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                            disabled={isLoading}
                            style={isLoading ? disabledButtonStyle : buttonStyle}
                        >
                            🎨 Templates
                        </button>

                        {showTemplateMenu && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: '0',
                                marginTop: '4px',
                                width: '320px',
                                backgroundColor: '#fff',
                                border: '1px solid #e0e0e0',
                                borderRadius: '4px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                zIndex: 50
                            }}>
                                <div style={{ padding: '12px', borderBottom: '1px solid #e0e0e0' }}>
                                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#333' }}>Apply Template</div>
                                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                        This will replace current layout
                                    </div>
                                </div>
                                <div style={{ maxHeight: '256px', overflowY: 'auto' }}>
                                    {availableTemplates.map((template) => (
                                        <button
                                            key={template.id}
                                            onClick={() => handleApplyTemplate(template.id)}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '12px',
                                                border: 'none',
                                                background: 'none',
                                                cursor: 'pointer',
                                                borderBottom: '1px solid #f0f0f0'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <div style={{ fontWeight: 500, fontSize: '14px', color: '#333' }}>
                                                {template.displayName}
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#666' }}>
                                                {template.description}
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#999' }}>
                                                {template.layoutType.replace('FRAME_', '')}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <div style={{ padding: '8px', borderTop: '1px solid #e0e0e0' }}>
                                    <button
                                        onClick={() => setShowTemplateMenu(false)}
                                        style={{
                                            width: '100%',
                                            padding: '4px 12px',
                                            fontSize: '12px',
                                            color: '#666',
                                            background: 'none',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {isEditing && (
                        <button
                            onClick={handleClone}
                            disabled={isLoading}
                            style={isLoading ? disabledButtonStyle : buttonStyle}
                            title="Clone Layout"
                        >
                            {loadingAction === 'clone' ? '⏳' : '📋'} Clone
                        </button>
                    )}

                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            disabled={isLoading || !layout.id}
                            style={(isLoading || !layout.id) ? disabledButtonStyle : buttonStyle}
                        >
                            📤 Export
                        </button>

                        {showExportMenu && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: '0',
                                marginTop: '4px',
                                width: '192px',
                                backgroundColor: '#fff',
                                border: '1px solid #e0e0e0',
                                borderRadius: '4px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                zIndex: 50
                            }}>
                                <button
                                    onClick={() => handleExport('png')}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        border: 'none',
                                        background: 'none',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #f0f0f0'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    🖼️ Export as PNG
                                </button>
                                <button
                                    onClick={() => handleExport('json')}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        border: 'none',
                                        background: 'none',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #f0f0f0'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    📄 Export as JSON
                                </button>
                                <button
                                    onClick={() => handleExport('pdf')}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        border: 'none',
                                        background: 'none',
                                        cursor: 'pointer'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    📑 Export as PDF
                                </button>
                                <div style={{ padding: '8px', borderTop: '1px solid #e0e0e0' }}>
                                    <button
                                        onClick={() => setShowExportMenu(false)}
                                        style={{
                                            width: '100%',
                                            padding: '4px 12px',
                                            fontSize: '12px',
                                            color: '#666',
                                            background: 'none',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handlePreview}
                        disabled={isLoading || !layout.id}
                        style={{
                            ...buttonStyle,
                            background: '#4caf50',
                            color: 'white',
                            border: '1px solid #4caf50',
                            ...(isLoading || !layout.id ? { background: '#f5f5f5', color: '#999', cursor: 'not-allowed' } : {})
                        }}
                        title="Generate Live Preview"
                    >
                        {loadingAction === 'preview' ? '⏳' : '👁️'} Preview
                    </button>

                    {isEditing && !layout.isPublished && (
                        <button
                            onClick={handlePublish}
                            disabled={isLoading || isDirty}
                            style={{
                                ...buttonStyle,
                                background: '#9c27b0',
                                color: 'white',
                                border: '1px solid #9c27b0',
                                ...(isLoading || isDirty ? { background: '#f5f5f5', color: '#999', cursor: 'not-allowed' } : {})
                            }}
                            title="Publish Layout"
                        >
                            {loadingAction === 'publish' ? '⏳' : '🚀'} Publish
                        </button>
                    )}
                </div>
            </div>

            {/* Click outside handlers */}
            {(showExportMenu || showTemplateMenu) && (
                <div
                    style={{
                        position: 'fixed',
                        inset: '0',
                        zIndex: 40
                    }}
                    onClick={() => {
                        setShowExportMenu(false);
                        setShowTemplateMenu(false);
                    }}
                />
            )}
        </>
    );
};

export default FrameEngine_Toolbar;