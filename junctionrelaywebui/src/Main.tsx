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
import { CssBaseline, GlobalStyles } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { ThemeContextProvider } from "context/ThemeContext";
import App from "./App";

const Main = () => {
    return (
        <ThemeContextProvider>
            <InnerApp />
        </ThemeContextProvider>
    );
};

const InnerApp = () => {
    const theme = useTheme();
    return (
        <>
            <CssBaseline />
            <GlobalStyles
                styles={{
                    // Only apply to links that are NOT in the navbar
                    "a:not([data-navbar-link])": {
                        color: theme.palette.text.primary,
                        textDecoration: "none",
                        transition: "color 0.3s",
                    },
                    "a:not([data-navbar-link]):hover": {
                        color: theme.palette.primary.main,
                        textDecoration: "underline",
                    },
                    "a:not([data-navbar-link]):visited": {
                        color: theme.palette.text.primary,
                    },
                    // Fix for navbar links to maintain their intended colors
                    "a[data-navbar-link]:visited": {
                        color: "inherit !important",
                    }
                }}
            />
            <App />
        </>
    );
};

export default Main;