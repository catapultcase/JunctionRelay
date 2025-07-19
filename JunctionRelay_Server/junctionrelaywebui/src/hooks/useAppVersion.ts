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
import { useEffect, useState } from "react";

interface VersionInfo {
    version: string | null;
    latest: string | null;
    isOutdated: boolean;
    source?: string;
}

export const useAppVersion = (): VersionInfo => {
    const [version, setVersion] = useState<string | null>(null);
    const [latest, setLatest] = useState<string | null>(null);
    const [isOutdated, setIsOutdated] = useState<boolean>(false);
    const [source, setSource] = useState<string | undefined>(undefined);

    useEffect(() => {
        const fetchVersionInfo = async () => {
            try {
                // Step 1: Check auth mode first
                const modeResponse = await fetch('/api/auth/mode');

                if (modeResponse.ok) {
                    const modeData = await modeResponse.json();
                    const authMode = modeData.mode || 'none';

                    // Only make ANY API calls for cloud auth mode with valid token
                    if (authMode === 'cloud') {
                        const proxyToken = localStorage.getItem('cloud_proxy_token');
                        if (proxyToken) {
                            // Step 2: Fetch current backend version (only for cloud users)
                            const res = await fetch("/api/settings/version");
                            const data = await res.json();
                            const currentVersion = data.version;
                            setVersion(currentVersion);

                            // Step 3: Fetch latest version from backend (only for cloud users)
                            const latestVersionRes = await fetch("/api/settings/version/latest");
                            if (!latestVersionRes.ok) {
                                throw new Error("Failed to fetch latest version from backend");
                            }

                            const latestVersionData = await latestVersionRes.json();
                            const latestVersion = latestVersionData.latest_version;
                            const versionSource = latestVersionData.source;

                            setLatest(latestVersion);
                            setSource(versionSource);

                            // Step 4: Compare versions
                            if (currentVersion && latestVersion && currentVersion !== latestVersion) {
                                // More sophisticated version comparison
                                const parseVersion = (version: string) => {
                                    const parts = version.replace(/^v/, "").split('.').map(Number);
                                    return parts[0] * 10000 + parts[1] * 100 + parts[2];
                                };

                                const currentVersionNum = parseVersion(currentVersion);
                                const latestVersionNum = parseVersion(latestVersion);
                                setIsOutdated(currentVersionNum < latestVersionNum);
                            } else {
                                setIsOutdated(false);
                            }
                        } else {
                            // Cloud mode but no token - set defaults
                            setVersion(null);
                            setLatest(null);
                            setIsOutdated(false);
                            setSource(undefined);
                        }
                    } else {
                        // Non-cloud mode (local/none) - NO API CALLS, set defaults
                        setVersion(null);
                        setLatest(null);
                        setIsOutdated(false);
                        setSource(undefined);
                    }
                } else {
                    // Can't determine auth mode - set defaults, no API calls
                    setVersion(null);
                    setLatest(null);
                    setIsOutdated(false);
                    setSource(undefined);
                }
            } catch (err) {
                console.error("[useAppVersion] Version check failed:", err);
                setVersion(null);
                setLatest(null);
                setIsOutdated(false);
                setSource(undefined);
            }
        };

        fetchVersionInfo();
    }, []);

    return { version, latest, isOutdated, source };
};