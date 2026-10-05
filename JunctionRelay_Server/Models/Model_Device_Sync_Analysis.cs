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

namespace JunctionRelayServer.Models.DeviceSync
{
    public class Model_Device_Sync_Analysis
    {
        public int DeviceId { get; set; }
        public string DeviceName { get; set; } = string.Empty;
        public bool CanProceedAutomatically { get; set; }
        public DateTime AnalyzedAt { get; set; }

        public Model_Device_Info_Sync DeviceInfo { get; set; } = new();
        public Model_Device_Screens_Sync Screens { get; set; } = new();
        public Model_Device_I2C_Sync I2CDevices { get; set; } = new();
        public Model_Device_Sensors_Sync Sensors { get; set; } = new();

        public List<string> BlockingIssues { get; set; } = new();
        public List<string> Warnings { get; set; } = new();
    }

    public class Model_Device_Info_Sync
    {
        public bool HasChanges { get; set; }
        public Dictionary<string, Model_Field_Change> Changes { get; set; } = new();
    }

    public class Model_Device_Screens_Sync
    {
        public List<Model_Device_Screens> ToAdd { get; set; } = new();
        public List<Model_Screen_Update_Plan> ToUpdate { get; set; } = new();
        public List<Model_Screen_Delete_Plan> ToDelete { get; set; } = new();
        public bool HasChanges => ToAdd.Any() || ToUpdate.Any() || ToDelete.Any();
    }

    public class Model_Device_I2C_Sync
    {
        public List<Model_Device_I2CDevice> ToAdd { get; set; } = new();
        public List<Model_I2C_Update_Plan> ToUpdate { get; set; } = new();
        public List<Model_I2C_Delete_Plan> ToDelete { get; set; } = new();
        public bool HasChanges => ToAdd.Any() || ToUpdate.Any() || ToDelete.Any();
    }

    public class Model_Device_Sensors_Sync
    {
        public List<Model_Sensor> ToAdd { get; set; } = new();
        public List<Model_Sensor_Update_Plan> ToUpdate { get; set; } = new();
        public List<Model_Sensor_Delete_Plan> ToDelete { get; set; } = new();
        public bool HasChanges => ToAdd.Any() || ToUpdate.Any() || ToDelete.Any();
    }

    // Screen-specific sync plans
    public class Model_Screen_Update_Plan
    {
        public int ScreenId { get; set; }
        public string ScreenKey { get; set; } = string.Empty;
        public string CurrentDisplayName { get; set; } = string.Empty;
        public Dictionary<string, Model_Field_Change> Changes { get; set; } = new();
        public List<string> UsedIn { get; set; } = new();
        public bool HasDependencies => UsedIn.Any();
    }

    public class Model_Screen_Delete_Plan
    {
        public int ScreenId { get; set; }
        public string ScreenKey { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public List<string> UsedIn { get; set; } = new();
        public string? BlockingReason { get; set; }
        public bool IsBlocked => !string.IsNullOrEmpty(BlockingReason);
    }

    // I2C Device sync plans
    public class Model_I2C_Update_Plan
    {
        public int I2CDeviceId { get; set; }
        public string DeviceType { get; set; } = string.Empty;
        public Dictionary<string, Model_Field_Change> Changes { get; set; } = new();
        public List<Model_I2C_Endpoint_Update_Plan> EndpointChanges { get; set; } = new();
        public List<string> UsedIn { get; set; } = new();
        public bool HasDependencies => UsedIn.Any() || EndpointChanges.Any(e => e.HasDependencies);
    }

    public class Model_I2C_Delete_Plan
    {
        public int I2CDeviceId { get; set; }
        public string DeviceType { get; set; } = string.Empty;
        public string I2CAddress { get; set; } = string.Empty;
        public List<string> UsedIn { get; set; } = new();
        public string? BlockingReason { get; set; }
        public bool IsBlocked => !string.IsNullOrEmpty(BlockingReason);
    }

    public class Model_I2C_Endpoint_Update_Plan
    {
        public int EndpointId { get; set; }
        public string EndpointType { get; set; } = string.Empty;
        public Dictionary<string, Model_Field_Change> Changes { get; set; } = new();
        public List<string> UsedIn { get; set; } = new();
        public bool HasDependencies => UsedIn.Any();
    }

    // Sensor sync plans
    public class Model_Sensor_Update_Plan
    {
        public int SensorId { get; set; }
        public string ExternalId { get; set; } = string.Empty;
        public string SensorName { get; set; } = string.Empty;
        public Dictionary<string, Model_Field_Change> Changes { get; set; } = new();
        public List<string> UsedIn { get; set; } = new();
        public bool HasDependencies => UsedIn.Any();
    }

    public class Model_Sensor_Delete_Plan
    {
        public int SensorId { get; set; }
        public string ExternalId { get; set; } = string.Empty;
        public string SensorName { get; set; } = string.Empty;
        public List<string> UsedIn { get; set; } = new();
        public string? BlockingReason { get; set; }
        public bool IsBlocked => !string.IsNullOrEmpty(BlockingReason);
    }

    // Generic field change tracking
    public class Model_Field_Change
    {
        public string FieldName { get; set; } = string.Empty;
        public object? OldValue { get; set; }
        public object? NewValue { get; set; }
        public bool IsSignificant { get; set; } = true; // Some changes might be cosmetic

        public override string ToString()
        {
            return $"{OldValue} → {NewValue}";
        }
    }

    // Request/Response models for the API
    public class Model_Device_Sync_Request
    {
        public int DeviceId { get; set; }
        public bool IncludeDependencyAnalysis { get; set; } = true;
        public bool SkipDeviceInfoSync { get; set; } = false;
        public bool SkipScreensSync { get; set; } = false;
        public bool SkipI2CDevicesSync { get; set; } = false;
        public bool SkipSensorsSync { get; set; } = false;
    }

    public class Model_Device_Full_Sync_Request
    {
        public int DeviceId { get; set; }
        public Model_Device_Sync_Approval Approvals { get; set; } = new();
    }

    public class Model_Device_Sync_Approval
    {
        public bool ApproveDeviceInfoChanges { get; set; } = true;
        public List<int> ApprovedScreenUpdates { get; set; } = new();
        public List<int> ApprovedScreenDeletions { get; set; } = new();
        public List<int> ApprovedI2CDeviceUpdates { get; set; } = new();
        public List<int> ApprovedI2CDeviceDeletions { get; set; } = new();
        public List<int> ApprovedSensorUpdates { get; set; } = new();
        public List<int> ApprovedSensorDeletions { get; set; } = new();
        public bool ForceDeleteBlockedItems { get; set; } = false;
    }

    public class Model_Device_Sync_Result
    {
        public int DeviceId { get; set; }
        public bool Success { get; set; }
        public DateTime ExecutedAt { get; set; }
        public string? ErrorMessage { get; set; }

        public int DeviceInfoUpdates { get; set; }
        public int ScreensAdded { get; set; }
        public int ScreensUpdated { get; set; }
        public int ScreensDeleted { get; set; }
        public int I2CDevicesAdded { get; set; }
        public int I2CDevicesUpdated { get; set; }
        public int I2CDevicesDeleted { get; set; }
        public int SensorsAdded { get; set; }
        public int SensorsUpdated { get; set; }
        public int SensorsDeleted { get; set; }

        public List<string> Warnings { get; set; } = new();
        public List<string> Errors { get; set; } = new();
        public List<string> SkippedItems { get; set; } = new();
    }
}