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

const fullDarkTheme = createTheme({
    palette: {
        mode: "dark",
        background: {
            default: "#1f1f1f",      // Dark gray
            paper: "#2b2b2b"         // Slightly lighter for cards/surfaces
        },
        text: {
            primary: "#d4d4d4",      // Medium light gray (not too bright)
            secondary: "#9a9a9a",    // Medium gray for secondary text
            disabled: "#6a6a6a"      // Darker gray for disabled
        },
        primary: {
            main: "#1e88e5",         // Darker blue accent
            light: "#42a5f5",        // Hover state
            dark: "#1565c0",         // Pressed state
            contrastText: "#ffffff"  // White text on blue
        },
        secondary: {
            main: "#8e8e93",
            light: "#aeaeb2",
            dark: "#636366"
        },
        success: {
            main: "#66bb6a",         // Balanced green
            light: "#81c784",
            dark: "#4caf50",
            contrastText: "#ffffff"
        },
        error: {
            main: "#f44336",         // Clear red for errors/warnings
            light: "#e57373",
            dark: "#d32f2f",
            contrastText: "#ffffff"
        },
        warning: {
            main: "#ff9800",         // Clear orange for warnings
            contrastText: "#ffffff"
        },
        info: {
            main: "#29b6f6",         // Cyan-blue
            contrastText: "#ffffff"
        },
        divider: "rgba(255, 255, 255, 0.15)",  // Slightly more visible dividers
        action: {
            active: "#d4d4d4",
            hover: "rgba(255, 255, 255, 0.1)",
            selected: "rgba(30, 136, 229, 0.2)",  // Blue tint for selected
            disabled: "rgba(255, 255, 255, 0.3)",
            disabledBackground: "rgba(255, 255, 255, 0.12)"
        }
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: "none",
                    fontWeight: 600,  // Slightly bolder for better readability
                    borderRadius: 10,
                    boxShadow: "none",
                    "&:hover": {
                        boxShadow: "0 2px 8px rgba(30, 136, 229, 0.3)"
                    }
                },
                contained: {
                    backgroundColor: "#1e88e5",
                    color: "#ffffff",
                    fontWeight: 600,
                    "&:hover": {
                        backgroundColor: "#42a5f5",
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)"
                    },
                    "&:active": {
                        backgroundColor: "#1565c0"
                    }
                },
                containedSuccess: {
                    backgroundColor: "#66bb6a",
                    color: "#ffffff",
                    "&:hover": {
                        backgroundColor: "#81c784",
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)"
                    }
                },
                containedError: {
                    backgroundColor: "#f44336",
                    color: "#ffffff",
                    "&:hover": {
                        backgroundColor: "#e57373",
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)"
                    }
                },
                containedWarning: {
                    backgroundColor: "#ff9800",
                    color: "#ffffff",
                    "&:hover": {
                        backgroundColor: "#ffb74d",
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)"
                    }
                },
                outlined: {
                    borderColor: "#1e88e5",
                    borderWidth: "1.5px",
                    color: "#1e88e5",
                    "&:hover": {
                        backgroundColor: "rgba(30, 136, 229, 0.08)",
                        borderColor: "#42a5f5"
                    }
                },
                text: {
                    color: "#d4d4d4",
                    "&:hover": {
                        backgroundColor: "rgba(255, 255, 255, 0.08)"
                    }
                }
            }
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundColor: "#2b2b2b",
                    color: "#d4d4d4",
                    borderRadius: 8,  // Slightly less rounded
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.3)",
                    border: "1px solid rgba(255, 255, 255, 0.1)"  // Subtle border
                }
            }
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundColor: "#2b2b2b",
                    backgroundImage: "none"
                },
                elevation1: {
                    backgroundColor: "#2b2b2b",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)"
                },
                elevation2: {
                    backgroundColor: "#353535",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)"
                },
                elevation3: {
                    backgroundColor: "#3a3a3a",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)"
                }
            }
        },
        MuiTableHead: {
            styleOverrides: {
                root: {
                    backgroundColor: "#353535"
                }
            }
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    color: "#d4d4d4",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.15)"
                },
                head: {
                    color: "#d4d4d4",
                    fontWeight: 600,
                    backgroundColor: "#353535"
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
                        color: "#42a5f5",
                        textDecoration: "underline"
                    },
                    "&:visited": {
                        color: "#9c27b0"
                    },
                    "&.Navbar-link": {
                        color: "#d4d4d4",
                        "&:hover": {
                            color: "#1e88e5"
                        },
                        "&:visited": {
                            color: "#d4d4d4"
                        }
                    }
                }
            }
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    "& .MuiOutlinedInput-root": {
                        backgroundColor: "#2b2b2b",
                        "& fieldset": {
                            borderColor: "rgba(255, 255, 255, 0.2)"
                        },
                        "&:hover fieldset": {
                            borderColor: "rgba(255, 255, 255, 0.3)"
                        },
                        "&.Mui-focused fieldset": {
                            borderColor: "#1e88e5"
                        }
                    },
                    "& .MuiInputLabel-root": {
                        color: "#9a9a9a"
                    },
                    "& .MuiInputBase-input": {
                        color: "#d4d4d4"
                    }
                }
            }
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    backgroundColor: "#2b2b2b",
                    backgroundImage: "none",
                    border: "1px solid rgba(255, 255, 255, 0.1)"
                }
            }
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: "#2b2b2b",
                    color: "#d4d4d4",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.1)"
                }
            }
        },
        MuiIconButton: {
            styleOverrides: {
                root: {
                    color: "#d4d4d4",
                    "&:hover": {
                        backgroundColor: "rgba(255, 255, 255, 0.1)",
                        color: "#1e88e5"  // Blue on hover
                    }
                }
            }
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    backgroundColor: "#353535",
                    color: "#d4d4d4",
                    borderRadius: 4  // More rectangular
                }
            }
        },
        MuiDivider: {
            styleOverrides: {
                root: {
                    borderColor: "rgba(255, 255, 255, 0.15)"
                }
            }
        }
    }
});

export default fullDarkTheme;
