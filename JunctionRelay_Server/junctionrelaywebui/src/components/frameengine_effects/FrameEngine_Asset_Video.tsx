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

import React, { useRef, useEffect } from 'react';

interface AssetVideoElementProps {
    assetVideoUrl?: string;
    videoFit?: 'cover' | 'contain' | 'fill' | 'stretch' | 'none';
    videoLoop?: boolean;
    videoMuted?: boolean;
    videoAutoplay?: boolean;
    opacity?: number;
    width: number;
    height: number;
}

export const FrameEngine_Asset_Video: React.FC<AssetVideoElementProps> = ({
    assetVideoUrl,
    videoFit = 'cover',
    videoLoop = true,
    videoMuted = true,
    videoAutoplay = true,
    opacity = 1,
    width,
    height,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    // Ensure autoplay works by playing after mount
    useEffect(() => {
        if (videoAutoplay && videoRef.current) {
            videoRef.current.play().catch((error) => {
                console.warn('Video autoplay failed:', error);
            });
        }
    }, [videoAutoplay, assetVideoUrl]);

    // If no video URL, show placeholder
    if (!assetVideoUrl) {
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f0f0f0',
                    border: '2px dashed #ccc',
                    color: '#999',
                    fontSize: '14px',
                    textAlign: 'center',
                    padding: '16px',
                    boxSizing: 'border-box',
                }}
            >
                <div>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎬</div>
                    <div>No video selected</div>
                    <div style={{ fontSize: '12px', marginTop: '4px' }}>
                        Select a video in properties
                    </div>
                </div>
            </div>
        );
    }

    // Build the video URL
    const videoUrl = assetVideoUrl.startsWith('http')
        ? assetVideoUrl
        : `/api/frameengine/videos/${assetVideoUrl}/content`;

    // Get CSS object-fit value
    const getObjectFit = (): React.CSSProperties['objectFit'] => {
        switch (videoFit) {
            case 'cover':
                return 'cover';
            case 'contain':
                return 'contain';
            case 'fill':
            case 'stretch':
                return 'fill';
            case 'none':
                return 'none';
            default:
                return 'cover';
        }
    };

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
                backgroundColor: '#000',
            }}
        >
            <video
                ref={videoRef}
                src={videoUrl}
                loop={videoLoop}
                muted={videoMuted}
                autoPlay={videoAutoplay}
                playsInline
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: getObjectFit(),
                    display: 'block',
                    opacity: opacity,
                    pointerEvents: 'none',
                    userSelect: 'none',
                }}
                onError={(e) => {
                    // On error, show error placeholder
                    const target = e.target as HTMLVideoElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                        parent.innerHTML = `
                            <div style="
                                width: 100%;
                                height: 100%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                background-color: #ffebee;
                                border: 2px solid #f44336;
                                color: #c62828;
                                font-size: 14px;
                                text-align: center;
                                padding: 16px;
                                box-sizing: border-box;
                            ">
                                <div>
                                    <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
                                    <div>Failed to load video</div>
                                    <div style="font-size: 12px; margin-top: 4px;">${assetVideoUrl}</div>
                                </div>
                            </div>
                        `;
                    }
                }}
            />
        </div>
    );
};

export default FrameEngine_Asset_Video;