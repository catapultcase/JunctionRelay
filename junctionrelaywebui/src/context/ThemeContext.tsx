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

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ThemeProvider, Snackbar, Alert } from "@mui/material";
import darkTheme from "../themes/darkTheme";
import lightTheme from "../themes/lightTheme";

// Theme list (start with light mode first)
const themes = [lightTheme, darkTheme];
const themeNames = ["Light Mode", "Dark Mode"];

const ThemeContext = createContext<any>(null);

export const ThemeContextProvider = ({ children }: { children: ReactNode }) => {
    const [themeIndex, setThemeIndex] = useState(0);
    const [toastOpen, setToastOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState("");

    // Load theme index from localStorage
    useEffect(() => {
        const savedIndex = localStorage.getItem("themeIndex");
        if (savedIndex !== null) {
            setThemeIndex(parseInt(savedIndex, 10));
        }
    }, []);

    const cycleTheme = () => {
        setThemeIndex(prev => {
            const newIndex = (prev + 1) % themes.length;
            localStorage.setItem("themeIndex", newIndex.toString());

            // Set toast message
            setToastMessage(`Theme switched to ${themeNames[newIndex]}`);
            setToastOpen(true);

            return newIndex;
        });
    };

    const handleToastClose = () => {
        setToastOpen(false);
    };

    return (
        <ThemeContext.Provider value={{ cycleTheme }}>
            <ThemeProvider theme={themes[themeIndex]}>
                {children}
                {/* Snackbar for toast message */}
                <Snackbar
                    open={toastOpen}
                    autoHideDuration={2000}
                    onClose={handleToastClose}
                    anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                >
                    <Alert onClose={handleToastClose} severity="info" variant="filled" sx={{ width: "100%" }}>
                        {toastMessage}
                    </Alert>
                </Snackbar>
            </ThemeProvider>
        </ThemeContext.Provider>
    );
};

export const useThemeContext = () => useContext(ThemeContext);
