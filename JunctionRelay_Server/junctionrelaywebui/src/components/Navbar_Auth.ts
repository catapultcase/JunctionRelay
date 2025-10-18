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

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "auth/AuthContext";

type AuthMode = 'none' | 'local' | 'cloud';

interface AuthStatus {
    isAuthenticated: boolean;
    user: string | null;
    hasValidLicense: boolean;
    licenseType: string;
    backendAuthenticated: boolean;
    profileImageUrl: string | null;
}

export const useNavbarAuth = () => {
    const { user } = useAuth();
    const [authMode, setAuthMode] = useState<AuthMode>('none');
    const [authStatus, setAuthStatus] = useState<AuthStatus>({
        isAuthenticated: false,
        user: null,
        hasValidLicense: false,
        licenseType: 'Cloud',
        backendAuthenticated: false,
        profileImageUrl: null
    });

    const checkAuthStatus = useCallback(async () => {
        try {
            console.log('[NAVBAR] Checking unified auth status...');

            const response = await fetch('/api/unified-auth/status');
            if (!response.ok) {
                console.warn('[NAVBAR] Failed to get unified auth status');
                setAuthMode('none');
                setAuthStatus({
                    isAuthenticated: false,
                    user: null,
                    hasValidLicense: false,
                    licenseType: 'Cloud',
                    backendAuthenticated: false,
                    profileImageUrl: null
                });
                return;
            }

            const statusData = await response.json();
            console.log('[NAVBAR] Unified auth status:', statusData);

            // Set mode from server
            setAuthMode(statusData.authMode || 'none');

            // Update state
            setAuthStatus({
                isAuthenticated: statusData.isAuthenticated || false,
                user: statusData.user || statusData.currentUser || null,
                hasValidLicense: statusData.hasValidLicense || false,
                licenseType: statusData.licenseType ||
                    (statusData.authMode === 'local' ? 'Local' : 'Cloud'),
                backendAuthenticated: statusData.backendAuthenticated ??
                    statusData.isAuthenticated ?? false,
                profileImageUrl: statusData.profileImageUrl || null
            });
        } catch (error) {
            console.error('[NAVBAR] Error checking unified auth status:', error);
            setAuthMode('none');
            setAuthStatus({
                isAuthenticated: false,
                user: null,
                hasValidLicense: false,
                licenseType: 'Cloud',
                backendAuthenticated: false,
                profileImageUrl: null
            });
        }
    }, []);

    // Check auth status on mount and when user changes
    useEffect(() => {
        checkAuthStatus();
    }, [user, checkAuthStatus]);

    // Listen for auth changes
    useEffect(() => {
        const handleAuthChange = () => {
            console.log('[NAVBAR] Auth change event detected');
            checkAuthStatus();
        };

        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === 'cloud_proxy_token' ||
                event.key === 'junctionrelay_cloud_user' ||
                event.key === 'junctionrelay_token') {
                console.log('[NAVBAR] Storage change detected for auth token');
                handleAuthChange();
            }
        };

        window.addEventListener('auth-changed', handleAuthChange);
        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('auth-changed', handleAuthChange);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [checkAuthStatus]);

    return {
        authMode,
        authStatus,
        checkAuthStatus
    };
};