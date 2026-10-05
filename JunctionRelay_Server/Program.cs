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

using System.Data;
using Microsoft.Data.Sqlite;
using System.Runtime.InteropServices;
using JunctionRelayServer.Services;
using JunctionRelayServer.Collectors;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using System.Collections.Concurrent;
using JunctionRelayServer.Services.FactoryServices;
using JunctionRelayServer.Utils;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebSockets;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using JunctionRelayServer.Services.BackgroundServices;
using JunctionRelayServer.Services.CollectorPlugins;
using JunctionRelayServer.Services.ElementPlugins;
using JunctionRelayServer.Services.PayloadPlugins;
using JunctionRelayServer.Services.ShaderPlugins;
using System.Diagnostics;

// ============================================================================
// SINGLE INSTANCE CHECK
// ============================================================================

// Check if another instance is already running
var currentProcess = Process.GetCurrentProcess();
var runningProcesses = Process.GetProcessesByName(currentProcess.ProcessName);

if (runningProcesses.Length > 1)
{
    Console.WriteLine("[STARTUP] ERROR: Another instance of JunctionRelay is already running.");
    Console.WriteLine("[STARTUP] Only one instance can run at a time. Exiting...");
    Environment.Exit(1);
}

var builder = WebApplication.CreateBuilder(args);

// Configure shutdown timeout for graceful cleanup
builder.Services.Configure<HostOptions>(options =>
{
    // Increase shutdown timeout to allow for:
    // - Junction stopping (5 seconds each)
    // - Virtual stream cleanup (500ms)
    // - WebSocket connections closing (3 seconds)
    // - Unified notifications closing (2 seconds)
    // - Puppeteer disposal
    options.ShutdownTimeout = TimeSpan.FromSeconds(60);
});

// HTTP Context
builder.Services.AddHttpContextAccessor();

// ============================================================================
// CENTRALIZED DIRECTORY MANAGEMENT
// ============================================================================

string GetDataDirectory()
{
    if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
    {
        // Windows: Use LocalApplicationData
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JunctionRelay"
        );
    }
    else
    {
        // Linux/Docker: Use environment variable or default
        var baseDataPath = Environment.GetEnvironmentVariable("JUNCTION_RELAY_DATA_PATH")
                          ?? "/app/data";
        return baseDataPath;
    }
}

var dataDirectory = GetDataDirectory();

// Ensure the data directory exists and is absolute
if (!Path.IsPathRooted(dataDirectory))
{
    dataDirectory = Path.GetFullPath(dataDirectory);
}

Directory.CreateDirectory(dataDirectory);

// Create directory provider for dependency injection
builder.Services.AddSingleton(new DataDirectoryProvider(dataDirectory));

// Define all application directories using centralized data directory
var dbPath = Path.Combine(dataDirectory, "jr_database.db");
var keysDirectory = Path.Combine(dataDirectory, "keys");
var framesPath = Path.Combine(dataDirectory, "frameengine", "frames");
var firmwareDirectory = Path.Combine(dataDirectory, "firmware");
var releaseCacheDirectory = Path.Combine(firmwareDirectory, "releases");
var riveDirectory = Path.Combine(dataDirectory, "frameengine", "rive");
var imagesDirectory = Path.Combine(dataDirectory, "frameengine", "images");
var videosDirectory = Path.Combine(dataDirectory, "frameengine", "videos");
var thumbnailsDirectory = Path.Combine(dataDirectory, "frameengine", "thumbnails");
var collectorsDirectory = Path.Combine(dataDirectory, "collectors");
var elementsDirectory = Path.Combine(dataDirectory, "elements");
var protocolsDirectory = Path.Combine(dataDirectory, "protocols");
var shadersDirectory = Path.Combine(dataDirectory, "shaders");

// Ensure all directories exist
Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);
Directory.CreateDirectory(keysDirectory);
Directory.CreateDirectory(framesPath);
Directory.CreateDirectory(firmwareDirectory);
Directory.CreateDirectory(releaseCacheDirectory);
Directory.CreateDirectory(riveDirectory);
Directory.CreateDirectory(imagesDirectory);
Directory.CreateDirectory(videosDirectory);
Directory.CreateDirectory(thumbnailsDirectory);
Directory.CreateDirectory(collectorsDirectory);
Directory.CreateDirectory(elementsDirectory);
Directory.CreateDirectory(protocolsDirectory);
Directory.CreateDirectory(shadersDirectory);

Console.WriteLine($"[STARTUP] Data directory:      {dataDirectory}");
Console.WriteLine($"[STARTUP] Database path:       {dbPath}");
Console.WriteLine($"[STARTUP] Keys directory:      {keysDirectory}");
Console.WriteLine($"[STARTUP] Frames directory:    {framesPath}");
Console.WriteLine($"[STARTUP] Firmware directory:  {firmwareDirectory}");
Console.WriteLine($"[STARTUP] Release cache:       {releaseCacheDirectory}");
Console.WriteLine($"[STARTUP] Rive directory:      {riveDirectory}");
Console.WriteLine($"[STARTUP] Images directory:    {imagesDirectory}");
Console.WriteLine($"[STARTUP] Videos directory:    {videosDirectory}");
Console.WriteLine($"[STARTUP] Thumbnails directory: {thumbnailsDirectory}");
// Bundled collector plugin directory (alongside the executable, under Plugins/)
// Uses Plugins/ subfolder to avoid collision with native Collectors/ folder
var bundledCollectorsDir = Path.Combine(AppContext.BaseDirectory, "Plugins", "Collectors");
if (!Directory.Exists(bundledCollectorsDir)) bundledCollectorsDir = null;

var bundledProtocolsDir = Path.Combine(AppContext.BaseDirectory, "Plugins", "Protocols");
if (!Directory.Exists(bundledProtocolsDir)) bundledProtocolsDir = null;

