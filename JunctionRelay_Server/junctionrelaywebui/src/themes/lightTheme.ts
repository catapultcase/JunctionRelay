/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024�present Jonathan Mills, CatapultCase
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

import { createTheme } from "@mui/material/styles";

const lightModeTheme = createTheme({
    palette: {
        mode: "light",
        background: {
            default: "#e8eaed",      // More gray/blue background
            paper: "#f1f3f4"         // Light gray for cards (less white)
        },
        text: {
            primary: "#24292f",      // Dark gray (GitHub style, not pure black)
            secondary: "#57606a",    // Medium gray for secondary text
            disabled: "#8c959f"      // Lighter gray for disabled
        },
        primary: {
            main: "#1e88e5",         // Same blue as dark theme for consistency
            light: "#42a5f5",
            dark: "#1565c0",
            contrastText: "#ffffff"
        },
        secondary: {
            main: "#6c757d",
            light: "#adb5bd",
            dark: "#495057"
        },
        success: {
            main: "#2e7d32",         // Darker green for better contrast on light bg
            light: "#4caf50",
            dark: "#1b5e20",
            contrastText: "#ffffff"
        },
        error: {
            main: "#d32f2f",         // Darker red for better contrast
            light: "#ef5350",
            dark: "#c62828",
            contrastText: "#ffffff"
        },
        warning: {
            main: "#ed6c02",         // Darker orange for visibility
            light: "#ff9800",
            dark: "#e65100",
            contrastText: "#ffffff"
        },
        info: {
            main: "#0288d1",
            light: "#03a9f4",
            dark: "#01579b",
            contrastText: "#ffffff"
        },
        divider: "rgba(0, 0, 0, 0.12)",
        action: {
            active: "#24292f",
            hover: "rgba(0, 0, 0, 0.04)",
            selected: "rgba(30, 136, 229, 0.12)",
            disabled: "rgba(0, 0, 0, 0.26)",
            disabledBackground: "rgba(0, 0, 0, 0.12)"
        }
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: "none",
                    fontWeight: 600,
                    borderRadius: 8,
                    boxShadow: "none",
                    "&:hover": {
                        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)"
                    }
                },
                contained: {
                    backgroundColor: "#1e88e5",
                    color: "#ffffff",
                    fontWeight: 600,
                    "&:hover": {
                        backgroundColor: "#1565c0",
                        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)"
                    }
                },
                containedSuccess: {
                    backgroundColor: "#2e7d32",
                    color: "#ffffff",
                    "&:hover": {
                        backgroundColor: "#1b5e20",
                        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)"
                    }
                },
                containedError: {
                    backgroundColor: "#d32f2f",
                    color: "#ffffff",
                    "&:hover": {
                        backgroundColor: "#c62828",
                        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)"
                    }
                },
                containedWarning: {
                    backgroundColor: "#ed6c02",
                    color: "#ffffff",
                    "&:hover": {
                        backgroundColor: "#e65100",
                        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)"
                    }
                },
                outlined: {
                    borderColor: "#1e88e5",
                    borderWidth: "1.5px",
                    color: "#1e88e5",
                    "&:hover": {
                        backgroundColor: "rgba(30, 136, 229, 0.04)",
                        borderColor: "#1565c0"
                    }
                },
                text: {
                    color: "#24292f",
                    "&:hover": {
                        backgroundColor: "rgba(0, 0, 0, 0.04)"
                    }
                }
            }
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundColor: "#f1f3f4",
                    color: "#24292f",
                    borderRadius: 8,
                    border: "1px solid #dadce0",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)"
                }
            }
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundColor: "#f1f3f4",
                    backgroundImage: "none"
                },
                elevation1: {
                    backgroundColor: "#f1f3f4",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
                    border: "1px solid #dadce0"
                },
                elevation2: {
                    backgroundColor: "#f8f9fa",
                    boxShadow: "0 3px 6px rgba(0, 0, 0, 0.1)"
                },
                elevation3: {
                    backgroundColor: "#ffffff",
                    boxShadow: "0 6px 12px rgba(0, 0, 0, 0.12)"
                }
            }
        },
        MuiTableHead: {
            styleOverrides: {
                root: {
                    backgroundColor: "#e8eaed"
                }
            }
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    color: "#24292f",
                    borderBottom: "1px solid #dadce0"
                },
                head: {
                    color: "#24292f",
                    fontWeight: 600,
                    backgroundColor: "#e8eaed"
                }
            }
        },
        MuiLink: {
            styleOverrides: {
                root: {
                    color: "#1e88e5",
                    textDecoration: "none",
                    transition: "color 0.2s ease-in-out",
                    fontWeight: 500,
                    "&:hover": {
                        color: "#1565c0",
                        textDecoration: "underline"
                    },
                    "&:visited": {
                        color: "#7b1fa2"
                    },
                    "&.Navbar-link": {
                        color: "#ffffff",
                        "&:hover": {
                            color: "#42a5f5"
                        },
                        "&:visited": {
                            color: "#ffffff"
                        }
                    }
                }
            }
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    "& .MuiOutlinedInput-root": {
                        backgroundColor: "#f8f9fa",
                        "& fieldset": {
                            borderColor: "#dadce0"
                        },
                        "&:hover fieldset": {
                            borderColor: "#8c959f"
                        },
                        "&.Mui-focused fieldset": {
                            borderColor: "#1e88e5"
                        }
                    },
                    "& .MuiInputLabel-root": {
                        color: "#57606a"
                    },
                    "& .MuiInputBase-input": {
                        color: "#24292f"
                    }
                }
            }
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    backgroundColor: "#f1f3f4",
                    backgroundImage: "none",
                    border: "1px solid #dadce0"
                }
            }
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: "#24292f",
                    color: "#ffffff",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)"
                }
            }
        },
        MuiIconButton: {
            styleOverrides: {
                root: {
                    color: "#57606a",
                    "&:hover": {
                        backgroundColor: "rgba(0, 0, 0, 0.04)",
                        color: "#1e88e5"
                    },
                    "&.Navbar-icon": {
                        color: "#ffffff",
                        "&:hover": {
                            backgroundColor: "rgba(255, 255, 255, 0.1)",
                            color: "#42a5f5"
                        }
                    }
                }
            }
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    backgroundColor: "#e8eaed",
                    color: "#24292f",
                    borderRadius: 4,
                    border: "1px solid #dadce0"
                }
            }
        },
        MuiDivider: {
            styleOverrides: {
                root: {
                    borderColor: "#dadce0"
                }
            }
        }
    }
});

export default lightModeTheme;
