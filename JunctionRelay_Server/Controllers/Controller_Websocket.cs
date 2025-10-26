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

using JunctionRelayServer.Services;
using JunctionRelayServer.Services.BackgroundServices;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace JunctionRelayServer.Controllers
{
    [Route("api/websocket")]
    [ApiController]
    public class Controller_WebSocket : ControllerBase
    {
        private readonly Service_Manager_WebSocket_Client _webSocketService;
        private readonly Service_Database_Manager_Devices _deviceDb;
        private readonly Service_Manager_WebSocket_Server _webSocketServer;
        private readonly Service_Database_Manager_Services _serviceDb;
        private readonly Service_Stream_Manager_MQTT _mqttManager;
        private readonly Service_Manager_Events _eventsManager;
        private readonly Service_Database_Manager_EventRules _eventRuleDb;
        private readonly Service_Database_Manager_Sensors _sensorDb;
        private readonly Service_Unified_Notification_Broadcaster _unifiedNotificationBroadcaster;

        public Controller_WebSocket(
            Service_Manager_WebSocket_Client webSocketService,
            Service_Database_Manager_Devices deviceDb,
            Service_Manager_WebSocket_Server webSocketServer,
            Service_Database_Manager_Services serviceDb,
            Service_Stream_Manager_MQTT mqttManager,
            Service_Manager_Events eventsManager,
            Service_Database_Manager_EventRules eventRuleDb,
            Service_Database_Manager_Sensors sensorDb,
            Service_Unified_Notification_Broadcaster unifiedNotificationBroadcaster)
        {
            _webSocketService = webSocketService;
            _deviceDb = deviceDb;
            _webSocketServer = webSocketServer;
            _serviceDb = serviceDb;
            _mqttManager = mqttManager;
            _eventsManager = eventsManager;
            _eventRuleDb = eventRuleDb;
            _sensorDb = sensorDb;
            _unifiedNotificationBroadcaster = unifiedNotificationBroadcaster;
        }

        // GET/POST: api/websocket/sensor-cache/connect
        [HttpGet("sensor-cache/connect")]
        [HttpPost("sensor-cache/connect")]
        public async Task<IActionResult> ConnectSensorCacheWebSocket()
        {
            if (HttpContext.WebSockets.IsWebSocketRequest)
            {
                try
                {
                    var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();
                    var clientInfo = HttpContext.Request.Query["clientInfo"].FirstOrDefault() ?? "EventEngine Client";

                    Console.WriteLine($"[WebSocket Controller] Sensor cache WebSocket connection accepted: {clientInfo}");

                    await _webSocketServer.HandleConnectionAsync(webSocket, clientInfo);

                    return new EmptyResult();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[WebSocket Controller] Error handling sensor cache WebSocket: {ex.Message}");
                    return StatusCode(500, new { error = "WebSocket connection failed", message = ex.Message });
                }
            }
            else
            {
                return BadRequest(new { error = "This endpoint only accepts WebSocket connections" });
            }
        }

        // GET/POST: api/websocket/mqtt-cache/connect
        [HttpGet("mqtt-cache/connect")]
        [HttpPost("mqtt-cache/connect")]
        public async Task<IActionResult> ConnectMqttCacheWebSocket()
        {
            if (HttpContext.WebSockets.IsWebSocketRequest)
            {
                try
                {
                    var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();
                    var clientInfo = HttpContext.Request.Query["clientInfo"].FirstOrDefault() ?? "MQTT Cache Client";

                    Console.WriteLine($"[WebSocket Controller] MQTT cache WebSocket connection accepted: {clientInfo}");

                    await HandleMqttCacheWebSocketAsync(webSocket, clientInfo);

                    return new EmptyResult();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[WebSocket Controller] Error handling MQTT cache WebSocket: {ex.Message}");
                    return StatusCode(500, new { error = "WebSocket connection failed", message = ex.Message });
                }
            }
            else
            {
                return BadRequest(new { error = "This endpoint only accepts WebSocket connections" });
            }
        }

        // GET/POST: api/websocket/event-cache/connect
        [HttpGet("event-cache/connect")]
        [HttpPost("event-cache/connect")]
        public async Task<IActionResult> ConnectEventCacheWebSocket()
        {
            if (HttpContext.WebSockets.IsWebSocketRequest)
            {
                try
                {
                    var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();
                    var clientInfo = HttpContext.Request.Query["clientInfo"].FirstOrDefault() ?? "Event Cache Client";

                    Console.WriteLine($"[WebSocket Controller] Event cache WebSocket connection accepted: {clientInfo}");

                    await HandleEventCacheWebSocketAsync(webSocket, clientInfo);

                    return new EmptyResult();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[WebSocket Controller] Error handling Event cache WebSocket: {ex.Message}");
                    return StatusCode(500, new { error = "WebSocket connection failed", message = ex.Message });
                }
            }
            else
            {
                return BadRequest(new { error = "This endpoint only accepts WebSocket connections" });
            }
        }

        // NEW: GET/POST: api/websocket/event-rules-cache/connect
        [HttpGet("event-rules-cache/connect")]
        [HttpPost("event-rules-cache/connect")]
        public async Task<IActionResult> ConnectEventRulesCacheWebSocket()
        {
            if (HttpContext.WebSockets.IsWebSocketRequest)
            {
                try
                {
                    var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();
                    var clientInfo = HttpContext.Request.Query["clientInfo"].FirstOrDefault() ?? "Event Rules Cache Client";

                    Console.WriteLine($"[WebSocket Controller] Event rules cache WebSocket connection accepted: {clientInfo}");

                    await HandleEventRulesCacheWebSocketAsync(webSocket, clientInfo);

                    return new EmptyResult();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[WebSocket Controller] Error handling Event rules cache WebSocket: {ex.Message}");
                    return StatusCode(500, new { error = "WebSocket connection failed", message = ex.Message });
                }
            }
            else
            {
                return BadRequest(new { error = "This endpoint only accepts WebSocket connections" });
            }
        }

        // GET/POST: api/websocket/notifications/connect - Unified notification endpoint
        [HttpGet("notifications/connect")]
        [HttpPost("notifications/connect")]
        public async Task<IActionResult> ConnectNotificationsWebSocket()
        {
            if (HttpContext.WebSockets.IsWebSocketRequest)
            {
                try
                {
                    var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();
                    var clientId = Guid.NewGuid().ToString();

                    Console.WriteLine($"[UNIFIED_NOTIFICATIONS] WebSocket connection accepted: {clientId}");

                    await _unifiedNotificationBroadcaster.AddClientAsync(clientId, webSocket);

                    // Keep connection open - listen for close messages
                    var buffer = new byte[1024 * 4];
                    try
                    {
                        while (webSocket.State == WebSocketState.Open)
                        {
                            var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

                            if (result.MessageType == WebSocketMessageType.Close)
                            {
                                break;
                            }
                        }
                    }
                    finally
                    {
                        await _unifiedNotificationBroadcaster.RemoveClientAsync(clientId);
                        if (webSocket.State == WebSocketState.Open)
                        {
                            await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Connection closed", CancellationToken.None);
                        }
                    }

                    return new EmptyResult();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[UNIFIED_NOTIFICATIONS] Error handling WebSocket: {ex.Message}");
                    return StatusCode(500, new { error = "WebSocket connection failed", message = ex.Message });
                }
            }
            else
            {
                return BadRequest(new { error = "This endpoint only accepts WebSocket connections" });
            }
        }

        // Handle MQTT cache WebSocket connection
        private async Task HandleMqttCacheWebSocketAsync(WebSocket webSocket, string clientInfo)
        {
            var buffer = new byte[1024 * 4];

            try
            {
                while (webSocket.State == WebSocketState.Open)
                {
                    var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        var message = Encoding.UTF8.GetString(buffer, 0, result.Count);

                        try
                        {
                            var request = JsonSerializer.Deserialize<JsonElement>(message);
                            var messageType = request.GetProperty("type").GetString();

                            // Console.WriteLine($"[MQTT Cache WebSocket] Received message type: {messageType}");

                            switch (messageType)
                            {
                                case "request-mqtt-services":
                                    await SendMqttServicesUpdate(webSocket);
                                    break;

                                default:
                                    Console.WriteLine($"[MQTT Cache WebSocket] Unknown message type: {messageType}");
                                    break;
                            }
                        }
                        catch (JsonException ex)
                        {
                            Console.WriteLine($"[MQTT Cache WebSocket] Error parsing message: {ex.Message}");
                            await SendErrorMessage(webSocket, "Invalid JSON message format");
                        }
                    }
                    else if (result.MessageType == WebSocketMessageType.Close)
                    {
                        Console.WriteLine($"[MQTT Cache WebSocket] Client {clientInfo} disconnected");
                        break;
                    }
                }
            }
            catch (WebSocketException ex)
            {
                Console.WriteLine($"[MQTT Cache WebSocket] WebSocket error for {clientInfo}: {ex.Message}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MQTT Cache WebSocket] Unexpected error for {clientInfo}: {ex.Message}");
            }
            finally
            {
                if (webSocket.State == WebSocketState.Open)
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Connection closed", CancellationToken.None);
                }
            }
        }

        // Handle Event cache WebSocket connection
        private async Task HandleEventCacheWebSocketAsync(WebSocket webSocket, string clientInfo)
        {
            var buffer = new byte[1024 * 4];

            try
            {
                while (webSocket.State == WebSocketState.Open)
                {
                    var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        var message = Encoding.UTF8.GetString(buffer, 0, result.Count);

                        try
                        {
                            var request = JsonSerializer.Deserialize<JsonElement>(message);
                            var messageType = request.GetProperty("type").GetString();

                            // Console.WriteLine($"[Event Cache WebSocket] Received message type: {messageType}");

                            switch (messageType)
                            {
                                case "request-event-sensors":
                                    await SendEventSensorsUpdate(webSocket);
                                    break;

                                default:
                                    Console.WriteLine($"[Event Cache WebSocket] Unknown message type: {messageType}");
                                    break;
                            }
                        }
                        catch (JsonException ex)
                        {
                            Console.WriteLine($"[Event Cache WebSocket] Error parsing message: {ex.Message}");
                            await SendErrorMessage(webSocket, "Invalid JSON message format");
                        }
                    }
                    else if (result.MessageType == WebSocketMessageType.Close)
                    {
                        Console.WriteLine($"[Event Cache WebSocket] Client {clientInfo} disconnected");
                        break;
                    }
                }
            }
            catch (WebSocketException ex)
            {
                Console.WriteLine($"[Event Cache WebSocket] WebSocket error for {clientInfo}: {ex.Message}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Event Cache WebSocket] Unexpected error for {clientInfo}: {ex.Message}");
            }
            finally
            {
                if (webSocket.State == WebSocketState.Open)
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Connection closed", CancellationToken.None);
                }
            }
        }

        // NEW: Handle Event Rules cache WebSocket connection
        private async Task HandleEventRulesCacheWebSocketAsync(WebSocket webSocket, string clientInfo)
        {
            var buffer = new byte[1024 * 4];

            try
            {
                while (webSocket.State == WebSocketState.Open)
                {
                    var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        var message = Encoding.UTF8.GetString(buffer, 0, result.Count);

                        try
                        {
                            var request = JsonSerializer.Deserialize<JsonElement>(message);
                            var messageType = request.GetProperty("type").GetString();

                            switch (messageType)
                            {
                                case "request-event-rules":
                                    await SendEventRulesUpdate(webSocket);
                                    break;

                                default:
                                    Console.WriteLine($"[Event Rules Cache WebSocket] Unknown message type: {messageType}");
                                    break;
                            }
                        }
                        catch (JsonException ex)
                        {
                            Console.WriteLine($"[Event Rules Cache WebSocket] Error parsing message: {ex.Message}");
                            await SendErrorMessage(webSocket, "Invalid JSON message format");
                        }
                    }
                    else if (result.MessageType == WebSocketMessageType.Close)
                    {
                        Console.WriteLine($"[Event Rules Cache WebSocket] Client {clientInfo} disconnected");
                        break;
                    }
                }
            }
            catch (WebSocketException ex)
            {
                Console.WriteLine($"[Event Rules Cache WebSocket] WebSocket error for {clientInfo}: {ex.Message}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Event Rules Cache WebSocket] Unexpected error for {clientInfo}: {ex.Message}");
            }
            finally
            {
                if (webSocket.State == WebSocketState.Open)
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Connection closed", CancellationToken.None);
                }
            }
        }

        // Send MQTT services update to WebSocket client
        private async Task SendMqttServicesUpdate(WebSocket webSocket)
        {
            try
            {
                // Get all services
                var allServices = await _serviceDb.GetAllServicesAsync();
                var mqttServices = allServices.Where(s =>
                    !string.IsNullOrEmpty(s.MQTTBrokerAddress) &&
                    !string.IsNullOrEmpty(s.MQTTBrokerPort)
                ).ToList();

                // Build services data structure matching the frontend expectation
                var servicesData = new Dictionary<int, object>();

                foreach (var service in mqttServices)
                {
                    try
                    {
                        // Get payloads for this service
                        var payloads = _mqttManager.GetAllLatestPayloads(service);

                        // Convert payloads to the expected format
                        var payloadData = new Dictionary<string, object>();
                        foreach (var kvp in payloads)
                        {
                            payloadData[kvp.Key] = new
                            {
                                topic = kvp.Key,
                                payload = kvp.Value,
                                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                                serviceId = service.Id,
                                serviceName = service.Name,
                                qos = 0 // Default QoS since we don't track this in the current system
                            };
                        }

                        // Get subscriptions for this service
                        var subscriptions = await _mqttManager.GetSubscribedTopics(service);
                        var subscriptionData = subscriptions.Select(s => new
                        {
                            topic = s.Topic,
                            qos = s.QoS
                        }).ToArray();

                        servicesData[service.Id] = new
                        {
                            serviceId = service.Id,
                            serviceName = service.Name,
                            payloads = payloadData,
                            subscriptions = subscriptionData,
                            connectionStatus = "connected", // TODO: Get actual connection status
                            lastUpdate = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                        };
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[MQTT Cache WebSocket] Error getting data for service {service.Id}: {ex.Message}");

                        // Add service with error state
                        servicesData[service.Id] = new
                        {
                            serviceId = service.Id,
                            serviceName = service.Name,
                            payloads = new Dictionary<string, object>(),
                            subscriptions = new object[0],
                            connectionStatus = "error",
                            lastUpdate = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                        };
                    }
                }

                var response = new
                {
                    type = "mqtt-services-update",
                    data = servicesData
                };

                var responseJson = JsonSerializer.Serialize(response);
                var responseBytes = Encoding.UTF8.GetBytes(responseJson);

                if (webSocket.State == WebSocketState.Open)
                {
                    await webSocket.SendAsync(
                        new ArraySegment<byte>(responseBytes),
                        WebSocketMessageType.Text,
                        true,
                        CancellationToken.None
                    );

                    // Console.WriteLine($"[MQTT Cache WebSocket] Sent MQTT services update with {servicesData.Count} services");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MQTT Cache WebSocket] Error sending MQTT services update: {ex.Message}");
                await SendErrorMessage(webSocket, "Error retrieving MQTT services data");
            }
        }

        // Send Event sensors update to WebSocket client
        private async Task SendEventSensorsUpdate(WebSocket webSocket)
        {
            try
            {
                // Get all event sensors from the events manager
                var eventSensors = await _eventsManager.GetAllEventSensorsAsync();

                // Convert sensors to the expected format
                var sensorsData = eventSensors.Select(sensor => new
                {
                    id = sensor.Id,
                    originalId = sensor.OriginalId,
                    junctionId = sensor.JunctionId,
                    junctionDeviceLinkId = sensor.JunctionDeviceLinkId,
                    junctionCollectorLinkId = sensor.JunctionCollectorLinkId,
                    sensorOrder = sensor.SensorOrder,
                    mqttServiceId = sensor.MQTTServiceId,
                    mqttTopic = sensor.MQTTTopic,
                    mqttQoS = sensor.MQTTQoS,
                    sensorType = sensor.SensorType,
                    externalId = sensor.ExternalId,
                    deviceName = sensor.DeviceName,
                    name = sensor.Name,
                    componentName = sensor.ComponentName,
                    category = sensor.Category,
                    unit = sensor.Unit,
                    value = sensor.Value,
                    decimalPlaces = sensor.DecimalPlaces,
                    sensorTag = sensor.SensorTag,
                    formula = sensor.Formula,
                    lastUpdated = sensor.LastUpdated.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                    customAttribute1 = sensor.CustomAttribute1,
                    customAttribute2 = sensor.CustomAttribute2,
                    customAttribute3 = sensor.CustomAttribute3,
                    customAttribute4 = sensor.CustomAttribute4,
                    customAttribute5 = sensor.CustomAttribute5,
                    customAttribute6 = sensor.CustomAttribute6,
                    customAttribute7 = sensor.CustomAttribute7,
                    customAttribute8 = sensor.CustomAttribute8,
                    customAttribute9 = sensor.CustomAttribute9,
                    customAttribute10 = sensor.CustomAttribute10,
                    isMissing = sensor.IsMissing,
                    isStale = sensor.IsStale,
                    isSelected = sensor.IsSelected,
                    isVisible = sensor.IsVisible,
                    isCustomJunctionSensor = sensor.IsCustomJunctionSensor,
                    isEventSensor = sensor.IsEventSensor,
                    deviceId = sensor.DeviceId,
                    serviceId = sensor.ServiceId,
                    collectorId = sensor.CollectorId
                }).ToList();

                var response = new
                {
                    type = "event-sensors-update",
                    data = sensorsData,
                    count = sensorsData.Count,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                };

                var responseJson = JsonSerializer.Serialize(response);
                var responseBytes = Encoding.UTF8.GetBytes(responseJson);

                if (webSocket.State == WebSocketState.Open)
                {
                    await webSocket.SendAsync(
                        new ArraySegment<byte>(responseBytes),
                        WebSocketMessageType.Text,
                        true,
                        CancellationToken.None
                    );

                    // Console.WriteLine($"[Event Cache WebSocket] Sent event sensors update with {sensorsData.Count} sensors");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Event Cache WebSocket] Error sending event sensors update: {ex.Message}");
                await SendErrorMessage(webSocket, "Error retrieving event sensors data");
            }
        }

        // NEW: Send Event Rules update to WebSocket client
        private async Task SendEventRulesUpdate(WebSocket webSocket)
        {
            try
            {
                var rules = await _eventRuleDb.GetAllRulesAsync();
                var enrichedRules = new List<object>();

                foreach (var rule in rules)
                {
                    enrichedRules.Add(await EnrichRuleWithSensorNames(rule));
                }

                var response = new
                {
                    type = "event-rules-update",
                    data = enrichedRules
                };

                var responseJson = JsonSerializer.Serialize(response);
                var responseBytes = Encoding.UTF8.GetBytes(responseJson);

                if (webSocket.State == WebSocketState.Open)
                {
                    await webSocket.SendAsync(
                        new ArraySegment<byte>(responseBytes),
                        WebSocketMessageType.Text,
                        true,
                        CancellationToken.None
                    );
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Event Rules Cache WebSocket] Error sending event rules update: {ex.Message}");
                await SendErrorMessage(webSocket, "Error retrieving event rules data");
            }
        }

        // NEW: Helper method to enrich rules with sensor names
        private async Task<object> EnrichRuleWithSensorNames(Model_EventRule rule)
        {
            // Enrich triggers with sensor names
            var enrichedTriggers = new List<object>();
            foreach (var trigger in rule.Triggers)
            {
                string? triggerSensorName = null;
                if (trigger.TriggerSensorId.HasValue)
                {
                    var triggerSensor = await _sensorDb.GetSensorByIdAsync(trigger.TriggerSensorId.Value);
                    triggerSensorName = triggerSensor?.Name;
                }

                enrichedTriggers.Add(new
                {
                    id = trigger.Id,
                    eventRuleId = trigger.EventRuleId,
                    triggerOrder = trigger.TriggerOrder,
                    isActive = trigger.IsActive,
                    triggerType = trigger.TriggerType,
                    triggerSensorId = trigger.TriggerSensorId,
                    triggerSensorName = triggerSensorName,
                    triggerCondition = trigger.TriggerCondition,
                    triggerValue = trigger.TriggerValue,
                    triggerDebounceMs = trigger.TriggerDebounceMs
                });
            }

            // Enrich actions with sensor/junction names
            var enrichedActions = new List<object>();
            foreach (var action in rule.Actions)
            {
                string? actionTargetSensorName = null;
                if (action.ActionTargetSensorId.HasValue)
                {
                    var targetSensor = await _sensorDb.GetSensorByIdAsync(action.ActionTargetSensorId.Value);
                    actionTargetSensorName = targetSensor?.Name;
                }

                // TODO: Fetch junction name when needed
                string? actionJunctionName = null;

                enrichedActions.Add(new
                {
                    id = action.Id,
                    eventRuleId = action.EventRuleId,
                    actionOrder = action.ActionOrder,
                    isActive = action.IsActive,
                    delayBeforeNextMs = action.DelayBeforeNextMs,
                    actionType = action.ActionType,
                    actionTargetSensorId = action.ActionTargetSensorId,
                    actionTargetSensorName = actionTargetSensorName,
                    actionStaticValue = action.ActionStaticValue,
                    actionTransform = action.ActionTransform,
                    actionJunctionId = action.ActionJunctionId,
                    actionJunctionName = actionJunctionName,
                    actionMqttTopic = action.ActionMqttTopic,
                    actionMqttPayload = action.ActionMqttPayload,
                    actionMqttServiceId = action.ActionMqttServiceId,
                    actionHttpUrl = action.ActionHttpUrl,
                    actionHttpMethod = action.ActionHttpMethod,
                    actionHttpPayload = action.ActionHttpPayload
                });
            }

            return new
            {
                id = rule.Id,
                name = rule.Name,
                description = rule.Description,
                enabled = rule.Enabled,
                triggerLogic = rule.TriggerLogic,
                triggers = enrichedTriggers,
                actions = enrichedActions,
                lastTriggered = rule.LastTriggered,
                triggerCount = rule.TriggerCount
            };
        }

        // Send error message to WebSocket client
        private async Task SendErrorMessage(WebSocket webSocket, string errorMessage)
        {
            try
            {
                var response = new
                {
                    type = "error",
                    message = errorMessage,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                };

                var responseJson = JsonSerializer.Serialize(response);
                var responseBytes = Encoding.UTF8.GetBytes(responseJson);

                if (webSocket.State == WebSocketState.Open)
                {
                    await webSocket.SendAsync(
                        new ArraySegment<byte>(responseBytes),
                        WebSocketMessageType.Text,
                        true,
                        CancellationToken.None
                    );
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket] Error sending error message: {ex.Message}");
            }
        }

        // GET: api/websocket/connections
        [HttpGet("connections")]
        public IActionResult GetAllConnections()
        {
            try
            {
                var connections = _webSocketService.GetConnectedDevices();
                return Ok(new
                {
                    success = true,
                    connections = connections,
                    totalCount = connections.Count()
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error retrieving WebSocket connections",
                    error = ex.Message
                });
            }
        }

        // GET: api/websocket/connections/{deviceMac}/status
        [HttpGet("connections/{deviceMac}/status")]
        public IActionResult GetConnectionStatus(string deviceMac)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceMac))
                    return BadRequest(new { success = false, message = "Device MAC address is required" });

                var isConnected = _webSocketService.IsDeviceConnected(deviceMac);
                var allConnections = _webSocketService.GetConnectedDevices();
                var deviceInfo = allConnections.FirstOrDefault(d =>
                    d.GetType().GetProperty("DeviceMac")?.GetValue(d)?.ToString() == deviceMac);

                return Ok(new
                {
                    success = true,
                    deviceMac = deviceMac,
                    isConnected = isConnected,
                    deviceInfo = deviceInfo
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error checking WebSocket connection status",
                    error = ex.Message
                });
            }
        }

        // POST: api/websocket/connections/{deviceMac}/heartbeat
        [HttpPost("connections/{deviceMac}/heartbeat")]
        public async Task<IActionResult> SendHeartbeat(string deviceMac, [FromBody] HeartbeatRequest? request = null)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceMac))
                    return BadRequest(new { success = false, message = "Device MAC address is required" });

                var heartbeatData = new
                {
                    expectedValue = request?.ExpectedValue ?? "ok",
                    deviceMac = deviceMac,
                    timeout = request?.TimeoutMs ?? 10000
                };

                var (success, duration, response) = await _webSocketService.SendHeartbeatRequestAsync(deviceMac, heartbeatData);

                return Ok(new
                {
                    success = success,
                    deviceMac = deviceMac,
                    duration = duration,
                    response = response,
                    sentAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error sending WebSocket heartbeat",
                    error = ex.Message
                });
            }
        }

        // GET: api/websocket/devices
        [HttpGet("devices")]
        public async Task<IActionResult> GetWebSocketDevices()
        {
            try
            {
                var devices = await _deviceDb.GetAllDevicesAsync();
                var webSocketDevices = devices.Where(d =>
                    d.HeartbeatEnabled &&
                    d.HeartbeatProtocol?.ToUpper() == "WEBSOCKET" &&
                    !string.IsNullOrWhiteSpace(d.IPAddress) &&
                    !string.IsNullOrWhiteSpace(d.UniqueIdentifier)
                ).Select(d => new
                {
                    deviceId = d.Id,
                    deviceName = d.Name,
                    deviceMac = d.UniqueIdentifier,
                    ipAddress = d.IPAddress,
                    heartbeatTarget = d.HeartbeatTarget,
                    heartbeatExpectedValue = d.HeartbeatExpectedValue,
                    heartbeatEnabled = d.HeartbeatEnabled,
                    lastPingStatus = d.LastPingStatus,
                    lastPinged = d.LastPinged,
                    isConnected = _webSocketService.IsDeviceConnected(d.UniqueIdentifier!)
                }).ToList();

                return Ok(new
                {
                    success = true,
                    devices = webSocketDevices,
                    totalCount = webSocketDevices.Count
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error retrieving WebSocket devices",
                    error = ex.Message
                });
            }
        }

        // GET: api/websocket/statistics
        [HttpGet("statistics")]
        public async Task<IActionResult> GetWebSocketStatistics()
        {
            try
            {
                var devices = await _deviceDb.GetAllDevicesAsync();
                var webSocketDevices = devices.Where(d =>
                    d.HeartbeatEnabled &&
                    d.HeartbeatProtocol?.ToUpper() == "WEBSOCKET" &&
                    !string.IsNullOrWhiteSpace(d.IPAddress) &&
                    !string.IsNullOrWhiteSpace(d.UniqueIdentifier)
                ).ToList();

                var connectedDevices = webSocketDevices.Where(d =>
                    _webSocketService.IsDeviceConnected(d.UniqueIdentifier!)).ToList();

                var statusBreakdown = webSocketDevices.GroupBy(d => d.LastPingStatus ?? "Unknown")
                    .ToDictionary(g => g.Key, g => g.Count());

                var statistics = new
                {
                    totalWebSocketDevices = webSocketDevices.Count,
                    connectedDevices = connectedDevices.Count,
                    disconnectedDevices = webSocketDevices.Count - connectedDevices.Count,
                    statusBreakdown = statusBreakdown,
                    recentActivity = webSocketDevices
                        .Where(d => d.LastPinged.HasValue)
                        .OrderByDescending(d => d.LastPinged)
                        .Take(5)
                        .Select(d => new
                        {
                            deviceName = d.Name,
                            deviceMac = d.UniqueIdentifier,
                            lastPinged = d.LastPinged,
                            status = d.LastPingStatus,
                            duration = d.LastPingDurationMs
                        })
                };

                return Ok(new
                {
                    success = true,
                    statistics = statistics,
                    generatedAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error retrieving WebSocket statistics",
                    error = ex.Message
                });
            }
        }

        // POST: api/websocket/connections/refresh
        [HttpPost("connections/refresh")]
        public IActionResult RefreshConnections()
        {
            try
            {
                // This endpoint can be used to trigger a refresh of connections
                // The background service will handle the actual reconnection logic
                var currentConnections = _webSocketService.GetConnectedDevices().ToList();

                return Ok(new
                {
                    success = true,
                    message = "Connection refresh triggered",
                    currentConnections = currentConnections.Count,
                    refreshedAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error refreshing WebSocket connections",
                    error = ex.Message
                });
            }
        }

        // GET: api/websocket/connection-urls
        [HttpGet("connection-urls")]
        public async Task<IActionResult> GetConnectionUrls()
        {
            try
            {
                var devices = await _deviceDb.GetAllDevicesAsync();
                var webSocketDevices = devices.Where(d =>
                    d.HeartbeatEnabled &&
                    d.HeartbeatProtocol?.ToUpper() == "WEBSOCKET" &&
                    !string.IsNullOrWhiteSpace(d.IPAddress) &&
                    !string.IsNullOrWhiteSpace(d.UniqueIdentifier)
                ).Select(d =>
                {
                    // Generate WebSocket URL based on HeartbeatTarget or default to port 81
                    string wsUrl;
                    if (!string.IsNullOrWhiteSpace(d.HeartbeatTarget))
                    {
                        if (d.HeartbeatTarget.StartsWith("ws://"))
                        {
                            wsUrl = d.HeartbeatTarget;
                        }
                        else if (d.HeartbeatTarget.All(char.IsDigit))
                        {
                            wsUrl = $"ws://{d.IPAddress}:{d.HeartbeatTarget}/";
                        }
                        else if (d.HeartbeatTarget.StartsWith("/"))
                        {
                            wsUrl = $"ws://{d.IPAddress}{d.HeartbeatTarget}";
                        }
                        else
                        {
                            wsUrl = $"ws://{d.IPAddress}:{d.HeartbeatTarget}";
                            if (!wsUrl.EndsWith("/")) wsUrl += "/";
                        }
                    }
                    else
                    {
                        wsUrl = $"ws://{d.IPAddress}:81/";
                    }

                    return new
                    {
                        deviceId = d.Id,
                        deviceName = d.Name,
                        deviceMac = d.UniqueIdentifier,
                        ipAddress = d.IPAddress,
                        heartbeatTarget = d.HeartbeatTarget,
                        calculatedUrl = wsUrl,
                        isConnected = _webSocketService.IsDeviceConnected(d.UniqueIdentifier!)
                    };
                }).ToList();

                return Ok(new
                {
                    success = true,
                    devices = webSocketDevices,
                    totalCount = webSocketDevices.Count
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error retrieving WebSocket connection URLs",
                    error = ex.Message
                });
            }
        }

        // GET: api/websocket/server/clients - Get connected WebSocket server clients
        [HttpGet("server/clients")]
        public IActionResult GetWebSocketServerClients()
        {
            try
            {
                var clients = _webSocketServer.GetConnectedClients();
                return Ok(new
                {
                    success = true,
                    clients = clients,
                    totalCount = clients.Count()
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error retrieving WebSocket server clients",
                    error = ex.Message
                });
            }
        }

        // Request models
        public class HeartbeatRequest
        {
            public string? ExpectedValue { get; set; }

            [Range(1000, 30000)]
            public int? TimeoutMs { get; set; }
        }
    }
}