var bundledShadersDir = Path.Combine(AppContext.BaseDirectory, "Plugins", "Shaders");
if (!Directory.Exists(bundledShadersDir)) bundledShadersDir = null;

Console.WriteLine($"[STARTUP] Bundled collectors:   {bundledCollectorsDir ?? "(none)"}");
Console.WriteLine($"[STARTUP] Bundled protocols:    {bundledProtocolsDir ?? "(none)"}");
Console.WriteLine($"[STARTUP] Bundled shaders:      {bundledShadersDir ?? "(none)"}");
Console.WriteLine($"[STARTUP] Collectors directory: {collectorsDirectory}");
Console.WriteLine($"[STARTUP] Elements directory:   {elementsDirectory}");
Console.WriteLine($"[STARTUP] Protocols directory:  {protocolsDirectory}");
Console.WriteLine($"[STARTUP] Shaders directory:    {shadersDirectory}");

// Handle pending database updates
var pending = dbPath + ".pending";
if (File.Exists(pending))
{
    File.Copy(pending, dbPath, overwrite: true);
    File.Delete(pending);
}

// ============================================================================
// SERVICE REGISTRATIONS
// ============================================================================

// Register identity and deletion services early
builder.Services.AddSingleton<Service_BackendIdentity>();
builder.Services.AddSingleton<Service_DataDeletion>();

// Handle deletion marker before setup - USING SERVICE NOW
var tempDataDeletionService = new Service_DataDeletion();
if (tempDataDeletionService.HasDeletionMarker())
{
    tempDataDeletionService.ProcessDeletionMarker();
}

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        // The SPA is served from the same origin (port 7180), so most requests
        // are same-origin and bypass CORS entirely. This policy covers:
        //   - localhost:3000  (React dev server during development)
        //   - port 7180       (LAN clients hitting the embedded SPA)
        policy.SetIsOriginAllowed(origin =>
              {
                  if (Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                  {
                      if (uri.Host == "localhost" && uri.Port == 3000) return true;
                      if (uri.Port == 7180) return true;
                  }
                  return false;
              })
              .WithHeaders("Content-Type", "Authorization", "X-Requested-With")
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Security: per-IP rate limit on the login endpoint (brute-force).
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    // Local MCP endpoint (audit L2). Generous enough for conversational tool use,
    // bounded enough that an unauthenticated prober cannot spin the decrypt path.
    options.AddPolicy("mcp-local", httpContext =>
        System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    options.AddPolicy("login", httpContext =>
        System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(5),
                QueueLimit = 0
            }));
});

// Add WebSocket support
// Origin enforcement for browser clients is handled by the CORS middleware
// (UseCors runs before UseWebSockets in the pipeline). Device clients (ESP32,
// services) don't send Origin headers and are unaffected by origin checks.
builder.Services.AddWebSockets(options =>
{
    options.KeepAliveInterval = TimeSpan.FromSeconds(30);
});

// Add HttpClient for cloud functionality
builder.Services.AddHttpClient();

// Database configuration
builder.Services.AddSingleton(new DatabasePathProvider(dbPath));

// Register connection factory for singleton services (thread-safe)
builder.Services.AddSingleton<IDatabaseConnectionFactory>(
    new DatabaseConnectionFactory($"Data Source={dbPath}"));

// Register scoped connections for database manager services
builder.Services.AddScoped<IDbConnection>(provider =>
{
    var factory = provider.GetRequiredService<IDatabaseConnectionFactory>();
    return factory.CreateConnection();
});

// Add Data Protection for secrets encryption
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(keysDirectory))
    .SetApplicationName("JunctionRelay");

// Register the secrets service
builder.Services.AddSingleton<ISecretsService, Service_Secrets>();
builder.Services.AddSingleton<Service_CloudSessionStore>();
builder.Services.AddSingleton<Service_AuthCookieManager>();

// DUAL AUTHENTICATION: Support BOTH Local JWT and Clerk tokens
// Get JWT secret and backend ID from services
var backendIdentityService = new Service_BackendIdentity(builder.Environment);
var jwtSecretKey = builder.Configuration["Jwt:SecretKey"] ?? backendIdentityService.GetJwtSecret();
var backendId = backendIdentityService.GetBackendId();

// IMPORTANT: Set the generated secret in configuration so Service_Jwt can access it
builder.Configuration["Jwt:SecretKey"] = jwtSecretKey;

var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "JunctionRelay";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})

.AddJwtBearer("Local", options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecretKey)),
        ValidateIssuer = true,
        ValidIssuer = jwtIssuer,
        ValidateAudience = true,
        ValidAudience = jwtIssuer, // Your JWT service uses issuer as audience
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero,
        NameClaimType = System.Security.Claims.ClaimTypes.Name
    };

    options.Events = new JwtBearerEvents
    {
        OnAuthenticationFailed = context =>
        {
            // Console.WriteLine($"Local JWT Authentication failed: {context.Exception.Message}");
            return Task.CompletedTask;
        },
        OnTokenValidated = context =>
        {
            // Console.WriteLine($"Local JWT token validated successfully for: {context.Principal?.Identity?.Name}");
            return Task.CompletedTask;
        }
    };
})
.AddJwtBearer("Clerk", options =>
{
    // JunctionRelay Cloud authentication - public Clerk instance for cloud features
    options.Authority = "https://accounts.junctionrelay.com";
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = false, // FIXED: Clerk tokens don't have audience - DISABLE validation
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(5),
        NameClaimType = "email" // Clerk uses email claim
    };

    options.Events = new JwtBearerEvents
    {
        OnAuthenticationFailed = context =>
        {
            // Console.WriteLine($"Clerk JWT Authentication failed: {context.Exception.Message}");
            return Task.CompletedTask;
        },
        OnTokenValidated = context =>
        {
            // Console.WriteLine($"Clerk JWT token validated successfully for: {context.Principal?.Identity?.Name}");
            return Task.CompletedTask;
        }
    };
});

