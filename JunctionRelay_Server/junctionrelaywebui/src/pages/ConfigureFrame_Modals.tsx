/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import React, { useState } from 'react';
import { useTheme } from '@mui/material/styles';
import type { FrameLayoutConfig } from './ConfigureFrame_Types';

interface ThumbnailManagementModalProps {
    isOpen: boolean;
    layout: FrameLayoutConfig;
    onClose: () => void;
    onSaveWithThumbnail: (customThumbnail?: File) => Promise<void>;
    onCaptureThumbnail: () => Promise<void>;
}

export const ThumbnailManagementModal: React.FC<ThumbnailManagementModalProps> = ({
    isOpen,
    layout,
    onClose,
    onSaveWithThumbnail,
    onCaptureThumbnail
}) => {
    const theme = useTheme();
    const [uploadingFile, setUploadingFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const getCurrentThumbnailUrl = () => {
        if (layout.id) {
            return `/api/frameengine/${layout.id}/thumbnail?${Date.now()}`;
        }
        return null;
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            setUploadingFile(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                setPreviewUrl(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveWithCustomThumbnail = async () => {
        await onSaveWithThumbnail(uploadingFile || undefined);
        onClose();
    };

    const handleCaptureAndSave = async () => {
        await onCaptureThumbnail();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: theme.palette.background.paper,
                borderRadius: '8px',
                padding: '24px',
                maxWidth: '500px',
                width: '90%',
                maxHeight: '80vh',
                overflow: 'auto',
                boxShadow: theme.shadows[10]
            }}>
                <h3 style={{
                    margin: '0 0 16px 0',
                    fontSize: '18px',
                    fontWeight: 600,
                    color: theme.palette.text.primary
                }}>
                    Save Layout & Manage Thumbnail
                </h3>

                {/* Current Thumbnail Section */}
                <div style={{ marginBottom: '24px' }}>
                    <h4 style={{
                        margin: '0 0 8px 0',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: theme.palette.text.primary
                    }}>
                        Current Thumbnail
                    </h4>
                    <div style={{
                        width: '100%',
                        height: '160px',
                        border: `2px dashed ${theme.palette.divider}`,
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.palette.mode === 'dark'
                            ? theme.palette.grey[900]
                            : theme.palette.grey[50],
                        overflow: 'hidden'
                    }}>
                        {getCurrentThumbnailUrl() ? (
                            <img
                                src={getCurrentThumbnailUrl()!}
                                alt="Current thumbnail"
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain'
                                }}
                                onError={() => {
                                    // Handle thumbnail load error
                                }}
                            />
                        ) : (
                            <div style={{
                                textAlign: 'center',
                                color: theme.palette.text.secondary
                            }}>
                                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📷</div>
                                <div style={{ fontSize: '14px' }}>No thumbnail exists yet</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Upload New Thumbnail Section */}
                <div style={{ marginBottom: '24px' }}>
                    <h4 style={{
                        margin: '0 0 8px 0',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: theme.palette.text.primary
                    }}>
                        Upload Custom Thumbnail
                    </h4>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        style={{
                            width: '100%',
                            padding: '8px',
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: '4px',
                            marginBottom: '8px',
                            backgroundColor: theme.palette.background.paper,
                            color: theme.palette.text.primary
                        }}
                    />
                    {previewUrl && (
                        <div style={{
                            width: '100%',
                            height: '120px',
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: '4px',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: theme.palette.mode === 'dark'
                                ? theme.palette.grey[900]
                                : theme.palette.grey[50]
                        }}>
                            <img
                                src={previewUrl}
                                alt="Upload preview"
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain'
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    flexDirection: 'column'
                }}>
                    {uploadingFile && (
                        <button
                            onClick={handleSaveWithCustomThumbnail}
                            style={{
                                padding: '12px 16px',
                                backgroundColor: theme.palette.primary.main,
                                color: theme.palette.primary.contrastText,
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 500,
                                transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = theme.palette.primary.dark;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = theme.palette.primary.main;
                            }}
                        >
                            Save with Uploaded Thumbnail
                        </button>
                    )}

                    <button
                        onClick={handleCaptureAndSave}
                        style={{
                            padding: '12px 16px',
                            backgroundColor: theme.palette.success.main,
                            color: theme.palette.success.contrastText,
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 500,
                            transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme.palette.success.dark;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = theme.palette.success.main;
                        }}
                    >
                        Capture from Canvas & Save
                    </button>

                    <div style={{
                        display: 'flex',
                        gap: '8px'
                    }}>
                        <button
                            onClick={() => onSaveWithThumbnail()}
                            style={{
                                flex: 1,
                                padding: '12px 16px',
                                backgroundColor: theme.palette.mode === 'dark'
                                    ? theme.palette.grey[700]
                                    : theme.palette.grey[600],
                                color: theme.palette.getContrastText(
                                    theme.palette.mode === 'dark'
                                        ? theme.palette.grey[700]
                                        : theme.palette.grey[600]
                                ),
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = theme.palette.mode === 'dark'
                                    ? theme.palette.grey[800]
                                    : theme.palette.grey[700];
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = theme.palette.mode === 'dark'
                                    ? theme.palette.grey[700]
                                    : theme.palette.grey[600];
                            }}
                        >
                            Save Without Changes
                        </button>

                        <button
                            onClick={onClose}
                            style={{
                                flex: 1,
                                padding: '12px 16px',
                                backgroundColor: 'transparent',
                                color: theme.palette.text.secondary,
                                border: `1px solid ${theme.palette.divider}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = theme.palette.action.hover;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface SavingProgressModalProps {
    isOpen: boolean;
    step: 'saving' | 'thumbnail' | 'complete';
    message: string;
    onClose: () => void;
}

export const SavingProgressModal: React.FC<SavingProgressModalProps> = ({
    isOpen,
    step,
    message,
    onClose
}) => {
    const theme = useTheme();

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: theme.palette.background.paper,
                borderRadius: '8px',
                padding: '32px',
                textAlign: 'center',
                minWidth: '300px',
                boxShadow: theme.shadows[10]
            }}>
                {step === 'complete' ? (
                    <>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                        <h3 style={{
                            margin: '0 0 8px 0',
                            fontSize: '18px',
                            fontWeight: 600,
                            color: theme.palette.success.main
                        }}>
                            Save Complete!
                        </h3>
                        <p style={{
                            margin: '0 0 24px 0',
                            color: theme.palette.text.secondary,
                            fontSize: '14px'
                        }}>
                            {message}
                        </p>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: theme.palette.success.main,
                                color: theme.palette.success.contrastText,
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = theme.palette.success.dark;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = theme.palette.success.main;
                            }}
                        >
                            Close
                        </button>
                    </>
                ) : (
                    <>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            border: `4px solid ${theme.palette.divider}`,
                            borderTop: `4px solid ${theme.palette.primary.main}`,
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            margin: '0 auto 16px'
                        }}></div>
                        <h3 style={{
                            margin: '0 0 8px 0',
                            fontSize: '18px',
                            fontWeight: 600,
                            color: theme.palette.text.primary
                        }}>
                            {step === 'saving' ? 'Saving Layout...' : 'Generating Thumbnail...'}
                        </h3>
                        <p style={{
                            margin: 0,
                            color: theme.palette.text.secondary,
                            fontSize: '14px'
                        }}>
                            {message}
                        </p>
                    </>
                )}
                <style>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        </div>
    );
};