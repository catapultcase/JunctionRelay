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
import GaugeComponent from 'react-gauge-component';

interface GaugeElementProps {
    sensorTag: string;
    sensorValue?: number;
    width: number;
    height: number;
    gaugeType?: 'semicircle' | 'radial';
    minValue?: number;
    maxValue?: number;
    valueLabel?: string;
    showLabels?: boolean;
    showTicks?: boolean;
    pointerType?: 'needle' | 'blob' | 'arrow';
    pointerColor?: string;
    pointerLength?: number;
    pointerWidth?: number;
    pointerElastic?: boolean;
    pointerAnimationDelay?: number;
    arcColors?: Array<{ limit: number; color: string }>;
    arcPadding?: number;
    arcWidth?: number;
    cornerRadius?: number;
    valueLabelColor?: string;
    tickLabelColor?: string;
}

export const FrameEngine_GaugeElement: React.FC<GaugeElementProps> = ({
    sensorValue = 0,
    width,
    height,
    gaugeType = 'semicircle',
    minValue = 0,
    maxValue = 100,
    valueLabel = '',
    showLabels = true,
    showTicks = true,
    pointerType = 'needle',
    pointerColor = '#464A4F',
    pointerLength = 0.7,
    pointerWidth = 15,
    pointerElastic = true,
    pointerAnimationDelay = 0,
    arcColors = [
        { limit: 33, color: '#5BE12C' },
        { limit: 66, color: '#F5CD19' },
        { limit: 100, color: '#EA4228' }
    ],
    arcPadding = 0.02,
    arcWidth = 0.2,
    cornerRadius = 5,
    valueLabelColor = '#333',
    tickLabelColor = '#666',
}) => {
    // Normalize the sensor value
    const normalizedValue = Math.max(minValue, Math.min(maxValue, sensorValue ?? minValue));
    const percentage = ((normalizedValue - minValue) / (maxValue - minValue)) * 100;

    // Create a key that changes when ANY property changes
    // This forces react-gauge-component to fully re-render on all prop changes
    const gaugeKey = `${gaugeType}-${pointerType}-${arcWidth}-${arcPadding}-${cornerRadius}-${pointerColor}-${pointerLength}-${pointerWidth}-${pointerElastic}-${pointerAnimationDelay}-${showLabels}-${showTicks}-${valueLabelColor}-${tickLabelColor}-${valueLabel}-${minValue}-${maxValue}`;

    // Convert arcColors to subArcs format with proper limits
    const subArcs = arcColors.map((arc) => ({
        limit: arc.limit,
        color: arc.color,
        showTick: showTicks,
    }));

    // Calculate the gauge size - use the smaller dimension for square aspect ratio
    // The gauge library has internal padding, so we need to scale up to compensate
    // Use 110% to account for library's internal margins
    const baseSize = Math.min(width, height);
    const gaugeSize = baseSize * 1.1;

    return (
        <div
            key={gaugeKey}
            style={{
                width: `${width}px`,
                height: `${height}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            <div style={{
                width: `${gaugeSize}px`,
                height: `${gaugeSize}px`,
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
            }}>
                <GaugeComponent
                    key={gaugeKey}
                    type={gaugeType}
                    value={percentage}
                    minValue={0}
                    maxValue={100}
                    arc={{
                        padding: arcPadding,
                        width: arcWidth,
                        cornerRadius: cornerRadius,
                        subArcs: subArcs,
                    }}
                    pointer={{
                        type: pointerType,
                        color: pointerColor,
                        length: pointerLength,
                        width: pointerWidth,
                        elastic: pointerElastic,
                        animationDelay: pointerAnimationDelay,
                    }}
                    labels={{
                        valueLabel: {
                            formatTextValue: () => valueLabel || `${normalizedValue.toFixed(1)}`,
                            style: {
                                fontSize: gaugeSize * 0.08,
                                fill: valueLabelColor,
                                textShadow: 'none',
                            },
                        },
                        tickLabels: showLabels ? {
                            type: 'inner',
                            ticks: [
                                { value: 0 },
                                { value: 25 },
                                { value: 50 },
                                { value: 75 },
                                { value: 100 }
                            ],
                            defaultTickValueConfig: {
                                formatTextValue: (value: number) => {
                                    const actualValue = minValue + (value / 100) * (maxValue - minValue);
                                    return actualValue.toFixed(0);
                                },
                                style: {
                                    fontSize: gaugeSize * 0.05,
                                    fill: tickLabelColor,
                                }
                            }
                        } : undefined
                    }}
                />
            </div>
        </div>
    );
};

export default FrameEngine_GaugeElement;
