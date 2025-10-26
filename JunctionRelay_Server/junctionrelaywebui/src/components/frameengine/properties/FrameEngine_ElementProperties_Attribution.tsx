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
import { OpenInNew as LinkIcon } from '@mui/icons-material';

interface LibraryAttributionProps {
    libraries: Array<{
        name: string;
        url?: string;
        license: string;
    }>;
}

export const LibraryAttribution: React.FC<LibraryAttributionProps> = ({ libraries }) => {
    if (libraries.length === 0) return null;

    return (
        <div style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: '#f5f5f5',
            borderRadius: '6px',
            borderLeft: '3px solid #1976d2',
        }}>
            <div style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#555',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
            }}>
                Powered By
            </div>
            {libraries.map((lib, index) => (
                <div key={index} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: index < libraries.length - 1 ? '6px' : 0,
                }}>
                    {lib.url ? (
                        <a
                            href={lib.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                fontSize: '11px',
                                color: '#1976d2',
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontWeight: 500,
                            }}
                        >
                            <span>{lib.name}</span>
                            <LinkIcon style={{ fontSize: '12px' }} />
                        </a>
                    ) : (
                        <span style={{
                            fontSize: '11px',
                            color: '#555',
                            fontWeight: 500,
                        }}>
                            {lib.name}
                        </span>
                    )}
                    <span style={{
                        fontSize: '10px',
                        color: '#888',
                        padding: '2px 6px',
                        backgroundColor: '#e0e0e0',
                        borderRadius: '3px',
                    }}>
                        {lib.license}
                    </span>
                </div>
            ))}
        </div>
    );
};
