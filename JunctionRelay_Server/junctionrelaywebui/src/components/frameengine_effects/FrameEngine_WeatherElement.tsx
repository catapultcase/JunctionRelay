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

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface WeatherElementProps {
    sensorTag?: string;
    sensorValue?: number;
    width: number;
    height: number;
    weatherType?: 'clear' | 'cloudy' | 'rainy' | 'snowy' | 'stormy' | 'foggy';
    timeOfDay?: 'day' | 'sunset' | 'night';
    cloudDensity?: number;
    animationSpeed?: number;
    particleCount?: number;
    showStars?: boolean;
    cameraAngle?: number;
    backgroundColor?: string;
}

export const FrameEngine_WeatherElement: React.FC<WeatherElementProps> = ({
    width,
    height,
    weatherType = 'clear',
    timeOfDay = 'day',
    cloudDensity = 0.5,
    animationSpeed = 1,
    particleCount = 500,
    showStars = true,
    cameraAngle = 30,
    backgroundColor = 'transparent',
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const cloudsRef = useRef<THREE.Group | null>(null);
    const particlesRef = useRef<THREE.Points | null>(null);
    const starsRef = useRef<THREE.Points | null>(null);
    const animationIdRef = useRef<number | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Scene setup
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // Camera setup
        const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        camera.position.set(0, 2, 5);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({
            alpha: backgroundColor === 'transparent',
            antialias: true
        });
        renderer.setSize(width, height);
        renderer.setClearColor(backgroundColor === 'transparent' ? 0x000000 : 0x87CEEB, backgroundColor === 'transparent' ? 0 : 1);
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Sky gradient based on time of day
        const updateSkyColor = () => {
            if (backgroundColor !== 'transparent') {
                let skyColor: number;
                switch (timeOfDay) {
                    case 'day':
                        skyColor = 0x87CEEB; // Sky blue
                        break;
                    case 'sunset':
                        skyColor = 0xFF6B6B; // Orange/red
                        break;
                    case 'night':
                        skyColor = 0x0A1128; // Dark blue
                        break;
                    default:
                        skyColor = 0x87CEEB;
                }
                scene.background = new THREE.Color(skyColor);
            }
        };
        updateSkyColor();

        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, timeOfDay === 'night' ? 0.3 : 0.6);
        scene.add(ambientLight);

        // Directional light (sun)
        const sunLight = new THREE.DirectionalLight(0xffffff, timeOfDay === 'night' ? 0.1 : 0.8);
        sunLight.position.set(5, 10, 5);
        scene.add(sunLight);

        // Create clouds
        const createClouds = () => {
            const clouds = new THREE.Group();
            const cloudCount = Math.floor(5 * cloudDensity);

            for (let i = 0; i < cloudCount; i++) {
                const cloudGeometry = new THREE.SphereGeometry(1, 8, 8);
                const cloudMaterial = new THREE.MeshPhongMaterial({
                    color: timeOfDay === 'night' ? 0x444444 : 0xFFFFFF,
                    transparent: true,
                    opacity: weatherType === 'foggy' ? 0.8 : 0.6,
                });

                const cloud = new THREE.Group();

                // Multiple spheres to form cloud shape
                for (let j = 0; j < 3; j++) {
                    const puff = new THREE.Mesh(cloudGeometry, cloudMaterial);
                    puff.position.x = (Math.random() - 0.5) * 2;
                    puff.position.y = (Math.random() - 0.5) * 0.5;
                    puff.position.z = (Math.random() - 0.5) * 2;
                    puff.scale.set(
                        0.5 + Math.random() * 0.5,
                        0.3 + Math.random() * 0.3,
                        0.5 + Math.random() * 0.5
                    );
                    cloud.add(puff);
                }

                cloud.position.set(
                    (Math.random() - 0.5) * 20,
                    2 + Math.random() * 3,
                    (Math.random() - 0.5) * 20
                );
                clouds.add(cloud);
            }

            cloudsRef.current = clouds;
            scene.add(clouds);
        };

        if (weatherType !== 'clear') {
            createClouds();
        }

        // Create weather particles (rain/snow)
        const createParticles = () => {
            if (weatherType !== 'rainy' && weatherType !== 'snowy') return;

            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(particleCount * 3);

            for (let i = 0; i < particleCount; i++) {
                positions[i * 3] = (Math.random() - 0.5) * 20;
                positions[i * 3 + 1] = Math.random() * 10;
                positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const material = new THREE.PointsMaterial({
                color: weatherType === 'rainy' ? 0x4A90E2 : 0xFFFFFF,
                size: weatherType === 'rainy' ? 0.1 : 0.15,
                transparent: true,
                opacity: weatherType === 'rainy' ? 0.6 : 0.8,
            });

            const particles = new THREE.Points(geometry, material);
            particlesRef.current = particles;
            scene.add(particles);
        };

        createParticles();

        // Create stars for night
        const createStars = () => {
            if (!showStars || timeOfDay !== 'night') return;

            const geometry = new THREE.BufferGeometry();
            const starCount = 200;
            const positions = new Float32Array(starCount * 3);

            for (let i = 0; i < starCount; i++) {
                positions[i * 3] = (Math.random() - 0.5) * 100;
                positions[i * 3 + 1] = Math.random() * 50 + 10;
                positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const material = new THREE.PointsMaterial({
                color: 0xFFFFFF,
                size: 0.2,
                transparent: true,
                opacity: 0.8,
            });

            const stars = new THREE.Points(geometry, material);
            starsRef.current = stars;
            scene.add(stars);
        };

        createStars();

        // Animation loop
        const animate = () => {
            animationIdRef.current = requestAnimationFrame(animate);

            // Animate clouds
            if (cloudsRef.current) {
                cloudsRef.current.children.forEach((cloud: THREE.Object3D) => {
                    cloud.position.x += 0.01 * animationSpeed;
                    if (cloud.position.x > 10) cloud.position.x = -10;
                    cloud.rotation.y += 0.001 * animationSpeed;
                });
            }

            // Animate particles
            if (particlesRef.current) {
                const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
                for (let i = 0; i < particleCount; i++) {
                    positions[i * 3 + 1] -= weatherType === 'rainy' ? 0.1 * animationSpeed : 0.05 * animationSpeed;

                    if (positions[i * 3 + 1] < 0) {
                        positions[i * 3 + 1] = 10;
                    }
                }
                particlesRef.current.geometry.attributes.position.needsUpdate = true;
            }

            // Animate stars (subtle twinkle)
            if (starsRef.current) {
                const material = starsRef.current.material as THREE.PointsMaterial;
                material.opacity = 0.6 + Math.sin(Date.now() * 0.001) * 0.2;
            }

            // Update camera angle
            if (cameraRef.current) {
                const radians = (cameraAngle * Math.PI) / 180;
                cameraRef.current.position.y = 2 + Math.sin(radians) * 3;
                cameraRef.current.lookAt(0, 0, 0);
            }

            renderer.render(scene, camera);
        };

        animate();

        // Cleanup
        return () => {
            if (animationIdRef.current) {
                cancelAnimationFrame(animationIdRef.current);
            }
            if (containerRef.current && renderer.domElement) {
                containerRef.current.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, [width, height, weatherType, timeOfDay, cloudDensity, animationSpeed, particleCount, showStars, cameraAngle, backgroundColor]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
            }}
        />
    );
};