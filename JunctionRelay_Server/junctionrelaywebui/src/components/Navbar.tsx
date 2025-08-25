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
import LaunchIcon from '@mui/icons-material/Launch';
import DescriptionIcon from '@mui/icons-material/Description';
import { useThemeContext } from "../context/ThemeContext";
import { useAppVersion } from "../hooks/useAppVersion";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useAuth } from "auth/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { sendHealthReport } from "api";

const LOCAL_STORAGE_KEY = "junctionrelay_navbar_collapsed";

const Navbar = () => {
    const location = useLocation();
    const { cycleTheme } = useThemeContext();
    const { version, latest, isOutdated } = useAppVersion();
    const flags = useFeatureFlags();
    const { user } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { showSuccess, showError, showInfo, showWarning } = useNotifications();

    const [collapsed, setCollapsed] = useState(() => {
        if (isMobile) return true;
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        return stored === "true" || stored === null;
    });

    const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
    const [linksMenuAnchor, setLinksMenuAnchor] = useState<null | HTMLElement>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // SIMPLIFIED STATE - everything comes from unified status calls
    const [authMode, setAuthMode] = useState<string>('none');
    const [authStatus, setAuthStatus] = useState({
        isAuthenticated: false,
        user: null as string | null,
        hasValidLicense: false,
        licenseType: 'Cloud' as string,
        backendAuthenticated: false
    });
    const [useMobileNav, setUseMobileNav] = useState(false);

    // Check mobile navigation flag
    const checkMobileNavFlag = useCallback(async () => {
        try {
            const flagsResponse = await fetch('/api/settings/flags');
            if (flagsResponse.ok) {
                const flagsData = await flagsResponse.json();
                setUseMobileNav(flagsData.mobile_navigation_on_desktop === 'true');
            }
        } catch (error) {
            console.warn('Could not fetch mobile navigation flag:', error);
        }
    }, []);

    const checkAuthStatus = useCallback(async () => {
        try {
            console.log('[NAVBAR] Checking unified auth status...');

            const response = await fetch('/api/unified-auth/status');
            if (!response.ok) {
                console.warn('[NAVBAR] Failed to get unified auth status');
                setAuthMode('none');
                setAuthStatus({
                    isAuthenticated: false,
                    user: null,
                    hasValidLicense: false,
                    licenseType: 'Cloud',
                    backendAuthenticated: false
                });
                return;
            }

            const statusData = await response.json();
            console.log('[NAVBAR] Unified auth status:', statusData);

            // Set mode from server
            setAuthMode(statusData.authMode || 'none');

            // Update state
            setAuthStatus({
                isAuthenticated: statusData.isAuthenticated || false,
                user: statusData.user || statusData.currentUser || null,
                hasValidLicense: statusData.hasValidLicense || false,
                licenseType: statusData.licenseType ||
                    (statusData.authMode === 'local' ? 'Local' : 'Cloud'),
                backendAuthenticated: statusData.backendAuthenticated ??
                    statusData.isAuthenticated ?? false
            });

            // Check mobile nav flag (keep your existing logic)
            await checkMobileNavFlag();
        } catch (error) {
            console.error('[NAVBAR] Error checking unified auth status:', error);
            setAuthMode('none');
            setAuthStatus({
                isAuthenticated: false,
                user: null,
                hasValidLicense: false,
                licenseType: 'Cloud',
                backendAuthenticated: false
            });
        }
    }, [checkMobileNavFlag]);


    // Listen for dynamic flag changes
    useEffect(() => {
        const handleFlagsChanged = checkMobileNavFlag;
        window.addEventListener('settings-changed', handleFlagsChanged);
        window.addEventListener('flags-changed', handleFlagsChanged);
        return () => {
            window.removeEventListener('settings-changed', handleFlagsChanged);
            window.removeEventListener('flags-changed', handleFlagsChanged);
        };
    }, [checkMobileNavFlag]);

    // Force collapsed state on mobile OR when mobile nav flag is enabled
    const isCollapsed = isMobile || collapsed || useMobileNav;
    const shouldShowDrawer = isMobile || useMobileNav;

    // Check auth status on mount and when user changes
    useEffect(() => {
        checkAuthStatus();
    }, [user, checkAuthStatus]);

    // Listen for auth changes - simplified
    useEffect(() => {
        const handleAuthChange = () => {
            console.log('[NAVBAR] Auth change event detected');
            checkAuthStatus();
        };

        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === 'cloud_proxy_token' ||
                event.key === 'junctionrelay_cloud_user' ||
                event.key === 'junctionrelay_token') {
                console.log('[NAVBAR] Storage change detected for auth token');
                handleAuthChange();
            }
        };

        window.addEventListener('auth-changed', handleAuthChange);
        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('auth-changed', handleAuthChange);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [checkAuthStatus]);

    // REMOVED: All the individual polling intervals and complex auth checking
    // Now we just have one simple status check that calls the right endpoint

    const handleToggleCollapse = () => {
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

    const handleLinksMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        setLinksMenuAnchor(event.currentTarget);
    };

    const handleLinksMenuClose = () => {
        setLinksMenuAnchor(null);
    };

    const handleMobileMenuToggle = () => {
        setMobileMenuOpen(!mobileMenuOpen);
    };

    const handleMobileMenuClose = () => {
        setMobileMenuOpen(false);
    };

    const handleLogout = () => {
        localStorage.removeItem('junctionrelay_token');
        localStorage.removeItem('cloud_proxy_token');
        localStorage.removeItem('junctionrelay_cloud_token');
        localStorage.removeItem('junctionrelay_cloud_user');
        window.dispatchEvent(new CustomEvent('auth-changed'));
        handleUserMenuClose();
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    };

    const handleSendHealthReport = async () => {
        try {
            await sendHealthReport();
        } catch (error) {
            console.error('Health report failed:', error);
        }
    };

    const handleThemeChange = () => {
        cycleTheme();
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

    // Add Cloud Dashboard for cloud authenticated users
    if (authMode === 'cloud' && authStatus.isAuthenticated) {
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
                                    src="/JunctionRelay.svg"
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

                        {!shouldShowDrawer && (
                            <Box sx={{ display: "flex", gap: 2 }}>
                                {navItems.map(({ text, path }) => {
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
                                        const navItem = navItems.find(item => item.path === location.pathname);
                                        if (navItem) return navItem.text;
                                        if (location.pathname === '/settings') return 'Settings';
                                        return 'Menu';
                                    })()}
                                </Typography>
                            </Button>
                        )}
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {flags?.top_bar_show_current_version === 'true' && version && (
                            <Tooltip title={`Current Version: ${version}`}>
                                <Box
                                    sx={{
                                        display: "flex !important",
                                        alignItems: "center",
                                        color: "#ffffff",
                                        fontSize: "0.875rem",
                                        fontWeight: 500,
                                        padding: "4px 8px",
                                        borderRadius: "4px",
                                        backgroundColor: "rgba(255,255,255,0.1)",
                                        visibility: "visible !important",
                                        opacity: 1
                                    }}
                                >
                                    v{version}
                                </Box>
                            </Tooltip>
                        )}

                        {authMode === 'cloud' && isOutdated && version && latest && (
                            <Tooltip title={`Update available: ${latest} (current: ${version})`}>
                                {isCollapsed ? (
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
                                            cursor: "pointer",
                                            "& .MuiChip-icon": {
                                                color: "#ffffff"
                                            }
                                        }}
                                    />
                                )}
                            </Tooltip>
                        )}

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

                        {authMode === 'cloud' && authStatus.isAuthenticated ? (
                            <Tooltip title={`Current License: ${authStatus.licenseType} License`}>
                                <IconButton
                                    sx={{
                                        color: "#ffffff",
                                        padding: "4px",
                                        minWidth: "auto",
                                        cursor: "default",
                                        display: shouldShowDrawer ? 'none' : 'flex'
                                    }}
                                >
                                    <StarIcon
                                        sx={{
                                            color: authStatus.hasValidLicense ? "#4caf50" : "#2196f3",
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
                                                color: authStatus.hasValidLicense ? "#4caf50" : "#2196f3",
                                                textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
                                                fontWeight: "bold"
                                            }}
                                        >
                                            {authStatus.licenseType} License
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
                                        display: shouldShowDrawer ? 'none' : 'flex'
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

                        <Tooltip title="External Links">
                            <IconButton
                                onClick={handleLinksMenuOpen}
                                data-navbar-link
                                sx={{
                                    color: "#ffffff",
                                    padding: "4px",
                                    minWidth: "auto",
                                    display: shouldShowDrawer ? 'none' : 'flex'
                                }}
                            >
                                <LaunchIcon sx={{ color: "#4caf50" }} fontSize="small" />
                                {!isCollapsed && (
                                    <Box
                                        component="span"
                                        sx={{
                                            ml: 0.5,
                                            fontSize: "0.875rem",
                                            color: "#ffffff !important"
                                        }}
                                    >
                                        Links
                                    </Box>
                                )}
                            </IconButton>
                        </Tooltip>

                        <Menu
                            anchorEl={linksMenuAnchor}
                            open={Boolean(linksMenuAnchor)}
                            onClose={handleLinksMenuClose}
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

                        <Tooltip title="Change Theme">
                            <IconButton
                                onClick={handleThemeChange}
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

                        {authMode === 'cloud' && (
                        <Tooltip
                            title={`Local Backend: ${
                            authStatus.backendAuthenticated ? 'Has Cloud Auth' : 'No Cloud Auth'
                            }`}
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

                        {authMode === 'local' && authStatus.user && authStatus.isAuthenticated && (
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
                                                {authStatus.user}
                                            </Typography>
                                        )}
                                    </IconButton>
                                </Tooltip>
                            </>
                        )}

                        {authMode === 'cloud' && authStatus.user && authStatus.isAuthenticated && (
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
                                                {authStatus.user}
                                            </Typography>
                                        )}
                                    </IconButton>
                                </Tooltip>
                            </>
                        )}

                        {authStatus.isAuthenticated && (
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

            {/* Mobile Navigation Drawer - Same as before but using simplified auth state */}
            <Drawer
                anchor="left"
                open={mobileMenuOpen}
                onClose={handleMobileMenuClose}
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
                                        onClick={() => {
                                            handleMobileMenuClose();
                                        }}
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

                <List>
                    <ListItem disablePadding>
                        <ListItemButton
                            component={MuiLink}
                            href="https://junctionrelay-docs.onrender.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                                handleMobileMenuClose();
                            }}
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
                                handleThemeChange();
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
                                onClick={() => {
                                    handleMobileMenuClose();
                                }}
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

export default Navbar;