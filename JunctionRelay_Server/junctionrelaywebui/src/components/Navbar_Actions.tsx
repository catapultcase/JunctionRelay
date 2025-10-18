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

import {
    Box,
    Link as MuiLink,
    Tooltip,
    Avatar,
    IconButton,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText
} from "@mui/material";
import { Link } from "react-router-dom";
import SettingsIcon from "@mui/icons-material/Settings";
import PaletteIcon from "@mui/icons-material/Palette";
import LanguageIcon from "@mui/icons-material/Language";
import LocalCafeIcon from "@mui/icons-material/LocalCafe";
import StarIcon from "@mui/icons-material/Star";
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import GitHubIcon from "@mui/icons-material/GitHub";
import CloudIcon from "@mui/icons-material/Cloud";
import PersonIcon from "@mui/icons-material/Person";
import LogoutIcon from "@mui/icons-material/Logout";
import UpdateIcon from "@mui/icons-material/Update";
import LaunchIcon from '@mui/icons-material/Launch';
import DescriptionIcon from '@mui/icons-material/Description';

interface NavbarActionsProps {
    flags: any;
    version: string | null;
    latest: string | null;
    isOutdated: boolean;
    authMode: string;
    authStatus: {
        isAuthenticated: boolean;
        user: string | null;
        hasValidLicense: boolean;
        licenseType: string;
        backendAuthenticated: boolean;
        profileImageUrl: string | null;
    };
    userMenuAnchor: HTMLElement | null;
    linksMenuAnchor: HTMLElement | null;
    onUserMenuOpen: (event: React.MouseEvent<HTMLElement>) => void;
    onUserMenuClose: () => void;
    onLinksMenuOpen: (event: React.MouseEvent<HTMLElement>) => void;
    onLinksMenuClose: () => void;
    onLogout: () => void;
    onThemeChange: () => void;
}

