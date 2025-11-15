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

using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using System.IO.MemoryMappedFiles;
using System.Runtime.InteropServices;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_HWiNFO : IDataCollector
    {
        public const string HWiNFO_SENSORS_MAP_FILE_NAME2 = "Global\\HWiNFO_SENS_SM2";
        public const string HWiNFO_SENSORS_SM2_MUTEX = "Global\\HWiNFO_SM2_MUTEX";
        public const int HWiNFO_SENSORS_STRING_LEN2 = 128;
        public const int HWiNFO_UNIT_STRING_LEN = 16;

        public int CollectorId { get; private set; }
        public string CollectorName => "HWiNFO";

        private MemoryMappedFile? _mmf;
        private readonly object _lockObject = new object();

        public enum SENSOR_READING_TYPE
        {
            SENSOR_TYPE_NONE = 0,
            SENSOR_TYPE_TEMP,
            SENSOR_TYPE_VOLT,
            SENSOR_TYPE_FAN,
            SENSOR_TYPE_CURRENT,
            SENSOR_TYPE_POWER,
            SENSOR_TYPE_CLOCK,
            SENSOR_TYPE_USAGE,
            SENSOR_TYPE_OTHER
        }

        [StructLayout(LayoutKind.Sequential, Pack = 1, CharSet = CharSet.Ansi)]
        public struct _HWiNFO_SENSORS_READING_ELEMENT
        {
            public SENSOR_READING_TYPE tReading;
            public UInt32 dwSensorIndex;
            public UInt32 dwReadingID;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = HWiNFO_SENSORS_STRING_LEN2)]
            public string szLabelOrig;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = HWiNFO_SENSORS_STRING_LEN2)]
            public string szLabelUser;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = HWiNFO_UNIT_STRING_LEN)]
            public string szUnit;
            public double Value;
            public double ValueMin;
            public double ValueMax;
            public double ValueAvg;
        }

        [StructLayout(LayoutKind.Sequential, Pack = 1, CharSet = CharSet.Ansi)]
        public struct _HWiNFO_SENSORS_SENSOR_ELEMENT
        {
            public UInt32 dwSensorID;
            public UInt32 dwSensorInst;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = HWiNFO_SENSORS_STRING_LEN2)]
            public string szSensorNameOrig;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = HWiNFO_SENSORS_STRING_LEN2)]
            public string szSensorNameUser;
        }

        [StructLayout(LayoutKind.Sequential, Pack = 1, CharSet = CharSet.Ansi)]
        public struct _HWiNFO_SENSORS_SHARED_MEM2
        {
            public UInt32 dwSignature;
            public UInt32 dwVersion;
            public UInt32 dwRevision;
            public long poll_time;
            public UInt32 dwOffsetOfSensorSection;
            public UInt32 dwSizeOfSensorElement;
            public UInt32 dwNumSensorElements;
            public UInt32 dwOffsetOfReadingSection;
            public UInt32 dwSizeOfReadingElement;
            public UInt32 dwNumReadingElements;
        }

        public void ApplyConfiguration(Model_Collector collector)
        {
            CollectorId = collector.Id;
            // HWiNFO doesn't need URL or access token - it reads from shared memory
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            return await Task.FromResult(ReadSensorsFromSharedMemory(collector));
        }

        public async Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            var all = await FetchSensorsAsync(collector, cancellationToken);
            var filtered = all.FindAll(s => selectedSensorIds.Contains(s.ExternalId));
            return filtered;
        }

        public async Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            return await Task.FromResult(CanAccessSharedMemory());
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            lock (_lockObject)
            {
                if (_mmf == null)
                {
                    try
                    {
                        _mmf = MemoryMappedFile.OpenExisting(HWiNFO_SENSORS_MAP_FILE_NAME2, MemoryMappedFileRights.Read);
                    }
                    catch (Exception ex)
                    {
                        throw new InvalidOperationException($"Failed to open HWiNFO shared memory: {ex.Message}", ex);
                    }
                }
            }
            return Task.CompletedTask;
        }

        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            lock (_lockObject)
            {
                _mmf?.Dispose();
                _mmf = null;
            }
            return Task.CompletedTask;
        }

        public bool IsConnected(Model_Collector collector)
        {
            return _mmf != null && CanAccessSharedMemory();
        }

        private bool CanAccessSharedMemory()
        {
            try
            {
                using var testMmf = MemoryMappedFile.OpenExisting(HWiNFO_SENSORS_MAP_FILE_NAME2, MemoryMappedFileRights.Read);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private List<Model_Sensor> ReadSensorsFromSharedMemory(Model_Collector collector)
        {
            var sensorReadings = new List<Model_Sensor>();
            MemoryMappedFile mmf;

            lock (_lockObject)
            {
                if (_mmf != null)
                {
                    mmf = _mmf;
                }
                else
                {
                    try
                    {
                        mmf = MemoryMappedFile.OpenExisting(HWiNFO_SENSORS_MAP_FILE_NAME2, MemoryMappedFileRights.Read);
                    }
                    catch (Exception ex)
                    {
                        throw new InvalidOperationException($"Failed to open HWiNFO shared memory: {ex.Message}", ex);
                    }
                }
            }

            try
            {
                // Read the main header structure
                _HWiNFO_SENSORS_SHARED_MEM2 hwInfoMemory;
                using (var accessor = mmf.CreateViewAccessor(0, Marshal.SizeOf(typeof(_HWiNFO_SENSORS_SHARED_MEM2)), MemoryMappedFileAccess.Read))
                {
                    accessor.Read(0, out hwInfoMemory);
                }

                // Read all sensor names first
                var sensorNames = new List<string>();
                for (uint dwSensor = 0; dwSensor < hwInfoMemory.dwNumSensorElements; dwSensor++)
                {
                    using var sensorAccessor = mmf.CreateViewStream(
                        hwInfoMemory.dwOffsetOfSensorSection + (dwSensor * hwInfoMemory.dwSizeOfSensorElement),
                        hwInfoMemory.dwSizeOfSensorElement,
                        MemoryMappedFileAccess.Read);

                    var byteBuffer = new byte[hwInfoMemory.dwSizeOfSensorElement];
                    sensorAccessor.Read(byteBuffer, 0, (int)hwInfoMemory.dwSizeOfSensorElement);

                    var handle = GCHandle.Alloc(byteBuffer, GCHandleType.Pinned);
                    try
                    {
                        var sensorElement = (_HWiNFO_SENSORS_SENSOR_ELEMENT)(Marshal.PtrToStructure(
                            handle.AddrOfPinnedObject(),
                            typeof(_HWiNFO_SENSORS_SENSOR_ELEMENT)) ?? new _HWiNFO_SENSORS_SENSOR_ELEMENT());

                        sensorNames.Add(string.IsNullOrEmpty(sensorElement.szSensorNameUser)
                            ? sensorElement.szSensorNameOrig
                            : sensorElement.szSensorNameUser);
                    }
                    finally
                    {
                        handle.Free();
                    }
                }

                // Read all reading elements
                for (uint dwReading = 0; dwReading < hwInfoMemory.dwNumReadingElements; dwReading++)
                {
                    using var readingAccessor = mmf.CreateViewStream(
                        hwInfoMemory.dwOffsetOfReadingSection + (dwReading * hwInfoMemory.dwSizeOfReadingElement),
                        hwInfoMemory.dwSizeOfReadingElement,
                        MemoryMappedFileAccess.Read);

                    var byteBuffer = new byte[hwInfoMemory.dwSizeOfReadingElement];
                    readingAccessor.Read(byteBuffer, 0, (int)hwInfoMemory.dwSizeOfReadingElement);

                    var handle = GCHandle.Alloc(byteBuffer, GCHandleType.Pinned);
                    try
                    {
                        var readingElement = (_HWiNFO_SENSORS_READING_ELEMENT)(Marshal.PtrToStructure(
                            handle.AddrOfPinnedObject(),
                            typeof(_HWiNFO_SENSORS_READING_ELEMENT)) ?? new _HWiNFO_SENSORS_READING_ELEMENT());

                        if (readingElement.dwSensorIndex < sensorNames.Count)
                        {
                            var componentName = sensorNames[(int)readingElement.dwSensorIndex];
                            var sensorName = string.IsNullOrEmpty(readingElement.szLabelUser)
                                ? readingElement.szLabelOrig
                                : readingElement.szLabelUser;

                            if (!string.IsNullOrEmpty(sensorName))
                            {
                                var detectedDecimalPlaces = Helper_DataCollector.GetDecimalPlaces(readingElement.Value);
                                var (sanitizedValue, safeDecimalPlaces) = Helper_DataCollector.SanitizeSensorValue(readingElement.Value, detectedDecimalPlaces);

                                var sensor = new Model_Sensor
                                {
                                    Name = sensorName,
                                    ComponentName = componentName,
                                    Category = GetCategoryFromSensorType(readingElement.tReading),
                                    Unit = CleanUnit(readingElement.szUnit),
                                    Value = sanitizedValue,
                                    DecimalPlaces = safeDecimalPlaces,
                                    ExternalId = $"{readingElement.dwSensorIndex}:{readingElement.dwReadingID}",
                                    SensorType = "SharedMemory",
                                    DeviceName = collector.Name,
                                    SensorTag = sensorName,
                                    JunctionId = null,
                                    DeviceId = null,
                                    CollectorId = collector.Id,
                                    LastUpdated = DateTime.UtcNow
                                };

                                sensorReadings.Add(sensor);
                            }
                        }
                    }
                    finally
                    {
                        handle.Free();
                    }
                }
            }
            finally
            {
                // Only dispose if we created it locally (not using persistent session)
                if (_mmf == null)
                {
                    mmf.Dispose();
                }
            }

            return sensorReadings;
        }

        private string GetCategoryFromSensorType(SENSOR_READING_TYPE sensorType)
        {
            return sensorType switch
            {
                SENSOR_READING_TYPE.SENSOR_TYPE_TEMP => "Temperature",
                SENSOR_READING_TYPE.SENSOR_TYPE_VOLT => "Voltage",
                SENSOR_READING_TYPE.SENSOR_TYPE_FAN => "Fan",
                SENSOR_READING_TYPE.SENSOR_TYPE_CURRENT => "Current",
                SENSOR_READING_TYPE.SENSOR_TYPE_POWER => "Power",
                SENSOR_READING_TYPE.SENSOR_TYPE_CLOCK => "Clock",
                SENSOR_READING_TYPE.SENSOR_TYPE_USAGE => "Load",
                SENSOR_READING_TYPE.SENSOR_TYPE_OTHER => "Other",
                _ => "Unknown"
            };
        }

        private string CleanUnit(string unit)
        {
            if (string.IsNullOrEmpty(unit))
                return string.Empty;

            // Remove null characters and trim
            return unit.Replace("\0", "").Trim();
        }

    }
}