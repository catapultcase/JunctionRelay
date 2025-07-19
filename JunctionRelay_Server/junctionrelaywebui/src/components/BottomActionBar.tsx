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
    primaryAction?: BottomActionConfigWithSubmenu;
    secondaryActions?: BottomActionConfig[];
    viewModeActions?: {
        currentMode: string;
        modes: Array<{
            mode: string;
            icon: React.ReactNode;
            label: string;
        }>;
        onModeChange: (mode: string) => void;
    };
    show?: boolean;
    // New props for configure layout
    layout?: 'standard' | 'configure';
    leftActions?: BottomActionConfig[];
    rightActions?: BottomActionConfig[];
}

const BottomActionBar: React.FC<BottomActionBarProps> = ({
    primaryAction,
    secondaryActions = [],
    viewModeActions,
    show = true,
    layout = 'standard',
    leftActions = [],
    rightActions = []
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

    const handlePrimaryActionClick = (event: React.MouseEvent<HTMLElement>) => {
        if (primaryAction?.submenu && primaryAction.submenu.length > 0) {
            setSubmenuAnchor(event.currentTarget);
        } else if (primaryAction?.onClick) {
            primaryAction.onClick();
        }
    };

    const handleSubmenuClose = () => {
        setSubmenuAnchor(null);
    };

    const handleSubmenuItemClick = (submenuItem: BottomActionSubmenu) => {
        submenuItem.onClick();
        handleSubmenuClose();
    };

    // Render configure layout
    if (layout === 'configure') {
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
                            {/* Left side - Standard actions (BACK, REFRESH, SAVE) */}
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

                            {/* Center - View mode toggles (perfectly centered) */}
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

                            {/* Right side - Custom actions (Export, Delete, etc.) */}
                            <Box sx={{
                                display: 'flex',
                                gap: 0.5,
                                flex: 1,
                                justifyContent: 'flex-end',
                                alignItems: 'center'
                            }}>
                                {rightActions.map((action, index) => (
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
                        </Box>
                    </Paper>
                </Slide>
            </>
        );
    }

    // Render standard layout (existing behavior)
    const visibleSecondaryActions = secondaryActions.slice(0, 4);

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
                            gap: 1
                        }}
                    >
                        {/* Left side - Secondary actions */}
                        <Box sx={{
                            display: 'flex',
                            gap: 0.5,
                            flex: 1,
                            justifyContent: 'flex-start',
                            alignItems: 'center',
                            // Allow wrapping if there are many actions
                            flexWrap: 'wrap'
                        }}>
                            {visibleSecondaryActions.map((action, index) => (
                                <Tooltip key={index} title={action.label} placement="top">
                                    <span>
                                        {action.showText === true ? (
                                            <Button
                                                onClick={action.onClick}
                                                disabled={action.disabled}
                                                color={action.color || 'primary'}
                                                size="small"
                                                startIcon={action.icon}
                                                variant={action.variant || 'outlined'}
                                                sx={{
                                                    minWidth: 'auto',
                                                    px: 1.5,
                                                    py: 0.5,
                                                    fontSize: '0.75rem',
                                                    height: 32,
                                                    transition: 'all 0.2s ease',
                                                    // Better text truncation for long labels
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
                        </Box>

                        {/* Center - View mode toggles (if provided) */}
                        {viewModeActions && (
                            <Box sx={{
                                display: 'flex',
                                gap: 0.5,
                                backgroundColor: theme.palette.action.hover,
                                borderRadius: 2,
                                p: 0.5,
                                border: `1px solid ${theme.palette.divider}`,
                                // Ensure it doesn't get squeezed
                                flexShrink: 0
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

                        {/* Right side - Primary action (FAB) */}
                        <Box sx={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            flex: primaryAction ? 1 : 0,
                            // Ensure it doesn't get squeezed
                            flexShrink: 0
                        }}>
                            {primaryAction && (
                                <Tooltip title={primaryAction.label} placement="top">
                                    <span>
                                        <Fab
                                            color={primaryAction.color || 'primary'}
                                            onClick={handlePrimaryActionClick}
                                            disabled={primaryAction.disabled}
                                            size="medium"
                                            sx={{
                                                boxShadow: primaryAction.disabled
                                                    ? 'none'
                                                    : theme.shadows[6],
                                                transition: 'all 0.2s ease',
                                                position: 'relative',
                                                '&:hover': {
                                                    transform: primaryAction.disabled ? 'none' : 'scale(1.05)',
                                                    boxShadow: primaryAction.disabled
                                                        ? 'none'
                                                        : theme.shadows[8]
                                                },
                                                '&:active': {
                                                    transform: primaryAction.disabled ? 'none' : 'scale(0.95)'
                                                },
                                                '&.Mui-disabled': {
                                                    backgroundColor: theme.palette.action.disabledBackground,
                                                    color: theme.palette.action.disabled
                                                }
                                            }}
                                        >
                                            {primaryAction.badge ? (
                                                <Badge
                                                    badgeContent={primaryAction.badge}
                                                    color="error"
                                                    variant={typeof primaryAction.badge === 'number' ? 'standard' : 'dot'}
                                                >
                                                    {primaryAction.icon}
                                                </Badge>
                                            ) : (
                                                primaryAction.icon
                                            )}
                                        </Fab>
                                    </span>
                                </Tooltip>
                            )}
                        </Box>
                    </Box>
                </Paper>
            </Slide>

            {/* Submenu */}
            {primaryAction?.submenu && (
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
                    PaperProps={{
                        sx: {
                            minWidth: 200,
                            maxWidth: 300,
                            mb: 2, // Space above bottom action bar
                            '& .MuiMenuItem-root': {
                                py: 1.5,
                                gap: 1.5
                            }
                        }
                    }}
                    slotProps={{
                        paper: {
                            sx: {
                                marginBottom: '80px', // Ensure menu appears above bottom bar
                                maxHeight: 'calc(100vh - 140px)', // Leave space for bottom bar
                            }
                        }
                    }}
                >
                    {primaryAction.submenu.map((item, index) => (
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