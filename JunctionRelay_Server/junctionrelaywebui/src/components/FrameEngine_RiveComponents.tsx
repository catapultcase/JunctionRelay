import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    useRive,
    Layout,
    Fit,
    Alignment,
} from '@rive-app/react-canvas';

// Types for Rive discovery
export interface DiscoveredStateMachine {
    name: string;
    inputNames: string[];
    inputs: DiscoveredInput[];
}

export interface DiscoveredInput {
    name: string;
    type: 'number' | 'boolean' | 'trigger' | 'unknown';
    currentValue?: any;
    ref?: any;
}

export interface RiveFileInfo {
    filename: string;
    displayName: string;
    uploadDate: string;
    fileSize: number;
}

// Simple Input Row for live testing with buttons below input
const SimpleLiveInputRow: React.FC<{
    inputName: string;
    inputType: 'number' | 'boolean' | 'trigger' | 'unknown';
    currentValue: any;
    onInputChange: (inputName: string, value: any) => void;
}> = ({ inputName, inputType, currentValue, onInputChange }) => {
    const [localValue, setLocalValue] = useState(currentValue ?? 0);

    // Apply value changes
    const applyValue = (value: any) => {
        setLocalValue(value);
        onInputChange(inputName, value);
    };

    // Generate random values
    const generateRandomValue = () => {
        switch (inputType) {
            case 'number':
                return Math.floor(Math.random() * 101); // 0-100
            case 'boolean':
                return Math.random() < 0.5;
            case 'trigger':
                return Date.now();
            default:
                return 0;
        }
    };

    const miniButtonStyle: React.CSSProperties = {
        padding: '2px 6px',
        borderRadius: '3px',
        border: '1px solid #ddd',
        background: '#fafafa',
        cursor: 'pointer',
        fontSize: '10px',
        flex: 1,
    };

    const buttonStyle: React.CSSProperties = {
        padding: '3px 8px',
        borderRadius: '3px',
        border: '1px solid #ccc',
        background: '#f5f5f5',
        cursor: 'pointer',
        fontSize: '10px',
    };

    return (
        <div style={{
            padding: '6px',
            backgroundColor: '#f9f9f9',
            borderRadius: '3px',
            border: '1px solid #e8e8e8'
        }}>
            {/* Input name and type */}
            <div style={{
                marginBottom: '6px',
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#333'
            }}>
                <span style={{ fontWeight: 500 }}>{inputName}</span>
                <span style={{ color: '#999', marginLeft: '6px' }}>({inputType})</span>
            </div>

            {/* Input controls */}
            {inputType === 'number' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <input
                        type="number"
                        step="0.1"
                        value={Number.isFinite(localValue) ? localValue : 0}
                        onChange={(e) => applyValue(parseFloat(e.target.value) || 0)}
                        style={{
                            width: '100%',
                            padding: '4px 6px',
                            border: '1px solid #ccc',
                            borderRadius: '3px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                        }}
                    />
                    <div style={{ display: 'flex', gap: '2px' }}>
                        <button style={miniButtonStyle} onClick={() => applyValue(0)}>0</button>
                        <button style={miniButtonStyle} onClick={() => applyValue(50)}>50</button>
                        <button style={miniButtonStyle} onClick={() => applyValue(100)}>100</button>
                        <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>Rand</button>
                    </div>
                </div>
            ) : inputType === 'boolean' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                        <input
                            type="checkbox"
                            checked={Boolean(localValue)}
                            onChange={(e) => applyValue(e.target.checked)}
                        />
                        <span>{localValue ? 'true' : 'false'}</span>
                    </label>
                    <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>
                        Random
                    </button>
                </div>
            ) : (
                // Trigger or unknown
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                        onClick={() => applyValue(Date.now())}
                        style={{
                            ...buttonStyle,
                            backgroundColor: '#e8f5e8',
                            borderColor: '#4caf50',
                            width: '100%'
                        }}
                    >
                        Fire Trigger
                    </button>
                    <button
                        onClick={() => applyValue(generateRandomValue())}
                        style={{ ...buttonStyle, width: '100%' }}
                    >
                        Random
                    </button>
                </div>
            )}
        </div>
    );
};

