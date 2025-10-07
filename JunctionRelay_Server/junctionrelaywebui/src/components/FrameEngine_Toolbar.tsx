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
import type { FrameLayoutConfig, PlacedElement } from './FrameEngine_Types';

interface ToolbarProps {
    layout: FrameLayoutConfig;
    elements: PlacedElement[];
    selectedElements: string[];
    isDirty: boolean;
    isLoading: boolean;
    isEditing: boolean;
    canUndo: boolean;
    canRedo: boolean;
    previewMode: boolean;
    onQuickSave: () => Promise<void>;
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
    previewMode,
    onQuickSave,
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

    const handleQuickSave = useCallback(() => {
        handleAction('quickSave', onQuickSave);
    }, [handleAction, onQuickSave]);

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

    // Keyboard shortcuts - disabled in preview mode
    React.useEffect(() => {
        if (previewMode) return; // Don't register shortcuts in preview mode

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 's':
                        e.preventDefault();
                        if (e.shiftKey && isDirty) {
                            // Ctrl+Shift+S for full save
                            handleSave();
                        } else if (isDirty) {
                            // Ctrl+S for quick save
                            handleQuickSave();
                        }
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
    }, [isDirty, canUndo, canRedo, handleQuickSave, handleSave, onUndo, onRedo, previewMode]);

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

    const secondaryButtonStyle = {
        ...buttonStyle,
        background: '#4caf50',
        color: 'white',
        border: '1px solid #4caf50'
    } as const;

    const disabledButtonStyle = {
        ...buttonStyle,
        background: '#f5f5f5',
        color: '#999',
        cursor: 'not-allowed'
    } as const;

    // Preview mode button style
    const previewActiveButtonStyle = {
        ...buttonStyle,
        background: '#ff9800',
        color: 'white',
        border: '1px solid #ff9800'
    } as const;

    return (
        <div style={{
            height: '56px',
            backgroundColor: previewMode ? '#f8f9fa' : '#fff',
            borderBottom: '1px solid #e0e0e0',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        }}>
            {/* Left Section - File Operations (Always visible, disabled in preview mode) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                    onClick={handleQuickSave}
                    disabled={previewMode || !isDirty || isLoading}
                    style={(previewMode || !isDirty || isLoading) ? disabledButtonStyle : primaryButtonStyle}
                    title={previewMode ? "Quick Save (disabled in preview mode)" : "Quick Save (Ctrl+S) - Save with current thumbnail settings"}
                >
                    {loadingAction === 'quickSave' ? '⏳' : '💾'} Quick Save
                </button>

                <button
                    onClick={handleSave}
                    disabled={previewMode || !isDirty || isLoading}
                    style={(previewMode || !isDirty || isLoading) ? disabledButtonStyle : secondaryButtonStyle}
                    title={previewMode ? "Save (disabled in preview mode)" : "Save & Manage Thumbnail (Ctrl+Shift+S) - Review and update thumbnail"}
                >
                    {loadingAction === 'save' ? '⏳' : '🖼️'} Save
                </button>

                <div style={{ width: '1px', height: '24px', backgroundColor: '#ddd', margin: '0 8px' }} />

                {/* Undo/Redo */}
                <button
                    onClick={onUndo}
                    disabled={previewMode || !canUndo || isLoading}
                    style={(previewMode || !canUndo || isLoading) ? disabledButtonStyle : buttonStyle}
                    title={previewMode ? "Undo (disabled in preview mode)" : "Undo (Ctrl+Z)"}
                >
                    ↶
                </button>

                <button
                    onClick={onRedo}
                    disabled={previewMode || !canRedo || isLoading}
                    style={(previewMode || !canRedo || isLoading) ? disabledButtonStyle : buttonStyle}
                    title={previewMode ? "Redo (disabled in preview mode)" : "Redo (Ctrl+Shift+Z)"}
                >
                    ↷
                </button>
            </div>

            {/* Center Section - Layout Info with Preview Mode indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
                {previewMode && (
                    <div style={{
                        backgroundColor: '#ff9800',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '16px',
                        fontSize: '12px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        👁️ Preview Mode
                    </div>
                )}
                <div style={{ color: '#666' }}>
                    <span style={{ fontWeight: 500 }}>{layout.displayName}</span>
                    {!previewMode && isDirty && <span style={{ color: '#ff9800', marginLeft: '4px' }}>●</span>}
                </div>
                <div style={{ color: '#999' }}>
                    {layout.width}×{layout.height}
                </div>
                <div style={{ color: '#999' }}>
                    {elements.length} elements
                </div>
                {!previewMode && selectedElements.length > 0 && (
                    <div style={{ color: '#1976d2' }}>
                        {selectedElements.length} selected
                    </div>
                )}
            </div>

            {/* Right Section - Actions (Always visible, some disabled in preview mode) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {/* Preview Button - Always visible with different text and styles */}
                <button
                    onClick={handlePreview}
                    disabled={isLoading}
                    style={previewMode ? previewActiveButtonStyle : {
                        ...buttonStyle,
                        background: '#4caf50',
                        color: 'white',
                        border: '1px solid #4caf50',
                        ...(isLoading ? { background: '#f5f5f5', color: '#999', cursor: 'not-allowed' } : {})
                    }}
                    title={previewMode ? "Exit Preview Mode" : "Enter Preview Mode"}
                >
                    {loadingAction === 'preview' ? '⏳' : previewMode ? '✏️' : '👁️'}
                    {previewMode ? 'Edit' : 'Preview'}
                </button>

                <button
                    onClick={handleExport}
                    disabled={previewMode || isLoading || !layout.id}
                    style={(previewMode || isLoading || !layout.id) ? disabledButtonStyle : buttonStyle}
                    title={previewMode ? "Export Layout Package (disabled in preview mode)" : "Export Layout Package"}
                >
                    {loadingAction === 'export' ? '⏳' : '📤'} Export
                </button>

                {isEditing && !layout.isPublished && (
                    <button
                        onClick={handlePublish}
                        disabled={previewMode || isLoading || isDirty}
                        style={{
                            ...buttonStyle,
                            background: previewMode ? '#f5f5f5' : '#9c27b0',
                            color: previewMode ? '#999' : 'white',
                            border: previewMode ? '1px solid #ddd' : '1px solid #9c27b0',
                            cursor: previewMode ? 'not-allowed' : 'pointer',
                            ...((!previewMode && (isLoading || isDirty)) ? { background: '#f5f5f5', color: '#999', cursor: 'not-allowed' } : {})
                        }}
                        title={previewMode ? "Publish Layout (disabled in preview mode)" : "Publish Layout"}
                    >
                        {loadingAction === 'publish' ? '⏳' : '🚀'} Publish
                    </button>
                )}
            </div>
        </div>
    );
};

export default FrameEngine_Toolbar;