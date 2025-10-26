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

import React, { useState, useCallback, memo } from 'react';
import FrameEngine_CloudVersionsModal from './FrameEngine_CloudVersionsModal';
import {
    Box,
    Card,
    CardContent,
    CardMedia,
    Typography,
    Chip,
    IconButton,
    Tooltip,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Paper,
    Skeleton,
    Badge,
} from '@mui/material';
import {
    Edit as EditIcon,
    ContentCopy as ContentCopyIcon,
    Delete as DeleteIcon,
    MoreVert as MoreVertIcon,
    Image as ImageIcon,
    BrokenImage as BrokenImageIcon,
    Dashboard as DashboardIcon,
    CloudUpload as CloudUploadIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

// Types
interface FrameLayoutListItem {
    id: string;
    isTemplate?: boolean;
    displayName: string;
    description?: string;
    layoutType: string;
    width?: number;
    height?: number;
    hasThumbnail?: boolean;
    thumbnailPath?: string;
    thumbnailGeneratedAt?: string;
}

interface FrameEngine_GalleryProps {
    frameLayouts: FrameLayoutListItem[];
    onDelete: (e: React.MouseEvent, id: string) => void;
    onEdit: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void;
    onClone: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void;
    onShowSnackbar?: (message: string, severity?: "success" | "info" | "warning" | "error") => void;
    hasProLicense?: boolean;
}

// Thumbnail Image Component with loading states and fallbacks
const ThumbnailImage = memo(({
    frameLayout,
    onImageError
}: {
    frameLayout: FrameLayoutListItem;
    onImageError: () => void;
}) => {
    const [imageLoading, setImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);

    const handleImageLoad = () => {
        setImageLoading(false);
        setImageError(false);
    };

    const handleImageError = () => {
        setImageLoading(false);
        setImageError(true);
        onImageError();
    };

    // Generate thumbnail URL if available
    const getThumbnailUrl = () => {
        if (frameLayout.hasThumbnail && frameLayout.id) {
            return `/api/frameengine/${frameLayout.id}/thumbnail?${Date.now()}`;
        }
        return null;
    };

    const thumbnailUrl = getThumbnailUrl();

    // Show placeholder if no thumbnail or error
    if (!thumbnailUrl || imageError) {
        return (
            <Box
                sx={{
                    width: '320px',
                    height: '180px',
                    backgroundColor: 'grey.100',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px dashed',
                    borderColor: 'grey.300',
                    borderRadius: 1,
                    position: 'relative'
                }}
            >
                {imageError ? (
                    <BrokenImageIcon sx={{ fontSize: 48, color: 'grey.400', mb: 1 }} />
                ) : (
                    <ImageIcon sx={{ fontSize: 48, color: 'grey.400', mb: 1 }} />
                )}
                <Typography variant="caption" color="textSecondary" align="center">
                    {imageError ? 'Preview unavailable' : 'Loading preview...'}
                </Typography>
                <Typography variant="caption" color="textSecondary" align="center">
                    {frameLayout.width && frameLayout.height
                        ? `${frameLayout.width}×${frameLayout.height}`
                        : 'Unknown size'}
                </Typography>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                position: 'relative',
                width: '320px',
                height: '180px',
                overflow: 'hidden',
                borderRadius: 1,
                backgroundColor: 'grey.50'
            }}
        >
            {imageLoading && (
                <Skeleton
                    variant="rectangular"
                    width="320px"
                    height="180px"
                    sx={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}
                />
            )}
            <CardMedia
                component="img"
                width="320"
                height="180"
                image={thumbnailUrl}
                alt={`${frameLayout.displayName} preview`}
                onLoad={handleImageLoad}
                onError={handleImageError}
                sx={{
                    width: '320px',
                    height: '180px',
                    objectFit: 'cover',
                    backgroundColor: 'grey.50',
                    opacity: imageLoading ? 0 : 1,
                    transition: 'opacity 0.3s ease-in-out'
                }}
            />
        </Box>
    );
});

