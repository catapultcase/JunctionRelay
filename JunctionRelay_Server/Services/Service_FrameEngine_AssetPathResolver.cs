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

using System;
using System.IO;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// Service for resolving FrameEngine asset paths during cloud backup restore.
    /// Handles renaming generic thumbnail.{ext} files to frame-specific {frameId}.{ext} paths.
    /// </summary>
    public class Service_FrameEngine_AssetPathResolver
    {
        /// <summary>
        /// Resolves thumbnail path for cloud backup restore.
        /// Renames thumbnail.{ext} to {frameId}.{ext} while preserving file extension.
        /// </summary>
        /// <param name="originalPath">Original asset path (e.g., "thumbnails/thumbnail.jpg")</param>
        /// <param name="frameId">Target frameId for renamed file</param>
        /// <returns>Resolved path (e.g., "thumbnails/42.jpg")</returns>
        public string ResolveThumbnailPath(string originalPath, int frameId)
        {
            if (!IsThumbnailPath(originalPath))
            {
                return originalPath;
            }

            // Extract file extension, defaulting to .jpg if none found
            var extension = Path.GetExtension(originalPath);
            if (string.IsNullOrEmpty(extension))
            {
                extension = ".jpg";
            }

            return $"thumbnails/{frameId}{extension}";
        }

        /// <summary>
        /// Checks if the given path is a thumbnail file path.
        /// </summary>
        /// <param name="path">Path to check</param>
        /// <returns>True if path starts with "thumbnails/"</returns>
        public bool IsThumbnailPath(string path)
        {
            return path.StartsWith("thumbnails/", StringComparison.OrdinalIgnoreCase);
        }
    }
}
