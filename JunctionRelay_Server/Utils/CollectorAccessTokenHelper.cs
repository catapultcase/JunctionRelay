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

namespace JunctionRelayServer.Utils
{
    /// <summary>
    /// Helper utility to determine if a collector type requires an access token
    /// </summary>
    public static class CollectorAccessTokenHelper
    {
        // Collectors that do NOT require an access token
        private static readonly HashSet<string> CollectorsWithoutToken = new(StringComparer.OrdinalIgnoreCase)
        {
            "Host",
            "SystemTime",
            "InternetTime",
            "RateTester",
            "LibreHardwareMonitor",
            "HWiNFO",
            "EventEngine",
            "NeoPixelColor"
        };

        /// <summary>
        /// Determines if a collector type requires an access token
        /// </summary>
        /// <param name="collectorType">The collector type (e.g., "Github", "Host")</param>
        /// <returns>True if the collector requires an access token, false otherwise</returns>
        public static bool RequiresAccessToken(string collectorType)
        {
            if (string.IsNullOrWhiteSpace(collectorType))
            {
                return false;
            }

            return !CollectorsWithoutToken.Contains(collectorType);
        }

        /// <summary>
        /// Gets the access token status for display purposes
        /// </summary>
        /// <param name="collectorType">The collector type</param>
        /// <param name="hasAccessToken">Whether the collector has an access token set</param>
        /// <returns>"Set", "Not Set", or "N/A"</returns>
        public static string GetAccessTokenStatus(string collectorType, bool hasAccessToken)
        {
            if (!RequiresAccessToken(collectorType))
            {
                return "N/A";
            }

            return hasAccessToken ? "Set" : "Not Set";
        }
    }
}
