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
import React, { useState } from 'react';
import { Button, Menu, MenuItem, Avatar, Box, Typography } from '@mui/material';
import { AccountCircle, Logout, VpnKey } from '@mui/icons-material';
import { useAuth } from './AuthContext';
import { ChangePasswordDialog } from './ChangePasswordDialog';

export const UserMenu: React.FC = () => {
    const { user, logout } = useAuth();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [changePasswordOpen, setChangePasswordOpen] = useState(false);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleLogout = () => {
        logout();
        handleClose();
    };

    const handleChangePassword = () => {
        setChangePasswordOpen(true);
        handleClose();
    };

    if (!user) return null;

    return (
        <Box>
            <Button
                onClick={handleClick}
                startIcon={
                    <Avatar sx={{ width: 24, height: 24, bgcolor: '#7b8ea0' }}>
                        <AccountCircle sx={{ color: '#ffffff' }} />
                    </Avatar>
                }
                sx={{
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    textTransform: 'none',
                    '&:hover': {
                        color: '#7b8ea0',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    }
                }}
            >
                <Typography variant="body2" sx={{ color: 'inherit' }}>
                    {user.username}
                </Typography>
            </Button>
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                slotProps={{
                    paper: {
                        sx: {
                            backgroundColor: '#2d3339',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                            mt: 1,
                        }
                    }
                }}
            >
                <MenuItem
                    onClick={handleChangePassword}
                    sx={{
                        color: '#ffffff',
                        '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        }
                    }}
                >
                    <VpnKey sx={{ mr: 1, color: '#9c27b0' }} />
                    Change Password
                </MenuItem>
                <MenuItem
                    onClick={handleLogout}
                    sx={{
                        color: '#ffffff',
                        '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        }
                    }}
                >
                    <Logout sx={{ mr: 1, color: '#f44336' }} />
                    Logout
                </MenuItem>
            </Menu>
            <ChangePasswordDialog
                open={changePasswordOpen}
                onClose={() => setChangePasswordOpen(false)}
            />
        </Box>
    );
};