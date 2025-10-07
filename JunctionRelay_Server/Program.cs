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
using JunctionRelay_Server.Services.BackgroundServices;
using JunctionRelay_Server.Services;
using JunctionRelayServer.Services.BackgroundServices;

var builder = WebApplication.CreateBuilder(args);

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

// Ensure all directories exist
Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);
Directory.CreateDirectory(keysDirectory);
Directory.CreateDirectory(framesPath);
Directory.CreateDirectory(firmwareDirectory);
Directory.CreateDirectory(releaseCacheDirectory);
Directory.CreateDirectory(riveDirectory);

Console.WriteLine($"[STARTUP] Data directory:      {dataDirectory}");
Console.WriteLine($"[STARTUP] Database path:       {dbPath}");
Console.WriteLine($"[STARTUP] Keys directory:      {keysDirectory}");
Console.WriteLine($"[STARTUP] Frames directory:    {framesPath}");
Console.WriteLine($"[STARTUP] Firmware directory:  {firmwareDirectory}");
Console.WriteLine($"[STARTUP] Release cache:       {releaseCacheDirectory}");
Console.WriteLine($"[STARTUP] Rive directory:      {riveDirectory}");

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
        policy.WithOrigins("http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Add WebSocket support
builder.Services.AddWebSockets(options =>
{
    options.KeepAliveInterval = TimeSpan.FromSeconds(30);
    options.AllowedOrigins.Add("*"); // Configure as needed for security
});

// Add HttpClient for cloud functionality
builder.Services.AddHttpClient();

// Database configuration
builder.Services.AddSingleton(new DatabasePathProvider(dbPath));
builder.Services.AddSingleton<IDbConnection>(_ => new SqliteConnection($"Data Source={dbPath}"));

// Add Data Protection for secrets encryption
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(keysDirectory))
    .SetApplicationName("JunctionRelay");

// Register the secrets service
builder.Services.AddSingleton<ISecretsService, Service_Secrets>();
builder.Services.AddSingleton<Service_CloudSessionStore>();

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
builder.Services.AddScoped<Service_Layout_Templates>();
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
builder.Services.AddScoped<Service_Database_Manager_EventRules>();

// Core singleton services
builder.Services.AddSingleton<IService_Settings, Service_Settings>();
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
builder.Services.AddSingleton<Service_Database_Manager_StreamHistory>();
builder.Services.AddSingleton<Service_Stream_History_Manager>();
builder.Services.AddSingleton<StartupSignals>();
builder.Services.AddSingleton<Service_Notifications>();
builder.Services.AddSingleton<Service_CloudSync>();
builder.Services.AddSingleton<Service_Image_Processor>();
builder.Services.AddSingleton<Service_Events>();
builder.Services.AddSingleton<Service_CloudBackup_Scheduler>();

// Register WebSocket services
builder.Services.AddSingleton<Service_Manager_WebSocket_Client>();
builder.Services.AddSingleton<Service_Manager_WebSocket_Server>();

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
builder.Services.AddTransient<DataCollector_GenericAPI>();
builder.Services.AddTransient<DataCollector_Github>();
builder.Services.AddTransient<DataCollector_HomeAssistant>();
builder.Services.AddTransient<DataCollector_Host>();
builder.Services.AddTransient<DataCollector_HWiNFO>();
builder.Services.AddTransient<DataCollector_iCal>();
builder.Services.AddTransient<DataCollector_InternetTime>();
builder.Services.AddTransient<DataCollector_LibreHardwareMonitor>();
builder.Services.AddTransient<DataCollector_SSH_Linux>();
builder.Services.AddTransient<DataCollector_MQTT>();
builder.Services.AddTransient<DataCollector_NeoPixelColor>();
builder.Services.AddTransient<DataCollector_RateTester>();
builder.Services.AddTransient<DataCollector_Render>();
builder.Services.AddTransient<DataCollector_SonarrCalendar>();
builder.Services.AddTransient<DataCollector_Stripe>();
builder.Services.AddTransient<DataCollector_SystemTime>();
builder.Services.AddTransient<DataCollector_Unraid>();
builder.Services.AddTransient<DataCollector_UptimeKuma>();