// Authorization policy that accepts BOTH authentication schemes
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("RequireAuth", policy =>
    {
        policy.AddAuthenticationSchemes("Local", "Clerk")
              .RequireAuthenticatedUser();
    });

    // Default policy accepts both
    options.DefaultPolicy = new AuthorizationPolicyBuilder("Local", "Clerk")
        .RequireAuthenticatedUser()
        .Build();
});

// Register authentication services
builder.Services.AddSingleton<IService_Auth, Service_Auth>();
builder.Services.AddSingleton<IService_Jwt, Service_Jwt>();

// Unified auth
builder.Services.AddSingleton<IAuthModeService, Service_AuthMode>();
builder.Services.AddSingleton<ILocalAuthService, Service_LocalAuth>();
builder.Services.AddSingleton<ICloudAuthService, Service_CloudAuth>();

// Auth mode-aware authorization: bypasses auth when mode is "none"
builder.Services.AddScoped<IAuthorizationHandler, AuthModeAuthorizationHandler>();

if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
{
    builder.Services.AddSingleton<Service_HostInfo, Service_HostInfo_Windows>();
}
else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
{
    if (RuntimeInformation.OSArchitecture == Architecture.Arm || RuntimeInformation.OSArchitecture == Architecture.Arm64)
    {
        builder.Services.AddSingleton<Service_HostInfo, Service_HostInfo_Arm>();
    }
    else
    {
        builder.Services.AddSingleton<Service_HostInfo, Service_HostInfo_Linux>();
    }
}
else
{
    builder.Services.AddSingleton<Service_HostInfo, Service_HostInfo_Linux>();
}

builder.Services.AddHttpClient<Service_Manager_Devices>(client =>
{
    client.BaseAddress = new Uri("http://localhost:7180");
});
builder.Services.AddHttpClient<Service_Manager_Services>(client =>
{
    client.BaseAddress = new Uri("http://localhost:7180");
});

builder.Services.AddScoped<Service_Backups>();
builder.Services.AddScoped<Service_CloudBackups_Manifest>();
builder.Services.AddScoped<Service_FrameEngine_CloudVersioning>();
builder.Services.AddScoped<Service_Manager_BuiltInPayloads>();
builder.Services.AddSingleton<Service_BackupProgressTracker>();
builder.Services.AddScoped<Service_Database_Initializer>();
builder.Services.AddScoped<Service_Database_Manager_Sensors>();
builder.Services.AddScoped<Service_Database_Manager_Devices>();
builder.Services.AddScoped<Service_Database_Manager_Device_I2CDevices>();
builder.Services.AddScoped<Service_Database_Manager_Services>();
builder.Services.AddScoped<Service_Database_Manager_MQTT_Subscriptions>();
builder.Services.AddScoped<Service_Database_Manager_Collectors>();
builder.Services.AddScoped<Service_Database_Manager_Junctions>();
builder.Services.AddScoped<Service_Database_Manager_JunctionLinks>();
builder.Services.AddScoped<Service_Database_Manager_Layouts>();
builder.Services.AddScoped<Service_Manager_Device_Sync>();
builder.Services.AddScoped<Service_Manager_Payloads>();
builder.Services.AddScoped<Service_Manager_Sensors>();
builder.Services.AddScoped<Service_Manager_OTA>();
builder.Services.AddScoped<Service_Manager_CloudDevices>();
builder.Services.AddScoped<Service_Manager_LocalDeviceSync>();
builder.Services.AddScoped<Service_Database_Manager_FrameEngine>();
builder.Services.AddScoped<Service_Database_Manager_Subscriptions>();
builder.Services.AddScoped<Service_Database_Manager_EventRules>();
builder.Services.AddScoped<Service_Database_Manager_TransitionRules>();
builder.Services.AddScoped<IFrameEngineHashUtility, Service_FrameEngine_HashUtility>();
builder.Services.AddScoped<IFrameEngineAssetReferenceUpdater, Service_FrameEngine_AssetReferenceUpdater>();
builder.Services.AddScoped<Service_FrameEngine_Filesystem>();
builder.Services.AddScoped<Service_Database_Manager_LoggingSettings>();
builder.Services.AddScoped<Service_Database_Manager_NotificationSettings>();

// Lab module (HOMELAB) — self-contained; removing these lines + the Lab_* tables
// and Controller_Lab_* files removes the module without touching anything else
builder.Services.AddScoped<Service_Database_Manager_Lab_Machines>();
builder.Services.AddScoped<Service_Database_Manager_Lab_Components>();
builder.Services.AddScoped<Service_Database_Manager_Lab_MachineGroups>();
builder.Services.AddScoped<Service_Database_Manager_Lab_Attachments>();
builder.Services.AddScoped<Service_Database_Manager_Lab_MarketValues>();
builder.Services.AddScoped<Service_Lab_Attachment_Store>();
// Singleton: upload tickets are short-lived in-memory state shared across requests.
builder.Services.AddSingleton<Service_Lab_Attachment_Tickets>();
builder.Services.AddScoped<Service_Database_Manager_Lab_Spaces>();
builder.Services.AddScoped<Service_Database_Manager_Lab_ComponentTypes>();

// Built once, rendered two ways: as text by the MCP tool, as cards by the dashboard.
builder.Services.AddScoped<Service_Lab_Briefing>();
builder.Services.AddScoped<Service_Lab_Query>();
// The backups page as data: locations, the jobs between them, rules.
builder.Services.AddScoped<Service_Database_Manager_Lab_BackupDesign>();
builder.Services.AddScoped<Service_Database_Manager_Lab_Network>();

