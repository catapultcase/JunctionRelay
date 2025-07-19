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

import React, { useState } from 'react';
import {
    Paper,
    Box,
    Fab,
    IconButton,
    useTheme,
    useMediaQuery,
    Slide,
    Tooltip,
    Badge,
    Button,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Typography
} from '@mui/material';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';

export interface BottomActionConfig {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
    badge?: number | string;
    variant?: 'text' | 'outlined' | 'contained';
    showText?: boolean;
}

export interface BottomActionSubmenu {
    icon: React.ReactNode;
    label: string;
    description?: string;
    onClick: () => void;
    disabled?: boolean;
    color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
}

export interface BottomActionConfigWithSubmenu extends Omit<BottomActionConfig, 'onClick'> {
    onClick?: () => void;
    submenu?: BottomActionSubmenu[];
}

export interface BottomActionBarProps {
    // Hero action (primary FAB on the right)
    heroAction?: BottomActionConfigWithSubmenu;
    // Secondary actions on the right (next to hero action, max 2)
    rightSecondaryActions?: BottomActionConfig[];
    // View mode toggles (always centered)
    viewModeActions?: {
        currentMode: string;
        modes: Array<{
            mode: string;
            icon: React.ReactNode;
            label: string;
        }>;
        onModeChange: (mode: string) => void;
    };
    // Control visibility
    show?: boolean;
    // Show back button (controlled by feature flag in parent)
    showBackButton?: boolean;
    // Show save button (only on configure pages)
    showSaveButton?: boolean;
}

