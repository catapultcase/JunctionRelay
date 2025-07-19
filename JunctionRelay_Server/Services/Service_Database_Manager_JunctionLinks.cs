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
using System.Data;
using Dapper;
using JunctionRelayServer.Models.Requests;

public class Service_Database_Manager_JunctionLinks
{
    private readonly IDbConnection _db;

    public Service_Database_Manager_JunctionLinks(IDbConnection db)
    {
        _db = db;
    }

    // Get all Device links for a specific junction, including device name/description
    public async Task<List<Model_JunctionDeviceLink>> GetDeviceLinksByJunctionAsync(int junctionId)
    {
        var sql = @"
            SELECT jdl.*, d.Name AS DeviceName, d.Type AS DeviceDescription
            FROM JunctionDeviceLinks jdl
            JOIN Devices d ON jdl.DeviceId = d.Id
            WHERE jdl.JunctionId = @JunctionId";

        return (await _db.QueryAsync<Model_JunctionDeviceLink>(sql, new { JunctionId = junctionId })).ToList();
    }

    // Get all Collector links for a specific junction, including collector name/description
    public async Task<List<Model_JunctionCollectorLink>> GetCollectorLinksByJunctionAsync(int junctionId)
    {
        var sql = @"
            SELECT jcl.*, c.Name AS CollectorName, c.Description AS CollectorDescription
            FROM JunctionCollectorLinks jcl
            JOIN Collectors c ON jcl.CollectorId = c.Id
            WHERE jcl.JunctionId = @JunctionId";

        return (await _db.QueryAsync<Model_JunctionCollectorLink>(sql, new { JunctionId = junctionId })).ToList();
    }

    // Add a new Device Link
    public async Task<Model_JunctionDeviceLink> AddDeviceLinkAsync(Model_JunctionDeviceLink link)
    {
        var sql = @"
            INSERT INTO JunctionDeviceLinks (
                JunctionId, DeviceId, Role, IsSelected, IsTested, WarnOnDuplicate,
                PollRateOverride, LastPolled, SendRateOverride, LastSent,
                DeclareFailedAfter, RetryAttempts
            ) VALUES (
                @JunctionId, @DeviceId, @Role, @IsSelected, @IsTested, @WarnOnDuplicate,
                @PollRateOverride, @LastPolled, @SendRateOverride, @LastSent,
                @DeclareFailedAfter, @RetryAttempts
            );
            SELECT last_insert_rowid();";

        link.Id = await _db.ExecuteScalarAsync<int>(sql, link);
        return link;
    }

    // Add a new Collector Link
    public async Task<Model_JunctionCollectorLink> AddCollectorLinkAsync(Model_JunctionCollectorLink link)
    {
        var sql = @"
            INSERT INTO JunctionCollectorLinks (
                JunctionId, CollectorId, Role, IsSelected, IsTested, WarnOnDuplicate,
                PollRateOverride, LastPolled, SendRateOverride, LastSent,
                DeclareFailedAfter, RetryAttempts
            ) VALUES (
                @JunctionId, @CollectorId, @Role, @IsSelected, @IsTested, @WarnOnDuplicate,
                @PollRateOverride, @LastPolled, @SendRateOverride, @LastSent,
                @DeclareFailedAfter, @RetryAttempts
            );
            SELECT last_insert_rowid();";

        link.Id = await _db.ExecuteScalarAsync<int>(sql, link);
        return link;
    }

    // Get a Device Link by ID
    public async Task<Model_JunctionDeviceLink?> GetDeviceLinkByIdAsync(int linkId)
    {
        const string sql = "SELECT * FROM JunctionDeviceLinks WHERE Id = @LinkId";
        return await _db.QuerySingleOrDefaultAsync<Model_JunctionDeviceLink>(sql, new { LinkId = linkId });
    }

    // Get a Collector Link by ID
    public async Task<Model_JunctionCollectorLink?> GetCollectorLinkByIdAsync(int linkId)
    {
        const string sql = "SELECT * FROM JunctionCollectorLinks WHERE Id = @LinkId";
        return await _db.QuerySingleOrDefaultAsync<Model_JunctionCollectorLink>(sql, new { LinkId = linkId });
    }

    // Remove a Device Link
    public async Task<bool> RemoveDeviceLinkAsync(int junctionId, int deviceId)
    {
        var sql = "DELETE FROM JunctionDeviceLinks WHERE JunctionId = @JunctionId AND DeviceId = @DeviceId";
        var rowsAffected = await _db.ExecuteAsync(sql, new { JunctionId = junctionId, DeviceId = deviceId });
        return rowsAffected > 0;
    }

    // Remove a Collector Link
    public async Task<bool> RemoveCollectorLinkAsync(int junctionId, int collectorId)
    {
        var sql = "DELETE FROM JunctionCollectorLinks WHERE JunctionId = @JunctionId AND CollectorId = @CollectorId";
        var rowsAffected = await _db.ExecuteAsync(sql, new { JunctionId = junctionId, CollectorId = collectorId });
        return rowsAffected > 0;
    }

