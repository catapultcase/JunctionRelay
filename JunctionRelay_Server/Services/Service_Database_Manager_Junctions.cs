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

using Dapper;
using JunctionRelayServer.Models;
using JunctionRelayServer.Models.Requests;
using Microsoft.Data.Sqlite;
using Newtonsoft.Json;
using System.Data;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_Junctions
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Junctions(IDbConnection db)
        {
            _db = db;
        }

        public async Task<List<Model_Junction>> GetAllJunctionsAsync()
        {
            var junctions = (await _db.QueryAsync<Model_Junction>("SELECT * FROM Junctions")).ToList();

            foreach (var junction in junctions)
            {
                await PopulateLinksAndSensors(junction);
            }

            return junctions;
        }

        public async Task<Model_Junction?> GetJunctionByIdAsync(int id)
        {
            var junction = await _db.QuerySingleOrDefaultAsync<Model_Junction>(
                "SELECT * FROM Junctions WHERE Id = @Id", new { Id = id });

            if (junction != null)
                await PopulateLinksAndSensors(junction);

            return junction;
        }

        public async Task<Model_Junction> AddJunctionAsync(Model_Junction newJunction)
        {
            // 1) figure out the next sort order
            const string nextOrderSql = @"
        SELECT COALESCE(MAX(SortOrder), 0) + 1
          FROM Junctions;
    ";
            var nextSortOrder = await _db.ExecuteScalarAsync<int>(nextOrderSql);
            newJunction.SortOrder = nextSortOrder;

            // 2) insert with that SortOrder baked in
            var insertSql = @"
        INSERT INTO Junctions (
            Name,
            Description,
            Type,
            Status,
            SortOrder,
            ShowOnDashboard,
            AutoStartOnLaunch,
            CronExpression,
            AllTargetsAllData,
            AllTargetsAllScreens,
            GatewayDestination,
            MQTTBrokerId,
            SelectedPayloadAttributes,
            StreamAutoTimeout,
            StreamAutoTimeoutMs,
            RetryCount,
            RetryIntervalMs,
            EnableTests,
            EnableHealthCheck,
            HealthCheckIntervalMs,
            EnableNotifications
        )
        VALUES (
            @Name,
            @Description,
            @Type,
            @Status,
            @SortOrder,
            @ShowOnDashboard,
            @AutoStartOnLaunch,
            @CronExpression,
            @AllTargetsAllData,
            @AllTargetsAllScreens,
            @GatewayDestination,
            @MQTTBrokerId,
            @SelectedPayloadAttributes,
            @StreamAutoTimeout,
            @StreamAutoTimeoutMs,
            @RetryCount,
            @RetryIntervalMs,
            @EnableTests,
            @EnableHealthCheck,
            @HealthCheckIntervalMs,
            @EnableNotifications
        );
        SELECT last_insert_rowid();";

            // 3) perform insert
            int newId = await _db.ExecuteScalarAsync<int>(insertSql, newJunction);
            newJunction.Id = newId;
            return newJunction;
        }


        public async Task<bool> UpdateJunctionAsync(int id, Model_Junction updated)
        {
            var sql = @"
UPDATE Junctions SET
    Name                     = @Name,
    Description              = @Description,
    Type                     = @Type,
    SortOrder                = @SortOrder,
    ShowOnDashboard          = @ShowOnDashboard,
    AutoStartOnLaunch        = @AutoStartOnLaunch,
    CronExpression           = @CronExpression,
    AllTargetsAllData        = @AllTargetsAllData,
    AllTargetsAllScreens     = @AllTargetsAllScreens,
    GatewayDestination       = @GatewayDestination,
    MQTTBrokerId             = @MQTTBrokerId,
    SelectedPayloadAttributes= @SelectedPayloadAttributes,
    StreamAutoTimeout        = @StreamAutoTimeout,
    StreamAutoTimeoutMs      = @StreamAutoTimeoutMs,
    RetryCount               = @RetryCount,
    RetryIntervalMs          = @RetryIntervalMs,
    EnableTests              = @EnableTests,
    EnableHealthCheck        = @EnableHealthCheck,
    HealthCheckIntervalMs    = @HealthCheckIntervalMs,
    EnableNotifications      = @EnableNotifications
WHERE Id = @Id;";

            updated.Id = id;
            var affected = await _db.ExecuteAsync(sql, updated);
            return affected > 0;
        }       

        public async Task<bool> DeleteJunctionAsync(int id)
        {
            using (var transaction = _db.BeginTransaction())
            {
                try
                {
                    // Debug: Log start of deletion process
                    Console.WriteLine($"[SERVICE_DATABASE_MANAGER_JUNCTIONS] Starting deletion for JunctionId: {id}");

                    // Delete JunctionSensorTargets
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] Deleting JunctionSensorTargets...");
                    await _db.ExecuteAsync("DELETE FROM JunctionSensorTargets WHERE JunctionId = @Id", new { Id = id }, transaction);
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] JunctionSensorTargets deleted.");

                    // Delete JunctionSensors
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] Deleting JunctionSensors...");
                    await _db.ExecuteAsync("DELETE FROM JunctionSensors WHERE JunctionId = @Id", new { Id = id }, transaction);
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] JunctionSensors deleted.");

                    // Delete JunctionDeviceLinks
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] Deleting JunctionDeviceLinks...");
                    await _db.ExecuteAsync("DELETE FROM JunctionDeviceLinks WHERE JunctionId = @Id", new { Id = id }, transaction);
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] JunctionDeviceLinks deleted.");

                    // Delete JunctionScreenLayouts
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] Deleting JunctionScreenLayouts...");
                    await _db.ExecuteAsync("DELETE FROM JunctionScreenLayouts WHERE JunctionDeviceLinkId IN (SELECT Id FROM JunctionDeviceLinks WHERE JunctionId = @Id)", new { Id = id }, transaction);
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] JunctionScreenLayouts deleted.");

                    // Delete JunctionCollectorLinks
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] Deleting JunctionCollectorLinks...");
                    await _db.ExecuteAsync("DELETE FROM JunctionCollectorLinks WHERE JunctionId = @Id", new { Id = id }, transaction);
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] JunctionCollectorLinks deleted.");

                    // Delete the Junction itself
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] Deleting Junction...");
                    var affected = await _db.ExecuteAsync("DELETE FROM Junctions WHERE Id = @Id", new { Id = id }, transaction);
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] Junction deleted.");

                    // Commit the transaction
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] Committing transaction...");
                    transaction.Commit();
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] Transaction committed.");

                    return affected > 0;
                }
                catch (Exception ex)
                {
                    // Log detailed error
                    Console.WriteLine($"[SERVICE_DATABASE_MANAGER_JUNCTIONS] Error occurred during deletion: {ex.Message}");
                    Console.WriteLine($"[SERVICE_DATABASE_MANAGER_JUNCTIONS] Stack Trace: {ex.StackTrace}");

                    // Rollback in case of error
                    transaction.Rollback();
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] Transaction rolled back.");

                    throw;
                }
            }
        }

        public async Task PopulateLinksAndSensors(Model_Junction junction)
        {
            // Console.WriteLine($"[SERVICE_DATABASE_MANAGER_JUNCTIONS] PopulateLinksAndSensors Called for Junction ID: {junction.Id}");
            
            // Load device and collector links
            var deviceLinks = await _db.QueryAsync<Model_JunctionDeviceLink>(
                "SELECT * FROM JunctionDeviceLinks WHERE JunctionId = @JunctionId",
                new { JunctionId = junction.Id });

            var collectorLinks = await _db.QueryAsync<Model_JunctionCollectorLink>(
                "SELECT * FROM JunctionCollectorLinks WHERE JunctionId = @JunctionId",
                new { JunctionId = junction.Id });

            var sensors = await _db.QueryAsync<Model_Sensor>(
                "SELECT * FROM JunctionSensors WHERE JunctionId = @JunctionId",
                new { JunctionId = junction.Id });

            var sensorTargets = await _db.QueryAsync<Model_JunctionSensorTarget>(
                "SELECT * FROM JunctionSensorTargets WHERE JunctionId = @JunctionId",
                new { JunctionId = junction.Id });

            junction.DeviceLinks = deviceLinks.ToList();
            junction.CollectorLinks = collectorLinks.ToList();
            junction.ClonedSensors = sensors.ToList();
            junction.JunctionSensorTargets = sensorTargets.ToList();

            //// Log the JunctionSensorTargets
            //Console.WriteLine($"[SERVICE_DATABASE_MANAGER_JUNCTIONS] JunctionSensorTargets: ");
            //foreach (var target in junction.JunctionSensorTargets)
            //{
            //    Console.WriteLine($"  - SensorId: {target.SensorId}, ScreenId: {target.ScreenId}, PositionIndex: {target.PositionIndex}");
            //}

            // Load screen layouts for each device link
            foreach (var link in junction.DeviceLinks)
            {
                var layouts = await _db.QueryAsync<Model_JunctionScreenLayout>(
                    "SELECT * FROM JunctionScreenLayouts WHERE JunctionDeviceLinkId = @LinkId",
                    new { LinkId = link.Id });

                link.ScreenLayouts = layouts.ToList();
            }

            // Load device screen metadata (template details)
            var deviceIds = junction.DeviceLinks.Select(dl => dl.DeviceId).Distinct().ToList();
            if (deviceIds.Any())
            {
                var sql = @"
                SELECT 
                    ds.*,
                    t.Id AS TemplateId, t.LayoutType, t.Rows, t.Columns, t.JsonLayoutConfig
                FROM DeviceScreens ds
                LEFT JOIN ScreenLayouts t ON ds.ScreenLayoutId = t.Id
                WHERE ds.DeviceId IN @DeviceIds";

                var screenDict = new Dictionary<int, Model_Device_Screens>();
                var screens = await _db.QueryAsync<Model_Device_Screens, Model_Screen_Layout, Model_Device_Screens>(
                    sql,
                    (screen, template) =>
                    {
                        screen.Template = template;
                        screenDict[screen.Id] = screen;
                        return screen;
                    },
                    new { DeviceIds = deviceIds },
                    splitOn: "TemplateId"
                );

                junction.DeviceScreens = screenDict.Values.ToList();
            }
            else
            {
                junction.DeviceScreens = new List<Model_Device_Screens>();
            }
        }
        public async Task<Model_Junction?> CloneJunctionAsync(int sourceJunctionId)
        {
            var source = await GetJunctionByIdAsync(sourceJunctionId);
            if (source == null) return null;

            // First, clone the base junction and get its ID
            source.Name += " (Clone)";
            source.Id = 0;  // Reset the ID since it's a new entry

            const string insertSql = @"
    INSERT INTO Junctions (
        Name, Description, Type, Status, SortOrder, ShowOnDashboard, AutoStartOnLaunch,
        CronExpression, AllTargetsAllData, AllTargetsAllScreens, , GatewayDestination, MQTTBrokerId,
        SelectedPayloadAttributes, StreamAutoTimeout, StreamAutoTimeoutMs,
        RetryCount, RetryIntervalMs, EnableTests, EnableHealthCheck,
        HealthCheckIntervalMs, EnableNotifications
    ) VALUES (
        @Name, @Description, @Type, @Status, @SortOrder, @ShowOnDashboard, @AutoStartOnLaunch,
        @CronExpression, @AllTargetsAllData, @AllTargetsAllScreens, @GatewayDestination, @MQTTBrokerId,
        @SelectedPayloadAttributes, @StreamAutoTimeout, @StreamAutoTimeoutMs,
        @RetryCount, @RetryIntervalMs, @EnableTests, @EnableHealthCheck,
        @HealthCheckIntervalMs, @EnableNotifications
    );
    SELECT last_insert_rowid();";

            int newJunctionId = await _db.ExecuteScalarAsync<int>(insertSql, source);

            // Now fetch the correct SortOrder value for the new junction
            int nextSortOrder = await _db.ExecuteScalarAsync<int>("SELECT COALESCE(MAX(SortOrder), 0) + 1 FROM Junctions;");
            await _db.ExecuteAsync("UPDATE Junctions SET SortOrder = @SortOrder WHERE Id = @Id", new { SortOrder = nextSortOrder, Id = newJunctionId });

            // Clone device links and build ID map
            var deviceLinkIdMap = new Dictionary<int, int>();
            foreach (var link in source.DeviceLinks)
            {
                int newLinkId = await _db.ExecuteScalarAsync<int>(@"
        INSERT INTO JunctionDeviceLinks (
            JunctionId, DeviceId, Role, IsSelected, IsTested, WarnOnDuplicate,
            PollRateOverride, LastPolled, SendRateOverride, LastSent,
            DeclareFailedAfter, RetryAttempts, FieldsToInclude
        )
        VALUES (
            @JunctionId, @DeviceId, @Role, @IsSelected, @IsTested, @WarnOnDuplicate,
            @PollRateOverride, @LastPolled, @SendRateOverride, @LastSent,
            @DeclareFailedAfter, @RetryAttempts, @FieldsToInclude
        );
        SELECT last_insert_rowid();", new
                {
                    JunctionId = newJunctionId,
                    link.DeviceId,
                    link.Role,
                    link.IsSelected,
                    link.IsTested,
                    link.WarnOnDuplicate,
                    link.PollRateOverride,
                    link.LastPolled,
                    link.SendRateOverride,
                    link.LastSent,
                    link.DeclareFailedAfter,
                    link.RetryAttempts,
                    link.FieldsToInclude
                });

                deviceLinkIdMap[link.Id] = newLinkId;

                foreach (var layout in link.ScreenLayouts)
                {
                    await _db.ExecuteAsync(@"
            INSERT INTO JunctionScreenLayouts (JunctionDeviceLinkId, DeviceScreenId, ScreenLayoutId)
            VALUES (@NewLinkId, @DeviceScreenId, @ScreenLayoutId);", new
                    {
                        NewLinkId = newLinkId,
                        layout.DeviceScreenId,
                        layout.ScreenLayoutId
                    });
                }
            }

            // Clone collector links and build ID map
            var collectorLinkIdMap = new Dictionary<int, int>();
            foreach (var link in source.CollectorLinks)
            {
                int newCollectorLinkId = await _db.ExecuteScalarAsync<int>(@"
        INSERT INTO JunctionCollectorLinks (
            JunctionId, CollectorId, Role, IsSelected, IsTested, WarnOnDuplicate,
            PollRateOverride, LastPolled, SendRateOverride, LastSent,
            DeclareFailedAfter, RetryAttempts, FieldsToInclude
        )
        VALUES (
            @JunctionId, @CollectorId, @Role, @IsSelected, @IsTested, @WarnOnDuplicate,
            @PollRateOverride, @LastPolled, @SendRateOverride, @LastSent,
            @DeclareFailedAfter, @RetryAttempts, @FieldsToInclude
        );
        SELECT last_insert_rowid();", new
                {
                    JunctionId = newJunctionId,
                    link.CollectorId,
                    link.Role,
                    link.IsSelected,
                    link.IsTested,
                    link.WarnOnDuplicate,
                    link.PollRateOverride,
                    link.LastPolled,
                    link.SendRateOverride,
                    link.LastSent,
                    link.DeclareFailedAfter,
                    link.RetryAttempts,
                    link.FieldsToInclude
                });

                collectorLinkIdMap[link.Id] = newCollectorLinkId;
            }

            // Clone sensors
            var sensorIdMap = new Dictionary<int, int>();
            foreach (var sensor in source.ClonedSensors)
            {
                var cloned = sensor.Clone();
                cloned.Id = 0;
                cloned.OriginalId = sensor.OriginalId;
                cloned.JunctionId = newJunctionId;

                int? newDeviceLinkId = null;
                if (cloned.JunctionDeviceLinkId.HasValue)
                    newDeviceLinkId = deviceLinkIdMap.GetValueOrDefault(cloned.JunctionDeviceLinkId.Value);

                int? newCollectorLinkId = null;
                if (cloned.JunctionCollectorLinkId.HasValue)
                    newCollectorLinkId = collectorLinkIdMap.GetValueOrDefault(cloned.JunctionCollectorLinkId.Value);

                int newSensorId = await _db.ExecuteScalarAsync<int>(@"
        INSERT INTO JunctionSensors (
            JunctionId, JunctionDeviceLinkId, JunctionCollectorLinkId, SensorOrder, MQTTServiceId,
            MQTTTopic, MQTTQoS, SensorType, ExternalId, DeviceName, Name, ComponentName,
            Category, Unit, Value, SensorTag, Formula, LastUpdated,
            CustomAttribute1, CustomAttribute2, CustomAttribute3, CustomAttribute4,
            CustomAttribute5, CustomAttribute6, CustomAttribute7, CustomAttribute8,
            CustomAttribute9, CustomAttribute10, IsMissing, IsStale, IsSelected, IsVisible,
            DeviceId, ServiceId, CollectorId, OriginalId
        ) VALUES (
            @JunctionId, @JunctionDeviceLinkId, @JunctionCollectorLinkId, @SensorOrder, @MQTTServiceId,
            @MQTTTopic, @MQTTQoS, @SensorType, @ExternalId, @DeviceName, @Name, @ComponentName,
            @Category, @Unit, @Value, @SensorTag, @Formula, @LastUpdated,
            @CustomAttribute1, @CustomAttribute2, @CustomAttribute3, @CustomAttribute4,
            @CustomAttribute5, @CustomAttribute6, @CustomAttribute7, @CustomAttribute8,
            @CustomAttribute9, @CustomAttribute10, @IsMissing, @IsStale, @IsSelected, @IsVisible,
            @DeviceId, @ServiceId, @CollectorId, @OriginalId
        );
        SELECT last_insert_rowid();", new
                {
                    cloned.JunctionId,
                    JunctionDeviceLinkId = newDeviceLinkId,
                    JunctionCollectorLinkId = newCollectorLinkId,
                    cloned.SensorOrder,
                    cloned.MQTTServiceId,
                    cloned.MQTTTopic,
                    cloned.MQTTQoS,
                    cloned.SensorType,
                    cloned.ExternalId,
                    cloned.DeviceName,
                    cloned.Name,
                    cloned.ComponentName,
                    cloned.Category,
                    cloned.Unit,
                    cloned.Value,
                    cloned.SensorTag,
                    cloned.Formula,
                    cloned.LastUpdated,
                    cloned.CustomAttribute1,
                    cloned.CustomAttribute2,
                    cloned.CustomAttribute3,
                    cloned.CustomAttribute4,
                    cloned.CustomAttribute5,
                    cloned.CustomAttribute6,
                    cloned.CustomAttribute7,
                    cloned.CustomAttribute8,
                    cloned.CustomAttribute9,
                    cloned.CustomAttribute10,
                    cloned.IsMissing,
                    cloned.IsStale,
                    cloned.IsSelected,
                    cloned.IsVisible,
                    cloned.DeviceId,
                    cloned.ServiceId,
                    cloned.CollectorId,
                    cloned.OriginalId
                });

                sensorIdMap[sensor.Id] = newSensorId;
            }

            // Clone sensor targets
            foreach (var target in source.JunctionSensorTargets)
            {
                if (!sensorIdMap.TryGetValue(target.SensorId, out var newSensorId)) continue;

                await _db.ExecuteAsync(@"
        INSERT INTO JunctionSensorTargets (JunctionId, SensorId, DeviceId, ScreenId, PositionIndex)
        VALUES (@JunctionId, @SensorId, @DeviceId, @ScreenId, @PositionIndex);", new
                {
                    JunctionId = newJunctionId,
                    SensorId = newSensorId,
                    target.DeviceId,
                    target.ScreenId,
                    target.PositionIndex
                });
            }

            return await GetJunctionByIdAsync(newJunctionId);
        }

        public async Task<bool> ExportJunctionToJsonAsync(int id, string filePath)
            {
                // Step 1: Get the junction and related data
                var junction = await GetJunctionByIdAsync(id);
                if (junction == null)
                {
                    Console.WriteLine("[SERVICE_DATABASE_MANAGER_JUNCTIONS] Junction not found!");
                    return false;
                }

                // Populate related data (DeviceLinks, CollectorLinks, Sensors, etc.)
                await PopulateLinksAndSensors(junction);

                // Step 2: Serialize the junction and related data to JSON
                var jsonData = JsonConvert.SerializeObject(junction, Formatting.Indented);

                // Step 3: Write to a JSON file
                await File.WriteAllTextAsync(filePath, jsonData);

                Console.WriteLine($"[SERVICE_DATABASE_MANAGER_JUNCTIONS] Junction exported to {filePath}");
                return true;
            }

        public async Task<Model_Junction?> ImportJunctionFromJsonAsync(Model_Junction junction)
        {
            // Fetch the next available SortOrder
            const string nextSortOrderSql = "SELECT COALESCE(MAX(SortOrder), 0) + 1 FROM Junctions";
            int nextSortOrder = await _db.ExecuteScalarAsync<int>(nextSortOrderSql);

            // Set the SortOrder for the new junction
            junction.SortOrder = nextSortOrder;

            // Append "(Imported)" to the junction's name
            junction.Name += " (Imported)";

            // Insert the junction into the database
            const string insertSql = @"
INSERT INTO Junctions (
    Name, Description, Type, Status, SortOrder, ShowOnDashboard, AutoStartOnLaunch,
    CronExpression, AllTargetsAllData, AllTargetsAllScreens, GatewayDestination, MQTTBrokerId,
    SelectedPayloadAttributes, StreamAutoTimeout, StreamAutoTimeoutMs,
    RetryCount, RetryIntervalMs, EnableTests, EnableHealthCheck,
    HealthCheckIntervalMs, EnableNotifications
) VALUES (
    @Name, @Description, @Type, @Status, @SortOrder, @ShowOnDashboard, @AutoStartOnLaunch,
    @CronExpression, @AllTargetsAllData, @AllTargetsAllScreens, @GatewayDestination, @MQTTBrokerId,
    @SelectedPayloadAttributes, @StreamAutoTimeout, @StreamAutoTimeoutMs,
    @RetryCount, @RetryIntervalMs, @EnableTests, @EnableHealthCheck,
    @HealthCheckIntervalMs, @EnableNotifications
);
SELECT last_insert_rowid();";

            int newJunctionId = await _db.ExecuteScalarAsync<int>(insertSql, junction);
            junction.Id = newJunctionId;

            // Insert related data (DeviceLinks, CollectorLinks, Sensors, etc.)
            foreach (var deviceLink in junction.DeviceLinks)
            {
                deviceLink.JunctionId = newJunctionId;
                await InsertDeviceLink(deviceLink);
            }

            foreach (var collectorLink in junction.CollectorLinks)
            {
                collectorLink.JunctionId = newJunctionId;
                await InsertCollectorLink(collectorLink);
            }

            foreach (var sensor in junction.ClonedSensors)
            {
                sensor.JunctionId = newJunctionId;
                await InsertSensor(sensor);
            }

            return junction;
        }


        private async Task InsertDeviceLink(Model_JunctionDeviceLink deviceLink)
        {
            const string deviceLinkSql = @"
    INSERT INTO JunctionDeviceLinks (
        JunctionId, DeviceId, Role, IsSelected, IsTested, WarnOnDuplicate,
        PollRateOverride, LastPolled, SendRateOverride, LastSent,
        DeclareFailedAfter, RetryAttempts, FieldsToInclude
    ) VALUES (
        @JunctionId, @DeviceId, @Role, @IsSelected, @IsTested, @WarnOnDuplicate,
        @PollRateOverride, @LastPolled, @SendRateOverride, @LastSent,
        @DeclareFailedAfter, @RetryAttempts, @FieldsToInclude
    );
    SELECT last_insert_rowid();";

            int newDeviceLinkId = await _db.ExecuteScalarAsync<int>(deviceLinkSql, deviceLink);
            deviceLink.Id = newDeviceLinkId;

            // Insert screen layouts if any
            foreach (var layout in deviceLink.ScreenLayouts)
            {
                await _db.ExecuteAsync(@"
        INSERT INTO JunctionScreenLayouts (JunctionDeviceLinkId, DeviceScreenId, ScreenLayoutId)
        VALUES (@NewDeviceLinkId, @DeviceScreenId, @ScreenLayoutId);",
                new { NewDeviceLinkId = newDeviceLinkId, layout.DeviceScreenId, layout.ScreenLayoutId });
            }
        }

        private async Task InsertCollectorLink(Model_JunctionCollectorLink collectorLink)
        {
            const string collectorLinkSql = @"
    INSERT INTO JunctionCollectorLinks (
        JunctionId, CollectorId, Role, IsSelected, IsTested, WarnOnDuplicate,
        PollRateOverride, LastPolled, SendRateOverride, LastSent,
        DeclareFailedAfter, RetryAttempts, FieldsToInclude
    ) VALUES (
        @JunctionId, @CollectorId, @Role, @IsSelected, @IsTested, @WarnOnDuplicate,
        @PollRateOverride, @LastPolled, @SendRateOverride, @LastSent,
        @DeclareFailedAfter, @RetryAttempts, @FieldsToInclude
    );
    SELECT last_insert_rowid();";

            int newCollectorLinkId = await _db.ExecuteScalarAsync<int>(collectorLinkSql, collectorLink);
            collectorLink.Id = newCollectorLinkId;
        }

        private async Task InsertSensor(Model_Sensor sensor)
        {
            const string sensorSql = @"
    INSERT INTO JunctionSensors (
        JunctionId, JunctionDeviceLinkId, JunctionCollectorLinkId, SensorOrder, MQTTServiceId,
        MQTTTopic, MQTTQoS, SensorType, ExternalId, DeviceName, Name, ComponentName,
        Category, Unit, Value, SensorTag, Formula, LastUpdated,
        CustomAttribute1, CustomAttribute2, CustomAttribute3, CustomAttribute4,
        CustomAttribute5, CustomAttribute6, CustomAttribute7, CustomAttribute8,
        CustomAttribute9, CustomAttribute10, IsMissing, IsStale, IsSelected, IsVisible,
        DeviceId, ServiceId, CollectorId, OriginalId
    ) VALUES (
        @JunctionId, @JunctionDeviceLinkId, @JunctionCollectorLinkId, @SensorOrder, @MQTTServiceId,
        @MQTTTopic, @MQTTQoS, @SensorType, @ExternalId, @DeviceName, @Name, @ComponentName,
        @Category, @Unit, @Value, @SensorTag, @Formula, @LastUpdated,
        @CustomAttribute1, @CustomAttribute2, @CustomAttribute3, @CustomAttribute4,
        @CustomAttribute5, @CustomAttribute6, @CustomAttribute7, @CustomAttribute8,
        @CustomAttribute9, @CustomAttribute10, @IsMissing, @IsStale, @IsSelected, @IsVisible,
        @DeviceId, @ServiceId, @CollectorId, @OriginalId
    );
    SELECT last_insert_rowid();";

            int newSensorId = await _db.ExecuteScalarAsync<int>(sensorSql, sensor);
            sensor.Id = newSensorId;
        }

    }
}
