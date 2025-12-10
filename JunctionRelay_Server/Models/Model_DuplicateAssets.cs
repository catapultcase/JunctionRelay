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

namespace JunctionRelayServer.Models
{
    /// <summary>
    /// Report of duplicate assets found during audit.
    /// </summary>
    public class Model_DuplicateAssetsReport_DTO
    {
        public List<Model_DuplicateGroup_DTO> DuplicateGroups { get; set; } = new();
        public long TotalSpaceSavingsBytes { get; set; } = 0;
        public int TotalDuplicateFiles { get; set; } = 0;
    }

    /// <summary>
    /// Group of duplicate files with the same content hash.
    /// </summary>
    public class Model_DuplicateGroup_DTO
    {
        /// <summary>
        /// SHA256 hash of the file content
        /// </summary>
        public string FileHash { get; set; } = "";

        /// <summary>
        /// Type of asset: "image", "video", or "rive"
        /// </summary>
        public string AssetType { get; set; } = "";

        /// <summary>
        /// Canonical file to keep (oldest file by creation time)
        /// </summary>
        public string CanonicalFile { get; set; } = "";

        /// <summary>
        /// List of duplicate files (excluding the canonical)
        /// </summary>
        public List<Model_DuplicateFile_DTO> Duplicates { get; set; } = new();

        /// <summary>
        /// Total space that can be saved by removing duplicates
        /// </summary>
        public long SpaceSavingsBytes { get; set; } = 0;
    }

    /// <summary>
    /// Information about a duplicate file.
    /// </summary>
    public class Model_DuplicateFile_DTO
    {
        /// <summary>
        /// Filename (not including directory path)
        /// </summary>
        public string Filename { get; set; } = "";

        /// <summary>
        /// File size in bytes
        /// </summary>
        public long SizeBytes { get; set; } = 0;

        /// <summary>
        /// File creation date
        /// </summary>
        public DateTime CreatedDate { get; set; }

        /// <summary>
        /// Number of FrameLayouts referencing this file
        /// </summary>
        public int UsageCount { get; set; } = 0;
    }

    /// <summary>
    /// Request to de-duplicate specific asset groups.
    /// </summary>
    public class Model_DeduplicationRequest_DTO
    {
        /// <summary>
        /// Duplicate groups to process. Each group will have its duplicates removed.
        /// </summary>
        public List<Model_DuplicateGroup_DTO> DuplicateGroups { get; set; } = new();
    }

    /// <summary>
    /// Result of de-duplication operation.
    /// </summary>
    public class Model_DeduplicationResult_DTO
    {
        /// <summary>
        /// Number of duplicate files deleted
        /// </summary>
        public int FilesDeleted { get; set; } = 0;

        /// <summary>
        /// Total disk space freed in bytes
        /// </summary>
        public long SpaceFreedBytes { get; set; } = 0;

        /// <summary>
        /// Number of FrameLayouts updated with new references
        /// </summary>
        public int LayoutsUpdated { get; set; } = 0;

        /// <summary>
        /// List of errors encountered (if any)
        /// </summary>
        public List<string> Errors { get; set; } = new();
    }
}
