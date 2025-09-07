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

namespace JunctionRelayServer.Services
{
    public class Service_FrameEngine
    {
        private readonly IWebHostEnvironment _webHostEnvironment;
        private readonly DataDirectoryProvider _dataDirectoryProvider;

        public Service_FrameEngine(IWebHostEnvironment webHostEnvironment, DataDirectoryProvider dataDirectoryProvider)
        {
            _webHostEnvironment = webHostEnvironment;
            _dataDirectoryProvider = dataDirectoryProvider;
        }

        public async Task<byte[]> ProcessThumbnailFromFrontend(string base64ImageData)
        {
            try
            {
                // Remove data URL prefix if present (data:image/png;base64,...)
                var base64Data = base64ImageData;
                if (base64Data.Contains(","))
                {
                    base64Data = base64Data.Split(',')[1];
                }

                // Convert base64 to bytes
                var imageBytes = Convert.FromBase64String(base64Data);

                // Validate image data
                if (imageBytes.Length == 0)
                {
                    throw new ArgumentException("Invalid image data received");
                }

                return imageBytes;
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to process thumbnail data: {ex.Message}", ex);
            }
        }       

        public static string GenerateFrameUrl(string baseUrl, Model_JunctionScreenLayout screenConfig)
        {
            if (!screenConfig.EnableUrlAccess || string.IsNullOrEmpty(screenConfig.UrlPath))
                return string.Empty;

            return $"{baseUrl.TrimEnd('/')}/frames/{screenConfig.UrlPath}";
        }

        public void CleanupOldFrames(TimeSpan maxAge)
        {
            try
            {
                var framesDirectory = Path.Combine(_dataDirectoryProvider.DataDirectory, "frameengine", "frames");
                if (!Directory.Exists(framesDirectory))
                    return;

                var cutoffTime = DateTime.Now - maxAge;
                var files = Directory.GetFiles(framesDirectory, "*.png");
                var deletedCount = 0;

                foreach (var file in files)
                {
                    var fileInfo = new FileInfo(file);
                    if (fileInfo.LastWriteTime < cutoffTime)
                    {
                        File.Delete(file);
                        deletedCount++;
                    }
                }

                if (deletedCount > 0)
                {
                    Console.WriteLine($"Cleaned up {deletedCount} old frame files");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error cleaning up old frames: {ex.Message}");
            }
        }
    }
}