// Models module (MODELS) — the weights catalog, serving map and measurement ledger.
builder.Services.AddScoped<Service_Database_Manager_Models_Catalog>();
builder.Services.AddScoped<Service_Database_Manager_Models_Serving>();
builder.Services.AddScoped<Service_Database_Manager_Models_ServingDesign>();
builder.Services.AddScoped<Service_Database_Manager_Models_Benchmarks>();
builder.Services.AddScoped<Service_Database_Manager_Models_ReferenceScores>();
builder.Services.AddScoped<Service_Database_Manager_Models_FitVerdicts>();

// Lab/Models cloud sync push — opt-in, allowlist-projected (Model_Lab_SyncContract).
// Singleton: Service_CloudSync's loop and the controller share its status.
builder.Services.AddSingleton<Service_Lab_CloudSyncPush>();

// Lab MCP endpoint. The key lives in the database (Settings), encrypted, with optional
// password protection — the same shape as Collectors' access tokens. It is therefore
// resolved per request rather than at startup, so setting or clearing it takes effect
// without a restart. Settings is the only source — there is no configuration or
// environment override, so a container deploy sets the key through the UI like any
// other install.
builder.Services.AddSingleton<Service_Lab_McpKey>();
builder.Services.AddSingleton<Service_Lab_MCP_Tools>();
builder.Services.AddSingleton<Service_Models_MCP_Tools>();
builder.Services
    .AddMcpServer()
    .WithHttpTransport()
    .WithTools<Service_Lab_MCP_Tools>()
    .WithTools<Service_Models_MCP_Tools>();   // same /mcp, same key — same box, same trust boundary

// Core singleton services
builder.Services.AddSingleton<IService_Settings, Service_Settings>();
builder.Services.AddSingleton<Service_Docs_Sites>();
builder.Services.AddSingleton<Service_Manager_Connections>();
builder.Services.AddSingleton<Service_Manager_Inbound_Sensors>();
builder.Services.AddSingleton<Service_Manager_Events>();
builder.Services.AddSingleton<Service_Manager_Polling>();
builder.Services.AddSingleton<Service_Manager_COM_Ports>();
builder.Services.AddSingleton<Service_Manager_Network_Scan>();
builder.Services.AddSingleton<Service_Stream_Manager_MQTT>();
builder.Services.AddSingleton<Service_Stream_Manager_HTTP>();
builder.Services.AddSingleton<Service_Stream_Manager_WebSocket>();
builder.Services.AddSingleton<Service_Stream_Manager_COM>();
builder.Services.AddSingleton<Service_Stream_Manager_Virtual>();
builder.Services.AddSingleton<Service_FrameEngine>();
builder.Services.AddSingleton<Service_FrameEngine_Puppeteer>();
builder.Services.AddSingleton<Service_FrameEngine_Puppeteer_Streaming>();
builder.Services.AddSingleton<Service_FrameEngine_AssetPathResolver>();
builder.Services.AddSingleton<Service_LayoutLoader>();
builder.Services.AddSingleton<Service_Database_Manager_StreamHistory>();
builder.Services.AddSingleton<Service_Stream_History_Manager>();
builder.Services.AddSingleton<StartupSignals>();
builder.Services.AddSingleton<Service_Notifications>();
builder.Services.AddSingleton<Service_CloudSync>();
// ⛔ A BackgroundService's ExecuteAsync only runs when HOSTED. This line was
// missing from the day the lab-sync seam was wired (caught when a
// cloud-queued write sat pending forever): the 60s tick - the periodic
// snapshot push (and the since-removed command applier) - had never executed once; every
// sync that ever reached the cloud was a manual "Sync now". The singleton
// registration above stays so the controller shares the same instance.
builder.Services.AddHostedService(sp => sp.GetRequiredService<Service_CloudSync>());
builder.Services.AddSingleton<Service_Image_Processor>();
builder.Services.AddSingleton<Service_Stream_Manager_MJPEG>();
builder.Services.AddSingleton<Service_Events>();
builder.Services.AddSingleton<Service_CloudBackup_Scheduler>();
builder.Services.AddSingleton<Service_BlitMode_ResourceMonitor>();
builder.Services.AddSingleton<Service_StreamHistory_ResourceMonitor>();
builder.Services.AddSingleton<Service_LoginAndAuthentication_Logger>();
builder.Services.AddSingleton<Service_CloudBackupScheduler_Logger>();
builder.Services.AddSingleton<Service_JunctionStartup_Logger>();
builder.Services.AddSingleton<Service_LogRotation_Manager>();

// Register WebSocket services
builder.Services.AddSingleton<Service_Manager_WebSocket_Client>();
builder.Services.AddSingleton<Service_Manager_WebSocket_Server>();
builder.Services.AddSingleton<Service_Manager_Payloads_XSD_Sensor>();
builder.Services.AddSingleton<Service_Manager_Payloads_XSD_Preload>();
builder.Services.AddSingleton<Service_Manager_WebSocket_Server_Broadcast>();
builder.Services.AddSingleton<Service_Stream_Manager_Broadcast>();
builder.Services.AddSingleton<Service_Unified_Notification_Broadcaster>();

// Register Token IPC Client for auto-updates
builder.Services.AddSingleton<Service_TokenIpcClient>();

// Register SSH services
builder.Services.AddSingleton<Service_Manager_SSH>();

// Service factory for dynamic service creation
builder.Services.AddSingleton<Func<Type, Model_Service, IService>>(provider => (serviceType, modelService) =>
{
    if (serviceType == typeof(Service_MQTT))
    {
        var mqttInstance = ActivatorUtilities.CreateInstance<Service_MQTT>(provider);
        mqttInstance.SetService(modelService);
        return mqttInstance;
    }
    else if (serviceType == typeof(Service_HomeAssistant))
    {
        // Use singleton pattern for HomeAssistant
        var haInstance = Service_HomeAssistant.GetInstance(modelService);
        return haInstance;
    }
    else if (serviceType == typeof(Service_Grafana))
    {
        // Use singleton pattern for Grafana
        var grafanaInstance = Service_Grafana.GetInstance(modelService);
        return grafanaInstance;
    }
    throw new Exception($"Service type '{serviceType}' not recognized.");
});

