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
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using JunctionRelayServer.Services;
using JunctionRelayServer.Services.BackgroundServices;
using JunctionRelayServer.Utils;
using Microsoft.Extensions.DependencyInjection;

namespace JunctionRelay_Server.Services
{
    public class Service_Events : IDisposable
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IService_Settings _settingsService;

        // Index: SensorId -> List of rules that care about that sensor
        private readonly ConcurrentDictionary<int, List<Model_EventRule>> _rulesBySensorId = new();
        // Debouncing: RuleId -> Last trigger time
        private readonly ConcurrentDictionary<int, DateTime> _lastTriggerTime = new();
        // Cache for sensor values to detect changes
        private readonly ConcurrentDictionary<int, string> _sensorValueCache = new();

        private bool _serviceEnabled = true;

        public Service_Events(
            IServiceScopeFactory scopeFactory,
            IService_Settings settingsService)
        {
            _scopeFactory = scopeFactory;
            _settingsService = settingsService;
        }

        public async Task InitializeAsync()
        {
            try
            {
                _serviceEnabled = await _settingsService.GetBoolSettingAsync("service_eventengine_enabled", true);

                if (!_serviceEnabled)
                {
                    Console.WriteLine("[EVENTS] Event service is DISABLED via settings");
                    return;
                }

                await LoadAndIndexRulesAsync();

                Console.WriteLine($"[EVENTS] Event service initialized with {_rulesBySensorId.Count} sensor triggers");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EVENTS] Error initializing event service: {ex.Message}");
                throw;
            }
        }

        private async Task LoadAndIndexRulesAsync()
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var ruleDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_EventRules>();

                var allRules = await ruleDb.GetAllRulesAsync();

                _rulesBySensorId.Clear();

                foreach (var rule in allRules)
                {
                    if (!rule.Enabled)
                        continue;

                    foreach (var trigger in rule.Triggers)
                    {
                        if (!trigger.IsActive || !trigger.TriggerSensorId.HasValue)
                            continue;

                        var sensorId = trigger.TriggerSensorId.Value;

                        if (!_rulesBySensorId.ContainsKey(sensorId))
                        {
                            _rulesBySensorId[sensorId] = new List<Model_EventRule>();
                        }

                        if (!_rulesBySensorId[sensorId].Contains(rule))
                        {
                            _rulesBySensorId[sensorId].Add(rule);
                        }
                    }
                }

                Console.WriteLine($"[EVENTS] Loaded and indexed {allRules.Count()} rules across {_rulesBySensorId.Count} sensors");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EVENTS] Error loading rules: {ex.Message}");
                throw;
            }
        }

        public bool HasRulesForSensor(int sensorId)
        {
            if (!_serviceEnabled)
                return false;

            return _rulesBySensorId.ContainsKey(sensorId) &&
                   _rulesBySensorId[sensorId].Count > 0;
        }

        public async void OnSensorUpdated(int sensorId, string newValue)
        {
            if (!await _settingsService.GetBoolSettingAsync("service_eventengine_enabled", true))
            {
                return;
            }

            _sensorValueCache[sensorId] = newValue;

            if (!_rulesBySensorId.TryGetValue(sensorId, out var rules))
            {
                return;
            }

            foreach (var rule in rules)
            {
                if (!rule.Enabled)
                {
                    continue;
                }

                if (ShouldDebounce(rule))
                {
                    continue;
                }

                bool triggered = EvaluateRuleTriggers(rule, sensorId, newValue);

                if (!triggered)
                    continue;

                Console.WriteLine($"[EVENTS] Rule {rule.Id} ({rule.Name}) triggered by sensor {sensorId}={newValue}");

                // Execute actions (fire and forget)
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await ExecuteRuleActionsAsync(rule, sensorId, newValue);
                        await UpdateRuleMetadataAsync(rule);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[EVENTS] Error executing rule {rule.Id} ({rule.Name}): {ex.Message}");
                    }
                });
            }
        }

        private bool EvaluateRuleTriggers(Model_EventRule rule, int updatedSensorId, string updatedValue)
        {
            if (rule.Triggers == null || rule.Triggers.Count == 0)
                return false;

            var triggerResults = new List<bool>();

            foreach (var trigger in rule.Triggers)
            {
                if (!trigger.IsActive)
                {
                    triggerResults.Add(false);
                    continue;
                }

                string sensorValue;
                if (trigger.TriggerSensorId == updatedSensorId)
                {
                    sensorValue = updatedValue;
                }
                else if (trigger.TriggerSensorId.HasValue && _sensorValueCache.TryGetValue(trigger.TriggerSensorId.Value, out var cachedValue))
                {
                    sensorValue = cachedValue;
                }
                else
                {
                    triggerResults.Add(false);
                    continue;
                }

                var result = EvaluateCondition(trigger, sensorValue);
                triggerResults.Add(result);
            }

            var logic = rule.TriggerLogic?.ToUpper() ?? "ANY";
            return logic switch
            {
                "ALL" => triggerResults.All(r => r),
                "ANY" => triggerResults.Any(r => r),
                _ => triggerResults.Any(r => r)
            };
        }

        private bool ShouldDebounce(Model_EventRule rule)
        {
            var maxDebounce = rule.Triggers.Max(t => t.TriggerDebounceMs);
            if (maxDebounce <= 0)
                return false;

            if (!_lastTriggerTime.TryGetValue(rule.Id, out var lastTrigger))
                return false;

            var timeSinceLastTrigger = (DateTime.UtcNow - lastTrigger).TotalMilliseconds;
            return timeSinceLastTrigger < maxDebounce;
        }

        private bool EvaluateCondition(Model_EventTrigger trigger, string sensorValue)
        {
            try
            {
                var condition = trigger.TriggerCondition?.ToLower() ?? "equals";
                var expectedValue = trigger.TriggerValue ?? string.Empty;

                switch (condition)
                {
                    case "equals":
                    case "==":
                        return string.Equals(sensorValue, expectedValue, StringComparison.OrdinalIgnoreCase);

                    case "not_equals":
                    case "!=":
                        return !string.Equals(sensorValue, expectedValue, StringComparison.OrdinalIgnoreCase);

                    case "contains":
                        return sensorValue.Contains(expectedValue, StringComparison.OrdinalIgnoreCase);

                    case "greater_than":
                    case ">":
                        if (double.TryParse(sensorValue, out var sensorNum) &&
                            double.TryParse(expectedValue, out var expectedNum))
                        {
                            return sensorNum > expectedNum;
                        }
                        return false;

                    case "less_than":
                    case "<":
                        if (double.TryParse(sensorValue, out var sensorNum2) &&
                            double.TryParse(expectedValue, out var expectedNum2))
                        {
                            return sensorNum2 < expectedNum2;
                        }
                        return false;

                    case "greater_than_or_equal":
                    case ">=":
                        if (double.TryParse(sensorValue, out var sensorNum3) &&
                            double.TryParse(expectedValue, out var expectedNum3))
                        {
                            return sensorNum3 >= expectedNum3;
                        }
                        return false;

                    case "less_than_or_equal":
                    case "<=":
                        if (double.TryParse(sensorValue, out var sensorNum4) &&
                            double.TryParse(expectedValue, out var expectedNum4))
                        {
                            return sensorNum4 <= expectedNum4;
                        }
                        return false;

                    case "changed":
                    case "any_change":
                        return true;

                    default:
                        Console.WriteLine($"[EVENTS] Unknown condition type: {condition}");
                        return false;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EVENTS] Error evaluating condition: {ex.Message}");
                return false;
            }
        }

        private async Task ExecuteRuleActionsAsync(Model_EventRule rule, int triggerSensorId, string triggerValue)
        {
            if (rule.Actions == null || rule.Actions.Count == 0)
            {
                Console.WriteLine($"[EVENTS] Rule {rule.Id} ({rule.Name}) has no actions configured");
                return;
            }

            // Filter to active actions and sort by order
            var activeActions = rule.Actions
                .Where(a => a.IsActive)
                .OrderBy(a => a.ActionOrder)
                .ToList();

            Console.WriteLine($"[EVENTS] Executing {activeActions.Count} action(s) for rule {rule.Id} ({rule.Name})");

            for (int i = 0; i < activeActions.Count; i++)
            {
                var action = activeActions[i];

                try
                {
                    await ExecuteSingleActionAsync(action, triggerValue);
                    Console.WriteLine($"[EVENTS] Action {i + 1}/{activeActions.Count} completed for rule {rule.Id}");

                    // Apply delay before next action (if not the last action)
                    if (i < activeActions.Count - 1 && action.DelayBeforeNextMs > 0)
                    {
                        Console.WriteLine($"[EVENTS] Delaying {action.DelayBeforeNextMs}ms before next action");
                        await Task.Delay(action.DelayBeforeNextMs);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[EVENTS] Error executing action {i + 1} for rule {rule.Id}: {ex.Message}");
                    // Continue with remaining actions even if one fails
                }
            }
        }

        private async Task ExecuteSingleActionAsync(Model_EventAction action, string triggerValue)
        {
            var actionType = action.ActionType?.ToLower() ?? "updateeventsensor";

            switch (actionType)
            {
                case "update_event_sensor":
                case "updateeventsensor":
                    await ExecuteUpdateEventSensorAction(action, triggerValue);
                    break;

                case "mqtt_publish":
                case "mqttpublish":
                    await ExecuteMqttPublishAction(action, triggerValue);
                    break;

                case "http_request":
                case "httprequest":
                    await ExecuteHttpRequestAction(action, triggerValue);
                    break;

                case "start_junction":
                case "startjunction":
                    await ExecuteStartJunctionAction(action);
                    break;

                case "stop_junction":
                case "stopjunction":
                    await ExecuteStopJunctionAction(action);
                    break;

                default:
                    Console.WriteLine($"[EVENTS] Unknown action type: {actionType}");
                    break;
            }
        }

        private async Task ExecuteUpdateEventSensorAction(Model_EventAction action, string triggerValue)
        {
            if (!action.ActionTargetSensorId.HasValue)
            {
                Console.WriteLine($"[EVENTS] Action has no target sensor for UpdateEventSensor");
                return;
            }

            using var scope = _scopeFactory.CreateScope();
            var eventManager = scope.ServiceProvider.GetRequiredService<Service_Manager_Events>();

            string newValue;
            if (!string.IsNullOrEmpty(action.ActionStaticValue))
            {
                newValue = action.ActionStaticValue;
            }
            else
            {
                newValue = ApplyTransform(action.ActionTransform, triggerValue);
            }

            await eventManager.UpdateEventSensorValueAsync(action.ActionTargetSensorId.Value, newValue);

            Console.WriteLine($"[EVENTS] Updated event sensor {action.ActionTargetSensorId} to: {newValue}");
        }

        private async Task ExecuteMqttPublishAction(Model_EventAction action, string triggerValue)
        {
            if (string.IsNullOrEmpty(action.ActionMqttTopic) || !action.ActionMqttServiceId.HasValue)
            {
                Console.WriteLine($"[EVENTS] Action missing MQTT topic or service ID");
                return;
            }

            using var scope = _scopeFactory.CreateScope();
            var serviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Services>();
            var mqttStreamMgr = scope.ServiceProvider.GetRequiredService<Service_Stream_Manager_MQTT>();

            var service = await serviceDb.GetServiceByIdAsync(action.ActionMqttServiceId.Value);
            if (service == null)
            {
                Console.WriteLine($"[EVENTS] MQTT service {action.ActionMqttServiceId} not found");
                return;
            }

            var payload = action.ActionMqttPayload ?? triggerValue;
            payload = payload.Replace("{sensor_value}", triggerValue);
            payload = payload.Replace("{timestamp}", DateTime.UtcNow.ToString("o"));

            await mqttStreamMgr.PublishAsync(service, action.ActionMqttTopic, payload, 0);

            Console.WriteLine($"[EVENTS] Published to MQTT topic {action.ActionMqttTopic}");
        }

        private async Task ExecuteHttpRequestAction(Model_EventAction action, string triggerValue)
        {
            if (string.IsNullOrEmpty(action.ActionHttpUrl))
            {
                Console.WriteLine($"[EVENTS] Action missing HTTP URL");
                return;
            }

            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(10);

            var method = action.ActionHttpMethod?.ToUpper() ?? "POST";
            var payload = action.ActionHttpPayload ?? string.Empty;
            payload = payload.Replace("{sensor_value}", triggerValue);
            payload = payload.Replace("{timestamp}", DateTime.UtcNow.ToString("o"));

            HttpResponseMessage response;

            if (method == "GET")
            {
                response = await httpClient.GetAsync(action.ActionHttpUrl);
            }
            else if (method == "POST")
            {
                var content = new StringContent(payload, System.Text.Encoding.UTF8, "application/json");
                response = await httpClient.PostAsync(action.ActionHttpUrl, content);
            }
            else
            {
                Console.WriteLine($"[EVENTS] Unsupported HTTP method: {method}");
                return;
            }

            if (response.IsSuccessStatusCode)
            {
                Console.WriteLine($"[EVENTS] HTTP request to {action.ActionHttpUrl} succeeded");
            }
            else
            {
                Console.WriteLine($"[EVENTS] HTTP request failed: {response.StatusCode}");
            }
        }

        private async Task ExecuteStartJunctionAction(Model_EventAction action)
        {
            if (!action.ActionJunctionId.HasValue)
            {
                Console.WriteLine($"[EVENTS] Action has no junction ID for StartJunction");
                return;
            }

            // TODO: Implement junction start logic
            Console.WriteLine($"[EVENTS] StartJunction action called for junction {action.ActionJunctionId} (not yet implemented)");
            await Task.CompletedTask;
        }

        private async Task ExecuteStopJunctionAction(Model_EventAction action)
        {
            if (!action.ActionJunctionId.HasValue)
            {
                Console.WriteLine($"[EVENTS] Action has no junction ID for StopJunction");
                return;
            }

            // TODO: Implement junction stop logic
            Console.WriteLine($"[EVENTS] StopJunction action called for junction {action.ActionJunctionId} (not yet implemented)");
            await Task.CompletedTask;
        }

        private string ApplyTransform(string? transform, string inputValue)
        {
            if (string.IsNullOrEmpty(transform))
                return inputValue;

            try
            {
                switch (transform.ToLower())
                {
                    case "passthrough":
                    case "none":
                        return inputValue;

                    case "encoder_to_hsv_color":
                        if (int.TryParse(inputValue, out var encoderValue))
                        {
                            return GetColorFromEncoderValue(encoderValue);
                        }
                        return inputValue;

                    case "encoder_to_brightness":
                        if (int.TryParse(inputValue, out var encoderValue2))
                        {
                            return GetBrightnessFromEncoderValue(encoderValue2).ToString();
                        }
                        return inputValue;

                    default:
                        if (transform.Contains(":"))
                        {
                            var parts = transform.Split(':');
                            var operation = parts[0].ToLower();
                            if (parts.Length == 2 && double.TryParse(parts[1], out var operand))
                            {
                                if (double.TryParse(inputValue, out var numValue))
                                {
                                    return operation switch
                                    {
                                        "multiply" => (numValue * operand).ToString(),
                                        "divide" => (numValue / operand).ToString(),
                                        "add" => (numValue + operand).ToString(),
                                        "subtract" => (numValue - operand).ToString(),
                                        _ => inputValue
                                    };
                                }
                            }
                        }
                        return inputValue;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EVENTS] Error applying transform '{transform}': {ex.Message}");
                return inputValue;
            }
        }

        private async Task UpdateRuleMetadataAsync(Model_EventRule rule)
        {
            try
            {
                _lastTriggerTime[rule.Id] = DateTime.UtcNow;

                using var scope = _scopeFactory.CreateScope();
                var ruleDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_EventRules>();

                await ruleDb.UpdateRuleMetadataAsync(rule.Id, DateTime.UtcNow, rule.TriggerCount + 1);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EVENTS] Error updating rule metadata: {ex.Message}");
            }
        }

        public async Task ReloadRulesAsync()
        {
            Console.WriteLine("[EVENTS] Reloading rules from database");
            await LoadAndIndexRulesAsync();
        }

        private string GetColorFromEncoderValue(int encoderValue)
        {
            try
            {
                var hue = Math.Abs(encoderValue) % 360;
                var (r, g, b) = HsvToRgb(hue, 1.0, 1.0);

                var hexR = ((int)(r * 255)).ToString("X2");
                var hexG = ((int)(g * 255)).ToString("X2");
                var hexB = ((int)(b * 255)).ToString("X2");

                return $"#{hexR}{hexG}{hexB}";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EVENTS] Error converting encoder value to color: {ex.Message}");
                return "#FF0000";
            }
        }

        private int GetBrightnessFromEncoderValue(int encoderValue)
        {
            try
            {
                var brightness = Math.Abs(encoderValue) % 256;
                return Math.Max(0, Math.Min(255, brightness));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EVENTS] Error converting encoder value to brightness: {ex.Message}");
                return 128;
            }
        }

        private (double r, double g, double b) HsvToRgb(double h, double s, double v)
        {
            var c = v * s;
            var x = c * (1 - Math.Abs(h / 60 % 2 - 1));
            var m = v - c;

            double r1, g1, b1;

            if (h >= 0 && h < 60)
                (r1, g1, b1) = (c, x, 0);
            else if (h >= 60 && h < 120)
                (r1, g1, b1) = (x, c, 0);
            else if (h >= 120 && h < 180)
                (r1, g1, b1) = (0, c, x);
            else if (h >= 180 && h < 240)
                (r1, g1, b1) = (0, x, c);
            else if (h >= 240 && h < 300)
                (r1, g1, b1) = (x, 0, c);
            else
                (r1, g1, b1) = (c, 0, x);

            return (r1 + m, g1 + m, b1 + m);
        }

        public void Dispose()
        {
            _rulesBySensorId.Clear();
            _lastTriggerTime.Clear();
            _sensorValueCache.Clear();
        }
    }
}