const BottomActionBar: React.FC<BottomActionBarProps> = ({
    heroAction,
    rightSecondaryActions = [],
    viewModeActions,
    show = true,
    showBackButton = false,
    showSaveButton = false
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [submenuAnchor, setSubmenuAnchor] = useState<null | HTMLElement>(null);

    if (!isMobile || !show) {
        return null;
    }

    const backgroundColor = theme.palette.mode === 'dark'
        ? 'rgba(18, 18, 18, 0.95)'
        : 'rgba(255, 255, 255, 0.95)';

    const handleHeroActionClick = (event: React.MouseEvent<HTMLElement>) => {
        if (heroAction?.submenu && heroAction.submenu.length > 0) {
            setSubmenuAnchor(event.currentTarget);
        } else if (heroAction?.onClick) {
            heroAction.onClick();
        }
    };

    const handleSubmenuClose = () => {
        setSubmenuAnchor(null);
    };

    const handleSubmenuItemClick = (submenuItem: BottomActionSubmenu) => {
        submenuItem.onClick();
        handleSubmenuClose();
    };

    // Fixed standard actions on the left
    const leftActions: BottomActionConfig[] = [
        // Back button (conditional)
        ...(showBackButton ? [{
            icon: <ArrowBackIcon />,
            label: 'Back',
            onClick: () => {
                window.dispatchEvent(new CustomEvent('bottom-action-back'));
            }
        }] : []),
        // Refresh (always present)
        {
            icon: <RefreshIcon />,
            label: 'Refresh',
            onClick: () => {
                window.dispatchEvent(new CustomEvent('bottom-action-refresh'));
            }
        },
        // Save (only on configure pages)
        ...(showSaveButton ? [{
            icon: <SaveIcon />,
            label: 'Save',
            onClick: () => {
                window.dispatchEvent(new CustomEvent('bottom-action-save'));
            }
        }] : [])
    ];

    return (
        <>
            <Slide direction="up" in={show} mountOnEnter unmountOnExit>
                <Paper
                    elevation={8}
                    sx={{
                        position: 'fixed',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        zIndex: theme.zIndex.appBar,
                        backgroundColor,
                        backdropFilter: 'blur(10px)',
                        borderTop: `1px solid ${theme.palette.divider}`,
                        borderRadius: '16px 16px 0 0',
                        pb: 'env(safe-area-inset-bottom)',
                        boxShadow: theme.palette.mode === 'dark'
                            ? '0 -4px 20px rgba(0, 0, 0, 0.5)'
                            : '0 -4px 20px rgba(0, 0, 0, 0.1)',
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            px: 2,
                            py: 1,
                            minHeight: 64,
                            gap: 1,
                            position: 'relative'
                        }}
                    >
                        {/* Left side - Standard actions (Back + Refresh + Save) */}
                        <Box sx={{
                            display: 'flex',
                            gap: 0.5,
                            flex: 1,
                            justifyContent: 'flex-start',
                            alignItems: 'center'
                        }}>
                            {leftActions.map((action, index) => (
                                <Tooltip key={index} title={action.label} placement="top">
                                    <span>
                                        <IconButton
                                            onClick={action.onClick}
                                            disabled={action.disabled}
                                            color={action.color || 'primary'}
                                            size="small"
                                            sx={{
                                                transition: 'all 0.2s ease',
                                                '&:hover': {
                                                    backgroundColor: action.disabled
                                                        ? 'transparent'
                                                        : `${theme.palette[action.color || 'primary'].main}15`,
                                                    transform: action.disabled ? 'none' : 'scale(1.05)'
                                                },
                                                '&:active': {
                                                    transform: action.disabled ? 'none' : 'scale(0.95)'
                                                }
                                            }}
                                        >
                                            {action.badge ? (
                                                <Badge
                                                    badgeContent={action.badge}
                                                    color="error"
                                                    variant={typeof action.badge === 'number' ? 'standard' : 'dot'}
                                                >
                                                    {action.icon}
                                                </Badge>
                                            ) : (
                                                action.icon
                                            )}
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            ))}
                        </Box>

                        {/* Center - View mode toggles (always centered) */}
                        {viewModeActions && (
                            <Box sx={{
                                display: 'flex',
                                gap: 0.5,
                                backgroundColor: theme.palette.action.hover,
                                borderRadius: 2,
                                p: 0.5,
                                border: `1px solid ${theme.palette.divider}`,
                                flexShrink: 0,
                                position: 'absolute',
                                left: '50%',
                                transform: 'translateX(-50%)'
                            }}>
                                {viewModeActions.modes.map((mode) => (
                                    <Tooltip key={mode.mode} title={mode.label} placement="top">
                                        <IconButton
                                            onClick={() => viewModeActions.onModeChange(mode.mode)}
                                            size="small"
                                            sx={{
                                                backgroundColor: viewModeActions.currentMode === mode.mode
                                                    ? theme.palette.primary.main
                                                    : 'transparent',
                                                color: viewModeActions.currentMode === mode.mode
                                                    ? theme.palette.primary.contrastText
                                                    : theme.palette.text.primary,
                                                '&:hover': {
                                                    backgroundColor: viewModeActions.currentMode === mode.mode
                                                        ? theme.palette.primary.dark
                                                        : theme.palette.action.hover,
                                                    transform: 'scale(1.05)'
                                                },
                                                '&:active': {
                                                    transform: 'scale(0.95)'
                                                },
                                                // Fix for mobile sticky press and color not reverting
                                                '&:not(:hover):not(:active):not(:focus)': {
                                                    backgroundColor: viewModeActions.currentMode === mode.mode
                                                        ? theme.palette.primary.main
                                                        : 'transparent',
                                                },
                                                // Ensure touch events release properly on mobile
                                                touchAction: 'manipulation',
                                                WebkitTapHighlightColor: 'transparent',
                                                transition: 'all 0.2s ease',
                                                minWidth: 36,
                                                minHeight: 36
                                            }}
                                        >
                                            {mode.icon}
                                        </IconButton>
                                    </Tooltip>
                                ))}
                            </Box>
                        )}

                        {/* Right side - Secondary actions + Hero action */}
                        <Box sx={{
                            display: 'flex',
                            gap: 0.5,
                            flex: 1,
                            justifyContent: 'flex-end',
                            alignItems: 'center'
                        }}>
                            {/* Secondary actions (max 2) */}
                            {rightSecondaryActions.slice(0, 2).map((action, index) => (
                                <Tooltip key={index} title={action.label} placement="top">
                                    <span>
                                        {action.showText === true ? (
                                            <Button
                                                onClick={action.onClick}
                                                disabled={action.disabled}
                                                color={action.color || 'primary'}
                                                size="small"
                                                startIcon={action.icon || undefined}
                                                variant={action.variant || 'outlined'}
                                                sx={{
                                                    minWidth: 'auto',
                                                    px: 1.5,
                                                    py: 0.5,
                                                    fontSize: '0.75rem',
                                                    height: 32,
                                                    transition: 'all 0.2s ease',
                                                    maxWidth: '100px',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    '&:hover': {
                                                        backgroundColor: action.disabled
                                                            ? 'transparent'
                                                            : `${theme.palette[action.color || 'primary'].main}15`,
                                                        transform: action.disabled ? 'none' : 'scale(1.05)'
                                                    },
                                                    '&:active': {
                                                        transform: action.disabled ? 'none' : 'scale(0.95)'
                                                    }
                                                }}
                                            >
                                                {action.label}
                                            </Button>
                                        ) : (
                                            <IconButton
                                                onClick={action.onClick}
                                                disabled={action.disabled}
                                                color={action.color || 'primary'}
                                                size="small"
                                                sx={{
                                                    transition: 'all 0.2s ease',
                                                    '&:hover': {
                                                        backgroundColor: action.disabled
                                                            ? 'transparent'
                                                            : `${theme.palette[action.color || 'primary'].main}15`,
                                                        transform: action.disabled ? 'none' : 'scale(1.05)'
                                                    },
                                                    '&:active': {
                                                        transform: action.disabled ? 'none' : 'scale(0.95)'
                                                    }
                                                }}
                                            >
                                                {action.badge ? (
                                                    <Badge
                                                        badgeContent={action.badge}
                                                        color="error"
                                                        variant={typeof action.badge === 'number' ? 'standard' : 'dot'}
                                                    >
                                                        {action.icon}
                                                    </Badge>
                                                ) : (
                                                    action.icon
                                                )}
                                            </IconButton>
                                        )}
                                    </span>
                                </Tooltip>
                            ))}

                            {/* Hero action (Primary FAB) */}
                            {heroAction && (
                                <Tooltip title={heroAction.label} placement="top">
                                    <span>
                                        <Fab
                                            color={heroAction.color || 'primary'}
                                            onClick={handleHeroActionClick}
                                            disabled={heroAction.disabled}
                                            size="medium"
                                            sx={{
                                                boxShadow: heroAction.disabled
                                                    ? 'none'
                                                    : theme.shadows[6],
                                                transition: 'all 0.2s ease',
                                                position: 'relative',
                                                ml: 0.5, // Small gap from secondary actions
                                                '&:hover': {
                                                    transform: heroAction.disabled ? 'none' : 'scale(1.05)',
                                                    boxShadow: heroAction.disabled
                                                        ? 'none'
                                                        : theme.shadows[8]
                                                },
                                                '&:active': {
                                                    transform: heroAction.disabled ? 'none' : 'scale(0.95)'
                                                },
                                                '&.Mui-disabled': {
                                                    backgroundColor: theme.palette.action.disabledBackground,
                                                    color: theme.palette.action.disabled
                                                }
                                            }}
                                        >
                                            {heroAction.badge ? (
                                                <Badge
                                                    badgeContent={heroAction.badge}
                                                    color="error"
                                                    variant={typeof heroAction.badge === 'number' ? 'standard' : 'dot'}
                                                >
                                                    {heroAction.icon}
                                                </Badge>
                                            ) : (
                                                heroAction.icon
                                            )}
                                        </Fab>
                                    </span>
                                </Tooltip>
                            )}
                        </Box>
                    </Box>
                </Paper>
            </Slide>

            {/* Submenu for hero action */}
            {heroAction?.submenu && (
                <Menu
                    anchorEl={submenuAnchor}
                    open={Boolean(submenuAnchor)}
                    onClose={handleSubmenuClose}
                    anchorOrigin={{
                        vertical: 'top',
                        horizontal: 'center',
                    }}
                    transformOrigin={{
                        vertical: 'bottom',
                        horizontal: 'center',
                    }}
                    slotProps={{
                        paper: {
                            sx: {
                                minWidth: 200,
                                maxWidth: 300,
                                mb: 2,
                                marginBottom: '80px',
                                maxHeight: 'calc(100vh - 140px)',
                                '& .MuiMenuItem-root': {
                                    py: 1.5,
                                    gap: 1.5
                                }
                            }
                        }
                    }}
                >
                    {heroAction.submenu.map((item, index) => (
                        <MenuItem
                            key={index}
                            onClick={() => handleSubmenuItemClick(item)}
                            disabled={item.disabled}
                            sx={{
                                minHeight: 48,
                                '&:hover': {
                                    backgroundColor: `${theme.palette[item.color || 'primary'].main}08`,
                                }
                            }}
                        >
                            <ListItemIcon sx={{
                                color: item.color ? theme.palette[item.color].main : 'inherit',
                                minWidth: 40
                            }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText>
                                <Typography variant="body1" fontWeight="medium">
                                    {item.label}
                                </Typography>
                                {item.description && (
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                                        {item.description}
                                    </Typography>
                                )}
                            </ListItemText>
                        </MenuItem>
                    ))}
                </Menu>
            )}
        </>
    );
};

export default BottomActionBar;