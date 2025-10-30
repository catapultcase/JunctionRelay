/*
 * MUI Gauge Element - Alternate gauge using MUI X Charts
 */

import React, { useMemo } from 'react';
import { Gauge } from '@mui/x-charts';

export interface MUIGaugeElementProps {
  width: number;
  height: number;
  properties: {
    value?: number;
    minValue?: number;
    maxValue?: number;
    startAngle?: number;
    endAngle?: number;
    innerRadius?: string;
    outerRadius?: string;
    cornerRadius?: string;
    valueLabel?: string;
    showValue?: boolean;
    // Arc colors
    gaugeColor?: string;
    referenceArcColor?: string;
    // Text styling
    textColor?: string;
    textFontSize?: number;
    textFontFamily?: string;
    textFontWeight?: number | string;
    // Container
    backgroundColor?: string;
  };
}

export const FrameEngine_MUIGaugeElement: React.FC<MUIGaugeElementProps> = ({
  width,
  height,
  properties,
}) => {
  const {
    value = 50,
    minValue = 0,
    maxValue = 100,
    startAngle = -90,
    endAngle = 90,
    innerRadius = '70%',
    outerRadius = '100%',
    cornerRadius = '50%',
    valueLabel = '',
    showValue = true,
    gaugeColor = '#2196f3',
    referenceArcColor = '#e0e0e0',
    textColor = '#333333',
    textFontSize = 0,
    textFontFamily = 'Roboto, sans-serif',
    textFontWeight = 600,
    backgroundColor = 'transparent',
  } = properties;

  // Ensure value is within bounds
  const clampedValue = useMemo(() => {
    return Math.max(minValue, Math.min(maxValue, value));
  }, [value, minValue, maxValue]);

  // Calculate text font size - use provided size or auto-calculate
  const calculatedTextSize = textFontSize > 0
    ? textFontSize
    : Math.min(width, height) * 0.15;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor,
        overflow: 'hidden',
      }}
    >
      <Gauge
        width={width}
        height={height}
        value={clampedValue}
        valueMin={minValue}
        valueMax={maxValue}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        cornerRadius={cornerRadius}
        text={showValue ? (params: { value: number | null }) => `${params.value ?? 0}${valueLabel}` : () => ''}
        sx={{
          '& .MuiGauge-valueArc': {
            fill: gaugeColor,
          },
          '& .MuiGauge-referenceArc': {
            fill: referenceArcColor,
          },
          '& .MuiGauge-valueText': {
            fontSize: `${calculatedTextSize}px !important`,
            fontWeight: `${textFontWeight} !important`,
            fontFamily: `${textFontFamily} !important`,
            fill: `${textColor} !important`,
          },
          '& text': {
            fill: `${textColor} !important`,
            fontSize: `${calculatedTextSize}px !important`,
            fontWeight: `${textFontWeight} !important`,
            fontFamily: `${textFontFamily} !important`,
          },
        }}
      />
    </div>
  );
};
