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

using JunctionRelayServer.Models;
using System.IO.Compression;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_LayoutLoader
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly DataDirectoryProvider _dataDirProvider;

        public Service_LayoutLoader(
            IServiceScopeFactory scopeFactory,
            DataDirectoryProvider dataDirProvider)
        {
            _scopeFactory = scopeFactory;
            _dataDirProvider = dataDirProvider;
        }

        public async Task<Model_Frame_Layout?> LoadLayoutAsync(string layoutPath)
        {
            if (string.IsNullOrEmpty(layoutPath))
                return null;

            // Pattern: frameengine:{id} — load from database by ID
            if (layoutPath.StartsWith("frameengine:"))
            {
                var idStr = layoutPath.Substring("frameengine:".Length);
                if (int.TryParse(idStr, out var id))
                {
                    using var scope = _scopeFactory.CreateScope();
                    var frameEngineDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();
                    return await frameEngineDb.GetFrameLayoutByIdAsync(id);
                }
                Console.WriteLine($"[SERVICE_LAYOUT_LOADER] ⚠️ Invalid frameengine ID in path: {layoutPath}");
                return null;
            }

            // Pattern: subscriptions/{filename} — load from downloaded ZIP
            if (layoutPath.StartsWith("subscriptions/"))
            {
                var filename = layoutPath.Substring("subscriptions/".Length);
                var downloadsDir = Path.Combine(_dataDirProvider.DataDirectory, "frameengine", "downloads");
                var zipPath = Path.Combine(downloadsDir, filename);

                if (!File.Exists(zipPath))
                {
                    Console.WriteLine($"[SERVICE_LAYOUT_LOADER] ❌ Subscription ZIP not found: {zipPath}");
                    return null;
                }

                return await LoadLayoutFromZipAsync(zipPath);
            }

            Console.WriteLine($"[SERVICE_LAYOUT_LOADER] ⚠️ Unknown layout path format: {layoutPath}");
            return null;
        }

        private async Task<Model_Frame_Layout?> LoadLayoutFromZipAsync(string zipPath)
        {
            try
            {
                using var zipStream = new FileStream(zipPath, FileMode.Open, FileAccess.Read);
                using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read);

                var configEntry = archive.GetEntry("config.json");
                if (configEntry == null)
                {
                    Console.WriteLine($"[SERVICE_LAYOUT_LOADER] ❌ config.json not found in: {zipPath}");
                    return null;
                }

                string configJson;
                using (var configStream = configEntry.Open())
                using (var reader = new StreamReader(configStream))
                {
                    configJson = await reader.ReadToEndAsync();
                }

                var importData = JsonSerializer.Deserialize<JsonElement>(configJson);

                var layout = new Model_Frame_Layout
                {
                    Id = -1, // Virtual ID — not in database
                    DisplayName = GetStringOrDefault(importData, "displayName", "Subscribed Layout"),
                    Description = GetStringOrDefault(importData, "description", null),
                    LayoutType = GetStringOrDefault(importData, "layoutType", "COMPOSITE_MODE")!,
                    Width = GetIntOrDefault(importData, "width", 800),
                    Height = GetIntOrDefault(importData, "height", 480),
                    Orientation = GetStringOrDefault(importData, "orientation", "landscape")!,
                    BackgroundType = GetStringOrDefault(importData, "backgroundType", "none"),
                    BackgroundColor = GetStringOrDefault(importData, "backgroundColor", "#000000"),
                    BackgroundImageUrl = GetStringOrDefault(importData, "backgroundImageUrl", null),
                    BackgroundImageFit = GetStringOrDefault(importData, "backgroundImageFit", "cover"),
                    BackgroundVideoUrl = GetStringOrDefault(importData, "backgroundVideoUrl", null),
                    BackgroundVideoFit = GetStringOrDefault(importData, "backgroundVideoFit", "cover"),
                    BackgroundOpacity = GetDoubleOrDefault(importData, "backgroundOpacity", 1.0),
                    RiveFile = GetStringOrDefault(importData, "riveFile", null),
                };

                // Parse loop compensation fields
                if (importData.TryGetProperty("backgroundLoopCompensation", out var loopComp) && loopComp.ValueKind != JsonValueKind.Null)
                    layout.BackgroundLoopCompensation = loopComp.GetBoolean();
                if (importData.TryGetProperty("backgroundLoopCutoverMs", out var cutover) && cutover.ValueKind == JsonValueKind.Number)
                    layout.BackgroundLoopCutoverMs = cutover.GetInt32();
                if (importData.TryGetProperty("backgroundLoopCrossfadeMs", out var crossfade) && crossfade.ValueKind == JsonValueKind.Number)
                    layout.BackgroundLoopCrossfadeMs = crossfade.GetInt32();

                // Parse video flags
                if (importData.TryGetProperty("videoLoop", out var vl) && vl.ValueKind != JsonValueKind.Null)
                    layout.VideoLoop = vl.GetBoolean();
                if (importData.TryGetProperty("videoMuted", out var vm) && vm.ValueKind != JsonValueKind.Null)
                    layout.VideoMuted = vm.GetBoolean();
                if (importData.TryGetProperty("videoAutoplay", out var va) && va.ValueKind != JsonValueKind.Null)
                    layout.VideoAutoplay = va.GetBoolean();

                // Parse JSON config fields — prefer *Raw versions
                layout.JsonFrameConfig = GetRawOrSerialized(importData, "jsonFrameConfigRaw", "jsonFrameConfig", "{}");
                layout.JsonFrameConfigRuntime = GetRawOrSerialized(importData, "jsonFrameConfigRuntimeRaw", "jsonFrameConfigRuntime", "{}");
                layout.JsonFrameElements = GetRawOrSerialized(importData, "jsonFrameElementsRaw", "jsonFrameElements", "[]");

                Console.WriteLine($"[SERVICE_LAYOUT_LOADER] ✅ Loaded layout from ZIP: {layout.DisplayName}");
                return layout;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_LAYOUT_LOADER] ❌ Error loading layout from ZIP {zipPath}: {ex.Message}");
                return null;
            }
        }

        private static string? GetStringOrDefault(JsonElement element, string property, string? defaultValue)
        {
            if (element.TryGetProperty(property, out var prop) && prop.ValueKind == JsonValueKind.String)
                return prop.GetString();
            return defaultValue;
        }

        private static int GetIntOrDefault(JsonElement element, string property, int defaultValue)
        {
            if (element.TryGetProperty(property, out var prop) && prop.ValueKind == JsonValueKind.Number)
                return prop.GetInt32();
            return defaultValue;
        }

        private static double GetDoubleOrDefault(JsonElement element, string property, double defaultValue)
        {
            if (element.TryGetProperty(property, out var prop) && prop.ValueKind == JsonValueKind.Number)
                return prop.GetDouble();
            return defaultValue;
        }

        private static string GetRawOrSerialized(JsonElement element, string rawKey, string fallbackKey, string defaultValue)
        {
            if (element.TryGetProperty(rawKey, out var raw) && raw.ValueKind == JsonValueKind.String)
                return raw.GetString() ?? defaultValue;
            if (element.TryGetProperty(fallbackKey, out var fallback))
                return JsonSerializer.Serialize(fallback);
            return defaultValue;
        }
    }
}
