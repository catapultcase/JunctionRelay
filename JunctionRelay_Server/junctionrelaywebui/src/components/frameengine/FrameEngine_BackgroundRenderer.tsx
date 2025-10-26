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

import React, { useState, useEffect, useRef } from 'react';
import {
    useRive,
    Layout,
    Fit,
    Alignment,
} from '@rive-app/react-canvas';

// Types for Rive discovery
export interface DiscoveredInput {
    name: string;
    type: 'number' | 'boolean' | 'trigger' | 'unknown';
    currentValue?: any;
    ref?: any;
}

export interface DiscoveredStateMachine {
    name: string;
    inputNames: string[];
    inputs: DiscoveredInput[];
}

export interface DiscoveredDataBinding {
    name: string;
    type: 'number' | 'string' | 'boolean' | 'color' | 'trigger' | 'enum' | 'list' | 'image' | 'unknown';
    currentValue?: any;
    ref?: any;
}

// Background configuration types
export interface BackgroundConfig {
    type: 'color' | 'image' | 'video' | 'rive';
    color?: string;
    imageUrl?: string;
    imageFit?: 'cover' | 'contain' | 'fill' | 'tile' | 'stretch' | 'none';
    videoUrl?: string;
    videoFit?: 'cover' | 'contain' | 'fill' | 'stretch' | 'none';
    videoLoop?: boolean;
    videoMuted?: boolean;
    videoAutoplay?: boolean;
    riveFile?: string;
    riveStateMachine?: string;
    riveInputs?: Record<string, any>;
    riveBindings?: Record<string, any>;
}

// Component props
interface FrameEngine_BackgroundRendererProps {
    config: BackgroundConfig;
    width: number;
    height: number;
    fit?: 'none' | 'contain' | 'cover';
    onRiveDiscovery?: (machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[]) => void;
    onRiveLoad?: () => void;
    onRiveError?: (error: any) => void;
}