builder.Services.AddSingleton<Func<string, Service_Send_Data_COM>>(provider => comPort =>
{
    var comPortManager = provider.GetRequiredService<Service_Manager_COM_Ports>();
    return new Service_Send_Data_COM(comPortManager, comPort);
});

builder.Services.AddTransient<DataCollector_Cloudflare>();
builder.Services.AddTransient<DataCollector_EventEngine>();
builder.Services.AddTransient<DataCollector_Github>();
builder.Services.AddTransient<DataCollector_Host>();
builder.Services.AddTransient<DataCollector_HWiNFO>();
builder.Services.AddTransient<DataCollector_iCal>();
builder.Services.AddTransient<DataCollector_LibreHardwareMonitor>();
builder.Services.AddTransient<DataCollector_SSH_Linux>();
builder.Services.AddTransient<DataCollector_MQTT>();
builder.Services.AddTransient<DataCollector_NeoPixelColor>();
builder.Services.AddTransient<DataCollector_RateTester>();
builder.Services.AddTransient<DataCollector_Render>();
builder.Services.AddTransient<DataCollector_SonarrCalendar>();
builder.Services.AddTransient<DataCollector_Stripe>();
builder.Services.AddTransient<DataCollector_Unraid>();
builder.Services.AddTransient<DataCollector_UptimeKuma>();
builder.Services.AddTransient<DataCollector_XSD>();

builder.Services.AddSingleton<Service_CollectorMetadataRegistry>();

// Collector plugin system
builder.Services.Configure<Model_PluginConfig>(builder.Configuration.GetSection("CollectorPlugins"));

var pluginConfig = builder.Configuration.GetSection("CollectorPlugins").Get<Model_PluginConfig>() ?? new Model_PluginConfig();
var resolvedPluginsDir = !string.IsNullOrEmpty(pluginConfig.PluginsDirectory)
    ? pluginConfig.PluginsDirectory
    : Path.Combine(dataDirectory, "collectors");

builder.Services.AddSingleton(new Service_PluginManager(bundledCollectorsDir, resolvedPluginsDir, pluginConfig));

// Element plugin system
var elementPluginConfig = builder.Configuration.GetSection("ElementPlugins").Get<Model_ElementPluginConfig>() ?? new Model_ElementPluginConfig();
var resolvedElementsDir = !string.IsNullOrEmpty(elementPluginConfig.ElementsDirectory)
    ? elementPluginConfig.ElementsDirectory
    : Path.Combine(dataDirectory, "elements");

builder.Services.AddSingleton(new Service_ElementPluginRegistry(resolvedElementsDir, elementPluginConfig.Enabled));

// Payload plugin system
var payloadPluginEnabled = builder.Configuration.GetValue<bool>("PayloadPlugins:Enabled", true);
builder.Services.AddSingleton(new Service_PayloadPluginManager(bundledProtocolsDir, protocolsDirectory, payloadPluginEnabled));
builder.Services.AddSingleton<Service_PayloadMetadataRegistry>();

// Shader plugin system
var shaderPluginConfig = builder.Configuration.GetSection("ShaderPlugins").Get<Model_ShaderPluginConfig>() ?? new Model_ShaderPluginConfig();
var resolvedShadersDir = !string.IsNullOrEmpty(shaderPluginConfig.ShadersDirectory)
    ? shaderPluginConfig.ShadersDirectory
    : Path.Combine(dataDirectory, "shaders");
builder.Services.AddSingleton(new Service_ShaderPluginRegistry(bundledShadersDir, resolvedShadersDir, shaderPluginConfig.Enabled));

