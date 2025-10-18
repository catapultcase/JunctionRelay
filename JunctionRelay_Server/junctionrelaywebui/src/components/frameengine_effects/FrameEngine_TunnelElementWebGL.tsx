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

import React, { useEffect, useRef, useCallback } from 'react';

interface TunnelElementProps {
    sensorTag: string;
    sensorValue?: number;
    width: number;
    height: number;
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string; // Accepts any valid CSS color or 'transparent'
    tunnelType?: 'circular' | 'square' | 'hexagon' | 'star' | 'spiral';
    speed?: number;
    depth?: number;
    ringSpacing?: number;
    rotation?: number;
    twist?: number;
    pulseSpeed?: number;
    pulseAmount?: number;
    scanlines?: boolean;
    scanlineIntensity?: number;
    chromatic?: boolean;
    chromaticAmount?: number;
    pixelate?: boolean;
    pixelSize?: number;
    colorCycle?: boolean;
    colorCycleSpeed?: number;
    perspective?: number;
    glow?: boolean;
    glowIntensity?: number;
    curveTargetX?: number;
    curveTargetY?: number;
    curveStrength?: number;
    banking?: number;
    pitch?: number;
    originX?: number;
    originY?: number;
    depthFade?: boolean;
    fadeEnd?: 'front' | 'back';
}

const vertexShaderSource = `
    attribute vec2 a_position;
    attribute float a_depth;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_depth;
    uniform float u_ringSpacing;
    uniform float u_rotation;
    uniform float u_twist;
    uniform float u_perspective;
    uniform float u_pulseSpeed;
    uniform float u_pulseAmount;
    uniform float u_curveTargetX;
    uniform float u_curveTargetY;
    uniform float u_curveStrength;
    uniform float u_banking;
    uniform float u_pitch;
    uniform vec2 u_origin;
    uniform float u_depthFade;
    uniform float u_fadeEnd;
    varying float v_depthFactor;
    varying float v_alpha;
    varying float v_lineAlpha;
    
    void main() {
        float scrollOffset = mod(u_time, u_ringSpacing);
        float ringZ = a_depth - scrollOffset;
        
        if (ringZ <= 0.0 || ringZ > u_depth + u_ringSpacing) {
            gl_Position = vec4(10.0, 10.0, 10.0, 1.0);
            v_depthFactor = 0.0;
            v_alpha = 0.0;
            v_lineAlpha = 0.0;
            return;
        }
        
        float depthFactor = clamp(1.0 - (ringZ / u_depth), 0.0, 1.0);
        v_depthFactor = depthFactor;
        float pulse = 1.0 + sin(u_time * u_pulseSpeed) * u_pulseAmount;
        float curveOffsetX = u_curveTargetX * u_curveStrength * depthFactor * 0.5;
        float curveOffsetY = (u_curveTargetY + u_pitch) * u_curveStrength * depthFactor * 0.5;
        float scale = 1.0 / (ringZ * u_perspective + 0.1);
        float size = scale * pulse;
        float baseAngle = u_time * u_rotation;
        float twistOffset = (u_twist * (u_depth - ringZ)) / u_depth;
        float bankAngle = -u_curveTargetX * u_banking * depthFactor * 0.785398;
        float angle = baseAngle + twistOffset + bankAngle;
        vec2 pos = a_position;
        float cosA = cos(angle);
        float sinA = sin(angle);
        vec2 rotated = vec2(pos.x * cosA - pos.y * sinA, pos.x * sinA + pos.y * cosA);
        vec2 finalPos = rotated * size + vec2(curveOffsetX, curveOffsetY);
        finalPos += (u_origin - 0.5) * 2.0;
        gl_Position = vec4(finalPos.x, -finalPos.y, 0.0, 1.0);
        v_alpha = max(0.3, 1.0 - depthFactor * 0.7);
        
        if (u_depthFade > 0.5) {
            if (u_fadeEnd > 0.5) {
                // Fade back (far end): depthFactor 1.0 = far, fade to transparent
                v_lineAlpha = depthFactor;
            } else {
                // Fade front (near end): depthFactor 0.0 = near, fade to transparent
                v_lineAlpha = 1.0 - depthFactor;
            }
        } else {
            v_lineAlpha = 1.0;
        }
    }
`;

