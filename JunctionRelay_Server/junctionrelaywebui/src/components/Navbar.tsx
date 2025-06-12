/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

import { AppBar, Toolbar, Button, Box, Link as MuiLink, Tooltip } from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import SettingsIcon from "@mui/icons-material/Settings";
import PaletteIcon from "@mui/icons-material/Palette";
import LanguageIcon from "@mui/icons-material/Language";
import LocalCafeIcon from "@mui/icons-material/LocalCafe";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useThemeContext } from "../context/ThemeContext";
import { useAppVersion } from "../hooks/useAppVersion";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { UserMenu } from "auth/UserMenu";

const Navbar = () => {
    const location = useLocation();
    const { cycleTheme } = useThemeContext();
    const { version, latest, isOutdated } = useAppVersion();
    const flags = useFeatureFlags();

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
                {/* Left Section: JR Logo + Navigation */}
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

                {/* Right Section */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Tooltip title="Support on Buy Me a Coffee">
                        <MuiLink
                            href="https://buymeacoffee.com/catapultcase"
                            target="_blank"
                            rel="noopener noreferrer"
                            underline="hover"
                            data-navbar-link
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                                fontSize: "0.875rem",
                                color: "#fdd835",
                                textShadow: "1px 1px 2px rgba(0,0,0,0.8)"
                            }}
                        >
                            <LocalCafeIcon
                                sx={{ color: "#fdd835", filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.7))" }}
                                fontSize="small"
                            />
                            Buy me a coffee
                        </MuiLink>
                    </Tooltip>

                    <Tooltip title="GitHub Repository">
                        <MuiLink
                            href="https://github.com/catapultcase/JunctionRelay"
                            target="_blank"
                            rel="noopener noreferrer"
                            underline="hover"
                            data-navbar-link
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                                fontSize: "0.875rem",
                                color: "#ffffff"
                            }}
                        >
                            {isOutdated ? (
                                <>
                                    <WarningAmberIcon sx={{ color: "#ff9800" }} fontSize="small" />
                                    v{version} (v{latest} available)
                                </>
                            ) : (
                                <>
                                    <CheckCircleIcon sx={{ color: "#4caf50" }} fontSize="small" />
                                    v{version}
                                </>
                            )}
                        </MuiLink>
                    </Tooltip>

                    <Tooltip title="catapultcase.com">
                        <MuiLink
                            href="https://catapultcase.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            underline="hover"
                            data-navbar-link
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                                fontSize: "0.875rem",
                                color: "#ffffff"
                            }}
                        >
                            <LanguageIcon sx={{ color: "#1976d2" }} fontSize="small" />
                            catapultcase.com
                        </MuiLink>
                    </Tooltip>

                    <Tooltip title="junctionrelay.com">
                        <MuiLink
                            href="https://junctionrelay.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            underline="hover"
                            data-navbar-link
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                                fontSize: "0.875rem",
                                color: "#ffffff"
                            }}
                        >
                            <LanguageIcon sx={{ color: "#388e3c" }} fontSize="small" />
                            junctionrelay.com
                        </MuiLink>
                    </Tooltip>

                    <Button
                        onClick={cycleTheme}
                        startIcon={<PaletteIcon sx={{ color: "#ff9800" }} />}
                        data-navbar-link
                        sx={{
                            color: "#ffffff",
                            fontSize: "0.875rem",
                            textTransform: "none",
                            "&:hover": {
                                color: "#7b8ea0"
                            }
                        }}
                    >
                        Theme
                    </Button>

                    <Button
                        component={Link}
                        to="/settings"
                        startIcon={<SettingsIcon sx={{ color: "#9c27b0" }} />}
                        data-navbar-link
                        sx={{
                            color: "#ffffff",
                            fontSize: "0.875rem",
                            textTransform: "none",
                            "&:hover": {
                                color: "#7b8ea0"
                            }
                        }}
                    >
                        Settings
                    </Button>

                    {/* User Menu - Shows username and logout options */}
                    <UserMenu />
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default Navbar;