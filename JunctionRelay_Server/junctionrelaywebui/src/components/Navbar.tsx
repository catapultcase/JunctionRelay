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
import { useLocation } from "react-router-dom";
import { useMediaQuery } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import SettingsIcon from "@mui/icons-material/Settings";
import { useDocsSites } from "pages/docs/useDocsSites";
import DnsIcon from "@mui/icons-material/Dns";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import GridViewIcon from "@mui/icons-material/GridView";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import BackupIcon from "@mui/icons-material/Backup";
import LanIcon from "@mui/icons-material/Lan";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import TimelineIcon from "@mui/icons-material/Timeline";
import DevicesIcon from "@mui/icons-material/Devices";
import ServiceIcon from "@mui/icons-material/MiscellaneousServices";
import DataObjectIcon from "@mui/icons-material/DataObject";
import PayloadIcon from "@mui/icons-material/Layers";
import ChartIcon from "@mui/icons-material/BarChart";
import JunctionIcon from "@mui/icons-material/Hub";
import StreamIcon from "@mui/icons-material/Stream";
import PhotoIcon from '@mui/icons-material/Photo';
import LaunchIcon from '@mui/icons-material/Launch';
import ComputerIcon from "@mui/icons-material/Computer";
import { useThemeContext } from "../context/ThemeContext";
import { useAppVersion } from "../hooks/useAppVersion";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useNavbarAuth } from "./Navbar_Auth";
import NavbarDesktop from "./Navbar_Desktop";
import { AppId, APP_IDS, NAV_COLLAPSE_PX, appForPath } from "./navApps";
import NavbarMobile from "./Navbar_Mobile";

const Navbar = () => {
    const { cycleTheme } = useThemeContext();
    const { version, latest, isOutdated } = useAppVersion();
    const flags = useFeatureFlags();
    const { authMode, authStatus } = useNavbarAuth();
    const location = useLocation();

    // Current app derives from the URL so deep links and the switcher can never disagree
    const currentApp: AppId = appForPath(location.pathname);

    // Collapse point is per app - a ten-tab bar and a four-tab bar do not run out
    // of room at the same width. See NAV_COLLAPSE_PX in navApps.
    const isMobile = useMediaQuery(`(max-width:${NAV_COLLAPSE_PX[currentApp]}px)`);

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

    const handleLogout = async () => {
        try {
            await fetch('/api/unified-auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            // Still proceed with local cleanup
        }
        // Clear any legacy localStorage keys
        localStorage.removeItem('junctionrelay_token');
        localStorage.removeItem('cloud_proxy_token');
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

    /*
     * The Documentation app's tabs are DATA, not a fixed list: Configure, then one per
     * configured site. Adding a repo has to add a tab, so hard-coding them here would
     * mean the tab row and the configuration could disagree.
     *
     * ⛔ THE SITE TABS ARE ABSOLUTE URLS ON PURPOSE - the renderer treats a path starting
     * http as external and opens it in a new tab. A docs site was embedded in an iframe
     * first and every click flashed the frame white; an iframe blanks during a document
     * load, and colouring that blank failed from the document, from a meta tag and from
     * the iframe element itself. A top-level navigation keeps painting the old page until
     * the new one is ready, so opening a real tab removes the problem rather than hiding
     * it. Configure stays in-app, which is why this app is not APP_EXTERNAL.
     */
    const { data: docsData } = useDocsSites();

    // Build navigation items
    const navItems = currentApp === 'docs'
        ? [
            { text: "Configure", path: "/docs/configure", icon: <SettingsIcon /> },
            ...(docsData?.sites ?? []).map(site => ({
                text: site.name,
                path: `${window.location.origin}${site.url}`,
                icon: <MenuBookIcon />
            })),
        ]
        : currentApp === 'models'
        ? [
            { text: "Dashboard", path: "/models", icon: <DashboardIcon /> },
            { text: "Catalog", path: "/models/catalog", icon: <Inventory2Icon /> },
            { text: "Serving", path: "/models/serving", icon: <DnsIcon /> },
            { text: "Benchmarks", path: "/models/benchmarks", icon: <ShowChartIcon /> },
            { text: "Reports", path: "/models/reports", icon: <TimelineIcon /> },
        ]
        : currentApp === 'homelab'
        ? [
            { text: "Dashboard", path: "/homelab", icon: <DashboardIcon /> },
            { text: "Rooms", path: "/homelab/rooms", icon: <MeetingRoomIcon /> },
            { text: "Spaces", path: "/homelab/spaces", icon: <GridViewIcon /> },
            { text: "Machines", path: "/homelab/machines", icon: <DnsIcon /> },
            { text: "Inventory", path: "/homelab/inventory", icon: <Inventory2Icon /> },
            { text: "Observations", path: "/homelab/observations", icon: <ShowChartIcon /> },
            { text: "Backups", path: "/homelab/backups", icon: <BackupIcon /> },
            { text: "Network", path: "/homelab/network", icon: <LanIcon /> },
        ]
        : [
            { text: "Dashboard", path: "/", icon: <DashboardIcon /> },
            { text: "Streams", path: "/streams", icon: <StreamIcon /> },
            { text: "Junctions", path: "/junctions", icon: <JunctionIcon /> },
            { text: "Devices", path: "/devices", icon: <DevicesIcon /> },
            { text: "XSD", path: "/xsd", icon: <ComputerIcon /> },
            { text: "Services", path: "/services", icon: <ServiceIcon /> },
            { text: "Collectors", path: "/collectors", icon: <DataObjectIcon /> },
            { text: "Payloads", path: "/payloads", icon: <PayloadIcon /> },
            { text: "FrameEngine", path: "/frameengine", icon: <PhotoIcon /> },
            { text: "EventEngine", path: "/eventengine", icon: <LaunchIcon /> },
        ];

    if (currentApp === 'server' && flags?.top_bar_show_host_charts) {
        navItems.push({ text: "Host Charts", path: "/hostcharts", icon: <ChartIcon /> });
    }

    // ⛔ CLOUD IS AN APP, NOT A TAB: on SERVER's tab row it would be reachable from
    // exactly one app and read as a page of this server rather than a separate
    // product. It is a peer in the app switcher, so every app can reach it - see navApps.
    const apps = APP_IDS.filter(id => id !== 'cloud'
        || (authMode === 'cloud' && authStatus.isAuthenticated));

    return (
        <>
            {shouldShowDrawer ? (
                <NavbarMobile
                    navItems={navItems}
                    currentApp={currentApp}
                    apps={apps}
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
                    currentApp={currentApp}
                    apps={apps}
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
