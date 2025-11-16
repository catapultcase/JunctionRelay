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
import { useTheme, useMediaQuery } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import DevicesIcon from "@mui/icons-material/Devices";
import ServiceIcon from "@mui/icons-material/MiscellaneousServices";
import DataObjectIcon from "@mui/icons-material/DataObject";
import PayloadIcon from "@mui/icons-material/Layers";
import ChartIcon from "@mui/icons-material/BarChart";
import JunctionIcon from "@mui/icons-material/Hub";
import StreamIcon from "@mui/icons-material/Stream";
import PhotoIcon from '@mui/icons-material/Photo';
import LaunchIcon from '@mui/icons-material/Launch';
import CloudIcon from "@mui/icons-material/Cloud";
import ComputerIcon from "@mui/icons-material/Computer";
import { useThemeContext } from "../context/ThemeContext";
import { useAppVersion } from "../hooks/useAppVersion";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useNavbarAuth } from "./Navbar_Auth";
import NavbarDesktop from "./Navbar_Desktop";
import NavbarMobile from "./Navbar_Mobile";

const Navbar = () => {
    const { cycleTheme } = useThemeContext();
    const { version, latest, isOutdated } = useAppVersion();
    const flags = useFeatureFlags();
    const { authMode, authStatus } = useNavbarAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery('(max-width:1600px)');

    const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
    const [linksMenuAnchor, setLinksMenuAnchor] = useState<null | HTMLElement>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [useMobileNav, setUseMobileNav] = useState(false);

    // Check mobile navigation flag
    const checkMobileNavFlag = useCallback(async () => {
        try {
            const flagsResponse = await fetch('/api/settings/flags');
            if (flagsResponse.ok) {
                const flagsData = await flagsResponse.json();
                setUseMobileNav(!!flagsData.mobile_navigation_on_desktop);
            }
        } catch (error) {
            console.warn('Could not fetch mobile navigation flag:', error);
        }
    }, []);

    // Listen for dynamic flag changes
    useEffect(() => {
        checkMobileNavFlag();

        const handleFlagsChanged = checkMobileNavFlag;
        window.addEventListener('settings-changed', handleFlagsChanged);
        window.addEventListener('flags-changed', handleFlagsChanged);

        return () => {
            window.removeEventListener('settings-changed', handleFlagsChanged);
            window.removeEventListener('flags-changed', handleFlagsChanged);
        };
    }, [checkMobileNavFlag]);

    // Force mobile mode when screen is small OR mobile nav flag is enabled
    const shouldShowDrawer = isMobile || useMobileNav;

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

    const handleThemeChange = () => {
        cycleTheme();
    };

    // Build navigation items
    const navItems = [
        { text: "Dashboard", path: "/", icon: <DashboardIcon /> },
        { text: "Streams", path: "/streams", icon: <StreamIcon /> },
        { text: "Junctions", path: "/junctions", icon: <JunctionIcon /> },
        { text: "Devices", path: "/devices", icon: <DevicesIcon /> },
        { text: "VirtualDevices", path: "/virtualdevices", icon: <ComputerIcon /> },
        { text: "Services", path: "/services", icon: <ServiceIcon /> },
        { text: "Collectors", path: "/collectors", icon: <DataObjectIcon /> },
        { text: "FrameEngine", path: "/frameengine", icon: <PhotoIcon /> },
        { text: "EventEngine", path: "/eventengine", icon: <LaunchIcon /> },
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
            {shouldShowDrawer ? (
                <NavbarMobile
                    navItems={navItems}
                    mobileMenuOpen={mobileMenuOpen}
                    onMenuToggle={handleMobileMenuToggle}
                    onMenuClose={handleMobileMenuClose}
                    flags={flags}
                    version={version}
                    authMode={authMode}
                    authStatus={authStatus}
                    onLogout={handleLogout}
                    onThemeChange={handleThemeChange}
                    userMenuAnchor={userMenuAnchor}
                    linksMenuAnchor={linksMenuAnchor}
                    onUserMenuOpen={handleUserMenuOpen}
                    onUserMenuClose={handleUserMenuClose}
                    onLinksMenuOpen={handleLinksMenuOpen}
                    onLinksMenuClose={handleLinksMenuClose}
                    latest={latest}
                    isOutdated={isOutdated}
                />
            ) : (
                <NavbarDesktop
                    navItems={navItems}
                    flags={flags}
                    version={version}
                    latest={latest}
                    isOutdated={isOutdated}
                    authMode={authMode}
                    authStatus={authStatus}
                    userMenuAnchor={userMenuAnchor}
                    linksMenuAnchor={linksMenuAnchor}
                    onUserMenuOpen={handleUserMenuOpen}
                    onUserMenuClose={handleUserMenuClose}
                    onLinksMenuOpen={handleLinksMenuOpen}
                    onLinksMenuClose={handleLinksMenuClose}
                    onLogout={handleLogout}
                    onThemeChange={handleThemeChange}
                />
            )}
        </>
    );
};

export default Navbar;