builder.Services.AddSingleton<Func<Model_Collector, Task<IDataCollector>>>(provider =>
{
    var creatorMap = new Dictionary<string, Func<Model_Collector, IDataCollector>>(StringComparer.OrdinalIgnoreCase)
        {
            { "Cloudflare", c => { var i = provider.GetRequiredService<DataCollector_Cloudflare>(); i.ApplyConfiguration(c); return i; } },
            { "EventEngine", c => { var i = provider.GetRequiredService<DataCollector_EventEngine>(); i.ApplyConfiguration(c); return i; } },
            { "Github", c => { var i = provider.GetRequiredService<DataCollector_Github>(); i.ApplyConfiguration(c); return i; } },
            { "Host", c => { var i = provider.GetRequiredService<DataCollector_Host>(); i.ApplyConfiguration(c); return i; } },
            { "HWiNFO", c => { var i = provider.GetRequiredService<DataCollector_HWiNFO>(); i.ApplyConfiguration(c); return i; } },
            { "iCal", c => { var i = provider.GetRequiredService<DataCollector_iCal>(); i.ApplyConfiguration(c); return i; } },
            { "LibreHardwareMonitor", c => { var i = provider.GetRequiredService<DataCollector_LibreHardwareMonitor>(); i.ApplyConfiguration(c); return i; } },
            { "MQTT", c => { var i = provider.GetRequiredService<DataCollector_MQTT>(); i.ApplyConfiguration(c); return i; } },
            { "NeoPixelColor", c => { var i = provider.GetRequiredService<DataCollector_NeoPixelColor>(); i.ApplyConfiguration(c); return i; } },
            { "RateTester", c => { var i = provider.GetRequiredService<DataCollector_RateTester>(); i.ApplyConfiguration(c); return i; } },
            { "Render", c => { var i = provider.GetRequiredService<DataCollector_Render>(); i.ApplyConfiguration(c); return i; } },
            { "SonarrCalendar", c => { var i = provider.GetRequiredService<DataCollector_SonarrCalendar>(); i.ApplyConfiguration(c); return i; } },
            { "Stripe", c => { var i = provider.GetRequiredService<DataCollector_Stripe>(); i.ApplyConfiguration(c); return i; } },
            { "SSH_Linux", c => { var i = provider.GetRequiredService<DataCollector_SSH_Linux>(); i.ApplyConfiguration(c); return i; } },
            { "Unraid", c => { var i = provider.GetRequiredService<DataCollector_Unraid>(); i.ApplyConfiguration(c); return i; } },
            { "UptimeKuma", c => { var i = provider.GetRequiredService<DataCollector_UptimeKuma>(); i.ApplyConfiguration(c); return i; } },
            { "XSD", c => { var i = provider.GetRequiredService<DataCollector_XSD>(); i.ApplyConfiguration(c); return i; } }
        };

    // Plugin types are created through the plugin manager below; a plugin may not shadow a native collector.
    var pluginManager = provider.GetRequiredService<Service_PluginManager>();
    foreach (var pluginType in pluginManager.GetRegisteredTypes().Where(creatorMap.ContainsKey))
        Console.WriteLine($"[PLUGINS] WARNING: Plugin type '{pluginType}' conflicts with native collector — skipping");

    var cache = new ConcurrentDictionary<int, IDataCollector>();
    return async collector =>
    {
        if (cache.TryGetValue(collector.Id, out var existing))
        {
            existing.ApplyConfiguration(collector);
            return existing;
        }
        if (creatorMap.TryGetValue(collector.CollectorType, out var creator))
        {
            var newInstance = creator(collector);
            cache[collector.Id] = newInstance;
            return newInstance;
        }
        // Plugin collectors, including types discovered after the factory was built
        if (pluginManager.HasPlugin(collector.CollectorType))
        {
            var pluginCollector = await pluginManager.GetOrCreateCollectorAsync(collector);
            cache[collector.Id] = pluginCollector;
            return pluginCollector;
        }
        throw new Exception($"No collector handler registered for CollectorType '{collector.CollectorType}'");
    };
});

// HOSTED SERVICES - Service_Startup coordinates the startup sequence
builder.Services.AddHostedService<Service_Startup>();
builder.Services.AddHostedService<Service_Heartbeats>();
builder.Services.AddHostedService<Service_Connection_Status>();
builder.Services.AddHostedService<Service_CollectorTesting>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<Service_Manager_WebSocket_Client>());
builder.Services.AddHostedService(provider => provider.GetRequiredService<Service_Manager_SSH>());
// LAST, so it stops FIRST: it drains junctions and streams before the services above stop.
builder.Services.AddHostedService<Service_Shutdown>();

builder.Services.AddControllersWithViews(options =>
    {
        // Global authorization: all endpoints require auth by default.
        // Endpoints that must stay public use [AllowAnonymous].
        options.Filters.Add(new Microsoft.AspNetCore.Mvc.Authorization.AuthorizeFilter());
    })
    .AddJsonOptions(options =>
    {
        // Use camelCase for JSON property names to match frontend TypeScript conventions
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

// Configure request size limits for large file uploads (database backups)
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 524288000; // 500MB
});

builder.Services.Configure<Microsoft.AspNetCore.Server.Kestrel.Core.KestrelServerOptions>(options =>
{
    options.Limits.MaxRequestBodySize = 524288000; // 500MB
});

var app = builder.Build();

