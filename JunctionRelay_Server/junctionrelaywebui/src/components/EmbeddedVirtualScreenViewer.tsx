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

import React, { useMemo, useEffect, useRef } from 'react';
import { VirtualScreenViewerComponent } from '../pages/VirtualScreenViewer';
import { WebSocketDataProvider } from '../providers/WebSocketDataProvider';

interface EmbeddedVirtualScreenViewerProps {
    deviceId: string;
    deviceData?: any;
    containerHeight?: number;
    showControls?: boolean;
    onFullscreenClick?: () => void;
}

const EmbeddedVirtualScreenViewer: React.FC<EmbeddedVirtualScreenViewerProps> = ({
    deviceId,
    deviceData,
    containerHeight = 400,
    showControls = false,
    onFullscreenClick
}) => {
    const dataProvider = useMemo(() => {
        const savedPollRate = localStorage.getItem('virtual_screen_poll_rate');
        const defaultPollRate = savedPollRate ? parseInt(savedPollRate, 10) : 250;
        return new WebSocketDataProvider({
            deviceId,
            enabled: true,
            defaultPollRate
        });
    }, [deviceId]);

    const providerRef = useRef(dataProvider);
    providerRef.current = dataProvider;

    useEffect(() => {
        return () => {
            const provider = providerRef.current;
            if (!provider) return;

            provider.disconnect();
            setTimeout(() => {
                provider.cleanup();
            }, 100);
        };
    }, []);

    return (
        <VirtualScreenViewerComponent
            deviceId={deviceId}
            deviceData={deviceData}
            dataProvider={dataProvider}
            isStandalone={false}
            containerHeight={containerHeight}
            showControls={showControls}
            onFullscreenClick={onFullscreenClick}
        />
    );
};

export default EmbeddedVirtualScreenViewer;