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
                // Step 1: Fetch current version
                const res = await fetch("/api/settings/version");
                if (res.ok) {
                    const data = await res.json();
                    const currentVersion = data.version;
                    setVersion(currentVersion);

                    // Step 2: Fetch latest version
                    const latestVersionRes = await fetch("/api/settings/version/latest");
                    if (latestVersionRes.ok) {
                        const latestVersionData = await latestVersionRes.json();
                        const latestVersion = latestVersionData.latest_version;
                        const versionSource = latestVersionData.source;

                        setLatest(latestVersion);
                        setSource(versionSource);

                        // Step 3: Compare versions
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
                        console.warn("[useAppVersion] Failed to fetch latest version:", latestVersionRes.status);
                        setLatest(null);
                        setIsOutdated(false);
                        setSource(undefined);
                    }
                } else {
                    console.warn("[useAppVersion] Failed to fetch version:", res.status);
                    setVersion(null);
                }
            } catch (err) {
                console.error("[useAppVersion] Version check failed:", err);
                // Keep any version we might have fetched, but clear update info
                setLatest(null);
                setIsOutdated(false);
                setSource(undefined);
            }
        };

        fetchVersionInfo();
    }, []);

    return { version, latest, isOutdated, source };
};