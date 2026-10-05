/**
 * TypeScript interfaces for duplicate asset detection and de-duplication.
 * Mirrors backend DTOs from Model_DuplicateAssets.cs
 */

export interface DuplicateAssetsReport {
    duplicateGroups: DuplicateGroup[];
    totalSpaceSavingsBytes: number;
    totalDuplicateFiles: number;
}

export interface DuplicateGroup {
    /** SHA256 hash of the file content */
    fileHash: string;

    /** Type of asset: "image", "video", or "rive" */
    assetType: 'image' | 'video' | 'rive';

    /** Canonical file to keep (oldest file by creation time) */
    canonicalFile: string;

    /** List of duplicate files (excluding the canonical) */
    duplicates: DuplicateFile[];

    /** Total space that can be saved by removing duplicates */
    spaceSavingsBytes: number;
}

export interface DuplicateFile {
    /** Filename (not including directory path) */
    filename: string;

    /** File size in bytes */
    sizeBytes: number;

    /** File creation date */
    createdDate: string;

    /** Number of FrameLayouts referencing this file */
    usageCount: number;
}

export interface DeduplicationRequest {
    /** Duplicate groups to process */
    duplicateGroups: DuplicateGroup[];
}

export interface DeduplicationResult {
    /** Number of duplicate files deleted */
    filesDeleted: number;

    /** Total disk space freed in bytes */
    spaceFreedBytes: number;

    /** Number of FrameLayouts updated with new references */
    layoutsUpdated: number;

    /** List of errors encountered (if any) */
    errors: string[];
}
