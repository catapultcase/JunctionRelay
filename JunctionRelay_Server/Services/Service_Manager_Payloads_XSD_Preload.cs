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

using System.Text.Json;
using JunctionRelayServer.Models;
using Microsoft.Extensions.DependencyInjection;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// Builds XSD prepayload messages for Mode 3 (Server → XSD).
    /// The prepayload contains all layouts, transitions, and assets needed
    /// before sensor streaming begins.
    ///
    /// NOTE: Junction-layout-transition integration is not yet complete.
    /// This service provides the structure for when that integration is ready.
    /// </summary>
    public class Service_Manager_Payloads_XSD_Preload
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IHttpContextAccessor _httpContextAccessor;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        public Service_Manager_Payloads_XSD_Preload(
            IServiceScopeFactory scopeFactory,
            IHttpContextAccessor httpContextAccessor)
        {
            _scopeFactory = scopeFactory;
            _httpContextAccessor = httpContextAccessor;
        }

        /// <summary>
        /// Build the complete xsd_prepayload message for Mode 3.
        /// This is sent once when the server connects to XSD, before sensor streaming starts.
        ///
        /// Structure matches XSD's _cachedFullPayload:
        /// {
        ///   "type": "xsd_prepayload",
        ///   "screenId": "xsd",
        ///   "layoutConfigs": {
        ///     "layouts/idle": { "frameConfig": {...}, "frameElements": [...] },
        ///     "layouts/gaming": { "frameConfig": {...}, "frameElements": [...] }
        ///   },
        ///   "transitions": [...],
        ///   "initialLayout": "layouts/idle"
        /// }
        /// </summary>
        public async Task<string> BuildPrepayloadAsync(
            int junctionId,
            string junctionName,
            List<int> layoutIds,
            string? initialLayoutKey = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var frameLayoutDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();

            var layoutConfigs = new Dictionary<string, object>();

            foreach (var layoutId in layoutIds)
            {
                var layout = await frameLayoutDb.GetFrameLayoutByIdAsync(layoutId);
                if (layout == null) continue;

                var layoutKey = $"layouts/{SanitizeLayoutName(layout.DisplayName ?? "unnamed")}";
                var layoutConfig = BuildLayoutConfig(layout);
                layoutConfigs[layoutKey] = layoutConfig;

                // Use first layout as initial if not specified
                if (initialLayoutKey == null)
                {
                    initialLayoutKey = layoutKey;
                }
            }

            // TODO: Load transitions from junction config when integration is complete
            var transitions = new List<object>();

            var payload = new Dictionary<string, object>
            {
                ["type"] = "xsd_prepayload",
                ["screenId"] = "xsd",
                ["junctionId"] = junctionId,
                ["junctionName"] = junctionName,
                ["layoutConfigs"] = layoutConfigs,
                ["transitions"] = transitions,
                ["initialLayout"] = initialLayoutKey ?? "layouts/default"
            };

            return JsonSerializer.Serialize(payload, _jsonOptions);
        }

        /// <summary>
        /// Build a single layout config from a frame layout.
        /// Returns { frameConfig: {...}, frameElements: [...] }
        /// </summary>
        private Dictionary<string, object?> BuildLayoutConfig(Model_Frame_Layout layout)
        {
            var baseUrl = GetServerBaseUrl();

            object? frameConfig = null;
            object? frameElements = null;

            // Parse and process frameConfig
            if (!string.IsNullOrWhiteSpace(layout.JsonFrameConfigRuntime))
            {
                try
                {
                    using var configDoc = JsonDocument.Parse(layout.JsonFrameConfigRuntime);
                    var rootElement = configDoc.RootElement;

                    if (rootElement.TryGetProperty("frameConfig", out var innerFrameConfig))
                    {
                        frameConfig = CloneAndProcessFrameConfig(innerFrameConfig, layout, baseUrl);
                    }
                }
                catch (JsonException ex)
                {
                    Console.WriteLine($"[XSD_PRELOAD] Invalid JsonFrameConfigRuntime for layout {layout.Id}: {ex.Message}");
                }
            }

            // Parse and process frameElements
            if (!string.IsNullOrWhiteSpace(layout.JsonFrameElements))
            {
                try
                {
                    using var elementsDoc = JsonDocument.Parse(layout.JsonFrameElements);
                    frameElements = CloneAndProcessFrameElements(elementsDoc.RootElement, baseUrl);
                }
                catch (JsonException ex)
                {
                    Console.WriteLine($"[XSD_PRELOAD] Invalid JsonFrameElements for layout {layout.Id}: {ex.Message}");
                }
            }

            return new Dictionary<string, object?>
            {
                ["frameConfig"] = frameConfig,
                ["frameElements"] = frameElements
            };
        }

        /// <summary>
        /// Clone frameConfig and inject full URLs for assets.
        /// </summary>
        private object? CloneAndProcessFrameConfig(JsonElement element, Model_Frame_Layout layout, string baseUrl)
        {
            var configDict = CloneJsonValue(element) as Dictionary<string, object>;
            if (configDict == null) return null;

            // Add Rive fileUrl if layout has a Rive file
            if (!string.IsNullOrEmpty(layout.RiveFile) && configDict.TryGetValue("rive", out var riveObj))
            {
                if (riveObj is Dictionary<string, object> riveDict)
                {
                    riveDict["fileUrl"] = $"{baseUrl}/api/frameengine/rive/{layout.RiveFile}/content";
                }
            }

            // Process background URLs
            if (configDict.TryGetValue("background", out var bgObj) && bgObj is Dictionary<string, object> bgDict)
            {
                ProcessBackgroundUrls(bgDict, layout, baseUrl);
            }

            return configDict;
        }

        /// <summary>
        /// Process background object to convert filenames to full URLs.
        /// </summary>
        private void ProcessBackgroundUrls(Dictionary<string, object> bgDict, Model_Frame_Layout layout, string baseUrl)
        {
            // Convert imageUrl filename to full URL
            if (bgDict.TryGetValue("imageUrl", out var imageUrlObj) && imageUrlObj is string imageFilename)
            {
                if (!string.IsNullOrEmpty(imageFilename) && !imageFilename.StartsWith("http"))
                {
                    bgDict["imageUrl"] = $"{baseUrl}/api/frameengine/images/{imageFilename}/content";
                }
            }

            // Convert videoUrl filename to full URL
            if (bgDict.TryGetValue("videoUrl", out var videoUrlObj) && videoUrlObj is string videoFilename)
            {
                if (!string.IsNullOrEmpty(videoFilename) && !videoFilename.StartsWith("http"))
                {
                    bgDict["videoUrl"] = $"{baseUrl}/api/frameengine/videos/{videoFilename}/content";
                }
            }

            // Handle background type rive
            if (bgDict.TryGetValue("type", out var bgTypeObj) && bgTypeObj is string bgType && bgType == "rive")
            {
                if (!string.IsNullOrEmpty(layout.RiveFile))
                {
                    bgDict["riveFile"] = $"{baseUrl}/api/frameengine/rive/{layout.RiveFile}/content";
                }
            }
            else if (bgDict.TryGetValue("riveFile", out var riveFileObj) && riveFileObj is string riveFilename)
            {
                if (!string.IsNullOrEmpty(riveFilename) && !riveFilename.StartsWith("http"))
                {
                    bgDict["riveFile"] = $"{baseUrl}/api/frameengine/rive/{riveFilename}/content";
                }
            }
        }

        /// <summary>
        /// Clone frameElements array and convert media filenames to full URLs.
        /// </summary>
        private object? CloneAndProcessFrameElements(JsonElement element, string baseUrl)
        {
            var elementsList = CloneJsonValue(element) as List<object>;
            if (elementsList == null) return null;

            foreach (var item in elementsList)
            {
                if (item is Dictionary<string, object> elementDict)
                {
                    if (elementDict.TryGetValue("type", out var typeObj) && typeObj is string elementType)
                    {
                        if (elementDict.TryGetValue("properties", out var propsObj) && propsObj is Dictionary<string, object> props)
                        {
                            ProcessMediaElementUrls(props, elementType, baseUrl);
                        }
                    }
                }
            }

            return elementsList;
        }

        /// <summary>
        /// Convert media element filenames to full URLs.
        /// </summary>
        private void ProcessMediaElementUrls(Dictionary<string, object> props, string elementType, string baseUrl)
        {
            switch (elementType)
            {
                case "media-image":
                    if (props.TryGetValue("filename", out var imageFilenameObj) && imageFilenameObj is string imageFilename)
                    {
                        if (!string.IsNullOrEmpty(imageFilename) && !imageFilename.StartsWith("http"))
                        {
                            props["filename"] = $"{baseUrl}/api/frameengine/images/{imageFilename}/content";
                        }
                    }
                    break;

                case "media-video":
                    if (props.TryGetValue("filename", out var videoFilenameObj) && videoFilenameObj is string videoFilename)
                    {
                        if (!string.IsNullOrEmpty(videoFilename) && !videoFilename.StartsWith("http"))
                        {
                            props["filename"] = $"{baseUrl}/api/frameengine/videos/{videoFilename}/content";
                        }
                    }
                    break;

                case "media-rive":
                    if (props.TryGetValue("filename", out var riveFilenameObj) && riveFilenameObj is string riveFilename)
                    {
                        if (!string.IsNullOrEmpty(riveFilename) && !riveFilename.StartsWith("http"))
                        {
                            props["filename"] = $"{baseUrl}/api/frameengine/rive/{riveFilename}/content";
                        }
                    }
                    break;
            }
        }

        /// <summary>
        /// Sanitize layout name for use as a key (lowercase, replace spaces with hyphens).
        /// </summary>
        private static string SanitizeLayoutName(string name)
        {
            return name.ToLowerInvariant()
                .Replace(" ", "-")
                .Replace("_", "-");
        }

        /// <summary>
        /// Get the server base URL for constructing asset URLs.
        /// </summary>
        private string GetServerBaseUrl()
        {
            var httpContext = _httpContextAccessor.HttpContext;
            string scheme = "http";
            string? hostValue = null;
            int port = 7180;

            if (httpContext?.Request != null)
            {
                var request = httpContext.Request;
                scheme = request.Scheme;
                hostValue = request.Host.Host;
                port = request.Host.Port ?? 7180;
            }

            // Use HTTP request IP if available
            if (httpContext?.Request != null && !string.IsNullOrEmpty(hostValue))
            {
                if (System.Net.IPAddress.TryParse(hostValue, out _))
                {
                    return $"{scheme}://{hostValue}:{port}";
                }

                if (hostValue.Contains('.') && !hostValue.All(c => char.IsLetterOrDigit(c)))
                {
                    return $"{scheme}://{hostValue}:{port}";
                }
            }

            // Try network interfaces
            try
            {
                var interfaces = System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces();
                foreach (var iface in interfaces.Where(i =>
                    i.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up &&
                    i.NetworkInterfaceType != System.Net.NetworkInformation.NetworkInterfaceType.Loopback))
                {
                    var ipProps = iface.GetIPProperties();
                    var ipv4Address = ipProps.UnicastAddresses
                        .FirstOrDefault(addr =>
                            addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork &&
                            !System.Net.IPAddress.IsLoopback(addr.Address) &&
                            !addr.Address.ToString().StartsWith("169.254") &&
                            !addr.Address.ToString().StartsWith("172.17") &&
                            !addr.Address.ToString().StartsWith("172.18") &&
                            !addr.Address.ToString().StartsWith("172.19") &&
                            !addr.Address.ToString().StartsWith("172.20"))?.Address;

                    if (ipv4Address != null)
                    {
                        return $"{scheme}://{ipv4Address}:{port}";
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[XSD_PRELOAD] Could not enumerate network interfaces: {ex.Message}");
            }

            // Fallback to DNS
            try
            {
                var host = System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName());
                var localIP = host.AddressList
                    .FirstOrDefault(ip =>
                        ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork &&
                        !System.Net.IPAddress.IsLoopback(ip) &&
                        !ip.ToString().StartsWith("169.254") &&
                        !ip.ToString().StartsWith("172.17") &&
                        !ip.ToString().StartsWith("172.18") &&
                        !ip.ToString().StartsWith("172.19") &&
                        !ip.ToString().StartsWith("172.20"));

                if (localIP != null)
                {
                    return $"{scheme}://{localIP}:{port}";
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[XSD_PRELOAD] Could not auto-detect IP via DNS: {ex.Message}");
            }

            var machineName = System.Net.Dns.GetHostName();
            Console.WriteLine($"[XSD_PRELOAD] WARNING: Using fallback hostname: {machineName}");
            return $"{scheme}://{machineName}:{port}";
        }

        /// <summary>
        /// Deep clone a JsonElement to a Dictionary/List structure.
        /// </summary>
        private object? CloneJsonValue(JsonElement element)
        {
            switch (element.ValueKind)
            {
                case JsonValueKind.Object:
                    var obj = new Dictionary<string, object>();
                    foreach (var prop in element.EnumerateObject())
                    {
                        var cloned = CloneJsonValue(prop.Value);
                        if (cloned != null)
                            obj[prop.Name] = cloned;
                    }
                    return obj;

                case JsonValueKind.Array:
                    var list = new List<object>();
                    foreach (var item in element.EnumerateArray())
                    {
                        var cloned = CloneJsonValue(item);
                        if (cloned != null)
                            list.Add(cloned);
                    }
                    return list;

                case JsonValueKind.String:
                    return element.GetString();

                case JsonValueKind.Number:
                    if (element.TryGetInt32(out var i)) return i;
                    if (element.TryGetInt64(out var l)) return l;
                    if (element.TryGetDouble(out var d)) return d;
                    return element.GetRawText();

                case JsonValueKind.True:
                    return true;

                case JsonValueKind.False:
                    return false;

                case JsonValueKind.Null:
                default:
                    return null;
            }
        }
    }
}