builder.Services.AddSingleton<Func<Model_Collector, IDataCollector>>(provider =>
{
    var creatorMap = new Dictionary<string, Func<Model_Collector, IDataCollector>>(StringComparer.OrdinalIgnoreCase)
        {
            { "Cloudflare", c => { var i = provider.GetRequiredService<DataCollector_Cloudflare>(); i.ApplyConfiguration(c); return i; } },
            { "EventEngine", c => { var i = provider.GetRequiredService<DataCollector_EventEngine>(); i.ApplyConfiguration(c); return i; } },
            { "GenericAPI", c => { var i = provider.GetRequiredService<DataCollector_GenericAPI>(); i.ApplyConfiguration(c); return i; } },
            { "Github", c => { var i = provider.GetRequiredService<DataCollector_Github>(); i.ApplyConfiguration(c); return i; } },
            { "HomeAssistant", c => { var i = provider.GetRequiredService<DataCollector_HomeAssistant>(); i.ApplyConfiguration(c); return i; } },
            { "Host", c => { var i = provider.GetRequiredService<DataCollector_Host>(); i.ApplyConfiguration(c); return i; } },
            { "HWiNFO", c => { var i = provider.GetRequiredService<DataCollector_HWiNFO>(); i.ApplyConfiguration(c); return i; } },
            { "iCal", c => { var i = provider.GetRequiredService<DataCollector_iCal>(); i.ApplyConfiguration(c); return i; } },
            { "InternetTime", c => { var i = provider.GetRequiredService<DataCollector_InternetTime>(); i.ApplyConfiguration(c); return i; } },
            { "LibreHardwareMonitor", c => { var i = provider.GetRequiredService<DataCollector_LibreHardwareMonitor>(); i.ApplyConfiguration(c); return i; } },
            { "MQTT", c => { var i = provider.GetRequiredService<DataCollector_MQTT>(); i.ApplyConfiguration(c); return i; } },
            { "NeoPixelColor", c => { var i = provider.GetRequiredService<DataCollector_NeoPixelColor>(); i.ApplyConfiguration(c); return i; } },
            { "RateTester", c => { var i = provider.GetRequiredService<DataCollector_RateTester>(); i.ApplyConfiguration(c); return i; } },
            { "Render", c => { var i = provider.GetRequiredService<DataCollector_Render>(); i.ApplyConfiguration(c); return i; } },
            { "SonarrCalendar", c => { var i = provider.GetRequiredService<DataCollector_SonarrCalendar>(); i.ApplyConfiguration(c); return i; } },
            { "Stripe", c => { var i = provider.GetRequiredService<DataCollector_Stripe>(); i.ApplyConfiguration(c); return i; } },
            { "SSH_Linux", c => { var i = provider.GetRequiredService<DataCollector_SSH_Linux>(); i.ApplyConfiguration(c); return i; } },
            { "SystemTime", c => { var i = provider.GetRequiredService<DataCollector_SystemTime>(); i.ApplyConfiguration(c); return i; } },
            { "Unraid", c => { var i = provider.GetRequiredService<DataCollector_Unraid>(); i.ApplyConfiguration(c); return i; } },
            { "UptimeKuma", c => { var i = provider.GetRequiredService<DataCollector_UptimeKuma>(); i.ApplyConfiguration(c); return i; } }
        };

    var cache = new ConcurrentDictionary<int, IDataCollector>();
    return collector =>
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
        throw new Exception($"No collector handler registered for CollectorType '{collector.CollectorType}'");
    };
});

// HOSTED SERVICES - Service_Startup coordinates the startup sequence
builder.Services.AddHostedService<Service_Startup>();
builder.Services.AddHostedService<Service_Heartbeats>();
builder.Services.AddHostedService<Service_Connection_Status>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<Service_Manager_WebSocket_Client>());
builder.Services.AddHostedService(provider => provider.GetRequiredService<Service_Manager_SSH>());

builder.Services.AddControllersWithViews();

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

        var eventService = app.Services.GetRequiredService<Service_Events>();
        await eventService.InitializeAsync();
        startupSignals.EventEngineInitialized.TrySetResult(true);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Database initialization failed: {ex.Message}");
        startupSignals.DatabaseInitialized.TrySetException(ex);
        startupSignals.EventEngineInitialized.TrySetException(ex);
    }
});

// Graceful shutdown handler for WebSocket connections
app.Lifetime.ApplicationStopping.Register(() =>
{
    Console.WriteLine("Application stopping - Services will shut down automatically...");
});

builder.WebHost.UseUrls("http://0.0.0.0:7180");

app.UseCors("AllowFrontend");

// Add WebSocket middleware BEFORE static files
app.UseWebSockets();

app.UseStaticFiles();

// Frames directory for FrameEngine
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(framesPath),
    RequestPath = "/frames",
    ServeUnknownFileTypes = true,
    DefaultContentType = "image/png"
});

// Internal FrameEngine Templates
var templatesPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "frameengine", "templates");
if (Directory.Exists(templatesPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(templatesPath),
        RequestPath = "/templates",
        ServeUnknownFileTypes = true,
        DefaultContentType = "image/png"
    });

    Console.WriteLine($"[STARTUP] Templates directory:  {templatesPath}");
}

app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapFallbackToFile("index.html");

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