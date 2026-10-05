using Dapper;
using JunctionRelayServer.Models;
using System.Data;
using System.Text.Json;

namespace JunctionRelayServer.Services;

/// <summary>
/// Service for updating asset references in the database.
/// Single Responsibility: Database reference updates only.
/// </summary>
public interface IFrameEngineAssetReferenceUpdater
{
    /// <summary>
    /// Updates all references to an asset file across the database.
    /// </summary>
    /// <param name="oldFilename">Current filename to replace</param>
    /// <param name="newFilename">New filename to use</param>
    /// <param name="assetType">Type of asset: "image", "video", or "rive"</param>
    /// <returns>Number of FrameLayouts updated</returns>
    Task<int> UpdateAssetReferencesAsync(string oldFilename, string newFilename, string assetType);
}

public class Service_FrameEngine_AssetReferenceUpdater : IFrameEngineAssetReferenceUpdater
{
    private readonly IDbConnection _db;
    private readonly ILogger<Service_FrameEngine_AssetReferenceUpdater> _logger;

    public Service_FrameEngine_AssetReferenceUpdater(
        IDbConnection db,
        ILogger<Service_FrameEngine_AssetReferenceUpdater> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<int> UpdateAssetReferencesAsync(
        string oldFilename,
        string newFilename,
        string assetType)
    {
        if (string.IsNullOrWhiteSpace(oldFilename) || string.IsNullOrWhiteSpace(newFilename))
        {
            throw new ArgumentException("Filenames cannot be null or empty");
        }

        if (oldFilename == newFilename)
        {
            _logger.LogWarning("Old and new filenames are identical, no update needed");
            return 0;
        }

        var totalUpdated = 0;

        // Let Dapper manage connection lifecycle - transaction will handle connection state
        using var transaction = _db.BeginTransaction();

        try
        {
            // Update based on asset type
            switch (assetType.ToLower())
            {
                case "image":
                    totalUpdated += await UpdateImageReferencesAsync(oldFilename, newFilename, transaction);
                    break;

                case "video":
                    totalUpdated += await UpdateVideoReferencesAsync(oldFilename, newFilename, transaction);
                    break;

                case "rive":
                    totalUpdated += await UpdateRiveReferencesAsync(oldFilename, newFilename, transaction);
                    break;

                default:
                    throw new ArgumentException($"Unknown asset type: {assetType}");
            }

            transaction.Commit();

            _logger.LogInformation(
                "Successfully updated {Count} layout(s) - replaced {OldFile} with {NewFile} (type: {Type})",
                totalUpdated,
                oldFilename,
                newFilename,
                assetType
            );

            return totalUpdated;
        }
        catch (Exception ex)
        {
            transaction.Rollback();
            _logger.LogError(
                ex,
                "Failed to update asset references: {OldFile} -> {NewFile} (type: {Type})",
                oldFilename,
                newFilename,
                assetType
            );
            throw;
        }
    }

    /// <summary>
    /// Updates image asset references in both BackgroundImageUrl and JsonFrameElements.
    /// </summary>
    private async Task<int> UpdateImageReferencesAsync(
        string oldFilename,
        string newFilename,
        IDbTransaction transaction)
    {
        var updatedCount = 0;

        // Update BackgroundImageUrl column
        var backgroundUpdated = await _db.ExecuteAsync(
            "UPDATE FrameLayouts SET BackgroundImageUrl = @NewFilename WHERE BackgroundImageUrl = @OldFilename",
            new { OldFilename = oldFilename, NewFilename = newFilename },
            transaction
        );
        updatedCount += backgroundUpdated;

        // Update media-image elements in JsonFrameElements
        var layoutsWithElements = await _db.QueryAsync<(int Id, string JsonFrameElements)>(
            "SELECT Id, JsonFrameElements FROM FrameLayouts WHERE JsonFrameElements IS NOT NULL AND JsonFrameElements LIKE @Pattern",
            new { Pattern = $"%{oldFilename}%" },
            transaction
        );

        foreach (var layout in layoutsWithElements)
        {
            if (UpdateJsonElements(layout.JsonFrameElements, oldFilename, newFilename, "media-image", out var updatedJson))
            {
                await _db.ExecuteAsync(
                    "UPDATE FrameLayouts SET JsonFrameElements = @Json WHERE Id = @Id",
                    new { Json = updatedJson, Id = layout.Id },
                    transaction
                );
                updatedCount++;
            }
        }

        return updatedCount;
    }

    /// <summary>
    /// Updates video asset references in both BackgroundVideoUrl and JsonFrameElements.
    /// </summary>
    private async Task<int> UpdateVideoReferencesAsync(
        string oldFilename,
        string newFilename,
        IDbTransaction transaction)
    {
        var updatedCount = 0;

        // Update BackgroundVideoUrl column
        var backgroundUpdated = await _db.ExecuteAsync(
            "UPDATE FrameLayouts SET BackgroundVideoUrl = @NewFilename WHERE BackgroundVideoUrl = @OldFilename",
            new { OldFilename = oldFilename, NewFilename = newFilename },
            transaction
        );
        updatedCount += backgroundUpdated;

        // Update media-video elements in JsonFrameElements
        var layoutsWithElements = await _db.QueryAsync<(int Id, string JsonFrameElements)>(
            "SELECT Id, JsonFrameElements FROM FrameLayouts WHERE JsonFrameElements IS NOT NULL AND JsonFrameElements LIKE @Pattern",
            new { Pattern = $"%{oldFilename}%" },
            transaction
        );

        foreach (var layout in layoutsWithElements)
        {
            if (UpdateJsonElements(layout.JsonFrameElements, oldFilename, newFilename, "media-video", out var updatedJson))
            {
                await _db.ExecuteAsync(
                    "UPDATE FrameLayouts SET JsonFrameElements = @Json WHERE Id = @Id",
                    new { Json = updatedJson, Id = layout.Id },
                    transaction
                );
                updatedCount++;
            }
        }

        return updatedCount;
    }

    /// <summary>
    /// Updates Rive asset references in both RiveFile and JsonFrameElements.
    /// </summary>
    private async Task<int> UpdateRiveReferencesAsync(
        string oldFilename,
        string newFilename,
        IDbTransaction transaction)
    {
        var updatedCount = 0;

        // Update RiveFile column (background Rive)
        var backgroundUpdated = await _db.ExecuteAsync(
            "UPDATE FrameLayouts SET RiveFile = @NewFilename WHERE RiveFile = @OldFilename",
            new { OldFilename = oldFilename, NewFilename = newFilename },
            transaction
        );
        updatedCount += backgroundUpdated;

        // Update media-rive elements in JsonFrameElements
        var layoutsWithElements = await _db.QueryAsync<(int Id, string JsonFrameElements)>(
            "SELECT Id, JsonFrameElements FROM FrameLayouts WHERE JsonFrameElements IS NOT NULL AND JsonFrameElements LIKE @Pattern",
            new { Pattern = $"%{oldFilename}%" },
            transaction
        );

        foreach (var layout in layoutsWithElements)
        {
            if (UpdateJsonElements(layout.JsonFrameElements, oldFilename, newFilename, "media-rive", out var updatedJson))
            {
                await _db.ExecuteAsync(
                    "UPDATE FrameLayouts SET JsonFrameElements = @Json WHERE Id = @Id",
                    new { Json = updatedJson, Id = layout.Id },
                    transaction
                );
                updatedCount++;
            }
        }

        return updatedCount;
    }

    /// <summary>
    /// Updates filename references within JsonFrameElements JSON array.
    /// Parses JSON, updates matching elements, returns updated JSON string.
    /// </summary>
    /// <param name="jsonElements">Original JsonFrameElements JSON string</param>
    /// <param name="oldFilename">Filename to replace</param>
    /// <param name="newFilename">New filename</param>
    /// <param name="elementType">Element type to check (media-image, media-video, media-rive)</param>
    /// <param name="updatedJson">Output: Updated JSON string if changes made</param>
    /// <returns>True if JSON was modified</returns>
    private bool UpdateJsonElements(
        string jsonElements,
        string oldFilename,
        string newFilename,
        string elementType,
        out string updatedJson)
    {
        updatedJson = jsonElements;

        try
        {
            using var doc = JsonDocument.Parse(jsonElements);

            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return false;
            }

            var modified = false;
            var elements = new List<object>();

            foreach (var element in doc.RootElement.EnumerateArray())
            {
                // Parse element as dictionary for modification
                var elementDict = JsonSerializer.Deserialize<Dictionary<string, object>>(element.GetRawText());

                if (elementDict != null &&
                    elementDict.TryGetValue("type", out var typeObj) &&
                    typeObj?.ToString() == elementType &&
                    elementDict.TryGetValue("properties", out var propsObj))
                {
                    // Parse properties
                    var propsJson = JsonSerializer.Serialize(propsObj);
                    var properties = JsonSerializer.Deserialize<Dictionary<string, object>>(propsJson);

                    if (properties != null &&
                        properties.TryGetValue("filename", out var filenameObj) &&
                        filenameObj?.ToString() == oldFilename)
                    {
                        // Update filename
                        properties["filename"] = newFilename;
                        elementDict["properties"] = properties;
                        modified = true;
                    }
                }

                elements.Add(elementDict);
            }

            if (modified)
            {
                // Serialize back to JSON
                updatedJson = JsonSerializer.Serialize(elements);
                return true;
            }

            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse JsonFrameElements, skipping update");
            return false;
        }
    }
}
