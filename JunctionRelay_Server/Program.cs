using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Data;
using Microsoft.Data.Sqlite;
using System.Runtime.InteropServices;
using JunctionRelayServer.Services;
using System.IO;
using Dapper;
using JunctionRelayServer.Collectors;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using JunctionRelayServer;
using JunctionRelayServer.Services.FactoryServices;
using JunctionRelayServer.Utils;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using JunctionRelayServer.Middleware;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebSockets;

var builder = WebApplication.CreateBuilder(args);

// Check for database deletion marker BEFORE setting up database paths
var deleteMarkerPath = Path.Combine(builder.Environment.ContentRootPath, ".delete-all-data");
if (File.Exists(deleteMarkerPath))
{
    try
    {
        Console.WriteLine("Database deletion marker found - proceeding with data cleanup...");

        // Determine database paths for deletion
        string deletionDbPath;
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            deletionDbPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "JunctionRelay",
                "jr_database.db"
            );
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            deletionDbPath = Path.Combine(Directory.GetCurrentDirectory(), "data", "jr_database.db");
        }
        else
        {
            deletionDbPath = "jr_database.db";
        }

        var deletionDbDirectory = Path.GetDirectoryName(deletionDbPath);

        // Delete database files
        if (File.Exists(deletionDbPath))
        {
            File.Delete(deletionDbPath);
            Console.WriteLine("Deleted main database file");
        }

        // Delete database journal files (SQLite artifacts)
        if (!string.IsNullOrEmpty(deletionDbDirectory))
        {
            var dbFileName = Path.GetFileNameWithoutExtension(deletionDbPath);
            var journalFiles = Directory.GetFiles(deletionDbDirectory, $"{dbFileName}.*")
                .Where(f => f.EndsWith(".db-journal") || f.EndsWith(".db-wal") || f.EndsWith(".db-shm"));

            foreach (var file in journalFiles)
            {
                File.Delete(file);
                Console.WriteLine($"Deleted database artifact: {Path.GetFileName(file)}");
            }
        }

        // Delete encryption keys directory
        var deletionKeysDirectory = !string.IsNullOrEmpty(deletionDbDirectory) ? Path.Combine(deletionDbDirectory, "keys") : "keys";
        if (Directory.Exists(deletionKeysDirectory))
        {
            Directory.Delete(deletionKeysDirectory, true);
            Console.WriteLine("Deleted encryption keys directory");
        }

        // Delete cache directories
        var firmwareDirectory = Path.Combine(builder.Environment.ContentRootPath, "Firmware");
        if (Directory.Exists(firmwareDirectory))
        {
            Directory.Delete(firmwareDirectory, true);
            Console.WriteLine("Deleted firmware cache directory");
        }

        // Delete logs directory
        var logsDirectory = Path.Combine(builder.Environment.ContentRootPath, "Logs");
        if (Directory.Exists(logsDirectory))
        {
            Directory.Delete(logsDirectory, true);
            Console.WriteLine("Deleted logs directory");
        }

        // Remove the marker file
        File.Delete(deleteMarkerPath);
        Console.WriteLine("Removed deletion marker file");

        Console.WriteLine("Database deletion completed successfully - starting with fresh setup");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error during database deletion: {ex.Message}");
        // Continue with startup even if deletion fails
    }
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

string dbPath;
if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
{
    dbPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "JunctionRelay",
        "jr_database.db"
    );
}
else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
{
    dbPath = Path.Combine(Directory.GetCurrentDirectory(), "data", "jr_database.db");
}
else
{
    dbPath = "jr_database.db";
}

var dbDirectory = Path.GetDirectoryName(dbPath);
if (!string.IsNullOrEmpty(dbDirectory) && !Directory.Exists(dbDirectory))
{
    Directory.CreateDirectory(dbDirectory);
}

var pending = dbPath + ".pending";
if (File.Exists(pending))
{
    File.Copy(pending, dbPath, overwrite: true);
    File.Delete(pending);
}

builder.Services.AddSingleton(new DatabasePathProvider(dbPath));
builder.Services.AddSingleton<IDbConnection>(_ => new SqliteConnection($"Data Source={dbPath}"));

// Add Data Protection for secrets encryption
var keysDirectory = !string.IsNullOrEmpty(dbDirectory) ? Path.Combine(dbDirectory, "keys") : "keys";
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(keysDirectory))
    .SetApplicationName("JunctionRelay");

// Register the secrets service
builder.Services.AddSingleton<ISecretsService, SecretsService>();

// Authentication Services
builder.Services.AddAuthentication("Bearer")
    .AddJwtBearer("Bearer", options =>
    {
        var secretKey = builder.Configuration["Jwt:SecretKey"] ?? "JunctionRelay_Default_Secret_Key_Change_In_Production_Min_32_Chars!";
        var issuer = builder.Configuration["Jwt:Issuer"] ?? "JunctionRelay";

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey)),
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidAudience = issuer,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization();

