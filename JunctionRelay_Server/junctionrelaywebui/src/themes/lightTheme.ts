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

import { createTheme } from "@mui/material/styles";

const lightModeTheme = createTheme({
    palette: {
        mode: "light",
        background: {
            default: "#f0f2f5",
            paper: "#ffffff"
        },
        text: {
            primary: "#1b1f23",
            secondary: "#4a4a4a"
        },
        primary: {
            main: "#b58b4c",
            contrastText: "#ffffff"
        },
        secondary: {
            main: "#7d7d7d"
        },
        success: {
            main: "#4caf50",
            contrastText: "#ffffff"
        },
        error: {
            main: "#f44336",
            contrastText: "#ffffff"
        }
    },
    components: {
        MuiTypography: {
            styleOverrides: {
                root: {
                    color: "#1b1f23"
                }
            }
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: "none",
                    fontWeight: 500,
                    borderRadius: 8,
                    boxShadow: "none",
                    color: "#1b1f23",
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
                    backgroundColor: "#4caf50",
                    color: "#ffffff",
                    "&:hover": {
                        backgroundColor: "#43a047"
                    }
                },
                containedError: {
                    backgroundColor: "#f44336",
                    color: "#ffffff",
                    "&:hover": {
                        backgroundColor: "#e53935"
                    }
                },
                outlined: {
                    borderColor: "#b58b4c",
                    color: "#1b1f23",
                    "&:hover": {
                        backgroundColor: "#f7f7f7"
                    }
                },
                text: {
                    color: "#1b1f23",
                    "&:hover": {
                        backgroundColor: "#f0f0f0"
                    }
                }
            }
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundColor: "#ffffff",
                    color: "#1b1f23"
                }
            }
        },
        MuiTableHead: {
            styleOverrides: {
                root: {
                    backgroundColor: "#e0e0e0"
                }
            }
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    color: "#1b1f23",
                    borderBottom: "1px solid #cccccc"
                },
                head: {
                    color: "#1b1f23",
                    fontWeight: "bold"
                }
            }
        },
        MuiLink: {
            styleOverrides: {
                root: {
                    color: "#1b1f23",
                    textDecoration: "none",
                    transition: "color 0.3s",
                    "&:hover": {
                        color: "#b58b4c",
                        textDecoration: "underline"
                    },
                    "&:visited": {
                        color: "#1b1f23"
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
        },
        MuiIconButton: {
            styleOverrides: {
                root: {
                    '&.Navbar-icon': {
                        color: "#ffffff",
                        "&:hover": {
                            color: "#b58b4c"
                        }
                    }
                }
            }
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    color: "#ffffff"
                }
            }
        }
    }
});

export default lightModeTheme;
