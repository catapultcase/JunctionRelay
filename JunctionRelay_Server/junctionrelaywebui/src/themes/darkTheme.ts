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

import { createTheme } from "@mui/material/styles";

const fullDarkTheme = createTheme({
    palette: {
        mode: "dark",
        background: {
            default: "#121212",
            paper: "#1e1e1e"
        },
        text: {
            primary: "#e0e0e0",
            secondary: "#a0a0a0"
        },
        primary: {
            main: "#b58b4c",
            contrastText: "#ffffff"
        },
        secondary: {
            main: "#7a7a7a"
        },
        success: {
            main: "#66bb6a",
            contrastText: "#ffffff"
        },
        error: {
            main: "#ef5350",
            contrastText: "#ffffff"
        }
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: "none",
                    fontWeight: 500,
                    borderRadius: 8,
                    boxShadow: "none",
                    color: "#e0e0e0",
                    "&:hover": {
                        boxShadow: "0 0 8px rgba(181, 139, 76, 0.4)"
                    }
                },
                contained: {
                    backgroundColor: "#b58b4c",
                    color: "#ffffff",
                    "&:hover": {
                        backgroundColor: "#c99a57"
                    }
                },
                containedSuccess: {
                    backgroundColor: "#66bb6a",
                    color: "#ffffff",
                    "&:hover": {
                        backgroundColor: "#57a65a"
                    }
                },
                containedError: {
                    backgroundColor: "#ef5350",
                    color: "#ffffff",
                    "&:hover": {
                        backgroundColor: "#e53935"
                    }
                },
                outlined: {
                    borderColor: "#b58b4c",
                    color: "#b58b4c",
                    "&:hover": {
                        backgroundColor: "#2c2c2c"
                    }
                },
                text: {
                    color: "#e0e0e0",
                    "&:hover": {
                        backgroundColor: "#2a2a2a"
                    }
                }
            }
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundColor: "#1e1e1e",
                    color: "#e0e0e0"
                }
            }
        },
        MuiTableHead: {
            styleOverrides: {
                root: {
                    backgroundColor: "#2b2b2b"
                }
            }
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    color: "#e0e0e0",
                    borderBottom: "1px solid #3a3a3a"
                },
                head: {
                    color: "#f0f0f0",
                    fontWeight: "bold",
                    backgroundColor: "#2b2b2b"
                }
            }
        },
        MuiLink: {
            styleOverrides: {
                root: {
                    color: "#e0e0e0",
                    textDecoration: "none",
                    transition: "color 0.3s",
                    "&:hover": {
                        color: "#b58b4c",
                        textDecoration: "underline"
                    },
                    "&:visited": {
                        color: "#e0e0e0"
                    },
                    "&.Navbar-link": {
                        color: "#ffffff",
                        "&:hover": {
                            color: "#b58b4c"
                        },
                        "&:visited": {
                            color: "#ffffff"
                        }
                    }
                }
            }
        }
    }
});

export default fullDarkTheme;