export const FrameEngine_BackgroundRenderer: React.FC<FrameEngine_BackgroundRendererProps> = ({
    config,
    width,
    height,
    fit = 'none',
    onRiveDiscovery,
    onRiveLoad,
    onRiveError
}) => {
    const [discoveredInputs, setDiscoveredInputs] = useState<Record<string, any>>({});
    const [discoveredBindings, setDiscoveredBindings] = useState<Record<string, any>>({});
    const [riveKey, setRiveKey] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Detect Rive file changes and force remount
    useEffect(() => {
        if (config.type === 'rive' && config.riveFile) {
            console.log('🔄 Rive file changed, forcing reload:', config.riveFile);
            setRiveKey(prev => prev + 1);
        }
    }, [config.riveFile, config.type]);

    // Determine Rive options
    const riveOptions = React.useMemo(() => {
        if (config.type !== 'rive' || !config.riveFile) {
            return null;
        }

        const riveFileUrl = config.riveFile.startsWith('http')
            ? config.riveFile
            : `/api/frameengine/rive/${config.riveFile}/content`;

        let layoutFit: Fit;
        switch (fit) {
            case 'contain':
                layoutFit = Fit.Contain;
                break;
            case 'cover':
                layoutFit = Fit.Cover;
                break;
            default:
                layoutFit = Fit.None;
                break;
        }

        return {
            src: riveFileUrl,
            autoplay: true,
            autoBind: true,
            useDevicePixelRatio: true,
            layout: new Layout({
                fit: layoutFit,
                alignment: Alignment.Center
            }),
            onLoad: () => {
                console.log('✅ Rive background loaded:', config.riveFile);
                if (onRiveLoad) onRiveLoad();
            },
            onLoadError: (error: any) => {
                console.error('❌ Rive background load error:', error, { riveFile: config.riveFile });
                if (onRiveError) onRiveError(error);
            },
        };
    }, [config.type, config.riveFile, fit, onRiveLoad, onRiveError, riveKey]);

    // Initialize Rive
    const { rive, RiveComponent } = useRive(riveOptions || { src: '', autoplay: false });

    // Discovery logic - STREAMLINED VERSION
    // Use a ref to track if we've already discovered for this file
    const discoveredFileRef = useRef<string | null>(null);
    const hasRunDiscoveryRef = useRef<boolean>(false);

    useEffect(() => {
        if (!rive || config.type !== 'rive' || !config.riveFile) return;

        // Only discover once per file to prevent infinite loops
        if (discoveredFileRef.current === config.riveFile && hasRunDiscoveryRef.current) {
            return;
        }

        // Reset if file changed
        if (discoveredFileRef.current !== config.riveFile) {
            discoveredFileRef.current = config.riveFile;
            hasRunDiscoveryRef.current = false;
        }

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const discoverAll = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                const smNames: string[] = Array.isArray(rive.stateMachineNames) ? rive.stateMachineNames : [];

                smNames.forEach((sm) => {
                    try { rive.play(sm); } catch { }
                });

                const machines: DiscoveredStateMachine[] = smNames.map((smName) => {
                    const inputs: DiscoveredInput[] = [];

                    try {
                        const rawInputs = rive.stateMachineInputs ? (rive.stateMachineInputs(smName) as any[]) : [];

                        rawInputs.forEach((rawInput) => {
                            if (rawInput?.name) {
                                const inputName = String(rawInput.name);
                                let inputType: DiscoveredInput['type'] = 'unknown';
                                let currentValue: any = null;
                                let hasValue = false;

                                try {
                                    currentValue = rawInput.value;
                                    hasValue = true;

                                    if (typeof currentValue === 'number') {
                                        inputType = 'number';
                                    } else if (typeof currentValue === 'boolean') {
                                        inputType = 'boolean';
                                    }
                                } catch {
                                    try {
                                        if (typeof rawInput.fire === 'function') {
                                            inputType = 'trigger';
                                        }
                                    } catch { }
                                }

                                inputs.push({
                                    name: inputName,
                                    type: inputType,
                                    currentValue: hasValue ? currentValue : null,
                                    ref: rawInput
                                });
                            }
                        });
                    } catch (error) {
                        console.warn(`Failed to get inputs for state machine "${smName}":`, error);
                    }

                    return {
                        name: smName,
                        inputNames: inputs.map(i => i.name),
                        inputs
                    };
                });

                // Discover data bindings - SIMPLIFIED TO ONLY USE WORKING CODE
                const dataBindings: DiscoveredDataBinding[] = [];

                try {
                    const vmi = rive.viewModelInstance;
                    if (vmi) {
                        console.log("Found viewModelInstance:", vmi);

                        // Access properties directly from viewModelInstance
                        if ((vmi as any).properties) {
                            console.log("Found properties on viewModelInstance:", (vmi as any).properties);

                            (vmi as any).properties.forEach((prop: any) => {
                                const propertyName = prop.name;
                                console.log(`Trying property from instance: ${propertyName}`);

                                // Try each accessor type
                                const accessors = [
                                    { fn: 'number', type: 'number' as const },
                                    { fn: 'string', type: 'string' as const },
                                    { fn: 'boolean', type: 'boolean' as const },
                                    { fn: 'color', type: 'color' as const },
                                    { fn: 'trigger', type: 'trigger' as const },
                                    { fn: 'enum', type: 'enum' as const },
                                    { fn: 'list', type: 'list' as const },
                                    { fn: 'image', type: 'image' as const },
                                ];

                                for (const accessor of accessors) {
                                    try {
                                        const binding = (vmi as any)[accessor.fn]?.(propertyName);
                                        if (binding && (binding.value !== undefined || accessor.type === 'trigger' || accessor.type === 'list')) {
                                            let currentValue = null;
                                            try {
                                                if (accessor.type === 'trigger') {
                                                    currentValue = null;
                                                } else if (accessor.type === 'list') {
                                                    currentValue = `List (${binding.length || 0} items)`;
                                                } else {
                                                    currentValue = binding.value;
                                                }
                                            } catch { }

                                            console.log(`✓ Found ${propertyName} as ${accessor.type}:`, currentValue);
                                            dataBindings.push({
                                                name: propertyName,
                                                type: accessor.type,
                                                currentValue: currentValue,
                                                ref: binding
                                            });
                                            break;
                                        }
                                    } catch { }
                                }
                            });
                        } else {
                            console.log("No properties found on viewModelInstance - no data bindings exist");
                        }
                    } else {
                        console.log("No viewModelInstance found - autoBind may be disabled or no data bindings exist");
                    }
                } catch (error) {
                    console.error("Error during data binding discovery:", error);
                }

                console.log('🔍 BackgroundRenderer discovered state machines:', machines);
                console.log('🔍 BackgroundRenderer discovered data bindings:', dataBindings);

                // Mark that we've run discovery for this file
                hasRunDiscoveryRef.current = true;

                if (onRiveDiscovery) {
                    onRiveDiscovery(machines, dataBindings);
                }

                const totalInputs = machines.reduce((sum, m) => sum + m.inputs.length, 0);
                const totalBindings = dataBindings.length;

                // Only retry if we found NOTHING (no machines AND no inputs AND no bindings)
                // Don't retry just because there are no bindings - many Rive files don't use data bindings
                const foundNothing = machines.length === 0 && totalInputs === 0 && totalBindings === 0;

                if (foundNothing && attempts < maxAttempts) {
                    console.log(`[BG DISCOVERY] Found nothing, will retry (attempt ${attempts}/${maxAttempts})`);
                    setTimeout(discoverAll, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during BackgroundRenderer discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverAll, 120 * attempts);
                }
            }
        };

        discoverAll();

        return () => {
            stopped = true;
        };
    }, [rive, config.type, onRiveDiscovery]);

    // Input binding logic
    useEffect(() => {
        if (!rive || config.type !== 'rive' || !config.riveInputs) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;
        const inputRefs: Record<string, any> = {};

        const discoverAndBindInputs = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                const smNames: string[] = Array.isArray(rive.stateMachineNames) ? rive.stateMachineNames : [];

                smNames.forEach((sm) => {
                    try { rive.play(sm); } catch { }
                });

                const newDiscoveredInputs: Record<string, any> = {};

                Object.entries(config.riveInputs || {}).forEach(([inputKey, inputValue]) => {
                    let targetMachine: string;
                    let inputName: string;

                    if (inputKey.includes('.')) {
                        const parts = inputKey.split('.');
                        targetMachine = parts[0];
                        inputName = parts.slice(1).join('.');
                    } else {
                        targetMachine = config.riveStateMachine || smNames[0];
                        inputName = inputKey;
                    }

                    if (!targetMachine) return;
                    if (!smNames.includes(targetMachine)) return;

                    const machineInputs = rive.stateMachineInputs
                        ? (rive.stateMachineInputs(targetMachine) as any[])
                        : [];

                    const foundInput = machineInputs.find((i) => i?.name === inputName);

                    if (foundInput) {
                        inputRefs[inputKey] = foundInput;

                        let inputType = 'unknown';
                        let hasValue = false;
                        let currentValue: any;

                        try {
                            currentValue = foundInput.value;
                            hasValue = true;

                            if (typeof currentValue === 'number') {
                                inputType = 'number';
                            } else if (typeof currentValue === 'boolean') {
                                inputType = 'boolean';
                            }
                        } catch {
                            try {
                                if (typeof foundInput.fire === 'function') {
                                    inputType = 'trigger';
                                }
                            } catch { }
                        }

                        newDiscoveredInputs[inputKey] = {
                            ref: foundInput,
                            type: inputType,
                            currentValue: hasValue ? currentValue : null,
                            stateMachine: targetMachine,
                            inputName: inputName
                        };

                        try {
                            if (inputType === 'trigger') {
                                if (inputValue && typeof foundInput.fire === 'function') {
                                    foundInput.fire();
                                }
                            } else if (hasValue) {
                                const newValue = inputType === 'boolean' ? Boolean(inputValue) : Number(inputValue) || 0;
                                foundInput.value = newValue;
                            }
                        } catch (error) {
                            console.error(`❌ Error applying input "${inputName}" in "${targetMachine}":`, error);
                        }
                    }
                });

                setDiscoveredInputs(newDiscoveredInputs);

                const foundCount = Object.keys(newDiscoveredInputs).length;
                const expectedCount = Object.keys(config.riveInputs || {}).length;

                if (foundCount < expectedCount && attempts < maxAttempts) {
                    setTimeout(discoverAndBindInputs, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during input discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverAndBindInputs, 120 * attempts);
                }
            }
        };

        discoverAndBindInputs();

        return () => {
            stopped = true;
            setDiscoveredInputs({});
        };
    }, [rive, config.type, config.riveStateMachine, config.riveInputs]);

    // Data binding logic
    useEffect(() => {
        if (!rive || config.type !== 'rive' || !config.riveBindings) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const discoverAndBindDataBindings = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                const vmi = (rive as any).viewModelInstance;

                if (!vmi) {
                    if (attempts < maxAttempts) {
                        setTimeout(discoverAndBindDataBindings, 120 * attempts);
                    }
                    return;
                }

                const newDiscoveredBindings: Record<string, any> = {};

                Object.entries(config.riveBindings || {}).forEach(([bindingName, bindingValue]) => {
                    let foundBinding = null;
                    let bindingType = 'unknown';

                    const accessors = [
                        { fn: 'number', type: 'number' as const },
                        { fn: 'string', type: 'string' as const },
                        { fn: 'boolean', type: 'boolean' as const },
                        { fn: 'color', type: 'color' as const },
                        { fn: 'trigger', type: 'trigger' as const },
                        { fn: 'enum', type: 'enum' as const },
                        { fn: 'list', type: 'list' as const },
                        { fn: 'image', type: 'image' as const },
                    ];

                    for (const accessor of accessors) {
                        try {
                            foundBinding = vmi[accessor.fn]?.(bindingName);
                            if (foundBinding && (foundBinding.value !== undefined || accessor.type === 'trigger' || accessor.type === 'list')) {
                                bindingType = accessor.type;
                                break;
                            }
                        } catch (e) { }
                    }

                    if (foundBinding) {
                        newDiscoveredBindings[bindingName] = {
                            ref: foundBinding,
                            type: bindingType,
                            currentValue: foundBinding.value
                        };

                        try {
                            if (bindingType === 'number') {
                                foundBinding.value = Number(bindingValue) || 0;
                            } else if (bindingType === 'boolean') {
                                foundBinding.value = Boolean(bindingValue);
                            } else if (bindingType === 'string') {
                                foundBinding.value = String(bindingValue || '');
                            } else if (bindingType === 'color') {
                                let colorValue: number;

                                if (typeof bindingValue === 'string' && bindingValue.startsWith('#')) {
                                    const hexValue = parseInt(bindingValue.slice(1), 16);
                                    const r = (hexValue >> 16) & 0xFF;
                                    const g = (hexValue >> 8) & 0xFF;
                                    const b = hexValue & 0xFF;
                                    colorValue = (0xFF << 24) | (r << 16) | (g << 8) | b;
                                } else if (typeof bindingValue === 'number') {
                                    colorValue = bindingValue >>> 0;
                                } else {
                                    return;
                                }

                                foundBinding.value = colorValue >>> 0;
                            } else if (bindingType === 'trigger') {
                                if (bindingValue && typeof foundBinding.fire === 'function') {
                                    foundBinding.fire();
                                }
                            }
                        } catch (error) {
                            console.error(`❌ Error applying data binding "${bindingName}":`, error);
                        }
                    }
                });

                setDiscoveredBindings(newDiscoveredBindings);

                const foundCount = Object.keys(newDiscoveredBindings).length;
                const expectedCount = Object.keys(config.riveBindings || {}).length;

                if (foundCount < expectedCount && attempts < maxAttempts) {
                    setTimeout(discoverAndBindDataBindings, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during data binding discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverAndBindDataBindings, 120 * attempts);
                }
            }
        };

        discoverAndBindDataBindings();

        return () => {
            stopped = true;
            setDiscoveredBindings({});
        };
    }, [rive, config.type, config.riveBindings]);

    // Apply input changes when inputs prop changes
    useEffect(() => {
        if (config.type !== 'rive' || !config.riveInputs || Object.keys(discoveredInputs).length === 0) return;

        Object.entries(config.riveInputs || {}).forEach(([inputKey, inputValue]) => {
            const discovered = discoveredInputs[inputKey];
            if (!discovered || !discovered.ref) return;

            try {
                if (discovered.type === 'trigger') {
                    if (inputValue && typeof discovered.ref.fire === 'function') {
                        discovered.ref.fire();
                    }
                } else {
                    const newValue = discovered.type === 'boolean' ? Boolean(inputValue) : Number(inputValue) || 0;
                    if (discovered.ref.value !== newValue) {
                        discovered.ref.value = newValue;
                    }
                }
            } catch (error) {
                console.error(`❌ Error updating input "${discovered.inputName}" in "${discovered.stateMachine}":`, error);
            }
        });
    }, [config.type, config.riveInputs, discoveredInputs]);

    // Apply data binding changes when bindings prop changes
    useEffect(() => {
        if (config.type !== 'rive' || !config.riveBindings || Object.keys(discoveredBindings).length === 0) return;

        Object.entries(config.riveBindings || {}).forEach(([bindingName, bindingValue]) => {
            const discovered = discoveredBindings[bindingName];
            if (!discovered || !discovered.ref) return;

            try {
                let newValue: any;
                if (discovered.type === 'number') {
                    newValue = Number(bindingValue) || 0;
                } else if (discovered.type === 'boolean') {
                    newValue = Boolean(bindingValue);
                } else if (discovered.type === 'string') {
                    newValue = String(bindingValue || '');
                } else if (discovered.type === 'color') {
                    if (typeof bindingValue === 'string' && bindingValue.startsWith('#')) {
                        const hexValue = parseInt(bindingValue.slice(1), 16);
                        const r = (hexValue >> 16) & 0xFF;
                        const g = (hexValue >> 8) & 0xFF;
                        const b = hexValue & 0xFF;
                        newValue = (0xFF << 24) | (r << 16) | (g << 8) | b;
                    } else {
                        newValue = Number(bindingValue) || 0;
                    }
                } else if (discovered.type === 'trigger') {
                    if (bindingValue && typeof discovered.ref.fire === 'function') {
                        discovered.ref.fire();
                    }
                    return;
                } else {
                    return;
                }

                if (discovered.ref.value !== newValue) {
                    discovered.ref.value = newValue;
                }
            } catch (error) {
                console.error(`❌ Error updating data binding "${bindingName}":`, error);
            }
        });
    }, [config.type, config.riveBindings, discoveredBindings]);

    // Get object-fit CSS value from fit mode
    const getObjectFit = (fitMode?: string): React.CSSProperties['objectFit'] => {
        switch (fitMode) {
            case 'cover': return 'cover';
            case 'contain': return 'contain';
            case 'fill': return 'fill';
            case 'none': return 'none';
            case 'stretch': return 'fill'; // CSS doesn't have stretch, use fill
            default: return 'cover';
        }
    };

    // Get container styles based on background type
    const getContainerStyles = React.useMemo((): React.CSSProperties => {
        const baseStyles: React.CSSProperties = {
            position: 'absolute',
            top: 0,
            left: 0,
            width: width,
            height: height,
            pointerEvents: 'none',
            zIndex: 0,
        };

        switch (config.type) {
            case 'color':
                return {
                    ...baseStyles,
                    backgroundColor: config.color || '#FFFFFF',
                };

            case 'image':
                const imageUrl = config.imageUrl
                    ? (config.imageUrl.startsWith('http')
                        ? config.imageUrl
                        : `/api/frameengine/images/${config.imageUrl}/content`)
                    : undefined;

                // Handle tile mode separately
                if (config.imageFit === 'tile') {
                    return {
                        ...baseStyles,
                        backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                        backgroundSize: 'auto',
                        backgroundPosition: 'top left',
                        backgroundRepeat: 'repeat',
                    };
                }

                return {
                    ...baseStyles,
                    backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                    backgroundSize: config.imageFit === 'none' ? 'auto' : (config.imageFit || 'cover'),
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                };

            case 'video':
                return {
                    ...baseStyles,
                    backgroundColor: 'transparent',
                };

            case 'rive':
                return {
                    ...baseStyles,
                    backgroundColor: 'transparent',
                };

            default:
                return {
                    ...baseStyles,
                    backgroundColor: '#FFFFFF',
                };
        }
    }, [config.type, config.color, config.imageUrl, config.imageFit, width, height]);

    // Render based on background type
    const renderContent = () => {
        switch (config.type) {
            case 'video':
                if (!config.videoUrl) {
                    return null;
                }

                const videoUrl = config.videoUrl.startsWith('http')
                    ? config.videoUrl
                    : `/api/frameengine/videos/${config.videoUrl}/content`;

                return (
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        loop={config.videoLoop ?? true}
                        muted={config.videoMuted ?? true}
                        autoPlay={config.videoAutoplay ?? true}
                        playsInline
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: getObjectFit(config.videoFit),
                            display: 'block',
                        }}
                        onError={(e) => {
                            console.error('❌ Video background load error:', e);
                        }}
                    />
                );

            case 'rive':
                if (!config.riveFile || !RiveComponent) {
                    return null;
                }

                return (
                    <RiveComponent
                        key={riveKey}
                        style={{
                            width: width,
                            height: height,
                            display: 'block',
                            margin: 0,
                            padding: 0,
                            border: 'none',
                            outline: 'none',
                            imageRendering: 'crisp-edges',
                        }}
                    />
                );

            case 'image':
            case 'color':
                return null;

            default:
                return null;
        }
    };

    return (
        <div style={getContainerStyles}>
            {renderContent()}
        </div>
    );
};

export default FrameEngine_BackgroundRenderer;