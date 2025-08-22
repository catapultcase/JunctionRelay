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
                    height: '200px',
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
                    {imageError ? 'Failed to load' : 'No thumbnail'}
                </Typography>
                <Typography variant="caption" color="textSecondary" align="center">
                    {frameLayout.width && frameLayout.height
                        ? `${frameLayout.width}×${frameLayout.height}`
                        : 'Unknown size'
                    }
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ position: 'relative', height: '200px' }}>
            {imageLoading && (
                <Skeleton
                    variant="rectangular"
                    width="100%"
                    height="200px"
                    sx={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}
                />
            )}
            <CardMedia
                component="img"
                height="200"
                image={thumbnailUrl}
                alt={`${frameLayout.displayName} thumbnail`}
                onLoad={handleImageLoad}
                onError={handleImageError}
                sx={{
                    objectFit: 'contain',
                    backgroundColor: 'grey.50',
                    opacity: imageLoading ? 0 : 1,
                    transition: 'opacity 0.3s ease-in-out'
                }}
            />
            {/* Dimensions overlay */}
            {frameLayout.width && frameLayout.height && !imageLoading && (
                <Box
                    sx={{
                        position: 'absolute',
                        bottom: 8,
                        right: 8,
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                        fontSize: '0.75rem'
                    }}
                >
                    {frameLayout.width}×{frameLayout.height}
                </Box>
            )}
        </Box>
    );
});

// Individual Gallery Card Component
const GalleryCard = memo(({
    frameLayout,
    onDelete,
    onEdit,
    onClone
}: {
    frameLayout: FrameLayoutListItem;
    onDelete: (e: React.MouseEvent, id: string) => void;
    onEdit: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void;
    onClone: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void;
}) => {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [thumbnailError, setThumbnailError] = useState(false);
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
                height: '320px',
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
            {/* Template Badge */}
            {frameLayout.isTemplate && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        backgroundColor: 'success.main',
                        color: 'success.contrastText',
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 2,
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        boxShadow: 2,
                        zIndex: 2
                    }}
                >
                    TEMPLATE
                </Box>
            )}

            {/* Action Menu Button */}
            <IconButton
                className="gallery-actions"
                size="small"
                onClick={handleMenuOpen}
                sx={{
                    position: 'absolute',
                    top: frameLayout.isTemplate ? 48 : 8,
                    right: frameLayout.hasThumbnail ? 80 : 8,
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    opacity: 0,
                    transition: 'opacity 0.2s ease-in-out',
                    zIndex: 2,
                    '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 1)'
                    }
                }}
            >
                <MoreVertIcon fontSize="small" />
            </IconButton>

            {/* Thumbnail */}
            <ThumbnailImage frameLayout={frameLayout} onImageError={handleThumbnailError} />

            {/* Card Content */}
            <CardContent sx={{ flex: 1, pt: 2, pb: 1.5 }}>
                {/* Title */}
                <Typography
                    variant="h6"
                    sx={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        lineHeight: 1.3,
                        mb: 1,
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
                            fontSize: '0.85rem'
                        }}
                        title={frameLayout.description}
                    >
                        {frameLayout.description}
                    </Typography>
                )}

                {/* Type Chip */}
                <Box sx={{ mt: 'auto' }}>
                    <Chip
                        label={frameLayout.layoutType}
                        color={typeInfo.color}
                        size="small"
                        sx={{ fontSize: '0.7rem', height: 24 }}
                    />
                </Box>
            </CardContent>

            {/* Actions Menu */}
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
                {!frameLayout.isTemplate && (
                    <MenuItem
                        onClick={(e) => {
                            handleMenuClose();
                            onEdit(e, frameLayout);
                        }}
                    >
                        <ListItemIcon>
                            <EditIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Edit</ListItemText>
                    </MenuItem>
                )}
                <MenuItem
                    onClick={(e) => {
                        handleMenuClose();
                        onClone(e, frameLayout);
                    }}
                >
                    <ListItemIcon>
                        <ContentCopyIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Clone</ListItemText>
                </MenuItem>
                {!frameLayout.isTemplate && (
                    <MenuItem
                        onClick={(e) => {
                            handleMenuClose();
                            onDelete(e, frameLayout.id);
                        }}
                        sx={{ color: 'error.main' }}
                    >
                        <ListItemIcon>
                            <DeleteIcon fontSize="small" color="error" />
                        </ListItemIcon>
                        <ListItemText>Delete</ListItemText>
                    </MenuItem>
                )}
            </Menu>
        </Card>
    );
});

// Main Gallery Component
const FrameEngine_Gallery: React.FC<FrameEngine_GalleryProps> = ({
    frameLayouts,
    onDelete,
    onEdit,
    onClone
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
                gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                    md: 'repeat(3, 1fr)',
                    lg: 'repeat(4, 1fr)',
                    xl: 'repeat(5, 1fr)'
                },
                gap: 3,
                mb: 4
            }}
        >
            {frameLayouts.map((frameLayout) => (
                <GalleryCard
                    key={frameLayout.id}
                    frameLayout={frameLayout}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    onClone={onClone}
                />
            ))}
        </Box>
    );
};

export default FrameEngine_Gallery;