const fragmentShaderSource = `
    precision highp float;
    uniform vec3 u_primaryColor;
    uniform vec3 u_secondaryColor;
    uniform highp float u_time;
    uniform float u_colorCycle;
    uniform float u_colorCycleSpeed;
    uniform float u_glow;
    uniform float u_glowIntensity;
    varying float v_depthFactor;
    varying float v_alpha;
    varying float v_lineAlpha;
    
    vec3 hueShift(vec3 color, float shift) {
        float angle = shift * 3.14159265 / 180.0;
        float s = sin(angle);
        float c = cos(angle);
        mat3 rotMat = mat3(
            c + (1.0 - c) / 3.0, (1.0 - c) / 3.0 - s * 0.577, (1.0 - c) / 3.0 + s * 0.577,
            (1.0 - c) / 3.0 + s * 0.577, c + (1.0 - c) / 3.0, (1.0 - c) / 3.0 - s * 0.577,
            (1.0 - c) / 3.0 - s * 0.577, (1.0 - c) / 3.0 + s * 0.577, c + (1.0 - c) / 3.0
        );
        return rotMat * color;
    }
    
    void main() {
        vec3 color1 = u_primaryColor;
        vec3 color2 = u_secondaryColor;
        if (u_colorCycle > 0.5) {
            float hueShiftAmount = mod(u_time * u_colorCycleSpeed * 360.0, 360.0);
            color1 = hueShift(u_primaryColor, hueShiftAmount);
            color2 = hueShift(u_secondaryColor, hueShiftAmount);
        }
        vec3 color = mix(color1, color2, v_depthFactor);
        float glowFactor = 1.0;
        if (u_glow > 0.5) {
            glowFactor = 1.0 + (1.0 - v_depthFactor) * u_glowIntensity * 0.05;
        }
        gl_FragColor = vec4(color * glowFactor, v_alpha * v_lineAlpha);
    }
`;

const postProcessVertexShader = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
    }
`;

const postProcessFragmentShader = `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform float u_scanlines;
    uniform float u_scanlineIntensity;
    uniform float u_chromatic;
    uniform float u_chromaticAmount;
    uniform float u_pixelate;
    uniform float u_pixelSize;
    varying vec2 v_texCoord;
    
    void main() {
        vec2 uv = v_texCoord;
        
        if (u_pixelate > 0.5) {
            vec2 pixelSize = vec2(u_pixelSize) / u_resolution;
            uv = floor(uv / pixelSize) * pixelSize;
        }
        
        vec4 color;
        if (u_chromatic > 0.5) {
            float offset = u_chromaticAmount / u_resolution.x;
            float r = texture2D(u_texture, uv + vec2(offset, 0.0)).r;
            float g = texture2D(u_texture, uv).g;
            float b = texture2D(u_texture, uv - vec2(offset, 0.0)).b;
            float a = texture2D(u_texture, uv).a;
            color = vec4(r, g, b, a);
        } else {
            color = texture2D(u_texture, uv);
        }
        
        if (u_scanlines > 0.5) {
            float scanline = mod(gl_FragCoord.y, 2.0);
            if (scanline < 1.0) {
                color.rgb *= (1.0 - u_scanlineIntensity);
            }
        }
        
        gl_FragColor = color;
    }
