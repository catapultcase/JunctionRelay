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
using System.Data;
using static Dapper.SqlMapper;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Initializer
    {
        private readonly IDbConnection _db;
        private readonly Service_HostInfo _hostInfo;
        private readonly Service_Database_Manager_Devices _deviceDbManager;
        private readonly Service_Database_Manager_Sensors _sensorDbManager;
        private readonly Service_Layout_Templates layoutTemplates;

        public Service_Database_Initializer(IDbConnection db,
                                             Service_HostInfo hostInfo,
                                             Service_Database_Manager_Devices deviceDbManager,
                                             Service_Database_Manager_Sensors sensorDbManager,
                                             Service_Layout_Templates layoutTemplates)
        {
            _db = db;
            _hostInfo = hostInfo;
            _deviceDbManager = deviceDbManager;
            _sensorDbManager = sensorDbManager;
            this.layoutTemplates = layoutTemplates;
        }

        public async Task InitializeAsync()
        {
            _db.Open();

            // Create Settings Table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS Settings (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Key TEXT NOT NULL,
                    Value TEXT NOT NULL,
                    Description TEXT
                );
            ");

            // Create Devices Table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS Devices (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Description TEXT NOT NULL,
                    Type TEXT NOT NULL,
                    Status TEXT DEFAULT 'Offline',
                    LastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,

                    IsConnected BOOLEAN DEFAULT 0,
                    IPAddress TEXT,
                    HasMQTTConfig BOOLEAN DEFAULT 0,

                    PollRate INTEGER DEFAULT 5000,
                    SendRate INTEGER DEFAULT 5000,

                    LastPolled DATETIME DEFAULT CURRENT_TIMESTAMP,
                    IsGateway BOOLEAN DEFAULT 0,
                    GatewayId INTEGER,
                    IsJunctionRelayDevice BOOLEAN DEFAULT 0,

                    -- Cloud device support
                    IsCloudDevice BOOLEAN DEFAULT 0,
                    CloudDeviceId INTEGER,

                    ConnMode TEXT,
                    SelectedPort TEXT,
                    DeviceModel TEXT,
                    DeviceManufacturer TEXT,
                    FirmwareVersion TEXT,
                    HasCustomFirmware BOOLEAN DEFAULT 0,
                    IgnoreUpdates BOOLEAN DEFAULT 0,
                    MCU TEXT,
                    WirelessConnectivity TEXT,
                    Flash TEXT,
                    PSRAM TEXT,
                    UniqueIdentifier TEXT NOT NULL,

                    -- Heartbeat Configuration
                    HeartbeatProtocol TEXT DEFAULT 'HTTP',
                    HeartbeatTarget TEXT,
                    HeartbeatExpectedValue TEXT,
                    HeartbeatEnabled BOOLEAN DEFAULT 1,
                    HeartbeatIntervalMs INTEGER DEFAULT 60000,
                    HeartbeatGracePeriodMs INTEGER DEFAULT 180000,
                    HeartbeatMaxRetryAttempts INTEGER DEFAULT 3,
                    LastPingAttempt DATETIME,
                    LastPinged DATETIME,
                    LastPingStatus TEXT,
                    LastPingDurationMs INTEGER,
                    ConsecutivePingFailures INTEGER DEFAULT 0,

                    ConfigLastAppliedAt DATETIME,
                    SensorPayloadLastAckAt DATETIME,

                    -- Capabilities
                    HasOnboardScreen BOOLEAN DEFAULT 0,
                    HasOnboardLED BOOLEAN DEFAULT 0,
                    HasOnboardRGBLED BOOLEAN DEFAULT 0,
                    HasExternalNeopixels BOOLEAN DEFAULT 0,                    
                    HasExternalMatrix BOOLEAN DEFAULT 0,
                    HasExternalI2CDevices BOOLEAN DEFAULT 0,
                    HasButtons BOOLEAN DEFAULT 0,
                    HasBattery BOOLEAN DEFAULT 0,
                    SupportsWiFi BOOLEAN DEFAULT 0,
                    SupportsBLE BOOLEAN DEFAULT 0,
                    SupportsUSB BOOLEAN DEFAULT 0,                        
                    SupportsESPNow BOOLEAN DEFAULT 0,
                    SupportsHTTP BOOLEAN DEFAULT 0,
                    SupportsMQTT BOOLEAN DEFAULT 0,
                    SupportsWebSockets BOOLEAN DEFAULT 0,
                    HasSpeaker BOOLEAN DEFAULT 0,
                    HasMicroSD BOOLEAN DEFAULT 0,

                    FOREIGN KEY(GatewayId) REFERENCES Devices(Id)
                );
            ");


            // Create Services table
            _db.Execute(@"
                    CREATE TABLE IF NOT EXISTS Services (
                        Id INTEGER PRIMARY KEY AUTOINCREMENT,
                        Name TEXT NOT NULL,
                        Description TEXT NOT NULL,
                        Type TEXT NOT NULL,
                        Status TEXT DEFAULT 'Offline',
                        UniqueIdentifier TEXT NOT NULL,
                        SelectedPort TEXT,
                        ServiceModel TEXT,
                        ServiceManufacturer TEXT,
                        FirmwareVersion TEXT,
                        CustomFirmware BOOLEAN DEFAULT 0,
                        IgnoreUpdates BOOLEAN DEFAULT 0,
                        MCU TEXT,
                        WirelessConnectivity TEXT,
                        IPAddress TEXT,
                        PollRate INTEGER DEFAULT 5000,
                        SendRate INTEGER DEFAULT 5000,
                        LastPolled DATETIME DEFAULT CURRENT_TIMESTAMP,
                        IsGateway BOOLEAN DEFAULT 0,
                        GatewayId INTEGER,
                        IsJunctionRelayService BOOLEAN DEFAULT 0,
                        LastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
                        MQTTBrokerAddress TEXT,
                        MQTTBrokerPort TEXT,
                        MQTTUsername TEXT,
                        MQTTPassword TEXT,
                        FOREIGN KEY(GatewayId) REFERENCES Services(Id)
                   );
                ");

            // Create MqttSubscriptions table
            _db.Execute(@"
            CREATE TABLE IF NOT EXISTS MqttSubscriptions(
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                ServiceId INTEGER NOT NULL,
                Topic TEXT NOT NULL,
                QoS INTEGER DEFAULT 0,
                Active BOOLEAN DEFAULT 1,
                DateAdded DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(ServiceId) REFERENCES Services(Id)
                    );
                ");

            // Create DeviceScreens table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS DeviceScreens (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    DeviceId INTEGER NOT NULL,
                    ScreenKey TEXT NOT NULL,
                    DisplayName TEXT,
                    ScreenType TEXT,
                    ScreenLayoutId INTEGER,
                    SupportsConfigPayloads BOOLEAN DEFAULT 1,
                    SupportsSensorPayloads BOOLEAN DEFAULT 1,
                    UseKeepAlive BOOLEAN DEFAULT 0,
                    UNIQUE(DeviceId, ScreenKey),
                    FOREIGN KEY(DeviceId) REFERENCES Devices(Id),
                    FOREIGN KEY(ScreenLayoutId) REFERENCES ScreenLayouts(Id)
                );
            ");

            // Create JunctionScreenLayouts table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS JunctionScreenLayouts (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    JunctionDeviceLinkId INTEGER NOT NULL,
                    DeviceScreenId INTEGER NOT NULL,
                    ScreenLayoutId INTEGER NOT NULL,
                    FOREIGN KEY(JunctionDeviceLinkId) REFERENCES JunctionDeviceLinks(Id) ON DELETE CASCADE,
                    FOREIGN KEY(ScreenLayoutId) REFERENCES ScreenLayouts(Id)
                );
            ");

            // Create DeviceI2CDevices table
            _db.Execute(@"
                   CREATE TABLE IF NOT EXISTS DeviceI2CDevices (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    DeviceId INTEGER NOT NULL,
                    I2CAddress TEXT NOT NULL,
                    DeviceType TEXT NOT NULL,
                    CommunicationProtocol TEXT DEFAULT 'MQTT',
                    IsEnabled BOOLEAN DEFAULT 1,
                    DateAdded DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(DeviceId) REFERENCES Devices(Id)
                );
            ");

            // Create DeviceI2CDeviceEndpoints table
            _db.Execute(@"
                    CREATE TABLE IF NOT EXISTS DeviceI2CDeviceEndpoints (
                        Id INTEGER PRIMARY KEY AUTOINCREMENT,
                        I2CDeviceId INTEGER NOT NULL,
                        EndpointType TEXT NOT NULL, -- publish, subscribe, command, telemetry, etc
                        Address TEXT NOT NULL,
                        QoS INTEGER DEFAULT 0,
                        Notes TEXT,
                        FOREIGN KEY(I2CDeviceId) REFERENCES DeviceI2CDevices(Id)
                );
            ");


            // Create ScreenLayouts table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS ScreenLayouts (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    DisplayName TEXT,
                    Description TEXT,
                    LayoutType TEXT NOT NULL DEFAULT 'LVGL_GRID',
                    CustomLayoutType TEXT,
                    Rows INTEGER,
                    Columns INTEGER,
                    JsonLayoutConfig TEXT,
                    IncludePrefixConfig BOOL DEFAULT 0,
                    IncludePrefixSensor BOOL DEFAULT 0,
        
                    -- Status and Metadata
                    IsTemplate BOOLEAN DEFAULT 0,
                    IsDraft BOOLEAN DEFAULT 1,
                    IsPublished BOOLEAN DEFAULT 0,
                    Created DATETIME DEFAULT CURRENT_TIMESTAMP,
                    LastModified DATETIME,
                    CreatedBy TEXT,
                    Version TEXT,
        
                    -- Margin and padding
                    TopMargin INTEGER DEFAULT 0,
                    BottomMargin INTEGER DEFAULT 0,
                    LeftMargin INTEGER DEFAULT 0,
                    RightMargin INTEGER DEFAULT 0,
                    OuterPadding INTEGER DEFAULT 0,
                    InnerPadding INTEGER DEFAULT 0,
        
                    -- Background and border styling
                    TextColor TEXT,
                    BackgroundColor TEXT,
                    BorderColor TEXT,
                    BorderVisible BOOLEAN,
                    BorderThickness INTEGER,
                    RoundedCorners BOOLEAN,
                    BorderRadiusSize INTEGER,
                    OpacityPercentage INTEGER,
                    GradientDirection TEXT,
                    GradientEndColor TEXT,
        
                    -- Charts
                    ChartOutlineVisible BOOLEAN,
                    ShowLegend BOOLEAN,
                    PositionLegendInside BOOLEAN,
                    ShowXAxisLabels BOOLEAN,
                    ShowYAxisLabels BOOLEAN,
                    GridDensity INTEGER,
                    HistoryPointsToShow INTEGER,
                    ChartScrollSpeed INTEGER,
        
                    -- Sensors and Fonts
                    ShowUnits BOOLEAN,
                    TextSize TEXT,
                    LabelSize TEXT,
                    ValueSize TEXT,
                    TitleFontId INTEGER,
                    SubHeadingFontId INTEGER,
                    SensorLabelsFontId INTEGER,
                    SensorValuesFontId INTEGER,
                    SensorUnitsFontId INTEGER,
                    DecimalPlaces INTEGER,
        
                    -- Alignment and Positioning
                    JustifyContent TEXT,
                    AlignItems TEXT,
                    TextAlignment TEXT,
        
                    -- Animation
                    AnimationType TEXT,
                    AnimationDuration INTEGER,
        
                    -- Preview fields
                    ShowPreview BOOL DEFAULT 1,
                    PreviewWidth INTEGER DEFAULT 800,
                    PreviewHeight INTEGER DEFAULT 480,
                    PreviewSensors INTEGER DEFAULT 0,
        
                    -- Mobile/Responsive Layout Support
                    IsResponsive BOOLEAN DEFAULT 0,
                    MobileLayoutBehavior TEXT,
        
                    -- Theming
                    ThemeId INTEGER,
                    InheritThemeStyles BOOLEAN DEFAULT 1,
        
                    -- Interactive Behavior
                    AllowInteraction BOOLEAN DEFAULT 0,
                    OnClickBehavior TEXT,
                    NavigationTarget TEXT,
        
                    -- Data Handling
                    DataRefreshIntervalSeconds INTEGER,
                    CacheData BOOLEAN DEFAULT 0,
                    DataFilterCriteria TEXT,

                    -- Media
                    BackgroundImageUrl TEXT,
                    BackgroundImageId TEXT,
                    ImageFit TEXT,
        
                    -- Performance and Optimization
                    LazyLoad BOOLEAN DEFAULT 0,
                    RenderPriority INTEGER,
                    EnableScrollbars BOOLEAN DEFAULT 0,
                    MinWidth INTEGER,
                    MaxWidth INTEGER,
                    MinHeight INTEGER,
                    MaxHeight INTEGER,
        
                    FOREIGN KEY(TitleFontId) REFERENCES Fonts(Id),
                    FOREIGN KEY(SubHeadingFontId) REFERENCES Fonts(Id),
                    FOREIGN KEY(SensorLabelsFontId) REFERENCES Fonts(Id),
                    FOREIGN KEY(SensorValuesFontId) REFERENCES Fonts(Id),
                    FOREIGN KEY(SensorUnitsFontId) REFERENCES Fonts(Id)
                );
            ");

            // Create Fonts table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS Fonts (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Color TEXT,
                    Family TEXT,
                    Size TEXT
                );
            ");

            // Create Logic table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS Logic (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    LogicName TEXT,
                    Description TEXT,
                    JunctionId INTEGER NOT NULL, 
                    SensorId INTEGER NOT NULL, 
                    OverrideColorHex TEXT,
                    OverrideDisplayText TEXT,
                    HideSensorValue BOOLEAN,
                    OverrideUnits TEXT,
                    Priority INTEGER,
                    IsEnabled BOOLEAN DEFAULT 1,
                    AppliesWhen TEXT,
                    FOREIGN KEY(JunctionId) REFERENCES Junctions(Id)
                );
            ");

            // Create Logic Conditions table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS LogicConditions (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    LogicId INTEGER NOT NULL,
                    Field TEXT NOT NULL DEFAULT 'value',
                    Operator TEXT NOT NULL DEFAULT '>',
                    TargetValue REAL NOT NULL,
                    LogicalJoin TEXT DEFAULT 'AND',
                    FOREIGN KEY(LogicId) REFERENCES Logic(Id)
                );
            ");


            // Create Protocols table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS Protocols (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL UNIQUE
                );
            ");

            // Create DeviceProtocols table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS DeviceProtocols (
                    DeviceId INTEGER,
                    ProtocolId INTEGER,
                    Selected BOOLEAN DEFAULT 0,
                    FOREIGN KEY(DeviceId) REFERENCES Devices(Id),
                    FOREIGN KEY(ProtocolId) REFERENCES Protocols(Id),
                    PRIMARY KEY(DeviceId, ProtocolId)
                );
            ");

            // Create ServiceProtocols table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS ServiceProtocols (
                    ServiceId INTEGER,
                    ProtocolId INTEGER,
                    Selected BOOLEAN DEFAULT 0,
                    FOREIGN KEY(ServiceId) REFERENCES Services(Id),
                    FOREIGN KEY(ProtocolId) REFERENCES Protocols(Id),
                    PRIMARY KEY(ServiceId, ProtocolId)
                );
            ");

            // Create CollectorProtocols table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS CollectorProtocols (
                    CollectorId INTEGER,
                    ProtocolId INTEGER,
                    Selected BOOLEAN DEFAULT 0,
                    FOREIGN KEY(CollectorId) REFERENCES Collectors(Id),
                    FOREIGN KEY(ProtocolId) REFERENCES Protocols(Id),
                    PRIMARY KEY(CollectorId, ProtocolId)
                );
            ");

            // Create Collectors table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS Collectors (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL UNIQUE,
                    CollectorType TEXT NOT NULL,
                    Description TEXT,
                    URL TEXT,
                    AccessToken TEXT,
                    PollRate INTEGER DEFAULT 5000,
                    SendRate INTEGER DEFAULT 5000,
                    ServiceId INTEGER
                );
            ");

            // Create Junctions table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS Junctions (
                    Id                       INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name                     TEXT    NOT NULL,
                    Description              TEXT    NOT NULL DEFAULT '',
                    Type                     TEXT,
                    Status                   TEXT    NOT NULL DEFAULT 'Idle',
                    SortOrder                INTEGER NOT NULL DEFAULT 0,
                    ShowOnDashboard          BOOLEAN NOT NULL DEFAULT 1,
                    AutoStartOnLaunch        BOOLEAN NOT NULL DEFAULT 0,
                    CronExpression           TEXT,
                    AllTargetsAllData        BOOLEAN NOT NULL DEFAULT 0,
                    AllTargetsAllScreens     BOOLEAN NOT NULL DEFAULT 0,
                    GatewayDestination       TEXT,
                    MQTTBrokerId             INTEGER,
                    SelectedPayloadAttributes TEXT   NOT NULL DEFAULT '',
                    StreamAutoTimeout        BOOLEAN NOT NULL DEFAULT 0,
                    StreamAutoTimeoutMs      INTEGER NOT NULL DEFAULT 10000,
                    RetryCount               INTEGER NOT NULL DEFAULT 3,
                    RetryIntervalMs          INTEGER NOT NULL DEFAULT 1000,
                    EnableTests              BOOLEAN NOT NULL DEFAULT 1,
                    EnableHealthCheck        BOOLEAN NOT NULL DEFAULT 1,
                    HealthCheckIntervalMs    INTEGER NOT NULL DEFAULT 60000,
                    EnableNotifications      BOOLEAN NOT NULL DEFAULT 0
                );
            ");

            // Create Sensors table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS Sensors (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    OriginalId INTEGER,
                    JunctionId INTEGER,
                    JunctionDeviceLinkId INTEGER,
                    JunctionCollectorLinkId INTEGER,
                    SensorOrder INTEGER,
                    MQTTServiceId INTEGER,
                    MQTTTopic TEXT,
                    MQTTQoS INTEGER,
                    SensorType TEXT,
                    IsMissing BOOLEAN DEFAULT 0,
                    IsStale BOOLEAN DEFAULT 0,
                    IsSelected BOOLEAN DEFAULT 0,
                    IsVisible BOOLEAN DEFAULT 1,
                    ExternalId TEXT,
                    DeviceId INTEGER,
                    ServiceId INTEGER,
                    CollectorId INTEGER,
                    DeviceName TEXT,
                    Name TEXT NOT NULL,
                    ComponentName TEXT,
                    Category TEXT,
                    Unit TEXT,
                    Value TEXT,
                    SensorTag TEXT,
                    Formula TEXT,
                    LastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    CustomAttribute1 TEXT,
                    CustomAttribute2 TEXT,
                    CustomAttribute3 TEXT,
                    CustomAttribute4 TEXT,
                    CustomAttribute5 TEXT,
                    CustomAttribute6 TEXT,
                    CustomAttribute7 TEXT,
                    CustomAttribute8 TEXT,
                    CustomAttribute9 TEXT,
                    CustomAttribute10 TEXT,
                    FOREIGN KEY(DeviceId) REFERENCES Devices(Id),
                    FOREIGN KEY(JunctionDeviceLinkId) REFERENCES JunctionDeviceLinks(Id),
                    FOREIGN KEY(JunctionCollectorLinkId) REFERENCES JunctionCollectorLinks(Id),
                    FOREIGN KEY(CollectorId) REFERENCES Collectors(Id)
                );
            ");

            // Create JunctionSensors table (cloned sensors for a junction)
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS JunctionSensors (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,     
                    OriginalId INTEGER,                        
                    JunctionId INTEGER,                        
                    JunctionDeviceLinkId INTEGER,
                    JunctionCollectorLinkId INTEGER,  
                    SensorOrder INTEGER,
                    MQTTServiceId INTEGER,
                    MQTTTopic TEXT,
                    MQTTQoS INTEGER,
                    SensorType TEXT,                           
                    IsMissing BOOLEAN DEFAULT 0,               
                    IsStale BOOLEAN DEFAULT 0,                 
                    IsSelected BOOLEAN DEFAULT 0,             
                    IsVisible BOOLEAN DEFAULT 1,              
                    ExternalId TEXT,                           
                    DeviceId INTEGER,
                    ServiceId INTEGER,  
                    CollectorId INTEGER,                     
                    DeviceName TEXT,                  
                    Name TEXT NOT NULL,                     
                    ComponentName TEXT,                  
                    Category TEXT,                      
                    Unit TEXT,                 
                    Value TEXT,                            
                    SensorTag TEXT,                        
                    Formula TEXT,                            
                    LastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP, 
                    CustomAttribute1 TEXT,                  
                    CustomAttribute2 TEXT,                     
                    CustomAttribute3 TEXT,                     
                    CustomAttribute4 TEXT,                     
                    CustomAttribute5 TEXT,                    
                    CustomAttribute6 TEXT,                   
                    CustomAttribute7 TEXT,                 
                    CustomAttribute8 TEXT,                   
                    CustomAttribute9 TEXT,                 
                    CustomAttribute10 TEXT,                                       
                    FOREIGN KEY(DeviceId) REFERENCES Devices(Id),          
                    FOREIGN KEY(JunctionDeviceLinkId) REFERENCES JunctionDeviceLinks(Id),
                    FOREIGN KEY(JunctionCollectorLinkId) REFERENCES JunctionCollectorLinks(Id),
                    FOREIGN KEY(CollectorId) REFERENCES Collectors(Id)       
                );
            ");

            // Create JunctionSensorTargets table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS JunctionSensorTargets (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    JunctionId INTEGER NOT NULL, 
                    SensorId INTEGER NOT NULL,
                    DeviceId INTEGER NOT NULL,
                    ScreenId INTEGER,
                    PositionIndex INTEGER,
                    FOREIGN KEY(JunctionId) REFERENCES Junctions(Id),
                    FOREIGN KEY(SensorId) REFERENCES JunctionSensors(Id),
                    FOREIGN KEY(DeviceId) REFERENCES Devices(Id),
                    FOREIGN KEY(ScreenId) REFERENCES DeviceScreens(Id)
                 );
            ");

            // Create JunctionDeviceLinks table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS JunctionDeviceLinks (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    JunctionId INTEGER NOT NULL,
                    DeviceId INTEGER NOT NULL,
                    Role TEXT NOT NULL,
                    IsSelected BOOLEAN DEFAULT 0,
                    IsTested BOOLEAN DEFAULT 0,
                    WarnOnDuplicate BOOLEAN DEFAULT 0,
                    PollRateOverride INTEGER,
                    LastPolled DATETIME,
                    SendRateOverride INTEGER,
                    LastSent DATETIME,
                    DeclareFailedAfter INTEGER DEFAULT 10000,
                    RetryAttempts INTEGER DEFAULT 3,
                    FieldsToInclude TEXT,
                    FOREIGN KEY(DeviceId) REFERENCES Devices(Id),
                    FOREIGN KEY(JunctionId) REFERENCES Junctions(Id)
                );
            ");

            // Create JunctionCollectorLinks table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS JunctionCollectorLinks (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    JunctionId INTEGER NOT NULL,
                    CollectorId INTEGER NOT NULL,
                    Role TEXT NOT NULL,
                    IsSelected BOOLEAN DEFAULT 0,
                    IsTested BOOLEAN DEFAULT 0,
                    WarnOnDuplicate BOOLEAN DEFAULT 0,
                    PollRateOverride INTEGER,
                    LastPolled DATETIME,
                    SendRateOverride INTEGER,
                    LastSent DATETIME,
                    DeclareFailedAfter INTEGER DEFAULT 10000,
                    RetryAttempts INTEGER DEFAULT 3,
                    FieldsToInclude TEXT,
                    FOREIGN KEY(CollectorId) REFERENCES Collectors(Id),
                    FOREIGN KEY(JunctionId) REFERENCES Junctions(Id)
                );
            ");

            // Create Auth table
            await CreateAuthTablesAsync();

            // Insert protocols if table is empty
            var protocolCount = _db.ExecuteScalar<int>("SELECT COUNT(*) FROM Protocols");
            if (protocolCount == 0)
            {
                _db.Execute(@"
                    INSERT INTO Protocols (Name) VALUES ('USB');
                    INSERT INTO Protocols (Name) VALUES ('HTTP');
                    INSERT INTO Protocols (Name) VALUES ('ESP-NOW');
                ");
                Console.WriteLine("✅ Added 'USB', 'HTTP', and 'ESP-NOW' protocols to the database.");
            }

            // Seed templates
            await layoutTemplates.InitializeLayoutTemplatesAsync();

            // Seed settings
            await SeedInitialSettingsAsync();

        }

        public async Task CreateAuthTablesAsync()
        {
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS AuthUsers (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Username TEXT NOT NULL UNIQUE,
                    PasswordHash TEXT NOT NULL,
                    IsActive BOOLEAN DEFAULT 1,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    LastLoginAt DATETIME,
                    LastLoginIP TEXT
                );
            ");

            Console.WriteLine("✅ AuthUsers table created/verified");
            await Task.CompletedTask; // Make method async-compatible
        }

        public async Task SeedInitialSettingsAsync()
        {
            // Define the default settings
            var defaultSettings = new List<(string Key, string Value, string Description)>
    {
        ("custom_firmware_flashing", "false", "If true, enables uploading custom firmware via OTA. ⚠️ Use at your own risk. This feature is provided as-is with no warranty or guarantee. The developers assume no liability for any damage, malfunction, or data loss resulting from its use"),
        ("combine_cloud_devices", "false", "If true, show a single unified table for local and cloud devices"),
        ("host_charts", "false", "If true, show the demo tab for host charts via React"),
        ("hyperlink_rows", "true", "If true, junction list views will include hyperlinks for navigating to collector/device configuration pages"),
        ("junction_import_export", "false", "If true, enable junction import/export functionality. NOTE: Only works if all other references have the same ID - useful for development only"),
        ("device_actions_alignment", "left", "Controls the alignment of the Actions column in device tables. Valid values: Left, Right"),
        ("junction_actions_alignment", "right", "Controls the alignment of the Actions column in junction tables. Valid values: Left, Right")
    };
            int addedCount = 0;
            // Check and insert each setting individually if it doesn't exist
            foreach (var setting in defaultSettings)
            {
                var exists = _db.ExecuteScalar<int>("SELECT COUNT(*) FROM Settings WHERE Key = @Key",
                                                   new { Key = setting.Key }) > 0;
                if (!exists)
                {
                    await Task.Yield(); // Add this line to make the method truly async
                    _db.Execute(@"
                INSERT INTO Settings (Key, Value, Description) 
                VALUES (@Key, @Value, @Description)",
                        new
                        {
                            Key = setting.Key,
                            Value = setting.Value,
                            Description = setting.Description
                        });
                    addedCount++;
                }
            }
            if (addedCount > 0)
            {
                Console.WriteLine($"✅ Added {addedCount} missing settings to the database.");
            }
        }
    }
}