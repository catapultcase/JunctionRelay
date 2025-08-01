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
    ListItemText,
    Chip,
    useTheme,
    useMediaQuery,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    Divider
} from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import SettingsIcon from "@mui/icons-material/Settings";
import PaletteIcon from "@mui/icons-material/Palette";
import LanguageIcon from "@mui/icons-material/Language";
import LocalCafeIcon from "@mui/icons-material/LocalCafe";
import StarIcon from "@mui/icons-material/Star";
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import GitHubIcon from "@mui/icons-material/GitHub";
import CloudIcon from "@mui/icons-material/Cloud";
import PersonIcon from "@mui/icons-material/Person";
import PhotoIcon from '@mui/icons-material/Photo';
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LogoutIcon from "@mui/icons-material/Logout";
import UpdateIcon from "@mui/icons-material/Update";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import DashboardIcon from "@mui/icons-material/Dashboard";
import DevicesIcon from "@mui/icons-material/Devices";
import ServiceIcon from "@mui/icons-material/MiscellaneousServices";
import DataObjectIcon from "@mui/icons-material/DataObject";
import PayloadIcon from "@mui/icons-material/Layers";
import ChartIcon from "@mui/icons-material/BarChart";
import JunctionIcon from "@mui/icons-material/Hub";
import StreamIcon from "@mui/icons-material/Stream";
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
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md')); // Hide on tablets and phones

    const [collapsed, setCollapsed] = useState(() => {
        // Always collapsed on mobile
        if (isMobile) return true;

        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        return stored === "true" || stored === null; // Default to collapsed if no stored preference
    });

    const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [authMode, setAuthMode] = useState<string>('none');
    const [cloudUser, setCloudUser] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [licenseStatus, setLicenseStatus] = useState<string>('Cloud');
    const [useMobileNav, setUseMobileNav] = useState(false);
    const [backendCloudAuth, setBackendCloudAuth] = useState<'authenticated' | 'unauthenticated' | 'checking'>('checking');

    // Listen for dynamic flag changes
    useEffect(() => {
        const handleFlagsChanged = async () => {
            try {
                const flagsResponse = await fetch('/api/settings/flags');
                if (flagsResponse.ok) {
                    const flagsData = await flagsResponse.json();
                    setUseMobileNav(flagsData.mobile_navigation_on_desktop === 'true');
                }
            } catch (error) {
                console.warn('Could not fetch updated mobile navigation flag:', error);
            }
        };

        // Listen for settings changes
        window.addEventListener('settings-changed', handleFlagsChanged);
        window.addEventListener('flags-changed', handleFlagsChanged);

        return () => {
            window.removeEventListener('settings-changed', handleFlagsChanged);
            window.removeEventListener('flags-changed', handleFlagsChanged);
        };
    }, []);

    // Force collapsed state on mobile OR when mobile nav flag is enabled
    const isCollapsed = isMobile || collapsed || useMobileNav;
    const shouldShowDrawer = isMobile || useMobileNav;

    // FIXED: Removed checkAuthMode from useCallback dependencies that could cause loops
    const checkAuthMode = useCallback(async () => {
        try {
            const modeResponse = await fetch('/api/auth/mode');
            if (modeResponse.ok) {
                const modeData = await modeResponse.json();
                const currentAuthMode = modeData.mode || 'none';
                setAuthMode(currentAuthMode);

                // Check mobile navigation flag
                try {
                    const flagsResponse = await fetch('/api/settings/flags');
                    if (flagsResponse.ok) {
                        const flagsData = await flagsResponse.json();
                        setUseMobileNav(flagsData.mobile_navigation_on_desktop === 'true');
                    }
                } catch (error) {
                    console.warn('Could not fetch mobile navigation flag:', error);
                }

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
    }, []); // FIXED: Empty dependency array to prevent infinite loops

    // Check backend cloud auth status
    const checkBackendCloudAuth = useCallback(async () => {
        if (authMode !== 'cloud') {
            setBackendCloudAuth('unauthenticated');
            return;
        }
        try {
            const response = await fetch('/api/cloud-auth/backendstatus');
            if (response.ok) {
                const data = await response.json();
                setBackendCloudAuth(data.isAuthenticated ? 'authenticated' : 'unauthenticated');
            } else {
                setBackendCloudAuth('unauthenticated');
            }
        } catch (error) {
            console.error('Error checking backend cloud auth status:', error);
            setBackendCloudAuth('unauthenticated');
        }
    }, [authMode]);

    // FIXED: Add this effect for periodic status checking - ONLY for cloud mode
    useEffect(() => {
        // Only run when in cloud mode
        if (authMode !== 'cloud') {
            setBackendCloudAuth('unauthenticated');
            return;
        }

        // Initial check
        checkBackendCloudAuth();

        // Set up interval for periodic checks (every minute) - only in cloud mode
        const interval = setInterval(checkBackendCloudAuth, 60000);

        // Listen for auth events to check immediately
        const handleAuthEvent = () => {
            setTimeout(checkBackendCloudAuth, 1000); // Small delay to let auth changes settle
        };

        window.addEventListener('auth-changed', handleAuthEvent);
        window.addEventListener('storage', handleAuthEvent);

        return () => {
            clearInterval(interval);
            window.removeEventListener('auth-changed', handleAuthEvent);
            window.removeEventListener('storage', handleAuthEvent);
        };
    }, [authMode, checkBackendCloudAuth]); // FIXED: Keep necessary dependencies

    // FIXED: Check auth mode and user status - only depend on user, not checkAuthMode
    useEffect(() => {
        checkAuthMode();
    }, [user]); // FIXED: Only re-run when user changes, not when checkAuthMode changes

    // FIXED: Listen for auth changes - remove checkAuthMode dependency
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
    }, []); // FIXED: Empty dependency array - no need to depend on checkAuthMode

    const handleToggleCollapse = () => {
        // Don't allow toggle on mobile or when using mobile nav flag
        if (isMobile || useMobileNav) return;

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

    const handleMobileMenuToggle = () => {
        setMobileMenuOpen(!mobileMenuOpen);
    };

    const handleMobileMenuClose = () => {
        setMobileMenuOpen(false);
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
        { text: "Dashboard", path: "/", icon: <DashboardIcon /> },
        { text: "Streams", path: "/streams", icon: <StreamIcon /> },
        { text: "Junctions", path: "/junctions", icon: <JunctionIcon /> },
        { text: "Devices", path: "/devices", icon: <DevicesIcon /> },
        { text: "Services", path: "/services", icon: <ServiceIcon /> },
        { text: "Collectors", path: "/collectors", icon: <DataObjectIcon /> },
        { text: "FrameEngine", path: "/frameengine", icon: <PhotoIcon /> },
        { text: "Payloads", path: "/payloads", icon: <PayloadIcon /> },
    ];

    if (flags?.top_bar_show_host_charts) {
        navItems.push({ text: "Host Charts", path: "/hostcharts", icon: <ChartIcon /> });
    }

    // Add Cloud Dashboard for cloud authenticated users - moved to last
    if (authMode === 'cloud' && isAuthenticated) {
        navItems.push({ text: "Cloud Dashboard", path: "https://dashboard.junctionrelay.com/", icon: <CloudIcon /> });
    }

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
                    <Box sx={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {/* Show JR logo only on desktop */}
                        {!shouldShowDrawer && (
                            <MuiLink
                                component={Link}
                                to="/"
                                underline="none"
                                data-navbar-link
                                sx={{ display: "flex", alignItems: "center" }}
                            >
                                <Box
                                    component="img"
                                    src="../JunctionRelay.svg" // replace with actual path (e.g. /assets/logo.svg)
                                    alt="JunctionRelay"
                                    sx={{
                                        height: 40,
                                        width: 40,
                                        objectFit: "contain",
                                        borderRadius: "0%"
                                    }}
                                />
                            </MuiLink>
                        )}

                        {/* Desktop Navigation */}
                        {!shouldShowDrawer && (
                            <Box sx={{ display: "flex", gap: 2 }}>
                                {navItems.map(({ text, path }) => {
                                    // Handle external links for Cloud Dashboard
                                    const isExternal = path.startsWith('http');
                                    const isCloudTab = text === "Cloud Dashboard";

                                    if (isExternal) {
                                        return (
                                            <Button
                                                key={text}
                                                component={MuiLink}
                                                href={path}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                data-navbar-link
                                                sx={{
                                                    borderBottom: "2px solid transparent",
                                                    borderRadius: 0,
                                                    fontWeight: 400,
                                                    textTransform: "none",
                                                    transition: "color 0.3s, border-bottom-color 0.3s",
                                                    // Direct color styling based on isCloudTab
                                                    ...(isCloudTab ? {
                                                        color: "#64b5f6 !important",
                                                        "&:hover": {
                                                            color: "#42a5f5 !important",
                                                            borderBottom: "2px solid #42a5f5"
                                                        },
                                                        "& .MuiButton-label": {
                                                            color: "#64b5f6 !important"
                                                        }
                                                    } : {
                                                        color: "#ffffff",
                                                        "&:hover": {
                                                            color: "#7b8ea0",
                                                            borderBottom: "2px solid #7b8ea0"
                                                        }
                                                    }),
                                                    "& a": {
                                                        color: "inherit !important",
                                                        textDecoration: "none !important"
                                                    }
                                                }}
                                            >
                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 0.5,
                                                        color: isCloudTab ? "#64b5f6 !important" : "inherit"
                                                    }}
                                                >
                                                    {isCloudTab && (
                                                        <CloudIcon
                                                            sx={{
                                                                color: "#64b5f6 !important",
                                                                fontSize: "1.1rem"
                                                            }}
                                                        />
                                                    )}
                                                    <Box
                                                        component="span"
                                                        sx={{
                                                            color: isCloudTab ? "#64b5f6 !important" : "inherit",
                                                            fontWeight: isCloudTab ? "bold" : "inherit"
                                                        }}
                                                    >
                                                        {text}
                                                    </Box>
                                                </Box>
                                            </Button>
                                        );
                                    }

                                    return (
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
                                    );
                                })}
                            </Box>
                        )}

                        {/* Mobile Menu Button */}
                        {shouldShowDrawer && (
                            <Button
                                onClick={handleMobileMenuToggle}
                                sx={{
                                    color: "#ffffff !important",
                                    textTransform: "none",
                                    minWidth: "auto",
                                    gap: 1
                                }}
                            >
                                <MenuIcon />
                                <Typography variant="body2" sx={{ color: "#ffffff !important" }}>
                                    {(() => {
                                        // Check main nav items first
                                        const navItem = navItems.find(item => item.path === location.pathname);
                                        if (navItem) return navItem.text;

                                        // Handle special cases not in navItems
                                        if (location.pathname === '/settings') return 'Settings';

                                        // Add more special cases as needed
                                        // if (location.pathname === '/profile') return 'Profile';

                                        // Fallback to Menu
                                        return 'Menu';
                                    })()}
                                </Typography>
                            </Button>
                        )}
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {/* Version display - always on the far left when enabled */}
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

                        {/* Show upgrade notification when version is outdated - ONLY for cloud users */}
                        {authMode === 'cloud' && isOutdated && version && latest && (
                            <Tooltip title={`Update available: ${latest} (current: ${version})`}>
                                {isCollapsed ? (
                                    <IconButton
                                        sx={{
                                            color: "#ff9800",
                                            padding: "4px",
                                            minWidth: "auto",
                                            cursor: "default"
                                        }}
                                    >
                                        <UpdateIcon fontSize="small" />
                                    </IconButton>
                                ) : (
                                    <Chip
                                        icon={<UpdateIcon />}
                                        label="Update Available"
                                        size="small"
                                        sx={{
                                            backgroundColor: "#ff9800",
                                            color: "#ffffff",
                                            fontWeight: "bold",
                                            fontSize: "0.75rem",
                                            height: "28px",
                                            "& .MuiChip-icon": {
                                                color: "#ffffff"
                                            }
                                        }}
                                    />
                                )}
                            </Tooltip>
                        )}

                        {/* Only show collapse/expand button on desktop when NOT using mobile nav flag */}
                        {!isMobile && !useMobileNav && (
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
                        )}

                        {/* Show "Buy me a coffee" for non-cloud users or license status for cloud users */}
                        {authMode === 'cloud' && isAuthenticated ? (
                            <Tooltip title={`Current License: ${licenseStatus} License`}>
                                <IconButton
                                    sx={{
                                        color: "#ffffff",
                                        padding: "4px",
                                        minWidth: "auto",
                                        cursor: "default",
                                        display: shouldShowDrawer ? 'none' : 'flex' // Hide when using drawer
                                    }}
                                >
                                    <StarIcon
                                        sx={{
                                            color: licenseStatus === 'Pro' ? "#4caf50" : "#2196f3",
                                            filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.7))"
                                        }}
                                        fontSize="small"
                                    />
                                    {!isCollapsed && (
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
                                            {licenseStatus} License
                                        </Box>
                                    )}
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
                                        minWidth: "auto",
                                        display: shouldShowDrawer ? 'none' : 'flex' // Hide when using drawer
                                    }}
                                >
                                    <LocalCafeIcon
                                        sx={{
                                            color: "#fdd835",
                                            filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.7))"
                                        }}
                                        fontSize="small"
                                    />
                                    {!isCollapsed && (
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

                        {/* GitHub link - clean without version */}
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
                                    minWidth: "auto",
                                    display: isMobile ? 'none' : 'flex' // Hide on mobile
                                }}
                            >
                                <GitHubIcon sx={{ color: "#9e9e9e" }} fontSize="small" />
                                {!isCollapsed && (
                                    <Box
                                        component="span"
                                        sx={{
                                            ml: 0.5,
                                            fontSize: "0.875rem",
                                            color: "#ffffff !important"
                                        }}
                                    >
                                        GitHub
                                    </Box>
                                )}
                            </IconButton>
                        </Tooltip>

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
                                    minWidth: "auto",
                                    display: shouldShowDrawer ? 'none' : 'flex' // Hide when using drawer
                                }}
                            >
                                <LanguageIcon sx={{ color: "#1976d2" }} fontSize="small" />
                                {!isCollapsed && (
                                    <Box
                                        component="span"
                                        sx={{
                                            ml: 0.5,
                                            fontSize: "0.875rem",
                                            color: "#ffffff !important"
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
                                    minWidth: "auto",
                                    display: shouldShowDrawer ? 'none' : 'flex' // Hide when using drawer
                                }}
                            >
                                <LanguageIcon sx={{ color: "#388e3c" }} fontSize="small" />
                                {!isCollapsed && (
                                    <Box
                                        component="span"
                                        sx={{
                                            ml: 0.5,
                                            fontSize: "0.875rem",
                                            color: "#ffffff !important"
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
                                {!isCollapsed && (
                                    <Box
                                        component="span"
                                        sx={{
                                            ml: 0.5,
                                            fontSize: "0.875rem",
                                            textTransform: "none",
                                            color: "#ffffff !important"
                                        }}
                                    >
                                        Theme
                                    </Box>
                                )}
                            </IconButton>
                        </Tooltip>

                        {/* Only show backend auth status when in cloud mode */}
                        {authMode === 'cloud' && (
                            <Tooltip title={`Local Backend: ${backendCloudAuth === 'authenticated' ? 'Has Cloud Auth' : backendCloudAuth === 'checking' ? 'Checking...' : 'No Cloud Auth'}`}>
                                <IconButton
                                    sx={{
                                        color: "#ffffff",
                                        padding: "4px",
                                        minWidth: "auto",
                                        cursor: "default"
                                    }}
                                >
                                    <CloudSyncIcon
                                        sx={{
                                            color: backendCloudAuth === 'authenticated' ? "#4caf50" : backendCloudAuth === 'checking' ? "#ff9800" : "#f44336",
                                            filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.7))"
                                        }}
                                        fontSize="small"
                                    />
                                    {!isCollapsed && (
                                        <Box
                                            component="span"
                                            sx={{
                                                ml: 0.5,
                                                fontSize: "0.875rem",
                                                color: backendCloudAuth === 'authenticated' ? "#4caf50" : backendCloudAuth === 'checking' ? "#ff9800" : "#f44336",
                                                textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
                                                fontWeight: "bold"
                                            }}
                                        >
                                            {backendCloudAuth === 'authenticated' ? 'Backend Authenticated' : backendCloudAuth === 'checking' ? 'Checking...' : 'Backend Unauthenticated'}
                                        </Box>
                                    )}
                                </IconButton>
                            </Tooltip>
                        )}

                        <Tooltip title="Settings">
                            <IconButton
                                component={Link}
                                to="/settings"
                                data-navbar-link
                                sx={{
                                    color: "#ffffff",
                                    padding: "4px",
                                    minWidth: "auto"
                                    // Settings icon is always visible - no display condition
                                }}
                            >
                                <SettingsIcon sx={{ color: "#9c27b0" }} />
                                {!isCollapsed && (
                                    <Box
                                        component="span"
                                        sx={{
                                            ml: 0.5,
                                            fontSize: "0.875rem",
                                            textTransform: "none",
                                            color: "#ffffff !important"
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
                                        {!isCollapsed && (
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
                                        {!isCollapsed && (
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
                                <MenuItem onClick={handleLogout} sx={{ color: '#ffffff' }}>
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
                </Toolbar>
            </AppBar>

            {/* Mobile Navigation Drawer */}
            <Drawer
                anchor="left"
                open={mobileMenuOpen}
                onClose={handleMobileMenuClose}
                sx={{
                    '& .MuiDrawer-paper': {
                        backgroundColor: '#1b1f23', // Always dark like navbar
                        color: '#ffffff',
                        width: 280,
                        paddingTop: 2
                    },
                    '& .MuiBackdrop-root': {
                        backgroundColor: 'rgba(0, 0, 0, 0.5)' // Consistent backdrop
                    }
                }}
            >
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* JR Logo in mobile drawer */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <MuiLink
                            component={Link}
                            to="/"
                            underline="none"
                            onClick={handleMobileMenuClose}
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
                    <IconButton onClick={handleMobileMenuClose} sx={{ color: '#ffffff !important' }}>
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
                                        onClick={handleMobileMenuClose}
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
                                    onClick={handleMobileMenuClose}
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

                {/* Additional Mobile Menu Items */}
                <List>
                    <ListItem disablePadding>
                        <ListItemButton
                            component={Link}
                            to="/settings"
                            onClick={handleMobileMenuClose}
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
                                cycleTheme();
                                handleMobileMenuClose();
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

                    {/* Show license status or buy me a coffee in mobile menu */}
                    {authMode === 'cloud' && isAuthenticated ? (
                        <ListItem disablePadding>
                            <ListItemButton
                                sx={{
                                    color: `${licenseStatus === 'Pro' ? '#4caf50' : '#2196f3'} !important`,
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
                                    primary={`${licenseStatus} License`}
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
                                onClick={handleMobileMenuClose}
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

                    {/* Sign out option for authenticated users */}
                    {isAuthenticated && (
                        <ListItem disablePadding>
                            <ListItemButton
                                onClick={() => {
                                    handleLogout();
                                    handleMobileMenuClose();
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

                {/* Version info and external links at bottom */}
                <Box sx={{ mt: 'auto', p: 2 }}>
                    <Divider sx={{ borderColor: '#3a3f45', mb: 2 }} />

                    {/* Show version for ALL users when top_bar_show_current_version is true */}
                    {flags?.top_bar_show_current_version === 'true' && version && (
                        <Typography variant="caption" sx={{ color: '#9e9e9e !important', display: 'block', mb: 1 }}>
                            Version: {version}
                        </Typography>
                    )}

                    {/* External links */}
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

export default Navbar;