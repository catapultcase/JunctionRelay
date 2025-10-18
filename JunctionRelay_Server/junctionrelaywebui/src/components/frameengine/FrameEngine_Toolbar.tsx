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
import { useTheme } from '@mui/material/styles';
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
    const theme = useTheme();
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
        if (previewMode) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 's':
                        e.preventDefault();
                        if (e.shiftKey && isDirty) {
                            handleSave();
                        } else if (isDirty) {
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

    const getButtonStyle = (variant: 'default' | 'primary' | 'success' | 'disabled' | 'preview') => {
        const baseStyle = {
            padding: '6px 12px',
            margin: '0 2px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.2s',
            border: `1px solid ${theme.palette.divider}`,
        };

        switch (variant) {
            case 'primary':
                return {
                    ...baseStyle,
                    background: theme.palette.primary.main,
                    color: theme.palette.primary.contrastText,
                    border: `1px solid ${theme.palette.primary.main}`,
                };
            case 'success':
                return {
                    ...baseStyle,
                    background: theme.palette.success.main,
                    color: theme.palette.success.contrastText,
                    border: `1px solid ${theme.palette.success.main}`,
                };
            case 'disabled':
                return {
                    ...baseStyle,
                    background: theme.palette.action.disabledBackground,
                    color: theme.palette.action.disabled,
                    cursor: 'not-allowed',
                    border: `1px solid ${theme.palette.divider}`,
                };
            case 'preview':
                return {
                    ...baseStyle,
                    background: theme.palette.warning.main,
                    color: theme.palette.warning.contrastText,
                    border: `1px solid ${theme.palette.warning.main}`,
                };
            default:
                return {
                    ...baseStyle,
                    background: theme.palette.background.paper,
                    color: theme.palette.text.primary,
                    border: `1px solid ${theme.palette.divider}`,
                };
        }
    };

    return (
        <div style={{
            height: '56px',
            backgroundColor: previewMode ? theme.palette.grey[100] : theme.palette.background.paper,
            borderBottom: `1px solid ${theme.palette.divider}`,
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        }}>
            {/* Left Section - File Operations */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                    onClick={handleQuickSave}
                    disabled={previewMode || !isDirty || isLoading}
                    style={getButtonStyle(
                        (previewMode || !isDirty || isLoading) ? 'disabled' : 'primary'
                    )}
                    title={previewMode ? "Quick Save (disabled in preview mode)" : "Quick Save (Ctrl+S) - Save with current thumbnail settings"}
                    onMouseEnter={(e) => {
                        if (!previewMode && isDirty && !isLoading) {
                            e.currentTarget.style.background = theme.palette.primary.dark;
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!previewMode && isDirty && !isLoading) {
                            e.currentTarget.style.background = theme.palette.primary.main;
                        }
                    }}
                >
                    {loadingAction === 'quickSave' ? '⏳' : '💾'} Quick Save
                </button>

                <button
                    onClick={handleSave}
                    disabled={previewMode || !isDirty || isLoading}
                    style={getButtonStyle(
                        (previewMode || !isDirty || isLoading) ? 'disabled' : 'success'
                    )}
                    title={previewMode ? "Save (disabled in preview mode)" : "Save & Manage Thumbnail (Ctrl+Shift+S) - Review and update thumbnail"}
                    onMouseEnter={(e) => {
                        if (!previewMode && isDirty && !isLoading) {
                            e.currentTarget.style.background = theme.palette.success.dark;
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!previewMode && isDirty && !isLoading) {
                            e.currentTarget.style.background = theme.palette.success.main;
                        }
                    }}
                >
                    {loadingAction === 'save' ? '⏳' : '🖼️'} Save
                </button>

                <div style={{
                    width: '1px',
                    height: '24px',
                    backgroundColor: theme.palette.divider,
                    margin: '0 8px'
                }} />

                {/* Undo/Redo */}
                <button
                    onClick={onUndo}
                    disabled={previewMode || !canUndo || isLoading}
                    style={getButtonStyle(
                        (previewMode || !canUndo || isLoading) ? 'disabled' : 'default'
                    )}
                    title={previewMode ? "Undo (disabled in preview mode)" : "Undo (Ctrl+Z)"}
                    onMouseEnter={(e) => {
                        if (!previewMode && canUndo && !isLoading) {
                            e.currentTarget.style.background = theme.palette.action.hover;
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!previewMode && canUndo && !isLoading) {
                            e.currentTarget.style.background = theme.palette.background.paper;
                        }
                    }}
                >
                    ↶
                </button>

                <button
                    onClick={onRedo}
                    disabled={previewMode || !canRedo || isLoading}
                    style={getButtonStyle(
                        (previewMode || !canRedo || isLoading) ? 'disabled' : 'default'
                    )}
                    title={previewMode ? "Redo (disabled in preview mode)" : "Redo (Ctrl+Shift+Z)"}
                    onMouseEnter={(e) => {
                        if (!previewMode && canRedo && !isLoading) {
                            e.currentTarget.style.background = theme.palette.action.hover;
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!previewMode && canRedo && !isLoading) {
                            e.currentTarget.style.background = theme.palette.background.paper;
                        }
                    }}
                >
                    ↷
                </button>
            </div>

            {/* Center Section - Layout Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
                {previewMode && (
                    <div style={{
                        backgroundColor: theme.palette.warning.main,
                        color: theme.palette.warning.contrastText,
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
                <div style={{ color: theme.palette.text.primary }}>
                    <span style={{ fontWeight: 500 }}>{layout.displayName}</span>
                    {!previewMode && isDirty && (
                        <span style={{ color: theme.palette.warning.main, marginLeft: '4px' }}>●</span>
                    )}
                </div>
                <div style={{ color: theme.palette.text.secondary }}>
                    {layout.width}×{layout.height}
                </div>
                <div style={{ color: theme.palette.text.secondary }}>
                    {elements.length} elements
                </div>
                {!previewMode && selectedElements.length > 0 && (
                    <div style={{ color: theme.palette.primary.main }}>
                        {selectedElements.length} selected
                    </div>
                )}
            </div>

            {/* Right Section - Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {/* Preview Button */}
                <button
                    onClick={handlePreview}
                    disabled={isLoading}
                    style={getButtonStyle(
                        isLoading ? 'disabled' : (previewMode ? 'preview' : 'success')
                    )}
                    title={previewMode ? "Exit Preview Mode" : "Enter Preview Mode"}
                    onMouseEnter={(e) => {
                        if (!isLoading) {
                            e.currentTarget.style.background = previewMode
                                ? theme.palette.warning.dark
                                : theme.palette.success.dark;
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!isLoading) {
                            e.currentTarget.style.background = previewMode
                                ? theme.palette.warning.main
                                : theme.palette.success.main;
                        }
                    }}
                >
                    {loadingAction === 'preview' ? '⏳' : previewMode ? '✏️' : '👁️'}
                    {previewMode ? 'Edit' : 'Preview'}
                </button>

                <button
                    onClick={handleExport}
                    disabled={previewMode || isLoading || !layout.id}
                    style={getButtonStyle(
                        (previewMode || isLoading || !layout.id) ? 'disabled' : 'default'
                    )}
                    title={previewMode ? "Export Layout Package (disabled in preview mode)" : "Export Layout Package"}
                    onMouseEnter={(e) => {
                        if (!previewMode && !isLoading && layout.id) {
                            e.currentTarget.style.background = theme.palette.action.hover;
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!previewMode && !isLoading && layout.id) {
                            e.currentTarget.style.background = theme.palette.background.paper;
                        }
                    }}
                >
                    {loadingAction === 'export' ? '⏳' : '📤'} Export
                </button>

                {isEditing && !layout.isPublished && (
                    <button
                        onClick={handlePublish}
                        disabled={previewMode || isLoading || isDirty}
                        style={{
                            ...getButtonStyle(
                                (previewMode || isLoading || isDirty) ? 'disabled' : 'default'
                            ),
                            background: (previewMode || isLoading || isDirty)
                                ? theme.palette.action.disabledBackground
                                : theme.palette.secondary.main,
                            color: (previewMode || isLoading || isDirty)
                                ? theme.palette.action.disabled
                                : theme.palette.secondary.contrastText,
                            border: (previewMode || isLoading || isDirty)
                                ? `1px solid ${theme.palette.divider}`
                                : `1px solid ${theme.palette.secondary.main}`,
                        }}
                        title={previewMode ? "Publish Layout (disabled in preview mode)" : "Publish Layout"}
                        onMouseEnter={(e) => {
                            if (!previewMode && !isLoading && !isDirty) {
                                e.currentTarget.style.background = theme.palette.secondary.dark;
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!previewMode && !isLoading && !isDirty) {
                                e.currentTarget.style.background = theme.palette.secondary.main;
                            }
                        }}
                    >
                        {loadingAction === 'publish' ? '⏳' : '🚀'} Publish
                    </button>
                )}
            </div>
        </div>
    );
};

export default FrameEngine_Toolbar;