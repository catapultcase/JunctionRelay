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
using JunctionRelayServer.Models.DeviceSync;
using JunctionRelayServer.Services;
using Newtonsoft.Json;
using System.Data;
using Dapper;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Device_Sync
    {
        private readonly Service_Database_Manager_Devices _deviceDb;
        private readonly Service_Database_Manager_Device_I2CDevices _i2cDeviceDb;
        private readonly Service_Database_Manager_Sensors _sensorDb;
        private readonly Service_Manager_Devices _deviceService;
        private readonly IDbConnection _db;

        public Service_Manager_Device_Sync(
            Service_Database_Manager_Devices deviceDb,
            Service_Database_Manager_Device_I2CDevices i2cDeviceDb,
            Service_Database_Manager_Sensors sensorDb,
            Service_Manager_Devices deviceService,
            IDbConnection dbConnection)
        {
            _deviceDb = deviceDb;
            _i2cDeviceDb = i2cDeviceDb;
            _sensorDb = sensorDb;
            _deviceService = deviceService;
            _db = dbConnection;
        }

        public async Task<Model_Device_Sync_Analysis> AnalyzeDeviceSyncAsync(Model_Device_Sync_Request request)
        {
            var analysis = new Model_Device_Sync_Analysis
            {
                DeviceId = request.DeviceId,
                AnalyzedAt = DateTime.UtcNow
            };

            try
            {
                // Get the device from database
                var device = await _deviceDb.GetDeviceByIdAsync(request.DeviceId);
                if (device == null)
                {
                    throw new InvalidOperationException($"Device with ID {request.DeviceId} not found.");
                }

                analysis.DeviceName = device.Name;

                // Validate device is reachable and is a JunctionRelay device
                if (!device.IsJunctionRelayDevice || string.IsNullOrWhiteSpace(device.IPAddress))
                {
                    analysis.BlockingIssues.Add("Device is not a JunctionRelay device or has no IP address.");
                    analysis.CanProceedAutomatically = false;
                    return analysis;
                }

                // Test device connectivity
                if (!await TestDeviceConnectivity(device.IPAddress))
                {
                    analysis.BlockingIssues.Add("Device is not reachable at the current IP address.");
                    analysis.CanProceedAutomatically = false;
                    return analysis;
                }

                // Analyze device info changes
                if (!request.SkipDeviceInfoSync)
                {
                    analysis.DeviceInfo = await AnalyzeDeviceInfoChanges(device);
                }

                // Analyze screens changes
                if (!request.SkipScreensSync)
                {
                    analysis.Screens = await AnalyzeScreensChanges(device, request.IncludeDependencyAnalysis);
                }

                // Analyze I2C devices changes
                if (!request.SkipI2CDevicesSync)
                {
                    analysis.I2CDevices = await AnalyzeI2CDevicesChanges(device, request.IncludeDependencyAnalysis);
                }

                // Analyze sensors changes
                if (!request.SkipSensorsSync)
                {
                    analysis.Sensors = await AnalyzeSensorsChanges(device, request.IncludeDependencyAnalysis);
                }

                // Determine if we can proceed automatically
                analysis.CanProceedAutomatically =
                    analysis.BlockingIssues.Count == 0 &&
                    !analysis.Screens.ToDelete.Any(s => s.IsBlocked) &&
                    !analysis.I2CDevices.ToDelete.Any(i => i.IsBlocked) &&
                    !analysis.Sensors.ToDelete.Any(s => s.IsBlocked);

                return analysis;
            }
            catch (Exception ex)
            {
                analysis.BlockingIssues.Add($"Error during analysis: {ex.Message}");
                analysis.CanProceedAutomatically = false;
                return analysis;
            }
        }

        private async Task<bool> TestDeviceConnectivity(string ipAddress)
        {
            try
            {
                using var client = new HttpClient();
                client.Timeout = TimeSpan.FromSeconds(5);
                var response = await client.GetAsync($"http://{ipAddress}/api/device/info");
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        private async Task<Model_Device_Info_Sync> AnalyzeDeviceInfoChanges(Model_Device device)
        {
            var sync = new Model_Device_Info_Sync();

            try
            {
                // Fetch current device info from the device
                var deviceInfoJson = await _deviceService.FetchDeviceInfoWithFirmwareJson(device.IPAddress!);
                var currentDeviceInfo = JsonConvert.DeserializeObject<Model_Device_Info>(deviceInfoJson);

                if (currentDeviceInfo == null)
                {
                    return sync;
                }

                // Compare fields and track changes
                CompareAndTrackChange(sync.Changes, "DeviceModel", device.DeviceModel, currentDeviceInfo.DeviceModel);
                CompareAndTrackChange(sync.Changes, "DeviceManufacturer", device.DeviceManufacturer, currentDeviceInfo.DeviceManufacturer);
                CompareAndTrackChange(sync.Changes, "FirmwareVersion", device.FirmwareVersion, currentDeviceInfo.FirmwareVersion);
                CompareAndTrackChange(sync.Changes, "HasCustomFirmware", device.HasCustomFirmware, currentDeviceInfo.CustomFirmware ?? false);
                CompareAndTrackChange(sync.Changes, "MCU", device.MCU, currentDeviceInfo.MCU);
                CompareAndTrackChange(sync.Changes, "WirelessConnectivity", device.WirelessConnectivity, currentDeviceInfo.WirelessConnectivity);
                CompareAndTrackChange(sync.Changes, "Flash", device.Flash, currentDeviceInfo.Flash);
                CompareAndTrackChange(sync.Changes, "PSRAM", device.PSRAM, currentDeviceInfo.PSRAM);
                CompareAndTrackChange(sync.Changes, "UniqueIdentifier", device.UniqueIdentifier, currentDeviceInfo.UniqueIdentifier);

                sync.HasChanges = sync.Changes.Any();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error analyzing device info changes: {ex.Message}");
            }

            return sync;
        }

        private async Task<Model_Device_Screens_Sync> AnalyzeScreensChanges(Model_Device device, bool includeDependencies)
        {
            var sync = new Model_Device_Screens_Sync();

            try
            {
                // Get current screens from database
                var dbScreens = await _deviceDb.GetDeviceScreensAsync(device.Id);

                // Get current screens from device capabilities
                var deviceCapabilitiesJson = await _deviceService.FetchDeviceCapabilitiesJson(device.IPAddress!);
                var deviceCapabilities = JsonConvert.DeserializeObject<Model_Device_Capabilities>(deviceCapabilitiesJson);

                if (deviceCapabilities?.Screens == null)
                {
                    return sync;
                }

                // Convert Screen objects to Model_Device_Screens for comparison
                var deviceScreens = deviceCapabilities.Screens.Select(s => new Model_Device_Screens
                {
                    DeviceId = device.Id,
                    ScreenKey = s.ScreenKey,
                    DisplayName = s.DisplayName,
                    ScreenType = s.ScreenType,
                    SupportsConfigPayloads = s.SupportsConfigPayloads,
                    SupportsSensorPayloads = s.SupportsSensorPayloads
                }).ToList();

                // Find screens to add (exist on device but not in DB)
                var screensToAdd = deviceScreens
                    .Where(ds => !dbScreens.Any(dbs => dbs.ScreenKey == ds.ScreenKey))
                    .ToList();

                sync.ToAdd.AddRange(screensToAdd);

                // Find screens to update (exist in both but have differences)
                foreach (var deviceScreen in deviceScreens)
                {
                    var dbScreen = dbScreens.FirstOrDefault(dbs => dbs.ScreenKey == deviceScreen.ScreenKey);
                    if (dbScreen != null)
                    {
                        var updatePlan = new Model_Screen_Update_Plan
                        {
                            ScreenId = dbScreen.Id,
                            ScreenKey = dbScreen.ScreenKey,
                            CurrentDisplayName = dbScreen.DisplayName ?? ""
                        };

                        // Compare fields
                        CompareAndTrackChange(updatePlan.Changes, "DisplayName", dbScreen.DisplayName, deviceScreen.DisplayName);
                        CompareAndTrackChange(updatePlan.Changes, "ScreenType", dbScreen.ScreenType, deviceScreen.ScreenType);
                        CompareAndTrackChange(updatePlan.Changes, "SupportsConfigPayloads", dbScreen.SupportsConfigPayloads, deviceScreen.SupportsConfigPayloads);
                        CompareAndTrackChange(updatePlan.Changes, "SupportsSensorPayloads", dbScreen.SupportsSensorPayloads, deviceScreen.SupportsSensorPayloads);

                        if (updatePlan.Changes.Any())
                        {
                            if (includeDependencies)
                            {
                                updatePlan.UsedIn = await FindScreenDependencies(dbScreen.Id);
                            }
                            sync.ToUpdate.Add(updatePlan);
                        }
                    }
                }

                // Find screens to delete (exist in DB but not on device)
                var screensToDelete = dbScreens
                    .Where(dbs => !deviceScreens.Any(ds => ds.ScreenKey == dbs.ScreenKey))
                    .ToList();

                foreach (var screenToDelete in screensToDelete)
                {
                    var deletePlan = new Model_Screen_Delete_Plan
                    {
                        ScreenId = screenToDelete.Id,
                        ScreenKey = screenToDelete.ScreenKey,
                        DisplayName = screenToDelete.DisplayName ?? ""
                    };

                    if (includeDependencies)
                    {
                        deletePlan.UsedIn = await FindScreenDependencies(screenToDelete.Id);
                        if (deletePlan.UsedIn.Any())
                        {
                            deletePlan.BlockingReason = $"Screen is used in {deletePlan.UsedIn.Count} configuration(s)";
                        }
                    }

                    sync.ToDelete.Add(deletePlan);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error analyzing screens changes: {ex.Message}");
            }

            return sync;
        }

        private async Task<Model_Device_I2C_Sync> AnalyzeI2CDevicesChanges(Model_Device device, bool includeDependencies)
        {
            var sync = new Model_Device_I2C_Sync();

            try
            {
                // Get current I2C devices from database
                var dbI2CDevices = await _i2cDeviceDb.GetI2CDevicesForDeviceAsync(device.Id);

                // Get current I2C devices from device capabilities
                var deviceCapabilitiesJson = await _deviceService.FetchDeviceCapabilitiesJson(device.IPAddress!);
                var deviceCapabilities = JsonConvert.DeserializeObject<Model_Device_Capabilities>(deviceCapabilitiesJson);

                if (deviceCapabilities?.I2cDevices == null)
                {
                    return sync;
                }

                // Convert I2CDevice objects to Model_Device_I2CDevice for comparison
                var deviceI2CDevices = deviceCapabilities.I2cDevices.Select(i => new Model_Device_I2CDevice
                {
                    DeviceId = device.Id,
                    I2CAddress = i.I2CAddress,
                    DeviceType = i.DeviceType,
                    CommunicationProtocol = i.CommunicationProtocol,
                    IsEnabled = i.IsEnabled,
                    DateAdded = DateTime.UtcNow,
                    Endpoints = i.Endpoints.Select(e => new Model_Device_I2CDevice_Endpoint
                    {
                        I2CDeviceId = 0, // Will be set when created
                        EndpointType = e.EndpointType,
                        Address = e.Address,
                        QoS = e.QoS,
                        Notes = e.Notes
                    }).ToList()
                }).ToList();

                // Find I2C devices to add
                var i2cDevicesToAdd = deviceI2CDevices
                    .Where(di => !dbI2CDevices.Any(dbi => dbi.I2CAddress == di.I2CAddress && dbi.DeviceType == di.DeviceType))
                    .ToList();

                sync.ToAdd.AddRange(i2cDevicesToAdd);

                // Find I2C devices to update
                foreach (var deviceI2C in deviceI2CDevices)
                {
                    var dbI2C = dbI2CDevices.FirstOrDefault(dbi =>
                        dbi.I2CAddress == deviceI2C.I2CAddress && dbi.DeviceType == deviceI2C.DeviceType);

                    if (dbI2C != null)
                    {
                        var updatePlan = new Model_I2C_Update_Plan
                        {
                            I2CDeviceId = dbI2C.Id,
                            DeviceType = dbI2C.DeviceType
                        };

                        // Compare fields
                        CompareAndTrackChange(updatePlan.Changes, "CommunicationProtocol", dbI2C.CommunicationProtocol, deviceI2C.CommunicationProtocol);
                        CompareAndTrackChange(updatePlan.Changes, "IsEnabled", dbI2C.IsEnabled, deviceI2C.IsEnabled);

                        if (updatePlan.Changes.Any())
                        {
                            if (includeDependencies)
                            {
                                updatePlan.UsedIn = await FindI2CDeviceDependencies(dbI2C.Id);
                            }
                            sync.ToUpdate.Add(updatePlan);
                        }
                    }
                }

                // Find I2C devices to delete
                var i2cDevicesToDelete = dbI2CDevices
                    .Where(dbi => !deviceI2CDevices.Any(di => di.I2CAddress == dbi.I2CAddress && di.DeviceType == dbi.DeviceType))
                    .ToList();

                foreach (var i2cDeviceToDelete in i2cDevicesToDelete)
                {
                    var deletePlan = new Model_I2C_Delete_Plan
                    {
                        I2CDeviceId = i2cDeviceToDelete.Id,
                        DeviceType = i2cDeviceToDelete.DeviceType,
                        I2CAddress = i2cDeviceToDelete.I2CAddress
                    };

                    if (includeDependencies)
                    {
                        deletePlan.UsedIn = await FindI2CDeviceDependencies(i2cDeviceToDelete.Id);
                        if (deletePlan.UsedIn.Any())
                        {
                            deletePlan.BlockingReason = $"I2C device is referenced in {deletePlan.UsedIn.Count} configuration(s)";
                        }
                    }

                    sync.ToDelete.Add(deletePlan);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error analyzing I2C devices changes: {ex.Message}");
            }

            return sync;
        }

        private async Task<Model_Device_Sensors_Sync> AnalyzeSensorsChanges(Model_Device device, bool includeDependencies)
        {
            var sync = new Model_Device_Sensors_Sync();

            try
            {
                // Get current sensors from database
                var dbSensors = await _sensorDb.GetSensorsByDeviceIdAsync(device.Id);

                // Get current sensors from device
                var deviceSensors = await _deviceService.FetchDeviceSensorsJson(device.IPAddress!);

                // Find sensors to add
                var sensorsToAdd = deviceSensors
                    .Where(ds => !dbSensors.Any(dbs => dbs.ExternalId == ds.ExternalId))
                    .ToList();

                sync.ToAdd.AddRange(sensorsToAdd);

                // Find sensors to update
                foreach (var deviceSensor in deviceSensors)
                {
                    var dbSensor = dbSensors.FirstOrDefault(dbs => dbs.ExternalId == deviceSensor.ExternalId);
                    if (dbSensor != null)
                    {
                        var updatePlan = new Model_Sensor_Update_Plan
                        {
                            SensorId = dbSensor.Id,
                            ExternalId = dbSensor.ExternalId,
                            SensorName = dbSensor.Name
                        };

                        // Compare fields using actual Model_Sensor properties
                        CompareAndTrackChange(updatePlan.Changes, "Name", dbSensor.Name, deviceSensor.Name);
                        CompareAndTrackChange(updatePlan.Changes, "Unit", dbSensor.Unit, deviceSensor.Unit);
                        CompareAndTrackChange(updatePlan.Changes, "SensorType", dbSensor.SensorType, deviceSensor.SensorType);
                        CompareAndTrackChange(updatePlan.Changes, "ComponentName", dbSensor.ComponentName, deviceSensor.ComponentName);
                        CompareAndTrackChange(updatePlan.Changes, "Category", dbSensor.Category, deviceSensor.Category);
                        CompareAndTrackChange(updatePlan.Changes, "SensorTag", dbSensor.SensorTag, deviceSensor.SensorTag);
                        CompareAndTrackChange(updatePlan.Changes, "DeviceName", dbSensor.DeviceName, deviceSensor.DeviceName);

                        if (updatePlan.Changes.Any())
                        {
                            if (includeDependencies)
                            {
                                updatePlan.UsedIn = await FindSensorDependencies(dbSensor.Id);
                            }
                            sync.ToUpdate.Add(updatePlan);
                        }
                    }
                }

                // Find sensors to delete
                var sensorsToDelete = dbSensors
                    .Where(dbs => !deviceSensors.Any(ds => ds.ExternalId == dbs.ExternalId))
                    .ToList();

                foreach (var sensorToDelete in sensorsToDelete)
                {
                    var deletePlan = new Model_Sensor_Delete_Plan
                    {
                        SensorId = sensorToDelete.Id,
                        ExternalId = sensorToDelete.ExternalId,
                        SensorName = sensorToDelete.Name
                    };

                    if (includeDependencies)
                    {
                        deletePlan.UsedIn = await FindSensorDependencies(sensorToDelete.Id);
                        if (deletePlan.UsedIn.Any())
                        {
                            deletePlan.BlockingReason = $"Sensor is used in {deletePlan.UsedIn.Count} configuration(s)";
                        }
                    }

                    sync.ToDelete.Add(deletePlan);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error analyzing sensors changes: {ex.Message}");
            }

            return sync;
        }

        // Helper method to compare and track field changes
        private void CompareAndTrackChange(Dictionary<string, Model_Field_Change> changes, string fieldName, object? oldValue, object? newValue)
        {
            if (!Equals(oldValue, newValue))
            {
                changes[fieldName] = new Model_Field_Change
                {
                    FieldName = fieldName,
                    OldValue = oldValue,
                    NewValue = newValue
                };
            }
        }

        // Dependency finding methods (these would need to be implemented based on your schema)
        private async Task<List<string>> FindScreenDependencies(int screenId)
        {
            var dependencies = new List<string>();

            try
            {
                // Find junction sensor targets that reference this screen (THIS WAS MISSING!)
                var junctionSensorTargetDeps = await _db.QueryAsync<(string JunctionName, string SensorName)>(@"
            SELECT j.Name as JunctionName, s.Name as SensorName
            FROM JunctionSensorTargets jst
            INNER JOIN Junctions j ON jst.JunctionId = j.Id
            INNER JOIN JunctionSensors s ON jst.SensorId = s.Id
            WHERE jst.ScreenId = @ScreenId", new { ScreenId = screenId });

                foreach (var dep in junctionSensorTargetDeps)
                {
                    dependencies.Add($"Junction: {dep.JunctionName} (Sensor: {dep.SensorName})");
                }

                // Find junctions that reference this screen directly
                var junctionDeps = await _db.QueryAsync<string>(@"
            SELECT j.Name 
            FROM Junctions j
            INNER JOIN JunctionSensors js ON j.Id = js.JunctionId
            WHERE js.ScreenId = @ScreenId", new { ScreenId = screenId });

                dependencies.AddRange(junctionDeps.Select(j => $"Junction: {j}"));

                // Find layouts that reference this screen
                var layoutDeps = await _db.QueryAsync<string>(@"
            SELECT l.Name 
            FROM ScreenLayouts l
            WHERE l.Id IN (
                SELECT ScreenLayoutId FROM DeviceScreens WHERE Id = @ScreenId
            )", new { ScreenId = screenId });

                dependencies.AddRange(layoutDeps.Select(l => $"Layout: {l}"));

                // Add other dependency checks as needed...
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error finding screen dependencies: {ex.Message}");
            }

            return dependencies;
        }

        private async Task<List<string>> FindI2CDeviceDependencies(int i2cDeviceId)
        {
            var dependencies = new List<string>();

            try
            {
                // Find sensors that reference this I2C device
                var sensorDeps = await _db.QueryAsync<string>(@"
                    SELECT s.Name 
                    FROM Sensors s
                    WHERE s.I2CDeviceId = @I2CDeviceId", new { I2CDeviceId = i2cDeviceId });

                dependencies.AddRange(sensorDeps.Select(s => $"Sensor: {s}"));

                // Add other dependency checks as needed...
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error finding I2C device dependencies: {ex.Message}");
            }

            return dependencies;
        }

        private async Task<List<string>> FindSensorDependencies(int sensorId)
        {
            var dependencies = new List<string>();

            try
            {
                // Find junctions that reference this sensor
                var junctionDeps = await _db.QueryAsync<string>(@"
                    SELECT j.Name 
                    FROM Junctions j
                    INNER JOIN JunctionSensors js ON j.Id = js.JunctionId
                    WHERE js.SensorId = @SensorId", new { SensorId = sensorId });

                dependencies.AddRange(junctionDeps.Select(j => $"Junction: {j}"));

                // Find junction sensor targets that reference this sensor
                var targetDeps = await _db.QueryAsync<string>(@"
                    SELECT CONCAT('Target: ', jst.TargetName, ' (Junction: ', j.Name, ')') as DependencyName
                    FROM JunctionSensorTargets jst
                    INNER JOIN Junctions j ON jst.JunctionId = j.Id
                    WHERE jst.SensorId = @SensorId", new { SensorId = sensorId });

                dependencies.AddRange(targetDeps);

                // Find dashboards or reports that might reference this sensor
                // (Add queries based on your actual schema)

                // Add other dependency checks as needed...
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error finding sensor dependencies: {ex.Message}");
            }

            return dependencies;
        }

        // Helper methods to fetch data from device (these need to be implemented based on your device API)
        private async Task<List<Model_Device_Screens>> FetchScreensFromDevice(string ipAddress)
        {
            try
            {
                // Get screens from device capabilities
                var capabilitiesJson = await _deviceService.FetchDeviceCapabilitiesJson(ipAddress);
                var capabilities = JsonConvert.DeserializeObject<Model_Device_Capabilities>(capabilitiesJson);

                if (capabilities?.Screens == null)
                {
                    return new List<Model_Device_Screens>();
                }

                return capabilities.Screens.Select(s => new Model_Device_Screens
                {
                    ScreenKey = s.ScreenKey,
                    DisplayName = s.DisplayName,
                    ScreenType = s.ScreenType,
                    SupportsConfigPayloads = s.SupportsConfigPayloads,
                    SupportsSensorPayloads = s.SupportsSensorPayloads
                }).ToList();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error fetching screens from device {ipAddress}: {ex.Message}");
                return new List<Model_Device_Screens>();
            }
        }

        private async Task<List<Model_Device_I2CDevice>> FetchI2CDevicesFromDevice(string ipAddress)
        {
            try
            {
                // Get I2C devices from device capabilities
                var capabilitiesJson = await _deviceService.FetchDeviceCapabilitiesJson(ipAddress);
                var capabilities = JsonConvert.DeserializeObject<Model_Device_Capabilities>(capabilitiesJson);

                if (capabilities?.I2cDevices == null)
                {
                    return new List<Model_Device_I2CDevice>();
                }

                return capabilities.I2cDevices.Select(i => new Model_Device_I2CDevice
                {
                    I2CAddress = i.I2CAddress,
                    DeviceType = i.DeviceType,
                    CommunicationProtocol = i.CommunicationProtocol,
                    IsEnabled = i.IsEnabled,
                    DateAdded = DateTime.UtcNow,
                    Endpoints = i.Endpoints.Select(e => new Model_Device_I2CDevice_Endpoint
                    {
                        EndpointType = e.EndpointType,
                        Address = e.Address,
                        QoS = e.QoS,
                        Notes = e.Notes
                    }).ToList()
                }).ToList();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error fetching I2C devices from device {ipAddress}: {ex.Message}");
                return new List<Model_Device_I2CDevice>();
            }
        }

        // Execution methods for the actual sync
        public async Task<Model_Device_Sync_Result> ExecuteFullDeviceSyncAsync(Model_Device_Full_Sync_Request request)
        {
            var result = new Model_Device_Sync_Result
            {
                DeviceId = request.DeviceId,
                ExecutedAt = DateTime.UtcNow
            };

            using var transaction = _db.BeginTransaction();

            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(request.DeviceId);
                if (device == null)
                {
                    result.Success = false;
                    result.ErrorMessage = $"Device with ID {request.DeviceId} not found.";
                    return result;
                }

                // Execute device info sync
                if (request.Approvals.ApproveDeviceInfoChanges)
                {
                    await ExecuteDeviceInfoSync(device);
                    result.DeviceInfoUpdates = 1;
                }

                // Execute screens sync
                await ExecuteScreensSync(device, request.Approvals, result);

                // Execute I2C devices sync
                await ExecuteI2CDevicesSync(device, request.Approvals, result);

                // Execute sensors sync
                // await ExecuteSensorsSync(device, request.Approvals, result);

                // Update device's LastUpdated timestamp
                device.LastUpdated = DateTime.UtcNow;
                await _deviceDb.UpdateDeviceAsync(device.Id, device);

                transaction.Commit();
                result.Success = true;
            }
            catch (Exception ex)
            {
                transaction.Rollback();
                result.Success = false;
                result.ErrorMessage = ex.Message;
                result.Errors.Add($"Transaction rolled back due to error: {ex.Message}");
            }

            return result;
        }

        private async Task ExecuteDeviceInfoSync(Model_Device device)
        {
            try
            {
                var deviceInfoJson = await _deviceService.FetchDeviceInfoWithFirmwareJson(device.IPAddress!);
                var currentDeviceInfo = JsonConvert.DeserializeObject<Model_Device_Info>(deviceInfoJson);

                if (currentDeviceInfo != null)
                {
                    // Update device fields
                    device.DeviceModel = currentDeviceInfo.DeviceModel;
                    device.DeviceManufacturer = currentDeviceInfo.DeviceManufacturer;
                    device.FirmwareVersion = currentDeviceInfo.FirmwareVersion;
                    device.HasCustomFirmware = currentDeviceInfo.CustomFirmware ?? false;
                    device.MCU = currentDeviceInfo.MCU;
                    device.WirelessConnectivity = currentDeviceInfo.WirelessConnectivity;
                    device.Flash = currentDeviceInfo.Flash;
                    device.PSRAM = currentDeviceInfo.PSRAM;
                    device.UniqueIdentifier = currentDeviceInfo.UniqueIdentifier ?? device.UniqueIdentifier;

                    await _deviceDb.UpdateDeviceAsync(device.Id, device);
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to sync device info: {ex.Message}", ex);
            }
        }

        private async Task ExecuteScreensSync(Model_Device device, Model_Device_Sync_Approval approvals, Model_Device_Sync_Result result)
        {
            try
            {
                // Get current screens from device capabilities
                var deviceCapabilitiesJson = await _deviceService.FetchDeviceCapabilitiesJson(device.IPAddress!);
                var deviceCapabilities = JsonConvert.DeserializeObject<Model_Device_Capabilities>(deviceCapabilitiesJson);

                if (deviceCapabilities?.Screens == null)
                {
                    return;
                }

                // Convert Screen objects to Model_Device_Screens
                var deviceScreens = deviceCapabilities.Screens.Select(s => new Model_Device_Screens
                {
                    DeviceId = device.Id,
                    ScreenKey = s.ScreenKey,
                    DisplayName = s.DisplayName,
                    ScreenType = s.ScreenType,
                    SupportsConfigPayloads = s.SupportsConfigPayloads,
                    SupportsSensorPayloads = s.SupportsSensorPayloads
                }).ToList();

                var dbScreens = await _deviceDb.GetDeviceScreensAsync(device.Id);

                // Add new screens
                var screensToAdd = deviceScreens
                    .Where(ds => !dbScreens.Any(dbs => dbs.ScreenKey == ds.ScreenKey))
                    .ToList();

                foreach (var screenToAdd in screensToAdd)
                {
                    screenToAdd.DeviceId = device.Id;
                    await _deviceDb.AddDeviceScreenAsync(screenToAdd);
                    result.ScreensAdded++;
                }

                // Update approved screens
                foreach (var deviceScreen in deviceScreens)
                {
                    var dbScreen = dbScreens.FirstOrDefault(dbs => dbs.ScreenKey == deviceScreen.ScreenKey);
                    if (dbScreen != null && approvals.ApprovedScreenUpdates.Contains(dbScreen.Id))
                    {
                        dbScreen.DisplayName = deviceScreen.DisplayName;
                        dbScreen.ScreenType = deviceScreen.ScreenType;
                        dbScreen.SupportsConfigPayloads = deviceScreen.SupportsConfigPayloads;
                        dbScreen.SupportsSensorPayloads = deviceScreen.SupportsSensorPayloads;

                        await _deviceDb.UpdateDeviceScreenAsync(dbScreen.Id, dbScreen);
                        result.ScreensUpdated++;
                    }
                }

                // Delete approved screens
                var screensToDelete = dbScreens
                    .Where(dbs => !deviceScreens.Any(ds => ds.ScreenKey == dbs.ScreenKey))
                    .Where(dbs => approvals.ApprovedScreenDeletions.Contains(dbs.Id) || approvals.ForceDeleteBlockedItems)
                    .ToList();

                foreach (var screenToDelete in screensToDelete)
                {
                    await _deviceDb.DeleteDeviceScreenAsync(screenToDelete.Id);
                    result.ScreensDeleted++;
                }
            }
            catch (Exception ex)
            {
                result.Errors.Add($"Failed to sync screens: {ex.Message}");
                throw;
            }
        }

        private async Task ExecuteI2CDevicesSync(Model_Device device, Model_Device_Sync_Approval approvals, Model_Device_Sync_Result result)
        {
            try
            {
                // Get current I2C devices from device capabilities
                var deviceCapabilitiesJson = await _deviceService.FetchDeviceCapabilitiesJson(device.IPAddress!);
                var deviceCapabilities = JsonConvert.DeserializeObject<Model_Device_Capabilities>(deviceCapabilitiesJson);

                if (deviceCapabilities?.I2cDevices == null)
                {
                    return;
                }

                // Convert I2CDevice objects to Model_Device_I2CDevice
                var deviceI2CDevices = deviceCapabilities.I2cDevices.Select(i => new Model_Device_I2CDevice
                {
                    DeviceId = device.Id,
                    I2CAddress = i.I2CAddress,
                    DeviceType = i.DeviceType,
                    CommunicationProtocol = i.CommunicationProtocol,
                    IsEnabled = i.IsEnabled,
                    DateAdded = DateTime.UtcNow,
                    Endpoints = i.Endpoints.Select(e => new Model_Device_I2CDevice_Endpoint
                    {
                        I2CDeviceId = 0, // Will be set when created
                        EndpointType = e.EndpointType,
                        Address = e.Address,
                        QoS = e.QoS,
                        Notes = e.Notes
                    }).ToList()
                }).ToList();

                var dbI2CDevices = await _i2cDeviceDb.GetI2CDevicesForDeviceAsync(device.Id);

                // Add new I2C devices
                var i2cDevicesToAddExec = deviceI2CDevices
                    .Where(di => !dbI2CDevices.Any(dbi => dbi.I2CAddress == di.I2CAddress && dbi.DeviceType == di.DeviceType))
                    .ToList();

                foreach (var i2cDeviceToAdd in i2cDevicesToAddExec)
                {
                    i2cDeviceToAdd.DeviceId = device.Id;
                    var addedDevice = await _i2cDeviceDb.AddI2CDeviceAsync(i2cDeviceToAdd);

                    // Add endpoints
                    foreach (var endpoint in i2cDeviceToAdd.Endpoints)
                    {
                        endpoint.I2CDeviceId = addedDevice.Id;
                        await _i2cDeviceDb.AddI2CEndpointAsync(endpoint);
                    }

                    result.I2CDevicesAdded++;
                }

                // Update approved I2C devices
                foreach (var deviceI2C in deviceI2CDevices)
                {
                    var dbI2C = dbI2CDevices.FirstOrDefault(dbi =>
                        dbi.I2CAddress == deviceI2C.I2CAddress && dbi.DeviceType == deviceI2C.DeviceType);

                    if (dbI2C != null && approvals.ApprovedI2CDeviceUpdates.Contains(dbI2C.Id))
                    {
                        dbI2C.CommunicationProtocol = deviceI2C.CommunicationProtocol;
                        dbI2C.IsEnabled = deviceI2C.IsEnabled;

                        await _i2cDeviceDb.UpdateI2CDeviceAsync(dbI2C.Id, dbI2C);
                        result.I2CDevicesUpdated++;
                    }
                }

                // Delete approved I2C devices
                var i2cDevicesToDeleteExec = dbI2CDevices
                    .Where(dbi => !deviceI2CDevices.Any(di => di.I2CAddress == dbi.I2CAddress && di.DeviceType == dbi.DeviceType))
                    .Where(dbi => approvals.ApprovedI2CDeviceDeletions.Contains(dbi.Id) || approvals.ForceDeleteBlockedItems)
                    .ToList();

                foreach (var i2cDeviceToDelete in i2cDevicesToDeleteExec)
                {
                    await _i2cDeviceDb.DeleteI2CDeviceAsync(i2cDeviceToDelete.Id);
                    result.I2CDevicesDeleted++;
                }
            }
            catch (Exception ex)
            {
                result.Errors.Add($"Failed to sync I2C devices: {ex.Message}");
                throw;
            }
        }

        private async Task ExecuteSensorsSync(Model_Device device, Model_Device_Sync_Approval approvals, Model_Device_Sync_Result result)
        {
            try
            {
                var deviceSensors = await _deviceService.FetchDeviceSensorsJson(device.IPAddress!);
                var dbSensors = await _sensorDb.GetSensorsByDeviceIdAsync(device.Id);

                // Add new sensors
                var sensorsToAdd = deviceSensors
                    .Where(ds => !dbSensors.Any(dbs => dbs.ExternalId == ds.ExternalId))
                    .ToList();

                foreach (var sensorToAdd in sensorsToAdd)
                {
                    sensorToAdd.DeviceId = device.Id;
                    sensorToAdd.LastUpdated = DateTime.UtcNow;
                    await _sensorDb.AddSensorAsync(sensorToAdd);
                    result.SensorsAdded++;
                }

                // Update approved sensors
                foreach (var deviceSensor in deviceSensors)
                {
                    var dbSensor = dbSensors.FirstOrDefault(dbs => dbs.ExternalId == deviceSensor.ExternalId);
                    if (dbSensor != null && approvals.ApprovedSensorUpdates.Contains(dbSensor.Id))
                    {
                        // Update with actual Model_Sensor properties
                        dbSensor.Name = deviceSensor.Name;
                        dbSensor.Unit = deviceSensor.Unit;
                        dbSensor.SensorType = deviceSensor.SensorType;
                        dbSensor.ComponentName = deviceSensor.ComponentName;
                        dbSensor.Category = deviceSensor.Category;
                        dbSensor.SensorTag = deviceSensor.SensorTag;
                        dbSensor.DeviceName = deviceSensor.DeviceName;
                        dbSensor.LastUpdated = DateTime.UtcNow;

                        await _sensorDb.UpdateSensorAsync(dbSensor.Id, dbSensor);
                        result.SensorsUpdated++;
                    }
                }

                // Delete approved sensors
                var sensorsToDelete = dbSensors
                    .Where(dbs => !deviceSensors.Any(ds => ds.ExternalId == dbs.ExternalId))
                    .Where(dbs => approvals.ApprovedSensorDeletions.Contains(dbs.Id) || approvals.ForceDeleteBlockedItems)
                    .ToList();

                foreach (var sensorToDelete in sensorsToDelete)
                {
                    await _sensorDb.DeleteSensorAsync(sensorToDelete.Id);
                    result.SensorsDeleted++;
                }
            }
            catch (Exception ex)
            {
                result.Errors.Add($"Failed to sync sensors: {ex.Message}");
                throw;
            }
        }
    }
}