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

import React, { useState, useEffect } from "react";
import {
    Box, Typography, Paper, Button, CircularProgress,
    Chip, Divider, Dialog, DialogTitle, DialogContent, DialogActions, TextField
} from "@mui/material";
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StarIcon from '@mui/icons-material/Star';
import PersonIcon from '@mui/icons-material/Person';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import UpgradeIcon from '@mui/icons-material/Upgrade';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import WifiIcon from '@mui/icons-material/Wifi';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import { AuthComponentProps } from "./Settings_UserManagement";

const Settings_AuthCloud: React.FC<AuthComponentProps> = ({
    authStatus,
    cloudUserInfo,
    cloudUserLoading,
    handleCloudLogin,
    handleCloudLogout,
    showSnackbar
}) => {
    const [subscriptionLoading, setSubscriptionLoading] = useState<boolean>(false);
    const [subscriptionDetails, setSubscriptionDetails] = useState<any>(null);

    // Profile update states
    const [profileDialogOpen, setProfileDialogOpen] = useState<boolean>(false);
    const [firstName, setFirstName] = useState<string>('');
    const [lastName, setLastName] = useState<string>('');
    const [profileLoading, setProfileLoading] = useState<boolean>(false);

    // Password change states
    const [passwordDialogOpen, setPasswordDialogOpen] = useState<boolean>(false);
    const [currentPassword, setCurrentPassword] = useState<string>('');
    const [newPassword, setNewPassword] = useState<string>('');
    const [confirmPassword, setConfirmPassword] = useState<string>('');
    const [passwordLoading, setPasswordLoading] = useState<boolean>(false);

    // Environment variable for Stripe billing portal
    const stripeBillingPortalUrl = process.env.REACT_APP_STRIPE_BILLING_PORTAL_URL || 'https://billing.stripe.com/p/login/test_00w7sN7ZS6RE7q87rwcjS00';

    // Fetch subscription details when user has a valid license
    useEffect(() => {
        if (cloudUserInfo?.hasValidLicense) {
            fetchSubscriptionDetails();
        } else {
            setSubscriptionDetails(null);
        }
    }, [cloudUserInfo?.hasValidLicense]);

    const fetchSubscriptionDetails = async () => {
        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            if (!cloudToken) return;

            const response = await fetch("/api/cloud-auth/subscription-status", {
                headers: {
                    "Authorization": `Bearer ${cloudToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setSubscriptionDetails(data);
            } else {
                console.warn("Failed to fetch subscription details:", response.status);
                setSubscriptionDetails(null);
            }
        } catch (error) {
            console.warn("Error fetching subscription details:", error);
            setSubscriptionDetails(null);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const handleManageSubscription = () => {
        // Open Stripe customer portal for subscription management
        window.open(stripeBillingPortalUrl, '_blank');
    };

    const handleSubscribe = async (planType: 'monthly' | 'annual') => {
        try {
            setSubscriptionLoading(true);

            // Get current URL to return to after checkout
            const returnUrl = window.location.href;
            console.log("[CHECKOUT] Current URL:", returnUrl);
            console.log("[CHECKOUT] Plan type:", planType);

            const cloudToken = localStorage.getItem('cloud_proxy_token');
            const requestBody = {
                planType,
                returnUrl
            };
            console.log("[CHECKOUT] Request body:", requestBody);

            const response = await fetch("/api/cloud-auth/create-checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${cloudToken}`
                },
                body: JSON.stringify(requestBody)
            });

            if (response.ok) {
                const data = await response.json();
                console.log("[CHECKOUT] Received checkout URL:", data.checkoutUrl);

                // Clear subscription cache before redirecting to checkout
                // This ensures fresh data when user returns after subscribing
                try {
                    await fetch("/api/cloud-auth/clear-subscription-cache", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${cloudToken}`
                        }
                    });
                } catch (cacheError) {
                    console.warn("Failed to clear subscription cache:", cacheError);
                    // Don't block checkout if cache clear fails
                }

                // Redirect to Stripe checkout
                window.location.href = data.checkoutUrl;
            } else {
                const error = await response.json();
                throw new Error(error.message || "Failed to create checkout session");
            }
        } catch (error: any) {
            showSnackbar(error.message || "Error starting subscription", "error");
        } finally {
            setSubscriptionLoading(false);
        }
    };

    const handleUpdateProfile = async () => {
        if (!firstName.trim() && !lastName.trim()) {
            showSnackbar("Please enter at least a first or last name", "error");
            return;
        }

        try {
            setProfileLoading(true);
            const cloudToken = localStorage.getItem('cloud_proxy_token');

            const response = await fetch("/api/cloud-auth/update-profile", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${cloudToken}`
                },
                body: JSON.stringify({
                    firstName: firstName.trim(),
                    lastName: lastName.trim()
                })
            });

            if (response.ok) {
                setProfileDialogOpen(false);
                setFirstName('');
                setLastName('');
                showSnackbar("Profile updated successfully!", "success");
            } else {
                const error = await response.json();
                throw new Error(error.message || "Failed to update profile");
            }
        } catch (error: any) {
            showSnackbar(error.message || "Error updating profile", "error");
        } finally {
            setProfileLoading(false);
        }
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            showSnackbar("All password fields are required", "error");
            return;
        }
        if (newPassword !== confirmPassword) {
            showSnackbar("New passwords do not match", "error");
            return;
        }
        if (newPassword.length < 8) {
            showSnackbar("New password must be at least 8 characters long", "error");
            return;
        }

        try {
            setPasswordLoading(true);
            const cloudToken = localStorage.getItem('cloud_proxy_token');

            const response = await fetch("/api/cloud-auth/change-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${cloudToken}`
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            });

            if (response.ok) {
                setPasswordDialogOpen(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                showSnackbar("Password changed successfully!", "success");
            } else {
                const error = await response.json();
                throw new Error(error.message || "Failed to change password");
            }
        } catch (error: any) {
            showSnackbar(error.message || "Error changing password", "error");
        } finally {
            setPasswordLoading(false);
        }
    };

    return (
        <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" gutterBottom>
                JunctionRelay Cloud (Online Mode)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Support the project with online authentication and subscribe to JunctionRelay Pro.
            </Typography>

            <Box sx={{
                p: 2,
                bgcolor: 'rgba(76, 175, 80, 0.08)',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'rgba(76, 175, 80, 0.23)',
                mb: 2
            }}>
                <Typography variant="body2" color="success.main" sx={{ fontWeight: 'medium', display: 'flex', alignItems: 'center', mb: 1 }}>
                    <WifiIcon sx={{ mr: 1, fontSize: 18 }} />
                    Online Services Enabled
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Enables cloud authentication, version checking, and supports project development. Available with free cloud accounts.
                </Typography>
            </Box>

            <Box sx={{
                p: 2,
                bgcolor: 'rgba(156, 39, 176, 0.08)',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'rgba(156, 39, 176, 0.23)',
                mb: 3
            }}>
                <Typography variant="body2" color="primary.main" sx={{ fontWeight: 'medium', display: 'flex', alignItems: 'center', mb: 1 }}>
                    <StarIcon sx={{ mr: 1, fontSize: 18 }} />
                    Pro Subscription Benefits
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Unlocks advanced features like remote management, OTA updates, cloud backups, priority support, and exclusive Pro-only functionality.
                </Typography>
            </Box>

            {/* Loading State */}
            {cloudUserLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                        Loading...
                    </Typography>
                </Box>
            )}

            {/* Logged In State */}
            {authStatus.authMode === 'cloud' && cloudUserInfo && !cloudUserLoading && (
                <>
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                            <CheckCircleIcon sx={{ mr: 1, fontSize: 16, color: 'success.main' }} />
                            Authenticated: {cloudUserInfo.email}
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Chip
                                icon={cloudUserInfo.hasValidLicense ? <StarIcon /> : <PersonIcon />}
                                label={cloudUserInfo.hasValidLicense ? "Pro Subscription Active" : "Free Account"}
                                color={cloudUserInfo.hasValidLicense ? "primary" : "default"}
                                size="small"
                            />

                            {/* Show subscription details for Pro users */}
                            {subscriptionDetails?.hasSubscription && (
                                <>
                                    <Chip
                                        label={subscriptionDetails.planType === 'annual' ? 'Annual Plan' : 'Monthly Plan'}
                                        variant="outlined"
                                        size="small"
                                        color="primary"
                                    />
                                    {subscriptionDetails.cancelAtPeriodEnd && (
                                        <Chip
                                            label="Canceling"
                                            variant="outlined"
                                            size="small"
                                            color="warning"
                                        />
                                    )}
                                </>
                            )}
                        </Box>

                        {/* Show billing period for Pro users */}
                        {subscriptionDetails?.hasSubscription && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                {subscriptionDetails.cancelAtPeriodEnd
                                    ? `Access until ${formatDate(subscriptionDetails.currentPeriodEnd)}`
                                    : `Next billing: ${formatDate(subscriptionDetails.currentPeriodEnd)}`
                                }
                            </Typography>
                        )}
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
                        {/* Left side - Subscription actions */}
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {cloudUserInfo.hasValidLicense ? (
                                <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={<CreditCardIcon />}
                                    onClick={handleManageSubscription}
                                >
                                    Manage Subscription
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        variant="contained"
                                        size="small"
                                        onClick={() => handleSubscribe('monthly')}
                                        disabled={subscriptionLoading}
                                        startIcon={subscriptionLoading ? <CircularProgress size={12} /> : <UpgradeIcon />}
                                    >
                                        {subscriptionLoading ? 'Starting...' : 'Subscribe Monthly'}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={() => handleSubscribe('annual')}
                                        disabled={subscriptionLoading}
                                        startIcon={<StarIcon />}
                                    >
                                        Subscribe Annual (Save 20%)
                                    </Button>
                                </>
                            )}
                        </Box>

                        {/* Right side - Account management */}
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<PersonIcon />}
                                onClick={() => setProfileDialogOpen(true)}
                            >
                                Update Profile
                            </Button>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<VpnKeyIcon />}
                                onClick={() => setPasswordDialogOpen(true)}
                            >
                                Change Password
                            </Button>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<LogoutIcon />}
                                onClick={handleCloudLogout}
                                color="error"
                            >
                                Logout
                            </Button>
                        </Box>
                    </Box>

                    <Divider sx={{ my: 2 }} />
                </>
            )}

            {/* Not Logged In State */}
            {authStatus.authMode === 'cloud' && !cloudUserInfo && !cloudUserLoading && (
                <Box sx={{ mb: 3 }}>
                    <Typography variant="body2" color="warning.main" sx={{ mb: 2 }}>
                        Please log in to access cloud features
                    </Typography>

                    <Button
                        variant="contained"
                        startIcon={<LoginIcon />}
                        onClick={handleCloudLogin}
                        size="small"
                    >
                        Login with JunctionRelay Cloud
                    </Button>
                </Box>
            )}

            {/* Update Profile Dialog */}
            <Dialog
                open={profileDialogOpen}
                onClose={() => {
                    setProfileDialogOpen(false);
                    setFirstName('');
                    setLastName('');
                }}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Update Profile</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Update your name and profile information.
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="First Name"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={profileLoading}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        label="Last Name"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={profileLoading}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            setProfileDialogOpen(false);
                            setFirstName('');
                            setLastName('');
                        }}
                        disabled={profileLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleUpdateProfile}
                        variant="contained"
                        disabled={profileLoading || (!firstName.trim() && !lastName.trim())}
                        startIcon={profileLoading ? <CircularProgress size={16} /> : undefined}
                    >
                        {profileLoading ? 'Updating...' : 'Update Profile'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Change Password Dialog */}
            <Dialog
                open={passwordDialogOpen}
                onClose={() => {
                    setPasswordDialogOpen(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                }}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Change Password</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Enter your current password and choose a new one.
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Current Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        disabled={passwordLoading}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        label="New Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={passwordLoading}
                        helperText="Password must be at least 8 characters long"
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        label="Confirm New Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={passwordLoading}
                        error={confirmPassword.length > 0 && newPassword !== confirmPassword}
                        helperText={confirmPassword.length > 0 && newPassword !== confirmPassword ? "Passwords do not match" : ""}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            setPasswordDialogOpen(false);
                            setCurrentPassword('');
                            setNewPassword('');
                            setConfirmPassword('');
                        }}
                        disabled={passwordLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleChangePassword}
                        variant="contained"
                        disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                        startIcon={passwordLoading ? <CircularProgress size={16} /> : undefined}
                    >
                        {passwordLoading ? 'Changing...' : 'Change Password'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};

export default Settings_AuthCloud;