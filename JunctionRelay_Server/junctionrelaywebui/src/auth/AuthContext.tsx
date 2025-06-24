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

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type AuthMode = 'none' | 'local' | 'cloud';

interface AuthUser {
    username: string;
    token: string;
    expiresAt: Date;
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

    const clearStoredAuth = () => {
        // Clear local auth
        localStorage.removeItem('junctionrelay_token');
        localStorage.removeItem('junctionrelay_username');
        localStorage.removeItem('junctionrelay_expiry');

        // Clear cloud auth
        localStorage.removeItem('cloud_proxy_token');

        setUser(null);
        setCloudUserInfo(null);
    };

    const checkCloudAuth = async (): Promise<AuthUser | null> => {
        const proxyToken = localStorage.getItem('cloud_proxy_token');
        if (!proxyToken) {
            setCloudUserInfo(null);
            return null;
        }

        try {
            // Validate token and get user info
            const response = await fetch('/api/cloud-auth/user-info', {
                headers: { 'Authorization': `Bearer ${proxyToken}` }
            });

            if (response.ok) {
                const data: CloudUserInfo = await response.json();
                setCloudUserInfo(data);

                return {
                    username: data.email || 'cloud-user',
                    token: proxyToken,
                    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
                    authType: 'cloud',
                    email: data.email,
                    userId: data.userId
                };
            } else {
                // Token is invalid, clear it
                localStorage.removeItem('cloud_proxy_token');
                setCloudUserInfo(null);
                return null;
            }
        } catch (error) {
            console.error('Error checking cloud auth:', error);
            localStorage.removeItem('cloud_proxy_token');
            setCloudUserInfo(null);
            return null;
        }
    };

    const checkLocalAuth = async (): Promise<AuthUser | null> => {
        const storedToken = localStorage.getItem('junctionrelay_token');
        const storedUsername = localStorage.getItem('junctionrelay_username');
        const storedExpiry = localStorage.getItem('junctionrelay_expiry');

        if (!storedToken || !storedUsername || !storedExpiry) {
            return null;
        }

        const expiryDate = new Date(storedExpiry);
        if (expiryDate <= new Date()) {
            // Token expired
            localStorage.removeItem('junctionrelay_token');
            localStorage.removeItem('junctionrelay_username');
            localStorage.removeItem('junctionrelay_expiry');
            return null;
        }

        try {
            const validateRes = await fetch('/api/auth/validate', {
                headers: { 'Authorization': `Bearer ${storedToken}` }
            });

            if (validateRes.ok) {
                return {
                    username: storedUsername,
                    token: storedToken,
                    expiresAt: expiryDate,
                    authType: 'local'
                };
            } else {
                // Token is invalid
                localStorage.removeItem('junctionrelay_token');
                localStorage.removeItem('junctionrelay_username');
                localStorage.removeItem('junctionrelay_expiry');
                return null;
            }
        } catch (error) {
            console.error('Error validating local token:', error);
            localStorage.removeItem('junctionrelay_token');
            localStorage.removeItem('junctionrelay_username');
            localStorage.removeItem('junctionrelay_expiry');
            return null;
        }
    };

    const checkAuthStatus = async () => {
        try {
            // 1) Get current auth mode
            const modeRes = await fetch('/api/auth/mode');
            if (modeRes.ok) {
                const modeData = await modeRes.json();
                const currentMode = modeData.mode || 'none';
                setAuthMode(currentMode);

                // 2) Check if authentication is enabled
                setAuthEnabled(currentMode !== 'none');

                // 3) Check configuration status for local mode
                if (currentMode === 'local') {
                    const statusRes = await fetch('/api/auth/status');
                    if (statusRes.ok) {
                        const statusData = await statusRes.json();
                        setIsConfigured(statusData.isConfigured || false);
                    } else {
                        setIsConfigured(false);
                    }
                } else {
                    setIsConfigured(true); // Non-local modes don't need setup
                }

                // 4) Check authentication based on mode
                let authenticatedUser: AuthUser | null = null;

                if (currentMode === 'local') {
                    authenticatedUser = await checkLocalAuth();
                } else if (currentMode === 'cloud') {
                    authenticatedUser = await checkCloudAuth();
                }

                setUser(authenticatedUser);
            } else {
                // Fallback if mode check fails
                setAuthMode('none');
                setAuthEnabled(false);
                setIsConfigured(true);
                clearStoredAuth();
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            setAuthMode('none');
            setAuthEnabled(false);
            setIsConfigured(false);
            clearStoredAuth();
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (username: string, password: string): Promise<boolean> => {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();

            if (!data.token) {
                console.error('No token received in login response');
                return false;
            }

            const expiresAt = new Date(data.expiresAt);

            localStorage.setItem('junctionrelay_token', data.token);
            localStorage.setItem('junctionrelay_username', data.username);
            localStorage.setItem('junctionrelay_expiry', expiresAt.toISOString());

            setUser({
                username: data.username,
                token: data.token,
                expiresAt,
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
            if (user?.authType === 'local' && user?.token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${user.token}` }
                }).catch(() => { });
            } else if (user?.authType === 'cloud' && user?.token) {
                await fetch('/api/cloud-auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${user.token}` }
                }).catch(() => { });
            }
        } catch (error) {
            console.error('Error during logout:', error);
        } finally {
            clearStoredAuth();
        }
    };

    // Monitor for auth mode changes and cloud token updates
    useEffect(() => {
        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === 'cloud_proxy_token' ||
                event.key === 'junctionrelay_token') {
                console.log('Auth token change detected, rechecking status...');
                checkAuthStatus();
            }
        };

        const handleAuthChange = () => {
            console.log('Auth change event detected, rechecking status...');
            checkAuthStatus();
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('auth-changed', handleAuthChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
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