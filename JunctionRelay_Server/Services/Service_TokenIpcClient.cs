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
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JunctionRelayServer.Interfaces;

namespace JunctionRelayServer.Services
{
    // Sends update tokens to the Tray application via named pipe
    // Called after successful authentication with BFF
    // Only sends tokens if user has a Pro license
    public class Service_TokenIpcClient
    {
        private const string PipeName = "JunctionRelay_UpdateToken";
        private const int ConnectionTimeoutMs = 5000;
        private const int MaxRetries = 3;

        private readonly IAuthModeService _authModeService;

        public Service_TokenIpcClient(IAuthModeService authModeService)
        {
            _authModeService = authModeService;
        }

        // Sends an update token to the Tray application
        // Returns true if successfully sent, false otherwise
        public async Task<bool> SendTokenAsync(string token, DateTime expiresAt, string? deviceId = null)
        {
            if (string.IsNullOrEmpty(token))
            {
                Console.WriteLine("[TokenIpcClient] ERROR: Token is null or empty.");
                return false;
            }

            var tokenData = new
            {
                token = token,
                expiresAt = expiresAt,
                deviceId = deviceId,
                receivedAt = DateTime.UtcNow
            };

            var json = JsonSerializer.Serialize(tokenData);
            var bytes = Encoding.UTF8.GetBytes(json);

            for (int attempt = 1; attempt <= MaxRetries; attempt++)
            {
                try
                {
                    Console.WriteLine($"[TokenIpcClient] Attempt {attempt}/{MaxRetries}: Connecting to Tray...");

                    using var pipeClient = new NamedPipeClientStream(
                        serverName: ".",
                        pipeName: PipeName,
                        direction: PipeDirection.Out,
                        options: PipeOptions.None
                    );

                    // Try to connect
                    using var cts = new CancellationTokenSource(ConnectionTimeoutMs);
                    await pipeClient.ConnectAsync(cts.Token);

                    Console.WriteLine("[TokenIpcClient] Connected to Tray.");

                    // Send the token
                    await pipeClient.WriteAsync(bytes, 0, bytes.Length);
                    await pipeClient.FlushAsync();

                    Console.WriteLine($"[TokenIpcClient] Token sent successfully ({bytes.Length} bytes).");
                    return true;
                }
                catch (TimeoutException)
                {
                    Console.WriteLine($"[TokenIpcClient] Connection timeout on attempt {attempt}.");
                    if (attempt < MaxRetries)
                    {
                        await Task.Delay(1000);
                    }
                }
                catch (IOException ex)
                {
                    Console.WriteLine($"[TokenIpcClient] IO error on attempt {attempt}: {ex.Message}");
                    if (attempt < MaxRetries)
                    {
                        await Task.Delay(1000);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[TokenIpcClient] Unexpected error on attempt {attempt}: {ex.GetType().Name}: {ex.Message}");
                    if (attempt < MaxRetries)
                    {
                        await Task.Delay(1000);
                    }
                }
            }

            Console.WriteLine("[TokenIpcClient] Failed to send token after all retries.");
            return false;
        }

        // Checks if the Tray is running and accepting connections
        public async Task<bool> IsTrayReachableAsync()
        {
            try
            {
                using var pipeClient = new NamedPipeClientStream(
                    serverName: ".",
                    pipeName: PipeName,
                    direction: PipeDirection.Out,
                    options: PipeOptions.None
                );

                using var cts = new CancellationTokenSource(1000);
                await pipeClient.ConnectAsync(cts.Token);

                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}