// Register authentication services
builder.Services.AddSingleton<IService_Auth, Service_Auth>();
builder.Services.AddSingleton<IService_Jwt, Service_Jwt>();

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
builder.Services.AddScoped<Service_Database_Manager_Protocols>();
builder.Services.AddScoped<Service_Database_Manager_Layouts>();
builder.Services.AddScoped<Service_Manager_Payloads>();
builder.Services.AddScoped<Service_Manager_Sensors>();
builder.Services.AddScoped<Service_Manager_OTA>();

builder.Services.AddSingleton<StartupSignals>();
builder.Services.AddHostedService<Service_Heartbeats>();

builder.Services.AddSingleton<Service_Manager_Connections>();
builder.Services.AddSingleton<Service_Manager_Polling>();
builder.Services.AddSingleton<Service_Manager_COM_Ports>();
builder.Services.AddSingleton<Service_Manager_Network_Scan>();
builder.Services.AddSingleton<Service_Stream_Manager_MQTT>();
builder.Services.AddSingleton<Service_Stream_Manager_HTTP>();
builder.Services.AddSingleton<Service_Stream_Manager_COM>();

// Register WebSocket service
builder.Services.AddSingleton<Service_Manager_WebSocket_Devices>();

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
        return new Service_HomeAssistant(modelService.HomeAssistantAddress, modelService.HomeAssistantAPIKey);
    }
    throw new Exception($"Service type '{serviceType}' not recognized.");
});

builder.Services.AddSingleton<Func<string, Service_Send_Data_COM>>(provider => comPort =>
{
    var comPortManager = provider.GetRequiredService<Service_Manager_COM_Ports>();
    return new Service_Send_Data_COM(comPortManager, comPort);
});

builder.Services.AddTransient<DataCollector_Host>();
builder.Services.AddTransient<DataCollector_HomeAssistant>();
builder.Services.AddTransient<DataCollector_LibreHardwareMonitor>();
builder.Services.AddTransient<DataCollector_MQTT>();
builder.Services.AddTransient<DataCollector_NeoPixelColor>();
builder.Services.AddTransient<DataCollector_RateTester>();
builder.Services.AddTransient<DataCollector_UptimeKuma>();
builder.Services.AddTransient<Service_MQTT>();

builder.Services.AddSingleton<Func<Model_Collector, IDataCollector>>(provider =>
{
    var creatorMap = new Dictionary<string, Func<Model_Collector, IDataCollector>>(StringComparer.OrdinalIgnoreCase)
    {
        { "HomeAssistant", c => { var i = provider.GetRequiredService<DataCollector_HomeAssistant>(); i.ApplyConfiguration(c); return i; } },
        { "LibreHardwareMonitor", c => { var i = provider.GetRequiredService<DataCollector_LibreHardwareMonitor>(); i.ApplyConfiguration(c); return i; } },
        { "Host", c => { var i = provider.GetRequiredService<DataCollector_Host>(); i.ApplyConfiguration(c); return i; } },
        { "MQTT", c => { var i = provider.GetRequiredService<DataCollector_MQTT>(); i.ApplyConfiguration(c); return i; } },
        { "NeoPixelColor", c => { var i = provider.GetRequiredService<DataCollector_NeoPixelColor>(); i.ApplyConfiguration(c); return i; } },
        { "RateTester", c => { var i = provider.GetRequiredService<DataCollector_RateTester>(); i.ApplyConfiguration(c); return i; } },
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
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Database initialization failed: {ex.Message}");
        startupSignals.DatabaseInitialized.TrySetException(ex);
    }
});

// Graceful shutdown handler for WebSocket connections
app.Lifetime.ApplicationStopping.Register(async () =>
{
    Console.WriteLine("Application stopping - closing WebSocket connections...");
    using var scope = app.Services.CreateScope();
    var webSocketManager = scope.ServiceProvider.GetService<Service_Manager_WebSocket_Devices>();
    if (webSocketManager != null)
    {
        await webSocketManager.CloseAllConnectionsAsync("Application shutdown");
    }
});

builder.WebHost.UseUrls("http://0.0.0.0:7180");

app.UseCors("AllowFrontend");

// Add WebSocket middleware BEFORE static files
app.UseWebSockets();

app.UseStaticFiles();
app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

// Add JWT middleware AFTER authorization
app.UseMiddleware<Middleware_JwtAuthentication>();

app.MapControllers();
app.MapFallbackToFile("index.html");

Console.WriteLine("Junction Relay WebSocket Service enabled");
Console.WriteLine("Main WebSocket endpoint: /api/device-websocket/connect");

app.Run();