app.Lifetime.ApplicationStarted.Register(async () =>
{
    using var scope = app.Services.CreateScope();
    var dbInitializer = scope.ServiceProvider.GetRequiredService<Service_Database_Initializer>();
    var startupSignals = scope.ServiceProvider.GetRequiredService<StartupSignals>();

    try
    {
        await dbInitializer.InitializeAsync();
        startupSignals.DatabaseInitialized.TrySetResult(true);

        // Initialize logging settings defaults
        var loggingSettingsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
        await loggingSettingsDb.InitializeDefaultsAsync();

        // Run log rotation cleanup on startup
        try
        {
            var logRotationManager = app.Services.GetRequiredService<Service_LogRotation_Manager>();
            await logRotationManager.RunStartupCleanupAsync();
            Console.WriteLine("[STARTUP] Log rotation cleanup completed");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[STARTUP] Log rotation cleanup failed: {ex.Message}");
        }

        // ===================================================================
        // Plugin Discovery
        // ===================================================================
        try
        {
            var pluginMgr = app.Services.GetRequiredService<Service_PluginManager>();
            var nativeTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "Cloudflare", "EventEngine", "Github",
                "Host", "HWiNFO", "iCal", "LibreHardwareMonitor",
                "MQTT", "NeoPixelColor", "RateTester", "Render", "SonarrCalendar",
                "SSH_Linux", "Stripe", "Unraid", "UptimeKuma", "XSD"
            };
            await pluginMgr.DiscoverAndCacheMetadataAsync(nativeTypes);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[STARTUP] Plugin discovery failed: {ex.Message}");
        }
        startupSignals.PluginDiscoveryComplete.TrySetResult(true);

        // ===================================================================
        // Payload Plugin Discovery
        // ===================================================================
        try
        {
            var payloadMgr = app.Services.GetRequiredService<Service_PayloadPluginManager>();
            await payloadMgr.DiscoverAndCacheMetadataAsync();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[STARTUP] Payload plugin discovery failed: {ex.Message}");
        }

        // Element plugin discovery moved before app.Run() — see below

        var eventService = app.Services.GetRequiredService<Service_Events>();
        await eventService.InitializeAsync();
        startupSignals.EventEngineInitialized.TrySetResult(true);

        // ===================================================================
        // Blit Mode Resource Monitoring
        // ===================================================================
        try
        {
            var blitResourceMonitor = app.Services.GetRequiredService<Service_BlitMode_ResourceMonitor>();
            await blitResourceMonitor.StartMonitoringAsync();
            Console.WriteLine("[STARTUP] Blit Mode resource monitoring started");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[STARTUP] Blit Mode resource monitoring failed to start: {ex.Message}");
        }

        // ===================================================================
        // Stream History Resource Monitoring
        // ===================================================================
        try
        {
            var streamHistoryMonitor = app.Services.GetRequiredService<Service_StreamHistory_ResourceMonitor>();
            await streamHistoryMonitor.StartMonitoringAsync();
            Console.WriteLine("[STARTUP] Stream History resource monitoring started");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[STARTUP] Stream History resource monitoring failed to start: {ex.Message}");
        }

        // ===================================================================
        // Login & Authentication Logger
        // ===================================================================
        try
        {
            var authLogger = app.Services.GetRequiredService<Service_LoginAndAuthentication_Logger>();
            await authLogger.InitializeAsync();
            Console.WriteLine("[STARTUP] Login & Authentication logging started");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[STARTUP] Login & Authentication logging failed to start: {ex.Message}");
        }

        // ===================================================================
        // Cloud Backup Scheduler Logger
        // ===================================================================
        try
        {
            var cloudBackupLogger = app.Services.GetRequiredService<Service_CloudBackupScheduler_Logger>();
            await cloudBackupLogger.InitializeAsync();
            Console.WriteLine("[STARTUP] Cloud Backup Scheduler logging started");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[STARTUP] Cloud Backup Scheduler logging failed to start: {ex.Message}");
        }

        // ===================================================================
        // Junction Startup Logger
        // ===================================================================
        try
        {
            var junctionStartupLogger = app.Services.GetRequiredService<Service_JunctionStartup_Logger>();
            await junctionStartupLogger.InitializeAsync();
            Console.WriteLine("[STARTUP] Junction Startup logging started");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[STARTUP] Junction Startup logging failed to start: {ex.Message}");
        }

        // ===================================================================
        // FrameEngine Auto-Cleanup on Startup
        // ===================================================================
        try
        {
            var settingsService = scope.ServiceProvider.GetRequiredService<IService_Settings>();
            var autoCleanupEnabled = await settingsService.GetBoolSettingAsync("frameengine_auto_cleanup", false);

            if (autoCleanupEnabled)
            {
                Console.WriteLine("[STARTUP] FrameEngine auto-cleanup enabled, scanning for orphaned files...");

                var frameLayoutService = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();
                var subscriptionService = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Subscriptions>();
                var dbPathProvider = scope.ServiceProvider.GetRequiredService<DatabasePathProvider>();
                var webHostEnvironment = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();
                var hashUtility = scope.ServiceProvider.GetRequiredService<IFrameEngineHashUtility>();

                var filesystemService = new Service_FrameEngine_Filesystem(
                    frameLayoutService,
                    subscriptionService,
                    dbPathProvider,
                    webHostEnvironment,
                    hashUtility);

                var cleanupResult = await filesystemService.CleanupOrphanedFiles();

                if (cleanupResult.DeletedCount > 0)
                {
                    Console.WriteLine($"[STARTUP] FrameEngine cleanup: Removed {cleanupResult.DeletedCount} orphaned files, freed {cleanupResult.FreedSpaceMB:F2} MB");
                }
                else
                {
                    Console.WriteLine("[STARTUP] FrameEngine cleanup: No orphaned files found");
                }

                if (cleanupResult.Errors.Count > 0)
                {
                    Console.WriteLine($"[STARTUP] FrameEngine cleanup: {cleanupResult.Errors.Count} error(s) occurred during cleanup");
                    foreach (var error in cleanupResult.Errors)
                    {
                        Console.WriteLine($"[STARTUP]   - {error}");
                    }
                }
            }
            else
            {
                Console.WriteLine("[STARTUP] FrameEngine auto-cleanup disabled");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[STARTUP] FrameEngine auto-cleanup failed: {ex.Message}");
            Console.WriteLine($"[STARTUP]   - {ex.StackTrace}");
            // Don't fail startup if cleanup fails
        }
        // ===================================================================
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[STARTUP] Database initialization failed: {ex.Message}");
        startupSignals.DatabaseInitialized.TrySetException(ex);
        startupSignals.EventEngineInitialized.TrySetException(ex);
    }
});

// The orderly shutdown runs in Service_Shutdown (a hosted service the host awaits).

builder.WebHost.UseUrls("http://0.0.0.0:7180");

// Security: baseline security response headers.
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["X-Frame-Options"] = "SAMEORIGIN";
    headers["Referrer-Policy"] = "no-referrer";
    await next();
});

app.UseCors("AllowFrontend");

// Add WebSocket middleware BEFORE static files
app.UseWebSockets();

// index.html must be revalidated on every load: without Cache-Control browsers cache it by its
// Last-Modified date, and after an update a cached page asks for the old hashed bundle, which is
// gone (404, blank page). The hashed /static files can still cache normally.
var webUiFiles = new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        if (ctx.File.Name == "index.html")
            ctx.Context.Response.Headers.CacheControl = "no-cache";
    }
};
app.UseStaticFiles(webUiFiles);

// Frames directory for FrameEngine - ensure directory exists
if (!Directory.Exists(framesPath))
{
    Directory.CreateDirectory(framesPath);
    Console.WriteLine($"[STARTUP] Created missing frames directory: {framesPath}");
}

