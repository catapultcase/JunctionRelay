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

using System;
using System.IO;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace JunctionRelayServer.Services
{
    public class Service_LoginAndAuthentication_Logger
    {
        private readonly ILogger<Service_LoginAndAuthentication_Logger> _logger;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_BackendIdentity _backendIdentity;
        private readonly Service_LogRotation_Manager _logRotationManager;
        private readonly string _logFilePath;
        private bool _isEnabled = true;

        public Service_LoginAndAuthentication_Logger(
            ILogger<Service_LoginAndAuthentication_Logger> logger,
            IServiceScopeFactory scopeFactory,
            Service_BackendIdentity backendIdentity,
            Service_LogRotation_Manager logRotationManager)
        {
            _logger = logger;
            _scopeFactory = scopeFactory;
            _backendIdentity = backendIdentity;
            _logRotationManager = logRotationManager;

            // Create logs directory if it doesn't exist
            var appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JunctionRelay");
            var logsDir = Path.Combine(appDataDir, "logs");
            Directory.CreateDirectory(logsDir);

            // Create a dated JSON log file for authentication events
            var fileName = $"auth_{DateTime.Now:yyyy-MM-dd}.json";
            _logFilePath = Path.Combine(logsDir, fileName);

            _logger.LogInformation("Login & Authentication Logger initialized. Log file: {LogPath}", _logFilePath);
        }

        public async void Initialize()
        {
            // Load settings from database
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                var settings = await loggingDb.GetByCategoryAsync("LoginAndAuthentication");

                if (settings == null || !settings.Enabled)
                {
                    _logger.LogInformation("Login & Authentication logging is disabled in settings");
                    _isEnabled = false;
                    return;
                }

                _isEnabled = true;
                _logger.LogInformation("Login & Authentication logging is enabled");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load logging settings, using defaults");
                _isEnabled = true;
            }
        }

        public void LogTokenRefresh(string userId, bool success, string? errorMessage = null, int? attemptNumber = null)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "TokenRefresh",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                userId = userId,
                success = success,
                attemptNumber = attemptNumber,
                errorMessage = errorMessage
            };

            LogEvent(logEntry);

            if (success)
            {
                _logger.LogInformation("[AUTH] Token refreshed successfully for user: {UserId}", userId);
            }
            else
            {
                _logger.LogWarning("[AUTH] Token refresh failed for user: {UserId}. Error: {Error}", userId, errorMessage ?? "Unknown");
            }
        }

        public void LogLogin(string userId, string email, string authMode, bool success, string? errorMessage = null)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "Login",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                userId = userId,
                email = email,
                authMode = authMode,
                success = success,
                errorMessage = errorMessage
            };

            LogEvent(logEntry);

            if (success)
            {
                _logger.LogInformation("[AUTH] User logged in: {Email} (UserId: {UserId}, Mode: {Mode})", email, userId, authMode);
            }
            else
            {
                _logger.LogWarning("[AUTH] Login failed for: {Email} (Mode: {Mode}). Error: {Error}", email, authMode, errorMessage ?? "Unknown");
            }
        }

        public void LogLogout(string userId, string? email = null)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "Logout",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                userId = userId,
                email = email
            };

            LogEvent(logEntry);
            _logger.LogInformation("[AUTH] User logged out: {UserId}", userId);
        }

        public void LogOAuthFlow(string flowStep, string? state = null, string? code = null, bool success = true, string? errorMessage = null)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "OAuthFlow",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                flowStep = flowStep,
                state = state,
                codePreview = code?.Length > 10 ? code.Substring(0, 10) + "..." : code,
                success = success,
                errorMessage = errorMessage
            };

            LogEvent(logEntry);
            _logger.LogInformation("[AUTH] OAuth flow: {Step} (Success: {Success})", flowStep, success);
        }

        public void LogSessionManagement(string action, string userId, string? sessionId = null, int? sessionCount = null)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "SessionManagement",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                action = action,
                userId = userId,
                sessionId = sessionId,
                sessionCount = sessionCount
            };

            LogEvent(logEntry);
            _logger.LogInformation("[AUTH] Session {Action}: User {UserId}", action, userId);
        }

        public void LogBackendAuthStatus(bool isAuthenticated, string? userId = null)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "BackendAuthStatus",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                isAuthenticated = isAuthenticated,
                userId = userId
            };

            LogEvent(logEntry);
            _logger.LogInformation("[AUTH] Backend authentication status: {Status} (UserId: {UserId})",
                isAuthenticated ? "Connected" : "Disconnected", userId ?? "None");
        }

        public void LogBackendValidation(string userId, bool success, int? statusCode = null, string? errorMessage = null)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "BackendTokenValidation",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                userId = userId,
                success = success,
                statusCode = statusCode,
                errorMessage = errorMessage
            };

            LogEvent(logEntry);

            if (success)
            {
                _logger.LogInformation("[AUTH] Backend token validated successfully for user: {UserId}", userId);
            }
            else
            {
                _logger.LogWarning("[AUTH] Backend token validation failed for user: {UserId}. StatusCode: {StatusCode}, Error: {Error}",
                    userId, statusCode, errorMessage ?? "Unknown");
            }
        }

        public void LogRefreshAttempt(string userId, int attemptNumber, string status, string? errorMessage = null, int? statusCode = null)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "RefreshAttempt",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                userId = userId,
                attemptNumber = attemptNumber,
                status = status,
                statusCode = statusCode,
                errorMessage = errorMessage
            };

            LogEvent(logEntry);

            if (status == "Started")
            {
                _logger.LogInformation("[AUTH] Requesting token refresh from cloud (attempt {Attempt}/3) for user: {UserId}", attemptNumber, userId);
            }
            else if (status == "Unauthorized")
            {
                _logger.LogWarning("[AUTH] Token refresh unauthorized (attempt {Attempt}/3) for user: {UserId}", attemptNumber, userId);
            }
            else if (status == "Failed")
            {
                _logger.LogWarning("[AUTH] Token refresh failed (attempt {Attempt}/3) for user: {UserId}. StatusCode: {StatusCode}, Error: {Error}",
                    attemptNumber, userId, statusCode, errorMessage ?? "Unknown");
            }
            else if (status == "AllAttemptsFailed")
            {
                _logger.LogError("[AUTH] All token refresh attempts failed for user: {UserId}. Clearing session.", userId);
            }
        }

        public void LogSessionCleared(string userId, string reason, string? additionalContext = null)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "SessionCleared",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                userId = userId,
                reason = reason,
                additionalContext = additionalContext
            };

            LogEvent(logEntry);
            _logger.LogInformation("[AUTH] Session cleared for user: {UserId}. Reason: {Reason}", userId, reason);
        }

        public void LogFrontendStatusCheck(string? userId, bool isAuthenticated, string? source = null)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "FrontendStatusCheck",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                userId = userId,
                isAuthenticated = isAuthenticated,
                source = source ?? "Unknown"
            };

            LogEvent(logEntry);
            _logger.LogInformation("[AUTH] Frontend checked authentication status. User: {UserId}, Authenticated: {IsAuth}, Source: {Source}",
                userId ?? "None", isAuthenticated, source ?? "Unknown");
        }

        private void LogEvent(object logEntry)
        {
            try
            {
                // Check if file needs rotation
                long maxFileSizeMB = 100;
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                    var settings = loggingDb.GetByCategoryAsync("LoginAndAuthentication").GetAwaiter().GetResult();
                    if (settings != null)
                    {
                        maxFileSizeMB = settings.MaxLogFileSizeMB;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to load max file size setting, using default");
                }

                // Rotate if needed
                if (_logRotationManager.ShouldRotateFile(_logFilePath, maxFileSizeMB))
                {
                    try
                    {
                        if (File.Exists(_logFilePath))
                        {
                            File.AppendAllText(_logFilePath, "\n]");
                        }

                        var rotatedPath = _logRotationManager.RotateLogFile(_logFilePath);
                        _logger.LogInformation("Auth log file rotated: {RotatedFile}", rotatedPath);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to rotate auth log file");
                    }
                }

                // Serialize and write to file
                var options = new JsonSerializerOptions
                {
                    WriteIndented = true,
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                };
                var jsonLine = JsonSerializer.Serialize(logEntry, options);

                // Append to file with JSON array format
                if (File.Exists(_logFilePath) && new FileInfo(_logFilePath).Length > 0)
                {
                    File.AppendAllText(_logFilePath, ",\n" + jsonLine);
                }
                else
                {
                    File.WriteAllText(_logFilePath, "[\n" + jsonLine);
                }

                // Update last logged timestamp
                Task.Run(async () =>
                {
                    try
                    {
                        using var scope = _scopeFactory.CreateScope();
                        var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                        await loggingDb.UpdateLastLoggedAsync("LoginAndAuthentication");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to update last logged timestamp");
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to log authentication event to file");
            }
        }

        public string GetLogFilePath()
        {
            return _logFilePath;
        }

        public bool IsEnabled()
        {
            return _isEnabled;
        }
    }
}
