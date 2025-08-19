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

import React from "react";
import { Box, Typography } from "@mui/material";

interface SetupInstructions_CollectorsProps {
    collectorType: string;
}

// Helper function to get setup instructions for each collector type
export const SetupInstructions_Collectors: React.FC<SetupInstructions_CollectorsProps> = ({ collectorType }) => {
    const getInstructions = () => {
        switch (collectorType) {
            case "Github":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            How to get GitHub credentials:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>1. Get Repository URL:</strong><br />
                            Copy the URL from your GitHub repository (e.g., https://github.com/username/repository)
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>2. Create Personal Access Token:</strong><br />
                            • Go to GitHub Settings - Developer settings - Personal access tokens<br />
                            • Click "Generate new token (classic)"<br />
                            • Select scope: <strong>repo</strong> (for private repos) or <strong>public_repo</strong> (for public repos)<br />
                            • Copy the token (starts with ghp_...)
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Note:</strong> PAT is required for traffic statistics (views, clones, referrers) even on public repositories.
                        </Typography>
                    </Box>
                );

            case "Cloudflare":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            How to get Cloudflare credentials:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>1. Get Zone ID:</strong><br />
                            • Log into Cloudflare Dashboard<br />
                            • Select your domain/site<br />
                            • Copy Zone ID from right sidebar
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>2. Create API Token:</strong><br />
                            • Go to Profile - API Tokens - Create Token<br />
                            • Use "Custom Token"<br />
                            • Permissions: Zone:Zone:Read, Zone:Analytics:Read<br />
                            • Zone Resources: Include your specific zone<br />
                            • Copy the token
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Note:</strong> Analytics require Pro plan or higher. Free plan only provides basic zone info.
                        </Typography>
                    </Box>
                );

            case "Stripe":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            How to get Stripe credentials:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>1. API Base URL:</strong><br />
                            Use: https://api.stripe.com
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>2. Get Secret Key:</strong><br />
                            • Log into Stripe Dashboard<br />
                            • Go to Developers - API Keys<br />
                            • Copy your Secret Key (starts with sk_test_ or sk_live_)<br />
                            • For production, use Restricted Keys with limited permissions
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Permissions needed:</strong> Read access to Subscriptions, Payment Intents, Charges, Customers, Products
                        </Typography>
                    </Box>
                );

            case "Render":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            How to get Render credentials:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>1. Get Service ID:</strong><br />
                            • Navigate to your service in Render Dashboard<br />
                            • Copy Service ID from URL (srv-abc123def456)<br />
                            • Or use full dashboard URL
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>2. Create API Key:</strong><br />
                            • Go to Account Settings - API Keys<br />
                            • Click "Create API Key"<br />
                            • Name it "JunctionRelay Collector"<br />
                            • Copy the key (starts with rnd_...)
                        </Typography>
                    </Box>
                );

            case "HomeAssistant":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            How to get Home Assistant credentials:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>1. Home Assistant URL:</strong><br />
                            Your Home Assistant instance URL (e.g., http://192.168.1.100:8123)
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>2. Create Long-Lived Access Token:</strong><br />
                            • Go to Profile (click your name) - Security<br />
                            • Scroll to "Long-lived access tokens"<br />
                            • Click "Create Token"<br />
                            • Copy the generated token
                        </Typography>
                    </Box>
                );

            case "Host":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Host Device Monitoring:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            • URL: Use "localhost" or the server's hostname<br />
                            • No access token required<br />
                            • Monitors: CPU, Memory, Disk, Network usage
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            This collector monitors the system where JunctionRelay is running.
                        </Typography>
                    </Box>
                );

            case "iCal":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            iCal Calendar Setup:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>1. Get iCal Feed URL:</strong><br />
                            • For Google Calendar: Calendar Settings - Integrate calendar - Public URL to this calendar<br />
                            • For Outlook: Calendar settings - Shared calendars - Publish calendar - ICS link<br />
                            • For Apple Calendar: Share calendar - Public Calendar - Copy link<br />
                            • Any standard iCal (.ics) feed URL
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>2. Example URLs:</strong><br />
                            • Google: https://calendar.google.com/calendar/ical/[email]/public/basic.ics<br />
                            • Outlook: https://outlook.live.com/owa/calendar/[id]/[key]/cid-[id]/calendar.ics<br />
                            • Any other iCal-compatible service
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>3. What it monitors:</strong><br />
                            • Creates daily sensors with event information<br />
                            • JSON format with title, description, location, start/end times<br />
                            • Supports all-day events and timed events<br />
                            • Perfect for dashboard widgets showing calendar schedules
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>4. Convenience Sensors:</strong><br />
                            • <strong>Daily:</strong> 'Yesterday', 'Today', 'Tomorrow', 'Next 7 Days'<br />
                            • <strong>Current Event:</strong> Shows event happening right now (if any)<br />
                            • <strong>Next Event:</strong> Shows the next upcoming event<br />
                            • <strong>Time Until Next Event:</strong> Countdown to next event in minutes + human-readable format
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Note:</strong> The collector creates one sensor per day containing all events for that date, plus 7 convenience sensors. Be sure to enable the cleanup task to remove old daily sensors from the DB.
                        </Typography>
                    </Box>
                );

            case "InternetTime":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Internet Time Synchronization:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            • No URL or credentials required<br />
                            • Automatically fetches accurate UTC time from multiple internet sources<br />
                            • Provides network-synchronized time reference
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>What it monitors:</strong><br />
                            • UTC time in ISO 8601 format<br />
                            • Unix timestamp (seconds since epoch)<br />
                            • Human-readable UTC time<br />
                            • Time source status (Internet/Cached)<br />
                            • Connection status to time servers
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Multiple fallback time APIs for reliability<br />
                            • Smart caching when network is unavailable<br />
                            • Automatic failover between time sources
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Use case:</strong> Perfect for systems requiring accurate time synchronization or when comparing against system time for drift detection.
                        </Typography>
                    </Box>
                );

            case "LibreHardwareMonitor":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            LibreHardwareMonitor Setup:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>1. Install LibreHardwareMonitor:</strong><br />
                            Download and run LibreHardwareMonitor on the target system
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>2. Enable Web Server:</strong><br />
                            • In LibreHardwareMonitor, go to Options - Web Server<br />
                            • Enable the web server (usually port 8085)<br />
                            • URL: http://localhost:8085 or http://server-ip:8085
                        </Typography>
                    </Box>
                );

            case "MQTT":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            MQTT Service Setup:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Prerequisites:</strong><br />
                            • You need an existing MQTT service configured in JunctionRelay<br />
                            • The MQTT service should be connected to your broker
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            • Select an existing MQTT service from the dropdown<br />
                            • The collector will subscribe to topics from that service
                        </Typography>
                    </Box>
                );

            case "UptimeKuma":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Uptime Kuma Setup:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            • URL: Your Uptime Kuma metrics endpoint<br />
                            • Default: http://localhost:3001/metrics<br />
                            • Ensure Uptime Kuma's metrics endpoint is accessible
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Monitors uptime statistics from your Uptime Kuma instance.
                        </Typography>
                    </Box>
                );

            case "NeoPixelColor":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            NeoPixel Color Monitoring:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            • No URL or credentials required<br />
                            • Monitors LED strip color data<br />
                            • Poll rate: 3 seconds
                        </Typography>
                    </Box>
                );

            case "SonarrCalendar":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Sonarr Calendar Setup:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>1. Get iCal Feed URL:</strong><br />
                            • Open Sonarr web interface<br />
                            • Go to Calendar - iCal Link<br />
                            • Copy your iCal Feed Key into JunctionRelay (NOTE - This includes your API Key!)
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>3. What it monitors:</strong><br />
                            • Creates daily sensors with episode information<br />
                            • JSON format with series, season, episode, and air times<br />
                            • Perfect for dashboard widgets showing TV schedules
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Note:</strong> The collector creates one sensor per day containing all episodes for that date, and 4 convienence sensors for 'Yesterday', 'Today', 'Tomorrow' and 'Next 7 Days'. Be sure to enable the cleanup task to remove old "Day" sensors from the DB.
                        </Typography>
                    </Box>
                );

            case "SystemTime":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            System Time Monitoring:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            • No URL or credentials required<br />
                            • Always available - no network dependency<br />
                            • Provides local system time reference
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>What it monitors:</strong><br />
                            • System UTC time in ISO 8601 format<br />
                            • Unix timestamp (seconds since epoch)<br />
                            • Human-readable UTC time<br />
                            • Local time with timezone offset<br />
                            • System timezone information
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Both UTC and local time formats<br />
                            • Timezone detection and display<br />
                            • Always reliable (no network required)
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Use case:</strong> Perfect for reliable local time reference, comparing with internet time for drift detection, or when network connectivity is unreliable.
                        </Typography>
                    </Box>
                );

            case "Unraid":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            How to get Unraid credentials:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>1. Install Unraid Connect Plugin:</strong><br />
                            • Go to Apps tab in Unraid<br />
                            • Search for "Unraid Connect"<br />
                            • Install the plugin
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>2. Enable GraphQL Sandbox via CLI:</strong><br />
                            • SSH into your Unraid server<br />
                            • Run: <code style={{ backgroundColor: '#f5f5f5', padding: '2px 4px', borderRadius: '3px' }}>unraid-api developer</code><br />
                            • Follow the prompts to enable the sandbox
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>3. Create API Key via CLI:</strong><br />
                            • Run: <code style={{ backgroundColor: '#f5f5f5', padding: '2px 4px', borderRadius: '3px' }}>unraid-api apikey --create</code><br />
                            • Follow prompts to set name, description, roles, and permissions<br />
                            • Copy the generated API key
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>4. Unraid IP:</strong><br />
                            Use: <strong>https://your-unraid-ip</strong><br />
                            (Note: If you have SLS/HTTPS disabled, you can just use HTTP://)
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>What it monitors:</strong> System info (OS, CPU), array status, Docker containers, disk information
                        </Typography>
                    </Box>
                );

            case "RateTester":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Rate Tester Configuration:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            • Performance testing and rate monitoring<br />
                            • No external credentials required<br />
                            • High-frequency polling for real-time feedback
                        </Typography>
                    </Box>
                );

            case "GenericAPI":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Generic API Configuration:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>1. API Endpoint URL:</strong><br />
                            • Enter the full URL to your JSON API endpoint<br />
                            • Must return JSON with success/data structure<br />
                            • Example: https://api.example.com/metrics
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>2. Access Token:</strong><br />
                            • API authentication token (if required)<br />
                            • Sent as X-Collector-Token header<br />
                            • Leave blank if API doesn't require authentication
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Expected Response Format:</strong><br />
                            <code style={{ backgroundColor: '#f5f5f5', padding: '2px 4px', borderRadius: '3px' }}>
                                {`{"success": true, "data": {"metric1": 123, "metric2": "value"}}`}
                            </code>
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>What it does:</strong> Converts each key-value pair in the "data" object to individual sensors with smart categorization and unit detection.
                        </Typography>
                    </Box>
                );

            default:
                return (
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            No specific setup instructions available for this collector type.
                        </Typography>
                    </Box>
                );
        }
    };

    return getInstructions();
};

export default SetupInstructions_Collectors;