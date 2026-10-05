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
using System.Text.Json;
using JunctionRelayServer.Models;
using static Dapper.SqlMapper;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Initializer
    {
        private readonly IDbConnection _db;
        private readonly Service_HostInfo _hostInfo;
        private readonly Service_Database_Manager_Devices _deviceDbManager;
        private readonly Service_Database_Manager_Sensors _sensorDbManager;
        private readonly Service_Manager_BuiltInPayloads layoutTemplates;
        private readonly Service_Database_Manager_FrameEngine _frameEngineManager;
        private readonly Service_Database_Manager_TransitionRules _transitionRulesManager;

        public Service_Database_Initializer(IDbConnection db,
                                             Service_HostInfo hostInfo,
                                             Service_Database_Manager_Devices deviceDbManager,
                                             Service_Database_Manager_Sensors sensorDbManager,
                                             Service_Manager_BuiltInPayloads layoutTemplates,
                                             Service_Database_Manager_FrameEngine frameEngineManager,
                                             Service_Database_Manager_TransitionRules transitionRulesManager)
        {
            _db = db;
            _hostInfo = hostInfo;
            _deviceDbManager = deviceDbManager;
            _sensorDbManager = sensorDbManager;
            this.layoutTemplates = layoutTemplates;
            _frameEngineManager = frameEngineManager;
            _transitionRulesManager = transitionRulesManager;
        }

        public async Task InitializeAsync()
        {
            _db.Open();

            // STEP 1: Create every table, and add to existing ones any column their CREATE TABLE gained since (Service_Database_Schema)
            await CreateTablesAsync();

            // STEP 2: Seed screen layout templates
            var existingScreenTemplates = _db.ExecuteScalar<int>("SELECT COUNT(*) FROM ScreenLayouts WHERE IsTemplate = 1");
            if (existingScreenTemplates == 0)
            {
                await layoutTemplates.InitializeLayoutTemplatesAsync();
                Console.WriteLine("[DATABASE] Initialized screen layout templates");
            }
            else
            {
                Console.WriteLine($"[DATABASE] Skipped screen layout template initialization - {existingScreenTemplates} templates already exist");
            }

            // STEP 3: Seed frame layout templates
            var existingFrameTemplates = _db.ExecuteScalar<int>("SELECT COUNT(*) FROM FrameLayouts WHERE IsTemplate = 1");
            if (existingFrameTemplates == 0)
            {
                var templatesCreated = await _frameEngineManager.RestoreDefaultTemplatesAsync();
                if (templatesCreated)
                {
                    Console.WriteLine("[DATABASE] Initialized frame layout templates");
                }
                else
                {
                    Console.WriteLine("[DATABASE] No frame layout templates were created");
                }
            }
            else
            {
                Console.WriteLine($"[DATABASE] Skipped frame layout template initialization - {existingFrameTemplates} templates already exist");
            }

            // STEP 4: Seed settings
            await SeedInitialSettingsAsync();

            // STEP 5: Seed default transition rules
            await SeedDefaultTransitionRulesAsync();
        }

        private async Task CreateTablesAsync()
        {
            // Create Settings Table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Settings (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Key TEXT NOT NULL,
                    Value TEXT NOT NULL,
                    Description TEXT
                );
            ");

            // Create Devices Table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
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
                    SshPassword TEXT,
                    ExternalSshPassword BOOLEAN DEFAULT 0,
                    SshPort INTEGER DEFAULT 22,
                    SshTimeoutMs INTEGER DEFAULT 10000,
                    SshPrivateKey TEXT,
                    ExternalSshPrivateKey BOOLEAN DEFAULT 0,
                    UseSshKeyAuth BOOLEAN DEFAULT 0,
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
                    HttpPort INTEGER,
                    WebSocketPort INTEGER,
                    MqttPort INTEGER,
                    Hostname TEXT,
                    IsXSD BOOLEAN DEFAULT 0,
                    LinkedCollectorId INTEGER,
                    FOREIGN KEY(GatewayId) REFERENCES Devices(Id)
                );
            ");

            // Create Services table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
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
                    HomeAssistantSharedJunctions TEXT,
                    GrafanaSharedMetrics TEXT,
                    MQTTBrokerAddress TEXT,
                    MQTTBrokerPort TEXT,
                    MQTTUsername TEXT,
                    FOREIGN KEY(GatewayId) REFERENCES Services(Id)
                );
            ");

            // Create MqttSubscriptions table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS MqttSubscriptions (
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
            Service_Database_Schema.CreateOrAmendTable(_db, @"
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
                    SupportsStopPayloads BOOLEAN NOT NULL DEFAULT 0,
                    LayoutPath TEXT,
                    UNIQUE(DeviceId, ScreenKey),
                    FOREIGN KEY(DeviceId) REFERENCES Devices(Id),
                    FOREIGN KEY(ScreenLayoutId) REFERENCES ScreenLayouts(Id),
                    FOREIGN KEY(FrameLayoutId) REFERENCES FrameLayouts(Id)
                );
            ");

            // Create JunctionScreenLayouts table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
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
                    StreamingFps INTEGER,
                    StreamingJpegQuality INTEGER,
                    LayoutPath TEXT,
                    FOREIGN KEY(JunctionDeviceLinkId) REFERENCES JunctionDeviceLinks(Id) ON DELETE CASCADE,
                    FOREIGN KEY(ScreenLayoutId) REFERENCES ScreenLayouts(Id),
                    FOREIGN KEY(FrameLayoutId) REFERENCES FrameLayouts(Id)
                );
            ");

            // Notifications table removed - now using WebSocket-only push notifications with in-memory cache

            // Create NotificationSettings table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS NotificationSettings (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Category TEXT NOT NULL UNIQUE,
                    Enabled BOOLEAN NOT NULL DEFAULT 1,
                    DefaultDurationMs INTEGER NOT NULL DEFAULT 6000,
                    Description TEXT
                );
            ");

            // Create DeviceI2CDevices table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
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
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS DeviceI2CDeviceEndpoints (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    I2CDeviceId INTEGER NOT NULL,
                    EndpointType TEXT NOT NULL,
                    Address TEXT NOT NULL,
                    QoS INTEGER DEFAULT 0,
                    Notes TEXT,
                    FOREIGN KEY(I2CDeviceId) REFERENCES DeviceI2CDevices(Id)
                );
            ");

            // Create ScreenLayouts table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
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
                    MaxHeight INTEGER        
                );
            ");

            // Create FrameLayouts table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
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
                    BackgroundImageFit NVARCHAR(20) DEFAULT 'cover',
                    BackgroundOpacity REAL,

                    -- Video Background Configuration
                    BackgroundVideoUrl NVARCHAR(500),
                    BackgroundVideoFit NVARCHAR(20) DEFAULT 'cover',
                    VideoLoop BOOLEAN DEFAULT 1,
                    VideoMuted BOOLEAN DEFAULT 1,
                    VideoAutoplay BOOLEAN DEFAULT 1,

                    -- Frame Dimensions and Orientation
                    Width INTEGER,
                    Height INTEGER,
                    Orientation NVARCHAR(20),

                    -- Rive Configuration
                    RiveFile NVARCHAR(500),

                    -- Thumbnail Configuration
                    ThumbnailPath NVARCHAR(255),
                    ThumbnailGeneratedAt DATETIME,
                    HasThumbnail BOOLEAN NOT NULL DEFAULT 0,
                    ThumbnailFormat NVARCHAR(10) DEFAULT 'png',
                    ThumbnailOverride BOOLEAN NOT NULL DEFAULT 0,

                    -- Frame Configuration (JSON)
                    JsonFrameConfig TEXT,
                    JsonFrameConfigRuntime TEXT,
                    JsonFrameElements TEXT,
                    FieldsToSend TEXT,
                    CloudTemplateId TEXT NOT NULL,
                    CloudVariantId TEXT NOT NULL,
                    IsStandalone INTEGER DEFAULT 0,
                    BackgroundLoopCompensation BOOLEAN,
                    BackgroundLoopCutoverMs INTEGER,
                    BackgroundLoopCrossfadeMs INTEGER,
                    LastCloudSnapshotAt TEXT,
                    LastCloudSnapshotId TEXT
                );
            ");

            // Create LayoutSubscriptions table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS LayoutSubscriptions (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ServerUrl TEXT NOT NULL,
                    ServerPort TEXT NOT NULL DEFAULT '0',
                    ServerName TEXT,
                    RemoteLayoutId TEXT NOT NULL,
                    RemoteLayoutName TEXT NOT NULL,
                    RemoteVariantId TEXT,
                    LocalFilePath TEXT NOT NULL,
                    LocalFileName TEXT NOT NULL,
                    LastDownloadedAt TEXT,
                    RemoteLastModified TEXT,
                    SubscribedAt TEXT NOT NULL,
                    IsActive INTEGER NOT NULL DEFAULT 1,
                    AutoUpdate INTEGER NOT NULL DEFAULT 1,
                    IsTemplate INTEGER NOT NULL DEFAULT 0,
                    Source TEXT NOT NULL DEFAULT 'manual',
                    HasThumbnail INTEGER NOT NULL DEFAULT 0,
                    ThumbnailPath TEXT,
                    ThumbnailFormat TEXT,
                    AuthorName TEXT,
                    AuthorUrl TEXT,
                    AuthorId TEXT,
                    AuthorAvatarUrl TEXT,
                    UNIQUE(ServerUrl, ServerPort, RemoteLayoutId)
                );
            ");

            // Create EventRules table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS EventRules (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Description TEXT,
                    Enabled INTEGER DEFAULT 1,
        
                    -- Trigger Logic Configuration
                    TriggerLogic TEXT DEFAULT 'ANY',
        
                    -- Metadata
                    LastTriggered DATETIME,
                    TriggerCount INTEGER DEFAULT 0,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");

            // Create EventTriggers table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS EventTriggers (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    EventRuleId INTEGER NOT NULL,
                    TriggerOrder INTEGER DEFAULT 0,
                    IsActive BOOLEAN DEFAULT 1,
        
                    -- Trigger Configuration
                    TriggerType TEXT NOT NULL DEFAULT 'Sensor',
                    TriggerSensorId INTEGER,
                    TriggerCondition TEXT,
                    TriggerValue TEXT,
                    TriggerDebounceMs INTEGER DEFAULT 0,
        
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        
                    FOREIGN KEY (EventRuleId) REFERENCES EventRules(Id) ON DELETE CASCADE,
                    FOREIGN KEY (TriggerSensorId) REFERENCES Sensors(Id) ON DELETE CASCADE
                );
            ");

            // Create EventActions table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS EventActions (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    EventRuleId INTEGER NOT NULL,
                    ActionOrder INTEGER DEFAULT 0,
                    IsActive BOOLEAN DEFAULT 1,
                    DelayBeforeNextMs INTEGER DEFAULT 0,
        
                    -- Action Configuration
                    ActionType TEXT NOT NULL,
                    ActionTargetSensorId INTEGER,
                    ActionStaticValue TEXT,
                    ActionTransform TEXT,
                    ActionJunctionId INTEGER,
                    ActionMqttTopic TEXT,
                    ActionMqttPayload TEXT,
                    ActionMqttServiceId INTEGER,
                    ActionHttpUrl TEXT,
                    ActionHttpMethod TEXT DEFAULT 'POST',
                    ActionHttpPayload TEXT,
        
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        
                    FOREIGN KEY(EventRuleId) REFERENCES EventRules(Id) ON DELETE CASCADE,
                    FOREIGN KEY(ActionTargetSensorId) REFERENCES Sensors(Id) ON DELETE CASCADE,
                    FOREIGN KEY(ActionJunctionId) REFERENCES Junctions(Id) ON DELETE CASCADE,
                    FOREIGN KEY(ActionMqttServiceId) REFERENCES Services(Id) ON DELETE SET NULL
                );
            ");

            // EventTriggers indexes
            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_eventtriggers_rule ON EventTriggers(EventRuleId);
            ");

            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_eventtriggers_sensor ON EventTriggers(TriggerSensorId);
            ");

            // EventActions indexes
            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_eventactions_rule ON EventActions(EventRuleId);
            ");

            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_eventactions_sensor ON EventActions(ActionTargetSensorId);
            ");

            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_eventactions_junction ON EventActions(ActionJunctionId);
            ");

            // EventRules index
            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_eventrules_enabled ON EventRules(Enabled);
            ");

            // Create TransitionRules table (global transition rules for XSD Mode 3)
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS TransitionRules (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT,
                    Enabled INTEGER DEFAULT 1,
                    Priority INTEGER DEFAULT 100,
                    SortOrder INTEGER NOT NULL,
                    TriggerEvent TEXT NOT NULL,
                    NewLayout TEXT NOT NULL,
                    TransitionEffect TEXT NOT NULL,
                    TransitionDuration INTEGER NOT NULL,
                    TransitionLayoutPath TEXT,
                    TransitionLayoutInEffect TEXT,
                    TransitionLayoutFadeIn INTEGER,
                    TransitionLayoutHold INTEGER,
                    TransitionLayoutOutEffect TEXT,
                    TransitionLayoutFadeOut INTEGER,
                    ExistingLayoutExtend INTEGER DEFAULT 0,
                    NewLayoutExtend INTEGER DEFAULT 0,
                    ExistingLayoutFadeDuration INTEGER,
                    NewLayoutFadeDuration INTEGER,
                    NewLayoutHold INTEGER DEFAULT 2000,
                    PreviewTransitionTransparency INTEGER DEFAULT 1,
                    TimelineJson TEXT,
                    SensorLogic TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");

            // Create TransitionRuleSensorConditions table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS TransitionRuleSensorConditions (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    RuleId INTEGER NOT NULL,
                    SensorTag TEXT NOT NULL,
                    Condition TEXT NOT NULL,
                    Value TEXT,
                    FOREIGN KEY (RuleId) REFERENCES TransitionRules(Id) ON DELETE CASCADE
                );
            ");

            // Create TransitionRuleDynamicOverrides table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS TransitionRuleDynamicOverrides (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    RuleId INTEGER NOT NULL,
                    SensorTag TEXT NOT NULL,
                    OverrideEnabled INTEGER DEFAULT 0,
                    Value TEXT,
                    SourceSensorTag TEXT,
                    CustomSourceSensorTag TEXT,
                    FOREIGN KEY (RuleId) REFERENCES TransitionRules(Id) ON DELETE CASCADE,
                    UNIQUE(RuleId, SensorTag)
                );
            ");

            // TransitionRules indexes
            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_transitionrules_enabled ON TransitionRules(Enabled);
            ");

            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_transitionruleconditions_rule ON TransitionRuleSensorConditions(RuleId);
            ");

            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_transitionruleoverrides_rule ON TransitionRuleDynamicOverrides(RuleId);
            ");

            // ============================================================
            // Lab module tables (HOMELAB) — Lab_ prefix, no FKs from core
            // tables into Lab; links from Lab to core are nullable soft refs.
            // ============================================================

            // Create Lab_Machines table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_Machines (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Hostname TEXT,
                    Kind TEXT,
                    Role TEXT,
                    Status TEXT NOT NULL DEFAULT 'active',
                    OS TEXT,
                    IPAddress TEXT,
                    Location TEXT,
                    AlwaysOn BOOLEAN NOT NULL DEFAULT 0,
                    LinkedDeviceId INTEGER,
                    Notes TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    Sentiment TEXT
                );
            ");

            // Create Lab_Components table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_Components (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Type TEXT NOT NULL,
                    Name TEXT,
                    Manufacturer TEXT,
                    Model TEXT,
                    Nickname TEXT,
                    SerialNumber TEXT,
                    Sku TEXT,
                    Spec TEXT,
                    SpecJson TEXT,
                    Status TEXT NOT NULL DEFAULT 'active',
                    CurrentMachineId INTEGER,
                    ParentComponentId INTEGER,
                    ReleaseDate TEXT,
                    Msrp REAL,
                    ListPrice REAL,
                    ListPriceDate TEXT,
                    ListPriceNotes TEXT,
                    PurchasePrice REAL,
                    AcquiredAt DATETIME,
                    Source TEXT,
                    Vendor TEXT,
                    WarrantyYears INTEGER,
                    Notes TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (CurrentMachineId) REFERENCES Lab_Machines(Id)
                );
            ");

            // Create Lab_ComponentMovements table (append-only ledger)
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_ComponentMovements (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ComponentId INTEGER NOT NULL,
                    FromMachineId INTEGER,
                    ToMachineId INTEGER,
                    SlotLabel TEXT,
                    MovedAt DATETIME NOT NULL,
                    Reason TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (ComponentId) REFERENCES Lab_Components(Id),
                    FOREIGN KEY (FromMachineId) REFERENCES Lab_Machines(Id),
                    FOREIGN KEY (ToMachineId) REFERENCES Lab_Machines(Id)
                );
            ");

            // Create Lab_ComponentTypes table — the component vocabulary, user-managed.
            //
            // 🔑 Lab_Components.Type stays a plain TEXT column with NO foreign key here. A type
            // is a vocabulary, not a constraint: retiring "Printer" must not orphan or hide the
            // printer, and adding a type must never require touching component rows. This table
            // drives pickers, section order and typed fields only.
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_ComponentTypes (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL UNIQUE,
                    Label TEXT,
                    SortOrder INTEGER NOT NULL DEFAULT 0,
                    Status TEXT NOT NULL DEFAULT 'active',
                    Icon TEXT,
                    Notes TEXT,
                    FieldsJson TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");

            SeedLabComponentTypes();

            // Create Lab_Spaces table — the physical things you install INTO: racks, desks,
            // shelves, rooms. A rack is both a thing you own and a thing you install into, so
            // ComponentId links to the component that WAS BOUGHT rather than restating its
            // price and paperwork here. A rack that is planned but not purchased is a row with
            // ComponentId NULL. ParentSpaceId nests a rack inside a room.
            // Geometry (HeightU, WidthInches, Rotation) is the rack's; what sits in it is Lab_Placements.
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_Spaces (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Kind TEXT NOT NULL DEFAULT 'Rack',
                    ComponentId INTEGER,
                    ParentSpaceId INTEGER,
                    HeightU INTEGER,
                    WidthInches REAL,
                    Rotation INTEGER NOT NULL DEFAULT 0,
                    DepthInches REAL,
                    Location TEXT,
                    Status TEXT NOT NULL DEFAULT 'active',
                    SortOrder INTEGER NOT NULL DEFAULT 0,
                    Notes TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (ComponentId) REFERENCES Lab_Components(Id),
                    FOREIGN KEY (ParentSpaceId) REFERENCES Lab_Spaces(Id)
                );
            ");

            // Create Lab_Placements table — what occupies a space, and where in it.
            // MachineId XOR ComponentId: a rack holds whole machines (the server) and bare
            // components alike (a PDU, a patch panel, a blank panel). Status planned|installed
            // is what makes this a planner rather than a map - lay a rack out before the parts
            // arrive, then flip rows as they go in.
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_Placements (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    SpaceId INTEGER NOT NULL,
                    MachineId INTEGER,
                    ComponentId INTEGER,
                    PositionU INTEGER,
                    HeightU INTEGER,
                    OnPlacementId INTEGER,
                    Face TEXT NOT NULL DEFAULT 'front',
                    Rotation INTEGER NOT NULL DEFAULT 0,
                    Status TEXT NOT NULL DEFAULT 'planned',
                    Notes TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (SpaceId) REFERENCES Lab_Spaces(Id),
                    FOREIGN KEY (MachineId) REFERENCES Lab_Machines(Id),
                    FOREIGN KEY (ComponentId) REFERENCES Lab_Components(Id),
                    CHECK ((MachineId IS NULL) <> (ComponentId IS NULL))
                );
            ");

            _db.Execute(@"CREATE INDEX IF NOT EXISTS IX_Lab_Placements_SpaceId ON Lab_Placements(SpaceId);");
            _db.Execute(@"CREATE INDEX IF NOT EXISTS IX_Lab_Spaces_ParentSpaceId ON Lab_Spaces(ParentSpaceId);");

            // Create Lab_Attachments table — files (invoice PDFs, manuals, photos) stored
            // under <dataDir>/lab/attachments, linked to a component or machine
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_Attachments (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ComponentId INTEGER,
                    MachineId INTEGER,
                    Kind TEXT NOT NULL DEFAULT 'Invoice',
                    FileName TEXT NOT NULL,
                    StoredName TEXT NOT NULL,
                    ContentType TEXT,
                    SizeBytes INTEGER,
                    Sha256 TEXT,
                    Notes TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (ComponentId) REFERENCES Lab_Components(Id),
                    FOREIGN KEY (MachineId) REFERENCES Lab_Machines(Id)
                );
            ");

            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_lab_attachments_component ON Lab_Attachments(ComponentId);
            ");

            // Create Lab_MachineGroups table (user-defined machine grouping, ordered)
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_MachineGroups (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Field TEXT NOT NULL DEFAULT 'role',
                    RolesJson TEXT NOT NULL,
                    SortOrder INTEGER NOT NULL,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");

            // Create Lab_MarketValues table (append-only price-observation ledger).
            // Msrp is the launch price and ListPrice the invoice's list at purchase - both
            // fixed, both properties of a past event. "What does it sell for now" is not a
            // property of the component at all, it is an observation with a date, so it gets
            // rows rather than a column. Never updated, never deleted: the series is the
            // point, and one overwritten number cannot answer "has it held its value".
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_MarketValues (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ComponentId INTEGER NOT NULL,
                    Value REAL NOT NULL,
                    Condition TEXT,
                    Source TEXT,
                    SourceUrl TEXT,
                    CapturedAt DATETIME NOT NULL,
                    Notes TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (ComponentId) REFERENCES Lab_Components(Id)
                );
            ");

            // ⛔ THE AUDIT TRAIL FOR DELETION, and the reason it is a separate table rather
            // than a tombstone column on Lab_Components. A soft-deleted row has to be excluded
            // from GetAllComponentsAsync, lab_query, its groupBy totals, lab_briefing, the
            // cloud snapshot AND the Inventory UI - six read paths through shared managers.
            // Miss one and the row becomes a phantom that inflates a count nobody can explain.
            // Keeping the record OUT of the components table removes that class of bug
            // entirely: the deleted row is gone, and what it was is still answerable.
            //
            // 🔑 Snapshot is the WHOLE component as JSON. A deletion is only ever justified
            // afterwards by what was actually removed, and a few columns chosen today are the
            // ones you will wish you had kept.
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_ComponentDeletions (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ComponentId INTEGER NOT NULL,
                    ComponentLabel TEXT,
                    ComponentType TEXT,
                    Snapshot TEXT NOT NULL,
                    Reason TEXT NOT NULL,
                    DeletedBy TEXT,
                    DeletedAt DATETIME NOT NULL,
                    RestoredAt DATETIME
                );
            ");
            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_lab_deletions_at ON Lab_ComponentDeletions(DeletedAt DESC);
            ");

            // Lab indexes
            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_lab_components_machine ON Lab_Components(CurrentMachineId);
            ");
            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_lab_marketvalues_component ON Lab_MarketValues(ComponentId, CapturedAt DESC);
            ");

            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_lab_movements_component ON Lab_ComponentMovements(ComponentId, MovedAt);
            ");

            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_lab_movements_to_machine ON Lab_ComponentMovements(ToMachineId, MovedAt);
            ");

            // ============================================================
            // Models module tables (MODELS) — Models_ prefix. Same module
            // discipline as Lab: no FKs from core tables in, links out are
            // nullable soft refs (MachineId → Lab_Machines.Id, no FK), so
            // the module is removable as a unit. This is the true state the
            // prose model docs (model-serving.md, the NAS ARCHITECTURE.md)
            // drift away from.
            // ============================================================

            // Create Models_Catalog table — the archived weights.
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Models_Catalog (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Family TEXT,
                    ParamsB REAL,
                    Architecture TEXT,
                    ActiveParamsB REAL,
                    ReleaseDate TEXT,
                    Quant TEXT,
                    QuantsJson TEXT,
                    ContextLength INTEGER,
                    KvCachePrecision TEXT,
                    SizeGb REAL,
                    TraitsJson TEXT,
                    StorageLocation TEXT,
                    Category TEXT,
                    Status TEXT NOT NULL DEFAULT 'active',
                    SupersededById INTEGER,
                    Notes TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (SupersededById) REFERENCES Models_Catalog(Id)
                );
            ");

            // Create Models_Serving table — which box holds which model.
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Models_Serving (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ModelId INTEGER NOT NULL,
                    MachineId INTEGER,
                    Alias TEXT,
                    EndpointPort INTEGER,
                    Mode TEXT NOT NULL DEFAULT 'on-demand',
                    IsDefault BOOLEAN NOT NULL DEFAULT 0,
                    Status TEXT NOT NULL DEFAULT 'active',
                    -- What this slot ACTUALLY serves. A catalog entry lists every
                    -- quant we own of a checkpoint, so borrowing from it printed
                    -- six quants and a 131 GB total against a slot serving one
                    -- quant at 17.9 GB. Same ethic as Models_Benchmarks: the row
                    -- states what it is.
                    Quant TEXT,
                    ContextTokens INTEGER,
                    Slots INTEGER,
                    KvPrecision TEXT,
                    Mtp INTEGER,
                    Vision INTEGER,
                    WeightsGb REAL,
                    Notes TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    Engine TEXT,
                    SharedKv INTEGER,
                    PoolTokens INTEGER,
                    Thinking TEXT,
                    OnCard INTEGER NOT NULL DEFAULT 0,
                    CardLabel TEXT,
                    CardOrder INTEGER,
                    SharesWith INTEGER,
                    FOREIGN KEY (ModelId) REFERENCES Models_Catalog(Id)
                );
            ");

            // Create Models_Serving_Design table — the serving page's boxes, clients and rules as
            // data, editable over MCP and from the page. Empty on a new install: the
            // page invites you to add a box. See Model_Models_ServingDesign.
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Models_Serving_Design (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Kind TEXT NOT NULL DEFAULT 'box',
                    Name TEXT, Title TEXT, Role TEXT, Body TEXT,
                    Machines TEXT, SlotOwners TEXT, AsksBox TEXT, DelegatesTo TEXT, FallbackBox TEXT,
                    Row INTEGER NOT NULL DEFAULT 1, Position INTEGER NOT NULL DEFAULT 0,
                    Accent TEXT, Hw TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");

            // Create Lab_Backup_Design table — the Homelab backups page as data: where data
            // lives (a location on a Lab machine), the copy jobs between locations, and rules. Empty on a
            // new install. See Model_Lab_BackupDesign.
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_Backup_Design (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Kind TEXT NOT NULL DEFAULT 'location',
                    Name TEXT, Body TEXT,
                    MachineId INTEGER, Path TEXT, Tier TEXT, Snapshots TEXT,
                    SourceId INTEGER, TargetId INTEGER, Schedule TEXT, Mode TEXT,
                    Row INTEGER NOT NULL DEFAULT 1, Position INTEGER NOT NULL DEFAULT 0,
                    Accent TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");

            // The Homelab NETWORK page: devices (a Lab machine, a Lab component or a placeholder for
            // something not bought yet), their ports and the links between ports. Soft references only, like the
            // rest of the Lab. Empty on a new install - see Model_Lab_Network.
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_Network_Nodes (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    MachineId INTEGER, ComponentId INTEGER,
                    Label TEXT, PortsSpec TEXT,
                    Status TEXT NOT NULL DEFAULT 'live',
                    SpaceId INTEGER,
                    X INTEGER, Y INTEGER,
                    Notes TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_Network_Ports (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    NodeId INTEGER NOT NULL,
                    Name TEXT NOT NULL,
                    Media TEXT NOT NULL DEFAULT 'rj45',
                    SpeedGb REAL,
                    Side TEXT NOT NULL DEFAULT 'bottom',
                    Position INTEGER NOT NULL DEFAULT 0,
                    ModuleComponentId INTEGER, ModuleLabel TEXT,
                    SourceComponentId INTEGER,
                    Notes TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_Network_Links (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    PortAId INTEGER NOT NULL, PortBId INTEGER NOT NULL,
                    Status TEXT NOT NULL DEFAULT 'live',
                    Notes TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");

            // How far a network-page frame or zone outline is grown past its devices, per edge (the Edit
            // layout's edge drags). Key space:<id> or zone:<id>; no row = drawn tight.
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_Network_Margins (
                    Key TEXT PRIMARY KEY,
                    GrowLeft INTEGER NOT NULL DEFAULT 0, GrowTop INTEGER NOT NULL DEFAULT 0,
                    GrowRight INTEGER NOT NULL DEFAULT 0, GrowBottom INTEGER NOT NULL DEFAULT 0,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");
            // Zones on the network page: a dmz or untrusted part of the network, drawn around its devices.
            // A device is in at most one zone, so the membership table is keyed by NodeId.
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_Network_Zones (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Kind TEXT NOT NULL DEFAULT 'untrusted',
                    Notes TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Lab_Network_ZoneNodes (
                    NodeId INTEGER PRIMARY KEY,
                    ZoneId INTEGER NOT NULL
                );
            ");

            // Create Models_Benchmarks table (append-only measurement ledger,
            // the Lab_MarketValues discipline: the SERIES is the value).
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Models_Benchmarks (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ModelName TEXT NOT NULL,
                    ModelId INTEGER,
                    MachineId INTEGER,
                    Metric TEXT NOT NULL,
                    Value REAL NOT NULL,
                    Quant TEXT,
                    ContextTokens INTEGER,
                    Slots INTEGER,
                    KvPrecision TEXT,
                    Mtp INTEGER,
                    Vision INTEGER,
                    Engine TEXT,
                    WeightsGb REAL,
                    ConfigJson TEXT,
                    Scenario TEXT,
                    CapturedAt DATETIME NOT NULL,
                    Source TEXT,
                    Notes TEXT,
                    Hardware TEXT,
                    Thinking TEXT,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (ModelId) REFERENCES Models_Catalog(Id)
                );
            ");

            // Create Models_Reference_Scores table — PUBLISHED third-party eval
            // figures for known models (SWE-bench, Aider…), cited from online
            // sources. Catalog-domain facts about the checkpoint itself; their
            // own table so citations never mix with fleet measurements.
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Models_Reference_Scores (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ModelId INTEGER NOT NULL,
                    Benchmark TEXT NOT NULL,
                    Score REAL NOT NULL,
                    Source TEXT NOT NULL,
                    -- What makes the score comparable, as FIELDS. They were a
                    -- sentence inside Notes, so nothing could group on them and
                    -- they could not sync (free text never leaves the box).
                    Provenance TEXT,
                    EvaluatedPrecision TEXT,
                    Scaffold TEXT,
                    EvaluatedContextTokens INTEGER,
                    Notes TEXT,
                    CapturedAt DATETIME NOT NULL,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (ModelId) REFERENCES Models_Catalog(Id)
                );
            ");

            // Create Models_Fit_Verdicts table — 'this exact setup CANNOT serve
            // on this machine', with the evidence. A verdict is not a
            // measurement (parked in the ledger as a fake metric, a delete aimed
            // at one verdict could destroy measurements).
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Models_Fit_Verdicts (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ModelId INTEGER NOT NULL,
                    MachineId INTEGER NOT NULL,
                    ConfigJson TEXT NOT NULL,
                    Reason TEXT NOT NULL,
                    Source TEXT,
                    CapturedAt DATETIME NOT NULL,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (ModelId) REFERENCES Models_Catalog(Id)
                );
            ");

            // The cloud MCP write path was removed: the cloud mirror is
            // read-only, so its idempotency log and its opt-in setting go too.
            _db.Execute("DROP TABLE IF EXISTS Lab_CloudCommandLog;");
            _db.Execute("DELETE FROM Settings WHERE Key = 'Lab.CloudSync.AllowCloudWrites';");

            // Models indexes
            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_models_serving_model ON Models_Serving(ModelId);
            ");
            _db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_models_benchmarks_model ON Models_Benchmarks(ModelName, CapturedAt DESC);
            ");

            // Create Collectors table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Collectors (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL UNIQUE,
                    CollectorType TEXT NOT NULL,
                    Description TEXT,
                    Status TEXT DEFAULT 'Offline',
                    SecurityStatus TEXT DEFAULT 'Unlocked',
                    URL TEXT,
                    AccessToken TEXT,
                    ExternalAccessToken BOOLEAN DEFAULT 0,
                    PollRate INTEGER DEFAULT 5000,
                    SendRate INTEGER DEFAULT 5000,
                    ServiceId INTEGER,
                    DecimalPlaces INTEGER DEFAULT 1,
                    LastFetchTime DATETIME,
                    LastFetchTotalSensors INTEGER,
                    LastFetchNewSensors INTEGER,
                    LastFetchLostSensors INTEGER,
                    LastFetchSuccessful BOOLEAN,
                    LastFetchErrorMessage TEXT,
                    TestFrequency INTEGER,
                    LastTested DATETIME
                );
            ");

            // Create Junctions table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS Junctions (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Description TEXT NOT NULL DEFAULT '',
                    Type TEXT,
                    Status TEXT NOT NULL DEFAULT 'Idle',
                    SortOrder INTEGER NOT NULL DEFAULT 0,
                    ShowOnDashboard BOOLEAN NOT NULL DEFAULT 1,
                    AutoStartOnLaunch BOOLEAN NOT NULL DEFAULT 0,
                    CronExpression TEXT,
                    GatewayDeviceId INTEGER,
                    GatewayDestination TEXT,
                    BroadcastPort INTEGER,
                    BroadcastRate INTEGER,
                    RenderingMode TEXT,
                    StreamingJpegQuality INTEGER NOT NULL DEFAULT 85,
                    DestinationOverride TEXT,
                    BaudRate INTEGER,   
                    AllTargetsAllData BOOLEAN NOT NULL DEFAULT 0,
                    AllTargetsAllScreens BOOLEAN NOT NULL DEFAULT 0,
                    CompressPayload BOOLEAN NOT NULL DEFAULT 0,
                    MQTTBrokerId INTEGER,
                    SelectedPayloadAttributes TEXT NOT NULL DEFAULT '',
                    StreamAutoTimeout BOOLEAN NOT NULL DEFAULT 0,
                    StreamAutoTimeoutMs INTEGER NOT NULL DEFAULT 10000,
                    RetryCount INTEGER NOT NULL DEFAULT 3,
                    RetryIntervalMs INTEGER NOT NULL DEFAULT 1000,
                    EnableTests BOOLEAN NOT NULL DEFAULT 1,
                    EnableHealthCheck BOOLEAN NOT NULL DEFAULT 1,
                    HealthCheckIntervalMs INTEGER NOT NULL DEFAULT 60000,
                    EnableNotifications BOOLEAN NOT NULL DEFAULT 0,
                    AllowStartOnCollectorTestFailure BOOLEAN NOT NULL DEFAULT 0,
                    SendConfigPayload BOOLEAN NOT NULL DEFAULT 1,
                    SendSensorPayloads BOOLEAN NOT NULL DEFAULT 1,
                    SendStopPayload BOOLEAN NOT NULL DEFAULT 1
                );
            ");

            // Create Sensors table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
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
                    IsCustomJunctionSensor BOOLEAN DEFAULT 0,
                    IsEventSensor BOOLEAN DEFAULT 0,
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

            // Create JunctionSensors table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
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
                    IsCustomJunctionSensor BOOLEAN DEFAULT 0,
                    IsEventSensor BOOLEAN DEFAULT 0,
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
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS JunctionSensorTargets (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    JunctionId INTEGER NOT NULL,
                    SensorId INTEGER NOT NULL,
                    DeviceId INTEGER NOT NULL,
                    ScreenId INTEGER,
                    PositionIndex INTEGER,
                    UNIQUE(JunctionId, SensorId, DeviceId, ScreenId),
                    FOREIGN KEY(JunctionId) REFERENCES Junctions(Id),
                    FOREIGN KEY(SensorId) REFERENCES JunctionSensors(Id),
                    FOREIGN KEY(DeviceId) REFERENCES Devices(Id),
                    FOREIGN KEY(ScreenId) REFERENCES DeviceScreens(Id)
                );
            ");

            // Create JunctionDeviceLinks table
            Service_Database_Schema.CreateOrAmendTable(_db, @"
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
            Service_Database_Schema.CreateOrAmendTable(_db, @"
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

            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS StreamHistoryConfiguration (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    RetentionHours REAL NOT NULL DEFAULT 24,
                    MaxEntriesPerStream INTEGER NOT NULL DEFAULT 10000,
                    LoggingEnabled BOOLEAN NOT NULL DEFAULT 1,                    
                    CleanupIntervalMinutes INTEGER NOT NULL DEFAULT 15,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");

            Service_Database_Schema.CreateOrAmendTable(_db, @"
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

            Service_Database_Schema.CreateOrAmendTable(_db, @"
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

            // Create LoggingSettings table for debug and logging configuration
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS LoggingSettings (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Category TEXT NOT NULL UNIQUE,
                    Enabled INTEGER DEFAULT 1,
                    IsEventDriven INTEGER DEFAULT 0,
                    LogIntervalMinutes INTEGER DEFAULT 60,
                    Description TEXT,
                    LastLoggedAt DATETIME,
                    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    MaxLogRetentionDays INTEGER DEFAULT 30,
                    MaxLogFileSizeMB INTEGER DEFAULT 100,
                    AutoCleanupEnabled INTEGER DEFAULT 1,
                    LastCleanupAt DATETIME
                );
            ");

            // Create unique index for JunctionScreenLayouts
            _db.Execute(@"
                CREATE UNIQUE INDEX IF NOT EXISTS idx_junction_screen_unique
                ON JunctionScreenLayouts(JunctionId, DeviceScreenId);
            ");

            await Task.CompletedTask;
        }

        // Seeds the component vocabulary. Idempotent: INSERT OR IGNORE on a UNIQUE Name, so it
        // never overwrites a type the user has since edited or reordered.
        //
        // 🔑 The 13 built-ins and their fields were GENERATED from the TypeScript definitions
        // they replace (SPEC_FIELDS + TYPE_SECTION_COLUMNS in Lab_Inventory_Helpers.ts) rather
        // than retyped, because a silent transcription error in 135 lines of field defs would
        // surface as a quietly missing column months later.
        //
        // ⚠️ TWO COLUMNS KEEP CODE-SIDE GETTERS and are deliberately not expressed here:
        // CPU.cores sums P+E cores, and Other.spec reads the component's own Spec column rather
        // than SpecJson. They are logic, not data; expressing them would mean inventing an
        // expression language.
        private void SeedLabComponentTypes()
        {
            // ⛔ THE BUILT-INS SEED ONCE, NOT ON EVERY BOOT, and the difference is not cosmetic.
            // CreateTablesAsync runs at every startup, so an unguarded INSERT OR IGNORE keyed on
            // Name would RESURRECT a built-in the user had renamed: rename CPU -> Processors in
            // the types dialog, the components repoint correctly, then the next restart finds no
            // row named 'CPU' and helpfully creates an empty one. Deleting a built-in had the
            // same problem. A one-shot Settings flag is the house idiom for this and keeps the
            // alternative - a migration script - out of this class entirely.
            const string seededKey = "lab_component_types_seeded";
            var alreadySeeded = _db.ExecuteScalar<int>(
                "SELECT COUNT(*) FROM Settings WHERE Key = @Key", new { Key = seededKey }) > 0;

            void Seed(string name, string label, int sortOrder, string fieldsJson)
            {
                if (alreadySeeded) return;   // one-shot; see the note above
                _db.Execute(@"
                    INSERT OR IGNORE INTO Lab_ComponentTypes (Name, Label, SortOrder, Status, FieldsJson)
                    VALUES (@Name, @Label, @SortOrder, 'active', @FieldsJson);",
                    new { Name = name, Label = label, SortOrder = sortOrder, FieldsJson = fieldsJson });
            }

            Seed("CPU", "CPUs", 0, @"[{""key"":""cores"",""label"":""Cores (P)"",""kind"":""number"",""showInTable"":true,""tableLabel"":""Cores"",""align"":""right"",""sortOrder"":0},{""key"":""eCores"",""label"":""E-Cores"",""kind"":""number"",""sortOrder"":1},{""key"":""threads"",""label"":""Threads"",""kind"":""number"",""showInTable"":true,""align"":""right"",""sortOrder"":2},{""key"":""platform"",""label"":""Platform"",""kind"":""text"",""showInTable"":true,""sortOrder"":3},{""key"":""integratedWith"",""label"":""Integrated With"",""kind"":""text"",""sortOrder"":4}]");
            Seed("GPU", "GPUs", 1, @"[{""key"":""vramGb"",""label"":""VRAM"",""kind"":""number"",""unit"":""GB"",""showInTable"":true,""align"":""right"",""sortOrder"":0},{""key"":""integratedWith"",""label"":""Integrated With"",""kind"":""text"",""sortOrder"":1}]");
            Seed("MOBO", "Motherboards", 2, @"[{""key"":""form"",""label"":""Form Factor"",""kind"":""select"",""options"":[""ITX"",""mATX"",""ATX"",""E-ATX"",""STX"",""PICO""],""showInTable"":true,""tableLabel"":""Form"",""sortOrder"":0},{""key"":""platform"",""label"":""Platform"",""kind"":""text"",""showInTable"":true,""sortOrder"":1},{""key"":""ddrGen"",""label"":""DDR Gen"",""kind"":""select"",""options"":[""DDR3"",""DDR4"",""DDR5"",""DDR4 SODIMM"",""DDR5 SODIMM""],""showInTable"":true,""tableLabel"":""DDR"",""sortOrder"":2},{""key"":""network"",""label"":""Network (one interface per line)"",""kind"":""text"",""multiline"":true,""showInTable"":true,""tableLabel"":""Network"",""sortOrder"":3},{""key"":""ecc"",""label"":""ECC Support"",""kind"":""boolean"",""showInTable"":true,""tableLabel"":""ECC"",""sortOrder"":4},{""key"":""integratedParts"",""label"":""Integrated Parts"",""kind"":""text"",""sortOrder"":5},{""key"":""ports"",""label"":""Ports (e.g. 2x SFP+ 10G)"",""kind"":""text"",""sortOrder"":6}]");
            Seed("RAM", "Memory", 3, @"[{""key"":""sizeGb"",""label"":""Size"",""kind"":""number"",""unit"":""GB"",""showInTable"":true,""align"":""right"",""sortOrder"":0},{""key"":""ddrGen"",""label"":""DDR Gen"",""kind"":""select"",""options"":[""DDR3"",""DDR3L"",""DDR4"",""DDR5""],""showInTable"":true,""tableLabel"":""DDR"",""sortOrder"":1},{""key"":""speedMts"",""label"":""Speed"",""kind"":""number"",""unit"":""MT/s"",""showInTable"":true,""align"":""right"",""sortOrder"":2},{""key"":""cas"",""label"":""CAS"",""kind"":""number"",""showInTable"":true,""align"":""right"",""sortOrder"":3},{""key"":""timings"",""label"":""Timings"",""kind"":""text"",""sortOrder"":4},{""key"":""ecc"",""label"":""ECC"",""kind"":""boolean"",""showInTable"":true,""sortOrder"":5},{""key"":""formFactor"",""label"":""Form"",""kind"":""select"",""options"":[""DIMM"",""SODIMM"",""RDIMM""],""showInTable"":true,""sortOrder"":6}]");
            Seed("Storage", "Storage", 4, @"[{""key"":""sizeTb"",""label"":""Size"",""kind"":""number"",""unit"":""TB"",""showInTable"":true,""align"":""right"",""sortOrder"":0},{""key"":""interface"",""label"":""Interface"",""kind"":""text"",""showInTable"":true,""sortOrder"":1},{""key"":""rpm"",""label"":""RPM"",""kind"":""number"",""showInTable"":true,""align"":""right"",""sortOrder"":2},{""key"":""zfsConfig"",""label"":""ZFS / Array"",""kind"":""text"",""showInTable"":true,""sortOrder"":3}]");
            Seed("PSU", "Power Supplies", 5, @"[{""key"":""watts"",""label"":""Watts"",""kind"":""number"",""unit"":""W"",""showInTable"":true,""align"":""right"",""sortOrder"":0},{""key"":""formFactor"",""label"":""Form Factor"",""kind"":""select"",""options"":[""ATX"",""SFX"",""SFX-L"",""TFX"",""GaN"",""Integrated""],""showInTable"":true,""tableLabel"":""Form"",""sortOrder"":1}]");
            Seed("Cooler", "CPU Coolers", 6, @"[{""key"":""coolerType"",""label"":""Type"",""kind"":""select"",""options"":[""Air"",""AIO 120"",""AIO 240"",""AIO 280"",""AIO 360""],""showInTable"":true,""sortOrder"":0},{""key"":""fanMm"",""label"":""Fan Size"",""kind"":""number"",""unit"":""mm"",""showInTable"":true,""tableLabel"":""Fan"",""align"":""right"",""sortOrder"":1}]");
            Seed("Fan", "Fans", 7, @"[{""key"":""sizeMm"",""label"":""Size"",""kind"":""number"",""unit"":""mm"",""showInTable"":true,""align"":""right"",""sortOrder"":0},{""key"":""rpm"",""label"":""Max RPM"",""kind"":""number"",""showInTable"":true,""align"":""right"",""sortOrder"":1},{""key"":""connector"",""label"":""Connector"",""kind"":""select"",""options"":[""3-pin"",""4-pin PWM"",""USB"",""Proprietary""],""showInTable"":true,""sortOrder"":2},{""key"":""rgb"",""label"":""RGB"",""kind"":""boolean"",""showInTable"":true,""sortOrder"":3}]");
            Seed("Monitor", "Monitors", 8, @"[{""key"":""sizeInch"",""label"":""Size"",""kind"":""number"",""unit"":""\"""",""showInTable"":true,""align"":""right"",""sortOrder"":0},{""key"":""resolution"",""label"":""Resolution"",""kind"":""text"",""showInTable"":true,""sortOrder"":1},{""key"":""refreshHz"",""label"":""Refresh"",""kind"":""number"",""unit"":""Hz"",""showInTable"":true,""align"":""right"",""sortOrder"":2},{""key"":""panel"",""label"":""Panel"",""kind"":""text"",""showInTable"":true,""sortOrder"":3}]");
            Seed("NIC", "Network Adapters", 9, @"[{""key"":""speed"",""label"":""Speed"",""kind"":""text"",""showInTable"":true,""sortOrder"":0},{""key"":""ports"",""label"":""Ports (e.g. 2x SFP+ 10G)"",""kind"":""text"",""sortOrder"":1}]");
            Seed("Case", "Cases", 10, @"[{""key"":""form"",""label"":""Form Factor"",""kind"":""text"",""showInTable"":true,""tableLabel"":""Form"",""sortOrder"":0}]");
            Seed("Printer", "Printers", 11, @"[{""key"":""printerType"",""label"":""Type"",""kind"":""select"",""options"":[""FDM"",""Resin"",""Laser"",""Inkjet""],""showInTable"":true,""sortOrder"":0},{""key"":""buildVolume"",""label"":""Build Volume"",""kind"":""text"",""showInTable"":true,""sortOrder"":1}]");
            Seed("Other", "Other", 12, @"[]");

            if (!alreadySeeded)
            {
                _db.Execute(@"
                    INSERT INTO Settings (Key, Value, Description)
                    VALUES (@Key, '1', 'Set once the built-in Lab component types have been seeded. Removing this row re-creates any built-in type that has since been renamed or deleted.')",
                    new { Key = seededKey });
            }

            // ✅ The adoption pass DOES run every boot, and is safe to: it only inserts types
            // that components are already filed under but the table has never heard of. It
            // cannot resurrect anything, because a renamed type takes its components with it.
            var maxOrder = _db.ExecuteScalar<int>("SELECT COALESCE(MAX(SortOrder), 0) FROM Lab_ComponentTypes");
            var orphans = _db.Query<string>(@"
                SELECT DISTINCT Type FROM Lab_Components
                 WHERE Type IS NOT NULL AND TRIM(Type) <> ''
                   AND Type NOT IN (SELECT Name FROM Lab_ComponentTypes)").ToList();

            foreach (var name in orphans)
                Seed(name, name, ++maxOrder, "[]");
        }

        public async Task SeedInitialSettingsAsync()
        {
            // General application settings
            var defaultSettings = new List<(string Key, string Value, string Description)>
            {
                ("device_actions_alignment", "left", "Controls the alignment of the Actions column in device tables"),
                ("device_combine_cloud_devices", "false", "If true, show a single unified table for local and cloud devices"),
                ("device_custom_firmware_flashing", "false", "If true, enables uploading custom firmware via OTA. Use at your own risk. This feature is provided as-is with no warranty or guarantee. The developers assume no liability for any damage, malfunction, or data loss resulting from its use"),
                ("frameengine_auto_cleanup", "false", "If true, automatically clean up orphaned FrameEngine files on application startup"),
                ("frameengine_blit_memory_protection", "1000", "After this many blit frames, the virtual screen will be re-created to protect from memory leaks. During this transition, the prior frame may be held for a few seconds"),
                ("global_sensorcache_expiry", "60000", "Time in milliseconds after which sensor data expires from the global cache (default: 1 minute)"),
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
                ("service_connection_status_enabled", "true", "Master toggle for the connection status monitoring service"),
                ("service_eventengine_enabled", "false", "Master toggle for the EventEngine service"),
                ("service_heartbeats_enabled", "true", "Master toggle for the heartbeat monitoring service"),
                ("content_constrain_max_width", "true", "If true, constrain page content to a max width (matching Dashboard and XSD)")
            };

            int addedCount = 0;
            foreach (var setting in defaultSettings)
            {
                var exists = _db.ExecuteScalar<int>("SELECT COUNT(*) FROM Settings WHERE Key = @Key",
                                                   new { Key = setting.Key }) > 0;
                if (!exists)
                {
                    await Task.Yield();
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
                Console.WriteLine($"[DATABASE] Added {addedCount} missing settings to the database.");
            }

            // Notification category settings (stored in NotificationSettings table)
            var notificationCategories = new List<(string Category, bool Enabled, int DefaultDurationMs, string Description)>
            {
                ("notifications_system", true, 6000, "System notifications (updates, theme changes, etc.)"),
                ("notifications_api", true, 6000, "API operation notifications (success/error events)"),
                ("notifications_auth", true, 8000, "Authentication notifications (login, logout, session events)"),
                ("notifications_cloud", true, 6000, "Cloud synchronization notifications"),
                ("notifications_junction_events", true, 5000, "Show notifications for junction start/stop/error events"),
                ("notifications_collector_tests", true, 3000, "Show notifications for collector test progress and results"),
                ("notifications_cloud_health_reports", true, 5000, "Show notifications for cloud health report sync events")
            };

            int notificationSettingsAdded = 0;
            foreach (var category in notificationCategories)
            {
                var exists = _db.ExecuteScalar<int>("SELECT COUNT(*) FROM NotificationSettings WHERE Category = @Category",
                                                   new { Category = category.Category }) > 0;
                if (!exists)
                {
                    await Task.Yield();
                    _db.Execute(@"
                        INSERT INTO NotificationSettings (Category, Enabled, DefaultDurationMs, Description)
                        VALUES (@Category, @Enabled, @DefaultDurationMs, @Description)",
                        new
                        {
                            Category = category.Category,
                            Enabled = category.Enabled,
                            DefaultDurationMs = category.DefaultDurationMs,
                            Description = category.Description
                        });
                    notificationSettingsAdded++;
                }
            }
            if (notificationSettingsAdded > 0)
            {
                Console.WriteLine($"[DATABASE] Added {notificationSettingsAdded} notification settings to the database.");
            }
        }

        private async Task SeedDefaultTransitionRulesAsync()
        {
            var existingRules = _db.ExecuteScalar<int>("SELECT COUNT(*) FROM TransitionRules");
            if (existingRules > 0)
            {
                Console.WriteLine($"⏭️ Skipped transition rules seeding - {existingRules} rules already exist");
                return;
            }

            var jsonPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "frameengine", "defaultTransitionRules.json");
            if (!File.Exists(jsonPath))
            {
                Console.WriteLine("⚠️ Default transition rules not found (open-source build without FrameEngine)");
                return;
            }

            try
            {
                var jsonContent = await File.ReadAllTextAsync(jsonPath);
                var defaultRules = JsonSerializer.Deserialize<List<JsonElement>>(jsonContent);

                if (defaultRules == null || defaultRules.Count == 0)
                {
                    Console.WriteLine("⚠️ No default transition rules found in JSON file");
                    return;
                }

                foreach (var ruleJson in defaultRules)
                {
                    var rule = new Model_TransitionRule
                    {
                        Name = ruleJson.GetProperty("name").GetString(),
                        Enabled = ruleJson.GetProperty("enabled").GetInt32() == 1,
                        Priority = ruleJson.GetProperty("priority").GetInt32(),
                        SortOrder = ruleJson.GetProperty("sortOrder").GetInt32(),
                        TriggerEvent = ruleJson.GetProperty("triggerEvent").GetString() ?? "",
                        NewLayout = ruleJson.GetProperty("newLayout").GetString() ?? "",
                        TransitionEffect = ruleJson.GetProperty("transitionEffect").GetString() ?? "",
                        TransitionDuration = ruleJson.GetProperty("transitionDuration").GetInt32(),
                        TransitionLayoutPath = GetStringOrNull(ruleJson, "transitionLayoutPath"),
                        TransitionLayoutInEffect = GetStringOrNull(ruleJson, "transitionLayoutInEffect"),
                        TransitionLayoutFadeIn = GetIntOrNull(ruleJson, "transitionLayoutFadeIn"),
                        TransitionLayoutHold = GetIntOrNull(ruleJson, "transitionLayoutHold"),
                        TransitionLayoutOutEffect = GetStringOrNull(ruleJson, "transitionLayoutOutEffect"),
                        TransitionLayoutFadeOut = GetIntOrNull(ruleJson, "transitionLayoutFadeOut"),
                        ExistingLayoutExtend = ruleJson.TryGetProperty("existingLayoutExtend", out var ele) ? ele.GetInt32() : 0,
                        NewLayoutExtend = ruleJson.TryGetProperty("newLayoutExtend", out var nle) ? nle.GetInt32() : 0,
                        ExistingLayoutFadeDuration = GetIntOrNull(ruleJson, "existingLayoutFadeDuration"),
                        NewLayoutFadeDuration = GetIntOrNull(ruleJson, "newLayoutFadeDuration"),
                        SensorLogic = GetStringOrNull(ruleJson, "sensorLogic"),
                        PreviewTransitionTransparency = ruleJson.TryGetProperty("previewTransitionTransparency", out var ptt) && ptt.GetInt32() == 1,
                        TimelineJson = GetStringOrNull(ruleJson, "timelineJson")
                    };

                    // Handle "None" as null for transition layout path
                    if (rule.TransitionLayoutPath == "None")
                        rule.TransitionLayoutPath = null;

                    await _transitionRulesManager.CreateTransitionRuleAsync(rule);
                }

                Console.WriteLine($"✅ Seeded {defaultRules.Count} default transition rules");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠️ Failed to seed default transition rules: {ex.Message}");
            }
        }

        private static string? GetStringOrNull(JsonElement element, string propertyName)
        {
            if (element.TryGetProperty(propertyName, out var prop) && prop.ValueKind == JsonValueKind.String)
                return prop.GetString();
            return null;
        }

        private static int? GetIntOrNull(JsonElement element, string propertyName)
        {
            if (element.TryGetProperty(propertyName, out var prop) && prop.ValueKind == JsonValueKind.Number)
                return prop.GetInt32();
            return null;
        }
    }
}