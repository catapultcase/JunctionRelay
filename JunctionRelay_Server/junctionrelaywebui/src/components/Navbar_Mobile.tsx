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
    AppBar,
    Toolbar,
    Button,
    Box,
    Link as MuiLink,
    Typography,
    IconButton,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Divider
} from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import SettingsIcon from "@mui/icons-material/Settings";
import PaletteIcon from "@mui/icons-material/Palette";
import LanguageIcon from "@mui/icons-material/Language";
import LocalCafeIcon from "@mui/icons-material/LocalCafe";
import StarIcon from "@mui/icons-material/Star";
import GitHubIcon from "@mui/icons-material/GitHub";
import CloudIcon from "@mui/icons-material/Cloud";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import LogoutIcon from "@mui/icons-material/Logout";
import DescriptionIcon from '@mui/icons-material/Description';
import NavbarActions from "./Navbar_Actions";

interface NavbarMobileProps {
    navItems: Array<{ text: string; path: string; icon: React.ReactNode }>;
    mobileMenuOpen: boolean;
    onMenuToggle: () => void;
    onMenuClose: () => void;
    flags: any;
    version: string | null;
    authMode: string;
    authStatus: {
        isAuthenticated: boolean;
        user: string | null;
        hasValidLicense: boolean;
        licenseType: string;
        backendAuthenticated: boolean;
        profileImageUrl: string | null;
    };
    onLogout: () => void;
    onThemeChange: () => void;
    // Added for shared actions component
    userMenuAnchor: HTMLElement | null;
    linksMenuAnchor: HTMLElement | null;
    onUserMenuOpen: (event: React.MouseEvent<HTMLElement>) => void;
    onUserMenuClose: () => void;
    onLinksMenuOpen: (event: React.MouseEvent<HTMLElement>) => void;
    onLinksMenuClose: () => void;
    latest: string | null;
    isOutdated: boolean;
}

