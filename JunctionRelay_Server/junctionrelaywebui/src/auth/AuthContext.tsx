/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024-present Jonathan Mills, CatapultCase
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

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type AuthMode = 'none' | 'local' | 'cloud';

interface AuthUser {
    username: string;
    authType: 'local' | 'cloud';
    email?: string;
    userId?: string;
}

interface CloudUserInfo {
    email?: string;
    userId?: string;
    hasValidLicense: boolean;
    message?: string;
}

interface AuthContextType {
    user: AuthUser | null;
    authMode: AuthMode;
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
    isAuthenticated: boolean;
    isLoading: boolean;
    isConfigured: boolean;
    authEnabled: boolean;
    checkAuthStatus: () => Promise<void>;
    cloudUserInfo: CloudUserInfo | null;
    hasValidLicense: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [authMode, setAuthMode] = useState<AuthMode>('none');
    const [isLoading, setIsLoading] = useState(true);
    const [isConfigured, setIsConfigured] = useState(false);
    const [authEnabled, setAuthEnabled] = useState(false);
    const [cloudUserInfo, setCloudUserInfo] = useState<CloudUserInfo | null>(null);

    const clearAuth = () => {
        // Clear any legacy localStorage keys
        localStorage.removeItem('junctionrelay_token');
        localStorage.removeItem('junctionrelay_username');
        localStorage.removeItem('junctionrelay_expiry');
        localStorage.removeItem('cloud_proxy_token');
        localStorage.removeItem('junctionrelay_cloud_user');

        setUser(null);
        setCloudUserInfo(null);
    };

    const checkSession = async (mode: AuthMode): Promise<AuthUser | null> => {
        // Validate session via the /me endpoint (cookie sent automatically on same-origin)
        try {
            const response = await fetch('/api/unified-auth/me');
            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            if (mode === 'cloud') {
                setCloudUserInfo({
                    email: data.email,
                    userId: data.userId,
                    hasValidLicense: data.hasValidLicense || false,
                });
                return {
                    username: data.email || 'cloud-user',
                    authType: 'cloud',
                    email: data.email,
                    userId: data.userId,
                };
            } else {
                // Local auth
                return {
                    username: data.username || 'local-user',
                    authType: 'local',
                };
            }
        } catch (error) {
            console.error('Error checking session:', error);
            return null;
        }
    };

    const checkAuthStatus = async () => {
        try {
            const configRes = await fetch('/api/unified-auth/config');
            if (configRes.ok) {
                const config = await configRes.json();
                const currentMode = config.authMode || 'none';
                setAuthMode(currentMode);
                setAuthEnabled(currentMode !== 'none');
                setIsConfigured(config.isConfigured);

                let authenticatedUser: AuthUser | null = null;

                if (currentMode === 'local' || currentMode === 'cloud') {
                    authenticatedUser = await checkSession(currentMode);
                }

                if (!authenticatedUser) {
                    setCloudUserInfo(null);
                }
                setUser(authenticatedUser);
            } else {
                setAuthMode('none');
                setAuthEnabled(false);
                setIsConfigured(true);
                clearAuth();
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            setAuthMode('none');
            setAuthEnabled(false);
            setIsConfigured(false);
            clearAuth();
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (username: string, password: string): Promise<boolean> => {
        try {
            // Same-origin: cookies sent automatically
            const response = await fetch('/api/unified-auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();

            if (!data.authenticated) {
                console.error('Login response did not indicate success');
                return false;
            }

            // Server set httpOnly cookie; just update local state
            setUser({
                username: data.username,
                authType: 'local'
            });

            return true;
        } catch (err) {
            console.error('Login error:', err);
            return false;
        }
    };

    const logout = async () => {
        try {
            // Same-origin: cookie sent automatically
            await fetch('/api/unified-auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }).catch(() => { });
        } catch (error) {
            console.error('Error during logout:', error);
        } finally {
            clearAuth();
        }
    };

    // Listen for auth-changed custom events
    useEffect(() => {
        const handleAuthChange = () => {
            checkAuthStatus();
        };

        window.addEventListener('auth-changed', handleAuthChange);

        return () => {
            window.removeEventListener('auth-changed', handleAuthChange);
        };
    }, []);

    useEffect(() => {
        checkAuthStatus();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const value: AuthContextType = {
        user,
        authMode,
        login,
        logout,
        isAuthenticated: !!user,
        isLoading,
        isConfigured,
        authEnabled,
        checkAuthStatus,
        cloudUserInfo,
        hasValidLicense: cloudUserInfo?.hasValidLicense || false
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
