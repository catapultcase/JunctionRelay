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

import React from 'react';

interface AssetImageElementProps {
    assetImageUrl?: string;
    imageFit?: 'cover' | 'contain' | 'fill' | 'tile' | 'stretch' | 'none';
    opacity?: number;
    width: number;
    height: number;
}

export const FrameEngine_Asset_Image: React.FC<AssetImageElementProps> = ({
    assetImageUrl,
    imageFit = 'cover',
    opacity = 1,
    width,
    height,
}) => {
    // If no image URL, show placeholder
    if (!assetImageUrl) {
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
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🖼️</div>
                    <div>No image selected</div>
                    <div style={{ fontSize: '12px', marginTop: '4px' }}>
                        Select an image in properties
                    </div>
                </div>
            </div>
        );
    }

    // Build the image URL
    const imageUrl = assetImageUrl.startsWith('http')
        ? assetImageUrl
        : `/api/frameengine/images/${assetImageUrl}/content`;

    // Handle tile mode separately with background-image
    if (imageFit === 'tile') {
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    backgroundImage: `url(${imageUrl})`,
                    backgroundSize: 'auto',
                    backgroundPosition: 'top left',
                    backgroundRepeat: 'repeat',
                    opacity: opacity,
                }}
            />
        );
    }

    // Get CSS object-fit value
    const getObjectFit = (): React.CSSProperties['objectFit'] => {
        switch (imageFit) {
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
                backgroundColor: 'transparent',
            }}
        >
            <img
                src={imageUrl}
                alt="Asset"
                draggable={false}
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
                    const target = e.target as HTMLImageElement;
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
                                    <div>Failed to load image</div>
                                    <div style="font-size: 12px; margin-top: 4px;">${assetImageUrl}</div>
                                </div>
                            </div>
                        `;
                    }
                }}
            />
        </div>
    );
};

export default FrameEngine_Asset_Image;