const NavbarMobile: React.FC<NavbarMobileProps> = ({
    navItems,
    mobileMenuOpen,
    onMenuToggle,
    onMenuClose,
    flags,
    version,
    authMode,
    authStatus,
    onLogout,
    onThemeChange,
    userMenuAnchor,
    linksMenuAnchor,
    onUserMenuOpen,
    onUserMenuClose,
    onLinksMenuOpen,
    onLinksMenuClose,
    latest,
    isOutdated
}) => {
    const location = useLocation();

    const getCurrentTabName = () => {
        const navItem = navItems.find(item => item.path === location.pathname);
        if (navItem) return navItem.text;
        if (location.pathname === '/settings') return 'Settings';
        return 'Menu';
    };

    return (
        <>
            <AppBar
                position="fixed"
                sx={{
                    backgroundColor: "#1b1f23",
                    backgroundImage: `
                        linear-gradient(180deg, #252a2f 0%, #1b1f23 100%),
                        repeating-linear-gradient(
                            0deg,
                            rgba(255,255,255,0.03) 0px,
                            rgba(255,255,255,0.03) 1px,
                            transparent 1px,
                            transparent 3px
                        )
                    `,
                    backgroundBlendMode: "overlay",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                    zIndex: (theme) => theme.zIndex.appBar
                }}
            >
                <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
                    {/* Left - Menu Button */}
                    <Button
                        onClick={onMenuToggle}
                        sx={{
                            color: "#ffffff !important",
                            textTransform: "none",
                            minWidth: "auto",
                            gap: 1
                        }}
                    >
                        <MenuIcon />
                        <Typography variant="body2" sx={{ color: "#ffffff !important" }}>
                            {getCurrentTabName()}
                        </Typography>
                    </Button>

                    {/* Right - Shared Actions Component */}
                    <NavbarActions
                        flags={flags}
                        version={version}
                        latest={latest}
                        isOutdated={isOutdated}
                        authMode={authMode}
                        authStatus={authStatus}
                        userMenuAnchor={userMenuAnchor}
                        linksMenuAnchor={linksMenuAnchor}
                        onUserMenuOpen={onUserMenuOpen}
                        onUserMenuClose={onUserMenuClose}
                        onLinksMenuOpen={onLinksMenuOpen}
                        onLinksMenuClose={onLinksMenuClose}
                        onLogout={onLogout}
                        onThemeChange={onThemeChange}
                    />
                </Toolbar>
            </AppBar>

            {/* Mobile Navigation Drawer */}
            <Drawer
                anchor="left"
                open={mobileMenuOpen}
                onClose={onMenuClose}
                sx={{
                    '& .MuiDrawer-paper': {
                        backgroundColor: '#1b1f23',
                        color: '#ffffff',
                        width: 280,
                        paddingTop: 2
                    },
                    '& .MuiBackdrop-root': {
                        backgroundColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }}
            >
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <MuiLink
                            component={Link}
                            to="/"
                            underline="none"
                            onClick={onMenuClose}
                            sx={{ display: "flex", alignItems: "center" }}
                        >
                            <Box
                                component="img"
                                src="/JunctionRelay.svg"
                                alt="JunctionRelay"
                                sx={{
                                    height: 32,
                                    width: 32,
                                    objectFit: "contain",
                                    borderRadius: "0%"
                                }}
                            />
                        </MuiLink>
                        <Typography variant="h6" sx={{ color: '#ffffff !important', fontWeight: 'bold' }}>
                            Navigation
                        </Typography>
                    </Box>
                    <IconButton onClick={onMenuClose} sx={{ color: '#ffffff !important' }}>
                        <CloseIcon />
                    </IconButton>
                </Box>

                <Divider sx={{ borderColor: '#3a3f45' }} />

                <List>
                    {navItems.map(({ text, path, icon }) => {
                        const isExternal = path.startsWith('http');
                        const isActive = location.pathname === path;
                        const isCloudTab = text === "Cloud Dashboard";

                        if (isExternal) {
                            return (
                                <ListItem key={text} disablePadding>
                                    <ListItemButton
                                        component={MuiLink}
                                        href={path}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={onMenuClose}
                                        sx={{
                                            color: isCloudTab ? '#64b5f6 !important' : '#ffffff !important',
                                            '&:hover': {
                                                backgroundColor: '#3a3f45',
                                                color: isCloudTab ? '#42a5f5 !important' : '#7b8ea0 !important'
                                            },
                                            fontWeight: isCloudTab ? 'bold' : 'normal'
                                        }}
                                    >
                                        <ListItemIcon sx={{ color: 'inherit !important', minWidth: 40 }}>
                                            {icon}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={text}
                                            sx={{
                                                '& .MuiListItemText-primary': {
                                                    color: 'inherit !important',
                                                    fontWeight: 'inherit'
                                                }
                                            }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            );
                        }

                        return (
                            <ListItem key={text} disablePadding>
                                <ListItemButton
                                    component={Link}
                                    to={path}
                                    onClick={onMenuClose}
                                    sx={{
                                        color: isActive ? '#7b8ea0 !important' : '#ffffff !important',
                                        backgroundColor: isActive ? 'rgba(123, 142, 160, 0.1)' : 'transparent',
                                        '&:hover': {
                                            backgroundColor: '#3a3f45'
                                        },
                                        fontWeight: isActive ? 600 : 400
                                    }}
                                >
                                    <ListItemIcon sx={{ color: 'inherit !important', minWidth: 40 }}>
                                        {icon}
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={text}
                                        sx={{
                                            '& .MuiListItemText-primary': {
                                                color: 'inherit !important',
                                                fontWeight: 'inherit'
                                            }
                                        }}
                                    />
                                </ListItemButton>
                            </ListItem>
                        );
                    })}
                </List>

                <Divider sx={{ borderColor: '#3a3f45', my: 2 }} />

                <List>
                    <ListItem disablePadding>
                        <ListItemButton
                            component={MuiLink}
                            href="https://junctionrelay-docs.onrender.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={onMenuClose}
                            sx={{
                                color: '#ffffff !important',
                                textDecoration: 'none',
                                '&:hover': {
                                    backgroundColor: '#3a3f45'
                                }
                            }}
                        >
                            <ListItemIcon sx={{ color: '#ff9800 !important', minWidth: 40 }}>
                                <DescriptionIcon />
                            </ListItemIcon>
                            <ListItemText
                                primary="Documentation"
                                sx={{
                                    '& .MuiListItemText-primary': {
                                        color: 'inherit !important'
                                    }
                                }}
                            />
                        </ListItemButton>
                    </ListItem>

                    <ListItem disablePadding>
                        <ListItemButton
                            component={Link}
                            to="/settings"
                            onClick={onMenuClose}
                            sx={{
                                color: location.pathname === '/settings' ? '#9c27b0 !important' : '#ffffff !important',
                                '&:hover': {
                                    backgroundColor: '#3a3f45'
                                }
                            }}
                        >
                            <ListItemIcon sx={{ color: 'inherit !important', minWidth: 40 }}>
                                <SettingsIcon />
                            </ListItemIcon>
                            <ListItemText
                                primary="Settings"
                                sx={{
                                    '& .MuiListItemText-primary': {
                                        color: 'inherit !important'
                                    }
                                }}
                            />
                        </ListItemButton>
                    </ListItem>

                    <ListItem disablePadding>
                        <ListItemButton
                            onClick={() => {
                                onThemeChange();
                                onMenuClose();
                            }}
                            sx={{
                                color: '#ffffff !important',
                                '&:hover': {
                                    backgroundColor: '#3a3f45'
                                }
                            }}
                        >
                            <ListItemIcon sx={{ color: '#ff9800 !important', minWidth: 40 }}>
                                <PaletteIcon />
                            </ListItemIcon>
                            <ListItemText
                                primary="Change Theme"
                                sx={{
                                    '& .MuiListItemText-primary': {
                                        color: 'inherit !important'
                                    }
                                }}
                            />
                        </ListItemButton>
                    </ListItem>

                    {authMode === 'cloud' && authStatus.isAuthenticated ? (
                        <ListItem disablePadding>
                            <ListItemButton
                                sx={{
                                    color: `${authStatus.hasValidLicense ? '#4caf50' : '#2196f3'} !important`,
                                    cursor: 'default',
                                    '&:hover': {
                                        backgroundColor: 'transparent'
                                    }
                                }}
                            >
                                <ListItemIcon sx={{ color: 'inherit !important', minWidth: 40 }}>
                                    <StarIcon />
                                </ListItemIcon>
                                <ListItemText
                                    primary={`${authStatus.licenseType} License`}
                                    sx={{
                                        '& .MuiListItemText-primary': {
                                            color: 'inherit !important',
                                            fontWeight: 'bold'
                                        }
                                    }}
                                />
                            </ListItemButton>
                        </ListItem>
                    ) : (
                        <ListItem disablePadding>
                            <ListItemButton
                                component={MuiLink}
                                href="https://buymeacoffee.com/catapultcase"
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={onMenuClose}
                                sx={{
                                    color: '#fdd835 !important',
                                    '&:hover': {
                                        backgroundColor: '#3a3f45'
                                    }
                                }}
                            >
                                <ListItemIcon sx={{ color: 'inherit !important', minWidth: 40 }}>
                                    <LocalCafeIcon />
                                </ListItemIcon>
                                <ListItemText
                                    primary="Buy me a coffee"
                                    sx={{
                                        '& .MuiListItemText-primary': {
                                            color: 'inherit !important'
                                        }
                                    }}
                                />
                            </ListItemButton>
                        </ListItem>
                    )}

                    {authStatus.isAuthenticated && (
                        <ListItem disablePadding>
                            <ListItemButton
                                onClick={() => {
                                    onLogout();
                                    onMenuClose();
                                }}
                                sx={{
                                    color: '#f44336 !important',
                                    '&:hover': {
                                        backgroundColor: '#3a3f45'
                                    }
                                }}
                            >
                                <ListItemIcon sx={{ color: 'inherit !important', minWidth: 40 }}>
                                    <LogoutIcon />
                                </ListItemIcon>
                                <ListItemText
                                    primary="Sign Out"
                                    sx={{
                                        '& .MuiListItemText-primary': {
                                            color: 'inherit !important'
                                        }
                                    }}
                                />
                            </ListItemButton>
                        </ListItem>
                    )}
                </List>

                <Box sx={{ mt: 'auto', p: 2 }}>
                    <Divider sx={{ borderColor: '#3a3f45', mb: 2 }} />

                    {flags?.top_bar_show_current_version === 'true' && version && (
                        <Typography variant="caption" sx={{ color: '#9e9e9e !important', display: 'block', mb: 1 }}>
                            Version: {version}
                        </Typography>
                    )}

                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
                        <IconButton
                            component={MuiLink}
                            href="https://github.com/catapultcase/JunctionRelay"
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ color: '#9e9e9e !important' }}
                        >
                            <GitHubIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                            component={MuiLink}
                            href="https://catapultcase.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ color: '#1976d2 !important' }}
                        >
                            <LanguageIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                            component={MuiLink}
                            href="https://junctionrelay.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ color: '#388e3c !important' }}
                        >
                            <LanguageIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Box>
            </Drawer>
        </>
    );
};

export default NavbarMobile;
