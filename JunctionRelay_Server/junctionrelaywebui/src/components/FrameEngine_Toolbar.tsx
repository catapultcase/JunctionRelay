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
    onExport: () => Promise<void>;
    onPublish: () => Promise<void>;
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
    onPublish,
}) => {
    const [loadingAction, setLoadingAction] = useState<string | null>(null);

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

    const handleExport = useCallback(() => {
        handleAction('export', onExport);
    }, [handleAction, onExport]);

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
    } as const;

    const primaryButtonStyle = {
        ...buttonStyle,
        background: '#1976d2',
        color: 'white',
        border: '1px solid #1976d2'
    } as const;

    const disabledButtonStyle = {
        ...buttonStyle,
        background: '#f5f5f5',
        color: '#999',
        cursor: 'not-allowed'
    } as const;

    return (
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
                <button
                    onClick={handleExport}
                    disabled={isLoading || !layout.id}
                    style={(isLoading || !layout.id) ? disabledButtonStyle : buttonStyle}
                    title="Export Layout Package"
                >
                    {loadingAction === 'export' ? '⏳' : '📤'} Export
                </button>

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
    );
};

export default FrameEngine_Toolbar;