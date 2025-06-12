/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Container } from "@mui/material";
import Navbar from "components/Navbar";
import Dashboard from "pages/Dashboard";
import Junctions from "pages/Junctions";
import Devices from "pages/Devices";
import Services from "pages/Services";
import Collectors from "pages/Collectors";
import ConfigureDevice from "pages/ConfigureDevice";
import ConfigureService from "pages/ConfigureService";
import ConfigureCollector from "pages/ConfigureCollector";
import ConfigureJunction from "pages/ConfigureJunction";
import Payloads from "pages/Payloads";
import ConfigurePayload from "pages/ConfigurePayload";
import Testing from "pages/Testing";
import TestingQuad from "pages/TestingQuad";
import HostInfo from "pages/HostInfo";
import HostCharts from "pages/HostCharts";
import Settings from "pages/Settings";
import { AuthProvider } from "auth/AuthContext";
import { ProtectedRoute } from "auth/ProtectedRoute";

// Global Fetch Wrapper for Authentication
const originalFetch = window.fetch;
(window as any).fetch = (url: string | Request, options?: RequestInit): Promise<Response> => {
    const token = localStorage.getItem('junctionrelay_token');

    const urlString = typeof url === 'string' ? url : url.url;
    const isApiCall = urlString.startsWith('/api/');
    const isPublicEndpoint = urlString.startsWith('/api/auth/login') ||
        urlString.startsWith('/api/auth/setup') ||
        urlString.startsWith('/api/auth/status') ||
        urlString.startsWith('/api/auth/enabled');

    if (isApiCall && !isPublicEndpoint && token) {
        const headers = {
            'Authorization': `Bearer ${token}`,
            ...options?.headers,
        };
        options = { ...options, headers };

        // Debug logging - remove this later
        console.log(`Adding auth header to: ${urlString}`);
    } else if (isApiCall && !isPublicEndpoint) {
        // Debug logging - remove this later  
        console.log(`No token for: ${urlString}, token exists: ${!!token}`);
    }

    return originalFetch(url, options);
};

const App = () => {
    return (
        <AuthProvider>
            <ProtectedRoute>
                <Router>
                    <Navbar />
                    <Container
                        maxWidth={false}
                        sx={{
                            backgroundColor: "background.default",
                            minHeight: "100vh",
                            paddingTop: { xs: "56px", sm: "64px" }, // adjust for AppBar height on mobile & desktop
                            paddingBottom: 4
                        }}
                    >
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/junctions" element={<Junctions />} />
                            <Route path="/devices" element={<Devices />} />
                            <Route path="/services" element={<Services />} />
                            <Route path="/collectors" element={<Collectors />} />
                            <Route path="/configure-device/:id" element={<ConfigureDevice />} />
                            <Route path="/configure-service/:id" element={<ConfigureService />} />
                            <Route path="/configure-collector/:id" element={<ConfigureCollector />} />
                            <Route path="/configure-junction/:id" element={<ConfigureJunction />} />
                            <Route path="/payloads" element={<Payloads />} />
                            <Route path="/configure-payload/:id" element={<ConfigurePayload />} />
                            <Route path="/testing" element={<Testing />} />
                            <Route path="/testingquad" element={<TestingQuad />} />
                            <Route path="/hostinfo" element={<HostInfo />} />
                            <Route path="/hostcharts" element={<HostCharts />} />
                            <Route path="/settings" element={<Settings />} />
                        </Routes>
                    </Container>
                </Router>
            </ProtectedRoute>
        </AuthProvider>
    );
};

export default App;