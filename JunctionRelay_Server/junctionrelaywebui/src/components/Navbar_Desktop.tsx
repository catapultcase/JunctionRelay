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
    Link as MuiLink
} from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import CloudIcon from "@mui/icons-material/Cloud";
import NavbarActions from "./Navbar_Actions";

interface NavbarDesktopProps {
    navItems: Array<{ text: string; path: string; icon: React.ReactNode }>;
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

const NavbarDesktop: React.FC<NavbarDesktopProps> = ({
    navItems,
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
    const location = useLocation();

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
                {/* Left Side - Logo and Nav Items */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 4 }}>
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
                </Box>

                {/* Right Side - Shared Actions Component */}
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
                    isMobile={false}
                />
            </Toolbar>
        </AppBar>
    );
};

export default NavbarDesktop;