// Security: serve only known media types instead of ServeUnknownFileTypes.
var mediaContentTypeProvider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider(
    new Dictionary<string, string>
    {
        { ".png", "image/png" },
        { ".jpg", "image/jpeg" },
        { ".jpeg", "image/jpeg" },
        { ".gif", "image/gif" },
        { ".webp", "image/webp" },
        { ".svg", "image/svg+xml" },
        { ".bmp", "image/bmp" },
        { ".mp4", "video/mp4" },
        { ".webm", "video/webm" },
        { ".riv", "application/octet-stream" },
        { ".json", "application/json" }
    });

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(framesPath),
    RequestPath = "/frames",
    ContentTypeProvider = mediaContentTypeProvider
});

// Internal FrameEngine Templates
var templatesPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "frameengine", "templates");
if (Directory.Exists(templatesPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(templatesPath),
        RequestPath = "/templates",
        ContentTypeProvider = mediaContentTypeProvider
    });

    Console.WriteLine($"[STARTUP] Templates directory:  {templatesPath}");
}

// Element plugins — serve bundled JS files for dynamic import by the frontend
if (Directory.Exists(resolvedElementsDir))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(resolvedElementsDir),
        RequestPath = "/elements",
        ContentTypeProvider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider(
            new Dictionary<string, string>
            {
                { ".js", "application/javascript" },
                { ".mjs", "application/javascript" },
                { ".json", "application/json" },
                { ".map", "application/json" }
            })
    });

    Console.WriteLine($"[STARTUP] Elements directory:   {resolvedElementsDir}");
}

// Documentation — LAB_DOCS_ROOTS is the allow-list; sites are served by Controller_Docs.
//
// ⛔ NOT UseStaticFiles. Static mounts are fixed at startup, so a site added from the
// Configure tab would 404 until a restart - and UseStaticFiles serves no default document,
// so a request for a directory fell through to the SPA fallback and rendered JunctionRelay
// inside its own iframe. MkDocs uses directory URLs for every page, so that was every link.
if (Service_Docs_Sites.Enabled)
    Console.WriteLine($"[STARTUP] Docs roots:            {string.Join(", ", Service_Docs_Sites.Roots())}");
else
    Console.WriteLine($"[STARTUP] Docs:                  off ({Service_Docs_Sites.RootsVar} not set)");

app.UseRouting();

app.UseRateLimiter();

// Cookie-to-header middleware: read httpOnly session cookie and inject as Bearer token.
// This allows the existing JWT middleware to work unchanged.
app.Use(async (context, next) =>
{
    if (!context.Request.Headers.ContainsKey("Authorization"))
    {
        var cookieManager = context.RequestServices.GetRequiredService<Service_AuthCookieManager>();
        var token = cookieManager.GetDecryptedToken(context.Request);
        if (!string.IsNullOrEmpty(token))
        {
            context.Request.Headers["Authorization"] = $"Bearer {token}";
        }
    }
    await next();
});

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Lab MCP endpoint (HOMELAB). The global AuthorizeFilter covers MVC controllers only, so
// this endpoint carries its own key check: a machine-to-machine client cannot refresh an
// 8-hour user JWT, and the key must hold even when the server's auth mode is `none`.
//
// The key is resolved per request from Service_Lab_McpKey, so it can be set, unlocked or
// cleared while the server runs.
app.UseWhen(
    context => context.Request.Path.StartsWithSegments("/mcp"),
    branch => branch.Use(async (context, next) =>
    {
        var keyService = context.RequestServices.GetRequiredService<Service_Lab_McpKey>();
        var expected = await keyService.ResolveKeyAsync();

        // No key configured, or password-protected and still locked. Answer 404 rather
        // than 401 so the endpoint is indistinguishable from a route that does not exist —
        // an unauthenticated probe learns nothing about whether MCP is available here.
        if (string.IsNullOrEmpty(expected))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        var header = context.Request.Headers.Authorization.ToString();
        const string scheme = "Bearer ";

        var presented = header.StartsWith(scheme, StringComparison.OrdinalIgnoreCase)
            ? System.Text.Encoding.UTF8.GetBytes(header[scheme.Length..].Trim())
            : Array.Empty<byte>();

        var expectedBytes = System.Text.Encoding.UTF8.GetBytes(expected);

        if (!System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(presented, expectedBytes))
        {
            // 404, matching the no-key case (and the cloud head): a wrong key must be
            // indistinguishable from the endpoint not existing, or probing with garbage
            // keys confirms that MCP is here at all.
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        await next();
    }));

// Rate-limited (audit L2). Every request costs a settings read and a decrypt before
// the key is even compared, and this endpoint is frequently internet-facing.
app.MapMcp("/mcp").RequireRateLimiting("mcp-local");

app.MapFallbackToFile("index.html", webUiFiles);

// ===================================================================
// Element Plugin Discovery — runs before app.Run() so the registry is
// populated before the server accepts any HTTP requests.
// ===================================================================
try
{
    var elementRegistry = app.Services.GetRequiredService<Service_ElementPluginRegistry>();
    elementRegistry.DiscoverAndRegister();
}
catch (Exception ex)
{
    Console.WriteLine($"[STARTUP] Element plugin discovery failed: {ex.Message}");
}

// ===================================================================
// Shader Plugin Discovery — runs before app.Run() so the registry is
// populated before the server accepts any HTTP requests.
// ===================================================================
try
{
    var shaderRegistry = app.Services.GetRequiredService<Service_ShaderPluginRegistry>();
    shaderRegistry.DiscoverAndRegister();
}
catch (Exception ex)
{
    Console.WriteLine($"[STARTUP] Shader plugin discovery failed: {ex.Message}");
}

app.Run();

// ============================================================================
// HELPER CLASSES
// ============================================================================

public class DataDirectoryProvider
{
    public string DataDirectory { get; }

    public DataDirectoryProvider(string dataDirectory)
    {
        DataDirectory = dataDirectory;
    }
}