// Individual Gallery Card Component
const GalleryCard = memo(({
    frameLayout,
    onDelete,
    onEdit,
    onClone,
    onShowSnackbar,
    hasProLicense
}: {
    frameLayout: FrameLayoutListItem;
    onDelete: (e: React.MouseEvent, id: string) => void;
    onEdit: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void;
    onClone: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void;
    onShowSnackbar?: (message: string, severity?: "success" | "info" | "warning" | "error") => void;
    hasProLicense?: boolean;
}) => {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [thumbnailError, setThumbnailError] = useState(false);
    const [cloudVersionsModalOpen, setCloudVersionsModalOpen] = useState(false);
    const navigate = useNavigate();

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    const handleCardClick = () => {
        navigate(`/configure-frame/${frameLayout.id}`);
    };

    const handleThumbnailError = () => {
        setThumbnailError(true);
    };

    // Get type info for styling
    const getFrameLayoutTypeInfo = (type: string) => {
        const typeMap: Record<string, { color: "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error" }> = {
            "PRE_RENDERED_IMAGE": { color: "primary" },
            "COMPOSITE_MODE": { color: "secondary" },
            "FRAME_SENSOR_GRID": { color: "info" },
            "FRAME_CALENDAR": { color: "warning" },
            "FRAME_DASHBOARD": { color: "success" },
            "FRAME_CHART": { color: "error" },
        };
        return typeMap[type] || { color: "default" as const };
    };

    const typeInfo = getFrameLayoutTypeInfo(frameLayout.layoutType);

    return (
        <Card
            variant="outlined"
            sx={{
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                position: 'relative',
                height: '420px', // Increased to match FrameXchange
                width: '100%', // Let grid control width, card fills available space
                maxWidth: '320px', // Lock maximum width to match thumbnail aspect ratio
                display: 'flex',
                flexDirection: 'column',
                '&:hover': {
                    boxShadow: 6,
                    transform: 'translateY(-4px)',
                    '& .gallery-actions': {
                        opacity: 1
                    }
                },
                border: '2px solid',
                borderColor: frameLayout.isTemplate ? 'success.main' : 'divider',
            }}
            onClick={handleCardClick}
        >




            {/* Thumbnail */}
            <ThumbnailImage frameLayout={frameLayout} onImageError={handleThumbnailError} />

            {/* Card Content - matching FrameXchange layout */}
            <CardContent sx={{ position: 'relative', flex: 1, pt: 2, pb: 1.5, display: 'flex', flexDirection: 'column' }}>
                {/* Title */}
                <Box sx={{ mb: 1 }}>
                    <Typography
                        variant="h6"
                        sx={{
                            fontSize: '1rem',
                            fontWeight: 600,
                            lineHeight: 1.3,
                            mb: 0.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                        }}
                        title={frameLayout.displayName}
                    >
                        {frameLayout.displayName}
                    </Typography>
                </Box>

                {/* Description */}
                {frameLayout.description && (
                    <Typography
                        variant="body2"
                        color="textSecondary"
                        sx={{
                            mb: 1.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            fontSize: '0.85rem',
                            flex: 1
                        }}
                        title={frameLayout.description}
                    >
                        {frameLayout.description}
                    </Typography>
                )}

                {/* Type Chip, Dimensions, Template Status, and Actions */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 'auto' }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip
                            label={frameLayout.layoutType}
                            color={typeInfo.color}
                            size="small"
                            sx={{ fontSize: '0.7rem', height: 24 }}
                        />
                        {frameLayout.width && frameLayout.height && (
                            <Chip
                                label={`${frameLayout.width}×${frameLayout.height}`}
                                variant="outlined"
                                size="small"
                                sx={{
                                    fontSize: '0.7rem',
                                    height: 24,
                                    color: 'text.secondary',
                                    borderColor: 'divider'
                                }}
                            />
                        )}
                        {frameLayout.isTemplate && (
                            <Chip
                                label="TEMPLATE"
                                color="success"
                                size="small"
                                sx={{
                                    fontSize: '0.7rem',
                                    height: 24,
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase'
                                }}
                            />
                        )}
                    </Box>

                    {/* Action Buttons */}
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-start' }}>
                        {!frameLayout.isTemplate && (
                            <Tooltip title="Edit Frame Layout">
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEdit(e, frameLayout);
                                    }}
                                    sx={{
                                        color: 'primary.main',
                                        border: '1px solid',
                                        borderColor: 'primary.main',
                                        '&:hover': {
                                            backgroundColor: 'primary.main',
                                            color: 'primary.contrastText'
                                        }
                                    }}
                                >
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        <Tooltip title="Clone Frame Layout">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClone(e, frameLayout);
                                }}
                                sx={{
                                    color: 'secondary.main',
                                    border: '1px solid',
                                    borderColor: 'secondary.main',
                                    '&:hover': {
                                        backgroundColor: 'secondary.main',
                                        color: 'secondary.contrastText'
                                    }
                                }}
                            >
                                <ContentCopyIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        {!frameLayout.isTemplate && (
                            <Tooltip title="Delete Frame Layout">
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(e, frameLayout.id);
                                    }}
                                    sx={{
                                        color: 'error.main',
                                        border: '1px solid',
                                        borderColor: 'error.main',
                                        '&:hover': {
                                            backgroundColor: 'error.main',
                                            color: 'error.contrastText'
                                        }
                                    }}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                </Box>
                {/* Absolutely positioned Cloud Versions button */}
                {!frameLayout.isTemplate && (
                    <Box
                        sx={{
                            position: 'absolute',
                            bottom: 16,
                            right: 16,
                            zIndex: 10
                        }}
                    >
                        <Tooltip title="Cloud Versions (Pro)">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setCloudVersionsModalOpen(true);
                                }}
                                sx={{
                                    color: 'info.main',
                                    backgroundColor: 'background.paper',
                                    border: '1px solid',
                                    borderColor: 'info.main',
                                    boxShadow: 2,
                                    '&:hover': {
                                        backgroundColor: 'info.main',
                                        color: 'info.contrastText',
                                        boxShadow: 4
                                    }
                                }}
                            >
                                <CloudUploadIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                )}

            </CardContent>

            {/* Actions Menu - simplified to just handle edge cases if needed */}
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
                {/* Keep menu for any future additional actions */}
            </Menu>

            <FrameEngine_CloudVersionsModal
                open={cloudVersionsModalOpen}
                onClose={() => setCloudVersionsModalOpen(false)}
                templateId={Number(frameLayout.id)}
                templateName={frameLayout.displayName}
                hasProLicense={hasProLicense || false}
                onShowSnackbar={onShowSnackbar}
            />
        </Card>
    );
});

// Main Gallery Component
const FrameEngine_Gallery: React.FC<FrameEngine_GalleryProps> = ({
    frameLayouts,
    onDelete,
    onEdit,
    onClone,
    onShowSnackbar,
    hasProLicense = false
}) => {
    if (frameLayouts.length === 0) {
        return (
            <Paper sx={{ p: 6, textAlign: 'center' }}>
                <DashboardIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
                <Typography variant="h6" color="textSecondary" gutterBottom>
                    No Frame Layouts Found
                </Typography>
                <Typography variant="body2" color="textSecondary">
                    Create your first frame layout to get started with the gallery view
                </Typography>
            </Paper>
        );
    }

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, 320px)', // fixed width
                justifyContent: 'center', // centers the row if it doesn't fill
                gap: 3,
                mb: 4,
            }}
        >
            {frameLayouts.map((frameLayout) => (
                <GalleryCard
                    key={frameLayout.id}
                    frameLayout={frameLayout}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    onClone={onClone}
                    onShowSnackbar={onShowSnackbar}
                    hasProLicense={hasProLicense}
                />
            ))}
        </Box>
    );
};

export default FrameEngine_Gallery;