const NavbarActions: React.FC<NavbarActionsProps> = ({
    flags,
    version,
    latest,
    isOutdated,
    authMode,
    authStatus,
    userMenuAnchor,
    linksMenuAnchor,
    onUserMenuOpen,
    onUserMenuClose,
    onLinksMenuOpen,
    onLinksMenuClose,
    onLogout,
    onThemeChange
}) => {
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Version Display */}
            {flags?.top_bar_show_current_version === 'true' && version && (
                <Tooltip title={`Current Version: ${version}`}>
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            color: "#ffffff",
                            fontSize: "0.875rem",
                            fontWeight: 500,
                            padding: "4px 8px",
                            borderRadius: "4px",
                            backgroundColor: "rgba(255,255,255,0.1)"
                        }}
                    >
                        v{version}
                    </Box>
                </Tooltip>
            )}

            {/* Update Available */}
            {authMode === 'cloud' && isOutdated && version && latest && (
                <Tooltip title={`Update available: ${latest} (current: ${version})`}>
                    <IconButton
                        sx={{
                            color: "#ff9800",
                            padding: "4px",
                            minWidth: "auto",
                            cursor: "pointer"
                        }}
                    >
                        <UpdateIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            )}

            {/* License or Buy Me Coffee */}
            {authMode === 'cloud' && authStatus.isAuthenticated ? (
                <Tooltip title={`Current License: ${authStatus.licenseType} License`}>
                    <IconButton
                        sx={{
                            color: "#ffffff",
                            padding: "4px",
                            minWidth: "auto",
                            cursor: "default"
                        }}
                    >
                        <StarIcon
                            sx={{
                                color: authStatus.hasValidLicense ? "#4caf50" : "#2196f3",
                                filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.7))"
                            }}
                            fontSize="small"
                        />
                    </IconButton>
                </Tooltip>
            ) : (
                <Tooltip title="Support on Buy Me a Coffee">
                    <IconButton
                        component={MuiLink}
                        href="https://buymeacoffee.com/catapultcase"
                        target="_blank"
                        rel="noopener noreferrer"
                        data-navbar-link
                        sx={{
                            color: "#ffffff",
                            padding: "4px",
                            minWidth: "auto"
                        }}
                    >
                        <LocalCafeIcon
                            sx={{
                                color: "#fdd835",
                                filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.7))"
                            }}
                            fontSize="small"
                        />
                    </IconButton>
                </Tooltip>
            )}

            {/* External Links */}
            <Tooltip title="External Links">
                <IconButton
                    onClick={onLinksMenuOpen}
                    data-navbar-link
                    sx={{
                        color: "#ffffff",
                        padding: "4px",
                        minWidth: "auto"
                    }}
                >
                    <LaunchIcon sx={{ color: "#4caf50" }} fontSize="small" />
                </IconButton>
            </Tooltip>

            {/* Links Menu */}
            <Menu
                anchorEl={linksMenuAnchor}
                open={Boolean(linksMenuAnchor)}
                onClose={onLinksMenuClose}
                slotProps={{
                    paper: {
                        sx: {
                            backgroundColor: '#2a2f35',
                            color: '#ffffff',
                            minWidth: 180,
                            '& .MuiMenuItem-root': {
                                color: '#ffffff',
                                '&:hover': {
                                    backgroundColor: '#3a3f45'
                                }
                            },
                            '& .MuiListItemText-primary': {
                                color: '#ffffff !important'
                            }
                        }
                    }
                }}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
                <MenuItem
                    component={MuiLink}
                    href="https://junctionrelay-docs.onrender.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: '#ffffff', textDecoration: 'none' }}
                >
                    <ListItemIcon>
                        <DescriptionIcon sx={{ color: '#ff9800' }} fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                        primary="Documentation"
                        sx={{
                            '& .MuiListItemText-primary': {
                                color: '#ffffff !important'
                            }
                        }}
                    />
                </MenuItem>
                <MenuItem
                    component={MuiLink}
                    href="https://github.com/catapultcase/JunctionRelay"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: '#ffffff', textDecoration: 'none' }}
                >
                    <ListItemIcon>
                        <GitHubIcon sx={{ color: '#9e9e9e' }} fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                        primary="GitHub"
                        sx={{
                            '& .MuiListItemText-primary': {
                                color: '#ffffff !important'
                            }
                        }}
                    />
                </MenuItem>
                <MenuItem
                    component={MuiLink}
                    href="https://catapultcase.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: '#ffffff', textDecoration: 'none' }}
                >
                    <ListItemIcon>
                        <LanguageIcon sx={{ color: '#1976d2' }} fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                        primary="catapultcase.com"
                        sx={{
                            '& .MuiListItemText-primary': {
                                color: '#ffffff !important'
                            }
                        }}
                    />
                </MenuItem>
                <MenuItem
                    component={MuiLink}
                    href="https://junctionrelay.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: '#ffffff', textDecoration: 'none' }}
                >
                    <ListItemIcon>
                        <LanguageIcon sx={{ color: '#388e3c' }} fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                        primary="junctionrelay.com"
                        sx={{
                            '& .MuiListItemText-primary': {
                                color: '#ffffff !important'
                            }
                        }}
                    />
                </MenuItem>
            </Menu>

            {/* Theme Button */}
            <Tooltip title="Change Theme">
                <IconButton
                    onClick={onThemeChange}
                    data-navbar-link
                    sx={{
                        color: "#ffffff",
                        padding: "4px",
                        minWidth: "auto"
                    }}
                >
                    <PaletteIcon sx={{ color: "#ff9800" }} fontSize="small" />
                </IconButton>
            </Tooltip>

            {/* Cloud Sync Status */}
            {authMode === 'cloud' && (
                <Tooltip
                    title={`Local Backend: ${authStatus.backendAuthenticated ? 'Has Cloud Auth' : 'No Cloud Auth'}`}
                >
                    <IconButton
                        sx={{
                            color: "#ffffff",
                            padding: "4px",
                            minWidth: "auto",
                            cursor: "pointer"
                        }}
                    >
                        <CloudSyncIcon
                            sx={{
                                color: authStatus.backendAuthenticated ? "#4caf50" : "#f44336",
                                filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.7))"
                            }}
                            fontSize="small"
                        />
                    </IconButton>
                </Tooltip>
            )}

            {/* Settings */}
            <Tooltip title="Settings">
                <IconButton
                    component={Link}
                    to="/settings"
                    data-navbar-link
                    sx={{
                        color: "#ffffff",
                        padding: "4px",
                        minWidth: "auto"
                    }}
                >
                    <SettingsIcon sx={{ color: "#9c27b0" }} fontSize="small" />
                </IconButton>
            </Tooltip>

            {/* Local User Avatar */}
            {authMode === 'local' && authStatus.user && authStatus.isAuthenticated && (
                <Tooltip title={`Local user: ${authStatus.user}`}>
                    <IconButton
                        onClick={onUserMenuOpen}
                        sx={{
                            padding: "4px",
                            minWidth: "auto"
                        }}
                    >
                        <Avatar sx={{ width: 24, height: 24, bgcolor: '#7b8ea0' }}>
                            <PersonIcon sx={{ color: '#ffffff', fontSize: 16 }} />
                        </Avatar>
                    </IconButton>
                </Tooltip>
            )}

            {/* Cloud User Avatar */}
            {authMode === 'cloud' && authStatus.user && authStatus.isAuthenticated && (
                <Tooltip title={`Cloud user: ${authStatus.user}`}>
                    <IconButton
                        onClick={onUserMenuOpen}
                        sx={{
                            padding: "4px",
                            minWidth: "auto"
                        }}
                    >
                        <Avatar
                            src={authStatus.profileImageUrl || undefined}
                            sx={{ width: 24, height: 24, bgcolor: '#2196f3' }}
                        >
                            {!authStatus.profileImageUrl && (
                                <CloudIcon sx={{ color: '#ffffff', fontSize: 16 }} />
                            )}
                        </Avatar>
                    </IconButton>
                </Tooltip>
            )}

            {/* User Menu */}
            {authStatus.isAuthenticated && (
                <Menu
                    anchorEl={userMenuAnchor}
                    open={Boolean(userMenuAnchor)}
                    onClose={onUserMenuClose}
                    slotProps={{
                        paper: {
                            sx: {
                                backgroundColor: '#2a2f35',
                                color: '#ffffff',
                                minWidth: 160,
                                '& .MuiMenuItem-root': {
                                    color: '#ffffff',
                                    '&:hover': {
                                        backgroundColor: '#3a3f45'
                                    }
                                },
                                '& .MuiListItemText-primary': {
                                    color: '#ffffff !important'
                                }
                            }
                        }
                    }}
                    transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                    anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                >
                    <MenuItem onClick={onLogout} sx={{ color: '#ffffff' }}>
                        <ListItemIcon>
                            <LogoutIcon sx={{ color: '#ffffff' }} fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                            primary="Sign Out"
                            sx={{
                                '& .MuiListItemText-primary': {
                                    color: '#ffffff !important'
                                }
                            }}
                        />
                    </MenuItem>
                </Menu>
            )}
        </Box>
    );
};

export default NavbarActions;