    // Generic method to update fields of a JunctionDeviceLink or JunctionCollectorLink
    public async Task<bool> UpdateJunctionLinkFieldsAsync(int linkId, Model_JunctionLinkUpdateRequest updateRequest, bool isDeviceLink)
    {
        var tableName = isDeviceLink ? "JunctionDeviceLinks" : "JunctionCollectorLinks";
        var sql = $"UPDATE {tableName} SET ";

        var updateFields = new List<string>();
        var parameters = new DynamicParameters();

        // Check for FieldsToInclude
        if (updateRequest.FieldsToInclude != null && updateRequest.FieldsToInclude.Any())
        {
            updateFields.Add("FieldsToInclude = @FieldsToInclude");
            parameters.Add("FieldsToInclude", string.Join(",", updateRequest.FieldsToInclude)); // Convert list to comma-separated string
        }

        // Other existing fields for updating
        if (updateRequest.PollRateOverride.HasValue)
        {
            updateFields.Add("PollRateOverride = @PollRateOverride");
            parameters.Add("PollRateOverride", updateRequest.PollRateOverride.Value);
        }
        if (updateRequest.IsSelected.HasValue)
        {
            updateFields.Add("IsSelected = @IsSelected");
            parameters.Add("IsSelected", updateRequest.IsSelected.Value);
        }
        if (updateRequest.IsTested.HasValue)
        {
            updateFields.Add("IsTested = @IsTested");
            parameters.Add("IsTested", updateRequest.IsTested.Value);
        }
        if (updateRequest.WarnOnDuplicate.HasValue)
        {
            updateFields.Add("WarnOnDuplicate = @WarnOnDuplicate");
            parameters.Add("WarnOnDuplicate", updateRequest.WarnOnDuplicate.Value);
        }
        if (updateRequest.SendRateOverride.HasValue)
        {
            updateFields.Add("SendRateOverride = @SendRateOverride");
            parameters.Add("SendRateOverride", updateRequest.SendRateOverride.Value);
        }
        if (updateRequest.LastSent.HasValue)
        {
            updateFields.Add("LastSent = @LastSent");
            parameters.Add("LastSent", updateRequest.LastSent.Value);
        }
        if (updateRequest.RetryAttempts.HasValue)
        {
            updateFields.Add("RetryAttempts = @RetryAttempts");
            parameters.Add("RetryAttempts", updateRequest.RetryAttempts.Value);
        }
        if (updateRequest.DeclareFailedAfter.HasValue)
        {
            updateFields.Add("DeclareFailedAfter = @DeclareFailedAfter");
            parameters.Add("DeclareFailedAfter", updateRequest.DeclareFailedAfter.Value);
        }

        if (!updateFields.Any()) return false;

        sql += string.Join(", ", updateFields) + " WHERE Id = @LinkId";
        parameters.Add("LinkId", linkId);

        // Execute the SQL Update
        var rowsAffected = await _db.ExecuteAsync(sql, parameters);
        return rowsAffected > 0;
    }

    // Get all screen layout overrides for a junction device link
    public async Task<List<Model_JunctionScreenLayout>> GetJunctionScreenLayoutsByLinkIdAsync(int linkId)
    {
        var sql = @"
        SELECT jsl.*, sl.DisplayName AS TemplateName
        FROM JunctionScreenLayouts jsl
        LEFT JOIN ScreenLayouts sl ON jsl.ScreenLayoutId = sl.Id
        WHERE jsl.JunctionDeviceLinkId = @LinkId";

        return (await _db.QueryAsync<Model_JunctionScreenLayout>(sql, new { LinkId = linkId })).ToList();
    }

    // Get a Junction‐screen layout by ID
    public async Task<Model_JunctionScreenLayout?> GetJunctionScreenLayoutByIdAsync(int screenLayoutId)
    {
        const string sql = @"
        SELECT jsl.*, sl.DisplayName AS TemplateName
        FROM JunctionScreenLayouts jsl
        LEFT JOIN ScreenLayouts sl ON jsl.ScreenLayoutId = sl.Id
        WHERE jsl.Id = @ScreenLayoutId";

        return await _db.QuerySingleOrDefaultAsync<Model_JunctionScreenLayout>(
            sql,
            new { ScreenLayoutId = screenLayoutId }
        );
    }


    // Add a new screen layout override
    public async Task<Model_JunctionScreenLayout> AddJunctionScreenLayoutAsync(Model_JunctionScreenLayout screenLayout)
    {
        var sql = @"
        INSERT INTO JunctionScreenLayouts (
            JunctionDeviceLinkId, DeviceScreenId, ScreenLayoutId
        ) VALUES (
            @JunctionDeviceLinkId, @DeviceScreenId, @ScreenLayoutId
        );
        SELECT last_insert_rowid();";

        screenLayout.Id = await _db.ExecuteScalarAsync<int>(sql, screenLayout);
        return screenLayout;
    }

    // Update an existing screen layout override
    public async Task<bool> UpdateJunctionScreenLayoutAsync(Model_JunctionScreenLayout screenLayout)
    {
        var sql = @"
        UPDATE JunctionScreenLayouts
        SET ScreenKey = @ScreenKey,
            ScreenLayoutId = @ScreenLayoutId
        WHERE Id = @Id";

        var rowsAffected = await _db.ExecuteAsync(sql, screenLayout);
        return rowsAffected > 0;
    }

    // Remove a screen layout override
    public async Task<bool> RemoveJunctionScreenLayoutAsync(int screenLayoutId)
    {
        var sql = "DELETE FROM JunctionScreenLayouts WHERE Id = @ScreenLayoutId";
        var rowsAffected = await _db.ExecuteAsync(sql, new { ScreenLayoutId = screenLayoutId });
        return rowsAffected > 0;
    }

    // Remove all screen layouts for a specific device link
    public async Task<bool> RemoveScreenLayoutsByLinkIdAsync(int linkId)
    {
        const string sql = @"
        DELETE FROM JunctionScreenLayouts 
        WHERE JunctionDeviceLinkId = @LinkId";

        var affectedRows = await _db.ExecuteAsync(sql, new { LinkId = linkId });
        Console.WriteLine($"[SERVICE_DATABASE_MANAGER_JUNCTION_LINKS] Removed {affectedRows} screen layouts for device link {linkId}");
        return true; // Return true regardless of whether rows were affected
    }

}
