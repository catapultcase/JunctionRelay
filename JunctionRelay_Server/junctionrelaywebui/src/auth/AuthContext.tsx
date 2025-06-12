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

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthUser {
    username: string;
    token: string;
    expiresAt: Date;
}

interface AuthContextType {
    user: AuthUser | null;
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
    isConfigured: boolean;
    authEnabled: boolean;
    checkAuthStatus: () => Promise<void>;
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
    const [isLoading, setIsLoading] = useState(true);
    const [isConfigured, setIsConfigured] = useState(false);
    const [authEnabled, setAuthEnabled] = useState(false);  // Default to false instead of true

    const clearStoredAuth = () => {
        localStorage.removeItem('junctionrelay_token');
        localStorage.removeItem('junctionrelay_username');
        localStorage.removeItem('junctionrelay_expiry');
        setUser(null);
    };

    const checkAuthStatus = async () => {
        try {
            // 1) Check if setup is complete
            const statusRes = await fetch('/api/auth/status');
            const statusData = await statusRes.json();
            setIsConfigured(statusData.isConfigured);

            // 2) Check if authentication is enabled using the dedicated endpoint
            const authEnabledRes = await fetch('/api/auth/enabled');
            const authEnabledData = await authEnabledRes.json();
            setAuthEnabled(authEnabledData.enabled === true);

            // 3) If auth is enabled, attempt to restore and validate existing token
            if (authEnabledData.enabled === true) {
                const storedToken = localStorage.getItem('junctionrelay_token');
                const storedUsername = localStorage.getItem('junctionrelay_username');
                const storedExpiry = localStorage.getItem('junctionrelay_expiry');

                if (storedToken && storedUsername && storedExpiry) {
                    const expiryDate = new Date(storedExpiry);
                    if (expiryDate > new Date()) {
                        const validateRes = await fetch('/api/auth/validate', {
                            headers: { 'Authorization': `Bearer ${storedToken}` }
                        });
                        if (validateRes.ok) {
                            setUser({
                                username: storedUsername,
                                token: storedToken,
                                expiresAt: expiryDate
                            });
                        } else {
                            clearStoredAuth();
                        }
                    } else {
                        clearStoredAuth();
                    }
                }
            } else {
                // if auth is disabled, ensure no stale user remains
                clearStoredAuth();
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            // On error, default to auth disabled to avoid blocking access
            setAuthEnabled(false);
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
            if (!response.ok) return false;

            const data = await response.json();
            const expiresAt = new Date(data.expiresAt);

            localStorage.setItem('junctionrelay_token', data.token);
            localStorage.setItem('junctionrelay_username', data.username);
            localStorage.setItem('junctionrelay_expiry', expiresAt.toISOString());

            setUser({ username: data.username, token: data.token, expiresAt });
            return true;
        } catch (err) {
            console.error('Login error:', err);
            return false;
        }
    };

    const logout = () => {
        if (user?.token) {
            fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${user.token}` }
            }).catch(() => { });
        }
        clearStoredAuth();
    };

    useEffect(() => {
        checkAuthStatus();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const value: AuthContextType = {
        user,
        login,
        logout,
        isAuthenticated: !!user,
        isLoading,
        isConfigured,
        authEnabled,
        checkAuthStatus
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};