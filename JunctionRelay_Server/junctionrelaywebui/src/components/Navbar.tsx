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

import { useState, useEffect, useCallback } from "react";
import {
    AppBar,
    Toolbar,
    Button,
    Box,
    Link as MuiLink,
    Tooltip,
    Typography,
    Avatar,
    IconButton,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText
} from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import SettingsIcon from "@mui/icons-material/Settings";
import PaletteIcon from "@mui/icons-material/Palette";
import LanguageIcon from "@mui/icons-material/Language";
import LocalCafeIcon from "@mui/icons-material/LocalCafe";
import StarIcon from "@mui/icons-material/Star";
import GitHubIcon from "@mui/icons-material/GitHub";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import CloudIcon from "@mui/icons-material/Cloud";
import PersonIcon from "@mui/icons-material/Person";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LogoutIcon from "@mui/icons-material/Logout";
import { useThemeContext } from "../context/ThemeContext";
import { useAppVersion } from "../hooks/useAppVersion";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useAuth } from "auth/AuthContext";

const LOCAL_STORAGE_KEY = "junctionrelay_navbar_collapsed";

const Navbar = () => {
    const location = useLocation();
    const { cycleTheme } = useThemeContext();
    const { version, latest, isOutdated } = useAppVersion();
    const flags = useFeatureFlags();
    const { user } = useAuth();

    const [collapsed, setCollapsed] = useState(() => {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        return stored === "true";
    });

    const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
    const [authMode, setAuthMode] = useState<string>('none');
    const [cloudUser, setCloudUser] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [licenseStatus, setLicenseStatus] = useState<string>('Cloud');

    const checkAuthMode = useCallback(async () => {
        try {
            const modeResponse = await fetch('/api/auth/mode');
            if (modeResponse.ok) {
                const modeData = await modeResponse.json();
                const currentAuthMode = modeData.mode || 'none';
                setAuthMode(currentAuthMode);

                // Determine authentication status based on mode
                if (currentAuthMode === 'none') {
                    setIsAuthenticated(false);
                    setCloudUser(null);
                    setLicenseStatus('Cloud');
                    // No need to make any more API calls for 'none' mode
                    return;
                } else if (currentAuthMode === 'local') {
                    // For local auth, check if we have a user from AuthContext
                    setIsAuthenticated(!!user);
                    setCloudUser(null);
                    setLicenseStatus('Cloud');
                    // No need to make cloud API calls for 'local' mode
                    return;
                } else if (currentAuthMode === 'cloud') {
                    // For cloud auth, check proxy token and cloud user
                    const proxyToken = localStorage.getItem('cloud_proxy_token');
                    const storedCloudUser = localStorage.getItem('junctionrelay_cloud_user');

                    if (proxyToken && storedCloudUser) {
                        setCloudUser(storedCloudUser);
                        setIsAuthenticated(true);
                        
                        // Only make user-info call for authenticated cloud users
                        try {
                            const userInfoResponse = await fetch('/api/cloud-auth/user-info', {
                                headers: {
                                    'Authorization': `Bearer ${proxyToken}`
                                }
                            });
                            
                            if (userInfoResponse.ok) {
                                const userInfoData = await userInfoResponse.json();
                                
                                // Check hasValidLicense field like the Settings component does
                                const hasValidLicense = userInfoData.hasValidLicense;
                                setLicenseStatus(hasValidLicense ? 'Pro' : 'Cloud');
                            } else {
                                console.warn('User info endpoint returned:', userInfoResponse.status);
                                setLicenseStatus('Cloud');
                            }
                        } catch (error) {
                            console.error('Error fetching user info:', error);
                            setLicenseStatus('Cloud');
                        }
                    } else {
                        setCloudUser(null);
                        setIsAuthenticated(false);
                        setLicenseStatus('Cloud');
                    }
                }
            } else {
                // Fallback to 'none' if we can't determine auth mode
                setAuthMode('none');
                setIsAuthenticated(false);
                setCloudUser(null);
                setLicenseStatus('Cloud');
            }
        } catch (error) {
            console.error('Error checking auth mode:', error);
            setAuthMode('none');
            setIsAuthenticated(false);
            setCloudUser(null);
            setLicenseStatus('Cloud');
        }
    }, [user]);

    // Check auth mode and user status
    useEffect(() => {
        checkAuthMode();
    }, [checkAuthMode]); // Re-run when user from AuthContext changes

    // Listen for auth changes
    useEffect(() => {
        const handleAuthChange = () => {
            // Always re-check auth mode when auth changes - no conditions needed
            checkAuthMode();
        };

        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === 'cloud_proxy_token' ||
                event.key === 'junctionrelay_cloud_user' ||
                event.key === 'junctionrelay_token') {
                handleAuthChange();
            }
        };

        window.addEventListener('auth-changed', handleAuthChange);
        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('auth-changed', handleAuthChange);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [user]);

    const handleToggleCollapse = () => {
        const newState = !collapsed;
        setCollapsed(newState);
        localStorage.setItem(LOCAL_STORAGE_KEY, newState.toString());
    };

    const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        setUserMenuAnchor(event.currentTarget);
    };

    const handleUserMenuClose = () => {
        setUserMenuAnchor(null);
    };

    const handleLogout = () => {
        // Clear local auth token
        localStorage.removeItem('junctionrelay_token');

        // Clear cloud auth tokens
        localStorage.removeItem('cloud_proxy_token');
        localStorage.removeItem('junctionrelay_cloud_token');
        localStorage.removeItem('junctionrelay_cloud_user');

        // Dispatch auth change event to trigger re-authentication
        window.dispatchEvent(new CustomEvent('auth-changed'));

        // Close menu
        handleUserMenuClose();

        // Optionally reload the page to ensure clean state
        window.location.reload();
    };

    const navItems = [
        { text: "Dashboard", path: "/" },
        { text: "Junctions", path: "/junctions" },
        { text: "Devices", path: "/devices" },
        { text: "Services", path: "/services" },
        { text: "Collectors", path: "/collectors" },
        { text: "Payloads", path: "/payloads" },
    ];

    if (flags?.host_charts) {
        navItems.push({ text: "Host Charts", path: "/hostcharts" });
    }

    return (
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
                <Box sx={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <MuiLink
                        component={Link}
                        to="/"
                        underline="none"
                        data-navbar-link
                        sx={{ display: "flex", alignItems: "center" }}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 40,
                                height: 40,
                                borderRadius: "50%",
                                backgroundColor: "#ffffff",
                                color: "#000000",
                                fontWeight: 700,
                                fontSize: "0.9rem",
                                fontFamily: "monospace",
                                letterSpacing: "0.5px"
                            }}
                        >
                            JR
                        </Box>
                    </MuiLink>

                    <Box sx={{ display: "flex", gap: 2 }}>
                        {navItems.map(({ text, path }) => (
                            <Button
                                key={text}
                                component={Link}
                                to={path}
                                data-navbar-link
                                sx={{
                                    color: "#ffffff",
                                    borderBottom:
                                        location.pathname === path ? "2px solid #7b8ea0" : "2px solid transparent",
                                    borderRadius: 0,
                                    fontWeight: location.pathname === path ? 600 : 400,
                                    textTransform: "none",
                                    transition: "color 0.3s, border-bottom-color 0.3s",
                                    "&:hover": {
                                        color: "#7b8ea0",
                                        borderBottom: "2px solid #7b8ea0"
                                    },
                                    "& a": {
                                        color: "inherit !important",
                                        textDecoration: "none !important"
                                    }
                                }}
                            >
                                {text}
                            </Button>
                        ))}
                    </Box>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Tooltip title={collapsed ? "Expand" : "Collapse"}>
                        <IconButton
                            onClick={handleToggleCollapse}
                            sx={{
                                color: "#ffffff",
                                padding: "4px",
                                minWidth: "auto"
                            }}
                        >
                            {collapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
                        </IconButton>
                    </Tooltip>

                    {/* Show "Buy me a coffee" for non-cloud users or license status for cloud users */}
                    {authMode === 'cloud' && isAuthenticated ? (
                        <Tooltip title={`Current License: ${licenseStatus} License`}>
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
                                        color: licenseStatus === 'Pro' ? "#4caf50" : "#2196f3",
                                        filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.7))"
                                    }}
                                    fontSize="small"
                                />
                                <Box
                                    component="span"
                                    sx={{
                                        ml: 0.5,
                                        fontSize: "0.875rem",
                                        color: licenseStatus === 'Pro' ? "#4caf50" : "#2196f3",
                                        textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
                                        fontWeight: "bold"
                                    }}
                                >
                                    {collapsed ? `${licenseStatus} License` : `${licenseStatus} License`}
                                </Box>
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
                                {!collapsed && (
                                    <Box
                                        component="span"
                                        sx={{
                                            ml: 0.5,
                                            fontSize: "0.875rem",
                                            color: "#fdd835",
                                            textShadow: "1px 1px 2px rgba(0,0,0,0.8)"
                                        }}
                                    >
                                        Buy me a coffee
                                    </Box>
                                )}
                            </IconButton>
                        </Tooltip>
                    )}

                    {/* Show version info only for cloud users, or GitHub link for others */}
                    {authMode === 'cloud' && isAuthenticated ? (
                        <Tooltip title="GitHub Repository">
                            <IconButton
                                component={MuiLink}
                                href="https://github.com/catapultcase/JunctionRelay"
                                target="_blank"
                                rel="noopener noreferrer"
                                data-navbar-link
                                sx={{
                                    color: "#ffffff",
                                    padding: "4px",
                                    minWidth: "auto"
                                }}
                            >
                                {isOutdated ? (
                                    <WarningAmberIcon sx={{ color: "#ff9800" }} fontSize="small" />
                                ) : (
                                    <GitHubIcon sx={{ color: "#4caf50" }} fontSize="small" />
                                )}
                                <Box
                                    component="span"
                                    sx={{
                                        ml: 0.5,
                                        fontSize: "0.875rem"
                                    }}
                                >
                                    v{version}
                                </Box>
                            </IconButton>
                        </Tooltip>
                    ) : (
                        <Tooltip title="GitHub Repository">
                            <IconButton
                                component={MuiLink}
                                href="https://github.com/catapultcase/JunctionRelay"
                                target="_blank"
                                rel="noopener noreferrer"
                                data-navbar-link
                                sx={{
                                    color: "#ffffff",
                                    padding: "4px",
                                    minWidth: "auto"
                                }}
                            >
                                <GitHubIcon sx={{ color: "#ffffff" }} fontSize="small" />
                                {!collapsed && (
                                    <Box
                                        component="span"
                                        sx={{
                                            ml: 0.5,
                                            fontSize: "0.875rem"
                                        }}
                                    >
                                        GitHub
                                    </Box>
                                )}
                            </IconButton>
                        </Tooltip>
                    )}

                    <Tooltip title="catapultcase.com">
                        <IconButton
                            component={MuiLink}
                            href="https://catapultcase.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            data-navbar-link
                            sx={{
                                color: "#ffffff",
                                padding: "4px",
                                minWidth: "auto"
                            }}
                        >
                            <LanguageIcon sx={{ color: "#1976d2" }} fontSize="small" />
                            {!collapsed && (
                                <Box
                                    component="span"
                                    sx={{
                                        ml: 0.5,
                                        fontSize: "0.875rem"
                                    }}
                                >
                                    catapultcase.com
                                </Box>
                            )}
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="junctionrelay.com">
                        <IconButton
                            component={MuiLink}
                            href="https://junctionrelay.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            data-navbar-link
                            sx={{
                                color: "#ffffff",
                                padding: "4px",
                                minWidth: "auto"
                            }}
                        >
                            <LanguageIcon sx={{ color: "#388e3c" }} fontSize="small" />
                            {!collapsed && (
                                <Box
                                    component="span"
                                    sx={{
                                        ml: 0.5,
                                        fontSize: "0.875rem"
                                    }}
                                >
                                    junctionrelay.com
                                </Box>
                            )}
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Change Theme">
                        <IconButton
                            onClick={cycleTheme}
                            data-navbar-link
                            sx={{
                                color: "#ffffff",
                                padding: "4px",
                                minWidth: "auto"
                            }}
                        >
                            <PaletteIcon sx={{ color: "#ff9800" }} />
                            {!collapsed && (
                                <Box
                                    component="span"
                                    sx={{
                                        ml: 0.5,
                                        fontSize: "0.875rem",
                                        textTransform: "none"
                                    }}
                                >
                                    Theme
                                </Box>
                            )}
                        </IconButton>
                    </Tooltip>

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
                            <SettingsIcon sx={{ color: "#9c27b0" }} />
                            {!collapsed && (
                                <Box
                                    component="span"
                                    sx={{
                                        ml: 0.5,
                                        fontSize: "0.875rem",
                                        textTransform: "none"
                                    }}
                                >
                                    Settings
                                </Box>
                            )}
                        </IconButton>
                    </Tooltip>

                    {/* Show user avatar based on auth mode */}
                    {authMode === 'local' && user && isAuthenticated && (
                        <>
                            <Tooltip title="Local user - click for menu">
                                <IconButton
                                    onClick={handleUserMenuOpen}
                                    sx={{
                                        padding: "4px",
                                        minWidth: "auto"
                                    }}
                                >
                                    <Avatar sx={{ width: 24, height: 24, bgcolor: '#7b8ea0' }}>
                                        <PersonIcon sx={{ color: '#ffffff', fontSize: 16 }} />
                                    </Avatar>
                                    {!collapsed && (
                                        <Typography variant="body2" sx={{ color: '#ffffff', fontSize: '0.875rem', fontWeight: 500, ml: 1 }}>
                                            {user.username}
                                        </Typography>
                                    )}
                                </IconButton>
                            </Tooltip>
                        </>
                    )}

                    {authMode === 'cloud' && cloudUser && isAuthenticated && (
                        <>
                            <Tooltip title="JunctionRelay Cloud user - click for menu">
                                <IconButton
                                    onClick={handleUserMenuOpen}
                                    sx={{
                                        padding: "4px",
                                        minWidth: "auto"
                                    }}
                                >
                                    <Avatar sx={{ width: 24, height: 24, bgcolor: '#2196f3' }}>
                                        <CloudIcon sx={{ color: '#ffffff', fontSize: 16 }} />
                                    </Avatar>
                                    {!collapsed && (
                                        <Typography variant="body2" sx={{ color: '#ffffff', fontSize: '0.875rem', fontWeight: 500, ml: 1 }}>
                                            {cloudUser}
                                        </Typography>
                                    )}
                                </IconButton>
                            </Tooltip>
                        </>
                    )}

                    {/* User Menu */}
                    {isAuthenticated && (
                        <Menu
                            anchorEl={userMenuAnchor}
                            open={Boolean(userMenuAnchor)}
                            onClose={handleUserMenuClose}
                            PaperProps={{
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
                            }}
                            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                        >
                            <MenuItem onClick={handleLogout} sx={{ color: '#ffffff' }}>
                                <ListItemIcon>
                                    <LogoutIcon sx={{ color: '#ffffff' }} fontSize="small" />
                                </ListItemIcon>
                                <ListItemText
                                    primary="Logout"
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
            </Toolbar>
        </AppBar>
    );
};

export default Navbar;