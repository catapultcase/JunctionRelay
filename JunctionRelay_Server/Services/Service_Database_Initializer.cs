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
        private readonly Service_Database_Manager_FrameEngine _frameEngineManager;

        public Service_Database_Initializer(IDbConnection db,
                                             Service_HostInfo hostInfo,
                                             Service_Database_Manager_Devices deviceDbManager,
                                             Service_Database_Manager_Sensors sensorDbManager,
                                             Service_Layout_Templates layoutTemplates,
                                             Service_Database_Manager_FrameEngine frameEngineManager)
        {
            _db = db;
            _hostInfo = hostInfo;
            _deviceDbManager = deviceDbManager;
            _sensorDbManager = sensorDbManager;
            this.layoutTemplates = layoutTemplates;
            _frameEngineManager = frameEngineManager;
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
                    LastEncryptedSensorData TEXT,
                    LastHealthReportAt DATETIME,
                    CreatedAt DATETIME,
                    LastHealthAlertSent DATETIME,
                    LastHealthReminderSent DATETIME,
                    PushNotifications BOOLEAN DEFAULT 0,
                    SyncMode TEXT DEFAULT 'Health',
                    ConnMode TEXT,
                    COMPort TEXT,
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
                    -- Stream heartbeat configuration
                    UseStreamAsHeartbeat BOOLEAN DEFAULT 1,
                    StreamHeartbeatThresholdMs INTEGER DEFAULT 3000,
                    -- Connection Status Configuration
                    ConnectionStatusEnabled BOOLEAN DEFAULT 1,
                    ConnectionStatusIntervalMs INTEGER DEFAULT 300000,
                    LastConnectionStatusCheck DATETIME,
                    -- Heartbeat Status
                    LastPingAttempt DATETIME,
                    LastPinged DATETIME,
                    LastPingStatus TEXT,
                    LastPingDurationMs INTEGER,
                    ConsecutivePingFailures INTEGER DEFAULT 0,
                    ConfigLastAppliedAt DATETIME,
                    SensorPayloadLastAckAt DATETIME,
                    -- SSH Configuration
                    SshUsername TEXT,
                    SshPassword TEXT,  -- Should be encrypted/hashed in your service layer
                    ExternalSshPassword BOOLEAN DEFAULT 0,
                    SshPort INTEGER DEFAULT 22,
                    SshTimeoutMs INTEGER DEFAULT 10000,
                    SshPrivateKey TEXT,  -- Should be encrypted in your service layer
                    ExternalSshPrivateKey BOOLEAN DEFAULT 0,
                    UseSshKeyAuth BOOLEAN DEFAULT 0,  -- 0 = password auth, 1 = key auth
                    SshConnectionRetries INTEGER DEFAULT 3,
                    SshVerifyHostKey BOOLEAN DEFAULT 1,
                    -- Capabilities
                    HasOnboardScreen BOOLEAN DEFAULT 0,
                    HasOnboardLED BOOLEAN DEFAULT 0,
                    HasOnboardRGBLED BOOLEAN DEFAULT 0,
                    HasExternalNeopixels BOOLEAN DEFAULT 0,                    
                    HasExternalMatrix BOOLEAN DEFAULT 0,
                    HasExternalI2CDevices BOOLEAN DEFAULT 0,
                    HasButtons BOOLEAN DEFAULT 0,
                    HasBattery BOOLEAN DEFAULT 0,
                    SupportsEthernet BOOLEAN DEFAULT 0,                    
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
                        COMPort TEXT,
                        ServiceModel TEXT,
                        ServiceManufacturer TEXT,
                        FirmwareVersion TEXT,
                        CustomFirmware BOOLEAN DEFAULT 0,
                        IgnoreUpdates BOOLEAN DEFAULT 0,
                        MCU TEXT,
                        WirelessConnectivity TEXT,
                        URL TEXT,
                        PollRate INTEGER DEFAULT 5000,
                        SendRate INTEGER DEFAULT 5000,
                        LastPolled DATETIME DEFAULT CURRENT_TIMESTAMP,
                        IsGateway BOOLEAN DEFAULT 0,
                        GatewayId INTEGER,
                        IsJunctionRelayService BOOLEAN DEFAULT 0,
                        LastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
                        AccessToken TEXT,
                        ExternalAccessToken BOOLEAN DEFAULT 0,
                        HomeAssistantAddress TEXT,
                        HomeAssistantUsername TEXT,
                        HomeAssistantSharedJunctions TEXT,
                        GrafanaSharedMetrics, TEXT,
                        MQTTBrokerAddress TEXT,
                        MQTTBrokerPort TEXT,
                        MQTTUsername TEXT,
                        FOREIGN KEY(GatewayId) REFERENCES Services(Id)
                   );
                ");

            //// Add missing columns to Services table
            //var columnsToAdd = new[]
            //{
            //    ("HomeAssistantSharedJunctions", "TEXT"),
            //    ("GrafanaSharedMetrics", "TEXT")
            //};

            //foreach (var (columnName, columnType) in columnsToAdd)
            //{
            //    try
            //    {
            //        var columnExists = _db.ExecuteScalar<int>(@"
            //        SELECT COUNT(*) 
            //        FROM pragma_table_info('Services') 
            //        WHERE name = @columnName", new { columnName }) > 0;

            //        if (!columnExists)
            //        {
            //            _db.Execute($"ALTER TABLE Services ADD COLUMN {columnName} {columnType};");
            //            Console.WriteLine($"✅ Added {columnName} column to Services table");
            //        }
            //    }
            //    catch (Exception ex)
            //    {
            //        Console.WriteLine($"⚠️ Failed to add {columnName} column: {ex.Message}");
            //    }
            //}

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
                    FrameLayoutId INTEGER,
                    SupportsConfigPayloads BOOLEAN DEFAULT 1,
                    SupportsSensorPayloads BOOLEAN DEFAULT 1,
                    UseKeepAlive BOOLEAN DEFAULT 0,
                    UNIQUE(DeviceId, ScreenKey),
                    FOREIGN KEY(DeviceId) REFERENCES Devices(Id),
                    FOREIGN KEY(ScreenLayoutId) REFERENCES ScreenLayouts(Id)
                    FOREIGN KEY(FrameLayoutId) REFERENCES FrameLayouts(Id)
                );
            ");

            // Create JunctionScreenLayouts table
            _db.Execute(@"
               CREATE TABLE IF NOT EXISTS JunctionScreenLayouts (
                   Id INTEGER PRIMARY KEY AUTOINCREMENT,
                   JunctionId INTEGER NOT NULL,
                   JunctionDeviceLinkId INTEGER NOT NULL,
                   DeviceScreenId INTEGER NOT NULL,
                   ScreenLayoutId INTEGER,
                   FrameLayoutId INTEGER,
                   TargetPollRate INTEGER,
                   LastRequested DATETIME,
                   OnlySendIfChanged INTEGER DEFAULT 1,
                   EnableUrlAccess INTEGER DEFAULT 0,
                   UrlPath TEXT,
                   FOREIGN KEY(JunctionDeviceLinkId) REFERENCES JunctionDeviceLinks(Id) ON DELETE CASCADE,
                   FOREIGN KEY(ScreenLayoutId) REFERENCES ScreenLayouts(Id),
                   FOREIGN KEY(FrameLayoutId) REFERENCES FrameLayouts(Id)
               );
            ");

            // Create Notifications table
            _db.Execute(@"
                    CREATE TABLE IF NOT EXISTS Notifications (
                        Id TEXT PRIMARY KEY,
                        Type TEXT NOT NULL DEFAULT 'info' CHECK(Type IN ('success', 'error', 'warning', 'info')),
                        Message TEXT NOT NULL,
                        Title TEXT,
                        Category TEXT NOT NULL DEFAULT 'system' CHECK(Category IN ('api', 'auth', 'cloud', 'system')),
                        Duration INTEGER,
                        Persistent BOOLEAN NOT NULL DEFAULT 0,
                        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        IsDelivered BOOLEAN NOT NULL DEFAULT 0,
                        DeliveredAt DATETIME,
                        ExpiresAt, DATETIME,
                        StructuredContent, TEXT
                    );
                ");

            // Create indexes for Notifications table
            _db.Execute(@"
                    CREATE INDEX IF NOT EXISTS idx_notifications_pending ON Notifications(IsDelivered, CreatedAt);
                ");

                            _db.Execute(@"
                    CREATE INDEX IF NOT EXISTS idx_notifications_category ON Notifications(Category);
                ");

                            _db.Execute(@"
                    CREATE INDEX IF NOT EXISTS idx_notifications_created ON Notifications(CreatedAt);
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
                    FieldsToSend TEXT,
        
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

            // Create FrameLayouts table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS FrameLayouts (
                    -- Core Properties
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    DisplayName NVARCHAR(100) NOT NULL,
                    Description NVARCHAR(500),
                    LayoutType NVARCHAR(50) NOT NULL,
    
                    -- Status and Metadata
                    IsTemplate BOOLEAN NOT NULL DEFAULT 0,
                    IsDraft BOOLEAN NOT NULL DEFAULT 1,
                    IsPublished BOOLEAN NOT NULL DEFAULT 0,
                    Created DATETIME NOT NULL,
                    LastModified DATETIME,
                    CreatedBy NVARCHAR(100),
                    Version NVARCHAR(20),
    
                    -- Background Configuration
                    BackgroundType NVARCHAR(20),
                    BackgroundColor NVARCHAR(20),
                    BackgroundImageUrl NVARCHAR(500),
                    BackgroundImageData TEXT,
                    BackgroundOpacity REAL,
    
                    -- Frame Dimensions and Orientation
                    Width INTEGER,
                    Height INTEGER,
                    Orientation NVARCHAR(20),
    
                    -- Rive Configuration
                    RiveFile NVARCHAR(500),
    
                    -- Thumbnail Configuration (NEW FIELDS)
                    ThumbnailPath NVARCHAR(255),
                    ThumbnailGeneratedAt DATETIME,
                    HasThumbnail BOOLEAN NOT NULL DEFAULT 0,
                    ThumbnailFormat NVARCHAR(10) DEFAULT 'png',
                    ThumbnailOverride BOOLEAN NOT NULL DEFAULT 0,
    
                    -- Frame Configuration (JSON)
                    JsonFrameConfig TEXT,
                    JsonFrameElements TEXT,
                    FieldsToSend TEXT
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

            // Create Collectors table
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS Collectors (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL UNIQUE,
                    CollectorType TEXT NOT NULL,
                    Description TEXT,
                    Status TEXT DEFAULT 'Offline',
                    URL TEXT,
                    AccessToken TEXT,
                    ExternalAccessToken BOOLEAN DEFAULT 0,
                    PollRate INTEGER DEFAULT 5000,
                    SendRate INTEGER DEFAULT 5000,
                    ServiceId INTEGER,
                    DecimalPlaces INTEGER DEFAULT 1
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
                    GatewayDeviceId          INTEGER,
                    GatewayDestination       TEXT,
                    RenderingMode            TEXT,
                    DestinationOverride      TEXT,
                    BaudRate                 INTEGER,   
                    AllTargetsAllData        BOOLEAN NOT NULL DEFAULT 0,
                    AllTargetsAllScreens     BOOLEAN NOT NULL DEFAULT 0,
                    CompressPayload          BOOLEAN NOT NULL DEFAULT 0,
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
                    DecimalPlaces INTEGER DEFAULT 1,
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
                    DecimalPlaces INTEGER DEFAULT 1,
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
                    FOREIGN KEY(CollectorId) REFERENCES Collectors(Id),
                    FOREIGN KEY(JunctionId) REFERENCES Junctions(Id)
                );
            ");
           
            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS StreamHistoryConfiguration (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    RetentionHours REAL NOT NULL DEFAULT 24,
                    MaxEntriesPerStream INTEGER NOT NULL DEFAULT 10000,
                    LoggingEnabled BOOLEAN NOT NULL DEFAULT 1,                    
                    CleanupIntervalMinutes INTEGER NOT NULL DEFAULT 15,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");


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

            _db.Execute(@"
                CREATE TABLE IF NOT EXISTS CloudSessions (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    UserId TEXT NOT NULL,
                    BackendId TEXT NOT NULL,
                    EncryptedRefreshToken TEXT NOT NULL,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(UserId, BackendId)
                );
            ");

            // Seed screen layout templates
            var existingScreenTemplates = _db.ExecuteScalar<int>("SELECT COUNT(*) FROM ScreenLayouts WHERE IsTemplate = 1");
            if (existingScreenTemplates == 0)
            {
                await layoutTemplates.InitializeLayoutTemplatesAsync();
                Console.WriteLine("✅ Initialized screen layout templates");
            }
            else
            {
                Console.WriteLine($"ℹ️ Skipped screen layout template initialization - {existingScreenTemplates} templates already exist");
            }

            // Seed frame layout templates (NEW)
            var existingFrameTemplates = _db.ExecuteScalar<int>("SELECT COUNT(*) FROM FrameLayouts WHERE IsTemplate = 1");
            if (existingFrameTemplates == 0)
            {
                var templatesCreated = await _frameEngineManager.RestoreDefaultTemplatesAsync();
                if (templatesCreated)
                {
                    Console.WriteLine("✅ Initialized frame layout templates");
                }
                else
                {
                    Console.WriteLine("ℹ️ No frame layout templates were created");
                }
            }
            else
            {
                Console.WriteLine($"ℹ️ Skipped frame layout template initialization - {existingFrameTemplates} templates already exist");
            }

            // Alter tables if needed
            await ApplySchemaUpdatesAsync();

            // Seed settings
            await SeedInitialSettingsAsync();

        }

        public async Task SeedInitialSettingsAsync()
        {
            // Define the default settings
            var defaultSettings = new List<(string Key, string Value, string Description)>
{
                ("device_actions_alignment", "left", "Controls the alignment of the Actions column in device tables"),
                ("device_combine_cloud_devices", "false", "If true, show a single unified table for local and cloud devices"),
                ("device_custom_firmware_flashing", "false", "If true, enables uploading custom firmware via OTA. ⚠️ Use at your own risk. This feature is provided as-is with no warranty or guarantee. The developers assume no liability for any damage, malfunction, or data loss resulting from its use"),
                ("junction_actions_alignment", "right", "Controls the alignment of the Actions column in the Junction tables"),
                ("junction_autostart_enabled", "true", "Master toggle for the junction autostart service. If false, no junctions will auto-start regardless of their individual AutoStartOnLaunch setting"),
                ("junction_autostart_parallel", "false", "If true, auto-start junctions will be started in parallel during system startup. If false, they will be started sequentially with delays between each start"),
                ("junction_hyperlink_rows", "false", "If true, The Junction list views will embed hyperlinks for navigating to collector/devices"),
                ("junction_import_export", "false", "If true, enable junction import/export functionality. NOTE: This feature only works if all other references have the same ID - useful for development only"),
                ("mobile_navigation_on_desktop", "false", "If true, use the mobile navbar even on the desktop experience"),
                ("mobile_show_back_button", "false", "If true, the first action on the mobile action bar will be a 'back' navigation button"),
                ("mobile_show_navigation_row", "false", "If true, add a navigation bar to the bottom of the mobile experience"),
                ("top_bar_show_current_version", "true", "If true, the current app version will be displayed in the navbar"),
                ("top_bar_show_host_charts", "false", "If true, show the tab for host charts"),
                // Notification system settings
                ("notifications_enabled", "true", "Master toggle for the notification system"),
                ("notifications_api_calls", "true", "Show notifications for API success/error events"),
                ("notifications_auth_events", "true", "Show notifications for authentication events (login, logout, etc.)"),
                ("notifications_cloud_sync", "true", "Show notifications for cloud synchronization events"),
                ("notifications_system", "true", "Show notifications for system events (theme changes, updates, etc.)"),
                ("notifications_backend_polling", "true", "Enable polling the backend for server-generated notifications"),
                ("notifications_polling_interval", "15000", "How often to poll for backend notifications (milliseconds)"),
                ("notifications_duration_success", "6000", "How long success notifications stay visible (milliseconds)"),
                ("notifications_duration_error", "8000", "How long error notifications stay visible (milliseconds)"),
                ("notifications_max_concurrent", "5", "Maximum number of notifications to show at once"),
                // Service control settings
                ("service_heartbeats_enabled", "true", "Master toggle for the heartbeat monitoring service"),
                ("service_connection_status_enabled", "true", "Master toggle for the connection status monitoring service"),
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

        // Add this method to your Service_Database_Initializer class

        private async Task ApplySchemaUpdatesAsync()
        {
            Console.WriteLine("[DATABASE] 🔄 Checking for schema updates...");
            // Define all schema updates in one place
            var schemaUpdates = new Dictionary<string, (string columnName, string columnType)[]>
            {
                // Services table updates
                ["Services"] = new (string, string)[]
                {
                    //("HomeAssistantSharedJunctions", "TEXT"),
                    //("GrafanaSharedMetrics", "TEXT")
                },
                // Notifications table updates
                ["Notifications"] = new (string, string)[]
                {
                    //("ExpiresAt", "DATETIME"), // Add expiration support
                    //("StructuredContent", "TEXT") // Add multi-line notification support
                },
                // Devices table updates (if you need any in the future)
                ["Devices"] = new (string, string)[]
                {
                    // Add future device columns here when needed
                    // ("NewColumn", "TEXT"),
                },
                // FrameLayouts table updates
                ["FrameLayouts"] = new (string, string)[]
                {
                //("FieldsToSend", "TEXT")
                //("ThumbnailOverride", "BOOLEAN")
                },
                // ScreenLayouts table updates
                ["ScreenLayouts"] = new (string, string)[]
                {
                //  ("FieldsToSend", "TEXT")
                },
                // Add other tables as needed
                // ["OtherTable"] = new (string, string)[]
                // {
                //     ("ColumnName", "DATATYPE"),
                // }
            };
            int totalUpdatesApplied = 0;
            foreach (var (tableName, columnsToAdd) in schemaUpdates)
            {
                if (columnsToAdd.Length == 0) continue; // Skip empty arrays
                Console.WriteLine($"[DATABASE] 🔍 Checking {tableName} table for missing columns...");
                foreach (var (columnName, columnType) in columnsToAdd)
                {
                    try
                    {
                        var columnExists = _db.ExecuteScalar<int>(@"
            SELECT COUNT(*) 
            FROM pragma_table_info(@tableName) 
            WHERE name = @columnName",
                            new { tableName, columnName }) > 0;
                        if (!columnExists)
                        {
                            _db.Execute($"ALTER TABLE {tableName} ADD COLUMN {columnName} {columnType};");
                            Console.WriteLine($"✅ Added {columnName} column to {tableName} table");
                            totalUpdatesApplied++;
                        }
                        else
                        {
                            Console.WriteLine($"ℹ️ Column {columnName} already exists in {tableName} table");
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"⚠️ Failed to add {columnName} column to {tableName} table: {ex.Message}");
                    }
                }
            }
            // Also handle index creation here if needed
            await CreateMissingIndexesAsync();
            if (totalUpdatesApplied > 0)
            {
                Console.WriteLine($"[DATABASE] ✅ Applied {totalUpdatesApplied} schema update(s) successfully");
            }
            else
            {
                Console.WriteLine("[DATABASE] ℹ️ No schema updates needed - database is up to date");
            }
        }

        private async Task CreateMissingIndexesAsync()
        {
            // Define indexes that should exist
            var indexesToCreate = new (string indexName, string tableName, string columns)[]
            {
        // Notifications table indexes
        ("idx_notifications_expires_at", "Notifications", "ExpiresAt"),
        ("idx_notifications_pending_with_expiry", "Notifications", "IsDelivered, ExpiresAt, CreatedAt"),

        // JunctionScreenLayouts unique constraint
        ("idx_junction_screen_unique", "JunctionScreenLayouts", "JunctionId, DeviceScreenId"),
            };

            foreach (var (indexName, tableName, columns) in indexesToCreate)
            {
                try
                {
                    // Check if index exists
                    var indexExists = _db.ExecuteScalar<int>(@"
                SELECT COUNT(*) 
                FROM sqlite_master 
                WHERE type = 'index' AND name = @indexName",
                        new { indexName }) > 0;

                    if (!indexExists)
                    {
                        // For the unique constraint, use UNIQUE
                        string createStatement = indexName == "idx_junction_screen_unique"
                            ? $"CREATE UNIQUE INDEX IF NOT EXISTS {indexName} ON {tableName}({columns});"
                            : $"CREATE INDEX IF NOT EXISTS {indexName} ON {tableName}({columns});";

                        _db.Execute(createStatement);
                        Console.WriteLine($"✅ Created index {indexName} on {tableName}({columns})");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"⚠️ Failed to create index {indexName}: {ex.Message}");
                }
            }
        }
    }
}