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

using JunctionRelayServer.Services.CollectorPlugins;

namespace JunctionRelayServer.Services.BackgroundServices
{
    // The orderly shutdown, awaited by the host. Registered as the LAST hosted service so it stops
    // FIRST, before the services it drains: junctions stop before the stream managers go away, and
    // virtual streams stop before Puppeteer closes the browsers they render in. Every step is bounded
    // and logged; one failing step never skips the rest.
    public class Service_Shutdown : IHostedService
    {
        private readonly IServiceProvider _services;

        public Service_Shutdown(IServiceProvider services)
        {
            _services = services;
        }

        public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        public async Task StopAsync(CancellationToken cancellationToken)
        {
            Console.WriteLine("[SHUTDOWN] Application stopping...");

            await StepAsync("stopping the blit resource monitor", () =>
            {
                _services.GetRequiredService<Service_BlitMode_ResourceMonitor>().StopMonitoring();
                return Task.CompletedTask;
            });

            await StepAsync("stopping the stream history resource monitor", () =>
            {
                _services.GetRequiredService<Service_StreamHistory_ResourceMonitor>().StopMonitoring();
                return Task.CompletedTask;
            });

            await StepAsync("stopping plugin processes", async () =>
                await _services.GetRequiredService<Service_PluginManager>().DisposeAsync());

            // Junctions first - this stops the stream managers operating during shutdown.
            await StepAsync("stopping junctions", async () =>
            {
                var connections = _services.GetRequiredService<Service_Manager_Connections>();
                var running = connections.RunningJunctions.Keys.ToList();
                if (running.Count == 0) return;

                Console.WriteLine($"[SHUTDOWN] Stopping {running.Count} running junctions...");
                foreach (var junctionId in running)
                {
                    try
                    {
                        await connections.StopJunctionAsync(junctionId, CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(5));
                    }
                    catch (TimeoutException)
                    {
                        Console.WriteLine($"[SHUTDOWN] Timeout stopping junction {junctionId}");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SHUTDOWN] Error stopping junction {junctionId}: {ex.Message}");
                    }
                }
                Console.WriteLine("[SHUTDOWN] All junctions stopped");
            });

            // Virtual streams before Puppeteer, or a stream renders into a browser that is closing.
            await StepAsync("stopping virtual streams", async () =>
            {
                var virtualStreams = _services.GetRequiredService<Service_Stream_Manager_Virtual>();
                var active = virtualStreams.GetActiveStreams().ToList();
                if (active.Count == 0) return;

                Console.WriteLine($"[SHUTDOWN] Stopping {active.Count} virtual streams...");
                foreach (var stream in active)
                    await virtualStreams.StopStreamingAsync(stream.ScreenId);

                // In-flight operations finish before the browsers close.
                await Task.Delay(500);
                Console.WriteLine("[SHUTDOWN] Virtual streams stopped");
            });

            await StepAsync("disposing Puppeteer", async () =>
            {
                await _services.GetRequiredService<Service_FrameEngine_Puppeteer>().DisposeAsync();
                Console.WriteLine("[SHUTDOWN] Puppeteer service disposed - Chrome instances cleaned up");
            });

            await StepAsync("closing notification connections", () => BoundedAsync(
                _services.GetRequiredService<Service_Unified_Notification_Broadcaster>().CloseAllConnectionsAsync("Application shutdown"),
                TimeSpan.FromSeconds(2), "Unified notification broadcaster connections"));

            await StepAsync("closing WebSocket server connections", () => BoundedAsync(
                _services.GetRequiredService<Service_Manager_WebSocket_Server>().CloseAllConnectionsAsync("Application shutdown"),
                TimeSpan.FromSeconds(3), "WebSocket server connections"));
        }

        private static async Task StepAsync(string what, Func<Task> step)
        {
            try
            {
                await step();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SHUTDOWN] Error {what}: {ex.Message}");
            }
        }

        private static async Task BoundedAsync(Task task, TimeSpan limit, string what)
        {
            try
            {
                await task.WaitAsync(limit);
                Console.WriteLine($"[SHUTDOWN] {what} closed gracefully");
            }
            catch (TimeoutException)
            {
                Console.WriteLine($"[SHUTDOWN] {what} close timed out after {limit.TotalSeconds:0} seconds");
            }
        }
    }
}
