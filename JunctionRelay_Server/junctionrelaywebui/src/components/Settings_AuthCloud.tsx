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
    Chip, Divider, Checkbox, FormControlLabel, TextField, Dialog, DialogTitle,
    DialogContent, DialogActions, Alert, List, ListItem, ListItemIcon, ListItemText,
    IconButton
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
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import KeyIcon from '@mui/icons-material/Key';
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

    // Fallback authentication state
    const [fallbackEnabled, setFallbackEnabled] = useState<boolean>(false);
    const [fallbackUserConfigured, setFallbackUserConfigured] = useState<boolean>(false);
    const [fallbackStoredUsername, setFallbackStoredUsername] = useState<string>('');
    const [fallbackLoading, setFallbackLoading] = useState<boolean>(false);

    // Fallback setup dialog
    const [showFallbackSetup, setShowFallbackSetup] = useState<boolean>(false);
    const [fallbackUsername, setFallbackUsername] = useState<string>('');
    const [fallbackPassword, setFallbackPassword] = useState<string>('');
    const [fallbackConfirmPassword, setFallbackConfirmPassword] = useState<string>('');

    // Fallback management dialogs
    const [showChangeUsername, setShowChangeUsername] = useState<boolean>(false);
    const [newUsername, setNewUsername] = useState<string>('');
    const [showChangePassword, setShowChangePassword] = useState<boolean>(false);
    const [currentPassword, setCurrentPassword] = useState<string>('');
    const [newPassword, setNewPassword] = useState<string>('');
    const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
    const [showRemoveConfirm, setShowRemoveConfirm] = useState<boolean>(false);

    // Environment variable for Stripe billing portal
    const stripeBillingPortalUrl = 'https://billing.stripe.com/p/login/00w7sN7ZS6RE7q87rwcjS00';

    // Promo configuration
    const promoCode = 'EARLYACCESS';
    const promoDiscountPercent = 33;
    const promoExpiryDate = new Date('2025-12-31T23:59:59'); // expiry date

    // Check if promo is currently active based on expiry date
    const promoActive = new Date() < promoExpiryDate;

    // Base prices
    const baseMonthlyPrice = 1.99;
    const baseAnnualPrice = 19.99;

    // Calculate discounted prices
    const monthlyPrice = promoActive
        ? (baseMonthlyPrice * (1 - promoDiscountPercent / 100)).toFixed(2)
        : baseMonthlyPrice.toFixed(2);
    const annualPrice = promoActive
        ? (baseAnnualPrice * (1 - promoDiscountPercent / 100)).toFixed(2)
        : baseAnnualPrice.toFixed(2);

    // Calculate total savings for annual plan compared to monthly price
    // When promo is active, compare to standard monthly price (not discounted)
    const monthlyPriceYearly = baseMonthlyPrice * 12;
    const annualSavingsPercent = promoActive
        ? Math.round(((monthlyPriceYearly - parseFloat(annualPrice)) / monthlyPriceYearly) * 100)
        : 17; // Just the 2-month savings (rounded)

    // Fetch subscription details when user has a valid license
    useEffect(() => {
        if (cloudUserInfo?.hasValidLicense) {
            fetchSubscriptionDetails();
        } else {
            setSubscriptionDetails(null);
        }
    }, [cloudUserInfo?.hasValidLicense]);

    // Fetch fallback status when in cloud mode and authenticated
    useEffect(() => {
        if (authStatus.authMode === 'cloud' && cloudUserInfo) {
            fetchFallbackStatus();
        }
    }, [authStatus.authMode, cloudUserInfo]);

    const fetchSubscriptionDetails = async () => {
        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            if (!cloudToken) return;

            const response = await fetch("/api/unified-auth/subscription-status", {
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

    const handleManageAccount = () => {
        // Open Clerk user portal for account management
        window.open('https://accounts.junctionrelay.com/user', '_blank');
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

            const response = await fetch("/api/unified-auth/create-checkout", {
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
                    await fetch("/api/unified-auth/clear-subscription-cache", {
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

    // Fallback authentication management functions
    const fetchFallbackStatus = async () => {
        try {
            const response = await fetch('/api/unified-auth/fallback/status');
            if (response.ok) {
                const data = await response.json();
                setFallbackEnabled(data.enabled);
                setFallbackUserConfigured(data.userConfigured);
                setFallbackStoredUsername(data.username || '');
            }
        } catch (error) {
            console.error('Error fetching fallback status:', error);
        }
    };

    const handleFallbackToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked;

        if (checked) {
            // Show setup dialog
            setShowFallbackSetup(true);
        } else {
            // Disable fallback
            await handleDisableFallback();
        }
    };

    const handleEnableFallback = async () => {
        if (fallbackPassword !== fallbackConfirmPassword) {
            showSnackbar('Passwords do not match', 'error');
            return;
        }

        if (fallbackUsername.length < 3) {
            showSnackbar('Username must be at least 3 characters long', 'error');
            return;
        }

        if (fallbackPassword.length < 6) {
            showSnackbar('Password must be at least 6 characters long', 'error');
            return;
        }

        setFallbackLoading(true);

        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            const response = await fetch('/api/unified-auth/fallback/enable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cloudToken}`
                },
                body: JSON.stringify({
                    username: fallbackUsername,
                    password: fallbackPassword
                })
            });

            if (response.ok) {
                showSnackbar('Fallback authentication enabled successfully', 'success');
                setShowFallbackSetup(false);
                setFallbackUsername('');
                setFallbackPassword('');
                setFallbackConfirmPassword('');
                await fetchFallbackStatus();
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to enable fallback');
            }
        } catch (error: any) {
            showSnackbar(error.message || 'Error enabling fallback authentication', 'error');
        } finally {
            setFallbackLoading(false);
        }
    };

    const handleDisableFallback = async () => {
        setFallbackLoading(true);

        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            const response = await fetch('/api/unified-auth/fallback/disable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cloudToken}`
                },
                body: JSON.stringify({
                    removeUser: true
                })
            });

            if (response.ok) {
                showSnackbar('Fallback authentication disabled', 'success');
                await fetchFallbackStatus();
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to disable fallback');
            }
        } catch (error: any) {
            showSnackbar(error.message || 'Error disabling fallback authentication', 'error');
            // Revert checkbox state
            setFallbackEnabled(true);
        } finally {
            setFallbackLoading(false);
        }
    };

    const handleChangeUsername = async () => {
        if (newUsername.trim().length < 3) {
            showSnackbar('Username must be at least 3 characters long', 'error');
            return;
        }

        setFallbackLoading(true);

        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            const response = await fetch('/api/unified-auth/change-username', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cloudToken}`
                },
                body: JSON.stringify({
                    newUsername: newUsername.trim()
                })
            });

            if (response.ok) {
                showSnackbar('Fallback username changed successfully', 'success');
                setShowChangeUsername(false);
                setNewUsername('');
                await fetchFallbackStatus(); // Refresh to show new username
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to change username');
            }
        } catch (error: any) {
            showSnackbar(error.message || 'Error changing username', 'error');
        } finally {
            setFallbackLoading(false);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword !== confirmNewPassword) {
            showSnackbar('Passwords do not match', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showSnackbar('Password must be at least 6 characters long', 'error');
            return;
        }

        setFallbackLoading(true);

        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            const response = await fetch('/api/unified-auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cloudToken}`
                },
                body: JSON.stringify({
                    currentPassword: currentPassword,
                    newPassword: newPassword
                })
            });

            if (response.ok) {
                showSnackbar('Fallback password changed successfully', 'success');
                setShowChangePassword(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmNewPassword('');
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to change password');
            }
        } catch (error: any) {
            showSnackbar(error.message || 'Error changing password', 'error');
        } finally {
            setFallbackLoading(false);
        }
    };

    const handleRemoveFallback = async () => {
        setFallbackLoading(true);

        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            const response = await fetch('/api/unified-auth/fallback/disable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cloudToken}`
                },
                body: JSON.stringify({
                    removeUser: true
                })
            });

            if (response.ok) {
                showSnackbar('Fallback account removed successfully', 'success');
                setShowRemoveConfirm(false);
                await fetchFallbackStatus();
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to remove fallback account');
            }
        } catch (error: any) {
            showSnackbar(error.message || 'Error removing fallback account', 'error');
        } finally {
            setFallbackLoading(false);
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
                bgcolor: 'rgba(255, 152, 0, 0.08)',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'rgba(255, 152, 0, 0.23)',
                mb: 2
            }}>
                <Typography variant="body2" color="warning.main" sx={{ fontWeight: 'medium', display: 'flex', alignItems: 'center', mb: 1 }}>
                    <VpnKeyIcon sx={{ mr: 1, fontSize: 18 }} />
                    Device Ownership
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    This backend database will linked to your cloud account upon login. Deleting the database will clear all data and generate a new backend identity.
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
                    Optional "Pro"" License Benefits
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Support the JunctionRelay project and access automatic updates on Windows, expanded cloud device management and cloud backup service.
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

                    {!cloudUserInfo.hasValidLicense && (
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                            Upgrade to a Pro License
                        </Typography>
                    )}

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
                                        {subscriptionLoading ? 'Starting...' : (
                                            <>
                                                Subscribe Monthly{' '}
                                                {promoActive && (
                                                    <span style={{ textDecoration: 'line-through', opacity: 0.6, marginLeft: '4px' }}>
                                                        ${baseMonthlyPrice.toFixed(2)}
                                                    </span>
                                                )}
                                                <span style={{ fontWeight: 'bold', marginLeft: '4px' }}>
                                                    ${monthlyPrice}/mo
                                                </span>
                                            </>
                                        )}
                                        {!subscriptionLoading && promoActive && (
                                            <Chip
                                                label={`${promoDiscountPercent}% OFF`}
                                                size="small"
                                                color="success"
                                                sx={{ ml: 1, height: 20 }}
                                            />
                                        )}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={() => handleSubscribe('annual')}
                                        disabled={subscriptionLoading}
                                        startIcon={<StarIcon />}
                                    >
                                        Subscribe Annually{' '}
                                        {promoActive && (
                                            <span style={{ textDecoration: 'line-through', opacity: 0.6, marginLeft: '4px' }}>
                                                ${baseAnnualPrice.toFixed(2)}
                                            </span>
                                        )}
                                        <span style={{ fontWeight: 'bold', marginLeft: '4px' }}>
                                            ${annualPrice}/yr
                                        </span>
                                        <Chip
                                            label={promoActive ? `${annualSavingsPercent}% OFF` : "Save 2 months"}
                                            size="small"
                                            color="success"
                                            sx={{ ml: 1, height: 20 }}
                                        />
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
                                onClick={handleManageAccount}
                            >
                                Manage Account
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

                    {/* Full-width promo code banner for free users */}
                    {!cloudUserInfo.hasValidLicense && promoActive && (
                        <Box sx={{ mt: 2, p: 1.5, backgroundColor: 'success.main', borderRadius: 1, opacity: 0.9 }}>
                            <Typography variant="body2" sx={{ color: 'white', textAlign: 'center' }}>
                                💡 Enter promo code <strong>'{promoCode}'</strong> at checkout for {promoDiscountPercent}% off until {promoExpiryDate.toLocaleDateString()}!
                            </Typography>
                        </Box>
                    )}

                    <Divider sx={{ my: 2 }} />

                    {/* Fallback Authentication Section */}
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                            Local Authentication Fallback
                        </Typography>
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Enable a local username/password as a fallback in case cloud authentication is unavailable.
                        </Alert>

                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={fallbackEnabled}
                                    onChange={handleFallbackToggle}
                                    disabled={fallbackLoading}
                                />
                            }
                            label="Enable Local Fallback Authentication"
                        />

                        {fallbackEnabled && fallbackUserConfigured && (
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle1" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                                    <CheckCircleIcon sx={{ mr: 1, fontSize: 20, color: 'success.main' }} />
                                    Fallback Account Configured
                                </Typography>

                                <List sx={{ bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 1, p: 0, mb: 2 }}>
                                    <ListItem
                                        secondaryAction={
                                            <IconButton
                                                onClick={() => setShowChangeUsername(true)}
                                                size="small"
                                                disabled={fallbackLoading}
                                            >
                                                <EditIcon />
                                            </IconButton>
                                        }
                                    >
                                        <ListItemIcon><PersonIcon /></ListItemIcon>
                                        <ListItemText
                                            primary="Username"
                                            secondary={fallbackStoredUsername || "Fallback username configured"}
                                        />
                                    </ListItem>
                                    <ListItem
                                        secondaryAction={
                                            <IconButton
                                                onClick={() => setShowChangePassword(true)}
                                                size="small"
                                                disabled={fallbackLoading}
                                            >
                                                <EditIcon />
                                            </IconButton>
                                        }
                                    >
                                        <ListItemIcon><KeyIcon /></ListItemIcon>
                                        <ListItemText
                                            primary="Password"
                                            secondary="••••••••"
                                        />
                                    </ListItem>
                                </List>

                                <Box>
                                    <Typography variant="subtitle2" gutterBottom>
                                        Account Management
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        startIcon={<DeleteIcon />}
                                        onClick={() => setShowRemoveConfirm(true)}
                                        disabled={fallbackLoading}
                                    >
                                        {fallbackLoading ? 'Removing...' : 'Remove Fallback Account'}
                                    </Button>
                                </Box>
                            </Box>
                        )}
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

            {/* Fallback Setup Dialog */}
            <Dialog open={showFallbackSetup} onClose={() => setShowFallbackSetup(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Setup Local Fallback Authentication</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Create a local username and password that can be used to access the system when cloud authentication is unavailable.
                    </Typography>
                    <TextField
                        fullWidth
                        label="Username"
                        value={fallbackUsername}
                        onChange={(e) => setFallbackUsername(e.target.value)}
                        disabled={fallbackLoading}
                        helperText="Minimum 3 characters"
                        sx={{ mb: 2, mt: 1 }}
                    />
                    <TextField
                        fullWidth
                        type="password"
                        label="Password"
                        value={fallbackPassword}
                        onChange={(e) => setFallbackPassword(e.target.value)}
                        disabled={fallbackLoading}
                        helperText="Minimum 6 characters"
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth
                        type="password"
                        label="Confirm Password"
                        value={fallbackConfirmPassword}
                        onChange={(e) => setFallbackConfirmPassword(e.target.value)}
                        disabled={fallbackLoading}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => {
                        setShowFallbackSetup(false);
                        setFallbackUsername('');
                        setFallbackPassword('');
                        setFallbackConfirmPassword('');
                    }} disabled={fallbackLoading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleEnableFallback}
                        variant="contained"
                        disabled={fallbackLoading || !fallbackUsername || !fallbackPassword || !fallbackConfirmPassword}
                    >
                        {fallbackLoading ? <CircularProgress size={20} /> : 'Enable Fallback'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Change Username Dialog */}
            <Dialog open={showChangeUsername} onClose={() => setShowChangeUsername(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Change Fallback Username</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="New Username"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        disabled={fallbackLoading}
                        helperText="Minimum 3 characters"
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => {
                        setShowChangeUsername(false);
                        setNewUsername('');
                    }} disabled={fallbackLoading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleChangeUsername}
                        variant="contained"
                        disabled={fallbackLoading || !newUsername}
                    >
                        {fallbackLoading ? <CircularProgress size={20} /> : 'Change Username'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Change Password Dialog */}
            <Dialog open={showChangePassword} onClose={() => setShowChangePassword(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Change Fallback Password</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        type="password"
                        label="Current Password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        disabled={fallbackLoading}
                        sx={{ mb: 2, mt: 1 }}
                    />
                    <TextField
                        fullWidth
                        type="password"
                        label="New Password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={fallbackLoading}
                        helperText="Minimum 6 characters"
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth
                        type="password"
                        label="Confirm New Password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        disabled={fallbackLoading}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => {
                        setShowChangePassword(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmNewPassword('');
                    }} disabled={fallbackLoading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleChangePassword}
                        variant="contained"
                        disabled={fallbackLoading || !currentPassword || !newPassword || !confirmNewPassword}
                    >
                        {fallbackLoading ? <CircularProgress size={20} /> : 'Change Password'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Remove Fallback Confirmation Dialog */}
            <Dialog open={showRemoveConfirm} onClose={() => setShowRemoveConfirm(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Remove Fallback Account?</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        This will remove your local fallback account. You will only be able to access the system via cloud authentication.
                    </Alert>
                    <Typography variant="body2" color="text.secondary">
                        Are you sure you want to continue?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowRemoveConfirm(false)} disabled={fallbackLoading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleRemoveFallback}
                        variant="contained"
                        color="error"
                        disabled={fallbackLoading}
                    >
                        {fallbackLoading ? <CircularProgress size={20} /> : 'Remove Fallback'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};

export default Settings_AuthCloud;