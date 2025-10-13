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
    Chip, Divider
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

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        {/* Left side - Subscription actions */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {!cloudUserInfo.hasValidLicense && (
                                <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>
                                    Upgrade to a Pro License
                                </Typography>
                            )}
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
                            {promoActive && !cloudUserInfo.hasValidLicense && (
                                <>
                                    <Typography variant="caption" color="success.main" sx={{ fontWeight: 'bold' }}>
                                        Enter promo code "{promoCode}" at checkout
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', mt: 0.5 }}>
                                        * Annual savings compared to monthly subscription price
                                    </Typography>
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
        </Paper>
    );
};

export default Settings_AuthCloud;