`;

export const FrameEngine_TunnelElementWebGL: React.FC<TunnelElementProps> = ({
    width,
    height,
    primaryColor = '#ff00ff',
    secondaryColor = '#00ffff',
    backgroundColor = '#000000',
    tunnelType = 'circular',
    speed = 1,
    depth = 20,
    ringSpacing = 5,
    rotation = 0.5,
    twist = 0,
    pulseSpeed = 1,
    pulseAmount = 0.2,
    scanlines = true,
    scanlineIntensity = 0.3,
    chromatic = false,
    chromaticAmount = 2,
    pixelate = false,
    pixelSize = 4,
    colorCycle = false,
    colorCycleSpeed = 0.01,
    perspective = 1,
    glow = true,
    glowIntensity = 10,
    curveTargetX = 0,
    curveTargetY = 0,
    curveStrength = 1,
    banking = 0.5,
    pitch = 0,
    originX = 0.5,
    originY = 0.5,
    depthFade = false,
    fadeEnd = 'back',
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const postProgramRef = useRef<WebGLProgram | null>(null);
    const buffersRef = useRef<any>(null);
    const framebufferRef = useRef<WebGLFramebuffer | null>(null);
    const textureRef = useRef<WebGLTexture | null>(null);
    const animationRef = useRef<number | null>(null);
    const timeRef = useRef<number>(0);
    const isMountedRef = useRef(true);

    // Check if background is transparent
    const isTransparent = backgroundColor === 'transparent' || backgroundColor === 'rgba(0,0,0,0)' || backgroundColor === 'rgba(0, 0, 0, 0)';

    const hexToRgb = (hex: string): [number, number, number] => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return [
                parseInt(result[1], 16) / 255,
                parseInt(result[2], 16) / 255,
                parseInt(result[3], 16) / 255
            ];
        }
        return [1, 0, 1];
    };

    const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    };

    const createProgram = (gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) => {
        const program = gl.createProgram();
        if (!program) return null;
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }
        return program;
    };

    const generateShapeGeometry = (type: string, segments: number) => {
        const positions: number[] = [];
        if (type === 'circular') {
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                positions.push(Math.cos(angle), Math.sin(angle));
            }
        } else if (type === 'square') {
            const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]];
            pts.forEach(p => positions.push(p[0], p[1]));
        } else if (type === 'hexagon') {
            for (let i = 0; i <= 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                positions.push(Math.cos(angle), Math.sin(angle));
            }
        } else if (type === 'star') {
            const points = 5;
            for (let i = 0; i <= points * 2; i++) {
                const radius = i % 2 === 0 ? 1 : 0.5;
                const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
                positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
            }
        } else if (type === 'spiral') {
            const turns = 3;
            const points = 100;
            for (let i = 0; i <= points; i++) {
                const t = i / points;
                const angle = t * Math.PI * 2 * turns;
                const r = t;
                positions.push(Math.cos(angle) * r, Math.sin(angle) * r);
            }
        }
        return positions;
    };

    const initWebGL = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return false;

        const gl = canvas.getContext('webgl', {
            alpha: isTransparent,
            premultipliedAlpha: false,
            antialias: true
        });

        if (!gl) {
            console.error('WebGL not supported');
            return false;
        }

        glRef.current = gl;

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        if (!vertexShader || !fragmentShader) return false;

        const program = createProgram(gl, vertexShader, fragmentShader);
        if (!program) return false;
        programRef.current = program;

        const postVertexShader = createShader(gl, gl.VERTEX_SHADER, postProcessVertexShader);
        const postFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, postProcessFragmentShader);
        if (!postVertexShader || !postFragmentShader) return false;

        const postProgram = createProgram(gl, postVertexShader, postFragmentShader);
        if (!postProgram) return false;
        postProgramRef.current = postProgram;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        textureRef.current = texture;

        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        framebufferRef.current = framebuffer;

        gl.viewport(0, 0, width, height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        return true;
    }, [width, height, isTransparent]);

    const createBuffers = useCallback(() => {
        const gl = glRef.current;
        const program = programRef.current;
        const postProgram = postProgramRef.current;
        if (!gl || !program || !postProgram) return;

        const shapePositions = generateShapeGeometry(tunnelType, 64);
        const pointsPerRing = shapePositions.length / 2;
        const positions: number[] = [];
        const depths: number[] = [];
        const indices: number[] = [];
        const numRings = depth + Math.ceil(ringSpacing) * 2;

        for (let ring = 0; ring < numRings; ring++) {
            for (let i = 0; i < pointsPerRing; i++) {
                positions.push(shapePositions[i * 2], shapePositions[i * 2 + 1]);
                depths.push(ring);
            }
        }

        for (let ring = 0; ring < numRings; ring++) {
            const offset = ring * pointsPerRing;
            for (let i = 0; i < pointsPerRing; i++) {
                indices.push(offset + i);
            }
        }

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        const depthBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, depthBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(depths), gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        const quadPositions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const quadTexCoords = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

        const quadPosBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadPosBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, quadPositions, gl.STATIC_DRAW);

        const quadTexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadTexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, quadTexCoords, gl.STATIC_DRAW);

        buffersRef.current = {
            position: positionBuffer,
            depth: depthBuffer,
            index: indexBuffer,
            indexCount: indices.length,
            pointsPerRing,
            quadPosition: quadPosBuffer,
            quadTexCoord: quadTexBuffer
        };
    }, [tunnelType, depth, ringSpacing]);

    const animate = useCallback(() => {
        if (!isMountedRef.current) return;

        const gl = glRef.current;
        const program = programRef.current;
        const postProgram = postProgramRef.current;
        const buffers = buffersRef.current;
        const framebuffer = framebufferRef.current;
        const texture = textureRef.current;

        if (!gl || !program || !postProgram || !buffers || !framebuffer || !texture) {
            animationRef.current = requestAnimationFrame(animate);
            return;
        }

        timeRef.current += 0.016 * speed;

        const pointsPerRing = buffers.pointsPerRing;

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, width, height);

        if (isTransparent) {
            gl.clearColor(0, 0, 0, 0);
        } else {
            const bgColor = hexToRgb(backgroundColor);
            gl.clearColor(bgColor[0], bgColor[1], bgColor[2], 1);
        }
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);

        const positionLoc = gl.getAttribLocation(program, 'a_position');
        const depthLoc = gl.getAttribLocation(program, 'a_depth');

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.depth);
        gl.enableVertexAttribArray(depthLoc);
        gl.vertexAttribPointer(depthLoc, 1, gl.FLOAT, false, 0, 0);

        gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
        gl.uniform1f(gl.getUniformLocation(program, 'u_time'), timeRef.current);
        gl.uniform1f(gl.getUniformLocation(program, 'u_depth'), depth);
        gl.uniform1f(gl.getUniformLocation(program, 'u_ringSpacing'), ringSpacing);
        gl.uniform1f(gl.getUniformLocation(program, 'u_rotation'), rotation);
        gl.uniform1f(gl.getUniformLocation(program, 'u_twist'), twist);
        gl.uniform1f(gl.getUniformLocation(program, 'u_perspective'), perspective);
        gl.uniform1f(gl.getUniformLocation(program, 'u_pulseSpeed'), pulseSpeed);
        gl.uniform1f(gl.getUniformLocation(program, 'u_pulseAmount'), pulseAmount);
        gl.uniform1f(gl.getUniformLocation(program, 'u_curveTargetX'), curveTargetX);
        gl.uniform1f(gl.getUniformLocation(program, 'u_curveTargetY'), curveTargetY);
        gl.uniform1f(gl.getUniformLocation(program, 'u_curveStrength'), curveStrength);
        gl.uniform1f(gl.getUniformLocation(program, 'u_banking'), banking);
        gl.uniform1f(gl.getUniformLocation(program, 'u_pitch'), pitch);
        gl.uniform2f(gl.getUniformLocation(program, 'u_origin'), originX, originY);
        gl.uniform1f(gl.getUniformLocation(program, 'u_depthFade'), depthFade ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(program, 'u_fadeEnd'), fadeEnd === 'back' ? 1 : 0);

        const primColor = hexToRgb(primaryColor);
        const secColor = hexToRgb(secondaryColor);
        gl.uniform3f(gl.getUniformLocation(program, 'u_primaryColor'), primColor[0], primColor[1], primColor[2]);
        gl.uniform3f(gl.getUniformLocation(program, 'u_secondaryColor'), secColor[0], secColor[1], secColor[2]);
        gl.uniform1f(gl.getUniformLocation(program, 'u_colorCycle'), colorCycle ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(program, 'u_colorCycleSpeed'), colorCycleSpeed);
        gl.uniform1f(gl.getUniformLocation(program, 'u_glow'), glow ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(program, 'u_glowIntensity'), glowIntensity);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);

        const numRings = depth + Math.ceil(ringSpacing) * 2;
        for (let ring = 0; ring < numRings; ring++) {
            const offset = ring * pointsPerRing * 2;
            gl.drawElements(gl.LINE_LOOP, pointsPerRing, gl.UNSIGNED_SHORT, offset);
        }

        const segments = tunnelType === 'circular' ? 8 : (tunnelType === 'hexagon' ? 6 : (tunnelType === 'star' ? 5 : 4));
        const radialLineBuffer = gl.createBuffer();
        const scrollOffset = timeRef.current % ringSpacing;

        for (let ring = 0; ring < numRings - 1; ring++) {
            const ringZ1 = ring - scrollOffset;
            const ringZ2 = (ring + 1) - scrollOffset;

            if (ringZ1 <= 0.0 || ringZ1 > depth + ringSpacing ||
                ringZ2 <= 0.0 || ringZ2 > depth + ringSpacing) {
                continue;
            }

            for (let seg = 0; seg < segments; seg++) {
                const vertIndex = Math.floor((seg / segments) * pointsPerRing);
                const idx1 = ring * pointsPerRing + vertIndex;
                const idx2 = (ring + 1) * pointsPerRing + vertIndex;

                const lineIndices = new Uint16Array([idx1, idx2]);
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, radialLineBuffer);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lineIndices, gl.DYNAMIC_DRAW);
                gl.drawElements(gl.LINES, 2, gl.UNSIGNED_SHORT, 0);
            }
        }

        gl.deleteBuffer(radialLineBuffer);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);

        if (isTransparent) {
            gl.clearColor(0, 0, 0, 0);
        } else {
            const bgColor = hexToRgb(backgroundColor);
            gl.clearColor(bgColor[0], bgColor[1], bgColor[2], 1);
        }
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(postProgram);

        const postPosLoc = gl.getAttribLocation(postProgram, 'a_position');
        const postTexLoc = gl.getAttribLocation(postProgram, 'a_texCoord');

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.quadPosition);
        gl.enableVertexAttribArray(postPosLoc);
        gl.vertexAttribPointer(postPosLoc, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.quadTexCoord);
        gl.enableVertexAttribArray(postTexLoc);
        gl.vertexAttribPointer(postTexLoc, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(postProgram, 'u_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(postProgram, 'u_resolution'), width, height);
        gl.uniform1f(gl.getUniformLocation(postProgram, 'u_scanlines'), scanlines ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(postProgram, 'u_scanlineIntensity'), scanlineIntensity);
        gl.uniform1f(gl.getUniformLocation(postProgram, 'u_chromatic'), chromatic ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(postProgram, 'u_chromaticAmount'), chromaticAmount);
        gl.uniform1f(gl.getUniformLocation(postProgram, 'u_pixelate'), pixelate ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(postProgram, 'u_pixelSize'), pixelSize);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (isMountedRef.current) {
            animationRef.current = requestAnimationFrame(animate);
        }
    }, [width, height, primaryColor, secondaryColor, backgroundColor, isTransparent, speed, depth, ringSpacing, rotation, twist, pulseSpeed, pulseAmount, colorCycle, colorCycleSpeed, perspective, glow, glowIntensity, curveTargetX, curveTargetY, curveStrength, banking, pitch, originX, originY, scanlines, scanlineIntensity, chromatic, chromaticAmount, pixelate, pixelSize, depthFade, fadeEnd, tunnelType]);

    useEffect(() => {
        if (initWebGL()) {
            createBuffers();
            animationRef.current = requestAnimationFrame(animate);
        }
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [initWebGL, createBuffers, animate]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{
                width: '100%',
                height: '100%',
                display: 'block',
            }}
        />
    );
};