// Live Input Row Component - Following POC Pattern
export const LiveInputRow: React.FC<{
    machineName: string;
    input: DiscoveredInput;
    riveFile: string;
    onInputChange: (inputName: string, value: any) => void;
}> = ({ machineName, input, riveFile, onInputChange }) => {
    const [localValue, setLocalValue] = useState<any>(input.currentValue ?? 0);
    const [inputReady, setInputReady] = useState(false);
    const riveFileUrl = `/api/frameengine/rive-files/${riveFile}/content`;
    const inputRef = useRef<any>(null);

    const { rive } = useRive({
        src: riveFileUrl,
        autoplay: true,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    });

    // Poll for input availability following POC pattern
    useEffect(() => {
        if (!rive) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const pollForInput = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                // Ensure machine is running
                try { rive.play(machineName); } catch { }

                const machineInputs = rive.stateMachineInputs
                    ? (rive.stateMachineInputs(machineName) as any[])
                    : [];

                const foundInput = machineInputs.find((i) => i?.name === input.name);

                if (foundInput) {
                    inputRef.current = foundInput;
                    setInputReady(true);

                    // Initialize with current value
                    if (input.type === 'number' || input.type === 'boolean') {
                        try {
                            const currentValue = foundInput.value;
                            if (currentValue !== undefined) {
                                setLocalValue(currentValue);
                            }
                        } catch { }
                    }
                    return;
                }
            } catch { }

            if (attempts < maxAttempts) {
                setTimeout(pollForInput, 120 * attempts);
            }
        };

        pollForInput();

        return () => {
            stopped = true;
            setInputReady(false);
            inputRef.current = null;
        };
    }, [rive, machineName, input.name, input.type]);

    // Apply value changes to Rive input
    const applyValue = (value: any) => {
        setLocalValue(value);
        onInputChange(input.name, value);

        if (!inputRef.current) return;

        try {
            if (input.type === 'trigger') {
                if (value && typeof inputRef.current.fire === 'function') {
                    inputRef.current.fire();
                }
            } else if (input.type === 'number' || input.type === 'boolean') {
                const newValue = input.type === 'boolean' ? Boolean(value) : Number(value) || 0;
                inputRef.current.value = newValue;
            }
        } catch (error) {
            console.error(`Error applying value to input "${input.name}":`, error);
        }
    };

    // Generate random values
    const generateRandomValue = () => {
        switch (input.type) {
            case 'number':
                return Math.floor(Math.random() * 101); // 0-100
            case 'boolean':
                return Math.random() < 0.5;
            case 'trigger':
                return Date.now();
            default:
                return 0;
        }
    };

    const miniButtonStyle: React.CSSProperties = {
        padding: '2px 6px',
        borderRadius: '3px',
        border: '1px solid #ddd',
        background: '#fafafa',
        cursor: 'pointer',
        fontSize: '10px',
        flex: 1,
    };

    const buttonStyle: React.CSSProperties = {
        padding: '3px 8px',
        borderRadius: '3px',
        border: '1px solid #ccc',
        background: '#f5f5f5',
        cursor: 'pointer',
        fontSize: '10px',
    };

    return (
        <div style={{
            padding: '6px',
            backgroundColor: '#f9f9f9',
            borderRadius: '3px',
            border: '1px solid #e8e8e8'
        }}>
            {/* Input name and type */}
            <div style={{
                marginBottom: '6px',
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#333'
            }}>
                <span style={{ fontWeight: 500 }}>{input.name}</span>
                <span style={{ color: '#999', marginLeft: '6px' }}>({input.type})</span>
            </div>

            {/* Input controls */}
            {!inputReady ? (
                <span style={{ fontSize: '10px', color: '#c00' }}>discovering...</span>
            ) : input.type === 'number' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <input
                        type="number"
                        step="0.1"
                        value={Number.isFinite(localValue) ? localValue : 0}
                        onChange={(e) => applyValue(parseFloat(e.target.value) || 0)}
                        style={{
                            width: '100%',
                            padding: '4px 6px',
                            border: '1px solid #ccc',
                            borderRadius: '3px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                        }}
                    />
                    <div style={{ display: 'flex', gap: '2px' }}>
                        <button style={miniButtonStyle} onClick={() => applyValue(0)}>0</button>
                        <button style={miniButtonStyle} onClick={() => applyValue(50)}>50</button>
                        <button style={miniButtonStyle} onClick={() => applyValue(100)}>100</button>
                        <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>Rand</button>
                    </div>
                </div>
            ) : input.type === 'boolean' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                        <input
                            type="checkbox"
                            checked={Boolean(localValue)}
                            onChange={(e) => applyValue(e.target.checked)}
                        />
                        <span>{localValue ? 'true' : 'false'}</span>
                    </label>
                    <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>
                        Random
                    </button>
                </div>
            ) : (
                // Trigger or unknown
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                        onClick={() => applyValue(Date.now())}
                        style={{
                            ...buttonStyle,
                            backgroundColor: '#e8f5e8',
                            borderColor: '#4caf50',
                            width: '100%'
                        }}
                    >
                        Fire Trigger
                    </button>
                    <button
                        onClick={() => applyValue(generateRandomValue())}
                        style={{ ...buttonStyle, width: '100%' }}
                    >
                        Random
                    </button>
                </div>
            )}
        </div>
    );
};

