using System.Security.Cryptography;
using System.Text;

namespace JunctionRelayServer.Services;

/// <summary>
/// Service for computing file hashes and detecting duplicate files.
/// Single Responsibility: File hashing operations only.
/// </summary>
public interface IFrameEngineHashUtility
{
    /// <summary>
    /// Computes SHA256 hash for a given file.
    /// </summary>
    /// <param name="filePath">Absolute path to the file</param>
    /// <returns>Hex-encoded SHA256 hash string</returns>
    string ComputeSHA256Hash(string filePath);

    /// <summary>
    /// Scans a directory and groups files by their content hash.
    /// </summary>
    /// <param name="directory">Directory to scan</param>
    /// <param name="searchPattern">File search pattern (e.g., "*.*")</param>
    /// <returns>Dictionary where key is hash and value is list of files with that hash</returns>
    Task<Dictionary<string, List<FileInfo>>> FindDuplicatesByHashAsync(string directory, string searchPattern);
}

public class Service_FrameEngine_HashUtility : IFrameEngineHashUtility
{
    private readonly ILogger<Service_FrameEngine_HashUtility> _logger;

    public Service_FrameEngine_HashUtility(ILogger<Service_FrameEngine_HashUtility> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Computes SHA256 hash for a file.
    /// SHA256 chosen for cryptographic security and collision resistance.
    /// </summary>
    public string ComputeSHA256Hash(string filePath)
    {
        try
        {
            using var fileStream = File.OpenRead(filePath);
            using var sha256 = SHA256.Create();
            var hashBytes = sha256.ComputeHash(fileStream);

            // Convert to hex string
            var sb = new StringBuilder();
            foreach (var b in hashBytes)
            {
                sb.Append(b.ToString("x2"));
            }

            return sb.ToString();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to compute hash for file: {FilePath}", filePath);
            throw;
        }
    }

    /// <summary>
    /// Scans directory and groups files by content hash (detects duplicates).
    /// Returns only groups with 2+ files (actual duplicates).
    /// </summary>
    public async Task<Dictionary<string, List<FileInfo>>> FindDuplicatesByHashAsync(
        string directory,
        string searchPattern)
    {
        if (!Directory.Exists(directory))
        {
            _logger.LogWarning("Directory does not exist: {Directory}", directory);
            return new Dictionary<string, List<FileInfo>>();
        }

        var hashGroups = new Dictionary<string, List<FileInfo>>();

        try
        {
            var files = Directory.GetFiles(directory, searchPattern, SearchOption.TopDirectoryOnly);

            _logger.LogInformation(
                "Scanning {FileCount} files in {Directory} for duplicates",
                files.Length,
                directory
            );

            // Process files asynchronously
            await Task.Run(() =>
            {
                foreach (var filePath in files)
                {
                    try
                    {
                        var fileInfo = new FileInfo(filePath);
                        var hash = ComputeSHA256Hash(filePath);

                        if (!hashGroups.ContainsKey(hash))
                        {
                            hashGroups[hash] = new List<FileInfo>();
                        }

                        hashGroups[hash].Add(fileInfo);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to process file: {FilePath}", filePath);
                        // Continue processing other files
                    }
                }
            });

            // Filter to only return groups with duplicates (2+ files)
            var duplicateGroups = hashGroups
                .Where(kvp => kvp.Value.Count > 1)
                .ToDictionary(kvp => kvp.Key, kvp => kvp.Value);

            _logger.LogInformation(
                "Found {DuplicateGroupCount} duplicate groups with {TotalDuplicateFiles} total duplicate files",
                duplicateGroups.Count,
                duplicateGroups.Sum(g => g.Value.Count - 1) // Count only the extras, not the canonical
            );

            return duplicateGroups;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error scanning directory for duplicates: {Directory}", directory);
            throw;
        }
    }
}