// Dynamic Rive Discovery Component
export const RiveDiscovery: React.FC<{
    riveFile: string;
    onDiscovery: (machines: DiscoveredStateMachine[]) => void;
}> = ({ riveFile, onDiscovery }) => {
    const [discovery, setDiscovery] = useState<DiscoveredStateMachine[]>([]);
    const riveFileUrl = `/api/frameengine/rive-files/${riveFile}/content`;

    const { rive } = useRive({
        src: riveFileUrl,
        autoplay: true,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
        onLoad: () => {
            console.log('✅ Rive file loaded for discovery:', riveFile);
        },
        onLoadError: (error: any) => {
            console.error('❌ Rive discovery load error:', error);
        },
    });

    // Discover state machines and inputs following POC pattern
    useEffect(() => {
        if (!rive) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const discoverMachinesAndInputs = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                // Get state machine names
                const smNames: string[] = Array.isArray(rive.stateMachineNames) ? rive.stateMachineNames : [];

                // Ensure machines are running so inputs wire up
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

                                // Probe input type following POC pattern
                                try {
                                    currentValue = rawInput.value;
                                    hasValue = true;

                                    if (typeof currentValue === 'number') {
                                        inputType = 'number';
                                    } else if (typeof currentValue === 'boolean') {
                                        inputType = 'boolean';
                                    }
                                } catch {
                                    // If no readable value, check for trigger
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

                console.log('🔍 Discovered state machines:', machines);
                setDiscovery(machines);
                onDiscovery(machines);

                // If we didn't find everything and haven't exhausted attempts, keep trying
                const totalInputs = machines.reduce((sum, m) => sum + m.inputs.length, 0);
                if (totalInputs === 0 && attempts < maxAttempts) {
                    setTimeout(discoverMachinesAndInputs, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during state machine discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverMachinesAndInputs, 120 * attempts);
                }
            }
        };

        discoverMachinesAndInputs();

        return () => {
            stopped = true;
            setDiscovery([]);
        };
    }, [rive, onDiscovery]);

    // Hidden component - only used for discovery
    return null;
};

// Live State Machine Testing Component - Shows all state machines, inputs apply automatically
export const LiveStateMachineTesting: React.FC<{
    discoveredMachines: DiscoveredStateMachine[];
    riveFile: string;
    layout: any;
    onInputChange: (stateMachineName: string, inputName: string, value: any) => void;
}> = ({ discoveredMachines, riveFile, layout, onInputChange }) => {
    if (!riveFile || discoveredMachines.length === 0) {
        return (
            <div style={{
                padding: '8px',
                backgroundColor: '#fff3cd',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#856404',
                marginTop: '12px'
            }}>
                {!riveFile ?
                    '⏳ Select a Rive file to see available state machines...' :
                    '🔍 Discovering state machines from canvas... This may take a moment.'
                }
            </div>
        );
    }

    return (
        <div style={{ marginTop: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '8px' }}>
                🧪 Live State Machine Testing
            </label>
            <div style={{
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                backgroundColor: '#fff',
                maxHeight: '300px',
                overflowY: 'auto'
            }}>
                {discoveredMachines.map((machine) => (
                    <div key={machine.name} style={{
                        border: '1px solid #eee',
                        borderRadius: '4px',
                        margin: '8px',
                        padding: '10px',
                        background: '#fcfcfc'
                    }}>
                        <div style={{
                            fontWeight: 600,
                            marginBottom: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '12px',
                            color: '#333'
                        }}>
                            <span>{machine.name}</span>
                            <span style={{ fontSize: '11px', color: '#888' }}>
                                {machine.inputs.length} input{machine.inputs.length === 1 ? '' : 's'}
                            </span>
                        </div>

                        {machine.inputs.length === 0 ? (
                            <div style={{ color: '#999', fontSize: '11px', fontStyle: 'italic' }}>
                                No inputs in this state machine.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {machine.inputs.map((input) => (
                                    <SimpleLiveInputRow
                                        key={`${machine.name}/${input.name}`}
                                        inputName={input.name}
                                        inputType={input.type}
                                        currentValue={input.currentValue}
                                        onInputChange={(inputName, value) => {
                                            // Automatically apply to the correct state machine
                                            onInputChange(machine.name, inputName, value);
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};